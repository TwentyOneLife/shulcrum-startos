# Design: Electrum protocol 1.8 in Shulcrum

- **Issues:** #16 (negotiate 1.8), #6 (enforce it where headers are served), #8 (`blake2b_fork` in
  `server.features`). Settles the choice of wallet for #17.
- **Status:** draft
- **Builds on:** `electrum-protocol-position.md`, whose D1 reasoning is corrected in the same change as
  this document.

## Problem

Shulcrum serves the Bitcoin Blake2b chain with a protocol that cannot tell a wallet what it is
looking at. It negotiates up to 1.7 with any client and serves 164-byte headers to all of them:
`blockchain.headers.subscribe`, `blockchain.block.header` and the tip notification check nothing. A
client that negotiated 1.4 receives a v2 header, reads the first 80 bytes as an ordinary header,
hashes them with SHA256d and cannot link the chain. Depending on the wallet, that shows up as a sync
problem, not an incompatibility.

It also cannot say which chain it serves. This chain shares its genesis block, its coin detection
and its `hash_function` with Bitcoin, so `server.features` from Shulcrum on this chain and from stock
Fulcrum on Bitcoin are indistinguishable.

Spec v0.3 (`docs/electrum-header-v2.md` in `paulscode/electrs-pruned`, still the current version)
addresses both, and D2 adopted it as our reference. Where the spec leaves a choice open, this
design takes what the only existing server implementation of it does, because D2's point is one
dialect and a wallet already checks that implementation's output.

## What changed since the position doc

Three things were learned after 2026-09-05 that this design rests on.

**Protocol 1.8 is not required for Sparrow to work, so D1 needed a different reason.** D1 said the
working BLAKE2b Sparrow fork speaks 1.8, so serving 1.7 would not work. Both maintained wallet forks
send `server.version` with the range `["1.3", "1.8"]`. Against today's Shulcrum, whose maximum is
1.7, they settle on 1.7 and receive headers in the list form. D1 still stands, for the reason the
spec gives: a client that negotiates 1.8 is saying it can read a 164-byte header, and refusing
anything below it is what stops an older client misreading one. The correction is recorded in the
position doc.

**There is a reference implementation of the server half.** electrs-pruned's protocol 1.8 patch
fills the spec's open points: when a chain counts as v2, the refusal and its wording, the
serve-time check, and the shape of the fork point. paulscode's Sparrow fork reads that fork point,
accepts its absence, and refuses a server whose value contradicts its own.

**Two defects in Shulcrum sit directly under this work.** The activation height is cached once and
never refreshed, so a server that crosses activation while running would never notice. And the
tip notification goes to every subscriber through one signal with no per-client check. Both are
fixed as part of this design, because without them the rule below does not hold.

## Approach

### 1. When a chain counts as v2

**A chain is v2 once it has produced a v2 header**, read from the index: the tip's version word has
bit 31 set. It does not depend on the network name or on any setting, so regtest, testnet4 and
mainnet all work without being told, and Shulcrum's BTC, BCH and Litecoin users see no change.
electrs-pruned keys on the same thing.

`Storage::blake2bActivationHeight()` already finds the boundary by binary search. The fix is to its
cache, which is written once and then trusted forever. Two events invalidate it:

- **A v2 header is appended while the cache says "no fork".** The next call searches again. This
  is the case the spec calls safety-critical: a server syncing from below activation, with wallets
  attached, crossing it.
- **A block at or below the cached activation height is undone.** A reorg back across activation is
  unlikely but costs one comparison to handle.

`chainHasV2()` becomes a thin wrapper over the cached value, so the check that runs on every header
request is a load, not a search.

### 2. Negotiation

| Chain | Offered range | Below it |
|---|---|---|
| No v2 header | 1.4 to 1.7, unchanged | refused as today |
| Has a v2 header | **exactly 1.8** | refused with a reason, connection closed |

The rule lives in one pure function taking whether the chain is v2 and returning the range. The
`server.version` handler uses it where it now uses the constants, and `server.features` reports the
same numbers in `protocol_min` and `protocol_max`.

The refusal uses Shulcrum's existing `RPCErrorWithDisconnect` and says why, in the words
electrs-pruned uses: that this chain uses 164-byte block headers with a BLAKE2b block hash, which a
client below 1.8 cannot read, and that the server refuses rather than serve headers the client
would misinterpret. A bare "unsupported protocol version" sends whoever reads the wallet log after
the wrong fault.

### 3. Where headers are served

On a v2 chain, **a client may be served headers only if it negotiated 1.8.** A client that never
sent `server.version` counts as below it: Shulcrum defaults such a client to 1.4, and protocol 1.6
requires `server.version` first anyway. The rule applies whatever height is requested, including
headers from below activation, as electrs-pruned does. That is simpler, and a client that cannot
read the chain's tip has nothing to gain from its early headers.

| Method | Serves | Gated |
|---|---|---|
| `blockchain.block.header` | one header, optionally with a `cp_height` proof | yes |
| `blockchain.block.headers` | up to 2016 headers | yes |
| `blockchain.headers.subscribe` | the tip, then notifications | yes |
| `blockchain.headers.get_tip` | the tip | yes |
| `blockchain.header.get` | one header by height or hash | yes |
| `blockchain.transaction.get_confirmed_blockhash` | a header, when `include_header` is set | yes, only then |

The last three are Fulcrum extensions the spec does not mention, because electrs has no equivalent.
They serve headers the same way and a client below 1.8 would misread them in the same way.

A refused request answers with the same reason and closes the connection. Shulcrum rejects a second
`server.version` on a connection, so a client left connected could not renegotiate anyway. It has
to reconnect, and then it meets the refusal at `server.version`, which explains itself.

### 4. The tip notification

Today one `Server::newHeader` signal reaches every subscribed client's lambda, which sends the
header unconditionally. The lambda gains the same check. When the chain is v2 and the client did
not negotiate 1.8, it disconnects the client and sends nothing.

This is the case the refusal at `server.version` cannot cover: a client that negotiated below 1.8
before the chain reached activation, still subscribed when it crosses. That happens on every fresh
sync of a chain that has already forked.

### 5. `blake2b_fork` in `server.features`

On a v2 chain, `server.features` gains, exactly as electrs-pruned emits it:

```json
"blake2b_fork": {
  "height": 961640,
  "hash": "0000000000000050c1e5f69672f459293be14f46e5a494e7a8c8541396f18eeb",
  "header_bytes": 164,
  "block_hash": "blake2b"
}
```

- `height` is `blake2bActivationHeight()`, found from the index and not configured.
- `hash` is that block's id in display order, produced the way `genesis_hash` already is, so the two
  fields cannot disagree about byte order. The value above is the mainnet block at 961640 as the
  node reports it.
- On a chain with no v2 header the field is absent, which is the honest answer and the one the
  wallet already accepts.

`makeFeaturesDictForConnection` is static and has no storage, so the fork point is computed by the
caller and passed in, as `genesis_hash` is. Both callers change: the RPC and the peer path.

`hash_function` stays `"sha256"`. It describes the scripthash, not the block hash, and the spec
advises against reusing it.

### 6. What stays as it is

- **`blockchain.pow_algorithms`** is kept and stays callable at any version. It answers which
  algorithm applies from which height, which the version number does not.
- **`max` stays 2016** headers per `block.headers` call. A v2 response is about twice the size.
  That is spec open question 3, and nothing observed so far argues for changing it.
- **`cp_height`** is already built from block ids (`85da430`). Validating it across the boundary is
  #7, not this design.

### 7. Shape of the change

The rules go in one small unit, three pure functions beside the existing v2 header helpers:

- the negotiable range for a chain,
- whether a client at a given version may be served headers,
- the fork-point map.

Each call site becomes a one-line use of them. This mirrors electrs-pruned's `headerv2.rs`. It
keeps the fork's diff auditable, and makes the behaviour replaceable in one place if the spec
changes.

## Which wallets we test against (#17)

There are two lineages, not three:

- **Shrike, `privkeyio/shrike`**, is the maintained continuation of the `AcesHigh70/sparrow` branch
  that Shulcrum's own documentation names. It contains all 48 of that branch's commits and 154 more.
  The AcesHigh70 branch is marked unmaintained, its binaries were withdrawn, it requests only 1.4.2
  and it computes the block id wrongly.
- **paulscode's Sparrow fork**, the client the spec describes, shares no history with Shrike.

| | Shrike (primary) | paulscode's fork (secondary) |
|---|---|---|
| Requests | 1.3 to 1.8 | 1.3 to 1.8 |
| Reads `blake2b_fork` | no | yes; absent accepted, contradicting refused |
| Checks the activation header | by height rule, 961640 | fetches 961640 and checks its hash |
| Releases | signed, rebuild documented as reproducible | signed; key not cross-checked here |

**Shrike is primary**: it is the wallet users are pointed at and the one with a documented
reproducible build. **paulscode's fork is secondary but necessary**, because it is the only client
that reads `blake2b_fork`. #8's acceptance, a wallet telling this server apart from one on the
parent chain using only `server.features`, can only be shown with it.

Not yet known: whether Shrike's header-chain check runs against a private server or only public
ones. The live #17 test settles that.

`doc/blake2b-headers.md` in Shulcrum still names the AcesHigh70 branch. It is pointed at Shrike in
the implementation change.

## Alternatives considered

- **Stay at 1.7 and add only the fork point.** Both wallets work at 1.7 today. But nothing would
  stop a 1.4 client being handed a v2 header, which is the one failure this work exists to prevent.
- **Serve below-activation headers to old clients, refuse only v2 ones.** More permissive, and it
  matches Shulcrum's current per-request error in `block.headers`. Rejected because the client still
  cannot follow the tip, and it would make Shulcrum and electrs-pruned behave differently for the
  same client.
- **Our own field name or shape for chain identity.** A third dialect, the thing D2 rejected. A
  wallet already checks electrs-pruned's shape.
- **Key "is v2" on the network name or a setting.** Wrong on regtest and on any future chain, and it
  would put a knob where the chain already carries the answer.

## Risks

- **A wrong `blake2b_fork` is worse than none.** A wallet that checks it refuses a server whose
  value contradicts its own. So the mainnet value is a golden-vector test, not a hope.
- **Peers.** Raising the maximum to 1.8 on a v2 chain also changes what the peer code offers and
  accepts. Stock Fulcrum on Bitcoin and Shulcrum on this chain share `genesis_hash`, coin and
  `hash_function`, so today each would accept the other as a peer. `blake2b_fork` gives the peer code
  what it needs to refuse that, but wiring it in is a separate change. The package runs with peering
  off, so it does not affect us, but upstream will care.
- **Clients below 1.8 lose access on this chain.** Deliberate, and it is what the spec asks for.
  Upstream Sparrow and Electrum are among them, and today they misread the chain silently.
- **Testnet4 activation heights disagree.** The spec and Shulcrum's `headerv2` test vectors say
  149537, and both wallets compile in 150308. New tests use regtest and mainnet only until that is
  explained.

## Test plan

- **Unit, in Shulcrum's own suite** (built with `ENABLE_TESTS`, run with `--test`):
  - the negotiable range for a v2 and a non-v2 chain;
  - the serve rule for every combination of chain state and negotiated version, including a client
    that never negotiated;
  - the fork-point map's shape.

  None of this surface has a test today.
- **Mainnet golden vector.** Height 961640 and hash
  `0000000000000050c1e5f69672f459293be14f46e5a494e7a8c8541396f18eeb`, checked against the node and
  against the value paulscode's fork compiles in.
- **Crossing activation live, on regtest, before the mainnet index is ready.** The Knots build
  accepts `-testactivationheight=blake2b@<height>`. With activation at 20:
  1. A client negotiates 1.4 at height 15 and subscribes.
  2. Blocks are mined past 20, and the client should be disconnected, not sent the tip.
  3. Reconnecting at 1.4 should be refused with the reason.
  4. Reconnecting at 1.8 should receive 328 hex characters for a v2 header.
  5. `server.features` should report `blake2b_fork` at height 20, and nothing before it.

  This is the test electrs-pruned ran. It needs only a regtest node and a small index.
- **Unchanged elsewhere.** A regtest chain that never activates negotiates 1.4 to 1.7 exactly as
  today and reports no `blake2b_fork`.
- **Mainnet, once the index spans activation.** Both wallets connect and sync across 961640 (#17),
  and paulscode's fork accepts our `blake2b_fork`.

## Out of scope

- `blockchain.transaction.get_confirmed_blockhash` returns a SHA256d `block_hash` for v2 blocks. It
  is a plain bug, not protocol design, and is fixed on its own.
- `cp_height` validation across the boundary: #7.
- Teaching the peer code to use `blake2b_fork`.
- A browser-accessible Shrike package for StartOS. That is a separate project with its own design.

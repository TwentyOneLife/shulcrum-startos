<p align="center">
  <img src="icon.png" alt="Shulcrum" width="21%">
</p>

# Shulcrum on StartOS

> Anything not described here behaves as upstream Fulcrum does. Where this document is silent, the
> upstream documentation applies.

[Shulcrum](https://github.com/TwentyOneLife/Shulcrum) is an Electrum server for the **Bitcoin
Blake2b** chain, forked from [Fulcrum](https://github.com/cculianu/Fulcrum). It builds an address
index over your own node so wallets can ask you for their history instead of asking a stranger.

Ordinary Fulcrum cannot follow this chain. It assumes every block header is 80 bytes, and after the
BLAKE2b fork they are 164, so it rejects every block. Shulcrum reads each header at the length its
own version word claims and identifies blocks by their proof-of-work hash.

- **Upstream server:** <https://github.com/TwentyOneLife/Shulcrum> (fork of Kilombino/Shulcrum)
- **Wrapper repo:** <https://github.com/TwentyOneLife/shulcrum-startos>
- **Licence:** GPL-3.0-only
- **Roadmap:** [`PLAN.md`](PLAN.md)

---

## Install

There is no registry for this package yet. Build the `.s9pk` and sideload it:

```sh
npm ci
make x86        # or: make arm
```

`docs/ci.md` covers the build environment, including the parts that fail in ways that do not name
themselves.

## Package identity

| | |
|---|---|
| Package id | `fulcrum` |
| Version | `#blake:2.1.2:0` |
| Title | Shulcrum |

The id is `fulcrum`, not `shulcrum`, because Mempool Guide and other dependents resolve an Electrum
backend by that id and would not find us under any other. The **flavor** in the version is what
stops that being a squat: it tells a registry that this and an ordinary Fulcrum are different builds
of the same thing, and it is `blake` rather than `blake2b` because the ExVer grammar accepts only
`[a-z]` in a flavor. A digit there makes the whole manifest unparseable.

## Image and container runtime

One image, `shulcrum`, built from the `Dockerfile` in this repo for `x86_64` and `aarch64`.

Shulcrum is compiled from source in the image rather than downloaded, so nothing enters the install
path that would need verifying by hash and signature at install time, and the whole chain from
source revision to running server stays auditable. The builder stage uses the distribution's Qt5 and
RocksDB; the final stage carries the runtime libraries only.

The service runs as `shulcrum /mnt/shulcrum/fulcrum.conf`.

## Volume and data layout

One volume, `main`, mounted at `/mnt/shulcrum`.

| Path | Holds |
|---|---|
| `/mnt/shulcrum/fulcrum.conf` | The generated config |
| `/mnt/shulcrum/db` | Fulcrum's datadir |
| `/mnt/shulcrum/db/fulc2_db` | The RocksDB store itself |

The distinction between the last two matters more than it looks. Fulcrum creates its datadir while
parsing options, before it opens the store and before it has contacted any node, so the datadir
existing does not mean an index exists. `fulc2_db` appearing does.

The node's volume is mounted **read-only** at `/mnt/bitcoin`, which is where its `.cookie` is read
from. This package never writes to the node.

## File models

`fulcrum.conf`, flat `key = value` lines, written by the SDK's ini helper. Not toml: toml quotes
strings and Fulcrum reads the quotes as part of the value.

Values this package fixes rather than exposes:

| Key | Value | Why |
|---|---|---|
| `extended_headers` | `true` | The whole point. **Irreversible for a given index**, see below |
| `peering`, `announce` | `false` | Fulcrum's defaults announce to, and pull peers from, Bitcoin's Electrum network, where this server answers for an incompatible chain |
| `rpccookie` | `/mnt/bitcoin/.cookie` | Cookie auth only, so this package never stores an RPC credential |
| `tcp` | `0.0.0.0:50001` | Container-internal. This binding is what StartOS exports |
| `admin` | `127.0.0.1:8000` | An unauthenticated control socket. Loopback only |

`db_mem` is user-tunable, in MiB.

## Dependencies

One, on the **`bitcoind`** package, required.

That id is deliberate and was corrected once. A BLAKE2b node sideloaded over the official package
takes the `bitcoind` id, so a package depending on anything else does not resolve against a real
deployment. Health checks are that package's own ids, `bitcoind` and `sync-progress`; requiring an id
a package does not declare is indistinguishable to StartOS from requiring a failing one.

**A dependency id is not evidence of a chain**, and neither is a health check. The two chains share
every block up to 961639, so a node's sync check passes on both. What distinguishes them is checked
at runtime instead, below.

## Network access and interfaces

One interface, `main`, exported as **Electrum**:

| | Port |
|---|---|
| TLS, off the box | 50002 |
| Plaintext, over the LXC bridge | 50001 |

The plaintext port is reachable from other packages on the same server and from nowhere else, which
is the address a dependent such as Mempool Guide resolves. Off the box, the TLS port is all there is.

## First-run flow

1. The config is seeded and the node's RPC address written into it.
2. **The chain guard** runs, once, before an index exists. It asks the node for its tip header and
   measures it: 164 bytes is this chain, 80 is not. It refuses to start on the wrong chain, and also
   when the node cannot be reached, because `extended_headers` fixes the on-disk header record size
   permanently and an index built against the wrong chain is not a misconfiguration to correct
   afterwards, it is a full re-index.
3. **The node requirements guard** runs on every start. It refuses when the node reports no
   transaction index, or reports itself pruned. Neither is enforced anywhere else: the node package
   defaults `txindex` off and offers pruning as an ordinary setting, and Fulcrum itself only logs a
   banner and carries on, which produces a server that looks healthy and answers nothing. Unlike the
   chain guard, this one falls through when the node cannot be asked, because nothing here is
   irreversible.
4. The daemon starts and begins indexing. **This takes many hours**, see `instructions.md`.

## Health checks

| Id | Reports |
|---|---|
| `primary` | The Electrum port is listening |
| `sync-progress` | How far the index has got, as a percentage and a height |

Two checks because the port opens long before the index is usable, so "listening" and "caught up"
are different questions. `sync-progress` reads the indexed height from Shulcrum's admin socket, which
answers throughout a build, and the target height from the node. When the node is briefly
unreachable the check reports against the last height it was told and says so, rather than going
unready because of somebody else's restart.

## Actions

None, deliberately. There is no node picklist, and the config surface is fixed rather than tunable.
Actions get added when a user genuinely has a decision to make.

## Backups

The `main` volume is backed up **excluding `/db`**. The index is derived data, rebuildable from the
node, and large enough that including it would dominate every backup the server takes. A restore
therefore rebuilds the index, which takes as long as the first one did.

## Limitations and differences

- **`extended_headers` is irreversible for a given index.** The store refuses to reopen under a
  different header record size. Repointing a built index at an 80-byte chain is not possible, and is
  the reason the chain guard exists.
- **This package serves one chain.** It refuses to start against an ordinary Bitcoin node.
- **The node must be archival and carry a transaction index.** Enforced at startup, see above.
- **The first index takes many hours** and the rate falls as blocks get larger. That is not a fault.
- **Not yet installed on a StartOS node.** The package builds, signs and typechecks in CI, and the
  guards have been exercised against a live Bitcoin Blake2b node from a workstation, but the
  install-time behaviour has not been observed on real hardware.

## Supporting this work

Donations to TwentyOne.Life, in **BitcoinB2B**:

```
1BH665bXvEqSuoWQUihiQiPpt2BqpzrgGD
```

<img src="assets/donation-qr.png" alt="BitcoinB2B donation address for TwentyOne.Life" width="200">

Bitcoin Blake2b shares Bitcoin's address format and its genesis block, so this address is equally
valid on Bitcoin and nothing about it says which chain it belongs to. Send from a Bitcoin Blake2b
wallet: Bitcoin sent here is a different asset.

## Quick reference

| | |
|---|---|
| Package id | `fulcrum` |
| Image | `shulcrum` |
| Volume | `main` at `/mnt/shulcrum` |
| Datadir | `/mnt/shulcrum/db`, store at `db/fulc2_db` |
| Config | `/mnt/shulcrum/fulcrum.conf` (ini) |
| Node mount | `/mnt/bitcoin`, read-only |
| Cookie | `/mnt/bitcoin/.cookie` |
| Electrum | 50002 TLS, 50001 plaintext on the bridge |
| Admin socket | `127.0.0.1:8000`, loopback only |
| Dependency | `bitcoind`, required, checks `bitcoind` and `sync-progress` |
| Health checks | `primary`, `sync-progress` |
| Actions | none |
| Backup | `main` excluding `/db` |

# Design: the shulcrum-startos .s9pk

- **Issues:** #9 (skeleton), #10 (node dependency), #11 (interfaces and health), #12 (config model)
- **Status:** draft

## Problem

Package Shulcrum, a BLAKE2b-capable Electrum server, as a StartOS `.s9pk` that runs beside a Bitcoin
Blake2b node and can back a self-hosted mempool explorer.

`electrs-pruned-startos` is the closest production package: same chain, same StartOS SDK, same shape
of problem. It is the model to copy from. But it is a model, not a base, and the two servers differ
in ways that invert some of its central decisions. Copying it wholesale would produce a package that
is wrong in exactly the places that matter.

## What the upstream server actually requires

From Fulcrum's own README, and unchanged by the BLAKE2b fork:

- **`txindex=1` is required.** `Controller.cpp` verifies it at startup by fetching a transaction and
  refuses to proceed if that fails.
- **The node must not be pruned.**
- **RPC only.** Fulcrum fetches blocks with `getblock` over JSON-RPC. It opens no P2P connection.
- **ZMQ `hashblock` is optional** and improves tip latency only.

Two of those are the exact opposite of `electrs-pruned-startos`, whose entire reason for existing is
to permit a pruned node, and whose `AGENTS.md` says in as many words that `txindex` "is not required
and must not be requested". So this package **does** raise the autoconfig tasks that one forbids.
That inversion is the single most important thing to carry forward from this document: a future
reader who diffs the two packages will find the requirement logic reversed, and it is deliberate.

The absence of P2P also removes a large piece of the template. There is no `peer-local` host to
resolve, no whitelisting concern, and no restart loop from a dropped peer connection. Only the RPC
bridge address is needed.

## Approach

### One backend, not a picklist

`electrs-pruned-startos` offers three bitcoind flavors with a runtime selector, a `store.json` field
recording the choice, a Select Node action, and index-invalidation logic for when the choice changes.

This package requires exactly one: `knots-blake2b`. Shulcrum here is built for the BLAKE2b chain and
`extended_headers` is irreversible per index database, so a package that could be repointed at a
SHA256d chain would be a package that can corrupt its own index on a setting change. Declining the
generality is what makes #12 safe rather than merely documented.

Dropped along with it: `backends.ts`, the `backend` and `indexedBackend` fields in `store.json`, the
Select Node action, and the index-wipe-on-backend-change path. That is most of the template's
complexity, and none of it is load bearing here.

A BLAKE2b build sideloaded over the official `bitcoind` id (as one third-party node release does) is
deliberately **not** supported in the skeleton. It is a real configuration, but supporting it means
reintroducing the picklist, and it should be a later change justified by demand rather than a
speculative one now.

> **Correction, 2026-09-05.** That paragraph was wrong about which configuration is speculative. Our
> actual target node runs the sideloaded arrangement: its BLAKE2b node is installed under the
> `bitcoind` id at `#knots:29.4.1:6`, and `knots-blake2b` is not installed at all. Verified over SSH:
> chain `main`, height 967899, unpruned, `txindex` synced, and a 164-byte header at the tip. So the
> dependency this package declares is one the target does not have, and the configuration ruled out
> as speculative is the only one we can actually test against. See the revision below.

### Revision: depend on `bitcoind`, and guard the chain at runtime

The original reasoning ran: `extended_headers` is irreversible, so refusing a node picklist stops the
package being repointed at an 80-byte chain and invalidating its own index.

**That reasoning was half wrong, and finding the real node is what exposed it.** A dependency id was
never evidence of a chain. This document already says so a few lines further down, about health
checks: the two chains share every block up to 961639, so being synced does not establish which
chain a node is on. `knots-blake2b` could itself be on the wrong chain; the id would not say.

So the id was doing protection work it was never capable of, while excluding the one node we have.

The fix separates the two concerns properly:

- **Depend on `bitcoind`**, which is what the target actually runs, and what a Retropex-style
  sideload always produces.
- **Guard the chain where it can actually be checked**, at startup, before the irreversible database
  is created: ask the node for a header and refuse to index if the chain has produced no v2 header.
  That is a real check against a real fact, and it protects the `knots-blake2b` case too.

This is strictly stronger than the original design. It is also more code, and the guard has to run
before first index rather than as a health check afterwards, because afterwards is too late.

### Config model

`fulcrum.conf`, written through a `FileHelper`, following the template's split between static values
and values `main.ts` resolves at start:

- `extended_headers = true`, fixed, never exposed as a toggle (#12). Irreversible per index database:
  the header store refuses to reopen under a different record size. A user-facing switch here would
  be a switch that silently requires a full re-index, so there is no switch.
- `bitcoind` and `rpccookie` resolved at start from the node dependency.
- `peering = false` and `announce = false`, fixed. Fulcrum's defaults announce the server to, and
  pull peers from, Bitcoin's Electrum server network, where this server offers an incompatible
  chain. This is a correctness setting, not a privacy preference.
- `tcp` and `ssl` bound inside the container on 50001 and 50002.

Cookie authentication rather than a user and password, via Fulcrum's `rpccookie` option, so no RPC
credential is generated, stored or backed up by this package.

The cookie path is taken as the node's datadir root, which is where bitcoind keeps it on mainnet.

> **This became a defect when the dependency changed, 2026-09-05.** The simplification was sound
> against `knots-blake2b`, which dropped its chain selector in 1.0.0:30 and is mainnet only. It is
> not sound against `bitcoind`, which offers testnet, signet and regtest, and nests a non-mainnet
> chain's data, cookie included, in a subdirectory named for that chain. A hardcoded root path
> simply fails to authenticate there.
>
> Worse, it fails confusingly. The chain guard needs the cookie to reach the node, so a wrong cookie
> path surfaces as "cannot reach the node" rather than "wrong chain directory".
>
> The fix is the one the template already uses and this design dropped: read the node's own
> `bitcoin.conf` through the mount, look for a `<chain>=1` line, and derive the path from its
> absence or presence. Tracked as #24.
>
> Worth noting how this was missed. The dependency change was reviewed as a change to three files;
> the assumption it invalidated lived in a fourth, three sections away in this document, and read
> perfectly true on its own terms.

### Interfaces and health (#11)

One multi-host binding as in the template: plaintext 50001 for dependents reaching the service over
the bridge, TLS 50002 as the only thing reachable off the box.

Health checks:

- `checkPortListening` on the Electrum port.
- A sync-progress check. Fulcrum exposes an admin RPC (`admin = <port>`, loopback only) whose
  `getinfo` reports the indexed height, which is a first-class interface rather than the metrics
  scrape the template has to fall back on. Progress compares that height against the node's own.
- The node dependency is gated on its `node` and `chain` health checks. Not on `sync-progress`,
  which `knots-blake2b` gained in 1.0.0:31: `chain` already fails below the activation height, and a
  second check that stays amber through the whole of initial sync would say nothing new.

`chain` matters more here than it looks. The two chains share every block up to 961639, so a node
with no peers on the fork sits just below activation looking perfectly synced. "Synced" does not
establish which chain a node is on.

### Image

Built from source in the package Dockerfile against our fork at a pinned tag, using distro Qt5 and
system RocksDB on Ubuntu 24.04. That combination is already proven: it builds unmodified and needs
no pinned RocksDB fallback. No third-party binary is downloaded, so there is no artifact to verify
beyond the base image and the pinned source revision.

### Volume mountpoints

The service volume mounts under `/mnt/shulcrum` rather than the template's shorter top-level
directory, and the node's read-only volume at `/mnt/bitcoin`. The rename is not cosmetic: this
repository's `no-internal-refs` CI job rejects tracked files containing host paths, to stop our own
infrastructure paths leaking into a public repo, and the template's mountpoint is spelled exactly
like the prefix that job screens for. A container mountpoint is not infrastructure leakage, but it
is indistinguishable from it to a regular expression, and loosening a leak check to accommodate a
mountpoint is the wrong trade. Renaming the mountpoint costs nothing.

## Alternatives considered

**Fork `electrs-pruned-startos` directly.** Rejected. The two packages agree on the SDK and the
chain and disagree on pruning, `txindex`, P2P, and the backend picklist. What is left after removing
the disagreements is the SDK skeleton, which is better copied deliberately than inherited and then
argued with.

**Ship a prebuilt binary.** Rejected under the sovereign-code guardrail. Building from a pinned
source revision in the image keeps the whole chain auditable and leaves nothing to verify by hash
and signature at install time.

**Expose `extended_headers` as a config option.** Rejected, and this is #12's whole content. It sets
the on-disk record size, so flipping it on a populated database is not a setting change, it is a
silent demand for a full re-index.

## Risks

- **The index is large and slow to build**, and on this chain it must be built against an archival
  node. A user who prunes later breaks the service, and the prune task must therefore be a standing
  requirement rather than a one-time check.
- **`extended_headers` is irreversible.** Mitigated by never exposing it and by refusing to support
  a non-BLAKE2b backend.
- **The cookie path is wrong on any non-mainnet chain**, now that the dependency is `bitcoind` and
  not a mainnet-only package. Surfaces as an authentication failure, and through the chain guard as
  a misleading "cannot reach the node". See #24; the fix is to derive it from the node's config.
- **The version range is inherited rather than reasoned.** It is mirrored from
  `electrs-pruned-startos`, which is verified against this family of nodes but gates on a
  `peer-local` host we do not need. A flavored version such as `#knots:29.4.1:6` does not satisfy an
  unflavored range directly, so this needs confirming at install rather than at design time.
- **We have not yet verified the server on mainnet.** Packaging ahead of phase 3 is deliberate, to
  use the indexing wait, but the package must not be released before the verification issues close.

## Test plan

- `make` produces a `.s9pk`, and CI runs it as a required job (#9's acceptance).
- Install on a StartOS node beside the BLAKE2b node package; confirm the dependency resolves, the
  cookie is read, and indexing starts (#10).
- Confirm both Electrum ports are reachable and health reports correctly through a full index build,
  including the long stretch where the server answers no Electrum RPC (#11).
- Confirm the index stores 164-byte header records, and that the package offers no path to change
  that (#12).
- Point a mempool explorer at the finished service (phase 6, #14).

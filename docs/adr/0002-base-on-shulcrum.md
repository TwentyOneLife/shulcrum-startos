# ADR-0002: Base the server on Shulcrum rather than forking Fulcrum or adapting electrs
- **Status:** accepted
- **Date:** 2026-09-05

## Context
The Bitcoin Blake2b chain needs an Electrum server. Its headers are 164 bytes after the fork and 80
before it, and blocks are identified by a BLAKE2b proof-of-work hash, so no unmodified Electrum
server can follow it: they all assume an 80 byte header and reject every block after the fork.

Three ways to get one. Adapt **electrs**, which is Rust and would mean reimplementing the header
handling from scratch against a codebase that has never seen a variable length header. Fork
**Fulcrum** ourselves and write the BLAKE2b support. Or base on **Shulcrum**, an existing Fulcrum
fork that has already done it.

Measured rather than estimated, `v2.1.2` to `v2.1.2-blake2b.1`:

| | Files | Insertions | Deletions |
|---|---|---|---|
| Whole diff | 26 | 1115 | 37 |
| Vendored BLAKE2b reference implementation | 2 | 358 | 0 |
| Everything else under `src/` | 17 | 585 | 33 |

The shape of that diff is what makes it reviewable. Header length and proof-of-work hashing are
routed through one new choke point, `src/BTC_HeaderV2.{h,cpp}`, which every header site calls, so the
change is auditable at a single place rather than smeared across the codebase. There are **no
hardcoded genesis, network magic, or checkpoint changes**, so the fork is not carrying a second
chain's constants. The vendored BLAKE2b is the reference implementation under a GPL compatible
licence, and no new external dependency is introduced.

Licensing is inherited and unchanged: GPLv3, from Fulcrum.

Upstream velocity, checked 2026-09-05: the repository was created 2026-08-24 and all twelve of its
commits landed that same day. Nothing since. Three stars, one fork, which is ours, no issues and no
pull requests ever, and it is not archived. So there is no upstream cadence to keep pace with, and
the cost of carrying our own branch is close to zero.

## Decision
Base on Shulcrum. Carry our work on our own fork, shaped so it could be offered upstream (one issue,
one branch, rebased on `blake2b-headers`), and treat opening a pull request as a separate and cheap
decision taken at the end rather than a constraint on how the work is done.

## Consequences
We inherit roughly 600 lines of consensus-adjacent logic that no third party has reviewed, and we own
the consequences of it being wrong. That is the reason this project has a mainnet verification phase
at all: upstream is verified on testnet only, and "it compiles and syncs testnet" is not evidence
about the chain people keep money on.

We also inherit the maintenance. With upstream showing no activity, security fixes from Fulcrum
proper will not arrive through Shulcrum, and rebasing them onto our branch becomes our job. The
narrow diff and the single choke point are what keep that tractable.

Being GPLv3, anything we ship stays GPLv3, and modifications we distribute have to be available.
That is a fit rather than a cost here, but it does rule out any later closed component.

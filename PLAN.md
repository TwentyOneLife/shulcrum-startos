# Roadmap - shulcrum-startos

Package a BLAKE2b-capable Fulcrum (an Electrum server) as a StartOS `.s9pk`, providing an Electrum
backend for the Bitcoin Blake2b (BitcoinB2B) chain and enabling a self-hosted mempool explorer.

**Base:** [`TwentyOneLife/Shulcrum`](https://github.com/TwentyOneLife/Shulcrum) - a fork of
[Kilombino/Shulcrum](https://github.com/Kilombino/Shulcrum) (Fulcrum 2.1.2 modified for BLAKE2b:
164-byte v2 headers, BLAKE2b PoW; transaction hashing stays SHA256d).

## Phases
1. **Audit** - review the BLAKE2b diff for consensus-correctness; confirm what to adopt vs re-implement.
2. **Build** - reproduce the server binary from source (containerized; qmake + RocksDB).
3. **Mainnet verification** - run the build against a live Bitcoin Blake2b node, index the chain, and
   validate headers and address history against the node. (Upstream is testnet-verified only - this is
   the key maturity step.)
4. **Protocol hardening** - validate the surfaces upstream flags as unfinished on mixed-length chains
   (`blockchain.headers.subscribe`, the `cp_height` header-merkle root); add a `server.features`
   chain-identity field so Bitcoin Blake2b wallets can recognise the fork. Contribute these upstream.
5. **Packaging** - author the `.s9pk` (StartOS 0.4.x, `start-sdk`), modelled on `electrs-pruned-startos`;
   depend on a Bitcoin Blake2b (Knots) node package. Config note: `extended_headers = true` (irreversible
   per index DB - set once at first index).
6. **Integration** - install the package and point a self-hosted mempool explorer at it.

## Status (2026-09-23)

**Phase 5 is done and the package runs.** It has been installed on a StartOS node since 2026-09-05,
now at `#blake:2.1.2:4`. Proven there: the node dependency resolves and connects, the chain guard
and the node requirements guard both pass against a live Bitcoin Blake2b node, headers are stored
at 164 bytes, and a store refuses to reopen under a different header size. Both health checks
behave correctly during a build.

**Phase 4 has started in the server rather than the package.** Protocol 1.8 is implemented in the
Shulcrum fork: the negotiated version follows the chain, headers are refused to clients that cannot
read them, and `server.features` carries the fork point. A regtest chain crossing its activation
height exercises all of it, and a block hash that was wrong for post-fork blocks is fixed.

**Phase 3 is the critical path and still running.** The verification index is past two thirds of the
chain by blocks. The remaining protocol and integration work needs an index that spans the
activation height, which is also what Phase 6 waits on.

The build environment traps that took four red runs to clear are in `docs/ci.md`. Read it before
touching `.github/workflows/ci.yml`.

## Risks / open items
- Mainnet correctness is unverified upstream (testnet only) - Phase 3 is the crux.
- Two Electrum surfaces flagged unfinished on mixed-length chains - Phase 4.
- No `server.features` fork-identity field yet - wallets may not recognise the chain until added.
- `extended_headers` is irreversible per index DB.
- Heavier container build (Qt + RocksDB from source) than a Rust indexer. Roughly 4 minutes on a
  hosted runner, and it must not share a host with a running index: together they exhaust memory.
- The node package enforces neither `txindex` nor an unpruned chain, and its `index-sync` health
  check does not stand in for either, so the package checks the node itself at startup.

License: GPLv3. Contributions: see `CONTRIBUTING.md`.

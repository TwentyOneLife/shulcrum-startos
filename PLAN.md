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

## Status (2026-09-05)

Phase 5 has its first green build. The `.s9pk` is produced end to end in CI: `start-cli` verified by
checksum and both signatures, Shulcrum compiled from source in the package's own Dockerfile, the
image converted to squashfs, and the result signed with our own build key. Open as PR #1.

What that does and does not establish. It shows the package builds, signs, and typechecks. It does
not show the package runs: it has not been installed on a StartOS node, and the health checks and
the chain guard have been exercised only against a live node from a workstation, not in place.

The build environment traps that took four red runs to clear are in `docs/ci.md`. Read it before
touching `.github/workflows/ci.yml`.

Phase 3 runs in parallel and is unaffected by any of this: the verification index is building
against a live Bitcoin Blake2b node and is the gate on Phase 4.

## Risks / open items
- Mainnet correctness is unverified upstream (testnet only) - Phase 3 is the crux.
- Two Electrum surfaces flagged unfinished on mixed-length chains - Phase 4.
- No `server.features` fork-identity field yet - wallets may not recognise the chain until added.
- `extended_headers` is irreversible per index DB.
- Heavier container build (Qt + RocksDB from source) than a Rust indexer. Roughly 4 minutes on a
  hosted runner, and it must not share a host with a running index: together they exhaust memory.
- The node package enforces neither `txindex` nor an unpruned chain, and its `index-sync` health
  check does not stand in for either. Tracked internally; a runtime probe is the route.

License: GPLv3. Contributions: see `CONTRIBUTING.md`.

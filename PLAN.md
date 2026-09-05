# Roadmap — shulcrum-startos

Package a BLAKE2b-capable Fulcrum (an Electrum server) as a StartOS `.s9pk`, providing an Electrum
backend for the Bitcoin Blake2b (BitcoinB2B) chain and enabling a self-hosted mempool explorer.

**Base:** [`TwentyOneLife/Shulcrum`](https://github.com/TwentyOneLife/Shulcrum) — a fork of
[Kilombino/Shulcrum](https://github.com/Kilombino/Shulcrum) (Fulcrum 2.1.2 modified for BLAKE2b:
164-byte v2 headers, BLAKE2b PoW; transaction hashing stays SHA256d).

## Phases
1. **Audit** — review the BLAKE2b diff for consensus-correctness; confirm what to adopt vs re-implement.
2. **Build** — reproduce the server binary from source (containerized; qmake + RocksDB).
3. **Mainnet verification** — run the build against a live Bitcoin Blake2b node, index the chain, and
   validate headers and address history against the node. (Upstream is testnet-verified only — this is
   the key maturity step.)
4. **Protocol hardening** — validate the surfaces upstream flags as unfinished on mixed-length chains
   (`blockchain.headers.subscribe`, the `cp_height` header-merkle root); add a `server.features`
   chain-identity field so Bitcoin Blake2b wallets can recognise the fork. Contribute these upstream.
5. **Packaging** — author the `.s9pk` (StartOS 0.4.x, `start-sdk`), modelled on `electrs-pruned-startos`;
   depend on a Bitcoin Blake2b (Knots) node package. Config note: `extended_headers = true` (irreversible
   per index DB — set once at first index).
6. **Integration** — install the package and point a self-hosted mempool explorer at it.

## Risks / open items
- Mainnet correctness is unverified upstream (testnet only) — Phase 3 is the crux.
- Two Electrum surfaces flagged unfinished on mixed-length chains — Phase 4.
- No `server.features` fork-identity field yet — wallets may not recognise the chain until added.
- `extended_headers` is irreversible per index DB.
- Heavier container build (Qt + RocksDB from source) than a Rust indexer.

License: GPLv3. Contributions: see `CONTRIBUTING.md`.

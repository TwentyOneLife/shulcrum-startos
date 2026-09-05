# Understanding: Shulcrum's BLAKE2b changes

Our reading of how [Shulcrum](https://github.com/Kilombino/Shulcrum) (a fork of
[Fulcrum](https://github.com/cculianu/Fulcrum) 2.1.2) adapts an Electrum server for the Bitcoin Blake2b (BitcoinB2B) chain.
Written to inform packaging and any upstream contributions. Not consensus-authoritative - verify against
the code and a real node before relying on any claim here.

## The core idea
- A **v2 block header is 164 bytes** (vs 80). It is **self-identifying**: bit 31 of the version word
  (`0x80000000`) is set on v2 and never on any pre-fork block, so reading 4 bytes tells you the length.
- **Proof-of-work for v2 headers is a BLAKE2b pipeline** instead of SHA256d. v1 headers keep SHA256d.
- **Transaction hashing is unchanged (SHA256d).** Only *block-header* hashing changed - txids and the
  transaction merkle root are untouched.
- **Chain identity is inherited from the connected `bitcoind`** (via `getblockchaininfo`). There are **no
  hardcoded genesis, network-magic, or checkpoint changes**, and no testnet/mainnet constants - the
  BLAKE2b activation height is *discovered by binary search* over stored headers.

## Where the changes live
| Area | Files | What changed |
|---|---|---|
| Header view | `src/BTC_HeaderV2.{h,cpp}` (new) | `IsHeaderV2()`, `HeaderSizeFor()` (80/164), `HeaderPoWHash[Rev]()` - the single choke point every header site now calls |
| PoW | `src/bitcoin/block_pow_v2.cpp` (new) | `GetBlake2bPoWHash()` - the BLAKE2b PoW pipeline |
| BLAKE2b impl | `src/bitcoin/crypto/blake2b.{h,cpp}` (new, vendored) | reference BLAKE2b (CC0/OpenSSL/Apache - GPL-compatible) |
| Header parse | `src/bitcoin/block.{h,cpp}` | `CBlockHeader` gains a v2 flag + extra v2 fields; serialization reads the version word and conditionally reads them; `GetHash()` dispatches to BLAKE2b for v2 |
| Block-id substitution | `src/BTC.cpp`, `src/Storage.cpp`, `src/Controller.cpp`, `src/Servers.cpp` | every SHA256d block-id (`BTC::Hash[Rev]`) → `HeaderPoWHash[Rev]`; prev-block link + `cp_height` header-merkle use PoW hashes |
| Storage | `src/Storage.{h,cpp}`, `src/Options.h` | new `extended_headers` option: 164-byte records, padded on write / trimmed on read; record size is locked per DB (reopening under a different size is a hard error) |
| Protocol | `src/ServerMisc.h`, `src/Servers.{h,cpp}` | MaxProtocolVersion 1.6→1.7; new RPC `blockchain.pow_algorithms`; the pre-1.6 concatenated `block.headers` form now errors on non-80-byte headers |
| Identity | `src/Common.h` | APPNAME/VERSION → Shulcrum; advertises itself as Shulcrum on the wire |

## What is NOT done (from `doc/blake2b-headers.md` + our reading)
- `blockchain.headers.subscribe` and the `cp_height` header-merkle-root path are flagged as **needing
  review on mixed-length chains** - both are core wallet surfaces and must be validated.
- **No `server.features` fork-identity field.** The electrs-based indexer exposes `blake2b_fork` so
  Bitcoin Blake2b wallets can recognise the chain (genesis is shared with the parent chain, so
  `genesis_hash` can't disambiguate). Shulcrum only adds `blockchain.pow_algorithms`. Wallets that key
  off `server.features` may not recognise Shulcrum until an equivalent field is added.
- **Mainnet is unverified** - only testnet4 was exercised end-to-end.

## Implications for us
- **Adopt, don't re-implement.** The diff is small, well-isolated, and readable; re-deriving it would add
  risk for no benefit. We fork and build on it.
- **`extended_headers` must be `true`** for this chain and set once at first index (irreversible per DB) -
  the package should set it and never expose it as a toggle.
- **Likely first contributions:** validate/close the two unfinished protocol surfaces, and add a
  `server.features` identity field - pending the maintainer's input.

## Open questions to resolve during verification
- Does mainnet index cleanly and serve correct headers/history against a live node?
- Do `headers.subscribe` and `cp_height` proofs actually break on a mixed-length chain, and where?
- Which `server.features` shape do the target wallets expect?

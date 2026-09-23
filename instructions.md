# Shulcrum

An Electrum server for the Bitcoin Blake2b chain. It indexes the chain and answers wallet queries
about your addresses, so your wallet never has to ask anyone else about them.

Shulcrum is a fork of Fulcrum that reads block headers at the length their own version word claims,
80 bytes before the BLAKE2b fork and 164 after it, and identifies blocks by their proof-of-work
hash. Ordinary Fulcrum cannot follow this chain: it assumes every header is 80 bytes and rejects
every block.

## Before you start

Your Bitcoin node must be:

- **On the Bitcoin Blake2b chain.** Shulcrum checks this at first start and refuses to build an index
  against any other chain, because the header size is fixed permanently when the index is created.
- **Not pruned.** Shulcrum reads every block. A pruned node has thrown away what it needs.
- **Running with a transaction index** (`txindex=1`). Shulcrum verifies this at startup and stops if
  it is missing.

If any of these is wrong, Shulcrum tells you which one rather than failing obscurely.

## The first index takes a long time

This is the part worth setting expectations on, because it looks like a fault and is not.

Building the index from an empty database takes **many hours, and on modest hardware more than a
day**. The progress figure moves quickly at first and then appears to crawl. That is expected: early
blocks are nearly empty, later ones are not, so the blocks-per-second figure falls while the actual
work per second stays roughly constant.

Plan for the space it needs. The index is larger than the chain it reads: expect roughly 235 GB for
mainnet, and it keeps growing with the chain. Put it on a disk with room to spare.

While this is happening:

- The **Indexing** health check reports the percentage complete. Watch that rather than the log. The
  other check, **Electrum (SSL)**, stays amber until the index finishes, because Shulcrum does not
  open its port before then. That is not a fault.
- **The Electrum port will not answer for minutes at a time.** Shulcrum indexes a whole batch of
  blocks before servicing a request. A wallet that times out during the build has not failed; it is
  early.
- Indexing is limited by disk speed more than by processor. If your node is on the same disk, the
  two compete, and both are slower for it.

Once caught up, it keeps pace with the chain and answers immediately.

## Connecting a wallet

The service exposes two addresses, under Interfaces:

- **Electrum (SSL)**, port 50002, which is the one to use from another machine.
- A plaintext port, 50001, reachable only from other services on this server.

Use the SSL address and turn SSL **on** in your wallet. The one exception is a Tor address added
with the SSL toggle off, which carries plain TCP; a wallet using that address needs SSL off.

**Your wallet must understand this chain.** Ordinary Bitcoin wallets derive block identities the
wrong way here and will reject what Shulcrum serves, even though it is correct. A wallet built for
the BLAKE2b chain is required.

## Connecting a block explorer

A self-hosted explorer on this server can use Shulcrum as its indexer. In the explorer's own
settings, choose **Fulcrum** as the indexer. Shulcrum takes that name because it is a Fulcrum fork,
and that is how the explorer finds it.

Do this once Shulcrum has finished its first index. An explorer pointed at an indexer that is still
building will show gaps and slow lookups.

## Things you cannot change, and why

**Extended headers are always on.** This decides the size of every header record on disk, and the
database refuses to open under a different size, so it is fixed when the index is created. Making it
a setting would mean offering a switch whose real cost is rebuilding the whole index. This package
serves one chain, that chain has 164-byte headers, so there is one correct value and no switch.

**Peer announcement is off.** Fulcrum normally advertises itself to other Electrum servers and pulls
peers from them. Those servers are on Bitcoin's main chain, and a wallet that found us there would
get answers for a chain it is not on. That is a correctness setting, not a privacy preference.

## If something looks wrong

- **"Cannot read the Bitcoin node's RPC cookie"**: the node has not started yet, or it is on a
  different chain than its configuration says.
- **"Cannot reach the Bitcoin node"**: the cookie was readable, so this is the node not answering.
  Check that it is running and synced.
- **"not on the Bitcoin Blake2b chain"**: the node is on a different chain, or it is on this one but
  has not yet reached the fork height. Let it finish syncing.
- **Address lookups time out during the first index**: expected. See above.
- **"The Bitcoin node has no transaction index"**: turn on Transaction Index in the node, let it
  rebuild, then start this service again. Shulcrum answers questions about transactions and cannot
  do it without one.
- **"The Bitcoin node is pruned"**: this service indexes the whole chain and needs the whole chain
  present. A pruned node has to be resynced unpruned.
- **"The Bitcoin node rejected our RPC credential"**: the node answered but refused the cookie,
  which means it is configured with a user and password instead. This service authenticates by
  cookie only.

## Backups

A backup of this service **excludes the index**, deliberately: it is large, and it can be rebuilt
from the node. What a restore gives you is the configuration, and the index then rebuilds from
scratch, which takes as long as the first one did. Nothing is lost, but plan for the time.

## Supporting this work

If Shulcrum is useful to you, donations go to TwentyOne.Life:

**BitcoinB2B**

```
1BH665bXvEqSuoWQUihiQiPpt2BqpzrgGD
```

As a URI, which is what the QR below encodes:

```
bitcoin:1BH665bXvEqSuoWQUihiQiPpt2BqpzrgGD
```

<img src="assets/donation-qr.png" alt="BitcoinB2B donation address for TwentyOne.Life" width="220">

**Read this before sending.** Bitcoin Blake2b shares Bitcoin's address format and its genesis block,
so the address above is a perfectly valid Bitcoin address as well, and nothing about it says which
chain it belongs to. Send from a Bitcoin Blake2b wallet. Bitcoin sent to it is a different asset and
is not a donation to this project, whatever your wallet shows you.

There is no way to make that distinction visible in the address itself. It is a property of the
fork, not an oversight.

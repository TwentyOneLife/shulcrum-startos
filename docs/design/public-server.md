# Design: running a published Electrum server for this chain

- **Issue:** internal 41
- **Status:** draft

## Problem

There is no published Electrum server endpoint for Bitcoin Blake2b. Not a weak one, not a slow one:
none. Six server implementations exist and none of them is running anywhere a stranger can reach.

The wallets say so themselves. Shrike's README: *"the preconfigured public Electrum servers are
gone, because they stopped at the activation height. Connect a Knots node, or your own Electrum
server indexing one."* The other Sparrow fork withdraws public servers in the same words. The
community index lists server repositories with no host and no port.

The effect is that every wallet on this chain must first become a server operator. That is a
reasonable thing to ask of people who want it, and an unreasonable thing to require of everyone. It
is also the reason a wallet is hard to try: a person who wants to hold a small amount and see it
work has to sync a node and build an index first.

We are already most of the way to fixing it by accident. We maintain a server fork, we package it,
and we have been building a mainnet index for three weeks for an unrelated reason. What is missing
is not software.

## What "published" actually requires

Running the software is not the thing. Four conditions have to hold at once, and today none of them
does:

| | State |
|---|---|
| Indexed on mainnet | no, 24% |
| Running | no |
| Reachable by someone who is not us | no |
| Findable, so a wallet can be pointed at it | no |

The fourth is the one that is easy to forget and easy to do badly. An address nobody can find is
not published, and an address published somewhere that rots is worse than none, because a wallet
configured against a dead server looks like a broken wallet.

## Approach

**Serve it over Tor, as the primary address.** An onion address needs no port forwarding, exposes no
home IP, and authenticates the server by its own name, so there is no certificate to get wrong and
no certificate authority in the path. This chain's users are disproportionately people who care
about that. A clearnet address can come later and is a separate decision with separate risks; it is
explicitly not part of this.

**Publish it where the ecosystem already looks**, which today means the community index and the
wallets' own documentation, not a page of ours that nobody visits.

**Publish what it is, not only where it is.** An endpoint on its own is an assertion. Alongside the
address we state the protocol versions served, the chain and the fork height it believes in, the
index height it has reached, and when that was last true. A wallet author deciding whether to list
us should not have to connect to find out.

**Say plainly what an operator can see.** This is the part most server lists omit. An Electrum
server learns which addresses a client asks about, which is close to learning that client's balance
and history. Running one for other people is a privacy responsibility before it is a technical one,
and the honest posture is to say what is logged, what is not, and what a user should assume anyway:
that they are trusting us with their address set unless they use their own server.

## What a client can verify without trusting us

Worth stating because it bounds the damage and it is what protocol 1.8 work bought.

A client can check headers form a chain and meet their work, and with `cp_height` it can demand a
merkle proof that a transaction is in a block, and that the block is in the chain the client already
believes in. It can compare `blake2b_fork` in `server.features` against the activation height it was
built with, which is the cross-check we have just pointed the wallet's authors at.

What it cannot check is a server that answers truthfully about what it shows and stays quiet about
what it omits. An Electrum server that hides a transaction does not get caught by a merkle proof
about a different one. So the trust is real, it is narrow, and it is about omission rather than
forgery.

## Non-goals

Not a business, not a service with an availability promise, and not a claim that anyone should rely
on it. If it becomes load bearing for this chain, that is an argument for more servers run by more
people, not for us promising more.

Not a clearnet endpoint yet. Not a fee-rate or explorer API. Not a replacement for anyone's own
server, and the documentation should say so first rather than last.

## Alternatives considered

**Do nothing and keep the index for our own testing.** What we were doing. The index gets built
either way, and the marginal cost of letting others use it is operational, not computational. The
argument against doing nothing is simply that the gap is real and we are the ones standing in front
of it.

**Publish the index as a downloadable snapshot** so others can skip the three weeks. Attractive, and
worse than it looks: a downloaded index is a database you are trusting, with none of the
verification a served endpoint at least permits at the margins. It also invites exactly the kind of
"trusted snapshot" habit this chain should not acquire while it is young. Reconsider if the sync
time stays this punishing.

**Wait for someone else.** `jasonsopko/electrs` is the only server with an author-stated mainnet run
since the fork block, and it publishes no releases. Our own upstream has not moved since 24 August
and is verified on testnet4 only. Nobody is obviously about to do this.

## Risks

**An address that outlives its uptime.** A published endpoint that stops answering is a wallet that
appears broken to someone who has no idea who we are. Mitigation: publish the status alongside the
address, and take the listing down ourselves rather than waiting to be noticed.

**We become a privacy chokepoint.** If we are the only public server, using it is not a choice, and
every user of it hands us their addresses. Mitigation is honesty in the documentation and actively
encouraging other operators rather than being pleased about being the only one.

**Load.** Sizing is unknown: the chain has roughly 141 reachable nodes and a mempool of a few
hundred transactions, so demand is likely small, but "likely" is not a plan. Connection limits
before publishing, not after.

**Our index is not yet proven correct.** Nothing has validated our served data against a node on
mainnet. Publishing an endpoint before that check is publishing a server we have not verified. This
is a blocker, not a caveat.

## Test plan

1. The index completes and the server serves it.
2. **Served data validated against the node on mainnet**: headers, a `cp_height` proof, and an
   address history compared against `bitcoind` for the same addresses. This is the existing
   mainnet-verification work and it gates publication.
3. A wallet that is not ours connects over the onion address, from a machine that is not ours, and
   completes a sync.
4. Protocol 1.8 negotiation observed on that connection, and `blake2b_fork` served with the
   activation height and fork block hash.
5. Behaviour under a dropped connection and a restart, since a published server is judged on its
   worst hour rather than its best.
6. The status we publish matches what the server reports when someone checks it.

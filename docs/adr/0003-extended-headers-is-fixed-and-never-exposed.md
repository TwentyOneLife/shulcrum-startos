# ADR-0003: `extended_headers` is fixed true and never exposed
- **Status:** accepted
- **Date:** 2026-09-05

## Context
`extended_headers` tells Shulcrum to store block headers at 164 bytes rather than 80. It is not a
preference. It fixes the record size of the on-disk header array, and the store refuses to reopen a
database built under a different one, so the setting is **irreversible for the life of an index
database**. Changing it is not a correction, it is a full re-index.

That makes it the wrong shape for a config field. A user who can turn it off can destroy a
multi-day index by toggling a switch whose consequence is invisible at the moment of toggling.

The setting also cannot protect itself. It says how to store headers, not which chain they came
from, so it is perfectly possible to point a correctly configured `extended_headers` package at an
ordinary Bitcoin node and begin building an index that is permanently the wrong shape for the data
going into it.

## Decision
`extended_headers` is `z.literal(true)` in the config model, written on every start and not
presented to the user.

Separately, the chain is verified at runtime **before the database exists**, by asking the node for
its tip header and measuring it: 328 hex characters is a 164 byte header and this chain, 160 is the
ordinary 80 byte one and is refused. The guard also refuses when the node cannot be reached, because
the alternative is creating an irreversible database against an unverified chain.

## Consequences
The package serves one chain, and says so. Pointed at an ordinary Bitcoin node it refuses to start
rather than quietly building an index it can never reopen correctly.

The guard has to run before the first index and cannot be deferred to a health check, since by the
time a health check fails the irreversible thing has already happened. It therefore lives in `main`
rather than in `dependencies.ts` or a check, and its "has an index already been built" test looks for
the store's own subdirectory rather than the datadir, because Fulcrum creates the datadir while
parsing options, before it has spoken to any node.

**A correction worth recording, because the original reasoning was half wrong.** This ADR's logic was
first used to argue that the package should decline a node picklist: if `extended_headers` is
irreversible, a package that can be repointed at another chain can invalidate its own index. The
premise is right and the conclusion does not follow. A dependency id was never evidence of a chain,
which the same design document already said about health checks. The two chains share every block up
to 961639, so a node's own sync check passes on both. Declining the picklist bought nothing, while
the id we depended on turned out not to be the one our target node actually uses.

So the protection is the runtime guard, not the absence of generality. The package depends on the id
the target really has, `bitcoind`, and checks the chain itself before the irreversible database is
created. See `docs/design/s9pk-package.md` for the full revision.

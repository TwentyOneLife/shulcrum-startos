import { sdk } from './sdk'
import { nodeId } from './utils'

/**
 * The node must be archival and must carry a transaction index.
 *
 * This is where this package most sharply diverges from `electrs-pruned-startos`, which it is
 * otherwise modelled on. That package exists to permit a pruned node and states that `txindex`
 * "is not required and must not be requested". Both of those are inverted here, and not by
 * oversight: Fulcrum's own requirements are that the node have `txindex=1` and not be a pruning
 * node. A reader diffing the two packages will find this logic reversed; it is deliberate.
 *
 * Fulcrum does **not** enforce either, which this comment used to claim it did. `Controller.cpp`
 * asks the node for the first transaction after genesis and, when that fails, prints an error
 * banner and carries on serving. So the service starts, both health checks pass, and every
 * `blockchain.transaction.get` fails. Nothing in this dependency block closes that gap either:
 * `kind: 'running'` and a health check id say nothing about a node's settings, and the node's own
 * `index-sync` check is not a substitute, because `getindexinfo` lists only the indexes that are
 * enabled and the node offers three. A node running `blockfilterindex` with `txindex` off reports
 * `index-sync` healthy. It says nothing about pruning at all. The requirements guard in main.ts is
 * what actually enforces this, by asking the node.
 *
 * Both are standing requirements rather than one-time checks, which is why that guard runs on every
 * start. A user who enables pruning after the index is built breaks the service just as surely as
 * one who never disabled it, and the node's own help notes that switching to pruned disables
 * `txindex` along the way.
 *
 * Health checks are the official package's own ids, `bitcoind` and `sync-progress`. Requiring an id
 * a package does not declare is indistinguishable from requiring a failing one: StartOS reads
 * `health[id]`, gets `undefined`, and shows "Required health check not passing" forever, unable to
 * even name the check. `knots-blake2b`'s `node` and `chain` ids do not exist here.
 *
 * Note what that costs us. `chain` was the check that established which chain the node follows, and
 * the official package has no equivalent, because on the chain it was written for the question does
 * not arise. Nothing in this dependency block can tell a BLAKE2b node from an ordinary one: the two
 * share every block up to 961639, so `sync-progress` passes on both. That gap is why the chain guard
 * in main.ts exists, and it is not optional.
 */
export const setDependencies = sdk.setupDependencies(async ({ effects }) => {
  return {
    [nodeId]: {
      kind: 'running' as const,
      healthChecks: ['bitcoind', 'sync-progress'],
      // Mirrored from electrs-pruned-startos, which is verified against this family of nodes.
      // Our own requirement is weaker than theirs, since we need no `peer-local` host and open no
      // P2P connection, so this range is stricter than it has to be. Left strict rather than
      // guessed at, and flagged on #10 to be confirmed against the real node at install: a
      // flavored version such as `#knots:29.4.1:6` does not satisfy an unflavored range directly,
      // it matches through the package's own `satisfies` list, and that is not a thing to assume.
      versionRange:
        '(>=28.4:17 && <29) || (>=29.4:4 && <30) || (>=30.3:4 && <31) || >=31.1:4',
    },
  }
})

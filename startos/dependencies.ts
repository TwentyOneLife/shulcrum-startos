import { sdk } from './sdk'
import { nodeId } from './utils'

/**
 * The node must be archival and must carry a transaction index.
 *
 * This is where this package most sharply diverges from `electrs-pruned-startos`, which it is
 * otherwise modelled on. That package exists to permit a pruned node and states that `txindex`
 * "is not required and must not be requested". Both of those are inverted here, and not by
 * oversight: Fulcrum's own requirements are that the node have `txindex=1` and not be a pruning
 * node, and `Controller.cpp` verifies the transaction index at startup by fetching a transaction
 * and refuses to proceed when that fails. A reader diffing the two packages will find this logic
 * reversed; it is deliberate.
 *
 * Both are standing requirements rather than one-time checks. A user who enables pruning after
 * the index is built breaks the service just as surely as one who never disabled it.
 *
 * Health checks: `node` and `chain`, not `sync-progress`. The node package gained a sync check in
 * 1.0.0:31, so requiring it would work, but `chain` already fails below the fork activation
 * height and a second check that stays amber through the whole of initial sync would say nothing
 * new. `chain` is the one that matters: the two chains share every block up to 961639, so a node
 * with no peers on the fork sits just below activation looking perfectly synced. Being synced does
 * not establish which chain a node is on.
 */
export const setDependencies = sdk.setupDependencies(async ({ effects }) => {
  return {
    [nodeId]: {
      kind: 'running' as const,
      healthChecks: ['node', 'chain'],
      // Gated on the release that dropped the chain selector and became mainnet only, because the
      // cookie path in utils.ts assumes the datadir root rather than a chain-named subdirectory.
      // Left as a floor to be re-read at packaging time: this dependency shipped several releases
      // in the week this was written, so the range is the most perishable line in the package.
      versionRange: '>=1.0.0:30',
    },
  } as any
})

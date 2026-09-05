import { T } from '@start9labs/start-sdk'
import { rpcHostId, rpcPort } from 'knots-blake2b-startos/startos/utils'
import { sdk } from './sdk'

/** Electrum plaintext, inside the container. TLS is added by the interface binding. */
export const port = 50001

/**
 * Host id the Electrum interface binds on. Exported so dependents, a mempool explorer in
 * particular, resolve this service over the bridge without repeating a literal.
 */
export const electrumHostId = 'electrum'

/** The node package this service indexes. Named once; every reference resolves through here. */
export const nodeId = 'knots-blake2b'

/** Where the node's read-only volume is mounted in our container. */
export const nodeMountpoint = '/mnt/bitcoin'

/**
 * The node's RPC cookie, as our container sees it.
 *
 * At the datadir root rather than under a chain-named subdirectory, because the node package is
 * mainnet only: it dropped its chain selector in 1.0.0:30, and mainnet is the one chain bitcoind
 * does not nest. The version range in dependencies.ts is what keeps that true, so the two must
 * move together.
 */
export const cookiePath = `${nodeMountpoint}/.cookie`

/**
 * Fulcrum's admin RPC, loopback inside the container only.
 *
 * This is what the sync health check reads. Unlike the Electrum port, it answers throughout an
 * index build, which is the whole window the check exists to describe.
 */
export const adminPort = 8000

/**
 * The node's RPC endpoint over the LXC bridge, for fulcrum.conf's `bitcoind`.
 *
 * Reactive and chained `.const()`, so main restarts only when the address actually changes: a node
 * update is zero restarts, a node installed after this service is one healing restart. Resolves
 * null while the node is absent, and the caller omits the field rather than writing a placeholder,
 * so the `.const()` heals the real address in once the node appears.
 *
 * Only RPC. Fulcrum fetches blocks with `getblock` over JSON-RPC and opens no P2P connection, so
 * none of the template's `peer-local` whitelisting concerns apply here.
 */
export const nodeRpcBridge = async (effects: T.Effects) =>
  sdk.host
    .getBridgeAddress(effects, {
      packageId: nodeId,
      hostId: rpcHostId,
      internalPort: rpcPort,
      ssl: false,
    })
    .const()

import { T } from '@start9labs/start-sdk'
import { rpcHostId, rpcPort } from 'bitcoin-core-startos/startos/utils'
import { sdk } from './sdk'

/** Electrum plaintext, inside the container. TLS is added by the interface binding. */
export const port = 50001

/**
 * Host id the Electrum interface binds on.
 *
 * `main`, which is what `Start9Labs/fulcrum-startos` exposes, because anything reaching a package
 * with the `fulcrum` id expects fulcrum's layout. Mempool Guide connects by the hostname
 * `fulcrum.startos` on port 50001 with TLS off, so the plaintext binding is the one that matters
 * to it and the TLS one is for wallets off the box.
 */
export const electrumHostId = 'main'

/**
 * The node package this service indexes. Named once; every reference resolves through here.
 *
 * `bitcoind` rather than `knots-blake2b`, because that is the id a BLAKE2b build sideloaded over
 * the official package takes, and it is what our target node actually runs. The id says nothing
 * about which chain the node is on, which is why main.ts guards the chain directly instead of
 * inferring it from here.
 */
export const nodeId = 'bitcoind'

/** Where the node's read-only volume is mounted in our container. */
export const nodeMountpoint = '/mnt/bitcoin'

/**
 * The node's RPC cookie, as our container sees it.
 *
 * At the datadir root, which is where bitcoind keeps it on mainnet. Every other chain nests it in a
 * subdirectory named for that chain. The official package offers those other chains, so this is an
 * assumption rather than a certainty, and it is one the chain guard in main.ts fails loudly on
 * rather than silently mis-authenticating: a BLAKE2b chain is a mainnet chain.
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

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

/** Fulcrum's datadir, named once so `fulcrum.conf` and the chain guard cannot drift apart. */
export const dataDir = '/mnt/shulcrum/db'

/**
 * The subdirectory Fulcrum creates inside the datadir for the store itself, `kDBName` in its
 * Storage.cpp. It is the only honest test for "an index exists": the datadir is created during
 * option parsing, before the store is opened and before any node is contacted.
 */
export const storeSubdir = 'fulc2_db'

/**
 * The node's RPC cookie, as our container sees it.
 *
 * At the datadir root, and constant. bitcoind the daemon nests a non-mainnet chain's cookie under a
 * subdirectory, so #24 derived this path from the node's own config. That derivation is gone,
 * because the `bitcoind` package cannot reach the case it defended:
 *
 * - it carries no chain selector at all, no `testnet`/`signet`/`regtest`/`chain` key in its config
 *   model and no chain flag on the daemon, which it launches with `-onion` and nothing else;
 * - it writes `rpccookiefile=.cookie` over whatever the user supplied, and addresses the cookie as
 *   `<datadir>/.cookie` in its readiness check, its cli args and its electrs passthrough.
 *
 * The derivation could also not distinguish the two cases it needed to. The reactive read mapped an
 * unreadable config and a mainnet config to the same `null`, and the change comparator treated
 * `null` as "no change", so a node moving off a nested chain would have kept the old nested cookie
 * path and failed to authenticate with exactly the misleading message #24 set out to remove.
 *
 * What survives from #24 is the half that earned its place and does not depend on any of this: the
 * chain guard reports an unreadable cookie and an unreachable node as different faults.
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

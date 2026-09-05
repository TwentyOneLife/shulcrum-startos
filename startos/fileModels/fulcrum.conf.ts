import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'
import { adminPort, cookiePath, dataDir, port } from '../utils'

/**
 * Fulcrum's config is flat `key = value` lines with unquoted values, which is what the SDK's ini
 * helper produces for a flat object. Not toml: toml would quote every string, and Fulcrum reads
 * the quotes as part of the value.
 */
export const shape = z.object({
  /**
   * Fixed true, and deliberately not a setting (#12).
   *
   * It sets the size of each header record on disk, and the header store refuses to open under a
   * record size other than the one it was created with. So this is not a value a user can change;
   * it is a value that, if changed, silently requires a full re-index. The package serves one
   * chain and that chain has 164-byte headers, so there is one correct value and no switch.
   */
  extended_headers: z.literal(true).catch(true),

  /**
   * The node's RPC endpoint over the bridge, written by main.ts at startup.
   *
   * Optional and absent while the node is unresolved. main omits the field rather than writing a
   * placeholder, so the reactive read heals the real address in once the node appears.
   */
  bitcoind: z.string().optional().catch(undefined),

  /**
   * Cookie authentication, so this package never generates, stores or backs up an RPC credential.
   * Fulcrum rejects a config that sets both this and rpcuser/rpcpassword, so those are absent by
   * construction rather than by convention.
   *
   * The default is only a seed. main.ts derives the real path from the node's own chain and writes
   * it on every start, because bitcoind nests a non-mainnet chain's cookie under a subdirectory.
   */
  rpccookie: z.string().catch(cookiePath),

  datadir: z.string().catch(dataDir),

  /**
   * `tcp` binds every interface inside the container on purpose: that binding is what StartOS
   * exports over the LXC bridge, and narrowing it to loopback would leave the Electrum interface
   * and the Mempool Guide path with nothing to reach. Container-internal, not host-exposed.
   *
   * `admin` is the loopback-only one. It is an unauthenticated control socket and nothing outside
   * this container has any business reaching it.
   */
  tcp: z.string().catch(`0.0.0.0:${port}`),
  admin: z.string().catch(`127.0.0.1:${adminPort}`),

  /**
   * Correctness, not preference. Fulcrum's defaults announce the server to, and pull peers from,
   * Bitcoin's Electrum server network, where this server answers for an incompatible chain. A
   * wallet that found us there would get header and history answers that do not match the chain
   * it thinks it is on.
   */
  peering: z.literal(false).catch(false),
  announce: z.literal(false).catch(false),

  /**
   * RocksDB memory, MiB. Fulcrum 2.x removed fast-sync and routes this through db_mem instead.
   *
   * Coerced, because an ini file has no numbers. The parser returns `"4096"` for `db_mem = 4096`,
   * which a bare `z.number()` rejects and `.catch(undefined)` then swallows, so main's next write
   * of this file would silently delete whatever the user had tuned.
   */
  db_mem: z.coerce.number().optional().catch(undefined),
})

export const confFile = FileHelper.ini(
  {
    base: sdk.volumes.main,
    subpath: 'fulcrum.conf',
  },
  shape,
  // Fulcrum accepts both spellings; the spaced form matches its own shipped example config, so a
  // user comparing the two is reading the same shape.
  { whitespace: true },
)

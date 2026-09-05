import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'
import { adminPort, cookiePath, port } from '../utils'

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
   */
  rpccookie: z.string().catch(cookiePath),

  datadir: z.string().catch('/mnt/shulcrum/db'),

  /**
   * Loopback only, both of them. The container binding is what StartOS then exports; binding
   * 0.0.0.0 here would expose the plaintext port beyond what the interface actually offers.
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

  /** RocksDB memory, MiB. Fulcrum 2.x removed fast-sync and routes this through db_mem instead. */
  db_mem: z.number().optional().catch(undefined),
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

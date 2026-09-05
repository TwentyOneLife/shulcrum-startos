import { FileHelper } from '@start9labs/start-sdk'
import { manifest as nodeManifest } from 'knots-blake2b-startos/startos/manifest'
import { confFile } from './fileModels/fulcrum.conf'
import { i18n } from './i18n'
import { sdk } from './sdk'
import {
  adminPort,
  cookiePath,
  nodeId,
  nodeMountpoint,
  nodeRpcBridge,
  port,
} from './utils'

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting Shulcrum'))

  // The node's RPC over the bridge, written into fulcrum.conf before the daemon reads it.
  // Resolved reactively: main re-fires and restarts only when the address actually changes, so a
  // plain node update costs nothing and a node installed later heals in with one restart. While
  // the node is absent this is null and the field is omitted rather than filled with a
  // placeholder.
  const nodeRpc = await nodeRpcBridge(effects)
  await confFile.merge(effects, {
    ...(nodeRpc && { bitcoind: nodeRpc }),
  })

  const container = sdk.SubContainer.of(
    effects,
    { imageId: 'shulcrum' },
    sdk.Mounts.of()
      .mountVolume({
        volumeId: 'main',
        subpath: null,
        mountpoint: '/mnt/shulcrum',
        readonly: false,
      })
      .mountDependency<typeof nodeManifest>({
        dependencyId: nodeId,
        volumeId: 'main',
        subpath: null,
        mountpoint: nodeMountpoint,
        readonly: true,
      }),
    'shulcrum',
  )

  const rootfs = await container.rootfs

  // Restart when the node writes a replacement cookie, and only then. An absent cookie means the
  // node is down rather than that the credential changed, so a null read is not a change.
  await FileHelper.string(`${rootfs}${cookiePath}`)
    .read(
      (cookie) => cookie,
      (prev, next) => next === null || prev === next,
    )
    .const(effects)

  /**
   * How far the index has got, and how far it has to go.
   *
   * Two sources, because neither knows both numbers. Shulcrum's admin RPC reports the indexed
   * height and, unlike its Electrum port, answers throughout an index build: the Electrum side
   * services no request for minutes at a time while a batch is indexed, which is precisely the
   * window this check exists to describe. The node supplies the target, because `getinfo` carries
   * no node height: its `bitcoind_info` is version, subversion, relayfee and warnings only.
   *
   * The admin interface is line-delimited JSON-RPC over a plain TCP socket rather than HTTP, so
   * this speaks to it with bash's /dev/tcp instead of curl. Loopback inside the container.
   *
   * Null on any doubt. Every caller reads correctly without a number, and a health message is not
   * worth being wrong about.
   *
   * TODO before #11 closes: exercise this against a live instance mid-build. The probe shape is
   * derived from the source, not yet observed.
   */
  const readProgress = async (): Promise<{
    indexed: number
    total: number
    percent: string
  } | null> => {
    const probe = `exec 3<>/dev/tcp/127.0.0.1/${adminPort} || exit 1
printf '{"jsonrpc":"2.0","id":1,"method":"getinfo"}\\n' >&3
IDX=$(timeout 5 head -n 1 <&3 | sed -n 's/.*"height":[[:space:]]*\\([0-9]*\\).*/\\1/p')
exec 3<&- 3>&-
TGT=$(curl -s --max-time 5 --user "$(cat ${cookiePath})" -H 'content-type: text/plain;' \
--data-binary '{"jsonrpc":"1.0","id":"h","method":"getblockchaininfo","params":[]}' \
http://${nodeRpc}/ 2>/dev/null | sed -n 's/.*"blocks":\\([0-9]*\\).*/\\1/p')
printf '%s %s' "\${IDX:-}" "\${TGT:-}"`

    const res = await container.exec(['bash', '-c', probe], {})
    if (res.exitCode !== 0) return null

    const [rawIndexed, rawTotal] = res.stdout.toString().trim().split(/\s+/)
    const indexed = Number(rawIndexed)
    const total = Number(rawTotal)
    if (
      !Number.isFinite(indexed) ||
      !Number.isFinite(total) ||
      total <= 0 ||
      indexed < 0
    ) {
      return null
    }

    // Clamped because the two numbers are read a moment apart from different services, so a block
    // landing in between can put the index a hair past the height it was measured against.
    // "100.2%" reads as a fault rather than as the one-block race it is.
    return {
      indexed: Math.min(indexed, total),
      total,
      percent: Math.min(100, (indexed / total) * 100).toFixed(1),
    }
  }

  return sdk.Daemons.of(effects)
    .addDaemon('shulcrum', {
      subcontainer: container,
      // The config path is passed positionally; Shulcrum takes a conf file as its sole argument.
      exec: { command: ['shulcrum', '/mnt/shulcrum/fulcrum.conf'] },
      ready: {
        display: i18n('Electrum (SSL)'),
        fn: () => sdk.healthCheck.checkPortListening(effects, port, {
          successMessage: i18n('Fully synced'),
          errorMessage: i18n('Indexing'),
        }),
      },
      requires: [],
    })
    .addHealthCheck('sync-progress', {
      // Separate from the port check on purpose: the port opens long before the index is usable,
      // so "listening" and "caught up" are two different questions and deserve two answers.
      ready: {
        display: i18n('Indexing'),
        fn: async () => {
          const p = await readProgress()
          if (!p) return { result: 'starting', message: null }
          if (p.indexed >= p.total) {
            return { result: 'success', message: i18n('Fully synced') }
          }
          return {
            result: 'loading',
            message: `${p.percent}% (${p.indexed} of ${p.total})`,
          }
        },
      },
      requires: [],
    })
})

import { existsSync } from 'fs'
import { manifest as nodeManifest } from 'bitcoin-core-startos/startos/manifest'
import { confFile } from './fileModels/fulcrum.conf'
import { i18n } from './i18n'
import { sdk } from './sdk'
import {
  adminPort,
  cookiePath,
  dataDir,
  nodeId,
  nodeMountpoint,
  nodeRpcBridge,
  port,
  storeSubdir,
} from './utils'

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting Shulcrum'))

  // The node's RPC over the bridge, written into fulcrum.conf before the daemon reads it.
  // Resolved reactively: main re-fires and restarts only when the address actually changes, so a
  // plain node update costs nothing and a node installed later heals in with one restart. While
  // the node is absent this is null and the field is omitted rather than filled with a
  // placeholder.
  const nodeRpc = await nodeRpcBridge(effects)

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

  await confFile.merge(effects, {
    ...(nodeRpc && { bitcoind: nodeRpc }),
    rpccookie: cookiePath,
  })

  // The cookie is deliberately not watched. bitcoind rewrites it on every start, so watching it
  // would restart this service, dropping every wallet connection and closing a multi-GB store,
  // each time the node restarts or updates. Fulcrum does not need that: `-K/--rpccookie` is
  // "read and re-parsed each time we (re)connect to bitcoind", so it picks up the new credential
  // by itself on the reconnect it was going to make anyway.

  /**
   * The chain guard.
   *
   * Runs before the index exists, because afterwards is too late: `extended_headers` fixes the
   * on-disk header record size and the store refuses to reopen under a different one, so a database
   * built against the wrong chain is not a misconfiguration to correct, it is a re-index.
   *
   * Nothing in `dependencies.ts` can do this job. We depend on `bitcoind`, which is the id an
   * ordinary Bitcoin node takes as well, and the two chains share every block up to 961639, so
   * `sync-progress` passes on both. A dependency id is not evidence of a chain. The only thing that
   * distinguishes them is a header, so ask the node for one and read its length.
   *
   * Only on first index. Once the database exists it already encodes the answer, and re-checking
   * would turn a node being briefly unreachable into a refusal to start.
   *
   * The test is the store's own subdirectory, not the datadir. Fulcrum creates the datadir while it
   * parses options, before it opens the database and before it has spoken to any node, so a launch
   * that dies after argument parsing for any reason at all leaves an empty datadir behind. Testing
   * the datadir would read that as "already indexed" and skip the guard from then on, disabling it
   * permanently after a single failed start, which is exactly when it still needs to run. `fulc2_db`
   * is Storage.cpp's kDBName and appears only once the store itself is opened.
   */
  const dbPath = `${rootfs}${dataDir}/${storeSubdir}`
  if (!existsSync(dbPath) && nodeRpc) {
    const probe = `set -e
# Distinct exit code, because a cookie we cannot read and a node we cannot reach are different
# faults with different fixes, and reporting the first as the second is what #24 was about.
[ -r "${cookiePath}" ] || exit 4
rpc() { curl -s --max-time 10 --user "$(cat ${cookiePath})" -H 'content-type: text/plain;' --data-binary "$1" http://${nodeRpc}/; }
H=$(rpc '{"jsonrpc":"1.0","id":"g","method":"getbestblockhash","params":[]}' | sed -n 's/.*"result":"\\([0-9a-f]*\\)".*/\\1/p')
[ -n "$H" ] || exit 3
HDR=$(rpc "{\\"jsonrpc\\":\\"1.0\\",\\"id\\":\\"h\\",\\"method\\":\\"getblockheader\\",\\"params\\":[\\"$H\\",false]}" | sed -n 's/.*"result":"\\([0-9a-f]*\\)".*/\\1/p')
[ -n "$HDR" ] || exit 3
printf '%s' "\${#HDR}"`

    const res = await container.exec(['bash', '-c', probe], {})
    const hexChars = Number(res.stdout.toString().trim())

    if (res.exitCode === 4) {
      throw new Error(
        `Cannot read the Bitcoin node's RPC cookie at ${cookiePath}. bitcoind writes that file at ` +
          `its datadir root on every start, so either the node has not started yet, or it is not ` +
          `using cookie authentication.`,
      )
    }

    if (res.exitCode !== 0 || !Number.isFinite(hexChars) || hexChars === 0) {
      // Unreachable rather than wrong. Refuse this start so StartOS retries, instead of creating an
      // irreversible database on an unverified chain.
      throw new Error(
        'Cannot reach the Bitcoin node to confirm which chain it is on. The cookie was readable, ' +
          'so this is the node not answering rather than an authentication problem. Refusing to ' +
          'build an index until it answers, because the header format is fixed when the index is ' +
          'created.',
      )
    }

    // 328 hex characters is a 164-byte v2 header. 160 is the ordinary 80-byte one.
    if (hexChars !== 328) {
      throw new Error(
        `The connected Bitcoin node is not on the Bitcoin Blake2b chain: its tip header is ` +
          `${hexChars / 2} bytes, and a BLAKE2b chain serves 164. This package indexes only that ` +
          `chain, and the header size is fixed permanently when the index is created, so it will ` +
          `not start against any other. Point it at a Bitcoin Blake2b node, or if this node is on ` +
          `that chain but has not yet reached the activation height, let it finish syncing first.`,
      )
    }
    console.info('Chain guard: node serves 164-byte headers, this is the Bitcoin Blake2b chain.')
  }

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
    // `primary`, not `shulcrum`: this id is the health check id, and Mempool Guide requires
    // `['primary', 'sync-progress']` from whatever holds the `fulcrum` id. Requiring an id a
    // package does not declare reads to StartOS as a failing check that cannot even be named.
    .addDaemon('primary', {
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

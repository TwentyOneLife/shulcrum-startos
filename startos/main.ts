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
   * Shell preamble for talking to the node. Defines `rpc <json>`, which prints the body and leaves
   * the HTTP status in `$HTTP`.
   *
   * The status is the point. Without it a node that is not there and a node that answered and
   * rejected the credential look identical: both yield no parseable result. Reporting the second as
   * the first sends an operator to debug networking on a node that is answering fine (#27).
   *
   * The body goes to a file and the caller reads it from there, rather than `rpc` printing it for a
   * `$(rpc ...)` to capture. A command substitution runs its command in a subshell, so `HTTP` set
   * that way never reaches the caller and every status test silently compares against an empty
   * string. That is not a hypothetical: it is what the first version of this did, and the test
   * matrix caught all three consequences at once.
   */
  const rpcShell = (addr: string) => `rpc() {
  HTTP=$(curl -s -o /tmp/rpc.out -w '%{http_code}' --max-time 10 \\
    --user "$(cat ${cookiePath})" -H 'content-type: text/plain;' \\
    --data-binary "$1" http://${addr}/ 2>/dev/null) || HTTP=000
}`

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
${rpcShell(nodeRpc)}
rpc '{"jsonrpc":"1.0","id":"g","method":"getbestblockhash","params":[]}'
if [ "$HTTP" = "401" ]; then exit 5; fi
H=$(sed -n 's/.*"result":"\\([0-9a-f]*\\)".*/\\1/p' /tmp/rpc.out)
[ -n "$H" ] || exit 3
rpc "{\\"jsonrpc\\":\\"1.0\\",\\"id\\":\\"h\\",\\"method\\":\\"getblockheader\\",\\"params\\":[\\"$H\\",false]}"
if [ "$HTTP" = "401" ]; then exit 5; fi
HDR=$(sed -n 's/.*"result":"\\([0-9a-f]*\\)".*/\\1/p' /tmp/rpc.out)
[ -n "$HDR" ] || exit 3
printf '%s' "\${#HDR}"`

    const res = await container.exec(['bash', '-c', probe], {})
    const hexChars = Number(res.stdout.toString().trim())

    if (res.exitCode === 5) {
      throw new Error(
        `The Bitcoin node rejected our RPC credential. The cookie at ${cookiePath} was readable and ` +
          `the node answered, with 401. That means it is not using cookie authentication: a node ` +
          `configured with rpcauth or rpcuser and rpcpassword will refuse a cookie. This package ` +
          `authenticates by cookie only, so the node has to offer it.`,
      )
    }

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
    console.info(
      'Chain guard: node serves 164-byte headers, this is the Bitcoin Blake2b chain.',
    )
  }

  /**
   * The node requirements guard: a transaction index, and no pruning.
   *
   * Nothing else enforces either. `dependencies.ts` cannot: neither `kind: 'running'` nor the health
   * check ids say anything about a node's settings, the `bitcoind` package defaults `txindex` to
   * false, and it offers `prune` as an ordinary user setting. Requiring the node's own `index-sync`
   * check does not work either, tempting as it looks: `getindexinfo` lists only the indexes that are
   * enabled and the node offers three, so a node running `blockfilterindex` with `txindex` off
   * reports a healthy `index-sync` while the one index we need is absent. It says nothing about
   * pruning at all.
   *
   * Without this the failure is silent and looks like ours. Shulcrum starts, both health checks
   * pass, and every `blockchain.transaction.get` a wallet sends fails.
   *
   * Two deliberate differences from the chain guard above, which this must not be modelled on:
   *
   * - It runs on **every** start, not only before the first index. The node's own help says that
   *   switching a full node to pruned "will disable txindex (if enabled)", so a working install can
   *   lose the requirement long after its index was built.
   * - It refuses only on a **definite** answer from a node that replied. Nothing here is
   *   irreversible: an existing index stays valid, the service just cannot answer some queries. The
   *   chain guard refuses on silence because building an index on an unverified chain cannot be
   *   undone. This one falls through when it could not ask.
   */
  if (nodeRpc) {
    const probe = `${rpcShell(nodeRpc)}
[ -r "${cookiePath}" ] || exit 0
rpc '{"jsonrpc":"1.0","id":"i","method":"getindexinfo","params":[]}'
if [ "$HTTP" != "200" ]; then exit 0; fi
if ! grep -q '"txindex"' /tmp/rpc.out; then exit 6; fi
rpc '{"jsonrpc":"1.0","id":"c","method":"getblockchaininfo","params":[]}'
if [ "$HTTP" != "200" ]; then exit 0; fi
if grep -qE '"pruned"[[:space:]]*:[[:space:]]*true' /tmp/rpc.out; then exit 7; fi
exit 0`

    const res = await container.exec(['bash', '-c', probe], {})

    if (res.exitCode === 6) {
      throw new Error(
        'The Bitcoin node has no transaction index. Shulcrum answers wallet queries about ' +
          'transactions and cannot do that without one, and the node does not enable it by ' +
          'default. Turn on Transaction Index (txindex) in the node and let it finish building, ' +
          'then start this service again.',
      )
    }

    if (res.exitCode === 7) {
      throw new Error(
        'The Bitcoin node is pruned. Shulcrum indexes the whole chain and needs the full block ' +
          'history to do it, so a pruned node cannot back this service. Set the node to keep the ' +
          'full blockchain, which means resyncing it, then start this service again.',
      )
    }
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
  /**
   * The last target height the node gave us.
   *
   * Kept because the two numbers come from two services and only one of them is ours. A node
   * restart or update makes the target unavailable for a minute, and without this a fully indexed
   * Shulcrum answered "not started yet" for the duration, taking anything gated on
   * `['primary','sync-progress']` unready because of somebody else's restart (#26). Our own height
   * is still known in that window, so the honest report is that height against the last target we
   * were told, labelled as such.
   */
  let lastKnownTotal: number | null = null

  const readProgress = async (): Promise<{
    indexed: number
    total: number
    percent: string
    stale: boolean
  } | null> => {
    // The node half is omitted entirely when there is no node, rather than curling `http://null/`.
    const target = nodeRpc
      ? `TGT=$(curl -s --max-time 5 --user "$(cat ${cookiePath})" -H 'content-type: text/plain;' \
--data-binary '{"jsonrpc":"1.0","id":"h","method":"getblockchaininfo","params":[]}' \
http://${nodeRpc}/ 2>/dev/null | sed -n 's/.*"blocks":\\([0-9]*\\).*/\\1/p')`
      : 'TGT='

    const probe = `exec 3<>/dev/tcp/127.0.0.1/${adminPort} || exit 1
printf '{"jsonrpc":"2.0","id":1,"method":"getinfo"}\\n' >&3
IDX=$(timeout 5 head -n 1 <&3 | sed -n 's/.*"height":[[:space:]]*\\([0-9]*\\).*/\\1/p')
exec 3<&- 3>&-
${target}
printf '%s %s' "\${IDX:-}" "\${TGT:-}"`

    const res = await container.exec(['bash', '-c', probe], {})
    if (res.exitCode !== 0) return null

    const [rawIndexed, rawTotal] = res.stdout.toString().trim().split(/\s+/)
    const indexed = Number(rawIndexed)
    // Our own height is the one number this check cannot do without: not knowing it is the only
    // state that means "not started".
    if (!Number.isFinite(indexed) || indexed < 0) return null

    const freshTotal = Number(rawTotal)
    const haveFresh = Number.isFinite(freshTotal) && freshTotal > 0
    if (haveFresh) lastKnownTotal = freshTotal

    const total = haveFresh ? freshTotal : lastKnownTotal
    if (total === null) return null

    // Clamped because the two numbers are read a moment apart from different services, so a block
    // landing in between can put the index a hair past the height it was measured against.
    // "100.2%" reads as a fault rather than as the one-block race it is.
    return {
      indexed: Math.min(indexed, total),
      total,
      percent: Math.min(100, (indexed / total) * 100).toFixed(1),
      stale: !haveFresh,
    }
  }

  return (
    sdk.Daemons.of(effects)
      // `primary`, not `shulcrum`: this id is the health check id, and Mempool Guide requires
      // `['primary', 'sync-progress']` from whatever holds the `fulcrum` id. Requiring an id a
      // package does not declare reads to StartOS as a failing check that cannot even be named.
      .addDaemon('primary', {
        subcontainer: container,
        // The config path is passed positionally; Shulcrum takes a conf file as its sole argument.
        exec: { command: ['shulcrum', '/mnt/shulcrum/fulcrum.conf'] },
        ready: {
          display: i18n('Electrum (SSL)'),
          fn: () =>
            sdk.healthCheck.checkPortListening(effects, port, {
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
            // Said out loud when the target is the remembered one, so a number read here is never
            // more current than it actually is.
            const asOf = p.stale
              ? ' (node not answering; last known height)'
              : ''
            if (p.indexed >= p.total) {
              return { result: 'success', message: i18n('Fully synced') + asOf }
            }
            return {
              result: 'loading',
              message: `${p.percent}% (${p.indexed} of ${p.total})${asOf}`,
            }
          },
        },
        requires: [],
      })
  )
})

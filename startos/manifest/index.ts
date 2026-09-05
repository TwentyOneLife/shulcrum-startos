import { setupManifest } from '@start9labs/start-sdk'
import { long, nodeDescription, short } from './i18n'

export const manifest = setupManifest({
  /**
   * `fulcrum`, not `shulcrum`, and the flavor in the version is what keeps that honest.
   *
   * StartOS resolves a dependency by package id, and an explorer reaches its indexer at
   * `<id>.startos`. Mempool Guide offers exactly two indexers in a two-value picklist, `fulcrum`
   * and `electrs`, and writes the choice out as a hostname. A package called `shulcrum` is not
   * reachable by either name, however correctly it serves the chain, so #14 is impossible under
   * that id. This is the same move the BLAKE2b node package already makes one layer down, taking
   * `bitcoind` as `#knots:29.4.1:6` rather than inventing an id nothing looks for.
   *
   * The flavor is what stops this being a squat: it tells the registry that this and an ordinary
   * BTC Fulcrum are not interchangeable, and the two cannot be installed side by side.
   */
  id: 'fulcrum',
  title: 'Shulcrum',
  license: 'GPL-3.0-only',
  packageRepo: 'https://github.com/TwentyOneLife/shulcrum-startos',
  upstreamRepo: 'https://github.com/TwentyOneLife/Shulcrum',
  marketingUrl: 'https://github.com/TwentyOneLife/Shulcrum',
  donationUrl: null,
  description: { short, long },
  volumes: ['main'],
  images: {
    shulcrum: {
      source: {
        dockerBuild: {
          dockerfile: 'Dockerfile',
          workdir: '.',
        },
      },
      arch: ['x86_64', 'aarch64'],
    },
  },
  /**
   * One node, required, not a picklist.
   *
   * `bitcoind` is the id a BLAKE2b build takes when it is sideloaded over the official package,
   * which is what our target node runs and what this package is built to index.
   *
   * An earlier version required `knots-blake2b` instead, reasoning that a single fixed dependency
   * stops the package being repointed at an 80-byte chain and invalidating its own index, since
   * `extended_headers` cannot be changed once the database exists. That reasoning does not hold: a
   * dependency id is not evidence of a chain, and the two chains share every block up to 961639, so
   * nothing declared here can tell them apart. The chain is checked where it can actually be
   * checked, against the node itself, before the irreversible database is created. See main.ts.
   */
  dependencies: {
    bitcoind: {
      description: nodeDescription,
      optional: false,
      metadata: {
        title: 'Bitcoin Knots',
        icon: 'https://raw.githubusercontent.com/Start9Labs/bitcoin-core-startos/refs/heads/30.x/dep-icon.svg',
      },
    },
  },
})

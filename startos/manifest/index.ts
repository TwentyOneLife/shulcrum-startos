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
  // A web page, not a `bitcoin:` URI. The URI was tried first and StartOS renders it as dead text:
  // the About tab gives Marketing an external-link affordance and gives Donations none, because it
  // only linkifies http and https. Observed on a real install rather than reasoned about.
  //
  // The profile page carries the address, the same URI, and a QR of it, so one click reaches
  // everything a donor needs. It also means the address can be rotated without shipping a new
  // package, which a manifest field cannot do: a manifest is fixed for the life of a version.
  //
  // `instructions.md` still carries the address and QR inline, because StartOS renders that in the
  // service view and copy-paste there beats a round trip to a browser.
  donationUrl: 'https://github.com/TwentyOneLife',
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
        // Pinned to a commit, not to `refs/heads/30.x` as the template has it. `start-cli` fetches
        // this at pack time and embeds the result in the .s9pk, so a branch ref means a build that
        // reaches the network for an unpinned resource and can embed different bytes tomorrow than
        // it did today. Verified identical to what the branch serves at the time of pinning.
        icon: 'https://raw.githubusercontent.com/Start9Labs/bitcoin-core-startos/a7c9962d26cdccfee02e6bc670732ff7feb5bcc6/dep-icon.svg',
      },
    },
  },
})

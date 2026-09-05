import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

const notes =
  'First release. Packages Shulcrum, a fork of Fulcrum that serves the Bitcoin ' +
  'Blake2b chain, as an Electrum backend for a Bitcoin Knots (BLAKE2b) node. ' +
  'Requires that node to be unpruned and to carry a transaction index.'

export const current = VersionInfo.of({
  // `#blake2b` marks this as a flavor of `fulcrum` rather than a replacement for it. Upstream is
  // Fulcrum 2.1.2, which is what the number tracks.
  version: '#blake2b:2.1.2:0',
  releaseNotes: { en_US: notes },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
  // The unflavored version this stands in for. A flavored version never satisfies an unflavored
  // range directly, so without this Mempool Guide's `>=2.1.0:9` never matches and the explorer
  // stays stopped exactly as it is today. Verify at install rather than trusting the arithmetic:
  // this is the line that decides whether #14 works.
  .satisfies('2.1.2:0')

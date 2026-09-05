import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

const notes =
  'First release. Packages Shulcrum, a fork of Fulcrum that serves the Bitcoin ' +
  'Blake2b chain, as an Electrum backend for a Bitcoin Knots (BLAKE2b) node. ' +
  'Requires that node to be unpruned and to carry a transaction index.'

export const current = VersionInfo.of({
  version: '2.1.2:0',
  releaseNotes: { en_US: notes },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})

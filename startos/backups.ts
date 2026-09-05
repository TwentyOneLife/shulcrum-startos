import { sdk } from './sdk'

export const { createBackup, restoreInit } = sdk.setupBackups(
  async ({ effects }) =>
    // The index is excluded. It is derived data, rebuildable from the node, and large enough that
    // backing it up would dominate every backup this server takes.
    sdk.Backups.ofVolumes('main').setOptions({
      exclude: ['/db'],
    }),
)

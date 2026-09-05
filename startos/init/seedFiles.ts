import { confFile } from '../fileModels/fulcrum.conf'
import { sdk } from '../sdk'

export const seedFiles = sdk.setupOnInit(async (effects) => {
  await confFile.merge(effects, {})
})

import { sdk } from '../sdk'

/**
 * Empty on purpose.
 *
 * The template's two actions do not apply: there is no node picklist here (see the manifest), and
 * the config surface is fixed rather than user-tunable. Actions get added when there is something
 * a user genuinely has to decide, not to fill the file.
 */
export const actions = sdk.Actions.of()

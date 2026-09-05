export const DEFAULT_LANG = 'en_US'

/**
 * Every user-facing string this package emits, mapped to a stable index. Translations key off the
 * index, so reworded English does not silently invalidate a translation.
 */
export default {
  'Electrum (SSL)': 0,
  'The Electrum protocol endpoint, served over SSL': 1,
  'Starting Shulcrum': 2,
  'Indexing the Bitcoin Blake2b chain': 3,
  'Waiting for the Bitcoin Blake2b node': 4,
  'Fully synced': 5,
  Indexing: 6,
} as const

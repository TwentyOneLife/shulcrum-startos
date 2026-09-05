import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

const notes =
  'The donation link on the About tab now opens a page instead of rendering as ' +
  'unclickable text: StartOS linkifies only http and https, so a bitcoin URI sat ' +
  'there dead. The address and its QR are still in the instructions, where they ' +
  'can be copied without leaving the service view.'

export const current = VersionInfo.of({
  // Marks this as a flavor of `fulcrum` rather than a replacement for it. Upstream is Fulcrum
  // 2.1.2, which is what the number tracks.
  //
  // `blake` and not `blake2b`: the ExVer grammar accepts only `[a-z]` in a flavor, so a digit makes
  // the whole manifest unparseable. The failure is not obvious from the message, which reports a
  // column offset into the version string, so it is written down here rather than rediscovered.
  // The revision after the flavor is ours, not upstream's. It moves whenever this package changes
  // while Fulcrum does not, which is what stops a changed package reaching an installed instance
  // under a version string that already means something else.
  version: '#blake:2.1.2:2',
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
  // Deliberately not moved with the revision above. This names the unflavored Fulcrum version this
  // package stands in for, which is still 2.1.2:0; our own packaging revision is not upstream's.
  .satisfies('2.1.2:0')

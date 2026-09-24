import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

const notes =
  'Serves Electrum protocol 1.8, which is what a wallet needs in order to read ' +
  'headers on this chain at all. Adds blake2b_fork to server.features, so a wallet ' +
  'can learn the activation height and the header width from the server rather than ' +
  'being told them. A client that negotiated an older protocol is now refused headers ' +
  'with the reason, rather than handed 164 bytes it would read as a corrupt 80-byte ' +
  'header. Reports a confirmed transaction block id correctly, which on this chain is ' +
  'not the SHA256d of the header. The server also now reports a version that names ' +
  'this build rather than the upstream tag it derives from.'

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
  version: '#blake:2.1.2:5',
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

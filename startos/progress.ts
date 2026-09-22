/**
 * The last indexing progress Fulcrum logged in a chunk of its output, or null if the chunk holds
 * none.
 *
 * Fulcrum logs `Processed height: <n>, <p>%` every 1000 blocks while it builds, and nothing else
 * it exposes during a build carries a height: its Electrum and admin listeners stay closed until
 * the first sync completes (#29). The percentage is Fulcrum's own, against the node height it last
 * fetched.
 *
 * A chunk is whatever the pipe delivered, not a line: it can hold several lines, or cut one in two.
 * The last match wins, and the pattern needs the `%` after the percentage, so a line cut in two
 * yields no reading rather than a truncated one.
 */
export const lastProgress = (
  chunk: string,
): { height: number; percent: string } | null => {
  const matches = [
    ...chunk.matchAll(/Processed height: (\d+), (\d+(?:\.\d+)?)%/g),
  ]
  const last = matches.at(-1)
  return last ? { height: Number(last[1]), percent: last[2] } : null
}

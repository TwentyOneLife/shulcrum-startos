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

/**
 * What the Electrum port check should report.
 *
 * A closed port before it has ever opened is a build in progress, not a fault: Fulcrum opens it
 * only once the first sync completes, which can be days. Reporting that as a failure logged
 * "Health Check primary failed" every second and read as a broken service (#31). A port that
 * closes after opening is a real fault, because Fulcrum closes it only at shutdown.
 */
export const electrumResult = (
  listening: boolean,
  openedBefore: boolean,
): 'success' | 'loading' | 'failure' =>
  listening ? 'success' : openedBefore ? 'failure' : 'loading'

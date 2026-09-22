# Design: where sync-progress reads the indexed height
- **Issue:** #29, and it changes how #26 is met
- **Status:** draft

## Problem

`sync-progress` exists to describe an index build, and it reports nothing for the whole of one. It
reads the indexed height from Fulcrum's admin RPC. The first install on real hardware showed that
socket refusing connections throughout the build, alongside the Electrum port:

```
/dev/tcp/127.0.0.1/50001  Connection refused
/dev/tcp/127.0.0.1/8000   Connection refused
```

The source agrees. `Controller::startup` defers `SrvMgr`, which owns both the Electrum and the admin
listeners, until the first `upToDate` signal, "to prevent problems for clients". So the probe
fails and the check sits at `starting` with no message for a build that runs for days. Three
comments assert the opposite: two in `main.ts`, one in `utils.ts` on `adminPort`.

## Approach

Read progress from Fulcrum's own log, and take "synced" from the Electrum port.

**During a build.** Fulcrum logs `Processed height: <n>, <p>%` every 1000 blocks, to stdout. The
SDK's daemon `exec` takes an `onStdout` hook that receives that output as it arrives, so the
package keeps the last reading in memory and the check reports it. The percentage is Fulcrum's
own, against the node height it last fetched, so the package no longer asks the node for a
target. `Start9Labs/fulcrum-startos` does the same on the same SDK version, which is the evidence
this works on StartOS rather than only in principle.

**Once synced.** Fulcrum opens its Electrum port on the first `upToDate` and tears it down only at
shutdown: a lost node connection stops its timers and ZMQ notifiers and leaves `SrvMgr` running.
So a listening port is the synced signal, and it holds through a node restart. That is #26's
acceptance, that a synced index stays `success` while the node is away, met without remembering
the node's last height. The remembered target, the node probe and the clamp all go.

| State | `sync-progress` |
|---|---|
| Electrum port listening | `success`, "Fully synced" |
| Not listening, a progress line seen | `loading`, "65.3% (height 636000)" |
| Not listening, no line yet | `loading`, says progress is reported every 1000 blocks |

The last row covers every start until the first line. Fulcrum logs no height when it opens the
store, so there is nothing to seed from, and late in the chain the first line can be an hour away.
Saying so is honest and the window is bounded.

**Both streams are forwarded.** Supplying `onStdout` makes the SDK pipe stdout and stderr instead of
passing them through. Without forwarding, both vanish from the service's logs, and an unread
stderr pipe blocks Fulcrum once it fills. `Start9Labs/fulcrum-startos` forwards stdout and leaves
stderr unread; this package does not copy that.

**The parser is its own module**, `startos/progress.ts`, with no imports, so it can be tested
without the SDK. A chunk is whatever the pipe delivered: several lines, or part of one. The last
match wins, and the pattern requires the `%`, so a line cut in two gives no reading rather than a
wrong one.

**The `admin` listener is removed.** Nothing reads it now, and it is an unauthenticated control
socket. The SDK's `merge` validates through the config shape, which drops keys the shape does not
name, so an existing install loses the line on its next start with no migration.

## Alternatives considered

- **Fulcrum's stats HTTP server.** It starts as soon as the store is open and `/stats` carries
  `Header count`, the written tip plus one, so it does exist during a build. Built first and
  dropped: it adds a listener, and `/stats` is assembled on the thread that writes blocks under a
  3 second timeout, so mid-build it can answer `{"error": ...}` instead of a height. How often was
  never measured. The log has neither cost.
- **Wrap the daemon in `tee`** to reach the log. Unnecessary given `onStdout`, and it would change
  signal handling and exit status for the one process that must shut down cleanly.
- **Read the store's files.** Nothing outside RocksDB can read the height from them.
- **Report `starting` with no number** (the issue's option 3). Leaves the check blank for days when
  a real number is available.

## Risks

- **Coarse.** One reading per 1000 blocks, up to an hour apart late in the chain. Adequate for a
  build measured in days. A line the pipe splits across two chunks is lost, not delayed: the
  reading after it is the next one.
- **"Fully synced" while catching up.** Once the port is open it stays open, so a synced server
  working through a backlog after a long node outage reports synced throughout. The old check would
  have shown the gap. Accepted, because the index it serves meanwhile is correct up to its height,
  and the alternative is the node probe this design removes. `Start9Labs/fulcrum-startos` behaves
  the same.
- **The log format is an interface now.** If Fulcrum rewords the line, the check falls back to the
  "reported every 1000 blocks" message. It does not report anything wrong. The test pins the
  current wording.
- **The port as synced signal** rests on reading the source, not on watching a node restart under
  a synced instance. The live test below does that.
- No consensus or chain-selection code is touched. The chain guard and the node requirements guard
  are unchanged.

## Test plan

- **Regression, in CI.** `test/progress.test.ts`, `npm test`, fed lines verbatim from a live
  Shulcrum build: a single line, a line without a timestamp, a chunk of several lines, a
  `Block height` line that must not be read as the indexed height, a startup line, and lines cut
  across chunk boundaries.
- **Live, mid-build.** On an installed instance while it indexes: the check shows a percentage and
  height that advance, and the service's logs still show Fulcrum's output.
- **Live, synced.** The check reaches `success` once the index is caught up, and stays `success`
  while the node is stopped and restarted underneath it (#26).

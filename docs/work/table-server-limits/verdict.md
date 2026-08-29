# Verdict — table-server-limits

- **Adjudicated:** `844d8bc...HEAD` (the branch against its fork point on `main`),
  plus the working tree. The panel read `7d65328`; the code in it is `a638bad`,
  the two commits after that being `state.json` only.
- **Reviews considered:** 001-behavior, 002-correctness, 003-spec-fidelity,
  004-security, 005-simplicity, 006-test-quality. No lens missing.
- **Outcome:** ready with follow-ups
- **Test suite:** green — 106 unit (95 `unit`, 11 `worker`) and 65 behavioural,
  on macOS/Node 22.23.2 and again in `node:22-bookworm`.

## What needs a person

**Nothing is unmet and nothing is escalated.** All seven acceptance criteria are
met, and I walked each one against the code rather than against the narrative.
Four things are worth a reader's attention before this merges, none of them a
decision I withheld:

1. **The adjudication commit has been read by no lens.** The six lenses read
   `7d65328`; my fixes land after it. They are one client constant and three
   test additions, and every one of them is shown below failing against the
   behaviour it guards — but the usual second pair of eyes is not there.
2. **The beat rate the client actually ships at was wrong, and had no test.**
   It still has none of its own (follow-up F-1). What holds it is AC2's
   behavioural test, which passes at either rate.
3. **A pre-existing hole this change walks past**: an orphaned socket can still
   write the *input* of the seat it used to hold (follow-up F-2). Out of scope
   here; unreachable from a browser; reachable from the harness this change adds.
4. **Two orphaned servers from the 27 Aug build run** — a `vite preview` on 4173
   and a `wrangler dev` on 8787, both re-parented to init, both holding the
   suite's ports — were stopped so the suite could run. They were the suite's own
   leftovers, started with its `--var IDLE_TIMEOUT_MS:3000` flags; nothing of the
   user's was touched.

## Acceptance criteria

Each verified by me, independently of the reviews. "Discriminates" means I broke
the behaviour and watched the named test fail.

| AC | Met | Evidence |
|---|---|---|
| AC1 | yes | `tests/e2e/liveness.spec.ts:46` against a real wrangler dev: the seat comes back, the staying player is told, and — added here — the silent socket is hung up on with close code 4408 and the reason "no sign of life". Discriminates: with hangUp gone from dropSilent, the close assertion fails on an empty received array. `worker/tests/liveness.test.ts:73` pins the same thing in milliseconds. |
| AC2 | yes | `tests/e2e/liveness.spec.ts:85` holds two parked players for 3× the timeout: no eviction, snapshots still arriving, scores still agreeing, a third browser still turned away. `worker/tests/liveness.test.ts:90` covers the same shape unit-side; removing the markAlive call fails it. |
| AC3 | yes | `worker/limit.ts:66-69` folds case before the dotted short-circuit. Discriminates: restoring the old order fails both new cases in `tests/unit/limit.test.ts` — line 107 on the shared key, line 167 on the shared allowance. |
| AC4 | yes | `worker/tests/entry.test.ts` imports and drives `worker/table.ts` directly, as do the rematch and liveness files beside it; `worker/tsconfig.json` is what types all three with the Workers types. Both passes of tsc --noEmit — root and worker — exit 0 with them present, the one added here included. |
| AC5 | yes | `worker/tests/entry.test.ts`. Discriminates as the plan claims: hoisting the namespace lookup above the two door checks fails exactly 3 of the 5 cases, on "expected [ johnny ] to deeply equal []". |
| AC6 | yes | `worker/tests/rematch.test.ts`. Discriminates: deleting the seat-ownership guard from Table.rematch fails it. |
| AC7 | yes | Full suite green, both platforms. Every edit to a pre-existing test file since 844d8bc is an addition — the diff over `tests` and `worker/tests` has three deleted lines, all doc-comment prose in `tests/e2e/support/table.ts` — and no test is skipped, focused, marked todo or marked fixme anywhere in either tree. |

## Dispositions

| Finding | Lens | Severity | Disposition | Reasoning |
|---|---|---|---|---|
| F1 | behavior | minor | **Accepted** | Confirmed, and measured on the built bundle. The guard `now - lastSpokeMs < HEARTBEAT_INTERVAL_MS` on a `setInterval` of the same period throws away every tick that lands a hair early. Before: 11 beats in 20 s, median gap 1999 ms. After: 20 beats, gaps 999–1001 ms. Fixed in `src/net/table.ts:142`. |
| F1 | simplicity | minor | **Accepted** | Confirmed: `FakeSocket.closes` was written and never read, and its doc comment claimed assertions were written against it. Taken the second of the two directions the lens offered — given a reader rather than deleted — because the assertion it looks like it exists for is the one AC1 was missing. |
| F2 | simplicity | nit | **Rejected** | The duplication is real (9 lines, `limiter()` in `tests/unit/limit.test.ts:10` and `worker/tests/entry.test.ts:58`) but the failure scenario does not hold. Both copies are annotated `RateLimiter & { keys: string[] }`, so a change to `RateLimiter.limit`'s shape fails *both* at compile time rather than letting one drift — which is the drift the finding predicts. Against that, the suggested fix has the browser project import test support out of `worker/tests/`, which is the boundary the two-project split exists to keep. |
| F1 | test-quality | major | **Accepted** | Confirmed by mutation: with `hangUp(socket)` removed from `Table.dropSilent` (and the now-unused function with it, which the build's `noUnusedLocals` requires), the whole suite stayed green — 106 unit, and the AC1 behavioural test passing. A killed tab's socket would never be closed and the object would stay resident and billed, which is the hazard the plan's *Intent* names. Now covered twice. |
| F2 | test-quality | major | **Accepted** | Confirmed by mutation: deleting `if (message.kind === 'alive') { return; }` from `worker/table.ts:146` left the suite green. The handler falls through to `rematch` for anything that is not `input`, so a heartbeat would restart a finished game within one second of it ending, for both players. |
| F3 | test-quality | minor | **Accepted** | Confirmed by mutation: dropping the seat check from `markAlive` left the suite green. An orphaned socket that kept beating would refresh the deadline of whoever holds its old seat, so that seat could never be taken back — the failure the timeout exists to prevent, with nothing red. |

Reviews 002 (correctness), 003 (spec-fidelity) and 004 (security) reported clean.
I re-ran the checks each of them leaned on rather than taking them on trust; all
three hold, including 003's own stated gap — the `node:22-bookworm` run it could
not verify, which I have now done.

## Changes applied

- `src/net/table.ts:25-37, 142` — beat when the tick is *nearly* due rather than
  fully due, via a named `BEAT_DUE_MS` of half the interval. (behavior F1)
- `worker/tests/liveness.test.ts` — new, four cases: the table hangs up with
  `4408` and gives the seat back (test-quality F1, simplicity F1); a socket that
  beats keeps its seat; a beat is not a rematch (test-quality F2); a beat from a
  socket whose seat somebody else now holds moves nobody's deadline
  (test-quality F3).
- `tests/e2e/liveness.spec.ts:70-72` — AC1 now also asserts the silenced page saw
  `4408:no sign of life`, which is the half of AC1's own sentence — "the table
  closes it" — that nothing observed. (test-quality F1)

Every one of these was watched failing against the behaviour it guards:

| Break | What fails |
|---|---|
| `hangUp` gone from `dropSilent` | `liveness.test.ts:83` and `:143`, and the behavioural AC1 |
| the `alive` arm deleted | `liveness.test.ts:103` and `:117` |
| the seat check gone from `markAlive` | `liveness.test.ts:143` |
| `markAlive` not called at all | `liveness.test.ts:97` |
| the silence timer never armed | `liveness.test.ts:83` and `:143` |

## Escalations

<!-- None. Nothing in this change turned on a decision that was not already made
     in the plan, and the build left no PLAN DEFECT note. -->

## Follow-ups

Real, and none of them this change's job.

- **F-1 — the beat rate has no test of its own.** What now holds the client to
  one beat a second is a constant and a comment; AC2's behavioural test passes at
  one beat a second and at one every two. `src/net/` has no unit tests at all —
  `joinTable` needs `window` and a socket stubbed — so this is a small new test
  surface rather than a case to add, which is why it is not here.
- **F-2 — an orphaned socket can still set the input of a seat it no longer
  holds.** `worker/table.ts:143` writes `this.inputs.set(slot, message.input)`
  without the seat check that `markAlive` (`:306`) and `rematch` (`:226`) both
  have. Pre-existing — the line predates this change — and unreachable from a
  browser for the same reason AC6's check is: a real socket that errors is gone.
  I confirmed it *is* reachable through the harness this change adds: after
  `left.peer.fail()` and a new arrival, a message from the old socket lands in the
  new occupant's input and steers their paddle. One line, the same guard, and a
  case in `worker/tests/rematch.test.ts` would close it.
- **F-3 — the IPv6 hex-form bucket.** `::ffff:c000:201` truncates to the same
  `0:0:0:0` network as every other hex-written mapped address, so they would share
  one allowance. Pre-existing and untouched here; not caller-controllable, since
  `CF-Connecting-IP` is written by the edge. Recorded by 004-security and repeated
  here so it is not lost with the review file.
- **F-4 — WebSocket hibernation**, already the plan's first *Non-goal* and still
  the answer to a client that answers the heartbeat and holds a table anyway.
  This change reclaims the abandoned table, not the held one.
- **F-5 — `wrangler dev` logs `Uncaught Error: Network connection lost.`** during
  the networked specs. Confirmed not from this change (it appears running
  `tests/e2e/table.spec.ts` alone), no test depends on it, and it is noise in
  every suite run.

## Notes on method

- The suite recipe came from `.github/workflows/regression-tests.yml`, which is
  what gates merges: `npm ci`, `playwright install chromium`, `npm run build`,
  `npm run test:unit`, `npm run test:e2e`, on the Node in `.nvmrc` (22).
- Mutation checks ran against copies in a scratchpad, except the two that needed
  the real servers; those were applied to `worker/table.ts` and reverted with
  `git checkout --` immediately after. The working tree carries only the three
  changes listed above.
- The `node:22-bookworm` container is arm64 where CI is amd64 — the same caveat
  the last four work items recorded.

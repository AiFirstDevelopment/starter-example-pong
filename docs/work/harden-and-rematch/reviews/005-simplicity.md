# Review 005 — simplicity

- **Lens:** simplicity
- **Verdict:** findings
- **Diff range:** 17af241...HEAD

## Findings

### F1 — minor

**Claim:** Three `watchStatus` calls in the new rematch spec record a history that no assertion in the file ever reads.

**Location:** `/Users/joelstevick/projects/starter-example-pong/tests/e2e/rematch.spec.ts:92`

**What:** `watchStatus(first.page)` and `watchStatus(second.page)` at lines 92-93 (AC1) and `watchStatus(first.page)` at line 128 (AC2 mid-rally) install a MutationObserver on `#status` and reset `window.__statuses`. The file never imports or calls `statusesSeen` — every status assertion in it (lines 102, 103, 146, 187, 188) goes through `statusOf`, which reads the live DOM directly.

**Failure scenario:** Run `AC1: either player starts another game once one has been won`. Line 92 evaluates a script in the page that allocates `__statuses`, pushes the current line and attaches an observer; the array is then discarded. Deleting lines 92, 93 and 128 changes the outcome of no assertion in the file. Meanwhile a reader who compares this with tests/e2e/table.spec.ts:374 — where `watchStatus` is paired with `statusesSeen` to assert a winner line appeared and was then taken back — will read these calls as evidence that the rematch spec asserts the winner line's history. It does not: it only polls the line as it stands now, so a run in which the winner line was never shown at all would still be green at lines 102-103, and the vestigial `watchStatus` hides that gap rather than closing it.

**Suggested direction:** Either delete the three `watchStatus` calls, or make them load-bearing the way the adjacent `watchScore` calls at lines 90-91 are — assert on `statusesSeen(first.page)` so AC1 proves the winner line was shown and then withdrawn, rather than only that it is absent now.

### F2 — minor

**Claim:** The `AC2: a browser holding no seat cannot start a game` test duplicates an existing test's setup and assertions and cannot reach the branch it is named for.

**Location:** `/Users/joelstevick/projects/starter-example-pong/tests/e2e/rematch.spec.ts:153`

**What:** Lines 153-193 re-do the arrangement of tests/e2e/table.spec.ts:113-148 (two pages join, both paddles parked at top, poll until the score leaves 0-0, a third page joins and is told the table is in use, then assert the two players' score history and empty status line) and add `say(third.page, {kind:'rematch'})` plus a key press. Neither of those can reach `Table.rematch`: in worker/table.ts's `fetch`, a socket that gets `slot === null` is sent `refused` and closed immediately, and `seat()` — the only place `addEventListener('message', ...)` is registered — is never called for it. On the browser side the socket is CLOSED, so `__say`'s `socket.send` discards the data and `table?.rematch()` in src/main.ts:160 returns at its `readyState !== OPEN` guard.

**Failure scenario:** Delete the seat check `if (this.seats.get(slot) !== socket) { return; }` at worker/table.ts:200 and re-run the suite: this test is still green, because nothing it sends ever crosses the wire to the Durable Object. The test therefore spends a third browser context and a real rally to assert only what table.spec.ts:113 already asserts — that a refused browser does not disturb the game in progress — while presenting itself as the guard on the seat check.

**Suggested direction:** Either drive the seat check where it is reachable — a seated page whose socket is vacated (close/error) and whose seat is then taken by a new socket, or a unit-level test of `Table.rematch` — or drop the test and fold its one extra gesture into the existing table.spec.ts refusal test. If it is kept as-is, the shared 12-line preamble with the AC2 mid-rally test above it (join two, park, poll off 0-0, watchScore, sleep, assert monotonic totals) is worth lifting into one helper in tests/e2e/support/table.ts, since the same preamble now appears four times across table.spec.ts, rematch.spec.ts (twice) and entry.spec.ts.

## Notes

Production diff (worker/limit.ts, worker/origins.ts, worker/table.ts, src/net/protocol.ts, src/net/table.ts, src/main.ts, worker/wrangler.toml, README.md) is clean under this lens: no duplicated logic, no dead branch left behind (the now-unreachable `seats.size === 2` branch in simulateAndBroadcast was removed rather than kept), and the new modules reuse the repo's existing shapes (`isRecord`, the `switch (parsed.kind)` form from `parseServerMessage`, the pure-function-plus-unit-test pattern from `worker/slots.ts`). Both findings are in the new e2e specs.

# Review 006 — test-quality

- **Lens:** test-quality
- **Verdict:** findings
- **Diff range:** 844d8bc...HEAD

## Findings

### F1 — major

**Claim:** AC1's other half — that the table *closes* the silent socket — is asserted nowhere, so the socket that holds the Durable Object resident can stop being closed with the suite still green.

**Location:** `tests/e2e/liveness.spec.ts:54`

**What:** The AC1 spec asserts only what `vacate` produces: the staying player's status line and a third browser taking the freed paddle. Nothing observes that the abandoned socket was hung up, and no test anywhere references SILENT_CLOSE_CODE or 4408 (grepped across src/, tests/, worker/).

**Failure scenario:** Verified by mutation: in a scratchpad copy I removed `hangUp(socket)` from `Table.dropSilent` (worker/table.ts:366) along with the now-unused `hangUp` function, rebuilt, and ran `npx playwright test tests/e2e/liveness.spec.ts --project=chromium` — 2 passed (18.8s); `npx vitest run` also stays 102/102. With that mutation a killed tab's socket is never closed, so workerd keeps the connection — and therefore the Durable Object — resident and duration-billed for as long as the TCP connection survives, which is the precise hazard the plan's Intent names. The suite reports success.

**Suggested direction:** In the AC1 test, after the opponent-left poll, assert the silenced page's socket was closed with the code that means silence: `await expect.poll(() => socketCloses(leaving.page)).toContain('4408:no sign of life')` (`socketCloses` is already exported from tests/e2e/support/table.ts and the shim records every close, so the muted page still observes the server's close frame).

### F2 — major

**Claim:** The new server-side `alive` branch has no discriminating test: treating a heartbeat as a rematch request leaves the entire suite green.

**Location:** `worker/table.ts:146`

**What:** `tests/unit/protocol.test.ts` covers only that `parseClientMessage` reads `{kind:'alive'}`; nothing covers what `Table` does with it. The handler falls through to `this.rematch(slot, socket)` for anything that is not `input` or `alive`, so the early return at line 146 is the only thing stopping a heartbeat from starting a game.

**Failure scenario:** Verified by mutation: deleting the three lines `if (message.kind === 'alive') { return; }` gives `npx vitest run` 102/102 passed and `npx playwright test tests/e2e/rematch.spec.ts tests/e2e/liveness.spec.ts --project=chromium` 5/5 passed (1.9m). The resulting behaviour: a game reaches game-over, and the next heartbeat — at most one second later, from either seated browser — reaches `rematch`, `startGame` returns a fresh state, and both browsers lose the winner line and start a new game that nobody asked for. rematch.spec AC1 cannot see it because an auto-restart and a Space-triggered restart leave identical score and status histories.

**Suggested direction:** Add a case to worker/tests/rematch.test.ts using the harness that already exists: seat one socket, send `{kind:'alive'}`, and assert the client end still has only `['welcome','opponent','snapshot']`. I ran exactly that case against both versions — it fails on the mutant (a fourth `snapshot` arrives from `startGame` on the idle game) and passes on the code as written.

### F3 — minor

**Claim:** The seat guard in `markAlive` is uncovered, though it is the same class of check AC6 was written to pin down and the harness to reach it already exists.

**Location:** `worker/table.ts:307`

**What:** `markAlive` returns early when `this.seats.get(slot) !== socket`. worker/tests/rematch.test.ts constructs precisely the arrangement that guard is for — a socket whose seat was freed by a server-end `error` while its client end can still speak — but never sends a message that would exercise the stamping path.

**Failure scenario:** Verified by mutation: dropping the check (stamping unconditionally) leaves `npx vitest run` at 102/102. With it gone, an orphaned socket that keeps sending refreshes `heardMs` for the seat's *new* occupant; if that occupant's tab is then killed, every silence check finds the seat freshly heard from, the seat is never taken back, and the table stays held — the exact failure the timeout was added to prevent, with nothing red.

**Suggested direction:** Extend the existing 'ignores a socket whose seat somebody else now holds' case: after `left.peer.fail()` and the new arrival, have `left` send `{kind:'alive'}` and assert the table still evicts the new occupant on schedule (vi.advanceTimersByTime past the liveness timeout, then assert the arrived socket was closed and its seat freed).

## Notes

Method: mutation-tested a `git archive HEAD` copy in the scratchpad (node_modules symlinked, ports moved to 4211/8811 with a matching ALLOWED_ORIGINS entry so the copy's e2e could run without disturbing servers another process is running on 4173/8787). Baseline in the copy: liveness spec 2 passed (21s), unit 102/102, both tsc passes clean. Confirmed as genuinely discriminating: AC5 (hoisting `env.TABLE.get(env.TABLE.idFromName(tableId))` above the door checks fails 3 of the 5 entry cases), AC6 (deleting the `rematch` seat guard fails rematch.test.ts), AC3 (reverting the fold order fails the two new limit cases — the plan's recorded messages match), and AC2's client heartbeat (making the interval callback a no-op fails liveness AC2 on `Lost the connection to table …`). No flakiness defect found: Playwright launches Chromium with background-timer throttling disabled, the AC1 poll gives 10s for a 5s deadline, and AC2's snapshot counters are monotonic and unaffected by the game reaching game-over during the 15s wait. The working tree was not modified.

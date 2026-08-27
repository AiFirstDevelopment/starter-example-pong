# Review: test-quality

- Lens: test-quality
- Verdict: findings
- Diff range: f8ffd2b...HEAD

## Notes

Scope reviewed: tests/e2e/table.spec.ts, tests/e2e/choose.spec.ts, tests/e2e/support/table.ts, tests/unit/{protocol,session,slots,status,step}.test.ts, plus the client/worker code they exercise. Verified that the existing e2e wall (replay, mouse, touch, scoring, collisions, court, smoothness, sound-control) is untouched by the diff and that the two edited unit files are additive only, so AC2's "no assertion weakened" holds. AC3/AC4/AC5/AC6/AC8 assertions were traced against src/main.ts, src/net/table.ts and worker/table.ts and are sensitive to the behaviour they guard. AC3's 2500 ms fixed sleep was checked and is safe: with both paddles parked at the top a serve at the steepest angle (20 deg) reaches the paddle plane at court y ~107 against a strike window of y <= 87, so a point lands every ~1.94 s and the first arrives ~1.14 s after the game starts, well inside the sleep. Both findings are in the AC7 test.

## Findings

### F1

- Severity: minor
- File: tests/e2e/table.spec.ts
- Line: 190

**Claim:** AC7 captures the 'abandoned' score while the rally is still running, then spends two browser-context creations before disconnecting the players, so the score it later requires an exact match on can be stale.

**What:** The reference score for the 'come straight back and find the same game' half of AC7 is read at a point where both players are still seated and both paddles are parked at the top, so points keep being scored until first.close()/second.close() land.

**Failure scenario:** With both paddles parked at the top, worker/table.ts steps the game continuously and a point lands every ~1.94 s (SERVE_DELAY_MS 800 ms + ~1.14 s of travel at BALL_SPEED 380 across 407 px, verified against src/game/state.ts). expect.poll's default probe schedule is 100/250/500/1000 ms, so the poll on line 187 can report the first score change up to ~1 s after it actually happened; `abandoned` is then read as e.g. '1-0' with only ~0.9 s left before the next point. The test then performs two browser.newContext()+newPage() calls and two context.close() calls. If those exceed the remaining budget the score reaches '2-0' before the last socket closes, the table freezes at '2-0', and `await expect.poll(() => scoreOf(soon.page), { timeout: CONVERGE_MS }).toBe(abandoned)` on line 204 polls a value that can never change for the full 8 s and fails — a spurious red on a correct implementation, in an unattended pipeline with retries: 0.

**Suggested direction:** Freeze the game before sampling: close `first` (which drops seats.size to 1 and stops the ball in worker/table.ts:193) and only then read `abandoned` from the still-open `second.page`, before closing it. That makes the reference score unambiguously the score the table was abandoned at, with no real-time window to lose.

### F2

- Severity: major
- File: tests/e2e/table.spec.ts
- Line: 221

**Claim:** AC7's core assertion — that a timed-out table starts over at 0-0 — can be evaluated before the first server snapshot reaches the page, so it reads the 0-0 that index.html ships in its own markup and passes even if the idle timeout never discarded the game.

**What:** The preceding poll waits only for the welcome-driven status line, not for any snapshot. `expect(await scoreOf(later.page)).toBe('0-0')` is an un-polled, un-gated read taken immediately afterwards.

**Failure scenario:** In worker/table.ts, seat() sends {kind:'welcome'} and {kind:'opponent'} synchronously and then calls startLoop(), whose setInterval fires the first snapshot SNAPSHOT_INTERVAL_MS (33.3 ms) later. src/main.ts sets connection='waiting' on the welcome, so #status reads 'You have the left paddle. Waiting for another player at table X.' at welcome+~0 ms. The poll's first probe runs immediately after enterTable() returns and can match there; the following scoreOf() read completes a few CDP round trips later — inside the 33 ms gap — and returns the '0' / '0' hard-coded in index.html (#player-score / #cpu-score). Concretely: delete `this.game = createState(Date.now() | 0)` from startIdleTimer in worker/table.ts, so an abandoned 3-0 game survives the timeout; `later` then receives a 3-0 snapshot at +33 ms, but this assertion has already passed on the markup value and AC7 stays green. The build note acknowledges the markup-0-0 trap for a browser that never got in, but the same trap remains for a browser that got in and has not yet been sent a snapshot.

**Suggested direction:** Gate on server data having arrived before asserting the value. Either have the socket shim in tests/e2e/support/table.ts count received 'snapshot' frames and poll for count >= 1 before reading the score, or assert on something only a snapshot can produce (e.g. poll scoresSeen(later.page) until the page has re-rendered a server score) and only then require '0-0'.

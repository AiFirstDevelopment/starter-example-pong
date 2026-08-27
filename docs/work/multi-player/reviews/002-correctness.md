# Review: correctness

- Lens: correctness
- Verdict: findings
- Diff range: f8ffd2b...HEAD

## Notes

Verification performed: read plan and full diff; `npm run test:unit` (74 pass) and `npm run build` (tsc app + tsc worker + vite build) both green; started the real Durable Object under `wrangler dev` on port 8799 and drove it with two/three/four real WebSocket clients to confirm slot assignment (left/right), refusal (message + close 4409), disconnect freeing a seat with the score intact, and the game-over freeze in F1. Working tree left clean; the wrangler process was killed and probe files kept in the scratchpad. Checked and found correct: `assignSlot`, the `seats.get(slot) !== socket` vacate guard, `readIdleTimeout` fallbacks, `discardIfIdle` vs `startIdleTimer` interaction, `parseClientMessage` rejecting `1e999`/non-boolean/missing fields, `normaliseTableId` trim+cap and the `?table=` encode/decode round trip through `URLSearchParams`, `interpolate` returning a fresh object so `drawn.playerY = ownY` cannot mutate the server snapshot, the local-echo resync branch against `input.ts`'s sticky `targetY`, `report()`'s change+rate gate, and `.choose[hidden] { display: none }` keeping the chooser out of the layout for `?seed=` pages. Out of lens but noticed: README says the suite's table server uses a \"two-second idle timeout\" while `TEST_IDLE_TIMEOUT_MS` is 3000.

## Findings

### F1

- Severity: major
- File: worker/table.ts
- Line: 123

**Claim:** A table game that reaches WINNING_SCORE freezes permanently: nothing can restart it while both players stay connected.

**What:** `startGame()` is reached only inside `seat()`, and only when an arriving socket takes the second seat. `step()` returns the state unchanged for `phase === 'game-over'` (src/game/step.ts:126), and the client cannot ask for a new game either — `start()` returns early unless `session.mode === 'single'` (src/main.ts:127). So the terminal phase has no exit while the two seats are held.

**Failure scenario:** Verified against a real `wrangler dev` running the real Durable Object: two WebSocket clients joined one table id and both parked their paddles at targetY 0. The score ran to 11-7 and the broadcast phase became `game-over`. Eight seconds later the broadcast state was byte-identical — `{"score":{"player":11,"cpu":7},"ball":{"x":400,"y":240,"vx":0,"vy":0},"phase":"game-over"}` — and a third socket opened at that moment was still refused with close code 4409. Both players are stuck: the ball never moves again, and their status line reads only "You win!" / "Your opponent wins!" with no instruction, unlike single player's "…Press any key to play again". Only when one of the two disconnected and a new socket arrived did `startGame` fire and play resume at 0-0. Two people who finish a game therefore have to reload to play another.

**Suggested direction:** Give the table an exit from `game-over` that does not require a disconnect — e.g. a client `start`/`rematch` message (or treating any input while `phase === 'game-over'` as a request to play again, once both seats agree) that calls `startGame` — and have `tableStatusText` say how to do it, the way `statusText` does for single player.

### F2

- Severity: minor
- File: src/main.ts
- Line: 266

**Claim:** `onSnapshot` never refreshes the status line, so a surviving player plays an entire rematch with the previous game's winner still announced under the court.

**What:** `showStatus()` is called from `onWelcome`, `onOpponent`, `onRefused`, `onLost` and from `handle()` on a `game-over` event, but not when a snapshot changes `state.phase`. `tableStatusText`'s `playing` branch depends on `state.phase`, so the line can go stale.

**Failure scenario:** Player A and B play to 11; A's status is set to "You win!" by the game-over event (src/main.ts:152). B closes their tab, so A shows "Your opponent left. Waiting for another player at table X.". C then joins: the server sends A `{kind:'opponent',present:true}` at worker/table.ts:119 *before* it calls `startGame` at line 123, so A's `showStatus()` runs while the module-level `state` is still the game-over snapshot and prints "You win!" again. Every subsequent snapshot (phase `serving`/`rally`, score 0-0 — confirmed live: after the new player joined the table went straight to `phase serving` with score 0-0) updates the scoreboard via `showScore()` but never the status, and no further `game-over` event fires until the new game ends. A plays the whole rematch with "You win!" printed under a 0-0 court.

**Suggested direction:** Call `showStatus()` from `onSnapshot` when `next.phase` differs from the previously held phase — guarded on the change rather than unconditionally, since `#status` carries `role="status"` and rewriting it 30 times a second would spam a screen reader for the same reason `showScore()` is guarded.

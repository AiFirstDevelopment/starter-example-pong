# Review: correctness

- **Lens:** correctness
- **Verdict:** findings
- **Diff range:** 4644a71...HEAD

## Notes

Verified by reading the whole diff, running tsc --noEmit (clean) and vitest (23/23 green), and independently re-simulating main.ts's fixed-timestep loop against the shipped game modules (bundled with esbuild into the scratchpad; the repo tree was not modified). That simulation confirms AC3 (seed 1: CPU returns the first serve at frame 63), AC7 (seed 1: cpu scores at frame 192; seed 2: player scores at frame 740), and AC8 (seed 1 vs an idle player: 11-0 game-over at frame 2251, inside the AC8 test's 3600-frame budget), so the behavioural suite's expectations match the code. Also checked and found sound: paddle hit-test window is 26 px against <=3.2 px of travel per substep (no tunnelling, including after the 250 ms accumulator clamp); the AABB+radius overlap test is symmetric so there is no false save from behind a paddle; no vertical escapes across 400 simulated 300 s games; score/state objects are copied before mutation; state is assigned before events are handled in main.ts:113-116. Deliberately not reported: very long rallies against a perfectly-tracking player (inherent to Pong with no rally speed-up, an explicit non-goal); new AudioContext() throwing inside start() before startGame (no reachable trigger for a page that creates one context); Space on the focused mute button both starting the game and toggling mute (no AC violated).

## Findings

### F1 — minor

**Claim:** A ball that strikes a paddle and a wall in the same tick has its wall reflection silently overwritten by the paddle bounce, sending it back into the wall and playing both sounds at once.

**Location:** `src/game/step.ts:130`

**What:** The wall block (lines 109-117) flips ball.vy and clamps ball.y, then bounceOffPaddle (lines 66-78) recomputes vy purely from the paddle contact offset, discarding the reflection just applied. The wall-hit event is still pushed, so a paddle strike also produces a wall sound.

**Failure scenario:** Reproduced by re-simulating the shipped step() outside the repo: seed 2 with a ball-tracking player, tick 12498. Incoming ball {x: 45.79, y: 472.86, vx: -377.6, vy: +42.3} with the player paddle clamped at playerY = 400. The tick emits [wall-hit bottom, paddle-hit player] together, and the ball leaves with vy = +250.6 -- downward, into the floor it just bounced off -- so the very next tick emits a second wall-hit. AC4 states 'No wall sound and no out-of-play sound occur at that moment.' 26 such ticks occurred across 400 simulated games of 300 s.

**Suggested direction:** After a paddle bounce, re-apply the wall constraint (e.g. force vy away from the wall when the ball is sitting at y == BALL_RADIUS or COURT_HEIGHT - BALL_RADIUS), or resolve the paddle collision before the wall so the wall reflection is the one that survives, and suppress the redundant wall event for the same tick.

### F2 — minor

**Claim:** Keyboard state is tracked by event.key, whose case changes with shift/caps state, so a movement key can remain stuck down for the rest of the session.

**Location:** `src/input.ts:47`

**What:** onKeyDown stores event.key ('w' or 'W') in the held set and onKeyUp deletes event.key. If the shift or caps-lock state changes between the two events, the keyup carries the other case and the keydown entry is never removed.

**Failure scenario:** Player holds 'w' to move up (held = {'w'}), presses and releases Shift while still holding it (or toggles Caps Lock), then releases 'w'. The keyup arrives with key === 'W', so held.delete('W') removes nothing and held still contains 'w'. input() returns {up: true} on every subsequent frame: the paddle drives to the top edge and stays there. Pressing ArrowDown then gives up && down, so playerDirection = 1 - 1 = 0 and the paddle freezes entirely until the window is blurred. AC2's 'holding ArrowUp/W moves the player paddle up' no longer holds for the rest of the game.

**Suggested direction:** Track event.code ('KeyW', 'KeyS', 'ArrowUp', 'ArrowDown') instead of event.key, or normalise event.key to lower case on both add and delete.

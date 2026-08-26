# Review: correctness

- **Lens:** correctness
- **Verdict:** findings
- **Diff range:** 48e080f...HEAD

## Findings

### F1 — interpolate's phase guard suspends interpolation for the paddles as well as the ball, so a held movement key produces a 4-5 px frame-to-frame variation on every score and every serve, violating AC5's "never varies by more than one pixel".

- **Severity:** major
- **Location:** `src/render.ts:46`

**What**

The early return `if (previous.phase !== current.phase) return current;` is justified in its own comment by the ball being teleported to the centre spot, which is correct. But it discards interpolation for playerY and cpuY too, and neither paddle teleports across a phase change - both move continuously through rally->serving and serving->rally. On such a frame the paddle is drawn at the full last tick rather than at previous + alpha*delta, gaining (1-alpha) of a tick and giving it straight back on the following frame.

**Failure scenario**

Load /?seed=7, press Space, park the paddle high with the mouse, then hold ArrowDown and read the player paddle's top off the canvas frame by frame under Playwright's 16 ms clock. Steady state is 6 or 7 px per frame. On the frame the computer scores (cpuScore flips to 1) the paddle top jumps 9 px, and the next frame it moves 5 px. On the frame the next ball is served (serving->rally) it jumps 9 px and then moves 4 px. Consecutive frame steps therefore differ by 4-5 px where AC5 requires at most 1 px "for as long as the key is held", and a held key spans scores and serves. The same mechanism shifts cpuY by up to 1.33 px on those frames, against AC8's "no visible stutter introduced ... by the smoothing work". It fires twice per point, roughly 40+ times in a game to 11. The suite misses it because tests/e2e/smoothness.spec.ts:33 holds the key for 22 frames inside a rally and the AC8 cpu check samples hit+3..hit+36 after a paddle strike, so neither window contains a phase change.

**Suggested direction**

Cut only the thing that is actually cut. Interpolate playerY and cpuY unconditionally and scope the phase guard to the ball alone, e.g. `ball: previous.phase === current.phase ? {...current.ball, x: mix(...), y: mix(...)} : current.ball`. The seed-7 smear test at tests/e2e/smoothness.spec.ts:82 only asserts about the ball, so it keeps working; consider extending the AC5 test to hold the key across a scored point.

## Notes

Verified against the running app, not just by reading. Full suite is green (38 Vitest, 25 Playwright). Probes I ran that came back clean, so they are not reported: mouse-driven tracking is even (constant 7 px/frame under a smoothly moving pointer, because both ticks of a 2-tick frame share one targetY sample); alpha is always in [0,1) since MAX_FRAME_MS (250) > FIXED_DT_MS (8.33) and the while loop drains the accumulator; previousState is always exactly one tick behind state, including on 0-tick frames and when start() mutates state between frames; courtY's border error is bounded at ~1 court px as the build notes claim; the box.height <= 0 NaN guard is real; interpolate never feeds back into the simulation. The "a held movement key does nothing after any mouse move until it is released and re-pressed" behaviour (src/input.ts:97) is a live tension with AC4's closing clause "a stationary mouse never fights a held key", but it is documented in the plan, deliberately implemented and explicitly asserted by tests/e2e/mouse.spec.ts:186; I left it to the spec-fidelity lens rather than report it as a correctness defect.

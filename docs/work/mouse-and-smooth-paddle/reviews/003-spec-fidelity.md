# Review: spec-fidelity

- **Lens:** spec-fidelity
- **Verdict:** findings
- **Diff range:** 48e080f...HEAD

## Findings

### F1 — The phase guard in `interpolate` draws the paddles un-interpolated on serve and score frames, so a held movement key produces a 4 px frame-to-frame jerk — AC5 allows at most 1 px.

- **Severity:** major
- **Location:** `/Users/joelstevick/projects/starter-example-3/src/render.ts:46`

**What**

`if (previous.phase !== current.phase) return current;` short-circuits the whole state, not just the ball. On the frame whose last tick changes phase (every serve, every point, game over), the paddles are drawn (1 - alpha) of a tick ahead of the smooth path — up to 3.5 px for the player at PADDLE_SPEED 420, 1.33 px for the CPU — so the frame step into that frame is long and the step out is short.

**Failure scenario**

Verified against the built app (npm run build + vite preview), Playwright clock at 16 ms/frame, `/?seed=7`, Space to start, ArrowDown held from frame 100. The drawn player paddle top (same column-30, >200 threshold reading `paddleAt` uses) is 331, 338, 347, 352 on frames 119-122, i.e. steps of 7, 9 and 5 px around the serving->rally transition at frame 121, against a steady 6.72 px elsewhere. AC5 says the distance moved between one frame and the next "never varies by more than one pixel for as long as the key is held"; here consecutive steps differ by 4. `tests/e2e/smoothness.spec.ts:55` asserts exactly this (`unevenness(steps) <= 1`) but records only 22 mid-rally frames, so it never samples a serve or a point and passes. Simulating the real loop with the compiled `step`/`interpolate` over seeds 1-30 gives 344 phase-change frames, 323 of them two-tick frames, with player displacement up to 3.36 px (seed 23, frame 2461, alpha 0.04) and CPU displacement up to 1.28 px. In a game to 11 this hitch lands ~2x per point. It is introduced by the smoothing work, which AC8 also forbids ("no visible stutter introduced ... by the smoothing work"). The Build notes' S5 deviation justifies the guard for the ball only and does not mention that it also cuts the paddles.

**Suggested direction**

Snap only what is actually cut. Across a phase change keep `playerY`/`cpuY` interpolated and take the ball from `current`, e.g. return `{ ...current, playerY: mix(previous.playerY, current.playerY, alpha), cpuY: mix(previous.cpuY, current.cpuY, alpha) }`. Then extend the AC5 recording window (or add a case) so it spans a serve, which would currently fail.

### F2 — The Build notes' evidence for the S5 phase guard is factually wrong: the smear does not only appear on single-tick frames, and seed 1 does not hide it.

- **Severity:** minor
- **Location:** `/Users/joelstevick/projects/starter-example-3/docs/work/mouse-and-smooth-paddle/plan.md:322`

**What**

"It only shows on frames that run a single tick, which is why seed 1 (the seed most of the suite uses) happens to hide it." The guard fires whenever the phase changes on the *last* tick of a frame, which under the 16 ms clock is overwhelmingly a two-tick frame (323 of 344 measured across seeds 1-30).

**Failure scenario**

Replaying main.ts's loop against the compiled `step`/`state` for seeds 1-10: every first-point frame runs two ticks, with alpha from 0.12 to 0.88. With the guard removed the unguarded draw puts the ball at x = 108.8 (seed 1), 351.3 (seed 2), 253.5 (3), 44.2 (4), 318.9 (5), 220.9 (6), 124.8 (7), 741.5 (8), 156.7 (9), 205.2 (10). The three numbers the note quotes reproduce exactly, but all on two-tick frames, and seed 1 smears just as badly — the real reason seed 1 is not used for the guard test is that its first point lands at frame 433, outside the 90-frame recording, whereas seed 7 loses one at frame 70. A maintainer trusting the note could restrict the guard to single-tick frames and reintroduce the smear on essentially every point.

**Suggested direction**

Correct the note: the guard is needed whenever a phase change lands on the final tick of a frame (mostly two-tick frames); seed 7 is used because its first point comes early enough to be recorded, not because seed 1 is immune.

## Notes

Verified rather than assumed:

- Claims C1-C6. C2 true (`canvas { width: 100%; height: auto }` plus `* { box-sizing: border-box }` in /Users/joelstevick/projects/starter-example-3/src/style.css). C3 true in substance, though the plan's "alternates between one and two [ticks]" and "3.5 px, then 7 px, then 3.5 px" is loose: under the 16 ms clock the ratio is 48 ticks / 25 frames, so 23 frames in 25 run two ticks and 2 run one. The build notes already restate it correctly ("twelve out of thirteen"), and the judder premise holds, so I did not raise it. C5 and C6 hold as far as the suite can show (mouse.spec AC2 and AC6 pass against the real event path).
- Both PLAN DEFECT escalations hold up. C1: main.ts really does now pass `court` into `createControls` (/Users/joelstevick/projects/starter-example-3/src/main.ts:91); no AC is affected. C4: the inserted `await runFrames(page, 2)` at /Users/joelstevick/projects/starter-example-3/tests/e2e/court.spec.ts:109 is not a weakening — after release `held` is empty and `targetY` is null, so `step` moves the paddle by zero during those frames, and the paddle is clamped at top 0 both before and after the edit. The note's own admission that the assertion compares 0 with 0 (and did before this change) is accurate.
- Non-goals: none built. No `pointermove`/`pointerdown`, no gamepad, no pointer lock, no cursor hiding, no sensitivity/invert/off control; `CPU_SPEED`, `BALL_SPEED`, `PADDLE_SPEED`, `FIXED_DT_MS`, the audio, scoring and collision rules are untouched.
- The disclosed AC1 gap (the paddle does not follow the pointer while `phase` is `idle`/`game-over`) is correctly justified: /Users/joelstevick/projects/starter-example-3/src/game/step.ts:96 returns early, and single-player-pong AC1 requires "Nothing moves ... until the player starts", which this plan's non-goals put out of scope.
- Suite confirmed green locally as the Build notes claim: 38 Vitest, 25 Playwright, all passing. The working tree was left clean; the only writes were to the scratchpad and to gitignored dist/ and test-results/.

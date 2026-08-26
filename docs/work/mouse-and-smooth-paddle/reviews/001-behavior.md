# Review: behavior

- **Lens:** behavior
- **Verdict:** findings
- **Diff range:** 48e080f...HEAD

## Findings

### F1 — AC1 is not met before the game starts or after it ends: moving the mouse over the court moves nothing at all until a click or key press.

- **Severity:** minor
- **Location:** `src/game/step.ts:96`

**What**

`step` returns early while `state.phase` is `idle` or `game-over`, so the `targetY` the mouse adapter sets is accepted but never applied. The paddle is drawn at the centre of the court regardless of where the pointer is.

**Failure scenario**

Load http://localhost:4173/?seed=1 and, without clicking, sweep the pointer over the court from clientY 162 down to clientY 522 (court y 40 to 400). Expected per AC1: the paddle centres itself on the pointer and continues to track it. Observed: the paddle stays at court y 200-279 (centre 240) for every position, and a byte-comparison of the canvas screenshot before and after eight mousemoves is identical - zero pixels change. The same happens after the game is won: at 0-11 with the status reading "Computer wins! Press any key to play again", moving the pointer from court y 5 to court y 440 leaves the paddle at top 0/bottom 79. A mouse-only player therefore gets no feedback that mouse control exists until after they have already clicked, and on that click the paddle teleports from the centre to wherever the pointer happens to be.

**Suggested direction**

Either narrow AC1 to say the paddle tracks only while the game is running (the build notes already flag the tension with the single-player-pong item's still-court requirement), or let the idle/game-over draw honour `targetY` for the player paddle only, which keeps the court silent and the ball still while still showing the player that the mouse is live. Note that AC6 only forbids the mousemove from *starting* the game and making sound, not from moving the paddle, so the two are not actually in conflict.

### F2 — The status line still instructs the player to use the keyboard, even though this change made the game playable with the mouse alone.

- **Severity:** nit
- **Location:** `src/status.ts:14`

**What**

`statusText` returns "Press any key to start" in the idle phase and "<winner> Press any key to play again" at game over. Neither mentions the click gesture that AC6 added, although AC6's stated point is that the game is playable with the mouse alone.

**Failure scenario**

Load the page with a mouse and no intention of touching the keyboard. The most prominent instruction directly under the court reads "Press any key to start"; after the computer wins it reads "Computer wins! Press any key to play again". Both are the `role="status"` live region, so this is also what a screen reader announces. The click that now works is only mentioned in the smaller `.hint` paragraph two elements further down ("Click the court or press any key to start."), so the primary prompt contradicts the shipped capability.

**Suggested direction**

Word the two strings to cover both gestures, e.g. "Click the court or press any key to start" / "... to play again". The build notes already identify this as a follow-up; the cost is updating the string assertions in tests/e2e/court.spec.ts, tests/e2e/scoring.spec.ts and tests/unit/status.test.ts.

## Notes

Ran the real artifact only: `npm run build` then `vite preview` on :4173, plus `vite` dev on :5199. The base commit 48e080f was exported read-only with `git archive` into the scratchpad and built on :4174 for A/B; the repo working tree was never modified. Measurements were taken by reading the canvas back per animation frame (sub-pixel luminance centroid of the paddle columns and amber centroid of the ball) in headless Chromium (~120 Hz rAF), headed Chromium on the real display (~144 Hz), and under 4x CDP CPU throttling. All eight acceptance criteria were exercised; AC5's judder reproduces on the base build on real hardware (0.00/3.50 px alternating frames) and is fully gone at HEAD (419-421 px/s every frame). AC7 was confirmed both self-consistently and against the base build at seeds 1, 2, 7, 9 (identical scores and identical sound sequences). 3600 frames of rendering across four seeds produced no ball smearing, no out-of-court draws and no phase-change smear. Off-script paths (mute button, M key, play to 11 and restart, mid-game resize, page scroll, 3 s main-thread stall, arrow/space page scrolling) all behave correctly and match the base build.

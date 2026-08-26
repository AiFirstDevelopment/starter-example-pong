# Verdict — single-player-pong

- **Adjudicated:** `4644a71...0e12bda` (the whole branch) plus the working tree
  at adjudication time; my own fixes are the commit that follows `0e12bda`.
- **Reviews considered:** 001-behavior, 002-correctness, 003-spec-fidelity,
  004-security, 005-simplicity, 006-test-quality. No lens missing.
- **Outcome:** ready with follow-ups
- **Test suite:** green — 27 unit (Vitest) + 15 behavioural (Playwright), run
  twice end to end with no failures, no skips and no `.only`.

## Read this first

Three things want a human, none of them blocking:

- **E1 — the toolchain moved a major version under adjudication.** `vite ^5.4.0`
  → `^6.4.3` and `vitest ^2.0.5` → `^3.2.7`, because no version inside the old
  ranges is free of a critical and a high advisory. Confirm you want the bump.
- **E2 — AC8's player-win announcement is proven by a unit test, not end to
  end.** Driving a real player win takes roughly 10,000 animation frames; I did
  not spend that on the suite. Decide whether you want the slow test.
- **E3 — the plan's *Approach* and its *Non-goals* disagree about the computer's
  speed,** and the build followed the non-goal. The Approach text is now wrong;
  amending it is a planner's job, not mine.

One real defect the tests were letting through is fixed: a ball striking a
paddle in the corner of the court sounded the wall tone and the paddle tone
together and threw the wall reflection away — AC4 says in as many words that no
wall sound occurs at that moment.

## Acceptance criteria

Every criterion walked independently against the assembled app, not against the
reviews.

| AC | Met | Evidence |
|---|---|---|
| AC1 | yes | `tests/e2e/court.spec.ts:20` — 0–0 in the DOM, both paddles centred at 200–279, ball on the centre spot, the canvas byte-identical after 120 frames, and no sound recorded (the game never constructs an `AudioContext` before the start key). |
| AC2 | yes | `court.spec.ts:44` (serve on Space; paddle clamped to 0–79 and 400–479 however long the key is held), `:71` (W/S), `:89` (**new** — a key released after Shift no longer sticks), `:119` (**new** — the start key no longer scrolls the score off screen). |
| AC3 | yes | `tests/e2e/collisions.spec.ts:41` — with `?seed=1` the computer paddle climbs to meet the serve and returns it from x > 700. |
| AC4 | yes, after a fix | `collisions.spec.ts:62` for the positive half; `tests/unit/step.test.ts:75` (**new**) for the negative half. Before the fix, one tick could emit `[wall-hit, paddle-hit]` together — reproduced by a direct `step` call and found in simulation at seed 2, tick 12498. |
| AC5 | yes | `collisions.spec.ts:81` — 226 Hz / 16 ms square against the paddle's 459 Hz / 90 ms, and the ball's vertical direction reverses across the bounce. |
| AC6 | yes | `collisions.spec.ts:99` — sawtooth 490 → 120 Hz over 300 ms, different from both others in timbre, pitch and length, and now asserted to reach the audio destination rather than merely being scheduled. |
| AC7 | yes | `tests/e2e/scoring.spec.ts:19` (computer scores, ball returns to the centre spot, ~0.9 s pause, then a fresh serve) and `:45` (player scores at `?seed=2`). Both read the score from the DOM. |
| AC8 | yes, with a test gap | `scoring.spec.ts:59` drives a real 0–11, freezes play, announces "Computer wins!" and restarts at 0–0. The **player**-win announcement is covered only by `tests/unit/status.test.ts` — see E2. |
| AC9 | yes | `tests/e2e/sound-control.spec.ts:13` — the muted stretch now contains a paddle strike as well as a wall hit and a ball leaving the court, and the sound count does not move; `:44` covers the button and its `aria-pressed`. |
| AC10 | yes | `tests/e2e/replay.spec.ts:30` — two loads of `?seed=1` give identical ball trails and identical recorded sounds; `?seed=9` differs. |

Nothing is unmet.

## Dispositions

All seventeen findings verified against the code before deciding. Two pairs
describe the same defect from different lenses; two were accepted in part, and
the part left undone is named.

| Finding | Lens | Severity | Disposition | Reasoning |
|---|---|---|---|---|
| F1 | behavior | major | Accepted | Confirmed. `event.key` carries the shifted form, so `W` down / `w` up never cancel and the paddle jams. Fixed in `src/input.ts`; new e2e test fails against the old code (paddle stuck at top, ArrowDown does nothing). |
| F2 | behavior | minor | Accepted | Confirmed with the reviewer's own numbers: at 1280×600 the document is 744 px tall and Space scrolled to y=144, putting the scoreboard at top −72. Fixed; new e2e test, mutation-verified. |
| F1 | correctness | minor | Accepted, severity raised | Real, and it breaks an AC outright rather than being cosmetic: the wall reflection is discarded by `bounceOffPaddle` and both tones sound together. Fixed in `src/game/step.ts`. |
| F2 | correctness | minor | Accepted | Same defect as behavior F1; one fix covers both. |
| F1 | spec-fidelity | major | Accepted | Same defect again, correctly measured against AC4's negative clause and the plan's own flowchart. The `[wall-hit, out-of-play]` pairing it also predicted is closed by the same change. |
| F2 | spec-fidelity | minor | Accepted | Verified myself: `chromium-1234` — the revision `playwright-core` 1.62.1 requires — was installed Aug 25, a day before the work item. Both halves of C3 were wrong, and so was the "correction". Recorded as a judge's correction in Build notes rather than by rewriting the builder's words. |
| F3 | spec-fidelity | minor | Accepted in part | Real: `m` is the one key that does not start the game. README row corrected. I left the on-screen "Press any key to start" alone — muting before you serve is worth keeping, and the hint line under the court already names `M`. The residual is in Follow-ups. |
| F4 | spec-fidelity | nit | Accepted | Verified: `1ebc96c` carries S1–S7 entire. Build notes corrected. |
| F1 | security | major | Accepted | Verified by running `npm audit`: 4 advisories (1 critical, 1 high, 2 moderate), all dev tooling, none fixable inside the declared ranges; `npm audit --audit-level=high` exited 1. Upgraded to `vite ^6.4.3` / `vitest ^3.2.7` (esbuild 0.25.12): audit now reports 0, and the full suite is green on the new toolchain. See E1. |
| F1 | simplicity | minor | Accepted | The pixel scan really was byte-identical in two places. `ballAt` now delegates to `sample`; both callers still pass. |
| F2 | simplicity | minor | Accepted | `dispose` has no call site anywhere in `src` or `tests` and the page has no unmount path. Removed rather than kept as untested surface. |
| F3 | simplicity | nit | Accepted | `--ball` was never read; the colour lives in `render.ts`. Removed the misleading knob. |
| F4 | simplicity | nit | Accepted | `centredBall()` exported and used by `serve()` and the game-over reset; no behaviour change. |
| F1 | test-quality | major | Accepted | Reproduced: the muted window ended five frames before the next paddle strike, and a mute that ignored paddle sounds passed the whole suite. The window is now 260 frames and the test proves a strike happened inside it by reading the reversal out of the ball's trail, so it fails loudly rather than silently if timings move. Mutation-verified. |
| F2 | test-quality | major | Accepted | Confirmed by reading the config: the build lives inside the `webServer` command, so a reused server means no build. `reuseExistingServer: false`; verified that a stale server on 4173 now stops the run with an error instead of quietly passing. |
| F3 | test-quality | minor | Accepted | Reproduced: deleting both `connect` calls left 13/13 green. The recorder now follows the graph to the destination and AC4/AC6 assert it; deleting the connects fails both. |
| F4 | test-quality | minor | Accepted in part | Real gap. The announcement is now a pure function (`src/status.ts`) with both endings unit-tested, and the mutation the reviewer described fails. An end-to-end player win is not affordable — see E2. |

Nothing was rejected. Every finding held up on inspection, which is itself worth
knowing about this panel.

## Changes applied

Simulation and app:

- `src/game/step.ts` — a wall bounce settles the tick; the paddle and
  out-of-play tests no longer run on top of it (correctness F1, spec-fidelity
  F1). Game-over reset uses `centredBall()` (simplicity F4).
- `src/game/state.ts` — `centredBall()` exported and reused by `serve()`.
- `src/input.ts` — key names lower-cased on both key down and key up so a
  physical key always cancels itself (behavior F1, correctness F2); Space,
  PageUp and PageDown no longer scroll, except Space aimed at a focused button,
  which must keep working the mute control (behavior F2); unreachable `dispose`
  removed (simplicity F2).
- `src/status.ts` (new) + `src/main.ts` — the status line is a pure function of
  the state (test-quality F4).
- `src/style.css` — dead `--ball` custom property removed (simplicity F3).

Tests and tooling:

- `playwright.config.ts` — `reuseExistingServer: false` (test-quality F2).
- `tests/e2e/support/pong.ts` — the `AudioContext` double records whether a tone
  reached the destination (F3); `ballAt` delegates to `sample` (simplicity F1);
  new `paddleStrikes` reads strikes out of the ball's trail.
- `tests/e2e/collisions.spec.ts` — AC4 and AC6 assert the tones are audible, not
  merely scheduled.
- `tests/e2e/sound-control.spec.ts` — the muted stretch now contains, and
  proves, a paddle strike.
- `tests/e2e/court.spec.ts` — two new tests: a movement key released after Shift
  does not stick; the start key does not scroll the court away.
- `tests/unit/step.test.ts` — a corner strike emits the wall bounce alone and
  the paddle answers on the next tick.
- `tests/unit/status.test.ts` (new) — both winner announcements.
- `package.json`, `package-lock.json` — vite 6.4.3, vitest 3.2.7 (security F1).

Record:

- `README.md` — the key table no longer claims `M` starts the game.
- `docs/work/single-player-pong/plan.md` — two judge's corrections appended to
  Build notes (spec-fidelity F2, F4); *Status* set to `adjudicated`. *Intent*,
  *Acceptance criteria* and *Non-goals* untouched.

Every new test was run against a deliberately broken version of the behaviour it
guards and observed to fail: the stuck key, the corner collision, the scrolling
start key, mute ignoring paddle strikes, tones wired to nothing, and an
unannounced player win.

## Escalations

### E1 — confirm the dev-toolchain major bump

`vite ^5.4.0` and `vitest ^2.0.5` were pinned to lines with no patched release:
GHSA-5xrq-8626-4rwp (critical), GHSA-fx2h-pf6j-xcff (high) and two moderate
advisories, with `npm audit --audit-level=high` failing on the branch from its
first commit. Because the plan says this work item establishes the stack later
work follows, I moved both together to `vite ^6.4.3` / `vitest ^3.2.7`; audit is
now clean and the suite passes unchanged, including `npm run dev` and
`npm run build`.

- **Option A (what I did):** keep the bump. Nothing a player loads is affected —
  the app ships zero runtime dependencies — and the repo starts audit-clean.
- **Option B:** revert to the vite 5 line and accept the advisories on developer
  machines and in any audit-gated CI.

**Recommended: A.** Worth knowing: Node here is v20.16.0, which is below vite 7's
floor of ^20.19, so 6.x is the newest line this machine can run.

### E2 — how much is AC8's player-win announcement worth?

`scoring.spec.ts:59` proves the computer-win path end to end. The player-win
text is exercised only by `tests/unit/status.test.ts`. Reaching a real player win
means driving a tracking player through eleven points: about 19,700 simulation
ticks — roughly 10,250 animation frames, half a minute or more of suite time —
and I would not add that unattended.

- **Option A (what I did):** keep the pure function and its unit test. The exact
  regression the lens described — blanking the "You win!" branch — now fails.
- **Option B:** add the long behavioural test anyway, accepting the runtime.
- **Option C:** leave the branch untested.

**Recommended: A**, revisiting only if the on-screen player win is something the
team wants proven through the browser.

### E3 — the plan disagrees with itself about the computer's speed

*Approach* says the computer tracks "at a capped speed slightly below the ball's";
*Non-goals* says "one computer skill level, tuned to be beatable". They cannot
both hold: at 280 px/s against the ball's 380 the computer is unbeatable, which
the builder demonstrated and the spec-fidelity lens reproduced independently. The
shipped `CPU_SPEED` is 160, which serves the non-goal and contradicts the
Approach sentence. My own simulation agrees: an idle player loses 0–11 and a
ball-tracking player wins.

I did not edit the plan's Approach — moving planning text to match the code is
the judge's easiest way to make a discrepancy disappear.

- **Option A:** amend the Approach sentence in a planning pass to say what the
  code does and why.
- **Option B:** leave it, with the Build note and this verdict as the record.

**Recommended: A**, in the next planning pass on this repo.

## Follow-ups

Real, but outside this change:

- **No CI.** There is no workflow, so nothing gates a merge on the suite or on
  `npm audit`. The build notes record this as deliberate — it is not in the plan
  — but the value of the suite is much lower without it. `/tests:ci` writes it.
- **No recorded test recipe.** `.claude/skills/run-regression-tests/SKILL.md`
  does not exist, so every session rediscovers the commands from
  `package.json`. Left alone here for the same reason: not in the plan.
- **The start prompt still says "any key"** while `M` only mutes (residual of
  spec-fidelity F3). Reword the prompt, or let `M` start the game, whichever
  reads better on screen.
- **A restart does not reset the seed.** `startGame` keeps `rngState` as it
  stands, so a second game on `?seed=1` plays differently from the first. AC10
  only speaks about page loads, so this is a note, not a defect — but anyone
  reproducing a rally should reload rather than restart.
- **Long rallies against a perfect tracker.** With no rally speed-up (an
  explicit non-goal) a player who tracks the ball exactly can rally almost
  indefinitely. Raised by the correctness lens and deliberately not reported as
  a defect; a speed-up would be the fix if it ever matters.

# Verdict — mouse-and-smooth-paddle

- **Adjudicated:** `48e080f...7683a35` (the branch's own two commits, forked from
  `feature/single-player-pong`), plus my adjudication commit on top. Working tree
  was clean at the start apart from the untracked `reviews/`.
- **Reviews considered:** 001-behavior, 002-correctness, 003-spec-fidelity,
  004-security, 005-simplicity, 006-test-quality. No lens missing.
- **Outcome:** ready with follow-ups
- **Test suite:** green — 38 unit (Vitest), 27 behavioural (Playwright)

## Read this first

1. **AC1 is only partly met, and the plan is the reason.** The paddle does not
   follow the pointer until the game has started. That is not a bug in the code —
   it is AC1 contradicting a non-goal, and it needs your decision. See **E1**.
2. **A real defect got through the build and two lenses caught it.** The
   smoothing snapped both paddles on every serve and every scored point,
   producing a 4.2 px jerk where AC5 allows 1. Confirmed, fixed, and now guarded
   by a test that fails without the fix.
3. **Two `PLAN DEFECT` notes from the builder are escalations by rule** (E2, E3).
   I checked both and recommend accepting both; neither needs code changes.

## Acceptance criteria

| AC | Met | Evidence |
|---|---|---|
| AC1 | **partly** | Tracking and CPU independence proven at `tests/e2e/mouse.spec.ts:56` and `:73`. **Not met while `phase` is `idle` or `game-over`**: `src/game/step.ts:96` returns early, so a mousemove before the first click moves nothing. I reproduced this — `tests/e2e/mouse.spec.ts:206` asserts the court image is byte-identical after a mousemove in idle. See E1. |
| AC2 | yes | `tests/e2e/mouse.spec.ts:96` drives the pointer to x=5 outside the canvas, then above and below the court, asserting the paddle rests on each edge and never leaves. |
| AC3 | yes | `tests/e2e/mouse.spec.ts:130` at a 520 px viewport; the expectation is derived from the observed rect, and `:151` proves a raw `clientY - top` answer would be >50 px wrong. |
| AC4 | yes | `tests/e2e/mouse.spec.ts:154` for last-input-wins. The "stationary mouse never fights a held key" clause was **untested** until this adjudication — now `tests/e2e/mouse.spec.ts:263`. See F9. |
| AC5 | yes | `tests/e2e/smoothness.spec.ts:34` (mid-rally) **and** `:107` (across a scored point and the serve after it, added here). Was **not** met across phase changes before the fix. See F3/F5. |
| AC6 | yes | `tests/e2e/mouse.spec.ts:192`: a mousemove in idle changes no pixel and plays no sound; the click starts the game and the first tone reaches the destination. |
| AC7 | yes | `tests/e2e/replay.spec.ts` (keyboard) and `tests/e2e/mouse.spec.ts:252` (click + mouse + key, twice at one seed). I confirmed `interpolate`'s result is passed only to `render` (`src/main.ts:126`) and never fed back into `state`, so drawing cannot affect the simulation. |
| AC8 | yes | `tests/e2e/smoothness.spec.ts:59` (ball and CPU paddle) and `:83` (no phase-change smear at seed 7). The CPU paddle's own phase-change hitch is fixed by the same change as AC5. |

## Dispositions

| Finding | Lens | Severity | Disposition | Reasoning |
|---|---|---|---|---|
| F1 | behavior | minor | **Escalated (E1)** | Confirmed: the paddle is inert in `idle`/`game-over`. But AC1 as written contradicts the non-goal "anything else settled by the `single-player-pong` work item", whose AC1 says "Nothing moves ... until the player starts the game". Which one gives is not mine to decide. |
| F2 | behavior | nit | Rejected → follow-up | Real, but AC6 asks that a click *start the game and unlock sound*, which it does. The status wording is in no AC, S6 scoped the copy change to the hint line and README, and changing `statusText` means editing assertions in three test files. Recorded as follow-up 1. |
| F3 | correctness | major | **Accepted** | Confirmed independently by replaying `main.ts`'s loop against the compiled `step`/`interpolate`: at seed 9 a held ArrowDown in open court steps 6.72 px per frame until the rally→serving frame, then 8.82 px and 4.62 px — a 4.20 px variation where AC5 allows 1. Fixed in `src/render.ts:46-53`. |
| F4 | spec-fidelity | minor | **Accepted** | Confirmed and stronger than reported. Replaying seeds 1–10, *every* first point lands on a **two-tick** frame, so "it only shows on frames that run a single tick" is false; seed 1 smears to x=108.8 exactly like the rest. Correction appended to `plan.md` Build notes. |
| F5 | spec-fidelity | major | **Accepted** | Same defect as F3, independently found and independently measured. Same fix. |
| F6 | security | — | — | Clean; no findings. I re-checked the one thing it noted and did not report (an untrusted synthetic `mousemove`) and agree it confers no privilege on a page with nothing to protect. |
| F7 | simplicity | minor | Rejected → follow-up | The duplication between `spanAt` and `paddleAt` is real, but the proposed fix — `paddleAt` delegating to `sample` — trades it for a hidden dependency on `recordSound` having installed `window.__sounds`, which `paddleAt` does not have today, and turns a 480-pixel column read into a 384,000-pixel full-canvas read. Neither shape is clearly better. I added the reciprocal cross-reference comment so the paired threshold is visible from both ends, and recorded the unification as follow-up 3. |
| F8 | simplicity | nit | **Accepted** | Confirmed dead: `grep` shows the only `.width` reads in `tests/` are `viewport.width` and `canvas.width`, never `Box.width`. Dropped from `Box` and `courtBox`. |
| F9 | test-quality | minor | **Accepted** | Confirmed by mutation: changing `if (!event.repeat)` to `if (true)` in `src/input.ts:92` left the entire suite green. New test at `tests/e2e/mouse.spec.ts:263` fails against that mutation and passes against the shipped code. |
| F10 | test-quality | minor | Rejected → follow-up | Confirmed: after 30 frames of held `W` the paddle is clamped at 0, so `expect(...).toEqual(released)` compares `{top: 0}` with `{top: 0}` and cannot fail. But the weakness is pre-existing and belongs to the `single-player-pong` item's AC2; fixing it means reshaping a test this plan did not set out to change. The builder reached the same conclusion. Recorded as follow-up 2. |

Counts: **5 accepted, 3 rejected, 1 escalated from the lenses**, plus 2
escalations the builder raised. Findings are numbered F1–F10 across the six
lenses (security raised none); the panel reported 9.

## Changes applied

- `src/render.ts:46-53` — scope the interpolation cut to the ball. A phase change
  teleports the ball to the centre spot, so it is still snapped; nothing moves
  either paddle but its own travel, so both keep their smoothing. (F3, F5)
- `tests/e2e/smoothness.spec.ts:107` — new AC5 case: park the paddle high with
  the mouse at seed 9, hold ArrowDown across the scored point, assert no two
  consecutive frame steps differ by more than a pixel. **Verified failing
  (`unevenness` 4) against the unfixed code.** (F3, F5)
- `tests/e2e/mouse.spec.ts:263` — new AC4 case: with a key already held, move the
  mouse, then deliver real auto-repeat keydowns and assert the paddle stays under
  the pointer. Asserts a repeat actually reached the page first, so the test
  cannot pass vacuously. **Verified failing against the `if (true)` mutation.**
  (F9)
- `tests/e2e/support/pong.ts:43,227` — drop the unread `width` from `Box`. (F8)
- `tests/e2e/support/pong.ts:189-195` — cross-reference `paddleAt` and `sample`'s
  column scan so the shared threshold is visible from both ends. (F7, partial)
- `docs/work/mouse-and-smooth-paddle/plan.md` — Status set to `adjudicated`, and
  a judge's correction appended above the Deviations section. The builder's own
  words are left intact; the correction is additive. (F4)

No test was weakened, skipped or deleted. No existing assertion was loosened.
Intent, Acceptance criteria and Non-goals are untouched.

## Escalations

### E1 — AC1 asks the paddle to track the pointer before the game starts; a non-goal forbids it. Which gives?

**What is wrong.** AC1 says the paddle "centres itself on the pointer's vertical
position, and continues to track it as the pointer moves", with no phase
qualifier. It does not do that in `idle` or `game-over`: `src/game/step.ts:96`
returns before any paddle moves. A mouse-only player gets no sign that the mouse
works until they click, and on that click the paddle teleports from the centre of
the court to wherever the pointer is.

**Why it is not mine to decide.** This is the plan disagreeing with itself, not
the code disagreeing with the plan. The non-goals say "Changing ... anything else
settled by the `single-player-pong` work item", and that item's AC1 says "Nothing
moves and no sound plays until the player starts the game". Honouring AC1 as
written means overriding a non-goal; honouring the non-goal means AC1 ships
narrower than it reads. I may not edit either.

**Options.**

1. **Narrow AC1** to "while the game is running". Zero code change; the shipped
   behaviour is then correct and fully tested. The teleport-on-click stays.
2. **Let the idle draw honour `targetY` for the player's paddle only.** The court
   stays silent and the ball stays still, so the spirit of the earlier AC1
   ("nothing moves") is bent but not the audio or the simulation. Note AC6 only
   forbids a mousemove from *starting* the game and making sound — not from
   moving the paddle — so AC6 and this are not in conflict. Costs a small change
   in `main.ts` or `step`, and a test.
3. Leave it and log it as known behaviour.

**My recommendation: option 1.** It is the honest reading of what the user asked
for ("the mouse should also work for the paddles"), the still-court rule was a
deliberate decision in the previous item, and option 2 puts a second rule into
the render path for a moment the player sees for a second or two. But option 2 is
a defensible product call and I am not the one to make it.

### E2 — Builder's `PLAN DEFECT`: C1 was partly false; wiring input did change

`main.ts` now passes the canvas element into `createControls`
(`src/main.ts:91`), because mapping the pointer needs
`getBoundingClientRect()`. The plan claimed no wiring change would be needed.

I verified this affects no acceptance criterion, and the alternative the builder
rejected — having `input.ts` look the canvas up by DOM id — would put page markup
knowledge into the input adapter. **Recommendation: accept as built; no action.**
Recorded as an escalation only because a builder-raised plan defect always is.

### E3 — Builder's `PLAN DEFECT`: C4 was false; one existing test was edited

C4 predicted the smoothing would need no existing assertion touched, and said
that if it did, "that is a finding, not a licence". It did: the builder inserted
`await runFrames(page, 2)` at `tests/e2e/court.spec.ts:109` so the baseline is
sampled after the render settles.

I checked this myself rather than taking the two lenses' word for it. After the
key is released `held` is empty and `targetY` is null, so `step` moves the paddle
by zero during those two frames; the paddle is clamped at `top: 0` both before
and after. The assertion is still `toEqual`, still exact, still over 60 frames.
**It is not a weakening. Recommendation: accept.** The separate, pre-existing
vacuity in that same test is follow-up 2.

## Follow-ups

Real, verified, and deliberately not fixed here.

1. **The status line still reads "Press any key to start"** (`src/status.ts:14`),
   and the same for "play again" at game over, although a click now works too.
   This is the `role="status"` live region, so it is what a screen reader
   announces. Fixing it means updating string assertions in
   `tests/e2e/court.spec.ts`, `tests/e2e/scoring.spec.ts` and
   `tests/unit/status.test.ts`. (behavior F2)
2. **`tests/e2e/court.spec.ts:115` compares 0 with 0 and cannot fail.** Thirty
   frames of held `W` pins the paddle to the top before it is released, so "the
   paddle stays where it was let go" has nowhere to glide to; only the
   `ArrowDown` check at `:121` catches a stuck key. Holding for ~10 frames
   instead releases it in open court and makes the assertion real. Pre-existing,
   from the `single-player-pong` item. (test-quality F2)
3. **`spanAt` in `sample()` and `paddleAt` are two copies of the same pixel
   scan** (`tests/e2e/support/pong.ts:195` and `:320`). Unifying them without
   coupling `paddleAt` to `recordSound` needs a small restructure of the support
   module. (simplicity F1)

## What no lens covered, that I checked myself

- `interpolate`'s output reaches only `render`, never `state` — AC7 cannot be
  affected by the smoothing. (`src/main.ts:126`)
- `startGame`, `beginServe` and `serve` all preserve `playerY` and `cpuY`, which
  is what makes it safe to interpolate the paddles across a phase change. This is
  the premise of the accepted fix and I confirmed it in `src/game/state.ts` rather
  than assuming it.
- `mix(x, x, alpha) === x`, so a zero-tick frame and the very first frame draw
  correctly.
- The full suite was green before my changes (38 + 25) and after them (38 + 27),
  run the way CI runs it: `npm run build`, `npm run test:unit`, `npm run test:e2e`.

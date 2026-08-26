# Verdict — mobile-touch-controls

- **Adjudicated:** `ddd7c34...HEAD` (the branch's fork point from `main`), plus the
  working tree, which was clean apart from `state.json`.
- **Reviews considered:** 001-behavior, 002-correctness, 003-spec-fidelity,
  004-security, 005-simplicity, 006-test-quality. No lens missing.
- **Outcome:** **ready with follow-ups**
- **Test suite:** green — 41 unit, 36 Playwright (27 `chromium`, 9 `mobile-chrome`)

## Read this first

Two things need a human before this ships.

1. **E1 — landscape becomes a scroll trap.** Freezing the court is what fixes the
   reported bug, and in landscape it also takes away the only way to scroll. I
   confirmed this myself in Chromium, not just from the reviews. It is a real
   regression against pre-change behaviour and it cannot be fixed inside this
   change's Non-goals. **Details and options below.**
2. **AC5 is only half met.** Its normative clause holds and is well covered. Its
   stated *rationale* — "this is what keeps the mute button reachable in
   landscape" — does not hold, for the reason in E1. I have not marked it met.

The reported defect itself — a finger sliding the whole app around instead of
moving the paddle — is fixed, and in **portrait**, which is how the bug was
reported and where the page does not scroll at all, the change is clean. I drove
the assembled app on a Pixel 5 and the paddle lands 0.06–0.19 px from where the
finger asks.

## Acceptance criteria

Walked independently against the running application, not only against the tests.

| AC | Met | Evidence |
|---|---|---|
| AC1 | yes | Drove a real CDP touch drag on the built bundle, Pixel 5 portrait: finger at 0.2 / 0.8 / 0.35 down the court put the paddle 0.06 / 0.19 / 0.19 px from where it asked. Landscape agrees (0.12–0.24 px). CPU paddle unaffected — `tests/e2e/touch.spec.ts:83`. |
| AC2 | yes | `tests/e2e/touch.spec.ts:111` carries the drag two pixels above the court and two above the viewport's bottom edge, and asserts the paddle rests at `{top: 0}` then `{top: 400}`. Independently: a finger asking for court y 24 parked the paddle centre at 40 — half a paddle from the edge, clamped, not stranded. |
| AC3 | yes | The computed touch-action on the court measured directly as `none`, and overscroll-behavior on both axes is `none` on html and body — asserted at `tests/e2e/touch.spec.ts:152`, declared at `src/style.css:72` and `src/style.css:19`. A touch-action auto control proved the browser acts on the declaration: the same synthesized touch gesture that does nothing on the court scrolls 121 px once the declaration is lifted. **Real on-device panning is still unobserved** — see Follow-ups. |
| AC4 | yes | Court measured at 217.4 px displayed against its intrinsic 480, and the paddle still landed within 0.19 px. `tests/e2e/touch.spec.ts:170` also asserts the naive "distance down the canvas" answer is >50 px wrong, so the scaling is what is being tested. |
| AC5 | **partial** | *Normative clause: met.* A real touch gesture begun on the hint text scrolled the page (scrollY 466 → 319) and left the paddle at `{top: 200, bottom: 279}`, unmoved. *Stated rationale: not met.* "Keeps the mute button reachable in landscape" is false in the scroll range described in **E1**. |
| AC6 | yes | `tests/e2e/touch.spec.ts:239` — a drag leaves the status line reading "Press any key to start", plays nothing, and leaves the court image byte-identical; the following tap clears the status and the first sound recorded has `connectedToDestination: true`. Reproduced by hand: tapping the court cleared `#status`. |
| AC7 | yes | `tests/e2e/mouse.spec.ts` is **byte-unchanged** in the diff (`git diff --name-only` does not list it) and all of its tests pass. `tests/e2e/touch.spec.ts:271` covers touch↔key arbitration in both directions. See E2 on the *count* of those tests. |
| AC8 | yes | `tests/e2e/touch.spec.ts:350` replays `?seed=1` through a scripted tap-drag-key-drag rally in two fresh contexts and compares full ball, player and CPU traces; a different seed differs. Passed 8/8 under `--repeat-each=8`. |

## Dispositions

| Finding | Lens | Severity | Disposition | Reasoning |
|---|---|---|---|---|
| F1 | behavior | major | **Escalated (E1)** | Confirmed by my own measurement, with a correction. Real: in landscape the court is 480.8 px tall in a 293 px viewport, and for scrollY ∈ [122, 310] the whole viewport is canvas, which `touch-action: none` makes unscrollable. The reviewer's claim that only the outermost 1–2 px still scroll did **not** reproduce: `elementFromPoint` returns `body` from x=2 through x=14, and a synthesized touch scroll at x=8 moved the page 200 → 321. The escape is the body gutter, 25.5 px wide at 851 px and **16 px at 740 px and below** — narrow enough that Android's back-gesture zone claims it. The reviewer's suggested `touch-action: pan-y` is wrong and I did not take it: it would hand the vertical drag back to the browser and undo the fix. |
| F2 | correctness | minor | **Escalated (E1)** | The same defect, found independently, and the more accurate of the two write-ups — its gutter measurement matches mine and its warning against `pan-y` is correct. Two lenses reaching it separately is why I am escalating rather than deferring quietly. |
| F3 | spec-fidelity | nit | **Escalated (E2)** | Confirmed: `tests/e2e/mouse.spec.ts` declares **eight** `test()` blocks (lines 56, 73, 96, 130, 154, 192, 252, 263), not seven. AC7 and claim C5 both say seven, and C5 is ticked `[x]`. I cannot fix it: the wrong number is inside an acceptance criterion, and a judge does not edit those. AC7's substance is unaffected — all eight pass, the file is unmodified. |
| F4 | simplicity | minor | **Rejected** (follow-up recorded) | The duplication is real — `COURT_HEIGHT`, `AGAINST_THE_TOP`, `AGAINST_THE_BOTTOM`, `centreOf`, `downCourt`, `courtYOf`, `missedBy` exist in both specs. But the fix requires editing `tests/e2e/mouse.spec.ts`, which AC7 requires to pass *without modification*, and that is not a call I get to make against a criterion. The stated failure mode also overstates it: changing `PADDLE_HEIGHT` makes the `mobile-chrome` project go **red**, which is a loud failure, not a silent one. Recorded as follow-up. |
| F5 | simplicity | nit | **Accepted — fixed** | Confirmed: `touchDrag` had one caller, at `tests/e2e/touch.spec.ts:239`, passing exactly two points, and its `points.length === 0` throw was unreachable from anything in the repository. Narrowed to `(page, from, to)`; the call site is unchanged. |
| F6 | test-quality | minor | **Accepted — fixed** | Confirmed by instrumenting the assembled page. An off-court drag delivers exactly **one** `pointermove` (target `.hint`) and then `pointercancel`; an on-court drag delivers all three and no cancel. Since `seenTheFinger` returns immediately once `cancelled` is set, AC5's second and third iterations asserted against a state nothing could have changed, and nothing asserted that even the first move arrived. Fixed with a premise guard. |

## Changes applied

Both are test-side. No production code changed during adjudication.

- `tests/e2e/support/pong.ts` — `PointerTally` gained `touchMoves`, counted for
  `pointerType === 'touch'` and reset with the rest of the tally in `Finger.down`;
  `Finger` gained `seen()` to read it back. (F6)
- `tests/e2e/touch.spec.ts:229` — the AC5 test now asserts at least one touch
  `pointermove` actually reached the page, so it fails loudly instead of going
  vacuous if Chromium ever cancels the gesture one event earlier. (F6)
- `tests/e2e/support/pong.ts` — `touchDrag(page, from, to)` replaces the variadic
  form and its unreachable emptiness check. (F5)

**Both fixes were checked for falsifiability rather than just run.** With
`drivesPaddle` weakened to admit every pointer, the AC5 test still fails on the
paddle jumping to `{top: 9}` — the guard did not neuter what the test was already
catching. With the touch counter deliberately broken so no move is ever counted,
the test fails on the new assertion (`Expected: > 0, Received: 0`) instead of
passing — so the guard is load-bearing, not decorative. The touch spec then ran
72/72 green under `--repeat-each=8`, so it is not flaky.

## Escalations

### E1 — Freezing the court makes a landscape phone unscrollable in the middle of its scroll range

**What is wrong.** `touch-action: none` on the canvas is exactly what AC3 asks for
and it is what fixes the reported bug. In landscape it has a second effect nobody
planned for: the court is taller than the viewport, so there is a band of scroll
positions where the canvas is the *only* thing on screen — and a canvas that
refuses touch gestures is a canvas the page cannot be scrolled from.

Measured on the built bundle in Chromium with a Pixel 5 profile:

| Viewport | Court height | Trapped scrollY range | Escape gutter |
|---|---|---|---|
| 851 × 293 | 480.8 px | 122 → 310 (of 466 total) | 25.5 px each side |
| 740 × 300 | 435.6 px | 122 → 248 (of 403) | **16 px** each side |
| 667 × 300 | 390.6 px | 122 → 204 (of 360) | **16 px** each side |
| 393 × 727 (portrait) | 217.4 px | none — page does not scroll | n/a |

Inside that band, a touch scroll gesture at x = 100, 400 or 700 leaves `scrollY`
at 200. Only the body gutter still works, and at 740 px and below that gutter is
16 px — the width Android's system back-gesture claims. The mute button (page y
650.8–684.6) and the score are both outside the band, and `page.reload()`
restores the scroll position, so the state survives a reload. Before this change
the same drag panned the page, so the player could always get out.

Portrait — the orientation the bug was reported in — is unaffected: the page does
not scroll at all there, so there is nothing to trap.

**Why it is not mine to decide.** Every fix crosses a line I was told not to
cross:

- Relaxing the court to `touch-action: pan-y` gives the vertical drag back to the
  browser and undoes the entire change. Not viable — noted because one review
  suggested it.
- Applying `touch-action: none` only under a media query, or capping the court's
  rendered height, is *"a responsive redesign so the court fits a landscape
  phone"* — an explicit **Non-goal**, and it would also break AC3 as written,
  which asserts the computed value is flatly `none`.
- A fixed-position mute control is new UI and changes the desktop layout.

**Options.**

- **(a) Ship as is and treat landscape as the responsive work item's problem.**
  The reported defect is fixed where it was reported. The cost is that landscape
  is worse than before for the length of time that work item takes.
- **(b) Hold this change until the responsive work item lands with it**, so
  landscape never regresses in a released build.
- **(c) Take one narrow layout change now** — `canvas { max-height: 100dvh }` or
  similar — accepting that it reaches into the Non-goal and that AC3's assertion
  would need re-examining.

**My recommendation: (a), with the landscape work item raised to blocking.** The
user's actual complaint is a portrait one and this fixes it properly; holding a
correct fix hostage to a layout project serves nobody. But (a) is only honest if
the follow-up is genuinely scheduled rather than filed, which is why it is here
and not in Follow-ups.

### E2 — The plan miscounts the mouse tests, in an acceptance criterion I may not edit

AC7 and claim C5 both say "the seven tests in `tests/e2e/mouse.spec.ts`". There
are eight. The eighth (`mouse.spec.ts:263`, "a key held down while the mouse moves
does not snatch the paddle back") is precisely the arbitration case a
`mousemove` → `pointermove` swap is most likely to disturb, so it is the one you
would least want left out of the stated verification surface.

Nothing is broken by it: all eight pass, unmodified, and I verified the file is
untouched in the diff. But C5 is ticked `[x]` and the build notes say "every claim
C1–C7 held", and as written C5 is false.

**Decision needed:** correct both AC7 and C5 to "eight", or drop the number and
name the file alone so it cannot drift again. Only the plan's author should touch
an acceptance criterion, which is why this is here rather than fixed.

## Follow-ups

Real, but outside this change.

- **AC3 has never been observed on a real device.** The harness cannot reproduce
  touch panning in either direction (claim C7), so AC3 is verified through the
  computed declaration the browser acts on. That the page no longer slides under
  the finger — the actual reported symptom — has not been seen by anyone. The
  build notes flag this too. It wants one minute on a phone before release.
- **Lift the duplicated court constants and reading helpers into
  `tests/e2e/support/pong.ts`** (F4). Blocked today only by AC7's "without
  modification" wording; once this lands, the extraction is an import-only edit to
  `mouse.spec.ts` that leaves every assertion byte-identical.
- **`touch-action: none` also disables pinch-zoom and double-tap-zoom on the
  court.** Inherent to AC3 and normal for a canvas game, but it is an
  accessibility surface worth a deliberate decision in the responsive work item.
- **`overscroll-behavior: none` on `html` also disables trackpad swipe-back
  navigation on desktop.** Mandated by AC3, harmless for a game page, noted so it
  is not discovered later as a mystery.
- **A pen no longer drives the paddle from off the court**, where compatibility
  `mousemove` events previously let it. A deliberate call, documented in the build
  notes under S4 — recorded here only so it is on the record as a behaviour change
  rather than an accident.

## What I checked that nobody flagged

- `git diff --name-only` over the range: `package.json` and the lockfile are
  untouched; no production file outside `src/input.ts`, `src/style.css` and
  `index.html` changed.
- The `mousemove` listener is fully removed — `grep` over `src/` finds no orphan
  registration or removal, and `pointermove` is the only pointer listener.
- `npx tsc --noEmit` is clean after my edits.
- The full suite, not a filtered subset: `npm run build`, `npm run test:unit`
  (41 passed), `npm run test:e2e` (36 passed across both projects). Recipe taken
  from `.github/workflows/regression-tests.yml`, which is what gates merges.
- Nothing is skipped or `.skip`-ed in either project.

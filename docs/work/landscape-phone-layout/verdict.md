# Verdict — landscape-phone-layout

- **Adjudicated:** `42e7afc...HEAD` plus the working tree — the fork point from
  `main`, the same range every lens read. Four files: `src/style.css`,
  `tests/e2e/touch.spec.ts`, `tests/e2e/support/pong.ts`, and the two docs files.
- **Reviews considered:** 001-behavior, 002-correctness, 003-spec-fidelity,
  004-security, 005-simplicity, 006-test-quality. No lens missing.
- **Outcome:** ready with follow-ups
- **Test suite:** green — 41 unit and 44 Playwright (27 Desktop Chrome, 17 phone)
  on macOS and again in the CI Linux image, `mcr.microsoft.com/playwright:v1.62.1-noble`
  with `npm ci` from scratch. Nothing skipped, no `.only`, no retries configured.

## What needs a human

Two escalations, neither of them a defect in the code and neither blocking:
**E1** — a magnified court cannot be played on, which is the limit of what AC6's
two-finger zoom buys; **E2** — the builder's `PLAN DEFECT` note, which the
contract says is always the user's to close. All eight acceptance criteria are
met. Details below.

## Acceptance criteria

Walked independently against the built app at seven viewports, not read off the
tests. Measurements are from a fresh `vite preview` of the current tree.

| AC | Met | Evidence |
|---|---|---|
| AC1 | yes | `scrollHeight - innerHeight` is 0 at 802x293, 300x460, 320x480, 851x393 and 1200x200 (was 448 at the reference). `tests/e2e/touch.spec.ts:435` — and now a second measure, `belowTheScreen`, because `scrollHeight` alone is blind to the band described in F3. |
| AC2 | yes | `.scoreboard`, `#player-score`, `#cpu-score`, `#status` and `#mute` all measure 0 px outside the screen on both edges at 802x293, and all five are `toBeVisible`. `tests/e2e/touch.spec.ts:451`. |
| AC3 | yes | 1.6666–1.6667 at every landscape viewport, 1.659–1.661 upright — worst deviation 0.0077 against a tolerance of 0.02. `tests/e2e/touch.spec.ts:488`, which now sweeps six viewports rather than one. |
| AC4 | yes | `window.scrollTo(0, 500)` leaves `scrollY` at 0 at every short viewport measured; there is no scroll range because AC1 leaves no overflow. `tests/e2e/touch.spec.ts:527`. |
| AC5 | yes | Pixel 5 upright 361.00 x 217.39 → 361 x 217; iPhone SE 288.00 x 173.59 → 288 x 174; no overflow at either, by both measures. `tests/e2e/touch.spec.ts:598` and `:609`. |
| AC6 | yes | Computed `touch-action` is `pinch-zoom` (`tests/e2e/touch.spec.ts:170`). A one-finger drag drives the paddle and moves nothing else — every pre-existing touch test passes unchanged, and I drove the built app by CDP to confirm (paddle centre 96 → 408 across two drags). Two-finger zoom really is returned: a synthesized pinch takes `visualViewport.scale` to 2.5. The "exactly as before" half is measured, not assumed — see E1. |
| AC7 | yes | Suite green in both environments. Across the whole range exactly one existing assertion changed — the sanctioned `touch-action` value — and it is still an exact-value assertion. `git diff 42e7afc -- tests/ \| grep '^-'` removes no other assertion, no test, and no `expect`. |
| AC8 | yes | `missedBy` ≤ 1 court unit across three drags on the 191.6 px landscape court. `tests/e2e/touch.spec.ts:539`. |

## Dispositions

| Finding | Lens | Severity | Disposition | Reasoning |
|---|---|---|---|---|
| F1 | behavior | minor | **Rejected**, escalated as E1 | Reproduced exactly: after a pinch to scale 2.5, three drags leave the paddle frozen at 408 while `visualViewport.offsetTop` moves 89 → 175 → 67. But it is not this change's doing. I forced `touch-action: none` over the shipped rule and pinched on the body beside the court — the page was always zoomable there — and got the identical freeze, and identical recovery on pinching out. AC6's comparator is "exactly as before", and before and after are the same. Not a regression, so not a fix; it is a tradeoff, so it is E1. The CSS comment now says so. |
| F1 | correctness | major | **Accepted** | Confirmed. `page.locator('body').ariaSnapshot()` at 802x293 contained no hint paragraph at all, and the status line reads "Press any key to start" on a device with no keys. `display: none` leaves the accessibility tree, so this change took the game's only statement of tap-to-start and drag-to-move away from a screen-reader user on exactly the device it targets. Fixed by clipping the hint instead of removing it. |
| F1 | spec-fidelity | minor | **Accepted** | Same root as above. Rather than delete the build note's claim that the hint "is still read to a screen reader", I made it true; `plan.md` now records that it was false as built. |
| F2 | spec-fidelity | nit | **Accepted** | Confirmed: `git show 42e7afc:tests/e2e/touch.spec.ts \| grep -n touch-action` returns 162. Recorded alongside the builder's other two claim corrections rather than rewritten in place, following the precedent already set in that section. |
| F1 | simplicity | nit | **Rejected** | True as measured — computed `flex-grow/shrink/basis` are `0 / 1 / auto` either way. But the base stylesheet already has a `canvas` rule, so "nothing else sets `flex` on canvas" is one edit from false, and this is the property the eight-line comment and the PLAN DEFECT are both about. An explicit pin of a load-bearing default is worth a line. The enforcement gap the lens is circling is real, and F1/test-quality is where I closed it. |
| F2 | simplicity | nit | **Accepted** | The repo shares every DOM-reading helper in `support/pong.ts` and duplicates only pure arithmetic locally; `courtSize` broke that. `Box` now carries `width`, `courtBox` returns it, and the duplicate is gone. |
| F1 | test-quality | major | **Accepted** | The strongest finding on the panel, and confirmed by mutation: on the tree the lenses read, with `flex: 1 1 auto` restored — the spelling *Approach* still prescribes — the whole phone suite passed 16/16 while the court rendered at aspect 0.79 at 300x460 and 0.80 at 320x480, both ~0.87 outside AC3's tolerance. AC3 says "at every viewport tested" and one viewport was tested. Now six are, and the same mutation fails. |
| F2 | test-quality | minor | **Accepted** | Confirmed: a `visibility: hidden` or `display: none` element has an all-zero rect, which `belowTheFold` read as "on screen". Hiding the mute button to win vertical space is precisely the shortcut this change already took for the hint, and AC2 existed to catch its consequence. `toBeVisible()` added; the mutation now fails. |
| F3 | test-quality | minor | **Accepted, different fix** | The hole is real — at an iPhone SE the layout viewport is 618 px tall and the screen is 568, and content stranded in that band is drawn, unreachable and unscrollable. The suggested fix is wrong, though: comparing `scrollHeight` (618) to `clientHeight` (568) reports 50 px of overflow on a page that has none, and would fail the test as it stands. `scrollHeight` is floored at the layout viewport, so the content has to be measured instead. Added `belowTheScreen` alongside — not instead of — AC1's own measure. The lens's own mutation now fails with 46.375. |

Accepted 7, rejected 2, escalated 2 (E1 arises from a rejected finding; E2 from
the build record, not from any lens).

## Changes applied

- `src/style.css:208` — the landscape hint is clipped to a pixel
  (`position: absolute` + `clip-path: inset(50%)`) rather than `display: none`,
  so it stays in the accessibility tree. No layout effect: the court measures
  319.34 x 191.61 at 802x293 before and after. (correctness F1, spec-fidelity F1)
- `src/style.css:85` — the `touch-action` comment now records what handing zoom
  back does *not* buy, and that `none` behaves identically once zoomed. (E1)
- `tests/e2e/support/pong.ts:55` — `Box` gains `width`; `courtBox` returns it,
  and the doc comment says why it exists now. (simplicity F2)
- `tests/e2e/touch.spec.ts` — `courtSize` deleted; its two call sites read
  `courtBox`. (simplicity F2)
- `tests/e2e/touch.spec.ts:399` — `belowTheScreen` added, measuring the content
  against the smaller of `innerHeight` and `clientHeight`; `belowTheFold` now
  measures against the same screen. Asserted in landscape AC1 and in both
  portrait AC5 cases. (test-quality F3)
- `tests/e2e/touch.spec.ts:463` — landscape AC2 asserts each element is visible
  before asking where its box is. (test-quality F2)
- `tests/e2e/touch.spec.ts:468` — a new test: the hint is clipped to under 4 px
  and still announced. This is the guard for the accessibility fix; without it
  that fix had no test. (correctness F1)
- `tests/e2e/touch.spec.ts:510` — landscape AC3 sweeps 300x460, 320x480,
  851x393, 667x375 and 1200x200 after the reference viewport. (test-quality F1)
- `tests/e2e/touch.spec.ts:587` — the portrait guard checks the hint is laid out
  at full width, not merely present: clipped, it is still 1 px and still
  "visible" to Playwright. (follows from the accessibility fix)
- `docs/work/landscape-phone-layout/plan.md` — *Status* → `adjudicated`, the C5
  line-number correction, and an *Adjudication* section recording what changed
  after the build. *Intent*, *Acceptance criteria* and *Non-goals* untouched.

Every accepted fix was checked by mutation, per `/tests:add`: restoring
`flex: 1 1 auto` fails landscape AC3; `#mute { visibility: hidden }` fails
landscape AC2; `.hint { display: none }` fails the new announcement test;
118 px of margin below the hint fails the iPhone SE case at 46.375 px. Each
mutation fails that test and no other.

## Escalations

### E1 — the court can be magnified, but not played while magnified

`touch-action: pinch-zoom` hands two-finger zoom back to the browser so, in
AC6's words, "the court can be magnified". It can. But while the page is zoomed,
Chromium gives a one-finger drag to the visual viewport, and the paddle stops
tracking it — the game plays on, the score advances, and the player has no
control until they pinch back out.

This is not mine to fix and not mine to accept on your behalf:

- It is **not a regression**. I forced `touch-action: none` over the shipped
  rule and pinched on the body beside the court — always possible, since the
  page carries no `user-scalable=no` — and measured the identical freeze and the
  identical recovery. AC6's promise is "exactly as before", and it holds.
- What this change does add is one more way *in*: zoom is now reachable from the
  court itself, which is where a player's fingers already are.
- Fixing it properly means reading pointer coordinates through
  `window.visualViewport` in `src/input.ts` — production input code this work
  item deliberately does not touch (*Approach*: "All of this lands in
  `src/style.css`").

Options: **(a)** leave it, and take zoom as being for looking rather than for
playing — the comment at `src/style.css:78` now says exactly that; **(b)** a
separate work item that keeps the paddle under the finger while zoomed;
**(c)** revert to `touch-action: none`, which contradicts AC6, was settled
against in the plan's *Open questions*, and does not actually prevent the state.

**Recommendation: (a), with (b) as a follow-up if anyone reports it.** The
relaxation costs nothing that was previously working, and (c) would give up
AC6's magnification without closing the behaviour it was raised about.

### E2 — the builder's PLAN DEFECT is still open in the plan

`plan.md` *Build notes* records a `PLAN DEFECT`: *Approach* and S2 both specify
`flex: 1 1 auto`, which stretches the court to aspect 0.79 on a narrow short
screen; the builder shipped `flex: 0 1 auto` instead and proposed "nothing
further". A `PLAN DEFECT` is always yours to close, so it is recorded here
rather than silently agreed with.

I have gone one step past the builder's disposition: the spelling is now held by
a test at five extra viewports, so a future edit back to the plan's wording
fails rather than shipping. What is left is a documentation question — *Approach*
still names the spelling that does not work, with the correction two sections
below it.

Options: **(a)** leave it, since *Approach* is a record of what was planned and
both *Build notes* and *Adjudication* correct it; **(b)** amend *Approach* to the
shipped spelling — permitted, as it is not a requirement, but it edits the
record of what was decided.

**Recommendation: (a).** The correction is recorded twice over and now enforced
by a test, which is stronger than a tidier plan.

## Follow-ups

Real, and outside this change.

- **"Press any key to start" on a device with no keys.** `src/status.ts:14`
  returns the same idle prompt whatever the input. On a phone the printed hint
  was the mitigation, and in landscape there is no room for it — it is now
  announced but not shown. Not a regression (before this change the hint sat
  below a 448 px scroll trap in landscape and could not be reached either), and
  the fix is production text, so it belongs to its own work item. A touch-aware
  idle line — "Tap the court to start" — would close it.
- **The query is keyed on height alone, so a short desktop window matches it.**
  At Desktop Chrome 1280x400 the hint is clipped, taking the keyboard shortcuts
  off the screen of a user whose only input is a keyboard. This is the design
  the plan chose deliberately, and no AC or non-goal covers desktop; a
  `(hover: none)` or `(pointer: coarse)` qualifier would narrow it if it matters.
- **No recorded test recipe.** `/tests:run` asks for one at
  `.claude/skills/run-regression-tests/SKILL.md`; the repo has none, and I
  discovered the commands from `.github/workflows/regression-tests.yml`
  (`npm run build`, `npm run test:unit`, `npm run test:e2e`) instead. Recording
  it is repo tooling unrelated to this change.
- **`flex: 0 1 auto` is inert** (simplicity F1, rejected). If the team would
  rather carry no no-op declarations, it can go, provided the comment moves to
  `min-height: 0` and the AC3 sweep stays — that sweep is what actually holds
  the shape now.
- **The Linux run is on Node 24, not the `.nvmrc` Node 20**, as the builder
  noted at S7: the Playwright image pins its own. The Chromium is the CI image's,
  which is what the plan's warning was about, but a Node-version-shaped failure
  would not have been caught in either environment.

# Review: simplicity

- **Lens:** simplicity
- **Verdict:** findings
- **Diff range:** `ddd7c34...HEAD`

## Findings

### F1 — minor

**Claim:** touch.spec.ts re-declares three court constants and four reading helpers verbatim from mouse.spec.ts instead of putting them in tests/e2e/support/pong.ts, the shared module both specs already import.

**Location:** `tests/e2e/touch.spec.ts:21`

**What:** Lines 21-48 of touch.spec.ts (`COURT_HEIGHT`, `AGAINST_THE_TOP`, `AGAINST_THE_BOTTOM`, `centreOf`, `downCourt`, `courtYOf`, `missedBy`) are byte-identical in body to lines 17-49 of mouse.spec.ts. support/pong.ts is the established home for this scaffolding and already exports the `Box` and `Span` types these four helpers take and return. Measured across the whole file, 120 of touch.spec.ts's 185 substantive lines are verbatim copies of mouse.spec.ts lines, including all of `drive()` (lines 306-339) and the AC7 body (262-303).

**Failure scenario:** `AGAINST_THE_TOP = {top: 0, bottom: 79}` and `AGAINST_THE_BOTTOM = {top: 400, bottom: 479}` are derived from `PADDLE_HEIGHT = 80` and `COURT_HEIGHT = 480` in src/game/state.ts. Change PADDLE_HEIGHT to 60: the developer updates mouse.spec.ts:18-19 and the chromium project goes green, while the mobile-chrome project fails at touch.spec.ts:100 and :104 on constants that now describe no paddle that can ever be drawn. Every future change to paddle geometry, to the 420 px/s key speed encoded as `>50 / <85` (mouse.spec.ts:171-172 and touch.spec.ts:282-283), or to the sub-pixel reading rule in `centreOf` now has to be made twice, in two files that no import ties together.

**Suggested direction:** Move the three constants and the four pure helpers into tests/e2e/support/pong.ts and import them from both specs. That is an import-only edit to mouse.spec.ts: every assertion in its seven tests stays byte-identical, so AC7's intent — no mouse test weakened to make touch work — still holds, even though the file's import list changes. If the literal reading of "without modification" is meant to bind, the extraction can land as a follow-up commit after the touch work is verified green.

### F2 — nit

**Claim:** `touchDrag` is a wrapper with a single caller and a guard clause no caller can reach.

**Location:** `tests/e2e/support/pong.ts:372`

**What:** `touchDrag` is exported from the shared support module but is called exactly once, at touch.spec.ts:240, with two points. Inlined at that call site it is four lines (`finger`, `down`, `moveTo`, `up`). Its `points.length === 0` guard at lines 373-375 is reachable only by calling `touchDrag(page)` with no points, which nothing does and nothing tests; the variadic signature is what makes that call type-check at all.

**Failure scenario:** A reader of support/pong.ts meets two overlapping gesture APIs (`finger` and `touchDrag`) and must work out that they are the same primitive, and the error string 'a drag needs somewhere to start' can never be produced by any code in the repository — dead on arrival rather than latent. The plan's build note justifies the pair with 'Both are used', which is true only in the sense that one of them is used once.

**Suggested direction:** Either inline the four lines at touch.spec.ts:240 and drop `touchDrag`, or if the whole-gesture form is worth keeping, give it a non-variadic `(page, from: Point, to: Point)` signature so the unreachable emptiness check disappears with it.

## Notes

Production code (src/input.ts, src/style.css, index.html) is clean under this lens: the `mousemove` -> `pointermove` swap leaves no orphaned listener or removal, `drivesPaddle` has a real call site as well as its unit tests, and every import in touch.spec.ts is used. Two things I looked at and deliberately did not report: (a) `body { overscroll-behavior: none }` in src/style.css is redundant with the `html` declaration under the viewport-propagation rule, but it is harmless belt-and-braces and touch.spec.ts:164-167 asserts both; (b) the `cancelled` field of `PointerTally` (support/pong.ts:255, 272-274, 305) looks like it may be an unreachable path given the plan's own C4/C7 claims that no `pointercancel` arrives under touch-action:none and that CDP touch dispatch never scrolls — but I could not verify that without instrumenting the page, and reporting it would have been a suspicion rather than a finding.

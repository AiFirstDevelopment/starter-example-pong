# Review: correctness

- **Lens:** correctness
- **Verdict:** findings
- **Diff range:** `ddd7c34...HEAD`

## Findings

### F1 — minor

**Claim:** `touch-action: none` on the canvas creates a landscape scroll range in which no touch gesture in the middle 94% of the screen width can scroll the page, so the mute button and score become effectively unreachable — the exact outcome AC5's rationale says the court-only freeze was chosen to avoid.

**Location:** `src/style.css:72`

**What:** The court is taller than a landscape phone viewport (measured: court spans page y 122–603, viewport 293 px, page 759 px). At any scroll offset in [122, 310] the entire viewport height is canvas. Because the canvas declares `touch-action: none`, none of it can start a page scroll, so the player cannot scroll out of that range except through the ~25 px body gutters at the extreme left/right edges (canvas left=25.5, right=825.5 at 851 px width) — which on Android are typically claimed by the system back-swipe.

**Failure scenario:** Load the page on a landscape phone (measured with Chromium at viewport 851x293, devicePixelRatio/isMobile of Pixel 5). Flick down once from the title: scrollY lands anywhere in [122, 310]. Now `document.elementFromPoint(x, y)` returns the `#court` canvas for every x in 26..825 at every y in 5..288 — verified. Every drag there is consumed by the paddle, and `touch-action: none` means none of them pan the page. The mute button (page y 592–741) and the score (page y ~60–110) are both off screen and stay off screen; the player is stuck at that scroll offset unless they hit a 25 px edge strip. AC5 states the court-only freeze is 'what keeps the mute button reachable in landscape, where the page is 741 px tall in a 293 px viewport and scrolling is the only way to reach it' — that criterion's stated purpose is not met. Portrait is unaffected (maxScroll measured as 0).

**Suggested direction:** Either give the player a scroll affordance that survives the freeze (e.g. keep a non-court band with `touch-action: auto` that is always on screen, or a mute control that does not require scrolling — an in-canvas or fixed-position toggle), or record explicitly in the plan/non-goals that landscape becomes unscrollable from the court until the responsive work item lands, so the follow-up is not lost. Do not relax the canvas to `pan-y` — that would take the vertical paddle drag back to the browser and undo the fix.

## Notes

Verified by execution, not just reading: unit 41/41 green, desktop e2e 27/27 green (all seven mouse cases unchanged and passing), touch e2e 9/9 green, `tsc --noEmit` clean. Geometry for the finding below was measured in real Chromium against the running preview build with `elementFromPoint` at scrollY=200 in an 851x293 landscape viewport. I also specifically checked the AC8 determinism test's use of `browser.newContext({ ...TOUCH_DEVICE })`, because a context built that way outside the Playwright runner gets no `baseURL` and `page.goto('/?seed=1')` throws "Cannot navigate to invalid URL" — under `playwright test` the runner does supply it, so that is not a defect. Working tree left clean; all probe files removed.

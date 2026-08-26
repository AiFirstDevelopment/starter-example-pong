# Review: test-quality

- Lens: test-quality
- Verdict: findings
- Diff range: 42e7afc...HEAD

## Findings

### F1 — major

**Claim:** AC3's aspect-ratio guard is exercised at exactly one viewport (802x293), the one viewport where the distortion the build notes discovered is invisible — so the whole suite passes green with the defective spelling restored.

**Location:** tests/e2e/touch.spec.ts:447

**What:** `landscape AC3` asserts the 1.667 ratio only inside `test.describe('a phone held sideways')`, whose `test.use({ viewport })` is a single 802x293 screen. AC3 says "at every viewport tested", and the build notes (plan.md:206-228) record that the *Approach*'s own spelling `flex: 1 1 auto` yields 0.79 on a narrow short screen — a defect found by hand, corrected by one keyword, and never locked down by a test.

**Failure scenario:** Verified by mutation on a scratch copy: change `src/style.css:182` back to the plan's `flex: 1 1 auto` and the full mobile-chrome suite passes 16/16, including `landscape AC3`. Measured at that mutation, the court renders 284 x 358.6 (aspect 0.792) at a 300x460 viewport and 304 x 378.6 (aspect 0.803) at 320x480 — both match `@media (max-height: 480px)`, both are ~0.87 outside AC3's 0.02 tolerance, and both draw the court standing on end. A future edit that reverts to the spelling the plan document still names ships undetected.

**Suggested direction:** Loop the ratio assertion over the viewports the build notes say were measured by hand (e.g. 300x460, 320x480, 851x393, 1200x200) rather than the single reference screen — a `for` over `page.setViewportSize` inside one test is enough.

### F2 — minor

**Claim:** `landscape AC2` passes for an element that is not rendered at all, so it does not guard "the mute button is reachable".

**Location:** tests/e2e/touch.spec.ts:433

**What:** `belowTheFold` reads `getBoundingClientRect()` and returns `Math.max(rect.bottom - innerHeight, -rect.top, 0)`. For a `display: none` element every rect field is 0, so the helper returns 0 and the assertion `toBe(0)` succeeds; `visibility: hidden` likewise leaves the rect on screen. Nothing in the test asserts the elements are actually visible.

**Failure scenario:** Verified by mutation: adding `#mute { visibility: hidden; }` inside the `max-height: 480px` block leaves all 7 landscape tests green, including `landscape AC2`. Adding `.controls { display: none; }` also leaves `landscape AC2` green (only `landscape AC8` trips, incidentally, because the court then grows to exactly 217 px). Hiding the mute button to win vertical space is precisely the shortcut this change already takes for `.hint`, and AC2 exists to catch its consequence — a player in landscape with no way to mute — yet the guard would stay green.

**Suggested direction:** Assert visibility as well as position, e.g. `await expect(page.locator(selector)).toBeInViewport()` (which requires a non-empty intersecting box) or a `toBeVisible()` alongside the existing rect check.

### F3 — minor

**Claim:** `overflow()` measures against `window.innerHeight`, which over-reports by 50 px at the iPhone SE viewport, so the "page still does not scroll" half of `landscape AC5` is blind to up to 50 px of unreachable content.

**Location:** tests/e2e/touch.spec.ts:391

**What:** The helper computes `document.documentElement.scrollHeight - window.innerHeight`. Probed inside the `mobile-chrome` project at `viewport: { width: 320, height: 568 }`, the page reports `innerHeight` 618 while `documentElement.clientHeight` and `visualViewport.height` are both 568 — the layout viewport is 50 px taller than anything the player can see. At 802x293 the two agree, so the landscape tests are exact; the SE case is not.

**Failure scenario:** Verified by mutation: appending `.hint { margin-bottom: 118px; }` to `src/style.css` puts the body's bottom edge at y 614.4 in a viewport whose visible height is 568, and `window.scrollTo(0, 500)` leaves `scrollY` at 0 — 46 px of the page is off screen and cannot be scrolled to, exactly the trap this work item exists to close. `overflow()` nonetheless reports 0 and `landscape AC5: an iPhone SE draws the court exactly as it did` passes green.

**Suggested direction:** Compare `scrollHeight` against `document.documentElement.clientHeight` (or `visualViewport.height`), which track the visible layout box under Chrome's mobile emulation, rather than `window.innerHeight`.

## Notes

Verification was done on a copy of the repo in the scratchpad (node_modules symlinked, preview port changed to 4188 because 4173 was already in use by an unrelated process). The reviewed working tree was not modified — `git status --porcelain` is empty after the run. Checks that came back clean and are therefore not reported: the falsifiability claims in the build notes hold (reverting src/style.css fails all 5 landscape tests and passes the 2 portrait ones; widening the query to max-height:800px fails both portrait tests); the superseded `touch-action` assertion is not weakened (mutating to `auto` fails it, and also fails four drag tests, so the diff's claim that the drag tests corroborate the relaxation is sound); the landscape tests are deterministic (seeded, faked clock, per-test contexts, no ordering or shared-state coupling); the exact-pixel portrait assertions derive from integer viewport arithmetic, not font metrics, so they are not a flakiness risk.

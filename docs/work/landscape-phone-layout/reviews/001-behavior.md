# Review: behavior

- Lens: behavior
- Verdict: findings
- Diff range: 42e7afc...HEAD

## Findings

### F1 — minor

**Claim:** Once the player uses the two-finger zoom this change hands back to the browser, a one-finger drag on the court stops driving the paddle entirely and pans the page instead, so the magnified court AC6 offers cannot be played on.

**Location:** src/style.css:78

**What:** `touch-action: pinch-zoom` makes the court pinch-zoomable, but a pinch-zoomed page always lets a one-finger drag pan the visual viewport, and Chromium claims the gesture away from the canvas the moment it does. AC6 asserts the one-finger drag "still drives the paddle and still does not pan or scroll the page, exactly as before"; both halves are false in the zoomed state AC6 itself invites the player into.

**Failure scenario:** Built app at http://localhost:4173/, Pixel 5 profile, viewport 802x293 (the plan's reference landscape). Tap the court to start - drags work: a drag from 80% to 20% of the court height moves the player paddle from court y 240 to 102.5, and back to 378.5. Now spread two fingers on the court (Input.dispatchTouchEvent, two points, 30px apart -> 110px apart): visualViewport.scale goes 1 -> 2.87, i.e. the court magnifies, exactly as AC6 advertises. From there, four consecutive one-finger drags spanning the full visible height of the court leave the paddle frozen at court y 434.5 every time (measured off the canvas bitmap), while visualViewport.offsetTop toggles 74 -> 146.5 -> 11 -> 146.5, i.e. the page pans under the finger. The game is still live throughout - the score advances 0-1 to 0-2 while the player has no control. Pinching back out to scale 1 restores the paddle (a drag then moves it 235.5 -> 40), so the state is recoverable but only by undoing the zoom. Reproduced identically in three separate runs; at scale 1 the same dispatch code moves the paddle every time, so the freeze is specific to the zoomed state.

**Suggested direction:** Either accept and record the trade-off explicitly (AC6's wording currently promises the drag behaves "exactly as before", which is not true once the court is zoomed), or keep the paddle usable while zoomed - e.g. drive the paddle from visualViewport-corrected coordinates and re-assert control on pointercancel, or reconsider whether magnification is worth losing the control it exists to make easier.

## Notes

Drove the built app (npm run build + vite preview on :4173) in Chromium under the Pixel 5 touch profile, with a scratch build of 42e7afc served on :4174 for before/after comparison. Working tree untouched; both servers stopped afterwards. AC1, AC2, AC3, AC4, AC5 and AC8 all check out against the running artifact, including on every real landscape phone profile in Playwright's device list, and the pre-change build reproduces the plan's stated failures (448 px overflow, mute button at page y 632.8-666.6). Off-script: played to 1-11 and restarted at two landscape sizes, exercised keyboard/mouse/mute, rotated mid-game, resized a desktop window into and out of the media query, and raised the browser's default font to 24 px - no regressions, no page or console errors. AC7 (test suite) is another lens's remit and I did not run it.

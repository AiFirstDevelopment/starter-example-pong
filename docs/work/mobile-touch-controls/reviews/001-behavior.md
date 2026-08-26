# Review: behavior

- **Lens:** behavior
- **Verdict:** findings
- **Diff range:** `ddd7c34...HEAD`

## Findings

### F1 — major

**Claim:** In landscape the court can fill the entire viewport, and `touch-action: none` on the canvas then leaves no surface a finger can scroll, permanently stranding the player away from the score, the status line and the mute button.

**Location:** `src/style.css:72`

**What:** `touch-action: none` is applied to the whole canvas, which in landscape is taller than the viewport. At scroll offsets between the court's top and (court bottom − viewport height) there is no visible non-court region left to start a scroll gesture from, so the page becomes unscrollable in both directions.

**Failure scenario:** Cold load of the built app in a Pixel 5 landscape context (viewport 802x293, document 741 px tall, court client rect y=122..585, mute button at y=633). One ordinary swipe up starting on the title/scoreboard strip (Input.synthesizeScrollGesture at x=400, y=60, yDistance=-150, gestureSourceType 'touch') scrolls to scrollY=152; the court client rect is now -20..443, covering the full 0..293 viewport. From there every subsequent touch scroll gesture is dead: swipe up and swipe down at x=100, x=400 and x=700 all leave scrollY at 152, as do swipes at x=8 and x=14 inside the 16 px page margin (Chromium's touch hit-slop still resolves those to the canvas). Only x=2 and x=800 — the outermost 1-2 px, which are system back-gesture zones on a real phone — still scroll. A real touchStart/touchMove/touchEnd drag across the court leaves scrollY at 152 as well, and a two-finger pan and a pinch on the court both do nothing. The mute button, the score and the status line are all off screen with no way to reach them, and `page.reload()` restores scrollY=152, so the state survives a reload. Before this change the same drag panned the page (confirmed on the live page by forcing `#court { touch-action: auto }`, where the identical gesture scrolls 196 px), so the player could always recover; now they cannot. This contradicts AC5's stated rationale that off-court scrolling 'is what keeps the mute button reachable in landscape'.

**Suggested direction:** Either scope the freeze so a scrollable surface always remains reachable (e.g. `touch-action: pan-y` on the court, or `touch-action: none` only when the court fits the viewport via a media query), or give the page a touch-reachable escape in landscape — a fixed-position control strip, or capping the court's rendered height to the viewport so the page never overflows behind a frozen canvas.

## Notes

Driven against the built bundle served by `vite preview` on http://localhost:4173, in real Chromium: Pixel 5 portrait and landscape contexts with hasTouch, using CDP Input.dispatchTouchEvent and Input.synthesizeScrollGesture for genuine finger input, plus a Desktop Chrome context for the mouse/keyboard paths. AC1, AC2, AC3, AC4, AC5, AC6 and AC7 were each walked on the running app and all held (AC1/AC4 landed 0 px off across six positions; AC3 was confirmed behaviourally as well as by computed style, with a touch-action:auto control proving the gesture honours the declaration). AC8 showed an identical paddle trace across two seeded runs and a ball trace differing only by a constant time offset, which is my harness's inability to pin load-to-tap elapsed time rather than nondeterminism. Untouched surfaces (desktop mouse from anywhere on the page, W/S and arrows, mute button, M key, wheel scrolling over the court, double-tap, multi-touch) were exercised and are all intact. The repository tree was not modified: `git status --porcelain` was empty at the end, and the preview server I started has been stopped.

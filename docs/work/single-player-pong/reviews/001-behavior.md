# Review: behavior

- **Lens:** behavior
- **Verdict:** findings
- **Diff range:** 4644a71...HEAD (plus uncommitted working-tree changes)

## Notes

Drove the built bundle via `npm run preview` (http://localhost:4173) and, separately, `npm run dev` (http://localhost:5173) in real Chromium with real key presses. Score read from the DOM, court read back out of the canvas pixels, audio observed by replacing window.AudioContext with a passive recorder before load (Playwright cannot hear). All ten acceptance criteria were walked and all ten hold — AC1 idle court and silence (AudioContext never constructed), AC2 serve + clamping at y0-79 / y400-479 held for 4s, AC3 CPU returns the seed=1 serve at x~753, AC4/5/6 three enveloped tones (square 459Hz/90ms, square 226Hz/16ms, sawtooth 490->120Hz/300ms), AC7 both scoring directions with a ~0.9s serve pause, AC8 both winners announced with play frozen and restart resetting to 0-0, AC9 mute by key and by button silencing all three events while play continues, AC10 three loads of ?seed=1 giving identical serve slope and first collision. Off-script probes that found nothing: mashing Space mid-rally, both arrows held together, 8s backgrounded tab, 70s of edge-aimed rallies scanned for double-hits/out-of-bounds/paddle-clamp escapes, window blur with a key held, ?seed=abc / -3 / 1.5 / empty, and console/pageerror monitoring throughout. The two findings below are the only observed misbehaviours. No files were modified; `git status --short` shows only the pre-existing state.json change.

## Findings

### F1 — major

**Claim:** Pressing W (or S) while Shift is held jams the player's paddle against the wall for the rest of the game; no key press recovers it.

**Location:** `src/input.ts:47`

**What:** keydown stores the raw event.key, so Shift+W stores "W", but the matching keyup after Shift has been released reports "w", so held.delete(event.key) removes nothing and the key stays held forever.

**Failure scenario:** Load http://localhost:4173/?seed=1, press Space to start, park the paddle at the bottom (y=439) with ArrowDown. Now hold Shift, press W for 200 ms, release Shift, then release W — a natural sequence for anyone with WASD/FPS muscle memory. Observed: the paddle keeps travelling up on its own and stops only at the top clamp (y=39), 300 ms / 800 ms / 1.5 s / 2.5 s after the key was released. It is then unrecoverable: tapping `s` -> y=39, holding `s` for 1.2 s -> y=39, holding ArrowDown for 1.5 s -> y=39, tapping `w` then holding ArrowDown -> y=39. Only dispatching a window blur (alt-tab / clicking outside) clears it, after which ArrowDown works again (y=439). The keydown/keyup pair the page actually received was `down "W"` then `up "w"`, confirmed with a capture-phase listener. This breaks AC2's guarantee that ArrowDown/S move the paddle down: for the rest of the game the player cannot move at all and the CPU scores freely.

**Suggested direction:** Track held keys by event.code (KeyW / KeyS / ArrowUp / ArrowDown) rather than event.key, or normalise event.key case before adding to and deleting from the held set.

### F2 — minor

**Claim:** The Space key that starts the game is not preventDefault()ed, so on viewports shorter than the page it scrolls the score, and at ~600px the top of the court, out of view.

**Location:** `src/input.ts:36`

**What:** preventDefault() is called only for UP_KEYS/DOWN_KEYS; every other key, including the Space that a player naturally uses to start, keeps its default browser action.

**Failure scenario:** Set the browser window to 1280x600 (a 1366x768 laptop with Chrome chrome gives roughly this; the document is 744 px tall). Load http://localhost:4173/?seed=1 — scrollY is 0 and the whole page is visible. Press Space to start, as the on-screen prompt "Press any key to start" instructs. Observed: scrollY jumps to 144; the scoreboard's bounding box is top=-72 bottom=-34, i.e. entirely above the viewport, and the court's top edge is at y=-22, so the top wall and any ball near it are clipped off screen (screenshot confirms the title, score and status line are all gone). The player is left watching a cropped court with no visible score, which is the only place the score is shown (canvas paints no score). At 1280x650 the scoreboard is half cut off (top=-22). ArrowUp/ArrowDown/Enter correctly do not scroll — only the start key does.

**Suggested direction:** Call event.preventDefault() for the start key as well (or for Space/PageUp/PageDown specifically), the same way the arrow keys are already handled on line 38.

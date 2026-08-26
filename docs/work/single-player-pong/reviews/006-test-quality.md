# Review: test-quality

- **Lens:** test-quality
- **Verdict:** findings
- **Diff range:** 4644a71...HEAD (plus uncommitted working-tree changes)

## Notes

All four findings were verified empirically by mutating a copy of the project in the scratchpad (own port, symlinked node_modules) and re-running the suite; the repository tree was not modified (git status identical to session start). Baseline: 23 unit tests and 13 Playwright tests all pass, and I found no timing flakiness — the paused fake clock makes every frame-indexed assertion deterministic, with comfortable margins (verified by re-deriving the event frames with a headless simulation of main.ts's fixed-timestep loop and confirming them in-browser: seed 1 paddle hit f64, wall f138, out-of-play f193, game-over f2251 vs the 3600-frame budget). One weak assertion I deliberately did not report: cpu.test.ts:34 (CPU_SPEED < BALL_SPEED) proves nothing about beatability, but it is redundant — setting CPU_SPEED to 280 makes the AC7 player-scores e2e test fail, so the behaviour is guarded.

## Findings

### F1 — major

**Claim:** The AC9 mute test never exercises a paddle strike while muted, so a mute regression affecting the paddle sound is invisible to the whole suite.

**Location:** `tests/e2e/sound-control.spec.ts:23`

**What:** The muted window is frames ~81-300 after the Space press. For seed 1 that contains the wall hit (frame ~138) and the out-of-play (frame ~193) but the next paddle hit falls at frame ~305, five frames after the window closes. The test title and AC9 both claim all three events are silenced; only two are checked.

**Failure scenario:** I changed src/audio.ts play() to `if ((muted && kind !== 'paddle-hit') || context === null) return;` — i.e. the paddle sound keeps playing at full volume after the player mutes — and ran the full suite in a scratchpad copy: 13/13 passed, including both AC9 tests. A player who mutes and then keeps rallying still hears every paddle strike, and no test reports it.

**Suggested direction:** Widen the muted window past the next paddle strike (runFrames(240) instead of 220 puts frame ~305 inside it) and assert the count is still 1, or press mute earlier so a paddle hit is guaranteed inside the muted stretch. Asserting on the kinds of the recorded sounds rather than only the length would make the intent explicit.

### F2 — major

**Claim:** The behavioural suite can report a full pass against a bundle that was never rebuilt from the current source.

**Location:** `playwright.config.ts:20`

**What:** `reuseExistingServer: !process.env.CI` is paired with `command: 'npm run build && npm run preview'`. When anything is already listening on 4173, Playwright skips the command entirely, so the build never runs and the tests exercise whatever dist/ was last built from.

**Failure scenario:** Observed live in this session: a stray `vite preview --port 4173` (PID 47853, started 10:23:31) was still listening from an earlier run. My `npx playwright test` at 10:28 printed '13 passed' while dist/index.html and dist/assets/*.js kept their 10:23:22 mtimes — nothing was rebuilt. A developer who edits src/, leaves that server up and runs `npm run test:e2e` gets a green suite for code the browser never loaded, which is exactly how the AC-by-AC mutation verification in the plan's build notes could silently produce false 'fails'/'passes'.

**Suggested direction:** Either run the build as a separate step before Playwright starts (webServer command = preview only, build in the npm script), or drop reuseExistingServer so every run serves a freshly built bundle.

### F3 — minor

**Claim:** The AudioContext recorder captures scheduled tones but never the graph connection, so a completely silent game passes AC4, AC5 and AC6.

**Location:** `tests/e2e/support/pong.ts:136`

**What:** The recording gain node's `connect(target) { return target; }` throws the target away, and nothing anywhere records or asserts a connection to `destination`. A sound is recorded at `oscillator.start()` regardless of whether it is wired to anything audible.

**Failure scenario:** I deleted `oscillator.connect(envelope); envelope.connect(context.destination);` from src/audio.ts — a game that schedules three oscillators nobody can hear — and the full suite passed 13/13, including 'AC4: a paddle strike plays the paddle sound', 'AC5: a wall strike sounds different' and 'AC6: the ball leaving the court plays a third sound'. Audio is the distinguishing requirement of this work item, and the tests would not notice its total loss.

**Suggested direction:** Have the double record the connection chain (it already stashes `target.record.owner`) and assert in at least one sound test that the recorded tone reached the context destination, e.g. record a `connectedToDestination` flag on the oscillator's record.

### F4 — minor

**Claim:** AC8's 'the winner is announced on screen' is only tested for a computer win; the player-win announcement is never rendered by any test.

**Location:** `tests/e2e/scoring.spec.ts:73`

**What:** The only winner assertion is `toHaveText('Computer wins! Press any key to play again')`. grep for 'You win' matches src/main.ts:53 and nothing under tests/. main.ts has no unit tests, and step.test.ts only checks `state.winner === 'player'`, not what is displayed.

**Failure scenario:** Change src/main.ts:53 to `const winner = state.winner === 'player' ? '' : 'Computer wins!';` — a player who reaches 11 sees the bare text 'Press any key to play again' with no announcement of their win — and every unit and e2e test still passes, because no test ever drives the game to a player victory.

**Suggested direction:** Add a case that reaches a player win (a seed where the idle/scripted player wins is slow, so a short-game seed plus held movement keys, or a direct assertion on the status text via a player-win rally) — or at minimum extract the announcement text into a pure function and unit test both branches.

# Review: simplicity

- **Lens:** simplicity
- **Verdict:** findings
- **Diff range:** 4644a71...HEAD (plus uncommitted working-tree changes)

## Notes

Scope checked: all 12 new source/test/config files plus index.html, style.css and README. The pure simulation (state.ts, step.ts, cpu.ts, rng.ts) is compact with no dead exports beyond type declarations used within their own module, and no speculative abstraction — `soundFor`, `frameOfSound` and `element()` all have multiple real call sites. The base commit (4644a71) added only .claude/settings.json and docs/work/.gitkeep, so there was no pre-existing code or convention available to reuse. The mirrored `hitPlayer`/`hitCpu` conditions at step.ts:119-128 are structurally duplicated but deliberately readable as a mirror; I judged that a style preference rather than a defect and did not report it. Performance of the per-frame full-canvas scan in `sample` is left to another lens.

## Findings

### F1 — minor

**Claim:** The canvas ball-detection pixel scan is duplicated verbatim between `ballAt` and `sample` in the same file, including the four magic colour thresholds.

**Location:** `/Users/joelstevick/projects/starter-example-3/tests/e2e/support/pong.ts:164`

**What:** Lines 164-184 (inside `ballAt`) and lines 268-289 (inside `sample`) are byte-identical apart from one comment: same `getImageData` call, same `data[i] > 200 && data[i+1] > 150 && data[i+1] < 240 && data[i+2] < 160` predicate, same centroid accumulation, same `found === 0 ? null : {x: sumX/found, y: sumY/found}`. `ballAt` is expressible as `(await sample(page)).ball` with identical semantics — both return null when the 2D context is missing and both return the same centroid otherwise.

**Failure scenario:** Change `BALL_COLOUR` in src/render.ts:22 from `#ffd166` to a colour outside the amber window (e.g. `#7ee787`) and update the threshold in only one copy. `court.spec.ts` (which uses `ballAt`) still finds the ball and passes, while `collisions.spec.ts`/`scoring.spec.ts`/`replay.spec.ts` (which go through `sample` via `recordFrames`) get `ball: null` on every frame and fail with `the ball was not on the court between frames 94 and 99` from `travel()` — a failure that points at the collision code rather than at the stale second copy of the scanner.

**Suggested direction:** Delete the body of `ballAt` and define it as `return (await sample(page)).ball;`, or hoist the scan into one function both `page.evaluate` callbacks call.

### F2 — minor

**Claim:** `Keyboard.dispose` is declared and implemented but never called anywhere in src or tests — unreachable production code.

**Location:** `/Users/joelstevick/projects/starter-example-3/src/input.ts:69`

**What:** The `dispose` member is declared at src/input.ts:19 and implemented at src/input.ts:69-73 (three `removeEventListener` calls). `grep -rn "\.dispose\|dispose(" src tests` returns only the declaration and the implementation. The single caller, src/main.ts:95, stores the keyboard in `const keyboard` and only ever calls `keyboard.input()` (src/main.ts:109). The app has one page-lifetime keyboard and no unmount path, so teardown can never run.

**Failure scenario:** No input can reach this code: there is no call site, so if the removeEventListener arguments were wrong (e.g. removing a differently-bound handler) no unit test, no behavioural test, and no user action would ever surface it. The 7 lines exist only to be read and maintained. Its presence also forces the three handlers to be hoisted into named consts purely so a never-used teardown can reference them.

**Suggested direction:** Drop `dispose` from the `Keyboard` interface and its implementation until something actually tears the keyboard down.

### F3 — nit

**Claim:** The CSS custom property `--ball` is defined and never referenced; the ball colour actually lives hard-coded in render.ts.

**Location:** `/Users/joelstevick/projects/starter-example-3/src/style.css:6`

**What:** `--ball: #ffd166;` is declared in `:root`, but `grep -n "var(--" src/style.css` shows only `--ink`, `--muted` and `--court` are ever consumed — `var(--ball)` appears zero times. The value that actually paints the ball is `BALL_COLOUR = '#ffd166'` at src/render.ts:22, and the e2e ball detector keys off that same hex.

**Failure scenario:** A developer asked to change the ball colour finds `--ball` in the stylesheet, edits it to `#7ee787`, reloads, and sees no change at all: the canvas ball is still amber because render.ts:22 owns the colour. The stylesheet advertises a knob that does nothing.

**Suggested direction:** Delete `--ball`, or make render.ts read it via `getComputedStyle` so there is one source for the colour.

### F4 — nit

**Claim:** `centredBall()` exists to own the centre-spot ball, then is bypassed by two inline copies of the same literal, one of them in another module.

**Location:** `/Users/joelstevick/projects/starter-example-3/src/game/step.ts:152`

**What:** src/game/state.ts:63 defines `centredBall()` and it is used by `createState`, `startGame` and `beginServe`. But `serve()` at src/game/state.ts:120-127 re-inlines `x: COURT_WIDTH / 2, y: COURT_HEIGHT / 2`, and the game-over reset at src/game/step.ts:152 writes the whole literal `{ x: COURT_WIDTH / 2, y: COURT_HEIGHT / 2, vx: 0, vy: 0 }` again — a third copy, in a module that already imports `beginServe` and `serve` from state.ts. `centredBall` is not exported, so step.ts cannot reuse it as written.

**Failure scenario:** A later change moves the serve spot off dead centre (e.g. serve from the conceding side's third) by editing `centredBall()`. `createState`, `startGame` and `beginServe` follow; `serve()` and the game-over reset in step.ts:152 keep placing the ball at the old centre, so the ball visibly teleports between the pause position and the served position, and the game-over court shows the ball somewhere the idle court never puts it.

**Suggested direction:** Export `centredBall()` and use it in `serve()` (`{ ...centredBall(), vx, vy }`) and at step.ts:152.

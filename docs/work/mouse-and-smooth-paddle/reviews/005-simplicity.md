# Review: simplicity

- **Lens:** simplicity
- **Verdict:** findings
- **Diff range:** 48e080f...HEAD

## Findings

### F1 — The new `spanAt` inside `sample()` is a second copy of `paddleAt`'s pixel-scan, when `paddleAt` could delegate to `sample` the way `ballAt` already does in the same file.

- **Severity:** minor
- **Location:** `tests/e2e/support/pong.ts:310`

**What**

`spanAt` (lines 310-321) reads a canvas column for pixels with r,g,b all >200 and returns `{top,bottom}`, with `{top:-1,bottom:-1}` when nothing is found. `paddleAt` (lines 185-204) does exactly the same thing on the same columns (30 for the player, 770 for the cpu) with the same threshold and the same sentinel. Eighteen lines say the same thing twice. The file already shows the alternative: `ballAt` at line 180 is just `(await sample(page)).ball`, so `paddleAt` could be `(await sample(page))[side]` and the duplicate loop deleted. All seven e2e specs install `recordSound` in a beforeEach, so `sample()`'s read of `window.__sounds` is safe from every existing `paddleAt` call site.

**Failure scenario**

The two readers are now the only definition of 'where the paddle was drawn', and different tests use different ones: `mouse.spec.ts:96` asserts `expect(await paddleAt(page,'player')).toEqual(AGAINST_THE_TOP)` via `paddleAt`, while `smoothness.spec.ts:47` measures `entry.player.top` via `sample`. Change `PADDLE_COLOUR` in `src/render.ts:21` from `#f8fafc` to anything with a channel at or below 200 (e.g. `#c7d2fe`, r=199) and update the threshold in `paddleAt` only — the doc comment at pong.ts:245 and the plan both point a maintainer at `paddleAt` as the canonical reader. `sample()` then returns `player: {top:-1,bottom:-1}` for every frame, and the AC5 test at smoothness.spec.ts:47 fails with `Error: nothing to measure between frames 0 and 1` thrown from `frameSteps` instead of a smoothness assertion, while the AC1/AC2 tests pass — a failure that points at the wrong module.

**Suggested direction**

Delete `spanAt` and the duplicate loop in `paddleAt`; make `paddleAt(page, side)` return `(await sample(page))[side === 'player' ? 'player' : 'cpu']`, mirroring `ballAt` at line 180. `sample()` keeps one inline column scan, called twice.

### F2 — `Box.width` is never read by any caller; the field is dead as introduced.

- **Severity:** nit
- **Location:** `tests/e2e/support/pong.ts:41`

**What**

The new `Box` interface (lines 38-43) declares `left`, `top`, `width`, `height`, and `courtBox` populates all four. Grepping every use of `courtBox`'s result across `tests/e2e/mouse.spec.ts` (lines 62, 77, 102, 139, 160, 196, 230) shows only `box.left`, `box.top` and `box.height` are read. The two `.width` references in that file are `viewport.width`, from `page.viewportSize()`, not from `Box`.

**Failure scenario**

`courtBox` is called eight times across the AC1-AC7 tests and each call serialises a `width` across the CDP boundary that nothing ever reads. Concretely, a reader of `Box` at pong.ts:38 has to check all eight call sites to learn that horizontal scaling is not part of what the mapping under test depends on — the interface advertises a two-dimensional contract for a mapping (`courtY` in src/input.ts:49) that is purely vertical.

**Suggested direction**

Drop `width` from `Box` and from `courtBox`'s return, leaving `{left, top, height}` — the three fields the pointer mapping and its tests actually use.

## Notes

Production code is clean under this lens: no dead code, no leftovers from the createKeyboard -> createControls rename (verified by grep across src, tests, README, index.html), and `interpolate`/`mix` in src/render.ts and the `targetY` branch in src/game/step.ts are minimal. Considered and dropped as preference rather than defect: `courtYOf` in mouse.spec.ts:41 re-deriving `courtY` (deliberate independent test oracle, and e2e specs never import src anywhere in this repo); `ballTravel` in smoothness.spec.ts:17 sitting alongside `frameSteps` (2D magnitude vs 1D signed delta, genuinely different); the `onClick` wrapper in src/input.ts:134; and the repeated goto/press/runFrames preamble in mouse.spec.ts. Two smaller dead-ish spots I verified but judged below the reporting bar: the `=== null` arms of `frameSteps` (pong.ts:345) are unreachable because both call sites pass `number[]` from `Span.top`, and `drive()` (mouse.spec.ts:223-227) repeats the newContext/installClock/recordSound/goto scaffolding of `openingRally` (replay.spec.ts:17-21).

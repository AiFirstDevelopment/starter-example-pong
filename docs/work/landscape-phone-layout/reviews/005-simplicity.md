# Review: simplicity

- Lens: simplicity
- Verdict: findings
- Diff range: 42e7afc...HEAD

## Findings

### F1 — nit

**Claim:** `flex: 0 1 auto` on the landscape canvas is the CSS initial value, so the declaration and the eight-line comment defending it have no effect on layout.

**Location:** src/style.css:182

**What:** A no-op declaration carrying a paragraph of justification, which reads as though flex sizing were being configured when the only load-bearing declaration in that rule set is `min-height: 0`.

**Failure scenario:** `flex-grow: 0`, `flex-shrink: 1`, `flex-basis: auto` are the initial values of the three longhands, and no other rule in the stylesheet sets `flex` on `canvas`. I measured the court at 802x293, 300x460, 320x480, 1200x200, 200x200 and 667x375 with the stylesheet as shipped and again with an inline `flex: initial` override: identical to two decimal places at every one (802x293 gives 319.34x191.61 both ways). Deleting the declaration changes nothing. By contrast, overriding `min-height: auto` at 802x293 blows the court up to 785.98x471.59 with 276 px of overflow, so that is the declaration actually doing the work. A reader who later needs to change the sizing will spend time on a line that does not participate.

**Suggested direction:** Drop the `flex: 0 1 auto` declaration and keep the second comment paragraph (reworded as "it must not be allowed to grow, because…") next to `min-height: 0`, which is what actually enables the shrink.

### F2 — nit

**Claim:** `courtSize` re-implements the shared `courtBox` helper's DOM read instead of extending it, leaving two `getElementById('court').getBoundingClientRect()` readers in the suite.

**Location:** tests/e2e/touch.spec.ts:379

**What:** Duplication of an existing shared helper. `courtBox` in `tests/e2e/support/pong.ts` already evaluates the same rect on the same element and returns `{ left, top, height }`; `courtSize` returns `{ width, height }` from an identical evaluate. The doc comment on `Box` gives the reason width was omitted ("advertising a horizontal half would suggest the pointer's x mattered to it"), but this change introduces the first tests that genuinely need width, so that reason no longer holds.

**Failure scenario:** Within the same describe block, `landscape AC3` reads the court through `courtSize` and `landscape AC8` reads it through `courtBox` — two round trips and two copies of the `getElementById('court') as HTMLCanvasElement` lookup for one element. If the court's id or element type changes, or the measurement has to account for the 1 px border (which the AC3 comment already acknowledges skews the ratio), the fix has to land in both places and can silently land in only one: `courtBox` would keep reporting the old geometry to the drag tests while `courtSize` reported the new geometry to the ratio tests. Note that the repo already shares every DOM-reading helper (`courtBox`, `paddleAt`, `courtImage`, `computedStyle`, `score`) in `support/pong.ts` and duplicates only pure arithmetic locally, with a comment explaining why.

**Suggested direction:** Add `width` to `Box` and return it from `courtBox`, update that interface's doc comment to say why width now exists, and delete `courtSize` — the three call sites can destructure what they need.

## Notes

Verified by runtime experiment rather than by reading alone: I served the app with `npx vite` on port 5199 and used Playwright with the Pixel 5 device to override single CSS properties inline, measuring the court's rect at 802x293, 300x460, 320x480, 851x393, 667x375, 1200x200 and 200x200. No files were changed; `git status` is clean.

Declarations I checked and found genuinely load-bearing, so did not report: `min-height: 0` (without it the court is 785.98x471.59 with 276 px of overflow at 802x293), `width: auto` (leaving the base `width: 100%` gives ratio 4.10 at 802x293 and 8.11 at 1200x200), `max-width: 100%` (without it the court is 597.67 px wide inside a 300 px viewport), `aspect-ratio: 800 / 480` (with `aspect-ratio: auto` the natural ratio applies to the content box while `box-sizing: border-box` is in force, giving 1.6531-1.6597), `.status { min-height: 1rem }` and the `button` padding override (both change the height the court is left).

Two candidates I considered and dropped rather than report as noise: `landscape AC4`'s `scrollTo(0, 500)` assertion is strictly implied by `landscape AC1`'s zero-overflow assertion, but both are separately numbered criteria the plan requires coverage for; and `--page-padding-block` is declared on `:root` only inside the media query and used twice within it, which is a documented two-use token rather than a defect.

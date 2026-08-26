# Review: spec-fidelity

- **Lens:** spec-fidelity
- **Verdict:** findings
- **Diff range:** `ddd7c34...HEAD`

## Findings

### F1 — nit

**Claim:** Claim C5 (and AC7, which it backs) states there are seven tests in tests/e2e/mouse.spec.ts; the file contains eight. C5 is ticked [x] and the Build notes assert "every claim C1-C7 held".

**Location:** `docs/work/mobile-touch-controls/plan.md:152`

**What:** C5 reads "...so the seven tests in `tests/e2e/mouse.spec.ts` pass unchanged." AC7 (plan.md:57) repeats the same count. `tests/e2e/mouse.spec.ts` declares eight `test(...)` blocks: lines 56, 73, 96, 130, 154, 192, 252 and 263. The eighth ('AC4: a key held down while the mouse moves does not snatch the paddle back', mouse.spec.ts:263) is the one the count omits, and it is precisely the mouse-versus-key arbitration case that a `mousemove` -> `pointermove` swap is most likely to disturb.

**Failure scenario:** A reviewer or a future builder taking C5/AC7 at face value enumerates seven mouse regression tests as the surface that must stay green, and never notices that mouse.spec.ts:263 is part of that surface. Concretely: `npx playwright test tests/e2e/mouse.spec.ts` reports 8 passed, not 7, so the plan's stated verification scope and the actual suite disagree. I ran the full suite against a fresh build and all eight do pass unmodified, so AC7's substance is met and nothing is broken today - the defect is that a claim marked as verified is false as written.

**Suggested direction:** Correct the count to eight in both C5 (plan.md:152) and AC7 (plan.md:57), or drop the number and name the file alone so the claim cannot drift as tests are added.

## Notes

Verification was done by reading the diff and by executing the assembled app, never by editing it: `git status --porcelain` is empty before and after. The build and the Playwright runs used a scratchpad `--outDir` and port 4399 rather than the repo's `dist/` and port 4173, because a stale `vite preview` (pid 58537) was already holding 4173 and may belong to a concurrently running reviewer. Everything substantive in the plan checks out: all eight ACs have behavioural coverage that passes, C1-C4/C6/C7 hold against the repository, no Non-goal was built, no PLAN DEFECT note exists for this work item, and the one falsifiability claim I could test independently (AC5's "weakening drivesPaddle makes the paddle jump to {top: 9}") reproduces. The single finding is a documentation-level off-by-one with no behavioural consequence; if the judge is triaging, this branch is substantively faithful to its plan.

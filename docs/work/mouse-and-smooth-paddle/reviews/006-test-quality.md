# Review: test-quality

- **Lens:** test-quality
- **Verdict:** findings
- **Diff range:** 48e080f...HEAD

## Findings

### F1 — The auto-repeat guard that stops a held key from snatching the paddle back from a moving mouse is untested; the suite stays fully green with it removed.

- **Severity:** minor
- **Location:** `/Users/joelstevick/projects/starter-example-3/tests/e2e/mouse.spec.ts:188`

**What**

The AC4 test's closing assertion (`// And keeps it: the key is still down, and twenty frames of it move nothing.`) is presented as guarding the mechanism at src/input.ts:92 — `if (!event.repeat) { targetY = null; }` — which the build notes call "the mechanism behind AC4's 'a stationary mouse never fights a held key'". Playwright's `page.keyboard.down('ArrowDown')`, called once, dispatches exactly one keydown with `repeat: false`. No repeat keydown is ever delivered in any test, so the assertion passes identically whether the guard is present or not.

**Failure scenario**

I changed src/input.ts:92 from `if (!event.repeat)` to `if (true)` in an isolated copy and ran the whole suite: 25/25 Playwright and 38/38 Vitest still passed. To show the mutation is a real user-visible regression rather than dead code, I added a throwaway probe that reproduces browser auto-repeat (Playwright marks a second `keyboard.down` of an already-pressed key with `repeat: true`; the page observed the flags `[false, false, true, true]`). Against the shipped source the probe passes — mouse target held at `{top: 32, bottom: 111}`. Against the mutation the paddle jumps to `{top: 164, bottom: 242}`: the still-held ArrowDown reclaims the paddle from the mouse. So a real player holding an arrow key while moving the mouse loses mouse control ~30x/second, and every test in the repository stays green.

**Suggested direction**

Add one e2e case that emits repeat keydowns — call `page.keyboard.down('ArrowDown')` two or three times for the same key while the mouse target is set, then assert the paddle is still where the pointer put it. That is the only thing separating this from a silent regression.

### F2 — In the stuck-key test the diff edits, the middle assertion compares 0 with 0 and cannot fail.

- **Severity:** minor
- **Location:** `/Users/joelstevick/projects/starter-example-3/tests/e2e/court.spec.ts:115`

**What**

`expect(await paddleAt(page, 'player')).toEqual(released)` is written to check "nothing is being held now, so the paddle stays where it was let go". But 30 frames of held `W` is 30 x 16 ms x 420 px/s = 201.6 px of travel from a centred paddle at top = 200, so the paddle is already pinned against the top clamp when the key is released.

**Failure scenario**

I confirmed `released.top === 0` empirically: running the stuck-key mutation (`w` never removed from `held`) produced `expect(received).toBeGreaterThan(expected) / Expected: > 0 / Received: 0` at line 121, i.e. `released.top` is 0. So line 115 evaluates `expect({top: 0, bottom: 79}).toEqual({top: 0, bottom: 79})`. A paddle that keeps gliding upward after the key is released — exactly the defect the test is named for — is invisible to that assertion, because there is nowhere left to glide to. Only the ArrowDown check at line 121 actually catches it. This is pre-existing rather than introduced here, but the diff touches this test (line 109) and the build notes explicitly ask a reviewer to look at it.

**Suggested direction**

Hold `W` for ~10 frames instead of 30 so the paddle is released in open court, well clear of the clamp. Then line 115 becomes a real check that the paddle stopped, and line 121 keeps its independent value.

## Notes

Verified by running both suites against the repo (38 unit + 25 e2e, all green) and by mutation-testing an isolated copy of the tree under /private/tmp/.../scratchpad/mut. The repo working tree was not modified at any point (git status --porcelain clean).

Mutations the suite correctly kills, so these tests are load-bearing: alpha forced to 1 (AC5 + AC8 fail); `previousState = state` hoisted out of the while loop in src/main.ts (AC5 + AC8 fail); phase guard removed from `interpolate` in src/render.ts (the seed-7 smearing test fails); a `w` key that never leaves `held` (court.spec.ts:121 fails).

On the build note's open question about C4: I reproduced a stuck `w` with the current test text in place, and the test still fails — at line 121, the ArrowDown check. The added `await runFrames(page, 2)` at court.spec.ts:109 does not mask the regression, so it is not a weakening. The separate weakness in that test is reported as F2.

No flakiness risk found: every new e2e test is driven by Playwright's paused clock and a fixed seed, and the two tightest thresholds (`unevenness(...) <= 1` on 6.72 px/frame paddle steps and 2.56 px/frame cpu steps) are structurally 6/7 and 2/3 respectively, so the metric cannot exceed 1 without an actual regression. `interpolate` has no unit test, but three separate mutations of it are caught behaviourally, so I am not reporting that as a gap.

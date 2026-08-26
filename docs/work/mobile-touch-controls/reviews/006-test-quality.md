# Review: test-quality

- **Lens:** test-quality
- **Verdict:** findings
- **Diff range:** `ddd7c34...HEAD`

## Findings

### F1 — minor

**Claim:** Two of the three drag assertions in the AC5 test are vacuous, and the one that is not has no premise guard, so the test can silently stop guarding AC5 while staying green.

**Location:** `tests/e2e/touch.spec.ts:216`

**What:** The AC5 loop dispatches three touch moves from a gesture begun on the hint text and asserts the paddle did not move after each. I instrumented the assembled page and measured what actually arrives: exactly one pointermove (target = the hint <p>, pointerType 'touch'), immediately followed by pointercancel — reproducibly, 15 runs out of 15. Because seenTheFinger (tests/e2e/support/pong.ts:305) returns as soon as tally.cancelled is set, and cancelled is only reset in Finger.down, the second and third moveTo calls become fire-and-forget: they dispatch a CDP event that produces no page-level pointer event at all, then return. Iterations 2 and 3 therefore assert against a state that nothing could have changed. The test's entire falsifying power rests on the single event that squeaks through before the cancel, and nothing in the test asserts that it arrived. The inline comment ("Dragged the length of the court, which would throw the paddle end to end") is false for two of the three moves.

**Failure scenario:** Chromium's compositor makes the scroll decision one event earlier — a browser update, a different device profile, or a layout where .hint sits inside a scroll container. Zero touch pointermoves then reach the page for the whole gesture. seenTheFinger returns instantly on cancelled for every moveTo, all three paddleAt readings equal `before`, and the test passes — including with drivesPaddle replaced by `() => true`, which is precisely the revert the plan cites as the only thing that makes this test fail (it reports the paddle jumping to {top: 9}, which is the first delivered move and nothing else). AC5 is the one criterion asserting a negative, so its regression coverage would vanish with no visible signal.

**Suggested direction:** Guard the premise the way tests/e2e/mouse.spec.ts already does for event.repeat: after the drag, read the tally back and assert at least one pointermove with pointerType 'touch' actually reached the page (a `touchMoves` counter alongside `moves` in PointerTally would do it), so the test fails loudly if it ever becomes vacuous. Dropping iterations 2 and 3, or making seenTheFinger distinguish "delivered" from "cancelled" to its caller, would also stop the spec claiming coverage it does not have.

## Notes

Verified by execution, not by reading. Ran both projects against a freshly built dist on private ports (the repo's own 4173 was occupied by another reviewer): 41 unit, 27 chromium, 9 mobile-chrome, matching the build notes. Repeated the touch spec 12x and 5x (108/108 and 45/45, no flakes, retries:0). Instrumented the assembled page from a scratchpad-only harness to observe what actually reaches it: (a) a court-originated drag carried to y=2 and y=800 delivers 3 pointermoves with target === 'court' and zero pointercancel, so claim C4 and AC2 are genuinely exercised; (b) page.touchscreen.tap emits zero pointermove, so AC6's "the paddle stays where the drag left it" is not accidental; (c) Pixel 5 portrait has scrollHeight === clientHeight === 727, so the page under test cannot scroll at all — AC5's "the page scrolls as it normally would" half is only ever asserted as a touch-action: auto proxy, which the plan documents under C7 and I have not raised separately. Repo tree left clean at 7a5b954.

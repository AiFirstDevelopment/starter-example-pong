# Review 006 — test-quality

- Lens: test-quality
- Verdict: findings
- Diff range: `5012fe0...HEAD`

## Findings

### F1 (minor)

**Claim:** The test that guards AC6's "at least a hundred million distinct ids" never calls `generateTableId` and hardcodes the digit factor, so shrinking the digit range breaks AC6 with no failing test.

**File:** `tests/unit/protocol.test.ts:159`

**What:** `const space = new Set(adjectives).size * new Set(animals).size * 900;` is arithmetic over the third-party corpus and a literal `900`. Nothing in the assertion touches this repo's code. The digit dictionary (`ID_DIGITS` in `src/net/protocol.ts:107`) is the only part of the space that is implementation, and it is the only part not measured. The words alone give 1202 x 355 = 426,710, which is 234x *below* AC6's bar — so the entire margin over the criterion comes from the untested factor.

**Failure scenario:** Change `const ID_DIGITS = { min: 100, max: 999 }` to `{ min: 100, max: 200 }` in src/net/protocol.ts. Every generated id is still `adjective-animal-1NN`, so the shape test passes (`/^\d{3}$/`), `normaliseTableId` still accepts, "two in a row differ" still passes, and "digits drawn afresh" still passes (100 draws over 100 values). The space test computes 1202*355*900 and passes. The real space is now 1202*355*100 = 42,671,000 — AC6 ("at least a hundred million distinct ids") is violated and the whole unit suite is green. Separately, the literal 900 is itself wrong: `NumberDictionary.generate` computes `Math.floor(Math.random()*(max-min))+min`, i.e. 100..998, so the true factor is 899.

**Suggested direction:** Derive the digit factor from the implementation rather than a literal — e.g. export `ID_DIGITS` and compute `(max - min)`, or assert the observed digit range across a large sample spans the expected span — so a narrowed range fails the criterion's own test.

### F2 (minor)

**Claim:** `tableLink`'s "nothing else that was in the address bar" test asserts a property that cannot fail, because the fake location it is given has no query string at all.

**File:** `tests/unit/session.test.ts:74`

**What:** The test is named "sends on the table and nothing else that was in the address bar" and its comment names a leftover `?seed=` as the thing it guards. But it calls `tableLink({ origin: 'https://pong.example', pathname: '/' }, 'abc')` — an object with no `search` property — and then asserts the result does not contain the string `seed`. There is no query string in the input for the function to carry over, so the assertion can only fail if the *table id* contains "seed". The second half of the test duplicates the AC5 test above it, so the case contributes no unique guard. The real caller is `tableLink(window.location, ...)` in src/main.ts:157, and `window.location` does have a `search`.

**Failure scenario:** A player opens `https://pong.example/?utm_source=email` (which `readSession` treats as `choosing`, so the Create-a-table button is available) and clicks Create a table. If `tableLink` were changed to preserve the incoming query — e.g. `${origin}${pathname}${search}${search ? '&' : '?'}table=...` — the shared invite URL would leak `utm_source=email` to the other player. This test still passes, and no e2e covers it either: `createTable` in tests/e2e/invite.spec.ts:41 always navigates to `/`, and the AC9 guest to `/`, so no browser test ever loads a page with an unrelated query parameter before minting a link.

**Suggested direction:** Pass a location that actually carries a query (`{ origin, pathname, search: '?seed=7&utm_source=x' }`, widening the parameter type or using a real `new URL(...)`), and assert the produced link contains only `?table=`.

### F3 (minor)

**Claim:** The rewritten AC6 touch test drops the assertion that a tap does not yank the paddle to the tap point, and nothing else in the suite replaces it — contrary to AC11's "no test weakened".

**File:** `tests/e2e/touch.spec.ts:291`

**What:** The superseded test performed `touchDrag(0.3 -> draggedTo)`, then `touchscreen.tap(0.3)` on the *same* page, then asserted `missedBy(paddleAt(...), box, draggedTo) <= 1` with the comment "the paddle is where the finger left it rather than where the tap landed". The new version navigates to a fresh page at line 291 before tapping, and moves that same `missedBy` assertion to line 280, before any tap. The drag half is preserved; the "a `pointerdown`/tap does not reposition the paddle" half is now asserted nowhere. This matters more after the change than before, because `onPointerDown` in src/input.ts:186 went from bookkeeping-only to an active handler, making "also set the paddle target here" a natural next edit.

**Failure scenario:** Add `targetY = courtY(event.clientY, court)` to `onPointerDown` in src/input.ts (making the paddle jump to wherever the finger lands). A tap on the idle court would then snap the paddle away from where the player last dragged it. Walk the whole suite: touch AC1/AC2/AC4/AC7 and start AC1/AC2 all issue a `down` followed by a `moveTo` before asserting, so the final target is the moved-to point and they pass; touch AC5 never lands on the court; touch AC8's determinism replay changes identically in both runs and still passes; new AC6 taps only on a page with no prior drag, so it passes; start AC2 taps at `downCourt(box, 0.5)`, which is the paddle's default centre, so it reads the same either way. Nothing fails. Against 5012fe0 the old AC6 assertion caught it.

**Suggested direction:** Keep the drag-then-tap sequence on one page as a third leg of the AC6 test (or a `start` test), asserting the paddle is still at `draggedTo` after a tap somewhere else on the court.

## Notes

Scope checked: tests/e2e/invite.spec.ts (new), tests/e2e/mouse.spec.ts, tests/e2e/touch.spec.ts, tests/e2e/support/table.ts, tests/unit/{protocol,session,share,status}.test.ts, against docs/work/start-and-share/plan.md AC1-AC11. Ran `npx vitest run`: 129 passed, 14 files.

Things I checked and found sound, so as not to leave them ambiguous for the judge: AC1/AC2/AC4 are genuinely behavioural and each has a surviving mutation (reverting `onPointerDown` to the tap-slop path fails start AC1/AC2; dropping the `pointerType === 'mouse'` guard fails start AC4). The status assertions after `hand.down()` are not racy — `start()` in src/main.ts:220 calls `showScore`/`showStatus` synchronously, so they do not depend on the frozen clock advancing. The `browserTargets` \"keeps each one attached to the navigator\" test does catch bare method references (a detached call throws TypeError, `shareLink` falls through to `unavailable`, the assertion fails). The AC6 e2e/unit \"two in a row differ\" flake probability is ~1/3.8e8. The worker rate limiter fails open on loopback (worker/limit.ts:101), so parallel invite tests cannot exhaust it.

# Review 005 — simplicity

- Lens: simplicity
- Verdict: findings
- Diff range: `5012fe0...HEAD`

## Findings

### F1 (minor)

**Claim:** `expectAgreedScore` is copied byte for byte into the new invite spec instead of being lifted into the shared e2e support module the rest of its helpers come from.

**File:** `tests/e2e/invite.spec.ts:61`

**What:** Lines 61-72 of `/Users/joelstevick/projects/starter-example-pong/tests/e2e/invite.spec.ts` are identical (verified with `diff`, no differences) to lines 48-59 of `/Users/joelstevick/projects/starter-example-pong/tests/e2e/table.spec.ts` — same poll body, same `mine !== '0-0'` sentinel, same `CONVERGE_MS`. Only the doc comment differs. The file already imports `scoreOf`, `statusOf`, `labels` and `CONVERGE_MS` from `./support/table`, which is where this repo puts shared e2e helpers, and this same diff added `enterAt` there for exactly this reason.

**Failure scenario:** The definition of "the two browsers agree" now exists in two independently maintained copies. Concretely: the guard is `mine !== '0-0'`, hard-coded against the scoreboard's initial markup. If `index.html`'s initial score markup changes (say to `0 – 0` with a spaced en dash), the guard becomes vacuously true. Whoever fixes that will fix it in `table.spec.ts`, where the helper is documented and where AC3/AC5 live, and leave `invite.spec.ts` accepting the untouched initial score — so AC8 ("the two are seated opposite each other and see the same score"), the criterion the plan calls "the one that matters", would pass against a table that never broadcast a single point.

**Suggested direction:** Move `expectAgreedScore` into `tests/e2e/support/table.ts` beside `scoreOf` and `labels`, export it, and import it in both specs.

### F2 (nit)

**Claim:** `createTable` re-implements `enterAt(seat, '/')` inline, in a file that imports `enterAt` and calls it with `'/'` seventy lines further down.

**File:** `tests/e2e/invite.spec.ts:35`

**What:** Lines 35-37 are `await seat.page.goto('/'); await watchScore(seat.page); await watchStatus(seat.page);` — the exact three statements, in order, of `enterAt` at `/Users/joelstevick/projects/starter-example-pong/tests/e2e/support/table.ts:382`. The AC9 test at line 166 of the same file does the equivalent as `await enterAt(guest, '/')`. Calling `enterAt` here would also drop the now-unnecessary `watchScore` and `watchStatus` imports at the top of the spec.

**Failure scenario:** `enterAt`'s comment states its ordering contract (observers installed only after the page exists). Every test that reaches a table through `createTable` — AC5, AC6, AC7, AC8, AC9 and both AC10 tests, i.e. all seven in the file — goes through the inline copy rather than the helper. If a third observer is ever added to `enterAt` (the same way `watchStatus` was added beside `watchScore`), all seven of those tests silently keep the two-observer setup, and any assertion that depends on the new observer reads an uninitialised value rather than failing loudly.

**Suggested direction:** Replace the three lines with `await enterAt(seat, '/');` and drop the two now-unused imports.

### F3 (nit)

**Claim:** Two of the four new BEM classes on the invite row have no rule anywhere and are inert markup.

**File:** `index.html:45`

**What:** `class="invite__lead"` (line 45) and `class="invite__note"` (line 48) are matched by nothing in `/Users/joelstevick/projects/starter-example-pong/src/style.css`, which is the project's only stylesheet (`dist/` is build output). The file styles `.invite`, `.invite[hidden]`, `.invite__url` and `.invite button` and nothing else. The sibling block two elements down follows the opposite convention — `.choose__or` and `.choose__label` both have rules, at style.css:168 and again at 277.

**Failure scenario:** There is no runtime failure; both spans render from `.invite`'s inherited font-size and colour. The cost is that a reader tracing why the note is styled the way it is searches the stylesheet for `.invite__note`, finds nothing, and has to work out that the class is decorative — and the next person adding a rule has to guess whether the class was left unstyled deliberately or the rule was lost. `#invite-note` is already addressable by id, which is what `src/main.ts:74` uses.

**Suggested direction:** Either drop the two class attributes or give them the rules the `choose__` siblings have.

## Notes

Production source (src/, index.html, src/style.css) is clean under this lens: no dead code, no duplicated logic, and the two new abstractions (`startGesture`, `ShareTargets`) each remove more repetition than they add. The removal of the tap tracker from src/input.ts leaves no orphans anywhere in the tree. All three findings are in the test and markup layers. I deliberately did not report the near-overlap between `touch.spec.ts` AC6's drag half and the new `start AC1` — they assert at different moments in the gesture (after the lift vs mid-drag, finger never raised), and keeping AC6 under its old number is a defensible record of the supersession.

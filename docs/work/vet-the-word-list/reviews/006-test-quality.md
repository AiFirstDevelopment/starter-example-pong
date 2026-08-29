# Review 006 — test-quality

- **Lens:** test-quality
- **Verdict:** findings
- **Diff range:** `86e6953...HEAD`

## Findings

### F1 — major

**Claim:** Every assertion about the blocklist's contents is expressed in terms of BLOCKED_WORDS itself, so entries can be deleted or corrupted and the whole suite stays green while the ids the feature exists to prevent become mintable again.

**Location:** `tests/unit/words.test.ts:45`

**What:** AC1, AC2 and both AC3 tests all compare the filtered corpora against BLOCKED_WORDS, and AC2's only anchor to the outside world is `length > 0` — at least one of the 64 entries must still match a corpus word. Nothing in the suite names a single word that must be absent from the shipped corpora.

**Failure scenario:** Verified by running the suite against a mutated copy (repo tree untouched). Mutation A: delete `'naked'`, `'beaver'`, `'fat'`, `'cow'`, `'pig'`, `'nasty'`, `'sexual'`, `'filthy'`, `'booby'` from BLOCKED_WORDS — `npx vitest run --project unit` reports 124 passed / 12 files, and a probe shows `TABLE_ID_ADJECTIVES.includes('naked') === true` and `TABLE_ID_ANIMALS.includes('beaver') === true`, i.e. `naked-beaver-417` and `fat-cow-233` (the exact ids the plan's Intent cites as the failure being fixed) are reachable again with nothing red. Mutation B: keep all 64 entries but typo 62 of them (`'awful'` -> `'awfulX'`, leaving only `naked` and `beaver` effective) — again 124 passed: AC2 is satisfied by `> 0`, AC3-smaller by the one removal in each corpus, AC1 and AC3-lost vacuously. So the 'generous' list the module docstring and README both advertise can erode to two words without a test noticing.

**Suggested direction:** Add one assertion anchored outside BLOCKED_WORDS — e.g. a short literal list of the words Intent names (`naked`, `beaver`, `fat`, `cow`, `pig`, `booby`, `sexual`, `filthy`) asserted absent from TABLE_ID_ADJECTIVES/TABLE_ID_ANIMALS, or assert that the number of words actually removed from each corpus equals the number of blocklist entries present in it. Neither conflicts with AC3's rule that an entry matching nothing is not an error, since both assert about the corpora rather than about the list.

### F2 — nit

**Claim:** The AC2 test's comment states two things about the suite that are false, and following it would lead a maintainer to weaken the tests that are actually doing the work.

**Location:** `tests/unit/words.test.ts:30`

**What:** The comment reads 'The one test that keeps the filter load-bearing. Nothing else in the suite would notice `BLOCKED_WORDS` being emptied or `withoutBlockedWords` being reduced to the identity'. The build notes' own mutation table contradicts this.

**Failure scenario:** Emptying BLOCKED_WORDS to `[]` fails AC2 *and* 'AC3: is strictly smaller than the corpus it comes from' (`expected 1202 to be less than 1202`). Reducing `withoutBlockedWords` to `return [...corpus]` leaves AC2 green and fails AC1 plus both AC3 tests — so AC2 is precisely the test that does *not* notice that mutation, the opposite of what the comment claims. A maintainer trimming what the comment presents as redundant AC3 coverage would remove the only detection for the emptied-list case that F1 has not already blunted.

**Suggested direction:** Reword to match the measured behaviour: AC2 and AC3-smaller catch the emptied list; AC1 and both AC3 tests catch the neutered filter.

## Notes

Mutation testing was done on an rsync'd copy under the session scratchpad with node_modules symlinked; `git status --porcelain` in the repo is empty, and the range contains no uncommitted changes. Confirmed non-findings: corpus sizes and the 342,397,800 figure in README/docstring/test comments are exact against unique-names-generator 4.7.1; every corpus word matches /^[a-z]+$/ so the 3-part split in protocol.test.ts cannot fail on a draw; the retargeted 'AC6: is an adjective, an animal and three digits' test does redden if generateTableId is put back on the package corpora (miss probability ~1e-5, and deterministic-green for correct code); AC4's assertion is derived from filtered lengths as the plan requires.

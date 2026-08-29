# Review 003 — spec-fidelity

- **Lens:** spec-fidelity
- **Verdict:** findings
- **Diff range:** `86e6953...HEAD`

## Findings

### F1 — minor

**Claim:** The blocklist blocks `ugly` and `sexual` but leaves `ugliest` and `oral` in the corpus, so obvious pairs the curation exists to prevent are still mintable.

**Location:** `src/net/words.ts:49`

**What:** `BLOCKED_WORDS` contains `ugly` (line 82) and `sexual` (line 73), but `unique-names-generator` 4.7.1's `adjectives` also contains `ugliest` and `oral`, neither of which is on the list. Filtering is exact-word by design, so both survive into `TABLE_ID_ADJECTIVES`. The plan's Non-goals set the bar as "no obvious pair survives" and state that a surviving bad pair is a finding against AC1 and "a word gets added".

**Failure scenario:** Verified against the installed package: `TABLE_ID_ADJECTIVES` contains `ugliest` and `oral`, and `TABLE_ID_ANIMALS` contains `mule` and `hamster`. So `generateTableId()` can return `ugliest-mule-417` or `oral-hamster-233` — an id whose whole job, per the module docstring, is to be sent to another person. `ugliest` is the superlative of a word the list itself names as unacceptable, and `oral` beside any animal is the same class of innuendo the entry `sexual` was added for. Meanwhile the survey removed `odd`, `strange`, `newt` and `toad` on the grounds that exclusion is free, so this is a gap in the list rather than a deliberate line.

**Suggested direction:** Add `ugliest` and `oral` to `BLOCKED_WORDS`; while there, the same sweep of the surviving corpus turns up `moaning`, `juicy`, `chubby` (the list already blocks `fat` for exactly this reason) and `xenophobic` as candidates. Adding four words costs about 0.3% of a 3.4x headroom, and AC3's "an entry matching nothing is not an error" already tolerates any that later vanish upstream.

### F2 — nit

**Claim:** The comment justifying a single merged blocklist asserts the two package corpora are disjoint; they are not.

**Location:** `src/net/words.ts:45`

**What:** The `BLOCKED_WORDS` doc comment reads "the two corpora are disjoint today and the package may move a word between them tomorrow". Measured against unique-names-generator 4.7.1, `sole` and `swift` are present in both `adjectives` and `animals`. The Build notes repeat the claim in the S1 deviation ("The two corpora are disjoint today, so this gives exactly the 1167 and 326 the plan measured").

**Failure scenario:** The conclusion survives only by accident: neither overlapping word is blocklisted, so one merged list does give 1167 and 326. But a maintainer who trusts the comment and adds `sole` to `BLOCKED_WORDS` to kill an animal-side pun silently loses the adjective `sole` from `TABLE_ID_ADJECTIVES` as well — the exact cross-corpus effect the comment says cannot happen today. No test catches it: AC1, AC3 and AC4 all stay green, since AC3's second test only asserts that blocked words are absent from whichever corpus held them.

**Suggested direction:** State the fact that actually holds — no word on this list appears in both corpora — rather than a disjointness the package does not have, and note that a merged list applies to both if that ever changes.

### F3 — nit

**Claim:** Build note "C4 confirmed" asserts generateTableId was the only caller of the package's `adjectives` and `animals` in tests/, which the diff itself contradicts.

**Location:** `docs/work/vet-the-word-list/plan.md:154`

**What:** The Build notes record "C4 confirmed. `generateTableId` was the only caller of the package's `adjectives` and `animals` in `src/`, `worker/` and `tests/`." At the fork point 86e6953, `tests/unit/protocol.test.ts` line 1 was `import { adjectives, animals } from 'unique-names-generator';` and used them in two assertions. Approach C4's own conclusion — "the filtering has nowhere else it needs to reach" — is wrong for the same reason.

**Failure scenario:** A reviewer reading the C4 confirmation concludes that only `src/net/protocol.ts` referenced the raw corpora and that no test needed re-pointing. In fact the re-pointing of `tests/unit/protocol.test.ts:144-145` to the curated corpora is, by the Build notes' own S3 deviation, the single assertion in the whole suite that holds `generateTableId` to S2's wiring; had C4 been taken at face value that file would have gone untouched and a revert of the wiring would have left the suite entirely green.

**Suggested direction:** Correct the C4 confirmation to name `tests/unit/protocol.test.ts` as the second reference, so it agrees with the S3 deviation recorded twenty lines below it.

## Notes

Verified against the installed unique-names-generator 4.7.1 and by running the suite (135/135 green; 130 tests existed at 86e6953, 5 are new in words.test.ts). C1 confirmed (1202/355, no duplicates). C2 confirmed with the recorded `ass` correction (it is genuinely absent from `animals`). C3 confirmed exactly: removing the 64 words leaves 1167 and 326, and 1167 x 326 x 900 = 342,397,800; every one of the 64 was present in the corpus it was surveyed from, and no surveyed adjective appears in `animals` or the reverse. AC1-AC4 each have a test; I re-derived each mutation in the Build notes' table by hand and the table is accurate, including AC1 passing vacuously on an emptied blocklist. The PLAN DEFECT escalation is correct and correctly scoped to the Test strategy sentence rather than to an AC. AC5 satisfied (generateTableId docstring and README rewritten; the ID_DIGITS figures 380 thousand / 342 million check out, as does the 23,193 birthday bound and the 33-character maximum from `straightforward`/`tyrannosaurus`). AC6 satisfied: protocol.test.ts still asserts shape, space, digit span, freshness and normaliseTableId acceptance, both edited tests narrowed rather than loosened. No non-goal was built. README's example `mute-harrier-553` does survive the cut.

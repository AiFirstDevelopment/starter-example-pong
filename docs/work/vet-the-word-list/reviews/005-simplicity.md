# Review 005 — simplicity

- **Lens:** simplicity
- **Verdict:** findings
- **Diff range:** `86e6953...HEAD`

## Findings

### F1 — minor

**Claim:** `withoutBlockedWords`'s `blocked` parameter and its export are justified only by a test call that is provably the identity function, so both are needless surface.

**Location:** `src/net/words.ts:125`

**What:** The function takes `blocked` as a parameter and is exported solely so `tests/unit/words.test.ts:42-43` can call it with `[]`. With an empty list `new Set([])` removes nothing, so the call returns a copy of the input corpus: I verified `[...withoutBlockedWords(adjectives, []), ...withoutBlockedWords(animals, [])]` is element-for-element identical to `[...adjectives, ...animals]`. The docstring at lines 121-123 claims the export is 'what proves the filter below is what removes them'; it cannot, because the empty-list path bypasses the filter by construction.

**Failure scenario:** Replace the body of `withoutBlockedWords` with `return [...corpus]` (a total neutering of the filter). The AC2 test at tests/unit/words.test.ts:36-46 — the one whose comment says it is 'the one test that keeps the filter load-bearing' — still passes green, because it only asks whether the raw corpora contain a blocked word. The only mutation the parameter does catch (hardcoding `BLOCKED_WORDS` inside the function and ignoring the argument) leaves `TABLE_ID_ADJECTIVES` and `TABLE_ID_ANIMALS` byte-identical, i.e. is behaviourally inert. The parameter and export therefore add exported API and a false explanatory comment while detecting nothing that matters.

**Suggested direction:** Drop the second parameter (close over `BLOCKED_WORDS`) and stop exporting the function; write the AC2 test directly against the package corpora, e.g. `expect([...adjectives, ...animals].filter((w) => blocked.has(w)).length).toBeGreaterThan(0)`, which is the same assertion with one fewer export and no misleading docstring.

### F2 — nit

**Claim:** The 'space of at least a hundred million ids' assertion is duplicated verbatim across two test files.

**Location:** `tests/unit/words.test.ts:76`

**What:** tests/unit/words.test.ts:76-78 and tests/unit/protocol.test.ts:176-178 compute the same product from the same two arrays and the same `ID_DIGITS`, against the same `100_000_000` threshold. The only textual difference is `new Set(x).size` versus `x.length`, and both corpora are duplicate-free (verified: 1202 adjectives, 355 animals, zero duplicates in either), so the Set wrapping is a no-op.

**Failure scenario:** Narrow `ID_DIGITS` to `{ min: 100, max: 200 }`, or shrink either curated corpus below the bar: two tests in two files fail with the same arithmetic, and any future change to the corpora or the digit range requires editing both assertions and both long explanatory comments (only one of which carries the 1167/326/380,442 figures, so they can drift apart).

**Suggested direction:** Keep one of the two. The protocol.test.ts copy is the one tied to `generateTableId`'s wiring; the words.test.ts AC4 copy adds no distinct input or threshold.

## Notes

Verified against the installed package: `unique-names-generator` ships 1202 adjectives and 355 animals with no duplicates; the 64-word blocklist has no duplicate entries and no entry that matches nothing, the two corpora are disjoint, and 1167 x 326 x 900 = 342,397,800 is exact. No stale 1202/355/384-million figure survives outside one deliberate test comment. No dead code found beyond F1; the new module is a single flat file with no unnecessary indirection otherwise, and it reuses the repo's existing `src/net` layout and comment conventions.

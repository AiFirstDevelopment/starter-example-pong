# Review 002 — correctness

- **Lens:** correctness
- **Verdict:** findings
- **Diff range:** `86e6953...HEAD`

## Findings

### F1 — major

**Claim:** The blocklist removes four primates for what can only be the racial reading but leaves eight others, and leaves `coloured` in the adjectives, so `generateTableId` can still mint `coloured-baboon-417`.

**Location:** `src/net/words.ts:87`

**What:** The ``// From `animals` (29).`` block blocks `ape`, `monkey`, `gorilla` and `chimpanzee` — none of which is vulgar on any other reading, so the surveyed intent is plainly the slur. `baboon`, `orangutan`, `gibbon`, `mandrill`, `bonobo`, `primate`, `lemur` and `marmoset` all survive, and `coloured` survives in `TABLE_ID_ADJECTIVES`.

**Failure scenario:** Verified by parsing `BLOCKED_WORDS` straight out of `src/net/words.ts` and applying it to `unique-names-generator` 4.7.1: `TABLE_ID_ADJECTIVES.includes('coloured') === true` and `TABLE_ID_ANIMALS` contains all eight primates above. `generateTableId` draws uniformly from those arrays, so `coloured-baboon-417`, `coloured-orangutan-233` and `coloured-mandrill-905` are ids this code mints, at 8/(1167*326) — about one creation in 47,555. That is the same order as the one-in-five-to-twenty-thousand rate the plan's Intent gives as the reason the change exists, on the id whose next line reads "Send this link to whoever you are playing". The plan's non-goals say this explicitly: "If a pair survives that no single word explains, that is a finding against AC1 and a word gets added." No single blocklist word explains this pair.

**Suggested direction:** Add `coloured` to the adjective block and the surviving primates (`baboon`, `orangutan`, `gibbon`, `mandrill`, `bonobo`, `primate`, at least) to the animal block; the headroom is 3.4x, so the cost is nil. `primitive` and `native` in the adjectives are worth the same look while the list is open.

### F2 — minor

**Claim:** `ugly` is blocked but `ugliest` — the same word, in the same corpus — survives the filter.

**Location:** `src/net/words.ts:82`

**What:** Exact-word matching is the right design (the module argues that well), but it means an inflection of a blocked word has to be listed separately, and the superlative of `ugly` was not.

**Failure scenario:** `unique-names-generator`'s `adjectives` contains both `ugly` and `ugliest`; only `ugly` is on the list, so `TABLE_ID_ADJECTIVES.includes('ugliest') === true`. One id in 1167 therefore begins `ugliest-`, e.g. `ugliest-cockroach-417` or `ugliest-hyena-233` — about 40 times more likely than the `ugly-` pairs the blocklist was written to stop, and reading no better when it is the string somebody sends a friend.

**Suggested direction:** Add `ugliest`. It is worth one pass over the corpus for other inflections of listed words while doing it.

### F3 — nit

**Claim:** The comment justifying a single merged blocklist states the two corpora are disjoint; they are not.

**Location:** `src/net/words.ts:45`

**What:** `BLOCKED_WORDS`' doc comment reads "the two corpora are disjoint today and the package may move a word between them tomorrow". In 4.7.1, `adjectives` and `animals` both contain `sole` and `swift`.

**Failure scenario:** `adjectives.filter(a => animals.includes(a))` returns `['sole','swift']`. Nothing misbehaves today because neither word is blocked, but the comment is the stated basis for applying one list to both corpora, and it is false: a maintainer who adds `swift` intending the bird also deletes the adjective, and no test notices — the AC3 tests assert only that blocked words are gone, never that a removal was intended for the corpus it hit. The plan's build note states the same claim, but there it is correctly qualified to blocklist words ("no adjective on the list is an animal or the reverse"), which is true; the source comment dropped the qualifier.

**Suggested direction:** Restate the comment as the true claim — no word on the blocklist appears in both corpora — rather than a false one about the corpora as a whole.

## Notes

Range verified as given: `86e6953..HEAD` is `3502cad` + `252d687`, working tree clean before and after review (no files edited; probes ran from the scratchpad directory). Claims C1-C4 in the plan all reproduce: 1202/355 corpora with no duplicates, 1167/326 after the cut, 342,397,800 ids, and `generateTableId` is the only consumer of the package corpora outside tests. The AC2/AC3 mutation table in the build notes is accurate — I re-derived each row rather than trusting it. The five new tests and the two tightened ones in `tests/unit/protocol.test.ts` do narrow rather than weaken what is accepted.

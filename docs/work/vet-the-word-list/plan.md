# Plan: Vet the words a table id is built from

- **Slug:** vet-the-word-list
- **Branch:** fix/vet-the-word-list
- **Status:** adjudicated

## Intent

`start-and-share` chose `unique-names-generator` partly on the belief that its
word list was somebody's curated corpus rather than one improvised here. That
belief was wrong, it was written into the plan as a reason, and the code's own
docstring repeated it. The corpus is general-purpose: `adjectives` holds `naked`,
`dirty`, `nasty`, `sexual`, `filthy`, `stupid`, `fat`; `animals` holds `beaver`,
`booby`, `cow`, `pig`, `ass`. So `naked-beaver-417` and `fat-cow-233` are
reachable ids — roughly one creation in five to twenty thousand — on a page whose
next line reads *"Send this link to whoever you are playing"*.

Nobody is using the game yet, so this is still theoretical. It stops being
theoretical the moment it is deployed, and the whole point of the feature is that
the id gets sent to another person.

This makes the shipped rationale true rather than dropping it.

## Acceptance criteria

- [ ] AC1: No generated id contains any word on the blocklist. Asserted over
      every word in both filtered corpora, not by sampling generated ids — a
      sampled test would need millions of draws to be evidence.
- [ ] AC2: The filter is demonstrably load-bearing: with the blocklist emptied,
      a test fails. Nothing else in the suite would notice it being dropped, so
      this is the criterion that keeps the filter real.
- [ ] AC3: Both filtered corpora are strictly smaller than the corpora they come
      from, and every blocklisted word that was present is gone. A blocklist
      entry matching nothing is not an error — the corpus may change under us —
      but a blocklisted word surviving into the corpus is.
- [ ] AC4: The id space stays above the hundred million `start-and-share` AC6
      requires, asserted from the filtered dictionary lengths rather than a
      literal.
- [ ] AC5: The docstring on `generateTableId`, and any README text about where
      the words come from, describe what the code now does — a curated corpus,
      curated here, and why.
- [ ] AC6: Everything already shipped still holds. The full existing suite passes
      with no test weakened, and ids remain the same shape:
      adjective-animal-digits, hyphenated, accepted by `normaliseTableId`.

## Non-goals

- **Filtering combinations rather than words.** Removing either half of a bad
  pair kills the pair, and enumerating pairs is a far larger surface to get
  wrong. If a pair survives that no single word explains, that is a finding
  against AC1 and a word gets added.
- **Perfection.** No word list is exhaustive across every reading, dialect and
  in-joke. The bar is that no obvious pair survives, not that offence becomes
  impossible.
- **Replacing the dependency**, changing the id shape, or touching anything
  outside the generator and its tests.
- Localisation, profanity detection at runtime, or user reporting.

## Open questions

None. Two decisions taken rather than asked:

- **The blocklist is generous.** Words that are innocuous alone but ugly in
  combination — `fat`, `hard`, `tight`, `wet`, `cow`, `pig` — come out, because
  the pair is what gets sent to somebody. The measured cost is that the space
  falls from 384 million to about 342 million, which is 3.4 times what AC6 asks
  for. Cheap insurance against the failure that matters.
- **The blocklist lives in this repository**, not upstream. Filing against the
  package would be the neighbourly thing and is not a fix on any timescale this
  can wait for.

## Approach

One module, `src/net/words.ts`, exporting the two filtered corpora and the
blocklist itself so a test can drive it. `generateTableId` imports the filtered
lists in place of the raw ones and is otherwise unchanged.

Filtering happens once at module scope rather than per call — the corpora are
constants, and doing it per id would be work repeated for no reason.

The survey that produced the list is recorded below so a reviewer can judge the
list rather than re-derive it. **35 adjectives**: awful, bloody, crazy, creepy,
crude, dead, dirty, drunk, fat, filthy, gay, greasy, gross, hard, horrible,
loose, mad, naked, nasty, odd, open, rotten, sexual, sick, slimy, stiff,
straight, strange, stupid, terrible, tight, ugly, violent, weird, wet.
**29 animals**: ape, bat, beaver, boar, booby, buzzard, chimpanzee, cow, crab,
donkey, goose, gorilla, leech, louse, monkey, newt, peacock, pig, puma, rat,
shrew, skunk, slug, snake, swallow, toad, vulture, weasel, worm.

Some of those are defensible either way — `bat`, `newt`, `goose` and `toad` are
only animals, and `odd` and `strange` are only odd and strange. They are out
because the headroom makes exclusion free and a reviewer arguing one back in is
a cheaper conversation than a player receiving one.

**Claims** — all four measured against the installed package while writing this.

- [ ] C1: `unique-names-generator` 4.7.1 ships 1202 adjectives and 355 animals.
- [ ] C2: The words quoted in *Intent* are all present in those corpora, so the
      ids named there are genuinely reachable rather than illustrative.
- [ ] C3: Removing the 35 and 29 above leaves 1167 and 326, giving
      1167 x 326 x 900 = 342,397,800 ids — 3.4 times AC6's hundred million.
- [ ] C4: `generateTableId` currently imports `adjectives` and `animals` directly
      from the package, so the filtering has nowhere else it needs to reach.

## Steps

- [x] S1: Add `src/net/words.ts` — the blocklist, the two filtered corpora, and a
      comment saying why the list is generous and where it came from.
- [x] S2: Point `generateTableId` at the filtered lists.
- [x] S3: Unit tests for AC1, AC2, AC3 and AC4, including the emptied-blocklist
      mutation AC2 names.
- [x] S4: Correct the docstring and any README text (AC5).
- [x] S5: Full suite, both projects, and again in the CI Linux image.

## Test strategy

Unit, almost entirely — this is a pure function over two constant arrays and
belongs nowhere near a browser.

- **AC1** is asserted over the corpora, not over samples. Every word in each
  filtered list is checked against the blocklist; a sampled test over generated
  ids would need millions of draws to distinguish a working filter from a broken
  one, and would still be probabilistic.
- **AC2** is the criterion that stops the filter rotting. Run it by emptying the
  blocklist and watching **AC2's and AC3's** tests fail, and record that it was
  run. Not AC1's: AC1 compares the filtered corpora against the blocklist, so
  both sides of it go empty together and it passes vacuously — which is the same
  trap AC3 exists to cover, named wrongly here when the plan was written.
- **AC3** guards the direction of the change: a filter that silently matched
  nothing would satisfy AC1 trivially.
- **AC4** derives the space from the filtered lengths, so shrinking a corpus past
  the bar fails rather than passing quietly.
- **AC6** is the existing suite, which already covers the id's shape and
  `normaliseTableId` accepting it.

## Build notes

All five steps done, one plan defect recorded, four deviations. Suite green on
both platforms.

### Claims

- **C1 confirmed.** `unique-names-generator` 4.7.1 ships 1202 adjectives and
  355 animals, no duplicates in either.
- **C2 confirmed with one correction.** Every word *Intent* names is in the
  corpus it is attributed to, except one: **`ass` is not in `animals`.** The
  corpus has `bass`, `donkey`, `grasshopper` and `mule`, and no `ass`. The other
  eleven — `naked`, `dirty`, `nasty`, `sexual`, `filthy`, `stupid`, `fat`,
  `beaver`, `booby`, `cow`, `pig` — are all present, so both ids *Intent* names
  as reachable, `naked-beaver-417` and `fat-cow-233`, genuinely were. *Intent* is
  the user's to change and this build does not touch it; the record is here.
- **C3 confirmed exactly.** The 64 words come out to 1167 adjectives and 326
  animals, giving 1167 x 326 x 900 = 342,397,800 ids. Every one of the 64 was
  present in the corpus it was surveyed from, so none of them matched nothing,
  and the two corpora are disjoint — no adjective on the list is an animal or
  the reverse — which is why one merged list gives the same answer as two.
- **C4 confirmed.** `generateTableId` was the only caller of the package's
  `adjectives` and `animals` in `src/`, `worker/` and `tests/`.

### PLAN DEFECT — emptying the blocklist does not fail AC1's test

*Test strategy* says of AC2: "Run it by emptying the blocklist and watching
AC1's test fail." **AC1's test cannot fail that way.** AC1 asserts that no word
in the filtered corpora is on the blocklist, and both sides of that comparison
come from `BLOCKED_WORDS`: empty the list and the assertion passes vacuously,
because an empty blocklist is one no word is on. The plan says as much itself,
two paragraphs later, as the reason AC3 exists.

**What was done instead.** AC2 is asserted by its own test — that the words the
blocklist names are genuinely present in the *unfiltered* corpora, so emptying
the list or neutering the filter puts them back within the generator's reach.
That test, and AC3's, are what go red. Run and recorded rather than argued:

| Mutation | Tests that fail |
| --- | --- |
| `BLOCKED_WORDS` emptied to `[]` | AC2, AC3 (strictly smaller). AC1 passes, vacuously. |
| `withoutBlockedWords` neutered to the identity | AC1, both AC3 cases |
| `generateTableId` put back on the package's raw corpora | `protocol.test.ts` AC6 shape |

AC2 as an *acceptance criterion* — "with the blocklist emptied, a test fails" —
is met, twice over. It is the *Test strategy*'s sentence naming AC1's test as
the one that fails that is wrong. **What should happen:** that sentence should
read "watching AC2's and AC3's tests fail". Nothing in the ACs needs changing.

### Deviations

- **S1 deviation: the filter function is exported too.** The plan's *Approach*
  names "the two filtered corpora and the blocklist itself" as the module's
  exports. `withoutBlockedWords(corpus, blocked)` is exported alongside them, so
  AC2 can be an automated test rather than a ritual somebody remembers to
  perform: the test runs the real filter with an empty list and asserts the
  words come back. Without it, AC2 could only be checked by editing the source
  and running the suite by hand, which is evidence that expires the moment it is
  written.
- **S1 deviation: one merged blocklist, not two.** The survey lists 35
  adjectives and 29 animals; `BLOCKED_WORDS` is one 64-word list applied to both
  corpora, in two commented blocks so a reviewer can still see which corpus each
  word was surveyed from. The two corpora are disjoint today, so this gives
  exactly the 1167 and 326 the plan measured, and it is the reading AC1 ("any
  word on the blocklist") and AC3 ("a blocklist entry matching nothing is not an
  error") are already written in.
- **S3 deviation: two existing tests in `tests/unit/protocol.test.ts` were
  tightened.** Nothing was weakened, skipped or removed — both keep their names,
  their bounds and their assertion counts, and both now assert against a smaller
  set than before:
  - *"AC6: is an adjective, an animal and three digits, hyphenated"* now checks
    the parts against the curated corpora instead of the package's. This is the
    only thing in the suite that holds `generateTableId` to S2's wiring: a
    revert to importing `adjectives` and `animals` from the package leaves every
    other assertion green, and this one red at odds of about 96,000 to one.
    Without the change nothing would have noticed the wiring being undone.
  - *"AC6: draws from a space of at least a hundred million ids"* now counts the
    filtered lengths. Left alone it would have gone on asserting 384 million
    against a generator that draws from 342 million — a true statement about the
    package and a false one about this code. AC4's own test in `words.test.ts`
    makes the same assertion; the duplication is deliberate, because the
    alternative was deleting an existing test.
- **S4 deviation: two stale figures outside the docstring were corrected.** The
  `ID_DIGITS` doc comment said the words alone are "427 thousand" ids and the
  whole space "384 million"; both are counts of the corpus this change replaces,
  so they now read 380 thousand and 342 million. The sentence after them — that
  the digits move a likely collision "from a few hundred to twenty-three
  thousand" — is still right at the new size (the birthday bound on 342,397,800
  is 23,193). AC5 names the `generateTableId` docstring and the README; these
  two numbers are in neither, but they were made false by S2 and leaving them
  would have left the file contradicting itself.

### Not deviations, but worth recording

- **The corpus is filtered by whole word, never by substring.** AC1 reads "no
  generated id *contains* any word on the blocklist", and a substring reading
  would take `accurate`, `grateful`, `desperate`, `mongoose`, `pigeon`,
  `wombat`, `albatross` and 25 others with it, for containing `rat`, `goose`,
  `pig` and `bat`. An id's words are corpus entries exactly, so exact matching
  is both what the criterion means and the only reading that leaves a corpus.
  The module says so where somebody would go to change it.
- **The `generateTableId` docstring did not claim the corpus was vetted.** The
  version this build replaced said the opposite — "not a claim that it has been
  vetted for this use. It has not" — and named the same words *Intent* does. So
  the docstring was honest about the gap rather than repeating the plan's wrong
  belief; what it needed was not a correction but a new subject, which is what
  AC5 asks for and what it now has.
- **The README's example id, `mute-harrier-553`, survives the cut.** Neither
  `mute` nor `harrier` is on the list, so the id the README and three unit tests
  use as an illustration is still one this code can mint.
- **`start-and-share` AC6's hundred million is unchanged and still met**, with
  3.4 times the headroom. No id changed shape: still adjective-animal-digits,
  still at most 33 characters (`straightforward` and `tyrannosaurus` are the
  longest survivors), still lowercase letters, hyphens and digits, so
  `normaliseTableId` goes on accepting every id minted.

### S5. Suite green on both platforms

135 unit tests across the two vitest projects (124 `unit`, 11 `worker`) and 77
behavioural tests across chromium and mobile-chrome, on macOS/Node 22.23.2 and
again in a `node:22-bookworm` container matching the CI job, each preceded by
`npm run build` — `tsc` over both tsconfigs and the Vite bundle. Five of the 135
are new; the other 130 are the suite as it stood, all passing, none skipped,
weakened or deleted. The only edits to an existing test file are the two
tightenings recorded above, both of which narrow what the test accepts.

The container is arm64 rather than the amd64 CI runs on, which is the same
caveat the last three work items recorded.

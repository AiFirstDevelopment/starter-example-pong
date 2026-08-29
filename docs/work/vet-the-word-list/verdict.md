# Verdict — vet-the-word-list

- **Adjudicated:** `86e6953...HEAD`, the fork from `main` through the build
  commits `3502cad` and `252d687`, plus this adjudication's own commit
- **Reviews considered:** 001-behavior, 002-correctness, 003-spec-fidelity,
  004-security, 005-simplicity, 006-test-quality — six lenses, none missing
- **Outcome:** ready with follow-ups
- **Test suite:** green — 136 unit (two vitest projects) and 77 behavioural
  (chromium + mobile-chrome), none skipped

## Read this first

Three things want a human, none of them blocking:

- **E1 — the plan's own *Test strategy* contains a false sentence** that the
  builder flagged and could not fix. It names AC1's test as the one that fails
  when the blocklist is emptied; AC1's test passes vacuously in that case. The
  criterion itself is fine and is met.
- **E2 — I extended the blocklist by 26 words on my own judgment**, which is
  the remedy the plan prescribes but the specific line is editorial and nobody
  approved it. One entry the *builder* chose, `gay`, deserves a human look for
  a reason that is not about offensiveness at all.
- **E3 — `/quorum:guard` reports one violation against this verdict, and the
  violation is the guard's own bug.** It will show up again at publish time.

Everything else landed. Six acceptance criteria, all met. Eleven findings
accepted, one rejected, no blockers, no criterion unmet.

## Acceptance criteria

| AC | Met | Evidence |
|---|---|---|
| AC1 | yes | `tests/unit/words.test.ts:66` checks all 1,467 curated words against the blocklist; `tests/unit/words.test.ts:59` is a new anchor asserting 24 named words are unmintable regardless of what the blocklist says. The four bad pairs review found reachable (`ugliest-*`, `oral-*`, `coloured-*`, `*-baboon-*`) no longer are — see *Changes applied*. |
| AC2 | yes | Re-run by mutation, not asserted from the record: `BLOCKED_WORDS` emptied to `[]` fails three tests (`tests/unit/words.test.ts:59`, `tests/unit/words.test.ts:80`, `tests/unit/words.test.ts:101`). Neutering `withoutBlockedWords` to the identity fails four (`tests/unit/words.test.ts:59`, `tests/unit/words.test.ts:66`, `tests/unit/words.test.ts:101`, `tests/unit/words.test.ts:108`). |
| AC3 | yes | `tests/unit/words.test.ts:101` (1150 < 1202, 317 < 355) and `:108` (every listed word absent from whichever corpus held it). Verified independently against the installed package: all 90 entries match a corpus word, none matches nothing. |
| AC4 | yes | `tests/unit/words.test.ts:123` derives 1150 x 317 x 900 = 328,095,000 from the filtered lengths — 3.28x the hundred million `start-and-share` AC6 asks for. Duplicated deliberately at `tests/unit/protocol.test.ts:162`. |
| AC5 | yes | `src/net/protocol.ts:116-122` (the `generateTableId` docstring) and `README.md:74-82` both describe a corpus curated here and why; figures corrected to 1150/317/328 million by this adjudication. |
| AC6 | yes | Full suite green, no test weakened — `tests/unit/protocol.test.ts` holds its 17 cases and 30 assertions, `tests/unit/words.test.ts` goes from 5 cases / 8 assertions to 6 / 10; no `skip` or `only` anywhere in `tests/` or `worker/tests/`. Ids remain adjective-animal-digits, lowercase, longest `straightforward-tyrannosaurus-999` at 33 characters against `MAX_TABLE_ID_LENGTH` 64, so `normaliseTableId` accepts every id minted. |

## Dispositions

Twelve findings across six lenses. Five of them are three lenses independently
finding the same two gaps, which is worth more than five separate findings would
have been: `ugliest` was found by behavior, correctness and spec-fidelity, and
the primates by behavior and correctness.

| Finding | Lens | Severity | Disposition | Reasoning |
|---|---|---|---|---|
| F1 | correctness | major | **Accepted** | Confirmed against the installed package: `coloured` was in `TABLE_ID_ADJECTIVES` and eight primates in `TABLE_ID_ANIMALS`, so `coloured-baboon-417` was mintable at about one creation in 47,555 — the same order as the rate the plan's *Intent* gives as the reason this work exists. The four primates the first cut removed have no vulgar reading other than the racial one, so stopping at four was a line with nothing behind it. |
| F1 | test-quality | major | **Accepted** | Reproduced the mutation: deleting `naked`, `beaver`, `fat`, `cow`, `pig`, `ugliest`, `baboon`, `coloured` from `BLOCKED_WORDS` left every one of the unit project's 124 pre-existing tests green while `naked-beaver-417` became mintable again — under that mutation the only red is the anchor this adjudication added. Every assertion compared the corpora against the blocklist, so the blocklist could erode to nothing without a test noticing. |
| F1 | behavior | minor | **Accepted** | `ugliest` is in the package's `adjectives` and was not on the list. The reviewer minted it out of the running app (`ugliest-starfish-298`); I confirmed membership directly. |
| F2 | correctness | minor | **Accepted** | Same defect as behavior F1, found independently. |
| F1 | spec-fidelity | minor | **Accepted** | Same `ugliest` gap, plus `oral`, which is the class of word the entry `sexual` was added for. Both confirmed present in the corpus. |
| F2 | behavior | minor | **Accepted** | Same primate gap as correctness F1, found by driving the built app. |
| F3 | correctness | nit | **Accepted** | Verified: `adjectives.filter(a => animals.includes(a))` returns `['sole','swift']`, so the corpora are *not* disjoint. The conclusion the comment supports still holds — no word on the blocklist is in both — but the comment stated the stronger, false version, in exactly the place a maintainer would rely on it. |
| F2 | spec-fidelity | nit | **Accepted** | Same false disjointness claim, found independently; the security lens noted it too. |
| F2 | test-quality | nit | **Accepted** | Confirmed by the mutation runs above: the AC2 comment claimed nothing else would notice the two mutations, and something does in both cases. A maintainer following it would have trimmed the coverage that was actually working. |
| F3 | spec-fidelity | nit | **Accepted** | Confirmed from the fork point: `tests/unit/protocol.test.ts:1` at `86e6953` did import `adjectives` and `animals`, so the build note's "only caller in `src/`, `worker/` and `tests/`" is wrong. Corrected here rather than by rewriting the builder's record — see *Changes applied*. |
| F1 | simplicity | minor | **Accepted in part** | The documentation half is right and is fixed: `withoutBlockedWords`'s docstring claimed the empty-list call "proves the filter below is what removes them", and it cannot — an empty list removes nothing by construction. The structural half is rejected. Dropping the parameter and the export would force the AC2 test to be rewritten around a design the plan recorded as a deliberate deviation, to remove one export that costs nothing and reads clearly. Churning a green module for that is not a trade I will make unattended. |
| F2 | simplicity | nit | **Rejected** | The duplicated hundred-million assertion is deliberate and the builder said why: the `protocol.test.ts` copy is what ties the space to `generateTableId`'s wiring, the `words.test.ts` copy is AC4's own coverage. Removing either deletes a test to resolve a style finding, which is the one move this pipeline exists to prevent. The drift risk is real and now smaller — both comments carry the same corrected figures. |

## Changes applied

All in one commit, separate from the builder's.

- `src/net/words.ts:71` — 26 words added to `BLOCKED_WORDS`, taking it from 64
  to 90 and the corpora from 1167/326 to 1150/317. Seventeen adjectives (`bare`,
  `chubby`, `coloured`, `grotesque`, `grubby`, `handicapped`, `juicy`, `moaning`,
  `obnoxious`, `oral`, `primitive`, `racial`, `repulsive`, `scrawny`, `ugliest`,
  `unsightly`, `xenophobic`) and nine animals (`baboon`, `bonobo`, `gibbon`,
  `lemur`, `mandrill`, `marmoset`, `orangutan`, `primate`, `tarsier`).
  (behavior F1/F2, correctness F1/F2, spec-fidelity F1)
- `src/net/words.ts:1-52` — the module docstring now names the three ways a
  word-at-a-time list keeps leaking, because all three were found by review and
  all three will recur: inflections, near-synonyms, and partially-blocked
  classes. The `BLOCKED_WORDS` comment states the true claim about the corpora
  and warns what a merged list does to a word that is in both.
  (correctness F3, spec-fidelity F2)
- `src/net/words.ts:167-175` — `withoutBlockedWords`'s docstring says what the
  exported parameter does and does not demonstrate. (simplicity F1)
- `tests/unit/words.test.ts:29,59` — `NEVER_MINTABLE`, 24 words written down
  literally and asserted absent from both curated corpora. This is the only
  assertion in the suite that does not read the blocklist to decide what the
  blocklist should say. Verified it goes red on the erosion mutation that was
  previously green. (test-quality F1)
- `tests/unit/words.test.ts:80` — AC2's comment replaced with the measured
  mutation results. (test-quality F2)
- Figures corrected everywhere they were made stale by the additions:
  `README.md:70,81`, `src/net/protocol.ts:84-85`, `tests/unit/protocol.test.ts:149,166,172`,
  `tests/unit/words.test.ts:68,126`. The birthday bound in the `ID_DIGITS`
  comment is 22,702 at the new size and still reads "twenty-three thousand".
- **spec-fidelity F3 is corrected here, not in `plan.md`.** The build note's
  C4 confirmation should read that `generateTableId` and
  `tests/unit/protocol.test.ts` were the two references to the package's
  corpora. I did not edit the builder's record to say so: rewriting another
  agent's recorded evidence hides the error rather than correcting it, and the
  S3 deviation twenty lines below it already describes the re-pointing
  accurately.

No production behaviour changed beyond the corpus the generator draws from. The
id shape, the digit range, the wiring and `normaliseTableId` are untouched.

## Escalations

### E1 — the plan's *Test strategy* names the wrong test, and only a human should fix it

*Test strategy* says of AC2: "Run it by emptying the blocklist and watching AC1's
test fail." AC1's test cannot fail that way — it asserts that no curated word is
on the blocklist, and both sides of that comparison come from `BLOCKED_WORDS`, so
an empty list satisfies it vacuously. The plan contradicts itself two paragraphs
later, where AC3 exists for exactly this reason.

The builder recorded this as a PLAN DEFECT and worked around it correctly. I
re-ran every row of its mutation table rather than trusting it, and the table is
accurate. **AC2 the criterion is met** — emptying the list fails three tests.

Not mine to fix: it is a sentence in the plan, and even in a section I am
permitted to edit, silently correcting the specification I am judged against is
the habit this pipeline is built to prevent.

- **Option A (recommended):** amend the sentence to read "watching AC2's and
  AC3's tests fail". It is *Test strategy*, not *Intent* / *Acceptance criteria*
  / *Non-goals*, so the requirements fingerprint is unaffected.
- **Option B:** leave it. The build note and this verdict both record the
  correction, and the plan stays as it was written.

### E2 — the editorial line on the word list, including one entry I did not add

The plan's *Non-goals* prescribe the remedy I applied — "a pair survives that no
single word explains … a word gets added" — and its *Open questions* record that
the list is deliberately generous. So adding words is in scope. **Where the line
falls is still an editorial judgment, and I made it alone.**

Three parts a human should confirm:

1. **The primates as a class.** `lemur`, `marmoset` and `tarsier` carry nothing
   offensive on their own. I removed them anyway, because blocking four primates
   and not the other eight is a line no reader can see, and taking the group
   ends the argument for nine words out of 355. Defensible either way.
2. **What I did *not* add.** `native`, `deaf`, `blind`, `disabled` and `ratty`
   all survive. Each is a neutral word whose bad reading needs a second word to
   arrive, and I judged the pairings weak. A stricter reader would take at least
   `disabled` and `handicapped` together; I took only `handicapped`.
3. **`gay`, which the builder listed and I left alone.** Flagging it because it
   is not the same kind of entry as the rest: it is a neutral identity term, and
   a corpus that filters it alongside `filthy` and `nasty` can be read as
   treating the identity as the problem. The competing reading — that its
   pejorative use is exactly what makes it unsendable as `gay-<animal>-417` — is
   why I did not touch it unattended. This is a values call, not a technical one.

**Recommendation:** keep the list as it stands, including `gay`, and treat this
as a review of the line rather than a defect. The cost of over-blocking is
measurably nil at 3.28x headroom; the cost of under-blocking is the failure the
whole work item exists to prevent.

### E3 — the guard fails this verdict for holding escalations at all

`python3 .../quorum/0.22.0/bin/guard.py --base 86e6953` reports one violation and
nothing else:

```
VIOLATION [verdict] outcome "ready with follow-ups" alongside open escalations —
an escalation forces "ready with follow-ups" or "blocked"
```

The message names "ready with follow-ups" as an allowed outcome and then fails
it. The check is `if outcome.lower().startswith('ready'): ... if
has_content(text, 'Escalations'): fail(...)` at `bin/guard.py:275-283`, so *any*
`ready*` outcome with a non-empty *Escalations* section is a violation and only
`blocked` passes. Identical in 0.23.0, so upgrading does not fix it.

I am not adjudicating this away — a guard violation is not a finding — and I am
not renaming the outcome to satisfy it. Reporting `blocked` over a green suite
with every criterion met would be a false statement about this change, and
deleting the escalations to pass a checker is the exact move the guard exists to
catch.

What a human decides:

- **Option A (recommended):** publish over this one violation, noting it is a
  checker bug. Nothing gates on it here — this repo has no `.quorum/guard.py`
  and no `quorum-guard` workflow, so the guard is advisory today.
- **Option B:** patch the plugin's `check_verdict` to exempt `ready with
  follow-ups`, then re-run. That is a change to the tooling, not to this repo.

## Follow-ups

Real, out of scope for this change.

1. **A dependency upgrade admits new words unscreened.** `unique-names-generator`
   ships the corpora; nothing in the suite screens *new* corpus words against
   anything but the existing list, and `NEVER_MINTABLE` only names words already
   known. Bumping the package should mean re-sweeping the diff of the corpora.
   Worth a note next to the dependency, or a test that pins the corpus sizes so
   an upgrade has to be looked at.
2. **The list is not exhaustive and does not claim to be** (*Non-goals*:
   "Perfection"). I swept the surviving 1,467 words for inflections of listed
   entries and for the classes review named. A different reader will find more.
3. **File the curated list upstream**, as the plan's *Open questions* already
   noted was the neighbourly thing.
4. **No test recipe is recorded in the repo.** `/tests:run` asks for
   `.claude/skills/run-regression-tests/SKILL.md`; the recipe is rediscovered
   from `.github/workflows/regression-tests.yml` every run. Writing it is a repo
   change unrelated to this work item, so I did not.
5. **Table ids are case-sensitive** — `Mute-Harrier-553` and `mute-harrier-553`
   are different tables. Pre-existing, noted by the behavior lens, untouched by
   this change since generated ids are always lowercase.

## Environment note

`npm run test:e2e` fails at startup on the default `PATH` here: `node` resolves
to v20.16.0 while `.nvmrc` pins 22, and `wrangler` refuses to boot the test
server below 22. Not a code defect and not a suite defect — the run above was
made green by putting Node 22.23.2 on `PATH` first. CI reads `.nvmrc` and is
unaffected.

# Review 003 — spec-fidelity

- Lens: spec-fidelity
- Verdict: findings
- Diff range: `5012fe0...HEAD`

## Findings

### F1 (minor)

**Claim:** The generated id has 899 possible endings, not the 900 the README, the doc comment, the build notes and the unit test all state; `-999` is unreachable.

**File:** `src/net/protocol.ts:100`

**What:** `ID_DIGITS = { min: 100, max: 999 }` is passed to `NumberDictionary.generate`, whose 4.7.1 implementation is `Math.floor(Math.random() * (max - min)) + min` — an exclusive upper bound. The real range is [100, 998], so the id space is 1202 x 355 x 899 = 383,612,290, not the 384,039,000 quoted in the S5 build note, in the doc comment at src/net/protocol.ts:88-89 ("the digits take it to 384 million") and in README.md:70 ("1202 adjectives, 355 animals and 900 numbers, 384 million in all"). tests/unit/protocol.test.ts:159 asserts the space as `new Set(adjectives).size * new Set(animals).size * 900`, a multiplier the implementation cannot reach, so the suite cannot notice the discrepancy or any future shrinking of the digit range.

**Failure scenario:** Calling `generateTableId()` 400,000 times (measured against the installed 4.7.1 ESM build the browser bundle uses) yields exactly 899 distinct endings, maximum 998, and never an id ending `-999`. A reader of README.md:70 is told the generated id is drawn from 900 numbers and 384 million ids; the true figures are 899 and 383,612,290 — 426,710 ids fewer than documented. AC6's "at least a hundred million distinct ids" is still satisfied, so this is an inaccuracy in shipped documentation and in a build-note measurement presented as arithmetic fact, not a behavioural break.

**Suggested direction:** Either set `max: 1000` so the range really is [100, 999] and every quoted number becomes true, or correct 900 -> 899 and 384 million -> 383,612,290 at README.md:70, src/net/protocol.ts:88-89 and the S5 build note, and derive the multiplier in tests/unit/protocol.test.ts:159 from the same `ID_DIGITS` constant the generator uses rather than a literal.

## Notes

Scope: read the two commits in 5012fe0..HEAD (e1d0c32, e249e8c); working tree clean before and after (verified with `git status --porcelain`). All builds and measurements were written to the scratchpad, never to the repo; no repo file was modified.

Verified and holding: Approach claims C2, C3, C4 and C5 re-read against the fork point 5012fe0 (base input.ts starts from onPointerUp gated on TAP_SLOP and from onClick; step returns its argument for idle/game-over; normaliseTableId trims and rejects empty/over-64; the base #choose held exactly #play-single, #table-id, #play-table and nothing rendered a URL). C6 re-measured: unique-names-generator 4.7.1, MIT, zero dependencies, dist/index.d.ts typings, 1202 adjectives and 355 animals, all distinct and all matching ^[a-z]+$ (so an id splits on '-' into exactly three parts), longest possible id 33 chars against MAX_TABLE_ID_LENGTH 64, and the built bundle is 12.82 KB gzipped exactly as the build notes claim. C1, C7 and C8 are about the live site and the platform and were not independently reproducible here.

Non-goals: none built. worker/ is untouched in the diff, and `wrangler deploy --dry-run` gives 21.93 KiB / 6.91 KiB gzipped with no generator symbol or dictionary word in table.js, so the first runtime dependency really does not reach the Durable Object. No matchmaking, no id reservation (the Create button mints and joins, taking nothing), no QR/deep-link/shortening, and paddle tracking (courtY, drivesPaddle, onPointerMove) is byte-identical.

Deviations: S1 (tap tracker removed rather than relaxed) and S2 (game-over prompt made touch-aware) hold — startGesture(false) reproduces both superseded strings byte for byte, so a keyboard device is unchanged. S5's NumberDictionary hoisting trap is real: generate() returns a one-element array, and the digits-afresh test is the only assertion that would catch a hoist. S8's comment-reattachment fix is present. No PLAN DEFECT note exists anywhere in docs/work/start-and-share/.

Suite: 129 unit tests pass and `tsc --noEmit` is clean on this machine; `playwright test --list` reports 76 behavioural tests, both matching the build notes. I did not execute the e2e suite: ports 4173 and 8787 were already held by another agent's run and I did not disturb them.

Not raised as a finding, recorded for completeness: C6's baseline "a current bundle of 5.5 KB" is really the post-change bundle with the dependency stubbed out (measured 5.55 KB); the actual pre-change bundle at 5012fe0 is 5.10 KB gzipped. The dependency's isolated cost measures 7.27 KB against the claimed 7.1 KB. No acceptance criterion depends on bundle size and the claim's substance ("a real increase and an irrelevant size") is correct, so this is imprecision rather than a defect.

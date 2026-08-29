# Review 002 — correctness

- Lens: correctness
- Verdict: findings
- Diff range: `5012fe0...HEAD`

## Findings

### F1 (minor)

**Claim:** The chooser's own instruction line still names only two of the three ways in, omitting the "Create a table" control this change adds.

**File:** `src/status.ts:88`

**What:** `sessionStatusText` returns 'Choose single player, or join a table by its id' for `mode === 'choosing'`, unchanged by this work item, while `index.html` now renders three controls in the chooser: Single player, Create a table, and the Table id field.

**Failure scenario:** A player makes a bare visit (`http://host/`, no query string). `main.ts` unhides `#choose`, which now reads "Single player | or | Create a table | or | Table id [____] Join table", and `#status` directly above it reads "Choose single player, or join a table by its id". The line tells a player whose only options are the two it names — precisely the player AC5 exists for, the one with nobody to agree an id with — that joining by id is the only way to a table. S10 updated the two other places that said this (the hint text and the README's "Playing somebody else"); this third one, which is asserted verbatim in tests/unit/status.test.ts:67, was missed.

**Suggested direction:** Name the third option in the choosing line (and update the assertion in tests/unit/status.test.ts that pins the string), the same way the hint and README were updated.

### F2 (nit)

**Claim:** `ID_DIGITS.max` is never generated: the id space is 899 numbers, not the 900 / 384 million asserted in the doc comment, the README and the unit test's arithmetic.

**File:** `src/net/protocol.ts:100`

**What:** `NumberDictionary.generate({ min, max })` computes `Math.floor(Math.random() * (max - min)) + min` (node_modules/unique-names-generator/dist/index.m.js), so `{ min: 100, max: 999 }` yields 100..998 inclusive — the maximum is exclusive.

**Failure scenario:** Measured directly: 300,000 calls to `NumberDictionary.generate({min:100,max:999})` produce exactly 899 distinct values with a maximum of 998. So no id ending in `-999` can ever be minted, and the real space is 1202 x 355 x 899 = 383,612,290, not the 1202 x 355 x 900 = 384,039,000 stated in this doc comment (line 89, "384 million"), in README.md line 70 ("900 numbers, 384 million in all") and in tests/unit/protocol.test.ts lines 158-159, whose assertion multiplies by a literal 900 while claiming to be "exact" arithmetic over the corpus. AC6's "at least a hundred million" still holds, so nothing a player sees breaks; what is wrong is that four stated claims describe a space the code does not produce, and the test that exists to pin the space computes it from a factor the generator never reaches.

**Suggested direction:** Either use `{ min: 100, max: 1000 }` so all 900 three-digit numbers are reachable and the documented arithmetic becomes true, or correct the 900/384-million figures (and the test's multiplier) to 899/383,612,290.

## Notes

Checked and found sound: the `pointerdown`-starts-the-game path (mouse excluded, listener still on the court alone, so `mobile-touch-controls` AC5 still holds); `TableSocket.rematch` guards on `readyState`, so the new touch path cannot throw on a still-connecting socket; `shareLink` invokes `targets.share` synchronously before its first `await`, preserving the user activation the Web Share API needs; `showInvite`'s `invite.hidden === (url !== '')` transition test is correct in all four states and cannot flicker or leave a stale note; `browserTargets` keeps both methods bound; `generateTableId` output is always lowercase letters/hyphens/digits, at most 33 chars, and satisfies `normaliseTableId` (both dictionaries verified: 1202 and 355 entries, all `^[a-z]+$`, no duplicates); the `NumberDictionary` hoisting trap is genuinely avoided. `npx tsc --noEmit` and `npx tsc --noEmit -p worker` are clean; `npx vitest run` is 129/129 green.

Measured and deliberately not reported: showing the new `#invite` row at an iPhone SE viewport (320x568) puts 111 px of content past the screen and pushes `.hint` 79 px below the fold. I dropped it because the pre-existing `#choose` row already puts 144 px past the screen at the same viewport on a bare visit, so an overflowing transient row is an accepted pattern here; the court, the invite, its button and the mute button all stay on screen and the page remains scrollable. Flagging it in case the layout lens wants the numbers.

I could not run the Playwright suite: port 4173 was already occupied by another preview server, and `webServer.reuseExistingServer` is `false`. The behavioural checks above were done against that running build, read-only.

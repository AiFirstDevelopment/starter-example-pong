# Review 001 — behavior

- **Lens:** behavior
- **Verdict:** findings
- **Diff range:** `86e6953...HEAD`

## Findings

### F1 — minor

**Claim:** `ugly` is blocked but the corpus's `ugliest` is not, so the running app still mints ids built on an adjective the survey itself judged unacceptable.

**Location:** `src/net/words.ts:82`

**What:** A word the blocklist rejects survives in a different inflection, so the curated corpus still reaches the insult the block was for.

**Failure scenario:** Drove the built bundle (vite preview :4173 + wrangler dev :8787), clicking 'Create a table' 8,998 times and reading the id off the invite line. Run produced `ugliest-starfish-298` (and `ugliest` is one of the 1167 shipped adjectives, confirmed by full coverage of the corpus across the sample). The page then shows `http://localhost:4173/?table=ugliest-starfish-298` under 'Send this link to whoever you are playing:' — the same failure the plan's Intent describes for `fat-cow-233`, reached by a word whose base form the blocklist already removes. Confirmed against the shipped bundle: `"ugly"` occurs twice in dist/assets/index-*.js (corpus + blocklist), `"ugliest"` once (corpus only).

**Suggested direction:** Add `ugliest` to BLOCKED_WORDS; while there, `chubby`, `grubby` and `bare` are the surviving near-synonyms of the already-blocked `fat`, `dirty`/`filthy` and `naked`.

### F2 — minor

**Claim:** The blocklist removes `ape`, `monkey`, `gorilla` and `chimpanzee` but leaves the rest of the primate names in the corpus, so the same class of word stays reachable in a minted id.

**Location:** `src/net/words.ts:87`

**What:** The animal block covers four great-ape words and stops there, while `baboon`, `bonobo`, `gibbon`, `mandrill`, `orangutan`, `lemur` and `primate` survive the filter.

**Failure scenario:** In the same 8,998-id run against the running app, the generator produced `spotty-baboon-442` and `male-gibbon-399`, and all seven of those words are in the 326 animals the app draws from (verified by the sample covering the corpus exactly, and by each occurring once in dist/assets/index-*.js against twice for the blocked four). Creating a table can therefore hand a player `<adjective>-baboon-NNN` to send to somebody, which is the reading that got `ape`, `monkey`, `gorilla` and `chimpanzee` removed in the first place. AC1 as written still passes, since `baboon` is not on the blocklist; the plan's own non-goal says the remedy for a surviving case is that 'a word gets added'.

**Suggested direction:** Add `baboon` at minimum, and consider `bonobo`, `gibbon`, `mandrill`, `orangutan` and `primate` for the same reason the four already listed are there — the headroom (342M against AC6's 100M) makes it free.

## Notes

Ran the assembled app, not the test suite: `npm run build` under Node 22.23.2, bundle served by `vite preview` on :4173, real Durable Object via `wrangler dev --config worker/wrangler.toml --port 8787 --local`, driven by real Chromium contexts. Ports released and dist/ rebuilt to its original output afterwards; `git status` clean throughout.

Everything else the plan claims held when driven. AC1: 8,998 ids minted through the real 'Create a table' control contained none of the 64 surveyed words (~976 expected had the generator still used the package's raw corpora). AC3/AC4/AC5 numbers: those ids covered exactly 1167 distinct adjectives, 326 distinct animals and digits 100-999, i.e. the 342,397,800 the README and plan state, measured out of the running app. AC6: every id matched adjective-animal-3digits, longest `psychological-tyrannosaurus-922`; generated links joined via `?table=`; two-browser play, win at 11, rematch to 0-0 from either side, opponent-left notice, third arrival refused without disturbing the pair, freed seat re-taken with the score preserved, 60s idle-out reopening at 0-0, single-player win and restart, `?seed=7` byte-identical across runs and different from `?seed=8`, mute button and `M` key, copy-link button writing the exact invite URL to the clipboard, Pixel 5 chooser/create/tap-to-start, junk ids typed and via `?table=` all behaved as documented. The longest reachable id does not overflow the invite row at 393px.

Two things observed but deliberately not filed: table ids are case-sensitive (`Mute-Harrier-553` and `mute-harrier-553` are different tables) and the 30-a-minute rate limit did not bite over 36 rapid creations locally. Both are pre-existing and outside this diff range; generated ids are always lowercase, so neither is touched by this change.

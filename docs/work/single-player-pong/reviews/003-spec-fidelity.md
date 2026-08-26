# Review: spec-fidelity

- **Lens:** spec-fidelity
- **Verdict:** findings
- **Diff range:** 4644a71...HEAD (plus uncommitted working-tree changes)

## Notes

Verified against the repository rather than the narrative. Claims C1 (base tree at 4644a71 holds only .claude/settings.json and docs/work/.gitkeep), C2 (node v20.16.0, npm 10.9.0), C4/C5 (Playwright clock and addInitScript semantics, consistent with the passing suite) and C6 (score is in the DOM at index.html:14-18, not painted in render.ts) all hold. C3 does not — see F2. Non-goals: none of the seven were built. The clickable mute button is the only pointer-operated surface and is a sound control, not game control; the plan itself requires a "mute control" in AC9 and the choice is recorded in Build notes, so I did not treat it as a non-goal violation. The S5 CPU_SPEED deviation holds up empirically: simulating the built step function over seeds 1,2,3,7,9 for 90 s of play, neither a tracking nor an aiming player scores at 280 or 240 px/s, an aiming player scores 0-2 points at 200 px/s, and at the shipped 160 px/s a tracking player scores 2-5 while an idle player still loses 0-11 (game over at frame 2252 with seed 1) — matching every number in the note. The S8 addition notes (paused clock, @types/node) and the S8 mutation table are consistent with the code and tests as written. All ten ACs have at least one behavioural test. AC checkboxes and Claim checkboxes are left unticked, which is correct: the 2-build contract permits ticking Steps only. No PLAN DEFECT marker appears anywhere in the plan.

## Findings

### F1 — major

**Claim:** AC4's explicit "No wall sound ... at that moment" clause is violated: one tick can emit both `wall-hit` and `paddle-hit`, so the wall tone and the paddle tone are played simultaneously.

**Location:** `src/game/step.ts:119`

**What:** The wall-reflection block (lines 109-117) does not短-circuit the paddle test that follows. The plan's own flowchart makes the two branches mutually exclusive (`B -- yes --> C --> S2` terminates; only `B -- no --> D` reaches the paddle check), and AC4 states "When the ball strikes either paddle, a paddle sound plays ... No wall sound and no out-of-play sound occur at that moment." The implementation makes the branches independent, so a corner strike fires both. This is not recorded anywhere in Build notes.

**Failure scenario:** Reproduced by a single direct `step` call: state = {phase:'rally', playerY:400, ball:{x:45, y:472, vx:-300, vy:200}}, dt = 1000/120. The returned events are exactly `[{kind:'wall-hit',edge:'bottom'},{kind:'paddle-hit',side:'player'}]`, so `main.ts` `handle()` calls `audio.play('wall-hit')` (226 Hz square) and `audio.play('paddle-hit')` (459 Hz square) in the same frame — AC4's negative clause fails. The very next tick emits another `wall-hit` (ball still at y=473 with vy re-derived downwards by `bounceOffPaddle`), so the player hears wall+paddle then wall again ~8 ms later. This is not a hand-crafted-only state: sweeping the built `step` over 34 player strategies x 60 seeds produced 135 multi-sound ticks, including a plain ball-tracking player at seed 2 (tick 12498) and a hold-ArrowDown player at seed 24 (tick 1496). The same defect also produces `[wall-hit, out-of-play]` pairs (e.g. idle player, seed 27, tick 2420), so a wall tone sounds for a ball that has already left the canvas.

**Suggested direction:** Make the tick's collision resolution exclusive, as the plan's flowchart specifies — e.g. skip the paddle/out-of-play tests when a wall reflection already fired this tick, or resolve the earliest time-of-impact and emit only that event.

### F2 — minor

**Claim:** Claim C3 is false: Playwright browsers were already installed on this machine before the work item started, and the "C3 correction" in Build notes reasserts the false half of it.

**Location:** `docs/work/single-player-pong/plan.md:133`

**What:** C3 asserts "No Playwright browsers are currently installed on this machine ... so the build step must run `npx playwright install chromium` before any behavioural test can pass." Build notes (line 223) correct only the cache path and state "The substance of the claim held — no browser was installed, and `npx playwright install chromium` was required and run." Both halves are wrong.

**Failure scenario:** `~/Library/Caches/ms-playwright/chromium-1234/INSTALLATION_COMPLETE` is dated Aug 25 12:44 and `chromium-1217` Aug 6 May 2026, whereas the earliest pipeline event in `docs/work/single-player-pong/state.json` is 2026-08-26T12:28Z (08:28 local) and the first build commit `1ebc96c` is Aug 26 10:01 local. Revision 1234 is exactly the revision `playwright-core` 1.62.1 (the resolved version) requires, so the browser this suite needs predated the work item by a day and `npx playwright install chromium` was a no-op that only added a `.links` entry (Aug 26 09:53). A later work item reading this note will believe a browser download is a mandatory, non-trivial build step on this machine when it is not, and will trust a "correction" that was never verified.

**Suggested direction:** Correct the Build note to say what was actually observed: the required chromium revision was already present, and the install command was run but was a no-op.

### F3 — minor

**Claim:** The recorded "M does not also start the game" deviation leaves the on-screen prompt and the README asserting behaviour the code does not have.

**Location:** `README.md:12`

**What:** README's key table says "| any key | serve, and start a new game once one has been won |", and `index.html` line 27 / `src/main.ts` line 51 display "Press any key to start". `src/input.ts` lines 30-35 return from `onKeyDown` before calling `handlers.onStart` whenever the key is in `MUTE_KEYS`, so `m`/`M` is the one key that does not start the game. Build notes (line 276) record the deviation but neither the prompt nor the README was updated to match.

**Failure scenario:** Load the page. The status line reads "Press any key to start". Press `m`. The mute button flips to "Sound off" and the status line still reads "Press any key to start" — no serve, no rally, contradicting both the on-screen instruction the player just followed and README line 12. The same is true after a game ends, where the status reads "Computer wins! Press any key to play again".

**Suggested direction:** Either let `M` start the game as well as toggle mute, or reword the prompt and the README row so the one exception is stated (e.g. "Press Space to start").

### F4 — nit

**Claim:** The S1/S2 and S3/S5 sequencing deviations in Build notes describe commit boundaries that do not exist in the branch.

**Location:** `docs/work/single-player-pong/plan.md:216`

**What:** The note says "the first commit carries the scaffold together with S2's `state.ts` and S4's `render.ts`" and "`cpu.ts` (S5) therefore landed with S3 rather than after S4", implying the rest of the steps landed in separate commits. The branch has three commits, and `1ebc96c` contains the entire game: `audio.ts`, `input.ts`, `main.ts`, `render.ts`, `game/{state,step,cpu,rng}.ts` and all three unit-test files — i.e. S1 through S7 in one commit.

**Failure scenario:** `git show --name-only 1ebc96c` lists every source file; `git log --oneline 4644a71..HEAD` shows only `1ebc96c` (all of S1-S7), `6dcb588` (S8) and `0e12bda` (plan update). A reader who trusts the note expects the plan's incremental history — S1's "working blank court", then S3, S5, S6, S7 — and cannot bisect a defect to a step, because the recorded deviation understates how much of the sequencing was collapsed.

**Suggested direction:** Restate the deviation as what happened: S1-S7 landed as a single commit, and say why.

# Review: spec-fidelity

- Lens: spec-fidelity
- Verdict: findings
- Diff range: f8ffd2b...HEAD

## Notes

Verified and clean, for the record:

Claims C1, C2, C4, C5, C6 all check out against the base commit f8ffd2b. C1: `step(state, dtMs, input)` took one `Input` and called `cpuVelocity`/`cpuTargetY` internally; the only caller was `src/main.ts:117`. C2: `PADDLE_SPEED = 420` (src/game/state.ts:20), `CPU_SPEED = 160` (src/game/cpu.ts:15). C4: no wrangler config existed; `deploy` was CLI flags only. C5: one `webServer` with `reuseExistingServer: false` and two projects. C6: `interpolate(previous, current, alpha)` takes two whole `GameState`s and returns a fresh object (so `main.ts`'s `drawn.playerY = ownY` does not corrupt the last snapshot).

C3 (Durable Object entitlement) cannot be verified from the tree — the probe Worker was deleted, and the build note also records that the production deploy was never run, so `pong-table.joelstevick.workers.dev` (referenced by `.env.production` and the README) does not exist yet. That is declared, not hidden, but it means production DO behaviour rests on the build note's word.

AC2's regression wall holds up on inspection: `git diff` touches none of the eight existing e2e specs, and `tests/unit/step.test.ts` / `tests/unit/status.test.ts` are additive only — no existing assertion changed. The `step` refactor is behaviour-preserving for single player (`movePaddle` is the old left-paddle branch moved verbatim; the CPU branch is unchanged and still reached by `null`). `src/game/cpu.ts`, `state.ts`, `render.ts`, `rng.ts`, `audio.ts` and `input.ts` are untouched, so the "no rules, physics, sounds or court changes" non-goal holds. Both typechecks (`tsc --noEmit` and `tsc --noEmit -p worker`) pass. Unit/e2e counts match the build notes exactly (74 unit, 55 e2e), and `table.spec.ts` contains exactly the two `setTimeout`s the notes account for.

Non-goals: no lobby, id generation, uniqueness check, spectator path, rejoin token, grace period, reconciliation or persistence appears anywhere in the diff. `assignSlot` is seat assignment, which S3 asked for, not matchmaking.

Deviations checked and sound: refusal-as-message-then-close (a failed WS handshake genuinely carries no status or body to the page, so AC4's "a message that says the table is in use" needs the socket accepted); disconnect keeps the game while only the timeout discards it (matches the plan's own state diagram and is what gives AC7 content); `right: Input | null = null` default (existing call sites compile untouched, and `step(...)` with three args is tested to equal `step(..., null)`); the suite's shortened idle timeout is passed the same way a real deployment would override it. I also confirmed Vite's `loadEnv` gives an inline `process.env.VITE_TABLE_URL` priority over `.env.production`, so the Playwright build really does point at the local `wrangler dev` rather than the unpublished production Worker.

One thing I deliberately did not raise as a finding: at a table, `step()` returns early on `game-over` and nothing on either the client or the server restarts play, so two players who finish a game sit on a static court until one of them leaves. No acceptance criterion covers a rematch and the plan is titled "one game of Pong", so this is a scope question rather than a spec deviation — flagging it here only in case the functional lens reaches the same place from the other direction.

## Findings

### F1

- Severity: minor
- File: src/session.ts
- Line: 76

**Claim:** AC1 is met only for a bare `/`; a URL that names a mode (`?seed=`, `?table=`) starts a game with no choice offered — the recorded PLAN DEFECT that the build notes ask the judge to escalate.

**What:** `readSession` treats any non-empty `?seed=` as "single player, already chosen" and any valid `?table=` as "that table, already chosen", and `src/main.ts:356-362` then starts that game without unhiding the chooser. AC1 as written says "When the page loads, the player is offered a choice ... the game does not start until one is chosen", with no exemption for URL parameters. The build notes (docs/work/multi-player/plan.md:313-346) declare this a PLAN DEFECT, explain that the alternative was editing the `goto` line of eight existing e2e specs (which AC2 forbids weakening), and say explicitly "The judge should put it to the user".

**Failure scenario:** A player opens `https://pong.pages.dev/?seed=1` — a bookmark or a link from before this change. The page drops them straight into the one-player game: `#choose` stays `hidden`, `#status` reads "Press any key to start", and there is no way to reach the table-id field without hand-editing the URL. For that page load AC1's "the player is offered a choice" is false. The same is true of any `?table=<id>` link. Only a visit with neither parameter satisfies AC1 literally.

**Suggested direction:** Do not silently accept or silently fix. Escalate to the user as the build notes ask: should `/?seed=1` ask which game the player wants, or is a URL that names a game a choice already made? If the user wants the chooser unconditionally, the cost is the eight `page.goto('/?seed=1')` lines in the existing e2e specs plus a click to dismiss the chooser, which reopens AC2's "no assertion weakened" promise.

### F2

- Severity: minor
- File: .nvmrc
- Line: 1

**Claim:** The repository's supported Node baseline moved from 20 to 22 as a side effect of adding the Worker — a project-wide change the plan never contemplated, recorded as a PLAN DEFECT that must be surfaced.

**What:** `.nvmrc` goes from `20` to `22`, and `.github/workflows/regression-tests.yml:29` pins `node-version-file: .nvmrc`, so CI and every contributor move with it. I verified the driver: the installed `wrangler` is 4.126.0 and its `package.json` declares `engines.node >= 22.0.0`. The plan's Approach and Steps say nothing about Node; the change is only visible in `docs/work/multi-player/plan.md:410-419`, which asks the judge to surface it.

**Failure scenario:** A contributor (or any downstream pipeline) still on Node 20 — the version this repository declared before this branch — runs `npm ci` and then `npm run test:e2e`. Playwright's second `webServer` shells out to `npx wrangler dev`, which refuses to run on Node 20 (`engines.node >= 22.0.0`), so the whole behavioural suite fails to start. The alternative the builder rejected — pinning a wrangler old enough for Node 20 — pulls in the advisory-carrying `esbuild`/`undici`/`ws`/`sharp` chain.

**Suggested direction:** Escalate the Node 20 → 22 bump to the user as an explicit decision rather than letting it land as an unremarked line in `.nvmrc`; if it is accepted, consider also adding an `engines` field to `package.json` so the failure is a clear message rather than a wrangler crash.

### F3

- Severity: nit
- File: README.md
- Line: 139

**Claim:** The README states the test suite's table server uses a two-second idle timeout; the code uses three seconds.

**What:** README: "The table server they run against is started with a two-second idle timeout instead of the minute a real one gets". The actual constant is `TEST_IDLE_TIMEOUT_MS = 3000` (tests/e2e/support/table.ts:28), passed through `--var IDLE_TIMEOUT_MS:3000` in playwright.config.ts. The build note itself says three seconds (docs/work/multi-player/plan.md:374).

**Failure scenario:** A contributor debugging a flaky AC7 (`tests/e2e/table.spec.ts:178`) reads the README, believes the table expires after 2000 ms, and reasons about the test's `TEST_IDLE_TIMEOUT_MS * 1.5` wait as 3 s of margin over a 2 s timeout when it is in fact 4.5 s over 3 s — or lowers a related timing constant to match the documented figure and makes the test race the timeout it is meant to outlast.

**Suggested direction:** Change "two-second" to "three-second", or word it as "a few seconds" so the prose does not have to track the constant.

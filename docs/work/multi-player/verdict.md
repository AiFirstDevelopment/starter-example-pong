# Verdict — multi-player

- **Adjudicated:** `f8ffd2b...635ae6e` (the whole branch off `main`), plus my own
  fixes committed on top. The reviews read `635ae6e`.
- **Reviews considered:** 001-behavior, 002-correctness, 003-spec-fidelity,
  004-security, 005-simplicity, 006-test-quality. No lens missing.
- **Outcome:** ready with follow-ups
- **Test suite:** green — 74 unit, 56 behavioural (both Playwright projects), on
  Node 22.23.2. The networked specs ran 120/120 across ten repeats.

## Read this first

Four things need a person, and one acceptance criterion is not met as written.

1. **E4 gates the deploy, not the merge.** `npm run deploy:table` publishes an
   unauthenticated public endpoint that lets anyone create unbounded Durable
   Objects on this account. Nothing is exposed until that command is run.
2. **E3 is the end of every table game.** Two people who play to 11 are stuck on
   a dead court, while the page and the README both tell them a key press starts
   another. Nothing in the acceptance criteria covers a rematch, so this is a
   decision rather than a defect — but it is reached by every pair who finishes.
3. **E1: AC1 is not met for `?seed=` / `?table=` URLs.** The builder recorded
   this as a plan defect and asked for it to be put to you. It is below.
4. **E2: the repository's Node baseline moved from 20 to 22** as a side effect of
   adding a Worker. Also a recorded plan defect.

## Acceptance criteria

Each walked independently, not taken from a review.

| AC | Met | Evidence |
|---|---|---|
| AC1 | **partly** | Met on a bare `/`: `tests/e2e/choose.spec.ts:23` asserts both controls are offered and that a key press and a click leave the court, the score and the sound log untouched. **Not met** on `?seed=` or `?table=`, which enter a game with no choice offered — `src/session.ts:65`. See **E1**. |
| AC2 | yes | No existing spec was touched: `git diff --name-status f8ffd2b...HEAD -- tests/e2e/` reports three additions and no modifications. `tests/unit/{step,status}.test.ts` are additive only. The refactor is behaviour-preserving by inspection — `movePaddle` is the old left-paddle branch moved verbatim and the CPU branch is unchanged, reached by `right === null`. `tests/unit/step.test.ts:305` pins the computer to `CPU_SPEED` and asserts it is short of `PADDLE_SPEED`; `mouse.spec.ts:252` and `touch.spec.ts:358` still replay `?seed=` identically. |
| AC3 | yes | `tests/e2e/table.spec.ts:77` — two contexts, opposite `You`/`Opponent` labels, and the two score histories compared entry by entry rather than sampled. |
| AC4 | yes | `tests/e2e/table.spec.ts:113` — the third browser gets the in-use message and no paddle; the other two are asserted silent and their score only goes up. |
| AC5 | yes | `tests/e2e/table.spec.ts:245` — 200 ms each way, own paddle within one pixel of the pointer on the frame it drew, opponent's still where it was, and arriving later. |
| AC6 | yes | `tests/e2e/table.spec.ts:150` — announced inside the criterion's five seconds, and the next arrival is admitted onto the freed paddle. |
| AC7 | yes | `tests/e2e/table.spec.ts:180`, **after the fixes below**. As it stood the assertion passed on the `0-0` in `index.html`'s own markup: with the game-discard deleted from the idle timer the test still passed 4 runs in 5. Gated on a snapshot having arrived, the same mutation fails 5 in 5. |
| AC8 | yes | `tests/e2e/table.spec.ts:292` — a forged snapshot is shown, then overwritten, and never appears in the other browser's history. |
| AC9 | yes | `tests/e2e/choose.spec.ts:94` — every socket refused before it leaves the browser, a point is still scored, sounds still play, and `socketAttempts` is `0`: single player does not merely tolerate a missing server, it never asks for one. |

## Dispositions

Sixteen findings. Every one was checked against the code rather than taken on the
reviewer's word.

| Finding | Lens | Severity | Disposition | Reasoning |
|---|---|---|---|---|
| F1 | behavior | major | Escalated (**E3**) | Confirmed. `startGame` is reached only from `seat()` at `worker/table.ts:123` when the second seat fills, `step()` returns unchanged on `game-over`, and `ClientMessage` carries nothing else. A table that reaches 11 is frozen until somebody disconnects. An exit needs a protocol message and a client path, and whether a table is one game or many is not mine to choose. |
| F2 | behavior | major | **Accepted** | Confirmed. `onSnapshot` refreshed the score and never the line, so the winner announcement outlived the game it announced. Fixed, with a regression test. |
| F3 | behavior | minor | Rejected | Real but overstated. The chooser does not come back after `refused` or `lost`, and that is a rough edge — but the message says "Agree another id and try that one", which a reload does, and the reviewer confirms the reload works. A real re-entry path is not two lines: `startTable` sets `started`, the `requestAnimationFrame` loop never stops and the socket is never torn down, so an unhidden form would be a control that does nothing. Larger work than this change; recorded as a follow-up. |
| F1 | correctness | major | Escalated (**E3**) | The same defect as behavior/F1, reached independently from the server side. Same escalation. |
| F2 | correctness | minor | **Accepted** | The same defect as behavior/F2, with the extra detail that `opponent:present` is sent before `startGame`, so the stale line is rewritten once more on the way into the new game. Same fix. |
| F1 | spec-fidelity | minor | Escalated (**E1**) | Confirmed against `src/session.ts:65` and `src/main.ts`. A recorded `PLAN DEFECT`; the builder asked for it to be put to you, and it is not mine to settle. |
| F2 | spec-fidelity | minor | Escalated (**E2**) | Confirmed, and reproduced: this machine's default Node is 20.16.0, and the suite cannot run on it — `wrangler` 4.126.0 declares `engines.node >= 22`. A recorded `PLAN DEFECT`. |
| F3 | spec-fidelity | nit | **Accepted** | Confirmed: `TEST_IDLE_TIMEOUT_MS` is 3000 and the README said two seconds. Fixed. |
| F1 | security | major | Escalated (**E4**) | Confirmed by reading the route: `worker/table.ts:318` hands any path segment to `idFromName` with no origin check, no rate limit and no authentication, and `startLoop()` broadcasts at 30 Hz on a single-seat table. An `Origin` allow-list needs the production origins, and rate limiting needs a Cloudflare binding — deployment facts I do not have. Deliberately left out per the build notes, which makes it a decision, not an oversight. |
| F1 | simplicity | minor | **Accepted** | Confirmed by enumerating the only caller: the guard `this.idle === null && this.lastTickMs > 0` is reachable only after the timer has already recreated the game, and the eviction case it claims to cover cannot happen because the table keeps nothing in storage. Deleted, and the rationale moved to where the timer is armed. |
| F2 | simplicity | minor | **Accepted** | Confirmed: a third copy of the canvas box reader, in a codebase that documents "one reader of the element, not two". Both copies now call `courtBox`. |
| F3 | simplicity | minor | Rejected | The facts are right — `close` always follows `error`, so the listener only moves `onLost` one task earlier, and the `closed` flag already makes a double notification impossible. But it is eight lines of redundancy on a connection-failure path, not complexity that will mislead, and removing it makes the client rely on an ordering guarantee it currently does not need. A preference; recorded as a follow-up. |
| F4 | simplicity | nit | Rejected | Confirmed dead: grepping `src/` and `tests/` finds no caller of the returned socket's `close()`. A nit against an interface member that costs a few bundled bytes, and one a "leave the table" path would want back. Follow-up. |
| F5 | simplicity | minor | **Accepted in part** | Real, and the sharper half of it is fixed: `src/net/protocol.ts` exists so both ends cannot keep their own copies, and `src/main.ts` kept its own `FIXED_DT_MS` — it now imports the shared one. `MAX_FRAME_MS` is left alone: the client's ("a backgrounded tab") and the server's ("a stalled server") happen to share a number but not a reason, and folding them together couples two decisions that should move separately. Follow-up. |
| F1 | test-quality | minor | **Accepted** | Confirmed by arithmetic: points land about every 1.94 s with both paddles parked, `expect.poll` can report one up to a second late, and two `newContext()` calls followed the read — so the reference score could be overtaken before the table froze, failing a correct implementation. Fixed. |
| F2 | test-quality | major | **Accepted** | The most valuable finding in the panel. Confirmed by mutation: with `this.game = createState(...)` deleted from the idle timer, AC7 passed 4 runs in 5. Gated, the same mutation fails 5 in 5. Without this, AC7 was not evidence. |

## Changes applied

- `src/main.ts:81` — `showStatus()` writes only when the line has changed, the
  way `showScore()` already did, so calling it thirty times a second does not
  make a `role="status"` region say the same thing thirty times a second.
- `src/main.ts:282` — `onSnapshot` refreshes the line as well as the score
  (behavior/F2, correctness/F2). Without it a table's winner announcement was
  painted over the next game for as long as the connection held.
- `tests/e2e/table.spec.ts:345` — new: the winner line goes when the game it
  announced does. Fails 3 of 3 without the fix above, passes 3 of 3 with it.
- `tests/e2e/support/table.ts` — a status observer beside the existing score
  observer, so "it said this and then stopped saying it" is assertable.
- `tests/e2e/table.spec.ts:198` — AC7 reads the score to come back to after the
  table has frozen, from the player still there, rather than out of a running
  rally (test-quality/F1).
- `tests/e2e/table.spec.ts:236` — AC7 waits for a court from the table before
  reading the score off the page (test-quality/F2), with a snapshot counter in
  the socket shim to gate on.
- `tests/e2e/support/table.ts` + `tests/e2e/table.spec.ts` — both inline canvas
  box readers replaced by `courtBox` (simplicity/F2).
- `worker/table.ts` — `discardIfIdle` deleted (simplicity/F1); the reason it
  cannot be needed is recorded where the idle timer is armed.
- `src/main.ts:17` — `FIXED_DT_MS` imported from the shared protocol module
  instead of redeclared (simplicity/F5, in part).
- `README.md:139` — the suite's table idle timeout is three seconds, not two
  (spec-fidelity/F3).

## Escalations

### E1 — Should a URL that already names a game still ask which game you want?

AC1 says the player is offered a choice when the page loads. AC2 says every
existing behavioural test passes with nothing weakened, and all eight of them
`goto('/?seed=1')` and immediately expect a game underway. The plan asserts both
and never reconciles them; the builder recorded it as a `PLAN DEFECT` and read it
as **a URL that names a game is a choice already made**, which is what shipped.

The consequence is real: `https://pong.pages.dev/?seed=1` — an old bookmark —
drops the player into single player with no way to reach the table field but
editing the URL.

- **Keep it.** AC1 holds for everyone arriving at the site itself, `?table=` links
  stay shareable, and the regression wall does not move. AC1 stays partly unmet
  as written.
- **Ask unconditionally.** AC1 is met literally, at the cost of the eight
  `goto` lines plus a dismissing click in the existing specs — a diff across the
  whole regression wall on the one change whose first promise is that the wall
  does not move.

**Recommendation:** keep it, and amend AC1 to say so. A link that names a game is
a choice, and `?table=` being a shareable link is worth more than the literal
reading. But it is your criterion, and I will not mark it met while it is not.

### E2 — Node 20 → 22 for the whole repository

`.nvmrc` went from `20` to `22`, and `.github/workflows/regression-tests.yml`
reads it, so CI and every contributor move with it. I reproduced the failure this
causes: this machine's default is Node 20.16.0 and the suite cannot start on it,
because Playwright's second `webServer` shells out to `wrangler`, which declares
`engines.node >= 22`. Every run in this adjudication was on 22.23.2.

The alternative the builder rejected was pinning a `wrangler` old enough for Node
20, which pulls in the advisory-carrying `esbuild`/`undici`/`ws`/`sharp` chain —
a repository reporting zero advisories today would start reporting six.

- **Accept 22.** Nothing in the change works without it. Worth adding an
  `engines` field to `package.json` so a contributor on 20 gets a sentence rather
  than a wrangler crash.
- **Stay on 20** and accept six dev-only advisories.

**Recommendation:** accept 22 and add the `engines` field. This is not really a
choice the code leaves open; it needs recording as a project decision because it
affects everyone, which is exactly why the builder flagged it.

### E3 — A table game that has been won cannot be played again

Verified against the code and by both the behavior and correctness lenses against
a running Durable Object. When a table reaches 11, `step()` returns the state
unchanged, no client message can ask for another game, and `startGame` is reached
only when an arriving socket takes a second seat. The ball stops, the score
stands, and no key, click or pointer gesture does anything — for as long as both
players stay connected.

Two things make this worse than a missing feature. The page still says *"Tap or
click the court, or press any key, to start"*, and README's control table still
promises *"serve, and start a new game once one has been won"* — both true of
single player, both false at a table. And single player, one tab away, says
*"Computer wins! Press any key to play again"* and does exactly that.

No acceptance criterion mentions a rematch and the plan is titled "one game of
Pong", so this is scope rather than a spec deviation — which is why I have not
built it.

- **Add a rematch.** A `ClientMessage` a seated player can send while
  `phase === 'game-over'` that calls `startGame`, and a `tableStatusText` line
  saying how — matching what single player already does. Protocol change, client
  change, tests.
- **Declare a table one game only**, and stop the page and the README saying
  otherwise: tell the two players what actually has to happen.

**Recommendation:** add the rematch. This is the end of every completed table
game, not an edge case, and the asymmetry with single player is the kind of thing
a player reads as broken. If it is not wanted now, the documentation half is not
optional — shipping copy that promises a control that does not exist is worse
than shipping the gap.

### E4 — The table Worker is public and unauthenticated. Settle before deploying.

`worker/table.ts:318` routes any attacker-chosen path segment to a fresh Durable
Object with no authentication, no `Origin` allow-list and no rate limit. The
security lens measured the amplification against a real `wrangler dev`: about 29
broadcast frames a second to a table with one occupant and no opponent, because
`startLoop()` runs whether or not a second seat is filled, and `server.accept()`
keeps each object resident and duration-billed for the socket's whole life. The
idle timer only arms when the *last* socket closes, so a client that never
disconnects is never reclaimed. A handshake carrying `Origin: https://evil.example`
was answered `101`.

The build notes record all of this as deliberately not built, because no
criterion asks for it. That is a defensible build decision and an indefensible
thing to deploy silently.

**Nothing is exposed yet** — the Worker at `pong-table.joelstevick.workers.dev`
has never been deployed. `npm run deploy:table` is what creates it, and this
change is what adds that command.

- **Deploy as is**, accepting that an unbounded Cloudflare bill is one script
  away and that the blast radius is your account, not the game.
- **Harden first**: an `Origin` allow-list at the upgrade in `Table.fetch`, a
  rate-limiting binding on `/table/`, and — cheaply and independently of the
  above — do not run the 30 Hz interval while `seats.size < 2`, broadcasting once
  on seat and vacate instead, since that branch already advances nothing.

I did not write the `Origin` check: getting the allow-list wrong makes the game
unjoinable, and I do not know your Pages origins. **Recommendation:** harden
before the first `deploy:table`, starting with the one-seat broadcast loop, which
is the cheapest and least reversible-sounding of the three.

## Follow-ups

Real, and out of scope for this change.

- **The chooser does not come back after a refusal or a lost connection**
  (behavior/F3). Needs a genuine "leave the table" path: stop the frame loop,
  close the socket, clear `started`. Today the only recovery is a reload.
- **`MAX_FRAME_MS` is defined twice**, in `src/main.ts` and `worker/table.ts`
  (simplicity/F5 remainder). Same number, different reasons; worth one home if
  the reasons ever converge.
- **`src/net/table.ts`: the `error` listener duplicates the `close` listener, and
  `TableSocket.close` has no caller** (simplicity/F3, F4). Both fall out of the
  "leave the table" path above.
- **A table with one seat broadcasts at 30 Hz** (from security/F1). Cheap to fix,
  independent of the authentication question, and listed there too so it is not
  lost if E4 is settled by deploying as is.
- **`C3` — Durable Object entitlement — rests on a throwaway probe that was
  deleted.** The production Worker has never been deployed. The first
  `npm run deploy:table` is the real test of that claim.
- **The test recipe is not recorded anywhere in the repository.** It needs Node
  22 via `.nvmrc`, and the default Node on this machine cannot run the suite at
  all. `.claude/skills/run-regression-tests/SKILL.md` is where that belongs.
- **`Uncaught Error: Network connection lost.` still appears in the
  `wrangler dev` log** when a context closes mid-broadcast. Seen in this run too,
  failing nothing. The build notes flag it for production logs after the first
  real deploy; that is still the right place to look.

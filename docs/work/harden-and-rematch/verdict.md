# Verdict — harden-and-rematch

- **Adjudicated:** `17af241...67f1dd9` (the two build commits, `558702d` and `67f1dd9`)
- **Reviews considered:** 001-behavior, 002-correctness, 003-spec-fidelity,
  004-security, 005-simplicity, 006-test-quality — all six lenses present, none
  missing
- **Outcome:** ready with follow-ups
- **Test suite:** green — 92 unit + 63 behavioural, on macOS/Node 22 and in a
  `node:22-bookworm` container matching the CI job

## Read this first

Nothing is unmet and nothing is failing. Three things need you before
`deploy:table` is run, and one of them is the plan's own recorded defect:

- **E1 — the rate limiter exempts loopback callers.** A `PLAN DEFECT` the
  builder recorded and asked to have put to you. It is the one place a test's
  need shaped production code.
- **E2 — a table with one silent socket is never reclaimed.** The third hazard
  the plan's *Intent* names, addressed by no acceptance criterion and by no code
  in this change. Every AC passes with it wide open.
- **E3 — the deployed allow-list admits `localhost`.** Shipped deliberately, per
  plan step S5 and AC6; the security lens wants it out of production. Changing
  it deviates from the approved plan, so it is yours, not mine.

One thing I resolved rather than escalated, because it was decidable from
evidence and two lenses reached opposite conclusions about it: **the allow-list
names the right host.** See *The `pong.pages.dev` question* below — the README
was the stale half, and it is corrected here.

## Acceptance criteria

| AC | Met | Evidence |
|---|---|---|
| AC1 | yes | `tests/e2e/rematch.spec.ts:63` plays two real browsers to eleven against the real Durable Object, then one presses Space; both reach 0-0 with a ball off the centre spot and the winner line taken back. `src/input.ts:132,173,206` route keydown, click and pointerdown to the same `start()`, so all three gestures the AC names reach `table.rematch()`. Slot-symmetric in `worker/table.ts:199` — no branch distinguishes which player asks. |
| AC2 | yes | Mid-rally: `tests/e2e/rematch.spec.ts:126` sends `{kind:'rematch'}` over a live seated socket and asserts neither browser ever showed 0-0 and the score only climbed. Inert by `startGame` returning its argument unchanged outside `idle`/`game-over` (`worker/table.ts:203-206`), which I confirmed against `src/game/state.ts`. No-seat: the outcome the AC names is asserted at `rematch.spec.ts:171`, but the seat check at `worker/table.ts:200` is not the thing that produces it — see follow-up 3. The criterion holds; the branch is uncovered. |
| AC3 | yes | `tests/e2e/broadcast.spec.ts:36` — at most 2 snapshots in 5 s of wall clock at a one-player table. Build notes record 151 against that bar with `startLoop()` unconditional. |
| AC4 | yes | `tests/e2e/broadcast.spec.ts:36`, **strengthened here** — the lone player now joins a table holding a frozen non-0-0 game and their scoreboard must converge to that score, which `index.html`'s markup cannot supply. Verified discriminating: a table that sends a court but not *its own* court now fails (`Expected "1-0", Received "0-0"`), where before it passed. |
| AC5 | yes | `tests/e2e/broadcast.spec.ts:96` — 30-120 snapshots in a 2 s window with both seats filled, at most 2 in the 5 s after one leaves. |
| AC6 | yes | `tests/e2e/entry.spec.ts:57` — no `Origin` and five wrong ones get 403; the site, a preview hash and the dev origin get 426, which is the Durable Object's own answer and so proves they reached it. `tests/unit/origins.test.ts` covers the pattern rules. The "before any Durable Object is addressed" clause I confirmed by reading `worker/table.ts:366-378` — both checks precede `env.TABLE.get(...)` — **not** by a test; see follow-up 2. |
| AC7 | yes | `tests/e2e/entry.spec.ts:88` drives the real Cloudflare rate-limit binding under the shipped `wrangler.toml` (miniflare simulates it, per resolved claim C7): a burst from one address is admitted for at least 25 attempts and then refused three times running, a second address is admitted while the first is still being refused, and a game already in progress shows an empty status line throughout. Now genuinely per-caller for IPv6 too — see F-X1 below, which is why this criterion was only nominally met before. Carve-out for loopback callers stands: E1. |
| AC8 | yes | 92 unit + 63 behavioural pass on both platforms. I diffed every pre-existing test file myself: no existing spec was modified, and the only change to shared support is `sample()`'s `__sounds?.length ?? 0` in `tests/e2e/support/pong.ts:480`, which cannot weaken a sound assertion — `sounds()` at line 190 still dereferences `__sounds` directly and `frameOfSound` returns `-1` on a missing recorder, which fails `toBeGreaterThan(0)` rather than passing vacuously. My own three test edits are all strictly stronger than what they replaced. |

## Dispositions

| Finding | Lens | Severity | Disposition | Reasoning |
|---|---|---|---|---|
| F1 | behavior | minor | Rejected — follow-up 1 | Confirmed real: `vite.config.ts` has no `/table` proxy and `VITE_TABLE_URL` is unset under `npm run dev`, so the documented dev flow opens a socket to Vite's HMR server and hangs. But the README text, the origin fallback and the missing proxy all predate `17af241`; the only client change in range is `rematch()`. Fixing it is a README rewrite or a Vite config change plus a join timeout — outside this change. Recorded. |
| F1 | correctness | major | Accepted in part | The central claim — "a deploy done as documented refuses every player" — is **wrong**, and I checked it rather than taking either lens's word. `153d91e`'s own commit message, written by whoever ran the deploy: "`--branch=main` marks the upload as the production deployment, so it serves at `https://pong-3su.pages.dev` … The bare `pong` subdomain was already taken." Pages project name and Pages subdomain are different things; `--project-name=pong` and `pong-3su.pages.dev` are both correct and not in conflict. The behaviour lens independently fetched both hosts and found `pong-3su` serving this repo's bundle and `pong.pages.dev` serving a stranger's app. So the allow-list is right and **`README.md:113` was the stale half** — accepted and fixed, with the reason written down so this costs nobody a third investigation. Deriving the test fixture from `wrangler.toml` was not done: it needs a TOML read at test time for a string that is now explained in three places. |
| F2 | correctness | minor | **Accepted — fixed** | Confirmed: `withinRate` awaited `limiter.limit()` with no catch, so a rejecting binding propagated out of the entry's `async fetch` and the runtime answers 500 — every player refused because the counter was unwell, which is the exact opposite of what the module's own comment promises. Same defect as test-quality F4. |
| F1 | spec-fidelity | major | **Escalated — E1** | Confirmed against `worker/limit.ts:93-100` (loopback returns `null`) and `:127-129` (a `null` key is admitted without the limiter being consulted) — line numbers as the file stands after my fixes; the lenses read them at `:34,50` and `:76-79`. This is the builder's recorded `PLAN DEFECT`; the plan asks in writing for the judge to put it to the user, and it is a genuine tradeoff (the alternatives are recorded and all worse), so it is not mine to settle. |
| F2 | spec-fidelity | minor | **Escalated — E2** | Confirmed: `startIdleTimer()` is reached only inside `if (this.seats.size === 0)` at `worker/table.ts:174`, and the object holds a non-hibernating `server.accept()` socket. One seated socket that never closes pins a resident, duration-billed object forever. Real, named in *Intent*, covered by no AC. Fixing it properly is WebSocket hibernation or a per-socket inactivity timeout — a larger piece of work with its own design decisions. |
| F1 | security | major | **Accepted — fixed** | Confirmed. `callerAddress` returned `CF-Connecting-IP` verbatim and it went straight to `limiter.limit({key})`, which counts distinct key strings and does not normalise addresses. One IPv4 key is one host; one IPv6 key is one /128 out of the /64 that ISPs and cloud hosts routinely delegate to a single subscriber or VM. An attacker binding a fresh source address per request is never the same caller twice and gets a fresh thirty a minute each time — so the work item's *only real protection* did not protect against the attack it exists to stop, and AC7 was satisfied only nominally. Contained, testable fix; IPv4 behaviour is byte-for-byte unchanged, which is why no existing assertion moved. |
| F2 | security | minor | Rejected as a code change — **Escalated E3** | Confirmed real: `[vars] ALLOWED_ORIGINS` in `worker/wrangler.toml` is what `deploy:table` ships, `localhost` entries included, so any page on Vite's default ports is treated as the site. But the plan settled this the other way and said so twice: step S5 asks for "a `var` carrying the canonical origin, the preview pattern **and the dev origins**", and AC6 requires "a localhost development origin is accepted". Moving them to a `--var` would also mean the behavioural suite no longer exercises the shipped configuration — the objection the build notes already raise against the `[env]` alternative. I may not move the target, and the marginal value is genuinely small (the allow-list is documented as hygiene; the rate limit bounds a localhost page exactly as it bounds anyone). Your call, not mine. |
| F1 | simplicity | minor | **Accepted — fixed** | Confirmed: `watchStatus` at `rematch.spec.ts:92,93,128` re-armed `__statuses` and nothing in the file ever read it. Made load-bearing rather than deleted. One caveat on the lens's reasoning: its claim that "a run in which the winner line was never shown would still be green" was already false — lines 77-78 poll for `/wins?!/` before the rematch. The AC2 half is the real gain: `statusesSeen(...)` must be exactly `['']` across the whole settle window, where `statusOf` only sampled the end. |
| F2 | simplicity | minor | Rejected — follow-ups 3 and 5 | Two claims. The unreachability is right and is follow-up 3 (see test-quality F2). The de-duplication of the four-copy rally preamble is a fair observation but is churn across four networked spec files at the end of an unattended run, with nothing to catch a mistake in it but the suite I would then be rewriting. Recorded as follow-up 5 instead. |
| F1 | test-quality | minor | **Accepted — fixed** | The headline overstates ("cannot fail, whatever the table sends" — the `snapshotsSeen > 0` poll does fail if the seating snapshot is removed, which is the regression AC4 exists to guard). But the body is right: `0-0`, `paddle.top >= 0` and `ballAt !== null` are all true of a page that received nothing, because `index.html` ships 0-0 and `render` paints a centred paddle and a centre-spot ball from the first frame. Fixed by giving the table a score the markup cannot forge. The narrower "received but not rendered" regression the lens describes stays guarded by `table.spec.ts:245`, which reads paddle positions off the canvas that can only come from snapshots. |
| F2 | test-quality | minor | Rejected as a code change — follow-up 3 | Confirmed exactly as described: `send()` on a CLOSED socket is a silent no-op, the client's own `readyState` guard stops the key press, and `worker/table.ts:200` has zero coverage. Not fixable here. The branch is unreachable from any browser (the table only frees a seat on close/error, so a socket cannot be open while its seat is taken over), and a unit test of `Table` hits the wall in follow-up 2 — I verified this rather than assuming it: importing `worker/table.ts` from `tests/unit/` fails `tsc --noEmit` with six errors (`DurableObjectNamespace`, `DurableObjectState`, `WebSocketPair`, `webSocket` in `ResponseInit` ×2, `READY_STATE_OPEN`), because the root tsconfig carries DOM lib and not `@cloudflare/workers-types`. Adding a worker-side test project is real work with a real chance of breaking `npm run build`, and it is not what this work item is. |
| F3 | test-quality | minor | Rejected as a code change — follow-up 2 | The strongest finding I am not fixing, and the one I would most like a human to see. It is correct: the plan's test strategy names "no Durable Object was addressed" as "the part that matters", and nothing asserts it. Move both checks into `Table.fetch` and every assertion in `entry.spec.ts` stays green while each refused request creates a resident billed object — the exact blast radius this work item exists to close. I confirmed it is not detectable behaviourally either: a Durable Object created and immediately refused is indistinguishable from one never created, from outside. It needs the same worker-side test project as follow-up 3. Placement is currently correct — I read it at `worker/table.ts:366-378`. |
| F4 | test-quality | minor | **Accepted — fixed** | Same defect as correctness F2, and the lens is right that the test file's own name ("admits when there is no answer to be had") claimed a coverage it did not have. Policy decided explicitly as fail-open, which is what the module already documented; the comment now says three ways rather than two, and says why letting a rejection out is worse than refusing. |

## Changes applied

- `worker/limit.ts:36-100` — count an IPv6 caller by their /64 rather than by the
  address they picked, so one subscriber is one caller. IPv4 is returned whole,
  and so is the IPv4-mapped form `::ffff:203.0.113.7`, whose first four hextets
  are zero and which truncation would put on a single shared allowance. `::`
  is written out before truncating and leading zeros are stripped, so
  `2001:0db8:a:b::1` and `2001:db8:a:b:c:d:e:f` are one key. (security F1)
- `worker/limit.ts:123-138` — `withinRate` catches a rejecting `limit()` and
  fails open, which is the third way to get no answer and the only one that was
  turning an unavailable check into a refused player. (correctness F2,
  test-quality F4)
- `tests/unit/limit.test.ts` — four cases: one /64 is one key; neighbouring /64s
  are not; a host is counted as a host, IPv4-mapped included; a counter that
  cannot be reached admits. Verified both fixes discriminate by breaking the
  code and watching exactly these go red.
- `tests/e2e/broadcast.spec.ts:36` — AC4's court assertion now depends on what
  the table sent: two players leave a frozen non-0-0 game, a third arrives alone
  and their scoreboard must converge to that score. Ten repeats under six
  parallel workers, no flake; verified discriminating. (test-quality F1)
- `tests/e2e/rematch.spec.ts:99-118,158-163` — the three vestigial `watchStatus`
  calls made load-bearing: AC1 asserts the winner line came *down* rather than
  merely being absent, and AC2 asserts the line was empty across the whole
  settle window rather than at the end of it. (simplicity F1)
- `README.md:113,116-120` — the page is served at `https://pong-3su.pages.dev`,
  and a paragraph saying why the Pages *project* is `pong` while its *subdomain*
  is suffixed, so the next reader does not have to re-derive it. (correctness F1)

## Escalations

### E1 — the rate limiter exempts any caller the runtime reports as loopback

Plan step S6 says to key on `CF-Connecting-IP` and fail open only when the
binding is absent. What ships also fails open on the *address*: `callerAddress`
returns `null` for `127.0.0.1` and `::1`, and `withinRate` admits a `null` key
without consulting the limiter at all. This is the builder's own recorded
`PLAN DEFECT`, and it asks in writing for the judge to put it to you.

Why it was done, and it is a good reason: miniflare sets `CF-Connecting-IP` to
`127.0.0.1` itself, so the fail-open the plan describes never fires locally, and
the behavioural suite opens well over thirty table sockets a minute from that one
address — the shipped allowance would refuse the suite's own sockets and take the
whole regression wall red. Measured, not guessed.

Why it is still yours to decide: it is the one place a test's need shaped
production code, and the exemption is topology-dependent rather than harmless.
On a real Cloudflare edge the header cannot be forged or made to say loopback, so
a deployed Worker is unaffected. In any topology where the client address arrives
as loopback — `wrangler dev` behind a same-host cloudflared tunnel, or workerd
behind a local reverse proxy — the limit is simply off and a single script can
create unbounded objects.

Options, with the ones the build notes already rejected kept here so they are not
re-invented:

1. **Keep it.** Deployment is Cloudflare-only, the exposure needs a topology
   nobody is running, and the suite tests the real binding under the real config.
   *My recommendation*, on the condition that E2 is answered too — the two
   together are what bound the bill.
2. A `var` that disables the limit for the suite — a kill switch shipped in
   production configuration.
3. A separate `[env]` block with a larger allowance — the suite stops exercising
   the deployed configuration, which is what makes AC7 evidence at all.
4. Key by table id instead — gives a non-Cloudflare deployment no protection
   against exactly the attack the limit exists to stop.

### E2 — a table with one silent seated socket is never reclaimed

*Intent* names three hazards. Two are closed: unbounded creation (AC7's rate
limit, now genuinely per-caller) and 30 Hz broadcasting to one player (AC3/AC5).
The third — "the idle timer only arms when the *last* socket closes, so a client
that never disconnects is never reclaimed" — is untouched, and no acceptance
criterion covers it. `startIdleTimer()` is still reached only inside
`if (this.seats.size === 0)`, and the object holds a non-hibernating socket.

The rate limit caps the *rate* of creation, not the *number* held open. A script
staying inside the allowance — thirty a minute, each to a distinct table id, none
ever closed — pins roughly 1,800 resident, duration-billed objects an hour, with
no broadcast traffic to make it visible, and every AC in the plan still passes.

You should decide whether `deploy:table` goes ahead with this open. Options:

1. **Record it as a known residual and deploy anyway.** Defensible if the Worker
   stays unpublished or is watched; nothing is exposed today.
2. **A per-socket inactivity timeout** — a table hearing nothing from a seated
   socket for N minutes closes it. Small, but it is new behaviour with its own
   edge (a player who parks their paddle and watches is silent too, since the
   client only reports on change).
3. **WebSocket hibernation** — the platform's own answer: an idle table stops
   being billed for duration without anybody being disconnected. The right fix,
   and its own work item.

*My recommendation:* option 3 as a follow-up work item, option 1 in the meantime,
and not option 2 without the plan for it being written first.

### E3 — the deployed allow-list admits `localhost`

`ALLOWED_ORIGINS` in `worker/wrangler.toml` is what `deploy:table` ships, and it
carries `http://localhost:5173`, `:4173` and both `127.0.0.1` equivalents
alongside the site. After deploying, any page on Vite's default ports — whatever
project the user last ran `npm run dev` on — is treated as the game's own site:
it can create objects up to the rate limit and occupy a seat at any table id it
names.

I did not change it, and I want to be plain about why: the plan settled this the
other way in step S5 and in AC6, and I may not move the target. Moving the dev
origins to a `--var` in the harness would also mean the suite stops exercising
the configuration that actually ships — the objection the build notes already
raise against the `[env]` variant.

Against acting: the allow-list is documented as hygiene, not protection. Any
non-browser client sets whatever `Origin` it likes, and a localhost page is
bounded by the same rate limit as anyone else. Seat-squatting needs the table id,
which *Non-goals* explicitly declines to defend ("not a stranger guessing
Johnny-13224").

For acting: it costs one `--var` in `playwright.config.ts` and one in
`dev:table`, mirroring what `IDLE_TIMEOUT_MS` already does, and it removes the
one thing the allow-list is there to buy being handed to every page on 5173.

*My recommendation:* leave it for this work item and reopen it as an amendment to
AC6 if you want it out, so the criterion and the config say the same thing.

## The `pong.pages.dev` question, settled

The build notes flagged this for the judge, and two lenses reached opposite
conclusions, so here is the evidence in one place. **The allow-list is correct.**

- `153d91e`, the commit that added the Pages deploy: "`--branch=main` marks the
  upload as the production deployment, so it serves at
  `https://pong-3su.pages.dev` … The bare `pong` subdomain was already taken."
- A Pages *project name* and its *subdomain* are different things. The project is
  `pong` — so `--project-name=pong` in `package.json` is right — and Cloudflare
  gave it a suffixed subdomain because the bare one was taken.
- The behaviour lens fetched both: `pong-3su.pages.dev` serves this repository's
  bundle; `pong.pages.dev` serves an unrelated "Impossible Pong!" belonging to
  somebody else.
- The spec-fidelity lens reached the same conclusion from `package.json` and
  `153d91e` independently.

`README.md:113` was the stale half and is corrected. Claim C4, which the build
notes flagged as un-rechecked, is confirmed from inside the repository.

## Follow-ups

Real, and out of scope for this change.

1. **The documented development flow does not reach the table server.**
   `npm run dev` + `npm run dev:table`, exactly as `README.md:79-82` instructs,
   opens a socket to Vite's HMR server on 5173 and hangs on "Joining table …"
   with no error and no timeout. `VITE_TABLE_URL` is unset in dev mode and there
   is no `/table` proxy in `vite.config.ts`. Needs either the proxy or a README
   correction — and a visible failure after a join timeout would be better than
   an indefinite wait either way. Pre-existing; `17af241` and earlier.
2. **Nothing pins the two checks to the Worker entry.** Move them into
   `Table.fetch` returning the same statuses and the whole suite stays green
   while every refused request creates a resident billed object. Needs a unit
   test over the default export with an `env` whose `TABLE.idFromName`/`get`
   record calls — which needs a worker-side vitest project, because importing
   `worker/table.ts` from `tests/unit/` fails `tsc --noEmit` on six
   Workers-only types the root tsconfig does not carry.
3. **`Table.rematch`'s seat check has no coverage.** `worker/table.ts:200` is
   unreachable from any browser — a table frees a seat only on close or error,
   so a socket cannot still be open when its seat is taken over — and the
   e2e test named for it passes with the check deleted. The build notes already
   record this honestly. Closed by the same test project as follow-up 2, driving
   a stale socket through a fake `WebSocketPair`.
4. **Reclaiming a table nobody is playing at** — E2, if you take option 3.
5. **The four-copy rally preamble.** Join two, park both, poll off 0-0,
   `watchScore`, settle, assert monotonic totals now appears in `table.spec.ts`,
   `rematch.spec.ts` (twice) and `entry.spec.ts`. One helper in
   `tests/e2e/support/table.ts`.

## What I ran

- `npm run build` — `tsc --noEmit`, `tsc --noEmit -p worker`, `vite build`: clean
- `npm run test:unit` — 92 passed (88 before, +4 mine)
- `npm run test:e2e` — 63 passed, chromium and mobile-chrome
- All three again inside `node:22-bookworm` with `npm ci`, matching the CI job,
  because the plan requires anything concluded about the runtime to be confirmed
  on Linux: 92 and 63, green.
- `broadcast.spec.ts --repeat-each 5` under six workers: 10/10, no flake — the
  strengthened AC4 test races a 3 s idle timer, so it was worth proving.
- Discrimination checks on every assertion I added or changed, by breaking the
  code and confirming the intended test went red: identity `callerAddress` fails
  the /64 case; no try/catch fails the unreachable-counter case; a seating
  snapshot carrying a *fresh* game rather than the table's fails AC4 on the
  score, which is precisely the hole that was there before.

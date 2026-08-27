# Review 006 — test-quality

- **Lens:** test-quality
- **Verdict:** findings
- **Diff range:** 17af241...HEAD

## Findings

### F1 — minor

**Claim:** AC4's three "a court is drawn" assertions are satisfied by the client's own locally-rendered blank state and cannot fail, whatever the table sends.

**Location:** `tests/e2e/broadcast.spec.ts:44`

**What:** `expect(await scoreOf(alone.page)).toBe('0-0')`, `expect(paddle.top).toBeGreaterThanOrEqual(0)` and `expect(await ballAt(alone.page)).not.toBeNull()` (lines 44-47) are all true on a page that has received zero snapshots. `startTable` (src/main.ts:349) kicks off `tableFrame` immediately with `previous = current = state`, where `state` is `createState(...)`; `render` (src/render.ts:68) unconditionally paints both paddles at `CENTRED_PADDLE_Y` (=200) and the ball at (400,240) every frame regardless of phase; and index.html ships 0-0 in the scoreboard markup (the existing table.spec.ts:224-226 comment says so explicitly). Only the `snapshotsSeen > 0` poll on line 43 discriminates, and that is a wire-level message count that says nothing about what the player is looking at.

**Failure scenario:** Regress the client so the seating snapshot is received but never rendered — e.g. in `src/main.ts:290` `onSnapshot` stops assigning `previous`/`current` (keeps `state = next; showScore()` only, or the assignment is dropped in a refactor of the interpolation). AC4's stated criterion ("still shows that player the court and the score") is now broken for a waiting player, who sees a court that never reflects the table — and this test still passes green: the snapshot count is >0, the canvas still has a paddle and a ball from the local state, and the score is the markup's 0-0. The build note claiming "with the seating snapshot removed AC4 sees no court" is therefore inaccurate about why the test goes red.

**Suggested direction:** Make the court assertion depend on snapshot content rather than on any court being drawn. The cheapest version: have the lone player park their paddle somewhere off-centre before joining is not possible, so instead assert something the table alone can produce — e.g. join a table that already has a non-0-0 game frozen on it (the pattern table.spec.ts:217 already uses) and assert the waiting player's scoreboard converges to that score, which the markup cannot supply.

### F2 — minor

**Claim:** The test named for AC2's "a socket that holds no seat" clause passes with the seat check deleted, so that half of AC2 has no discriminating coverage anywhere.

**Location:** `tests/e2e/rematch.spec.ts:178`

**What:** `say(third.page, { kind: 'rematch' })` sends on the refused browser's socket, which `Table.fetch` (worker/table.ts:100) has already closed with 4409 — and the test waits for the refusal to be rendered (line 168-170) before saying anything. Per the WebSocket spec, `send()` on a CLOSED socket is a silent no-op, not a throw, so nothing reaches the table. The `keyboard.press('Space')` on line 179 is stopped earlier still, by `rematch()`'s `readyState !== WebSocket.OPEN` guard in src/net/table.ts:137. There is no unit test of `Table` either, so `worker/table.ts:200` (`if (this.seats.get(slot) !== socket) return;`) has zero coverage.

**Failure scenario:** Delete `if (this.seats.get(slot) !== socket) { return; }` from `Table.rematch` (worker/table.ts:200-202). The full suite stays green: this test's assertions (`scoresSeen` never contains 0-0, totals monotonic, both statuses '') are all satisfied because the third browser's message never left the browser. AC2's second clause is asserted only as an outcome that two other layers already guarantee.

**Suggested direction:** Either exercise the branch with a stale-socket scenario the shim can produce (a page whose socket is still OPEN when its seat is taken over), or add a unit-level test around `Table` message handling; failing that, drop the claim that this test defends the seat check and move the guard's justification into a comment rather than a spec name.

### F3 — minor

**Claim:** AC6/AC7's central property — that a refused request never addresses the Durable Object — is asserted only by a status code that the Durable Object could equally have produced, so the test cannot detect the checks being moved inside the object.

**Location:** `tests/e2e/entry.spec.ts:76`

**What:** The plan's test strategy names this as "the part that matters": "asserting `403` and — the part that matters — that no Durable Object was addressed." The test asserts only `refused.status() === 403` and reasons about placement in a comment. Every refused and admitted request in the test uses the same table id (`url` from `tableUrl('origin')`, line 58), and nothing observes whether `env.TABLE.idFromName` / `env.TABLE.get` was called. There is no unit test of the Worker's default export at all — `worker/origins.ts` and `worker/limit.ts` are tested in isolation, but the entry's wiring and the ordering relative to `env.TABLE.get(...)` (worker/table.ts:371-378) are not.

**Failure scenario:** Move the origin and rate checks out of the entry and into `Table.fetch` (worker/table.ts:80), returning the same 403/429 from there. Every assertion in entry.spec.ts still passes — identical statuses, identical ordering — yet the entire premise of the work item is violated: each refused request now creates a resident, duration-billed Durable Object, which is exactly the unbounded-object cost the plan exists to prevent. The suite would give a green light to a build that reopens the blast radius.

**Suggested direction:** Add a unit test over the default export's `fetch`, passing a stub `env` whose `TABLE.idFromName`/`TABLE.get` record calls: assert they are never touched for a disallowed origin or a refused limiter, and are touched exactly once for an allowed origin under the rate. That also pins the check order cheaply and without the network.

### F4 — minor

**Claim:** `limit.test.ts`'s "admits when there is no answer to be had" covers only two of the three ways an answer can be missing; the third — the binding rejecting — fails closed, untested.

**Location:** `tests/unit/limit.test.ts:49`

**What:** `withinRate` (worker/limit.ts:74-81) documents "Two ways to get no answer, and both fail **open**", and the test covers `limiter === undefined` and `key === null`. It does not cover `limiter.limit(...)` rejecting. `worker/table.ts:374` awaits it directly with no catch, so a rejection propagates out of the entry `fetch`.

**Failure scenario:** Cloudflare's rate-limit binding rejects transiently (platform error on `limit()`). The entry throws instead of returning a response, the Worker answers 500, and every player's WebSocket upgrade fails — the opposite of the fail-open policy the module states and the test file's name claims to cover. No test in the suite notices, because the fake limiter in `limiter(success)` only ever resolves.

**Suggested direction:** Add a case with a limiter whose `limit` rejects, and decide the policy explicitly — if fail-open is intended, `withinRate` needs a `try/catch` and the test asserts `true`; if fail-closed is intended, say so in the doc comment and assert the 429/500 the entry produces.

## Notes

Verified as clean (not reported): the `sample()` change to `__sounds?.length ?? 0` in tests/e2e/support/pong.ts:480 does not weaken any existing sound assertion — `sounds()` still dereferences `__sounds` directly, and `frameOfSound` returns -1 on a missing recorder, which fails the `toBeGreaterThan(0)` assertions in collisions.spec.ts rather than passing vacuously. AC1's rematch test discriminates (score history re-armed after game-over, so '0-0' can only come from a restart). AC2's mid-rally test discriminates via `say()` on a live seated socket, reaching the real server rule. AC3/AC5 rate bounds are generous relative to the 30 Hz interval (SNAPSHOT_INTERVAL_MS = 1000/30; the 2 s window bar of >30 and <120 tolerates 15-60 Hz) and I could not construct a defensible flake. AC7's loop-until-three-refusals with `indexOf(429) >= 25` is sound against both fixed- and sliding-window counting for a fresh random key, and the 198.18.x.x addresses make cross-test interference negligible.

# Review 005 — simplicity

- **Lens:** simplicity
- **Verdict:** findings
- **Diff range:** 844d8bc...HEAD

## Findings

### F1 — minor

**Claim:** FakeSocket.closes is dead: it is written on every close and read by no test, and its doc comment claims assertions are written against it.

**Location:** `worker/tests/support/workers.ts:37`

**What:** A `readonly closes: string[]` field on the new socket double, appended to in the private `hangUp` (line 85). Grepping the whole repository, the only occurrences of `FakeSocket.closes` are its declaration, its doc comment (line 28) and the single `push` — `worker/tests/rematch.test.ts` reads the socket only through `kinds()`/`messages()`, which go via `heard`. The one place a close code is actually produced by this change, `hangUp(socket)` closing with `SILENT_CLOSE_CODE` in worker/table.ts:443, has no worker-side test at all.

**Failure scenario:** A maintainer reading workers.ts:28 ("`heard` and `closes` are this end's record of what it was told, which is what an assertion is written against") searches worker/tests/ for the assertion that reads `closes` and finds none; the field, the `push`, and the sentence describing them are all overhead that has to be understood and kept working for no caller. Concretely, if `hangUp` were changed to stop recording (or to record a different format), every test in worker/tests/ still passes, which is the definition of code nothing depends on.

**Suggested direction:** Either drop `closes` and its `push` and trim the doc comment to describe `heard` alone, or give it a reader — e.g. a worker-side case that drives the silence timeout and asserts the socket was closed with `SILENT_CLOSE_CODE`, which is the assertion the field looks like it exists for.

### F2 — nit

**Claim:** The `limiter(success)` test helper is duplicated verbatim between the two vitest projects.

**Location:** `worker/tests/entry.test.ts:58`

**What:** `function limiter(success: boolean): RateLimiter & { keys: string[] }` in worker/tests/entry.test.ts:58-66 is character-for-character the same as tests/unit/limit.test.ts:10-19 (same signature, same `keys` array, same `limit` closure). Sharing is demonstrably available: this change itself created `worker/tests/support/`, and tests/unit/limit.test.ts already imports across the halves of the repo (`import { ... } from '../../worker/limit'`), so a helper living next to `RateLimiter` type-checks under both tsconfigs.

**Failure scenario:** `RateLimiter.limit` is later given a second field the tests need to observe — say `{ success, remaining }` — or the key argument is renamed. Only one of the two copies is updated, because nothing links them; the other keeps compiling and keeps passing while asserting against a shape the production limiter no longer has, so its `expect(full.keys).toEqual([CALLER])` at worker/tests/entry.test.ts:112 no longer proves what it reads as proving.

**Suggested direction:** Move the helper into `worker/tests/support/` (next to the `RateLimiter` it fakes) and import it from both `worker/tests/entry.test.ts` and `tests/unit/limit.test.ts`; the latter is an addition rather than a change to an existing assertion, so AC7 still holds.

## Notes

Reviewed the whole range including the one uncommitted file (docs/work/table-server-limits/state.json, log text only). Explicitly checked and dismissed as non-findings: the `readTimeout` extraction (real de-duplication), `worthSending`/`speak` in src/net/table.ts (equivalent and behaviour-preserving), the double `scheduleSilenceCheck` in `dropSilent`+`vacate` (both reachable and needed), `allowanceOfOne` overlapping `limiter` in tests/unit/limit.test.ts (forced by AC3 plus AC7's no-existing-test-changed rule), and the third copy of the `live[live.length - 1]` idiom in tests/e2e/support/table.ts:196 (matches the two pre-existing `__forge`/`__say` copies; no present-day failure). No dead or orphaned exports found in shipped code.

# Review: simplicity

- Lens: simplicity
- Verdict: findings
- Diff range: f8ffd2b...HEAD

## Notes

Reviewed src/game/step.ts, src/main.ts, src/session.ts, src/status.ts, src/net/*, worker/*, index.html, src/style.css, playwright.config.ts, package.json and the unit/e2e tests. The two-input `step()` refactor, `worker/slots.ts`, and the split between `Session` and `GameState` are genuinely simpler than the alternatives and reuse `interpolate`/`movePaddle` rather than copying them; I found nothing to say against them. I deliberately did not report the chooser's submit handler (src/main.ts:339), which re-derives a session by building `?table=<id>` and re-parsing it instead of calling the already-exported `normaliseTableId`/`atTable` — it is a round-trip I would have written differently, but it is behaviour-preserving and defensible as keeping one definition of what a URL means.

## Findings

### F1

- Severity: minor
- File: worker/table.ts
- Line: 235

**Claim:** `Table.discardIfIdle()` cannot ever discard anything: every reachable path either does nothing or repeats what the idle timer already did, and the eviction case its comment cites is impossible for in-memory-only state.

**What:** 16 lines of guard plus rationale in the Durable Object that no execution can make observable.

**Failure scenario:** Enumerate the only caller (`seat()` at worker/table.ts:98, guarded by `this.seats.size === 0`): (a) nobody has ever sat here — `lastTickMs === 0`, guard false, no-op; (b) players left and the timer is pending — `this.idle !== null`, guard false, no-op; (c) players left and the timer fired — the callback at line 217 already did `this.game = createState(...)`, so this call recreates an already-fresh game, changing nothing observable; (d) the Durable Object was evicted, which is the case the comment at line 231-233 says this exists for — but the object keeps no storage (see worker/wrangler.toml, "the table keeps nothing in storage"), so a re-created instance runs the constructor at line 63, gets a brand-new `createState` and `lastTickMs === 0`, and the guard `this.lastTickMs > 0` is false. There is no input that reaches the `createState` on line 240 and changes the game a player sees.

**Suggested direction:** Delete `discardIfIdle` and its call, leaving `cancelIdleTimer()` in `seat()`; if a timer that may not fire is a genuine worry, replace `setTimeout` with a Durable Object alarm rather than keeping a clock check that cannot fire.

### F2

- Severity: minor
- File: tests/e2e/table.spec.ts
- Line: 235

**Claim:** The new two-browser tests re-implement `courtBox()`, a helper that already exists in the shared support module and is explicitly documented as the single reader of the canvas element.

**What:** The identical `getBoundingClientRect` evaluate block is written out twice more — here and in tests/e2e/support/table.ts:301 — while tests/e2e/support/pong.ts:235 already exports `courtBox(page)` returning `{left, top, width, height}`.

**Failure scenario:** tests/e2e/support/pong.ts:47-54 documents `Box` as "One reader of the element, not two"; this change makes three. table.spec.ts already imports `paddleAt` from './support/pong', so the helper is one identifier away. Concretely: if the court is ever wrapped or renamed (as the landscape work already reshaped the canvas's box), `courtBox` gets fixed and these two copies keep reading `document.getElementById('court')` directly — AC5's `courtY()` at table.spec.ts:244 then scales the pointer position through a stale box and the "within one pixel" assertion measures the wrong thing, passing or failing for reasons unrelated to local echo.

**Suggested direction:** Import `courtBox` from './support/pong' in both places and delete the two inline `page.evaluate` blocks; `parkPaddleAtTop` needs only `left`/`top`, which `Box` already carries.

### F3

- Severity: minor
- File: src/net/table.ts
- Line: 102

**Claim:** The `error` listener in the browser socket client duplicates the `close` listener's body and can never produce an outcome the `close` listener does not.

**What:** Eight lines repeating `closed = true; if (!refused) events.onLost();` behind a guard that requires the socket to already be CLOSED.

**Failure scenario:** Its own preceding comment (line 100-101) states "reports an error and then a close, and the close is where it is handled", and that is what happens: a WebSocket that fails to connect fires `error` then `close`, so the close handler at line 90 already calls `onLost()`. The guard requires `readyState === WebSocket.CLOSED`, i.e. the close event has fired or is queued, so the only effect is calling `onLost` one task earlier and then suppressing the close handler via `closed`. The AC9 shim (tests/e2e/support/table.ts:85-88) dispatches exactly `error` then `close(1006)`; deleting this listener leaves that test, and the user-visible "Lost the connection to table …" message, unchanged.

**Suggested direction:** Delete the `error` listener and keep the single `close` handler, or, if the earlier notification is wanted, factor the shared body into one local `lost()` function called from both.

### F4

- Severity: nit
- File: src/net/table.ts
- Line: 128

**Claim:** `TableSocket.close` is dead API: nothing in `src/` or `tests/` ever calls it.

**What:** An interface member (line 36) and its implementation that no caller uses.

**Failure scenario:** `joinTable` is called exactly once, at src/main.ts:251, and the returned socket is used only for `socket.report(...)` at src/main.ts:291; `startTable` is guarded by `started` so it never re-joins, and nothing tears the socket down. Grepping `src/` and `tests/` for `.close()` on the returned value yields no call site. The code ships in the bundle and implies a lifecycle ("the caller can leave a table") that the application does not have, so a reader looking for where a table is left finds a method and no answer.

**Suggested direction:** Drop `close` from `TableSocket` and its implementation until something needs to leave a table; `tableUrl` and the `export` on `tableStatusText` (src/status.ts:48) are similarly unused outside their own modules.

### F5

- Severity: minor
- File: src/main.ts
- Line: 25

**Claim:** `FIXED_DT_MS` and `MAX_FRAME_MS` are each defined twice, one copy sitting in the very module created so the two ends cannot keep their own copies.

**What:** `const FIXED_DT_MS = 1000 / 120` (line 25) and `const MAX_FRAME_MS = 250` (line 27) duplicate src/net/protocol.ts:24 and worker/table.ts:40, while main.ts already imports `SNAPSHOT_INTERVAL_MS` from src/net/protocol.ts on line 17.

**Failure scenario:** src/net/protocol.ts:1-11 says both ends import that one module "so the wire format cannot drift the way it does when each side keeps its own copy", and line 23 asserts "The simulation runs at the same rate on the server as it does at home" — yet `protocol.FIXED_DT_MS` is imported only by worker/table.ts, never by the client. A maintainer who lowers `protocol.FIXED_DT_MS` to `1000 / 60` to cut Worker CPU changes only the server's tick rate; src/main.ts keeps stepping single player at 120 Hz with no compile error and no test failure, and the comment claiming the two rates match is now false. worker/table.ts:40 makes the same duplication explicit in its own comment: "Same cap as the client's".

**Suggested direction:** Import `FIXED_DT_MS` from './net/protocol' in src/main.ts and move `MAX_FRAME_MS` into protocol.ts alongside it, so the three timing constants have one definition each.

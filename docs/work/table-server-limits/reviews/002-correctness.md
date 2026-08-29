# Review 002 — correctness

- **Lens:** correctness
- **Verdict:** clean
- **Diff range:** 844d8bc...HEAD

## Findings

None.

## Notes

Reviewed worker/table.ts (silence timer, markAlive, dropSilent, vacate, readTimeout), src/net/table.ts (heartbeat, speak, worthSending), src/net/protocol.ts, worker/limit.ts, vite.config.ts, playwright.config.ts, worker/wrangler.toml, and the new/changed tests.

Empirical verification (harness files in scratchpad only; working tree untouched):
1. Drove the real Table with a socket-pair harness at LIVENESS_TIMEOUT_MS=300. A seat that stopped speaking was closed with 4408 "no sign of life" 4 ms past its true deadline, the surviving player got {kind:'opponent',present:false}, and the freed slot was handed to the next arrival. A peer that only sent {kind:'alive'} was never evicted. Both-silent and last-silent cases free seats and hand off to the idle timer with no orphaned timeout.
2. Proved the invariant that makes the "never reschedule on markAlive" design safe: heardMs only moves forward and a new seat's deadline is always later than an existing one's, so the armed timer can fire early but never late.
3. Drove joinTable against a stub WebSocket for 6 s with an unchanging parked input: sent input, alive, alive, alive, alive; maximum silence 1984 ms (the ~2x HEARTBEAT_INTERVAL_MS worst case), well inside both the 5 s test timeout and the 90 s production one. report's `now` is the rAF timestamp (src/main.ts:349), the same time origin as performance.now(), so the heartbeat and report agree about the clock as the comment claims.
4. worthSending is behaviourally identical to the two guards it replaced.
5. network()'s case fold cannot change loopback detection: callerAddress checks the raw address against a set whose members contain no letters.
6. npx tsc --noEmit and npx tsc --noEmit -p worker both clean; npx vitest run green at 102 tests across the two projects.

Considered and rejected: (a) the unguarded this.inputs.set(slot, message.input) in the seat message listener, which lacks the seat check that markAlive and rematch have — a stale frame after a re-seat would persist because a parked player sends nothing to overwrite it, but dropSilent calls hangUp before vacate so the socket is closed before its seat is released and I could not construct a reachable path; (b) the error listener setting closed=true without clearing the heartbeat interval — a close event always follows a failed WebSocket connection and clears it there.

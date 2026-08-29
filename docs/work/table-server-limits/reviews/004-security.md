# Review 004 — security

- **Lens:** security
- **Verdict:** clean
- **Diff range:** 844d8bc...HEAD

## Findings

None.

## Notes

Verified rather than assumed: (1) worker/limit.ts:65-82 — the case fold now precedes the dotted short-circuit, toLowerCase is locale-independent so no key split, and callerAddress's LOOPBACK exemption still runs on the raw header, so no new spelling (e.g. ::FFFF:127.0.0.1) gains the exemption. The residual hex-form gap (::ffff:c000:201 collapsing into the shared 0:0:0:0 bucket) is pre-existing, untouched by this diff, and not caller-controllable since CF-Connecting-IP is written by the edge. (2) worker/table.ts:488-495 — origin and rate checks still precede env.TABLE.idFromName; worker/tests/entry.test.ts discriminates because the stub records on idFromName, so hoisting either check fails three cases. (3) worker/table.ts:306 markAlive re-checks seat ownership, so a socket whose seat was handed on cannot refresh another player's deadline; rematch's guard is untouched. (4) src/net/protocol.ts:171 — the 'alive' arm carries no payload and returns a constant; near-miss kinds are rejected. (5) hangUp (worker/table.ts:443) uses a static close code and reason; no caller data reaches a close frame, response body, or log, and no logging was added. (6) package.json and lockfile unchanged — no new dependencies; vitest 3.2.7 supports test.projects, and `npx vitest run` executed 12 files / 102 tests across both projects, so the AC5 guard actually runs. (7) worker/tests/support/workers.ts patches globalThis Response/WebSocket/WebSocketPair but restores in afterEach and is unreachable from `main = "table.ts"`, so it is not bundled; the __silence/mute shim lives only in tests/e2e/support. (8) Traced seat/vacate/dropSilent/scheduleSilenceCheck for a permanently-disarmed timer or a busy re-arm loop; every exit re-arms and every throwing call inside dropSilent already swallows. The one remaining availability hole — a script that answers the heartbeat holds a Durable Object indefinitely — is an explicitly declared non-goal (docs/work/table-server-limits/plan.md:58-67) and is stated in the README text this change adds, so it is an accepted trade rather than a defect.

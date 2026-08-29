# Review 007 — judge-diff

- **Lens:** judge-diff
- **Verdict:** findings
- **Diff range:** 7d65328..b6bf8f9 (commits 6a85acf, b6bf8f9 — per state.json review.head..verdict.head)

> **Scope note:** This review covers the judge's own adjudication commits, which no
> other lens saw.

## Findings

### F1 — minor

**Claim:** The one functional code fix in the adjudication commit (the heartbeat throttle constant) ships with no automated test protecting it, so a future edit can silently reintroduce the exact bug this commit fixed and the suite will stay green.

**Location:** `src/net/table.ts`:37

**What:** b6bf8f9 adds `const BEAT_DUE_MS = HEARTBEAT_INTERVAL_MS / 2;` and changes the heartbeat guard at line 142 from `now - lastSpokeMs < HEARTBEAT_INTERVAL_MS` to `now - lastSpokeMs < BEAT_DUE_MS`, fixing a real timing bug (verified by manual trace of the setInterval/guard interaction, and consistent with review 001-behavior's measured 18-frames-in-30s evidence). Unlike the three test-quality findings in the same commit, which each land a dedicated regression test in worker/tests/liveness.test.ts, this fix lands with zero new/updated tests anywhere. `grep -rn "BEAT_DUE_MS" --include="*.ts" .` (run against the working tree) returns only the two lines in src/net/table.ts itself — no test file references the constant or exercises the timing at all. `src/net/` has no unit tests of any kind.

**Failure scenario:** Revert `BEAT_DUE_MS` to `HEARTBEAT_INTERVAL_MS` (undoing exactly this fix), or otherwise reintroduce the every-other-tick suppression. `npm run test:unit` (106 tests) and `npm run test:e2e` both stay green: AC2's behavioural test (tests/e2e/liveness.spec.ts) holds two parked players for 3x the configured liveness timeout, which passes whether the client beats once a second or once every two seconds, because the margin swallows the difference either way. There is no automated signal that would catch the regression.

**Suggested direction:** Not a merge blocker — this gap is explicitly disclosed by the judge as follow-up F-1 in verdict.md, so it is not hidden. Flagging because it is a real, independently-verifiable gap in the diff itself: the fix that most needed a regression test (it was born from a real observed production discrepancy) is the one fix in this commit that didn't get one, while three lower-stakes test-coverage gaps did. A small stubbed-WebSocket unit test around joinTable's heartbeat timer (as F-1 itself suggests) would close it.

## Notes

Range taken directly from docs/work/table-server-limits/state.json (review.head=7d65328, verdict.head=b6bf8f9); both fields were present so no fallback was needed. The range contains two commits: 6a85acf (review findings files only, no code) and b6bf8f9 (the actual adjudication: one client-side constant change in src/net/table.ts, two new/extended test files, plan.md status line, and verdict.md). I ran `npm run test:unit` against the working tree (106/106 passing, matching the claimed count) and manually traced the four new cases in worker/tests/liveness.test.ts against worker/table.ts's markAlive/dropSilent/scheduleSilenceCheck logic step-by-step (including the exact fake-timer schedule in the fourth test, "ignores a beat from a socket whose seat somebody else now holds") to confirm each test genuinely discriminates against the mutation it claims to (hangUp removed, 'alive' arm removed, seat check removed) rather than passing vacuously. All four checked out. I also compared every accepted/rejected disposition in verdict.md against the six review files under docs/work/table-server-limits/reviews/ and found no misrepresentation of what a lens actually reported. The one thing I did not independently verify is the real-browser timing claim itself ("11 beats in 20s before, 20 after") since that requires driving a built bundle in an actual browser, which is out of scope for a static diff review; the underlying JS-timer mechanism it describes (successive setInterval callback deltas falling under the nominal interval after a preceding callback ran a little late) is plausible and internally consistent with the fix applied, so I did not treat the unverified measurement itself as a finding. verdict.md's own follow-up F-2 (a pre-existing, disclosed gap where worker/table.ts's `this.inputs.set(slot, message.input)` lacks the seat-ownership check that markAlive and rematch both have — the same "guard in one path, not its twin" pattern this task asked me to hunt for) is pre-existing code untouched by these two commits and is candidly disclosed with sound reasoning for deferring it, so I did not raise it as a finding against the judge's diff.

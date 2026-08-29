# Review 003 — spec-fidelity

- **Lens:** spec-fidelity
- **Verdict:** clean
- **Diff range:** 844d8bc...HEAD

## Findings

None.

## Notes

Verified against the repository rather than the narrative; the working tree was never modified (git status --porcelain still shows only the pre-existing state.json edit), and every build/mutation/test run was against git-archive copies in the scratchpad.

All seven ACs are met. AC1 and AC2 pass against a real wrangler dev (tests/e2e/liveness.spec.ts, 25.3s), and both S8 discrimination claims reproduce exactly: disabling the client heartbeat at src/net/table.ts:131 fails AC2 with the recorded "Lost the connection to table ..." status, and disarming scheduleSilenceCheck at worker/table.ts:322 fails AC1 with `Expected: "Your opponent left..." Received: ""` after the full ten seconds. AC3 holds: worker/limit.ts:66-69 folds case before the dotted short-circuit, and the two added cases in tests/unit/limit.test.ts cover both the shared key and the shared allowance. AC4 holds both ways: `tsc --noEmit` and `tsc --noEmit -p worker` each exit 0 with worker/tests/ present, and worker/tsconfig.json does include "." with @cloudflare/workers-types, so S1's "nothing else was needed" is accurate. AC5 discriminates: hoisting `env.TABLE.get(env.TABLE.idFromName(tableId))` above the two door checks fails 3 of the 5 entry cases, the exact count S2 records. AC6 discriminates: deleting the `this.seats.get(slot) !== socket` guard from Table.rematch fails worker/tests/rematch.test.ts:67 on the extra "snapshot", the exact failure S3 records. AC7 holds: 102 unit tests (95 unit + 7 worker) and 65 behavioural tests all pass, and the only edits to existing test files are additions — the three deleted lines in tests/e2e/support/table.ts are doc-comment prose, not assertions.

Claims: C1 is off by one line (the early return is src/net/table.ts:124 at 844d8bc, not :123) but substantively correct, which is not worth a finding. C2 is exactly at worker/limit.ts:60 at the base. C3 holds with the S3 correction, and the three globals workers.ts installs really are required (node's Response does reject status < 200). C4 and C5 read true. C6 verified directly against node_modules/@cloudflare/workers-types/index.d.ts:3782 — the WebSocket interface exposes no ping, and the only auto-answer facility is DurableObjectState.setWebSocketAutoResponse at :703, which is hibernation-only. C7 verified by construction: a seat is freed only in vacate, reached only from the close and error listeners.

Non-goals: none built. No hibernation, no concurrency cap, no deploy, nothing about the game or layout beyond the heartbeat AC2 requires. The README edit is a recorded deviation and each of its four claims is true of the shipped code. No PLAN DEFECT note exists for this work item, so there is nothing to escalate.

One gap in my coverage, stated plainly: I confirmed S9's macOS/Node 22.23.2 half only; the node:22-bookworm container run is unverified.

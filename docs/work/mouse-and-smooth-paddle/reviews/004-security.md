# Review: security

- **Lens:** security
- **Verdict:** clean
- **Diff range:** 48e080f...HEAD

## Findings

None.

## Notes

Client-only browser game with no server, no auth, no persistence and no network calls; the security surface this change adds is small and I could not construct a concrete failure scenario against it.

Checked and found clean:
- Injection: no HTML/JS sinks anywhere (no innerHTML/outerHTML/insertAdjacentHTML/document.write/eval/new Function/srcdoc in src, index.html or tests). All DOM writes in /Users/joelstevick/projects/starter-example-3/src/main.ts use textContent or setAttribute with a stringified boolean. The new mouse path carries only numbers.
- Untrusted input handling: the new input is MouseEvent.clientY, mapped by courtY (/Users/joelstevick/projects/starter-example-3/src/input.ts:49) and then bounded by clampPaddle in /Users/joelstevick/projects/starter-example-3/src/game/step.ts:106. The box.height <= 0 guard at src/input.ts:121 prevents a divide-by-zero producing a permanently NaN paddle position. The pre-existing ?seed= input is unchanged and still validated via Number.isFinite + |0 in src/game/rng.ts.
- Authz: the only new capability gate is the canvas click handler calling onStart; start() in src/main.ts:67 still guards on state.phase, so a click during play cannot restart or re-unlock anything.
- Secrets: none added; grep for token/secret/password/api-key/bearer/credential over docs/work/mouse-and-smooth-paddle/ is empty. No build artifacts committed (dist/, node_modules/, test-results/ all ignored; working tree clean).
- Deserialization: no JSON.parse anywhere in src or tests.
- Dependencies: package.json and package-lock.json are not in the diff range, so no new or upgraded dependency surface.
- Logging/error exposure: no console.* calls in src or tests; the only new throw is in tests/e2e/support/pong.ts and contains frame indices only.

Noted but not reported as a finding: the mousemove listener is attached to window and does not check event.isTrusted, so a synthetic mousemove would move the paddle. Dispatching one requires same-origin script execution, which is already full compromise of a page with no assets to protect, so no privilege is gained and no concrete failure scenario exists.

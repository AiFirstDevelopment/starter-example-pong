# Review: security

- **Lens:** security
- **Verdict:** clean
- **Diff range:** `ddd7c34...HEAD`

## Findings

None.

## Notes

Reviewed ddd7c34...HEAD (commits dab7ee0, 7a5b954); working tree confirmed clean including untracked files. The change is a client-side-only input/CSS change plus test scaffolding: src/input.ts swaps the window `mousemove` listener for `pointermove` behind a pure `drivesPaddle(pointerType, startedOnCourt)` predicate; src/style.css adds `touch-action: none` on the canvas and `overscroll-behavior: none` on html/body; index.html changes hint text only; the remainder is playwright.config.ts, tests/e2e/support/pong.ts, tests/e2e/touch.spec.ts, tests/unit/input.test.ts and two docs files.

Surfaces checked against the code, each empty:
- Injection: no new sinks. grep of src/ and index.html for innerHTML, eval(, new Function, document.write, postMessage returns nothing. The only string-into-context construction added is the test helper `computedStyle` (tests/e2e/support/pong.ts), which passes selector/property as a serialized page.evaluate argument rather than interpolating into evaluated source, and is called with three hardcoded literals.
- Authn/authz: no server, session, or identity exists, and none is introduced.
- Secrets: grep of the full diff for token|secret|api[_-]?key|password|credential|Bearer|https?:// matches exactly one line, `baseURL: http://localhost:${PORT}` in playwright.config.ts. No new env reads.
- Unsafe deserialization: none added; the only data crossing a boundary is numeric pointer coordinates from real browser events.
- Dependency risk: package.json and the lockfile are untouched in the range (confirmed via git diff --name-only). `devices['Pixel 5']` re-uses a descriptor from the already-installed @playwright/test.
- Sensitive data in logs/errors: the new throws are all in test-only paths and carry no user or system data.
- Test code reaching production: playwright.config.ts imports tests/e2e/support/pong.ts, but the Vite build entry is index.html -> src/main.ts, and the `window.__pointer` instrumentation is installed at test time via page.evaluate, so it is not in the shipped bundle.

The widened listener does broaden what the page observes, but the app has no egress or persistence path at all (no fetch, XMLHttpRequest, localStorage or sessionStorage anywhere in src/), so the extra pointer data cannot leave the tab. Concerns I noticed that belong to other lenses — the scrolling implications of `touch-action: none`/`overscroll-behavior: none`, and the plan's own unverified AC3 "needs a human on a real phone" caveat — are correctness and verification issues, not security, and I left them to the reviewers who own them.

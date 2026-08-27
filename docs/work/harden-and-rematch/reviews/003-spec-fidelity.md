# Review 003 — spec-fidelity

- **Lens:** spec-fidelity
- **Verdict:** findings
- **Diff range:** 17af241...HEAD

## Findings

### F1 — major

**Claim:** The shipped rate limiter exempts any caller the runtime reports as loopback — a recorded PLAN DEFECT that deviates from plan step S6 and that the plan explicitly asks the judge to put to the user.

**Location:** `worker/limit.ts:50`

**What:** S6 says to key the limit on `CF-Connecting-IP` and fail open only when the binding is absent. What was built also fails open on the address: `callerAddress` returns `null` for `127.0.0.1` and `::1` (worker/limit.ts:34,50) and `withinRate` returns `true` for a `null` key without consulting the limiter (worker/limit.ts:76-79). The build notes record this under 'PLAN DEFECT — keying the limit purely on CF-Connecting-IP takes the suite down' and state 'The judge should put the carve-out to the user. It is the one place where a test's need shaped production code.' Nothing downstream of the build has surfaced it: the adjudication commits are not in this range, so it is still unescalated.

**Failure scenario:** Run the Worker in any topology where the client address arrives as loopback — `wrangler dev` exposed through a same-host cloudflared quick tunnel, or workerd/miniflare behind a reverse proxy on the same machine. Every `/table/<id>` upgrade then carries `CF-Connecting-IP: 127.0.0.1`, `callerAddress` returns `null`, `withinRate` returns `true` without calling `env.LIMITER.limit`, and a single script can create unbounded Durable Objects: AC7's 429 never fires. On a real Cloudflare edge deploy the header cannot be forged, so the exposure is topology-dependent rather than universal — which is precisely why the plan asks for a user decision rather than a silent choice.

**Suggested direction:** Escalate the carve-out to the user for a decision before `deploy:table`, as the build notes request; the alternatives the notes reject (a kill-switch var, a separate [env] block, keying by table id) are already recorded so they need not be re-invented. No code change is implied by this finding on its own.

### F2 — minor

**Claim:** The third hazard the plan's Intent names as a reason the Worker cannot be published — a client that never disconnects is never reclaimed — is addressed by no acceptance criterion and by no code in this change.

**Location:** `worker/table.ts:174`

**What:** The Intent lists three facets of the blast radius: unbounded object creation (addressed by AC7's rate limit), 30 Hz broadcasting with one seat filled (addressed by AC3/AC5), and 'the idle timer only arms when the last socket closes, so a client that never disconnects is never reclaimed'. The third is untouched: `startIdleTimer()` is still armed only inside `if (this.seats.size === 0)`, and the object holds a non-hibernating `server.accept()` socket, so a table with one silent seated socket stays resident indefinitely. The rate limit caps the rate of creation, not the number held open.

**Failure scenario:** A script opens 30 upgrades per minute from one address — inside the configured allowance, so every one is admitted — each to a distinct table id, and never closes the sockets. Each request addresses a Durable Object that stays active and duration-billed for as long as its socket is open; because `seats.size` is 1 for each, `startIdleTimer()` never runs and nothing reclaims them. After an hour roughly 1,800 tables are pinned on the account owner's bill, with no broadcast traffic to make it visible. Every AC in the plan still passes.

**Suggested direction:** Record it as a known residual before `deploy:table` is run, or raise it as a follow-up work item (a per-socket inactivity timeout, or WebSocket hibernation so an idle table is not billed for duration). Note that AC1–AC7 are all met as written — this is an Intent-versus-ACs gap, not an unmet criterion.

## Notes

Verified against the repository rather than accepted from the plan: C3 was re-checked against `node_modules/wrangler`'s own `validateRateLimitBinding` (requires `name`, `namespace_id`, `simple` — `binding` rejected), and C7 against miniflare's bundled `RateLimiterObject` (a real fixed 60 s wall-clock window, so the local binding genuinely counts). C4, which the build notes flag as un-rechecked and possibly contradicted by `README.md:113` (`https://pong.pages.dev`), is corroborated by evidence inside the repository: `package.json` deploys with `--project-name=pong --branch=main`, and commit 153d91e records that the bare `pong` subdomain was already taken so production serves at `pong-3su.pages.dev`. The allow-list is therefore correct and README:113 is a pre-existing doc error outside this diff — I did not raise it as a finding. C1, C2, C5 and C6 all check out against the code they describe. 88/88 unit tests pass and both `tsc --noEmit` projects are clean on this tree; I did not run the e2e suite (it needs Node 22 and starts servers) and left that to the behaviour lens. The recorded build-note deviations hold up: index.html is genuinely unchanged, the `seats.size === 2` branch is genuinely gone, `say`/`parkPaddleAtCentre`/`sample()` are the three test-support additions claimed, and the `sample()` `?? 0` change cannot weaken an existing assertion because every consumer of `frameOfSound` asserts `> -1`. One small inaccuracy I chose not to raise as a finding: the S7 note says AC7 'asserts the door shuts no earlier than an allowance in', while tests/e2e/entry.spec.ts:137 asserts `>= 25` against a configured allowance of 30.

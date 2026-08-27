# Review: judge-diff

> This review covers the judge's own adjudication commits, which no other lens saw.

- **Lens:** judge-diff
- **Verdict:** findings
- **Diff range:** `67f1dd9..5453dec`

## Notes

state.json's review.head (67f1dd9) and verdict.head (5453dec) were both present, so I used them literally; git log 67f1dd9..5453dec resolves to a single commit, 5453dec ('Adjudicate harden-and-rematch: count an IPv6 caller as one caller'), which is what I reviewed. Two further commits exist on the branch after verdict.head (08b74d4, 3adc020) that are outside this assigned range per the task's own formula, so I did not review their content in depth; I only used them to establish that verdict.md's citation defects noted below (F2) were self-corrected shortly afterward, and to confirm that the three 'settled by user' log lines injected into state.json during the suite run were never acted on in code within 5453dec (the diff touches no production file besides worker/limit.ts, and no idle-timer/E2 code exists anywhere in this commit). I compiled and ran the affected suites myself (vitest unit suite: 92/92 green under both Node 20 and Node 22; a Playwright run of the two modified e2e specs, tests/e2e/broadcast.spec.ts and tests/e2e/rematch.spec.ts, under real wrangler dev + Chromium, twice for the broadcast spec: all green, no flake observed) and additionally probed worker/limit.ts's new network() function with inputs outside its own test file's coverage (temporary throwaway test files created under tests/unit/, run, then deleted; git status confirmed clean afterward both times).

## Findings

### F1 — minor

**Claim:** network() in worker/limit.ts normalizes hex-digit case for compressed IPv6 addresses but not for the dotted (IPv4-mapped/NAT64-style) branch, so a single host can be split across two different rate-limit keys purely by letter case.

**Location:** `worker/limit.ts:60`

**What:** The function's first branch — `if (!address.includes(':') || address.includes('.')) { return address; }` — returns the header value completely unmodified whenever it contains a literal dot (the path taken for IPv4-mapped/IPv4-translated/NAT64 forms like `::ffff:203.0.113.7`). The second branch, two lines later, calls `address.toLowerCase()` before doing anything else. Only the second branch is case-normalized.

**Failure scenario:** I verified this directly against the built module: `callerAddress` on a request with header `CF-Connecting-IP: ::ffff:203.0.113.7` returns `'::ffff:203.0.113.7'`, and the same header with `CF-Connecting-IP: ::FFFF:203.0.113.7` (identical host, only the hex letters' case differs) returns `'::FFFF:203.0.113.7'` — a different string, hence a different rate-limit bucket. The doc comment on `network()` states its purpose is exactly to stop a single host from being counted as more than one caller ('the IPv4-mapped form ... is a host ... so neither ends up sharing one allowance'), and this commit's whole rationale is closing off ways an attacker gets 'never the same caller twice.' For this one branch, that guarantee silently does not hold. Real-world exploitability on the deployed Worker is low, since `CF-Connecting-IP` is edge-set by Cloudflare (the same file elsewhere states a caller 'cannot forge it') and Cloudflare's own IPv6 representation is consistently lowercase, so this looks unreachable in production rather than a live bypass — but it is untested (neither `tests/unit/limit.test.ts`'s new 'counts a host as a host' case nor any other test exercises mixed-case input) and inconsistent with the normalization the sibling branch two lines below performs for exactly the same stated purpose.

**Suggested direction:** Lowercase `address` once, before the branch check, so both the dotted-host path and the compressed-IPv6 path share one normalization step.

### F2 — nit

**Claim:** verdict.md, as committed by 5453dec, cites unresolvable pseudo-paths as evidence for AC1, AC6 and AC7 instead of real file:line references.

**Location:** `docs/work/harden-and-rematch/verdict.md:35`

**What:** The AC1 evidence cell reads '...so all three gestures the AC names reach `table.rematch()`' (a function-call notation, not a path), the AC6 cell cites `env.TABLE.get(...)` the same way, and the AC7 cell cites a bare `wrangler.toml` with no directory — as opposed to the corrected version that cites `src/net/table.ts:136`, the actual precondition in `worker/table.ts:378`, and `worker/wrangler.toml:28` respectively.

**Failure scenario:** This is the same commit's own audit trail failing its own tooling: the follow-up commit 3adc020 (outside this review's assigned range, landed a few minutes later by the same author) describes fixing 'five of the guard's six violations... backticked code identifiers in the evidence column -- table.rematch(), env.TABLE.get(...), a bare wrangler.toml -- which its citation checker reads as file paths and could not resolve.' I confirmed by diffing `git show 5453dec:docs/work/harden-and-rematch/verdict.md` against the corrected version that these three citations are exactly as described and exactly where the guard flagged them. At the moment 5453dec landed, the verdict's acceptance-criteria evidence was not actually guard-clean, i.e. not independently verifiable the way the rest of the table is.

**Suggested direction:** None needed for this range specifically — it was self-corrected in the very next commit. Flagging only because it is a clean example of the time-pressure pattern the review was asked to look for (a rushed pass at documentation quality on the judge's own artifact).

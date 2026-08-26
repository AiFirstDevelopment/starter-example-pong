# Review: security

- **Lens:** security
- **Verdict:** findings
- **Diff range:** 4644a71...HEAD (plus uncommitted working-tree changes)

## Notes

Reviewed every added file in the range. Injection, XSS, secret handling, unsafe deserialization, and sensitive-data-in-errors were all checked against the code and found clean; the app is a fully offline static canvas game with no server, no storage, no network calls, and a single untrusted input (`?seed=`) that is numerically coerced and never reaches a sink. Authentication/authorization is inapplicable — the plan's non-goals explicitly exclude accounts and any server-side component. The `?seed=` mechanism is a determinism aid with no privilege attached, so its predictability is by design and not a weakness. `npm audit` was run against the committed lockfile with network access; all version claims in F1 are from that run, not from recall.

## Findings

### F1 — major

**Claim:** The newly declared dev-dependency ranges `vite ^5.4.0` and `vitest ^2.0.5` pin end-of-life major lines that carry unpatched advisories (1 critical, 1 high, 2 moderate); no version satisfying either range is patched, so `npm install` can never produce a clean tree.

**Location:** `package.json:18`

**What:** Dependency risk: the stack-establishing commit selects major lines with no available fix. Verified by running `npm audit` against the committed lockfile: vite resolves to 5.4.21 (the newest 5.x published) and vitest to 2.1.9 (the newest 2.x published), and both are still in the affected ranges. npm reports the only fixes as vite 6.4.3 and vitest 4.1.11, both flagged `isSemVerMajor: true`. Advisories: GHSA-fx2h-pf6j-xcff (high, `server.fs.deny` bypass on Windows alternate paths, affects <=6.4.2), GHSA-5xrq-8626-4rwp (critical, arbitrary file read/execute when the Vitest UI/API server is listening, affects <3.2.6), GHSA-4w7w-66w2-5vf9 and GHSA-67mh-4wv8-2f99 (moderate). Because vitest 2.1.9 requires vite ^5, bumping either one alone is not possible — both must move together.

**Failure scenario:** Two concrete consequences. (1) Supply-chain gate: `npm audit --audit-level=high` against this exact lockfile exits 1 (I ran it in this working tree). Any CI job or org policy that gates on high-severity advisories fails on this branch from the first commit, and `npm update` cannot clear it because 5.4.21/2.1.9 are already the newest in-range releases. (2) Developer-machine exposure: a contributor following README.md:24 (`npm run dev`) on Windows runs a Vite 5.4.21 dev server carrying GHSA-fx2h-pf6j-xcff, where a request using a Windows alternate path form is served content that `server.fs.deny` is supposed to refuse — file contents from outside the project root are returned to whoever can reach the dev server port. The plan states this work item establishes the stack that later work items follow, so the unpatchable pin propagates to every future change on this repo.

**Suggested direction:** Move the toolchain to the patched majors together — `vite ^6.4.3` (or newer) with `vitest ^3.2.6` (or newer) — and regenerate package-lock.json, then confirm `npm audit` is clean and both `npm run test:unit` and `npm run test:e2e` still pass. Note this is dev-tooling only: the app ships zero runtime dependencies, so nothing a player loads is affected.

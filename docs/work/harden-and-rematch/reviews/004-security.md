# Review 004 — security

- **Lens:** security
- **Verdict:** findings
- **Diff range:** 17af241...HEAD

## Findings

### F1 — major

**Claim:** The rate limit — the work item's only real protection against unbounded Durable Object creation — is keyed on the full IPv6 address, so any caller with an ordinary delegated /64 has an effectively unlimited allowance.

**Location:** `worker/limit.ts:53`

**What:** `callerAddress` returns the `CF-Connecting-IP` value verbatim, and `withinRate` passes it straight to `limiter.limit({ key })` as the counting key. Cloudflare's binding counts distinct key strings; it does not normalise addresses. For IPv4 one key is one host, but for IPv6 one key is one /128 out of the /64 that ISPs and cloud providers routinely delegate to a single subscriber or VM.

**Failure scenario:** An attacker on a host with a delegated IPv6 /64 (standard on Hetzner, OVH, and most residential ISPs) binds a fresh source address per request: 2001:db8:a:b::1, ::2, ::3, and so on. Cloudflare's edge sets CF-Connecting-IP to each distinct address; callerAddress returns each unchanged; the limiter sees a new caller each time and grants a fresh 30-per-minute allowance. The attacker issues GET/upgrade requests to /table/<random-id> without ever seeing a 429, and each admitted upgrade reaches `env.TABLE.get(env.TABLE.idFromName(tableId)).fetch(request)` (worker/table.ts:378), creating a Durable Object that stays resident and duration-billed for as long as the socket is held open. That is precisely the blast radius the work item exists to close (plan.md lines 12-19), and AC7 is only nominally satisfied because every request genuinely is 'from a different address'. Origin is no obstacle: C5 and worker/origins.ts:5 both state that a non-browser client sets whatever Origin it likes.

**Suggested direction:** Normalise the key before counting: if the address contains ':', truncate to the first four hextets (the /64 prefix) and use that as the limiter key; keep IPv4 addresses whole. A unit test in tests/unit/limit.test.ts asserting that two addresses in the same /64 produce the same key would pin it.

### F2 — minor

**Claim:** The production allow-list shipped to the deployed Worker includes localhost development origins, so pages served from Vite's default ports on any machine are treated as the game's own site.

**Location:** `worker/wrangler.toml:18`

**What:** `ALLOWED_ORIGINS` in `[vars]` carries `http://localhost:4173`, `http://127.0.0.1:4173`, `http://localhost:5173` and `http://127.0.0.1:5173` alongside the real site and its previews. `npm run deploy:table` runs `wrangler deploy --config worker/wrangler.toml` (package.json:18), so this exact list is what the deployed Worker enforces — there is no separate production override.

**Failure scenario:** After deploy:table, a user has any page open at http://localhost:5173 — Vite's default dev port, shared by every Vite project, so this is whatever project they last ran `npm run dev` on, or any locally installed app serving on 5173/4173. That page's JavaScript calls new WebSocket('wss://pong-table.<account>.workers.dev/table/johnny-13224'). The entry reads Origin: http://localhost:5173, originAllowed returns true, and the request is forwarded to env.TABLE.get(...), creating and seating at a Durable Object. The single thing the allow-list is documented to buy — 'it stops another site embedding these tables' (worker/origins.ts:5) — does not hold for those pages: they can create Durable Objects on the account's bill up to the rate limit, and can occupy a seat at any table id they name, so a real second player who types that id is refused.

**Suggested direction:** Keep the deployed list to the site and its previews, and supply the localhost origins only where they are needed — e.g. via `wrangler dev --var ALLOWED_ORIGINS=...` in the test harness, the same mechanism IDLE_TIMEOUT_MS already uses for tests (worker/wrangler.toml:10-12).

## Notes

Range confirmed as two commits (558702d, 67f1dd9) with a clean working tree. Checked and found nothing to report on: injection (no new logging, no DOM sinks, table id is length-capped by normaliseTableId and only used for idFromName); unsafe deserialization (parseClientMessage rejects non-strings, arrays via the kind switch, and unknown kinds; JSON.parse's __proto__ is an own property, so no prototype pollution); authorization (rematch checks `this.seats.get(slot) !== socket` at worker/table.ts:200, and a socket refused for a full table never gets a message listener registered, so it cannot reach the handler at all); error-response content (the new 403 and 429 bodies disclose nothing); dependency risk (package.json and lockfile untouched in this range). I deliberately did not report the loopback carve-out at worker/limit.ts:34 — I could not construct a concrete bypass, since Cloudflare's edge sets and overwrites CF-Connecting-IP, and the build notes already escalate the carve-out to the judge at plan.md:297-328.

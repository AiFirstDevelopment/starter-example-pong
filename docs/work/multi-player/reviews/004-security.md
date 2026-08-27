# Review: security

- Lens: security
- Verdict: findings
- Diff range: f8ffd2b...HEAD

## Notes

Verified empirically against a real `wrangler dev` run of worker/table.ts (probe on port 8799, since torn down). The repository working tree is unchanged (`git status --porcelain` clean). Side effect to flag: my cleanup used a broad `pkill -f workerd`, which killed the workerd child of a pre-existing `npm run dev:table` server on port 8787 that I did not start; its wrangler parent (pid 69646) is still alive but no longer serving. Restart it with Ctrl-C and `npm run dev:table` if it was in use. No repository files were touched.

Cleared in this lens: `npm audit` reports 0 vulnerabilities (198 deps) after the wrangler/Node-22 bump; no secrets committed (.env.production holds only a public Worker URL); no HTML/JS injection sink (no innerHTML/eval/document.write anywhere in src/, worker/, index.html — table id reaches the DOM only via textContent and URLs only via encodeURIComponent); parseClientMessage/parseInput correctly reject non-finite targetY and movePaddle clamps it, so a hostile client cannot strand a paddle or inject NaN into shared state; Worker error bodies are static strings; the Playwright WebSocket shim is addInitScript-only and never ships.

## Findings

### F1

- Severity: major
- File: worker/table.ts
- Line: 318

**Claim:** The table Worker is a public, unauthenticated endpoint that lets any client create an unbounded number of Durable Objects, each pinned in memory and broadcasting at 30 Hz for as long as the client holds one socket open — billed to the account owner.

**What:** `env.TABLE.get(env.TABLE.idFromName(tableId)).fetch(request)` routes any attacker-chosen path segment to a new Durable Object with no authentication, no Origin allow-list and no rate limit. Two design choices amplify this: `server.accept()` (line 75) uses the non-hibernating WebSocket API, so each DO stays resident and billed for wall-clock duration for the socket's whole lifetime; and `this.startLoop()` (line 126) is called on every seating, so the 30 Hz `setInterval` broadcast runs even when only one seat is filled. The idle timeout (line 213) only arms once the LAST socket closes, so a client that simply never disconnects is never reclaimed. `Table.fetch` (line 67) checks only the `Upgrade` header before seating the caller. This release adds `npm run deploy:table` (package.json), which is what makes the endpoint public.

**Failure scenario:** Verified against a real `wrangler dev` running this exact worker. (1) A script opens one WebSocket per unique id to `wss://pong-table.joelstevick.workers.dev/table/<uuid-N>` for N = 1..10,000. Each id is a distinct `idFromName`, so 10,000 Durable Objects are created and each seats the caller as 'left'. My probe measured 116 messages in ~4 s (≈29/s) to a single-occupant table with no opponent, confirming each DO runs its broadcast loop regardless — that is ~300,000 outbound frames/second and 10,000 resident, duration-billed DOs from 10,000 HTTP upgrades, sustained indefinitely because the sockets are never closed and the idle timer never arms. (2) The same request carrying `Origin: https://evil.example` was answered `HTTP/1.1 101 Switching Protocols` followed by `{"kind":"welcome","slot":"left"}`, so any third-party web page can turn every one of its visitors' browsers into a source of that load (WebSocket handshakes are not subject to CORS). The wrong result is an unbounded Cloudflare bill and table-server unavailability for real players, triggered by an unauthenticated party with no knowledge of any table id.

**Suggested direction:** Add admission control at the upgrade in `Table.fetch` / the module `fetch`: reject upgrades whose `Origin` is not the Pages origin or a dev host; put a Cloudflare rate-limiting binding on the `/table/` route keyed by IP. Independently, cut the amplification: use the WebSocket Hibernation API (`state.acceptWebSocket`) so a waiting table is not billed for duration, and do not run the 30 Hz interval while `seats.size < 2` — broadcast once on seat/vacate instead, since `simulateAndBroadcast` already advances nothing in that branch. A per-socket inactivity deadline would also stop a connected-but-silent client holding a table forever.

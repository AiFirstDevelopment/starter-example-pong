# Review 001 — behavior

- **Lens:** behavior
- **Verdict:** findings
- **Diff range:** 17af241...HEAD

## Findings

### F1 — minor

**Claim:** Following the README's "Running it" instructions, joining a table from the Vite dev server hangs forever on "Joining table …" — the page opens a socket to the dev server, not to the table server.

**Location:** `README.md:79`

**What:** `npm run dev` runs Vite in development mode, where `.env.production` does not apply, so `VITE_TABLE_URL` is unset and the client falls back to its own origin. The README says "`npm run dev` serves the page and `npm run dev:table` serves the tables. Only the second is needed for a two-player game", but nothing connects the two: there is no dev-server proxy for `/table/*` in vite.config.ts.

**Failure scenario:** Ran `npm run dev` (5173) and `npm run dev:table` (8787) exactly as README lines 74-81 instruct, loaded http://localhost:5173/, typed a table id and pressed "Join table". Observed socket: `ws://localhost:5173/table/hang-mtb9joh2` — the Vite HMR server, which accepts the upgrade and then says nothing. The status line read "Joining table hang-mtb9joh2…" at t=1s, 5s, 10s, 20s and 30s, with no error, no timeout and no way forward; the chooser is already hidden. The same page built with `VITE_TABLE_URL=ws://127.0.0.1:8787` and served by `vite preview` joins normally. This is pre-existing (the README text and the URL fallback predate 17af241; the only client change in range is the added `rematch()` method), but this change extends the same README and ships `http://localhost:5173` / `http://127.0.0.1:5173` in ALLOWED_ORIGINS, which reads as if the documented dev flow reaches the table server.

**Suggested direction:** Either correct README line 79-82 to say a table game in development needs the bundle built or served with `VITE_TABLE_URL=ws://127.0.0.1:8787` (as the Deploying section already explains), or add a `/table` proxy to vite.config.ts so `npm run dev` + `npm run dev:table` works as written. A visible failure after a join timeout would also be better than an indefinite "Joining table …".

## Notes

Everything in AC1-AC7 was exercised against the built bundle and a real `wrangler dev` Durable Object, and all of it behaved as the plan states; measurements are in the message above. Three observations that are not defects against any acceptance criterion but that the judge may want on the record:

1. A finished table with both seats still filled keeps broadcasting: 148 snapshots in 5 s (29.6/s) with the score frozen at 2-11 and the winner line up. Two players who finish and walk away with tabs open hold a 30 Hz loop and a resident Durable Object indefinitely. AC3/AC5 tie the loop to seat count, not phase, so this is exactly what the plan asks for, and it is unchanged from before the work item — but it is the same billing shape the Intent section describes.

2. A player refused by the rate limit sees "Lost the connection to table X." (verified by setting `CF-Connecting-IP` on the browser context and burning that address's allowance first: the handshake returns 429 and Chromium reports only "Unexpected response code: 429"). The wording is misleading for a connection that never opened, and the chooser does not return — but the browser WebSocket API cannot expose the status code, and "the chooser returning after a refusal" is a declared non-goal, so there is nothing to fix in the client here.

3. On C4: `https://pong-3su.pages.dev` really does serve this repository's bundle today, so the allow-list names the right host. `https://pong.pages.dev` — the URL in the README's deploy table (line 113) — serves an unrelated "Impossible Pong!" page belonging to somebody else, and an upgrade carrying that origin is refused 403 by the shipped config. That table line predates this change (introduced in fe3490a), so it is stale documentation rather than a defect in this diff, but a user following it lands on a different application. `https://pong-table.joelstevick.workers.dev` returns Cloudflare's 404, confirming the Worker is still undeployed.

Local state touched: `dist/` was rebuilt (gitignored) and restored to a default `vite build`; `.wrangler/` local Durable Object state grew from the probing (also gitignored). `git status` is clean.

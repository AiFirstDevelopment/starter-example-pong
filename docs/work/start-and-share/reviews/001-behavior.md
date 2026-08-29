# Review 001 — behavior

- Lens: behavior
- Verdict: findings
- Diff range: `5012fe0...HEAD`

## Findings

### F1 (minor)

**Claim:** Creating a table does not put the table id in the address bar, so a reload silently abandons the table and the obvious recovery mints a different one — leaving both players waiting forever at different tables with no indication.

**File:** `src/main.ts:431`

**What:** The `create-table` click handler mints an id, joins it, and renders the invite URL, but never updates `window.location`/`history`. The generated id then exists only in the live DOM of a page that a phone browser routinely reloads when it is backgrounded — which is exactly what the feature asks the player to do (leave the browser to send the link).

**Failure scenario:** Observed end to end against the running app. 1) Open http://localhost:4173/ -> chooser. 2) Click "Create a table" -> status `You have the left paddle. Waiting for another player at table atomic-bird-616.`, invite row shows `http://localhost:4173/?table=atomic-bird-616`, address bar still `http://localhost:4173/`. 3) Reload the page (a backgrounded tab being restored on a phone does the same) -> status reverts to `Choose single player, or join a table by its id` and the chooser reappears; `atomic-bird-616` now exists nowhere on the page and the `#table-id` field is empty. 4) The player presses "Create a table" again -> `voluminous-salamander-255`, a different table. 5) The friend opens the link that was already sent -> `You have the left paddle. Waiting for another player at table atomic-bird-616.` Both browsers now sit at `Waiting for another player` at two different tables indefinitely and neither is told anything is wrong. With a hand-typed id the player could retype it; a generated id is unrecoverable from the page. (Note for weighing: the address bar is left at `/` for typed joins too, which is pre-existing from `multi-player`, and `Rejoining` is a listed non-goal — but the generated-id path is the one where the id is irrecoverable and where pressing the same button again makes it worse rather than better.)

**Suggested direction:** After `startTable(tableId)` in the create handler (and, for consistency, the typed-join handler), `history.replaceState` the page to the same URL the invite row displays, so a reload lands back at the table the player is waiting at rather than at the chooser.

### F2 (nit)

**Claim:** The status line shown above the chooser still names only two ways in, omitting the "Create a table" control this change added directly beneath it.

**File:** `src/status.ts:1`

**What:** With the chooser up, `#status` reads `Choose single player, or join a table by its id` while the form immediately below it offers three controls: `Single player`, `Create a table`, `Join table`.

**Failure scenario:** Observed: open http://localhost:4173/ in Desktop Chrome. `#status` textContent is `Choose single player, or join a table by its id`; `#choose button` textContents are `['Single player', 'Create a table', 'Join table']`. The same stale line reappears whenever the chooser is shown again — e.g. after submitting a whitespace-only id, and after the reload in F1. A player reading the instruction is told the only way to a table is "by its id", which is the typing the plan's AC5 exists to remove, and the sentence actively steers them away from the new primary path.

**Suggested direction:** Update the chooser line to name the third option, e.g. `Choose single player, create a table, or join one by its id`.

## Notes

Drove the built artifact: `vite build` (VITE_TABLE_URL=ws://127.0.0.1:8787) + `vite preview` on :4173, plus a real `npx wrangler dev --config worker/wrangler.toml --port 8787 --local` Durable Object. Operated with real Chromium contexts (Pixel 5, Desktop Chrome, iPhone SE viewport) and real CDP touch events; two browser contexts for the table paths. AC1-AC10 all reproduced as written and are reported in the message body. Servers stopped afterwards; `git status` clean, nothing in the tree modified (dist/ is gitignored). AC11 (the suite) was left to the tests lens, since this lens is told not to fall back to a test harness. The two findings below are the only places where driving the app as a user produced a result that misleads the player.

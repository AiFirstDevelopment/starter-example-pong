# Review 002 — correctness

- **Lens:** correctness
- **Verdict:** findings
- **Diff range:** 17af241...HEAD

## Findings

### F1 — major

**Claim:** The shipped `ALLOWED_ORIGINS` does not contain the origin this repository's own deploy script and README say the page is served from, so a deploy done as documented refuses every player.

**Location:** `worker/wrangler.toml:18`

**What:** `ALLOWED_ORIGINS` admits only `https://pong-3su.pages.dev` (plus one-label previews of it and the four localhost dev origins). But `package.json` line 19 deploys the site with `wrangler pages deploy dist --project-name=pong`, and `README.md` line 113 states the page lives at `https://pong.pages.dev` (project `pong`). The two names are not the same host, and nothing in the repo reconciles them — the new unit test at `tests/unit/origins.test.ts:7` hardcodes the same string as the config, so it cannot catch the mismatch, and `tests/e2e/entry.spec.ts:31` does the same.

**Failure scenario:** Run `npm run deploy` exactly as `README.md` documents. The site goes to Pages project `pong`; a player opens it and joins a table. The browser sends `Origin: https://pong.pages.dev` on the upgrade to `wss://pong-table.joelstevick.workers.dev` (the address `.env.production` bakes in). `originAllowed` finds no exact entry and the wildcard suffix `.pong-3su.pages.dev` does not match, so `worker/table.ts:371` returns 403 before `env.TABLE.get(...)`. The handshake fails, `joinTable`'s close handler fires `onLost`, and every player on the deployed site sees `Lost the connection to table <id>.` with nothing naming the cause. Multiplayer is dead on arrival, and AC6's "one carrying the site's canonical origin ... is accepted" is false in production. Conversely, if `pong-3su.pages.dev` is the true host, then README line 113 and the `--project-name=pong` in `deploy:site` are the stale half and will mislead the next deploy.

**Suggested direction:** Resolve which host is real before `deploy:table` is run, then make the repo say it once: correct README line 113 and `deploy:site`'s `--project-name`, or correct the allow-list. Deriving the e2e/unit fixture from `worker/wrangler.toml` rather than restating the string would keep the two from drifting again.

### F2 — minor

**Claim:** `withinRate` fails closed on a throwing limiter, contradicting the fail-open policy its own doc comment states, and turning a transient binding error into a refused upgrade.

**Location:** `worker/limit.ts:79`

**What:** The comment on lines 59-66 says there are "Two ways to get no answer, and both fail **open** ... a check that cannot be made is not a failed check." Only two are handled: `limiter === undefined` and `key === null`. A third — `limiter.limit({ key })` rejecting — is not caught. The rejection propagates out of `withinRate`, out of the `await` at `worker/table.ts:374`, and out of the entry's `async fetch`, which the Workers runtime turns into a 500.

**Failure scenario:** `env.LIMITER` is bound and under the allowance, but the binding's RPC to the edge counter fails transiently and `limit()` rejects. The entry `fetch` rejects, the runtime answers the upgrade with 500 instead of forwarding to `env.TABLE.get(...)`. Both players trying to join at that moment get a failed WebSocket handshake, `joinTable` reports `onLost`, and each sees `Lost the connection to table <id>.` — a refusal caused by the check being unavailable, which is exactly the outcome the module documents itself as never producing. There is also no log or distinct status, so the cause is invisible.

**Suggested direction:** Wrap the `limiter.limit` call in a try/catch and return `true` on a throw, so all three ways of getting no answer behave the way the comment describes; add a unit case in `tests/unit/limit.test.ts` with a limiter whose `limit` rejects.

## Notes

Ran `npx tsc --noEmit`, `npx tsc --noEmit -p worker` (both clean) and `npx vitest run` (88/88 pass) as supporting evidence. I did not run the Playwright suite — that is the behaviour lens's remit, and building would have written artifacts into the tree. Areas verified clean and not reported: the `rematch` seat check and its `started === this.game` no-op guard (confirmed against `startGame` and `step`'s identity returns for `serving`/`rally`/`game-over`); the conditional-loop invariant in `seat`/`vacate` including double-`vacate` from paired close+error events and `lastTickMs`/`accumulator` reset on restart; the removed `seats.size === 2` branch in `simulateAndBroadcast` being genuinely unreachable; `originAllowed` against forged hosts, `null`, missing and empty allow-lists, wrong scheme/port and multi-label wildcards; `parseClientMessage` against arrays, non-strings and near-miss rematch shapes; the reordered guards in `start()` (no reachable regression — `Mode` is a closed three-value union and `tableStatusText` keys off `connection`, not `phase`); and the lone-player rematch, which is reachable but converges to the same game state a second arrival would produce.

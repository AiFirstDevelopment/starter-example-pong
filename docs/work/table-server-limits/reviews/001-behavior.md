# Review 001 — behavior

- **Lens:** behavior
- **Verdict:** findings
- **Diff range:** 844d8bc...HEAD

## Findings

### F1 — minor

**Claim:** The built client's heartbeat actually goes out every 2000 ms, not the 1000 ms that HEARTBEAT_INTERVAL_MS and the README both state, because the interval's own tick is thrown away by the elapsed-time guard.

**Location:** `src/net/table.ts:128`

**What:** observed rate of the {kind:'alive'} frames a parked browser sends

**Failure scenario:** Driving the built bundle (vite preview) at a real wrangler dev table and timestamping every frame the page sends (Playwright websocket 'framesent'), a browser parked at a table for 30 s sent 18 'alive' frames with gaps of min 1000 ms, median 2000 ms, max 2000 ms — i.e. the beat is 2 s, not 1 s. The setInterval tick that arrives ~999 ms after the previous beat fails `now - lastSpokeMs < HEARTBEAT_INTERVAL_MS` and is discarded, so every other tick is lost. Two consequences: the README's "their browser beats once a second when it has nothing else to say" is untrue of the shipped client, and the slack the shipped behavioural configuration depends on (TEST_LIVENESS_TIMEOUT_MS = 5000 in tests/e2e/support/table.ts, passed to the suite's server in playwright.config.ts) is 2.5 beat periods rather than the 5 the 1 s constant implies — a page whose timers stall ~3 s past a normal gap on a loaded CI machine puts its last beat over 5000 ms in the past, loses its seat mid-game and shows "Lost the connection to table …", which is the AC2 failure. Production's 90 s timeout is not at risk from this: I confirmed a beating client survives 115 s there and a mute one is dropped at 90.5 s.

**Suggested direction:** Either compare against a fraction of the interval (e.g. beat when `now - lastSpokeMs >= HEARTBEAT_INTERVAL_MS / 2`), or run the timer at a shorter tick than the stated beat, so the beat lands at the documented rate; alternatively correct the README and the constant's comment to say what the client actually does.

## Notes

Ran the real artifact only: `npm run build`, `vite preview` on 4174 serving the built bundle, `wrangler dev` on 8899 (IDLE 30 s / LIVENESS 5 s, ALLOWED_ORIGINS from wrangler.toml plus http://localhost:4174) and on 8898 with the production defaults. Players were real headless Chromium pages plus raw `ws` clients speaking the wire protocol; no project test was used as evidence and no source was modified. AC5 (no Durable Object addressed for a refused request) and AC6 (Table.rematch's seat check) are by construction invisible from outside the Worker, so this lens cannot speak to them. All other criteria held as described in the summary, including the two paths a browser cannot fake — a frozen browser process tree and a cut context network — both of which produced the eviction, the "Your opponent left." line for the survivor, and a clean rejoin afterwards. Servers stopped, dist/ rebuilt with the default env, working tree unchanged.

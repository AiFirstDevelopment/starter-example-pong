# Review 004 — security

- Lens: security
- Verdict: clean
- Diff range: `5012fe0...HEAD`

## Findings

None.

## Notes

Working tree is clean; the range is the two commits e1d0c32 and e249e8c. Nothing under worker/ changed, so the server-side authorization surface (Origin allow-list in worker/origins.ts, rate limit in worker/limit.ts, the refusal path in worker/table.ts fetch) is untouched by this change.

What I checked and found sound:

- Injection/XSS. The two new sinks are /Users/joelstevick/projects/starter-example-pong/src/main.ts:150 (`inviteUrl.textContent = url`) and :157 (`inviteNote.textContent = ''`). Both are textContent, never innerHTML. The one attacker-influenced value that reaches them is `session.tableId`, which for a `?table=` arrival is an arbitrary string of up to 64 characters out of `normaliseTableId`; it is percent-encoded by `encodeURIComponent` in `tableLink` (src/session.ts:69) before being concatenated, so a crafted id cannot break out of the query string or inject markup. No innerHTML, eval, document.write, JSON.parse of untrusted input, or console logging anywhere in the added code.

- Link construction. `tableLink` builds from `location.origin + location.pathname` only, so it cannot be pointed at another origin, and it deliberately drops any other query parameters the visitor arrived with. The clipboard/share payload is therefore always same-origin and always percent-encoded — no clipboard-injection via newlines in a table id (they encode to %0A).

- Error handling in src/share.ts. `shareLink` swallows the underlying rejection and `shareNote` returns fixed strings ('Link copied.', 'Copying is not available here. …'); no exception message, permission name or platform detail reaches the DOM. `browserTargets` checks `navigator.clipboard?.writeText` as an object-and-method check, so an insecure context degrades to 'unavailable' rather than throwing.

- Dependency. unique-names-generator@4.7.1 is the first runtime dependency. I verified from the installed package: MIT, zero dependencies, no install/postinstall scripts, `sideEffects: false`, and the lockfile pins 4.7.1 with a registry-resolved sha512 integrity. The lockfile root now matches package.json exactly (including the pre-existing `engines`), i.e. it was regenerated rather than hand-edited. I independently checked the plan's claim that the dependency does not reach the Durable Object, rather than taking it on trust: bundling worker/table.ts with the repo's own esbuild produces 8,697 bytes containing no dictionary word and no `uniqueNamesGenerator`/`NumberDictionary` symbol, so the third-party code stays client-side.

Two things I considered and deliberately did not file as findings, with the reasoning, in case they are useful to route elsewhere:

1. `generateTableId` (src/net/protocol.ts:120) derives the table id — which worker/limit.ts calls "the only credential" — from `Math.random()` (confirmed in node_modules/unique-names-generator/dist/index.js: both the word pick and `NumberDictionary.generate`). I could not construct a practical attack: the id space (~2^28.5) rather than the PRNG is the binding constraint, that space is an explicit approved acceptance criterion (AC6 asks only for >=100 million), an attacker has no oracle on the victim realm's Math.random stream, and enumeration goes through the existing per-/64 rate limit. Filing it would be arguing with the plan, not reporting a defect.

2. The corpus is not curated against unfortunate pairings, contrary to the rationale in the plan and in the docstring at src/net/protocol.ts:110 ("choosing which words go in is exactly the part a hand-rolled list gets wrong"). `adjectives` contains naked, wet, dirty, hard, stiff, loose, filthy, fat, stupid, ugly; `animals` contains beaver, booby, swallow, cow, rat, so `naked-beaver-417` or `fat-cow-233` are reachable outputs the page asks a player to send to a friend. Roughly 1 in 5,000–20,000 creations, cosmetic rather than security, so it is out of my lens and below my reporting bar.

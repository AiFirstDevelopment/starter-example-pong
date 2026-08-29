# Review 004 — security

- **Lens:** security
- **Verdict:** clean
- **Diff range:** `86e6953...HEAD`

## Findings

None.

## Notes

Reviewed 86e6953...HEAD (commits 3502cad, 252d687; working tree clean). The change is a static 64-word blocklist in /Users/joelstevick/projects/starter-example-pong/src/net/words.ts, a pure filter over two constant arrays, a wiring change in generateTableId, plus README/docstring text and tests. Checked each item in the remit: (1) Injection — the blocklist is a hardcoded literal, no user-controlled data reaches withoutBlockedWords, and membership uses a Set rather than object key lookup so a corpus entry such as __proto__ could not confuse it. (2) Unsafe deserialization — parseClientMessage and normaliseTableId in src/net/protocol.ts are unchanged in this range apart from the import line at protocol.ts:19. (3) AuthZ — worker/limit.ts states "a table id is the only credential", so id entropy is a genuine security property. I ran the filter against the installed unique-names-generator 4.7.1 and confirmed 1202x355x900 = 384,039,000 becomes 1167x326x900 = 342,397,800: a loss of roughly 0.17 bits (11%) against a per-/64 edge rate limit on table creation. I could not construct a concrete failure scenario from that, so I did not report it. (4) Secrets and sensitive data — nothing added to logs or error paths; docs/work/vet-the-word-list/state.json holds only timestamps, a requirements hash and commit ids. (5) Dependency risk — package.json and package-lock.json are unchanged in the range, words.ts imports only unique-names-generator which protocol.ts already imported, and dist/ plus .wrangler/ are gitignored so no stale bundle carrying the unfiltered corpus is committed. Deliberately left to other lenses: several words a content-safety reading might object to survive the cut (xenophobic, racial, handicapped, chubby, scrawny, grotesque), and the build note's claim that the two corpora are disjoint is false — "sole" and "swift" appear in both, though neither is blocklisted so the counts are unaffected. Both are requirements/correctness questions rather than security ones.

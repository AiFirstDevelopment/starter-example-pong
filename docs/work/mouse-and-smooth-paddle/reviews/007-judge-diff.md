# Review 007 — judge-diff

- **Lens:** judge-diff
- **Verdict:** findings
- **Diff range:** `7683a35..89aa4c9 (state.json review.head..verdict.head)`

> **Scope note:** This review covers the judge's own adjudication commits — the
> changes made during adjudication, which no other lens saw. No other review in
> this directory examined this diff range.

## Findings

### F1 — major

**Claim:** The judge's adjudication commit (89aa4c9) does not actually commit the adjudication outcome to state.json, even though the same commit ships verdict.md and the review files describing that outcome.

**Location:** `docs/work/mouse-and-smooth-paddle/state.json:4`

**What:** `git show 89aa4c9:docs/work/mouse-and-smooth-paddle/state.json` shows `"stage": "reviewed"`, `"updated": "2026-08-26T16:53:21Z"`, no `review` block, no `verdict` block, and a log that ends at `"panel complete, adjudication started"` — i.e. the pre-adjudication snapshot. The fully updated version (`stage: adjudicated`, `review.head: 7683a35`, `verdict.head: 89aa4c9`, `verdict.accepted/rejected/unmet/escalations`, and the closing log line `"4-quorum adjudicated ready with follow-ups..."`) exists only as an uncommitted working-tree edit (`git status` shows ` M docs/work/mouse-and-smooth-paddle/state.json`, timestamped 6 seconds after the commit). The commit that titles itself 'Adjudicate the mouse and smoothing build' and whose message recites the full verdict (accepted/rejected counts, escalations, AC1 partly unmet) never actually persisted that record to the one file whose job is to persist it.

**Failure scenario:** This very review task's own instructions say to compute the diff range from `review.head`/`verdict.head` in state.json, falling back to scanning `reviews/` only if those fields are absent. A fresh checkout of `89aa4c9` (CI, a clone, `git clean`, or any tool that reads state.json from git rather than trusting a stray local edit) finds neither field — the pipeline looks like adjudication never finished. A gate that waits for `stage == "adjudicated"` before opening a PR, or a next-round reviewer computing the diff range the way this task's own instructions specify, would stall or silently fall back to the wrong range, because the source of truth in git still says `"stage": "reviewed"` with no verdict recorded.

**Suggested direction:** Amend/land a follow-up commit that includes the working-tree state.json update (or re-run whatever step writes it) so the committed history actually reflects the adjudication that verdict.md and the commit message already describe.

## Notes

Reviewed the single commit in review.head..verdict.head (7683a35..89aa4c9), i.e. all of `89aa4c9`'s payload: src/render.ts, tests/e2e/mouse.spec.ts, tests/e2e/smoothness.spec.ts, tests/e2e/support/pong.ts, docs/work/mouse-and-smooth-paddle/{plan.md,verdict.md,state.json,reviews/*}.

Verification performed, all clean:
- The render.ts fix (scoping the interpolation cut to `ball` only, leaving `playerY`/`cpuY` always mixed) is correct: confirmed via src/game/state.ts and src/game/step.ts that no phase transition (startGame/beginServe/serve/game-over) ever touches playerY or cpuY, so unconditional paddle interpolation across a cut is sound for both the player and CPU paddle (no twin-path guard gap).
- Reverted src/render.ts to the pre-adjudication version and reran the new AC5 test (`tests/e2e/smoothness.spec.ts:107`) — it fails with `unevenness` = 4 against the unfixed code, exactly as the verdict claims, confirming the test is load-bearing rather than tautological.
- Restored the file (byte-identical, `git diff` clean) and reran full suite: `npm run test:unit` → 38/38 pass; `npx playwright test` → 27/27 pass; `npx tsc --noEmit` → clean. Ran the new AC4/AC5 e2e tests three times in a row with no flakiness.
- Independently replayed the fixed-timestep loop (via vite-node importing src/game/state.ts and src/game/step.ts directly, modeling main.ts's accumulator including the `previousFrameMs === null` first-frame quirk) for seeds 1-10: every first scored point lands in a frame that consumes two simulation ticks, matching the judge's plan.md correction note's factual claim (and specifically reproducing frame 70/seed 7 and frame 69/seed 9 as stated) — so that documentation addition holds up under independent replay.
- Diffs to tests/e2e/mouse.spec.ts and tests/e2e/smoothness.spec.ts are pure appends (no existing assertion lines touched); Box.width removal from tests/e2e/support/pong.ts left no dangling references (`grep -rn "\.width" tests/e2e/`).
- Cross-checked the verdict.md disposition table and Counts line against state.json's verdict block and the six reviews/*.md files' own severities — internally consistent (9 real findings + 1 "clean" security placeholder row, 5 accepted/3 rejected-to-follow-up/1 escalated-from-lenses, matching accepted:5/rejected:3/escalations:3 with the builder's 2 PLAN DEFECTs).

The one defect reported (F1) is a commit-hygiene/state-integrity issue in the judge's own bookkeeping, not in the shipped game code.

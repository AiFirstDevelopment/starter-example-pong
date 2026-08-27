# Review 007 — judge-diff

- **Lens:** judge-diff
- **Verdict:** findings
- **Diff range:** a506694..8f059d6 (state.json review.head..verdict.head; a single commit, 8f059d6, falls in this range)

> **Scope note:** This review covers the judge's own adjudication commits, which no other lens saw.

---

## Findings

### F1 — major

**Claim:** The judge's adjudication commit (8f059d6) never actually commits the adjudicated outcome to state.json, even though the same commit ships verdict.md, six review files, and a plan.md status line all asserting the work is adjudicated.

**Location:** `docs/work/landscape-phone-layout/state.json:4`

**What:**

`git show 8f059d6:docs/work/landscape-phone-layout/state.json` shows `"stage": "reviewed"`, no `review` block, no `verdict` block, and a log ending at "panel complete, adjudication started" — the pre-adjudication snapshot. Meanwhile the same commit 8f059d6 sets plan.md's `Status:` field to `adjudicated` and ships verdict.md reciting the full disposition (7 accepted, 2 rejected, 0 unmet, 2 escalations). The fully-updated state.json — `stage: adjudicated`, `review.head: a506694`, `verdict.head: 8f059d6`, the verdict block, and two closing log lines — exists only as an uncommitted working-tree edit (`git status --porcelain` shows ` M docs/work/landscape-phone-layout/state.json`, and its mtime is one second after the commit's own timestamp, i.e. a scribe wrote it right after the commit but the judge never `git add`/`git commit`-ed it).

This is not a one-off: this exact defect has already occurred, been caught by a judge-diff review, and been fixed with a dedicated follow-up commit twice before in this same repository's history — commit c2ad618 for `mouse-and-smooth-paddle` ("the adjudication commit shipped verdict.md and the review files but left the matching state.json edit in the working tree") and commit 0d2bd2c for `mobile-touch-controls` ("the immediately preceding work item on this same branch tree hit the identical defect... whose message states verbatim..."). Both prior fix commits were themselves triggered by a `007-judge-diff.md` review scoring this exact omission as a major finding. No such follow-up or judge-diff review yet exists for `landscape-phone-layout` (`docs/work/landscape-phone-layout/reviews/` has only 001–006), so the same class of omission has recurred a third time, uncaught until now.

**Failure scenario:**

A fresh `git clone`/`git checkout` of this branch at HEAD (8f059d6) — as happens when the PR is opened, when CI checks it out, or when any tool trusts git rather than a stray local edit — shows `docs/work/landscape-phone-layout/state.json` with `"stage": "reviewed"` and no `review`/`verdict` blocks, directly contradicting the committed `plan.md`'s `Status: adjudicated` line and the committed `verdict.md`'s claims. I hit this directly while computing my own review range: this review task's own instructions say to compute the diff range from `review.head`/`verdict.head` in state.json, falling back to scanning `reviews/` only if those fields are absent — and those fields are genuinely absent from the committed history, only present by accident in the local working copy I happened to be handed. Any automation that gates on `stage == "adjudicated"`, or that computes a review's diff range the way this very task's instructions specify, finds neither field in the committed history and either stalls or silently falls back to the wrong range — exactly the failure mode the two prior occurrences' fix commits were written to prevent.

**Suggested direction:**

Land a follow-up commit — mirroring c2ad618 and 0d2bd2c on the sibling branches — that commits the working-tree state.json edit (stage: adjudicated, review.head: a506694, verdict.head: 8f059d6, the verdict block, and the two trailing log lines) so the committed record in git actually matches what verdict.md and the commit message already describe. Given this is the third occurrence of an identical, previously-diagnosed defect, it may also be worth fixing the pipeline step itself (the commit step should stage and commit whatever the scribe just wrote, or fail loudly if it can't) rather than relying on a judge-diff review to catch it each time.

---

## Notes

Reviewed the single commit in review.head..verdict.head (a506694..8f059d6), i.e. 8f059d6's full payload: src/style.css, tests/e2e/support/pong.ts, tests/e2e/touch.spec.ts, and the docs files (plan.md, verdict.md, reviews/001-006, state.json).

Verification performed on the shipped code/tests, all clean — no defects found there:
- Ran the full suite without modifying any tracked file (`git status --porcelain` clean before and after): `npm run build` (tsc --noEmit + vite build) clean; `npx vitest run` 41/41 pass; `npx playwright test --project=chromium` 27/27 pass; `npx playwright test --project=mobile-chrome tests/e2e/touch.spec.ts` 17/17 pass.
- Reproduced all three mutation-testing claims the judge cites in verdict.md, each restored byte-identically afterward (`diff` confirmed): (1) reverting `canvas { flex: 0 1 auto }` to the plan's `flex: 1 1 auto` fails the new landscape-AC3 viewport sweep at 300x460 (measured ratio deviation 0.875, matching the verdict's 0.79 claim); (2) reverting `.hint` from the clip-path technique back to `display: none` fails the new "still announced" aria-snapshot test exactly as claimed; (3) adding `.hint { margin-bottom: 118px }` fails the iPhone SE `belowTheScreen` check at 46.375px, matching the verdict's figure precisely.
- Checked `courtBox`'s new `width` field for collateral damage: grepped all `courtBox` call sites in mouse.spec.ts/smoothness.spec.ts, none does object-equality on the returned box, so the added field is safe; `courtSize` was fully removed with no dangling references (confirmed via `tsc --noEmit`, which has `noUnusedLocals`/`noUnusedParameters` and covers `tests/`).
- Checked for guard-gap/twin-path patterns (the AC2 `toBeVisible()` fix, the `belowTheFold`/`belowTheScreen` split, the `.hint` CSS technique) — found no case where a fix was applied on one path/selector and not its analog; `overflow()` (AC1's literal measure) was deliberately left unchanged and `belowTheScreen` added alongside it rather than replacing it, which is a correct choice given AC1's wording, not a suppressed twin.

The one defect I could substantiate with a concrete failure scenario is the state.json inconsistency (F1), which is a commit-hygiene/state-integrity issue in the judge's own bookkeeping, not in the shipped game code — but it is a real, reproducible defect in the commit under review, not a matter of taste.

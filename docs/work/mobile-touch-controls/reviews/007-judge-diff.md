# Review 007 — judge-diff

- **Lens:** judge-diff
- **Verdict:** findings
- **Diff range:** `7a5b954..e649550 (state.json review.head..verdict.head; a single commit, e649550, falls in this range)`

> **Scope note:** This review covers the judge's own adjudication commits — the changes made during and after adjudication, which no other lens on the panel saw. It is appended to the review record after the panel's reviews (001–006) and is judged on the same terms.

---

## F1 — major

**Claim:** The judge's adjudication commit (e649550) never actually commits the adjudicated outcome to state.json, even though the same commit ships verdict.md, six review files, and a plan.md status line all asserting the work is adjudicated.

**Location:** `docs/work/mobile-touch-controls/state.json:4`

**Severity:** major

### What

git show e649550:docs/work/mobile-touch-controls/state.json shows "stage": "reviewed", no `review` block, no `verdict` block, and a log ending at "panel complete, adjudication started" -- i.e. the pre-adjudication snapshot. Meanwhile the same commit e649550 sets plan.md's `Status:` field (plan.md:5) to `adjudicated`, and ships verdict.md reciting the full disposition (2 accepted, 1 rejected, 1 unmet, 2 escalations). The fully-updated state.json -- `stage: adjudicated`, `review.head: 7a5b954`, `verdict.head: e649550`, the verdict counts, and the closing log lines including '4-quorum head corrected to e649550...guard clean' -- exists only as an uncommitted working-tree edit (`git status` shows ` M docs/work/mobile-touch-controls/state.json`). verdict.md itself acknowledges this at line 3-4 ('Adjudicated: ddd7c34...HEAD ... plus the working tree, which was clean apart from state.json'), so the judge was aware the file was left dirty and shipped the commit anyway. This is not a one-off: the immediately preceding work item on this same branch tree hit the identical defect and required a dedicated follow-up commit to fix it -- commit c2ad618 ('Commit the adjudicated state and the judge-diff review'), whose message states verbatim 'The adjudication commit shipped verdict.md and the review files but left the matching state.json edit in the working tree, so the record in git still read stage: reviewed with no review or verdict block. That is the judge-diff lens's own F1.' The same class of omission recurs here, uncaught until now.

### Failure scenario

A fresh `git clone`/`git checkout` of this branch at HEAD (e649550) -- as happens when the PR is opened, when CI checks it out, or when any tool trusts git rather than a stray local edit -- shows docs/work/mobile-touch-controls/state.json with `"stage": "reviewed"` and no `review`/`verdict` blocks, directly contradicting the committed plan.md's `Status: adjudicated` line and the committed verdict.md's claims. Any automation that gates on `stage == "adjudicated"`, or that computes a review's diff range from `review.head`/`verdict.head` the way this very review task's own instructions specify, finds neither field in the committed history and either stalls or silently falls back to the wrong range -- exactly the failure mode the prior occurrence's fix commit (c2ad618) was written to prevent.

### Suggested direction

Land a follow-up commit -- mirroring c2ad618 on the sibling branch -- that commits the working-tree state.json edit (stage: adjudicated, review.head: 7a5b954, verdict.head: e649550, the verdict/guard blocks and the two trailing log lines) so the committed record in git actually matches what verdict.md and the commit message already describe.

---

## Notes

state.json's review.head/verdict.head fields were present and used to compute the range (7a5b954..e649550), which contains exactly one commit, e649550 ("Guard the AC5 test against going quietly vacuous"). I reviewed that commit's full diff (test scaffolding in tests/e2e/support/pong.ts and tests/e2e/touch.spec.ts, plus docs) and separately confirmed the working-tree state noted in F1 via `git status`/`git diff`, since it is directly implicated by an internal inconsistency inside e649550 itself (plan.md's committed Status vs. state.json's committed stage). I ran the actual suites without modifying any tracked file (verified clean via `git status` before/after): `npx tsc --noEmit` clean; `npx vitest run` 41/41 passed; `npx playwright test --project=chromium` 27/27 passed; `npx playwright test tests/e2e/touch.spec.ts --project=mobile-chrome` 9/9 passed, and the new AC5 premise-guard assertion held under 8/8 repeats with no flakiness. I found no defect in the test-code fix itself (the touchMoves counter, the AC5 guard assertion, or the touchDrag signature narrowing) -- it behaves as the commit message describes and its `touchDrag` change has exactly one call site, matching the removed-guard justification. The only defect I could substantiate with a concrete failure scenario is the state.json omission in F1.

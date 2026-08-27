# Review: spec-fidelity

- Lens: spec-fidelity
- Verdict: findings
- Diff range: 42e7afc...HEAD

## Findings

### F1 — minor

**Claim:** The Build notes justify hiding the hint by asserting it "is still read to a screen reader"; `display: none` removes it from the accessibility tree entirely, so the justification is false exactly where it is being made.

**Location:** docs/work/landscape-phone-layout/plan.md:294

**What:** "Left out deliberately" records: "No change to `index.html`. The hint is hidden by CSS rather than removed, so it is still read to a screen reader and still there when the phone is turned upright". The implementing rule is `.hint { display: none }` at src/style.css:191, inside `@media (max-height: 480px)`. `display: none` content is excluded from the accessibility tree, not merely painted-out.

**Failure scenario:** Verified against the built app served from the repo's own preview server. `page.locator('body').ariaSnapshot()` in a Pixel 5 context at viewport 802x293 returns only: main > heading "Pong", paragraph "Player 0 - 0 Computer", status "Press any key to start", paragraph > button "Sound on". The "Drag the court, move the mouse, or use ..." paragraph is absent. The same snapshot at 393x727 does contain it. Concrete consequence: a TalkBack user on a Pixel 5 held sideways swipes through the whole page and is never told how to move the paddle, how to start, or that M toggles sound - while the build record tells a reviewer that exact content is still announced. The plan's own Non-goals reject the overlay layout specifically to protect a screen-reader affordance, so a false accessibility claim in the build record is load-bearing for the judge's read of this trade-off.

**Suggested direction:** Either correct the note to say the hint is dropped from the accessibility tree in landscape and that this was accepted, or keep it announced with a visually-hidden technique (clip-path/1px inset rather than `display: none`) if the announcement is wanted. The visual outcome S1 asks for is unaffected either way.

### F2 — nit

**Claim:** Approach claim C5 cites the wrong line for the superseded assertion.

**Location:** docs/work/landscape-phone-layout/plan.md:135

**What:** C5 states "The superseded assertion lives at `tests/e2e/touch.spec.ts:152`". At the base commit 42e7afc, `expect(await computedStyle(page, '#court', 'touch-action')).toBe('none')` is at line 162; line 152 is `expect(await paddleAt(page, 'player')).toEqual(AGAINST_THE_TOP);`, an unrelated assertion inside the AC2 drag test. The rest of C5 - what the assertion checks, and that only the touch-action half changes while overscroll-behavior stays - is accurate and matches the diff.

**Failure scenario:** `git show 42e7afc:tests/e2e/touch.spec.ts | grep -n touch-action` returns line 162, not 152. A reviewer or future work item following the citation to line 152 lands on the AC2 paddle-position assertion and would conclude either that the claim describes a different assertion or that the file moved under it. The Build notes' "Claim corrections" section corrects C6's arithmetic and C3's court size but leaves this one standing.

**Suggested direction:** Correct C5 to `tests/e2e/touch.spec.ts:162`, or record it alongside the other two claim corrections.

## Notes

Verification performed against the built app (dist served by the already-running `vite preview` on :4173, whose CSS I confirmed byte-for-byte matches the working tree, including the new media query). The repository tree was not modified; `git status --porcelain` is empty and HEAD is still a506694. Measurement scripts and a Playwright config override (reuseExistingServer) were written only to the session scratchpad.

ACs, all measured rather than inferred:
- AC1: 802x293 -> scrollHeight - innerHeight = 0. Swept 154 viewport combinations with innerHeight <= 480 (widths 120-1024 x heights 180-480) under Pixel 5 emulation plus six Desktop Chrome contexts (802x293, 1280x400, 600x480, 400x300, 1024x479, 320x240): zero vertical or horizontal overflow in every one.
- AC2: at 802x293 .scoreboard, #player-score, #cpu-score, #status and #mute are all fully inside the viewport on both axes.
- AC3: aspect 1.6666 at 802x293; no viewport in the sweep deviates from 800/480 by more than 0.02 (worst case 0.0076, the pre-existing 1px-border effect in portrait).
- AC4: window.scrollTo(0, 500) leaves scrollY at 0.
- AC5: Pixel 5 upright 361.00 x 217.39 (rounds to 361x217), iPhone SE viewport 320x568 reporting inner 348x618 -> 288.00 x 173.59 (rounds to 288x174), hint visible in both, no overflow. The S6 deviation about 348x618 vs a literal 348x618 viewport checks out.
- AC6: computed touch-action is pinch-zoom; the meta viewport has no maximum-scale/user-scalable, so pinch zoom is genuinely returned.
- AC7: 43/43 Playwright (27 chromium, 16 mobile-chrome) and 41/41 vitest pass locally; the only modified existing assertion in the diff is the sanctioned touch-action value. Installed Playwright is 1.62.1, matching the CI image the build notes name.
- AC8: landscape drag test passes with missedBy <= 1 court unit.

Approach claims: C1 true (base src/style.css has no @media and no vh/dvh). C2 supported (every pre-existing drag test passes unchanged). C3 and C6 are wrong as written in Approach but both are explicitly corrected in Build notes, and I confirmed the corrections independently - chrome measures 278.2 px (741 px page against a 462.8 px court), and the landscape court is 319.34 x 191.61 with aspect 1.6666 and zero overflow. C4 true (hint visible at 727 and 618, so the query does not match). C5 is F2.

PLAN DEFECT: reproduced exactly by injecting `flex: 1 1 auto` over the shipped rule at runtime - 284.0 x 358.6 (aspect 0.792) at 300x460, and an identical 319.3 x 191.6 at 802x293, so the plan's own reference viewport really does hide it. The shipped `flex: 0 1 auto` holds 1.667 across the whole sweep, including 120-180 px widths. The note's "nothing further" disposition holds; no escalation.

Non-goals: none built. No portrait redesign, no second landscape layout, no orientation lock/fullscreen/PWA, no change to any src/*.ts (simulation, physics, CPU, sound), and the court was not enlarged as a goal.

Not raised as findings: (a) AC2's parenthetical "the mute button sits at page y 650-685" measures 632.8-666.6 - the new test's own comment at tests/e2e/touch.spec.ts:431 uses the correct 633, and 650-685 is also internally inconsistent with AC1's 448 px overflow figure, but this is a descriptive figure rather than a numbered Approach claim and the criterion itself is met; (b) the media query also fires on a short desktop window (1280x400 hides the keyboard hint from a user who has a keyboard) - this is the height-keyed design the plan chose, and no AC or non-goal covers desktop.

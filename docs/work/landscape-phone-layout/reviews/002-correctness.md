# Review: correctness

- Lens: correctness
- Verdict: findings
- Diff range: 42e7afc...HEAD

## Findings

### F1 — major

**Claim:** Hiding `.hint` in the short-screen media query removes the only on-screen and only accessible statement of the touch controls and of tap-to-start, on exactly the device the layout targets — and the rule's stated justifications ("keyboard shortcuts", "still read to a screen reader") are both false.

**Location:** src/style.css:191

**What:** `@media (max-height: 480px) { .hint { display: none } }` suppresses `<p class="hint">Drag the court, move the mouse, or use ↑/↓ or W/S. Tap or click the court, or press any key, to start. M toggles sound. First to 11 wins.</p>` — the element that documents dragging and tapping, not just the keys.

**Failure scenario:** Measured against the running build at a Pixel 5 landscape viewport (802x293, `hasTouch`): the visible chrome is title, score, court, `#status` reading "Press any key to start", and the mute button. `.hint` computes to `display: none`, so `page.locator('.hint').isVisible()` is `false` AND the aria snapshot of `<body>` no longer contains the hint paragraph at all (I diffed the snapshot at 802x293 against 393x851 — the paragraph is present only in portrait). A first-time player on a phone held sideways is therefore told to press a key on a device that has no keys, with nothing on screen or announced telling them that tapping or dragging the court works — the instruction that mitigated this in portrait is gone. Two claims in the change are contradicted by this: the rule's own comment at src/style.css:189 ("A player holding a phone is not reading the keyboard shortcuts") describes only part of what it hides, and docs/work/landscape-phone-layout/plan.md:294-295 asserts "The hint is hidden by CSS rather than removed, so it is still read to a screen reader" — `display: none` removes the node from the accessibility tree, so a TalkBack user in landscape hears nothing of it. The same rule also fires on any short window regardless of input device: at Desktop Chrome 1280x460 I measured `.hint` computing to `display: none`, hiding the keyboard shortcuts from a user whose only input is a keyboard.

**Suggested direction:** Keep the hint in landscape in a compacted, one-line form (e.g. a shorter touch-only string, or `font-size`/`white-space` compaction) rather than `display: none`, or move the tap/drag instruction into `#status` for touch. Whatever is chosen, correct the two rationales — the comment at style.css:189 and the build note at plan.md:294 — since `display: none` is not screen-reader-visible and the hidden text is not only keyboard shortcuts.

## Notes

Could not run the project's own Playwright suite: port 4173 was already held by another agent's preview server and playwright.config.ts hardcodes `reuseExistingServer: false`. I verified behaviour instead with my own read-only Playwright scripts (in the scratchpad) driving the already-running build of this branch — geometry across 15 viewports, long-status reflow, aria snapshots, and CDP touch drags. No files in the repo were modified.

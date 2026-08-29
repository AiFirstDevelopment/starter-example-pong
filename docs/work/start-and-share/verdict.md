# Verdict — start-and-share

- **Adjudicated:** `5012fe0...HEAD` — the fork point from `main` to the branch tip,
  the same range every lens read (`e1d0c32` code, `e249e8c` state record).
- **Reviews considered:** 001-behavior, 002-correctness, 003-spec-fidelity,
  004-security, 005-simplicity, 006-test-quality. No lens missing.
- **Outcome:** **ready with follow-ups** — 2 escalations, neither blocking.
- **Test suite:** **green** — 130 unit and 77 behavioural, run twice end to end
  on Node 22.23.2. Nothing skipped, nothing weakened.

## What needs you

Two decisions are recorded below as **E1** and **E2**. Neither stops this
merging; both are things I could not settle without moving a target I am not
allowed to move.

- **E1 — the generated id can land somewhere unfortunate.** `naked-beaver-417`
  and `fat-cow-233` are reachable ids the page then asks a player to send to a
  friend. This contradicts the rationale the plan and the code give for choosing
  a curated corpus. Roughly 1 in 5,000–20,000 creations. Nobody has decided
  whether that is acceptable.
- **E2 — the chooser still says there are two ways in when there are three.**
  Two lenses found it independently and both are right. Fixing the copy means
  changing three shipped assertions that AC1 and AC2 do not supersede, which
  AC11 forbids and which I may not amend.

Also worth your eye, though it needed no decision: **AC11 was not met at the
head the panel read.** A shipped assertion — that a tap does not yank the paddle
to the tap point — was dropped in the AC6 rewrite with nothing replacing it,
against AC11's "no test weakened". It is restored, and AC11 is met now. Details
under test-quality F3.

One change of mine goes beyond the plan's steps: the create path now writes the
table id into the address bar (behavior F1). Reasoning and blast radius are under
*Changes applied*; it is one line and one commit if you disagree.

## Acceptance criteria

Walked independently, not taken from the reviews. Every "yes" is a test I read
and watched run, or a mutation I watched fail.

| AC | Met | Evidence |
|---|---|---|
| AC1 | yes | `tests/e2e/touch.spec.ts:415` `start AC1` — one finger down, never lifted: status empties on the `pointerdown`, the paddle lands within 1 px of where the same drag took it, and a sound reaches the destination. Fails when `src/input.ts` is reverted to the tap-slop path. |
| AC2 | yes | `tests/e2e/touch.spec.ts:453` `start AC2` — played to 0–11, then one unlifted touch empties the line, resets the score to 0–0 and moves the paddle to 0.85 of the court. |
| AC3 | yes | `tests/e2e/touch.spec.ts:488` asserts `Touch the court to start` and that the line contains no "key" on a phone; `tests/e2e/mouse.spec.ts:279` asserts `Press any key to start` on the desktop. `tests/unit/status.test.ts` covers both devices for both the idle and the game-over line. |
| AC4 | yes | `tests/e2e/mouse.spec.ts:270` `start AC4` — moving does not start it, *and* button-down-and-drag does not either; only completing the click does. Fails when `onPointerDown` stops excluding the mouse. |
| AC5 | yes | `tests/e2e/invite.spec.ts:56` — the button joins a table, the chooser goes, the status names the table, the URL on screen names that same table, and `#table-id` is still empty. |
| AC6 | yes | `tests/unit/protocol.test.ts` — shape asserted against the corpora themselves, the space asserted at 384,039,000, `normaliseTableId` accepting 100 minted ids, two in a row differing, and the digits drawn afresh. `tests/e2e/invite.spec.ts:76` pins the button to that generator. The space arithmetic was wrong when the panel read it and is now correct and enforced — see correctness F2 and test-quality F1. |
| AC7 | yes | `tests/e2e/invite.spec.ts:129` — the whole URL, `user-select` not `none`, and the control beside it visible. |
| AC8 | yes | `tests/e2e/invite.spec.ts:146` — a second context opens the exact string the first page displayed; the two are seated `You/Opponent` and `Opponent/You` and both status lines go empty. Score agreement now goes through the one shared `expectAgreedScore`. |
| AC9 | yes | `tests/e2e/invite.spec.ts:179` — the minted id typed into the field by hand seats the guest opposite the host. The whole shipped table suite still passes unchanged. |
| AC10 | yes | `tests/e2e/invite.spec.ts:203` with both tiers removed before the page runs: the note says "not available", the link is still shown and still selectable. `:230` grants the permission for real and reads the link back off the clipboard. |
| AC11 | yes — **but not at the head the panel read** | Full suite green: 130 unit, 77 behavioural, twice. No `.skip`, no `.only`, no case removed anywhere. `tests/unit/status.test.ts` keeps every shipped expected string byte for byte and only gains an argument. The one shipped test whose expectations changed is `touch.spec.ts` AC6, annotated in place with what superseded it. **The gap:** that rewrite also silently dropped a shipped assertion, which is the "no test weakened" half failing. Restored in adjudication. |

A note on AC11's third clause, since I checked it literally: "the only assertions
that change are the ones AC1 and AC2 supersede" holds. The `Touch the court to
start` line inside the rewritten AC6 test is an *addition* on a freshly loaded
page, not a shipped assertion whose expected value moved — the old test asserted
nothing at that point.

## Dispositions

Eleven findings across six lenses. Two of them (correctness F2 and spec-fidelity
F1) are the same defect found twice, and two more (behavior F2 and correctness
F1) are the same defect found twice. Every one was verified against the code
before disposition; none was taken on the reviewer's word.

| Finding | Lens | Severity | Disposition | Reasoning |
|---|---|---|---|---|
| F1 | behavior | minor | **Accepted** | Confirmed. The create handler joins a table and renders the link but never touches `window.location`, so a reload lands at the chooser with the minted id gone from the page entirely. Pressing the button again mints a *different* table while the friend who was sent the first link waits at it. Fixed in `src/main.ts` with a test. |
| F2 | behavior | nit | **Escalated (E2)** | Confirmed, and real: `#status` reads "Choose single player, or join a table by its id" above three controls. Not mine to fix — see E2. |
| F1 | correctness | minor | **Escalated (E2)** | The same defect as behavior F2, found independently at `src/status.ts:88`. |
| F2 | correctness | nit | **Accepted** | Confirmed by measurement, not by reading: `NumberDictionary.generate` is `Math.floor(Math.random() * (max - min)) + min`, so `{min:100, max:999}` drew 100–998. 200,000 draws gave exactly 899 distinct values, maximum 998, never 999. Four stated claims described a space the code did not produce. Fixed. |
| F1 | spec-fidelity | minor | **Accepted** | The same defect as correctness F2, with the documentation sites enumerated. Fixed once, for both. |
| — | security | — | clean | No findings. I re-ran the two things the lens checked and reported as sound: the worker bundle carries no dictionary word or generator symbol, and both new DOM sinks are `textContent`. The lens's *note 2*, which it deliberately did not file, I have raised myself as **E1**. |
| F1 | simplicity | minor | **Accepted** | Confirmed byte for byte: `expectAgreedScore` existed twice, and the `mine !== '0-0'` guard is written against the initial markup — one copy going vacuous would leave AC8, the criterion the plan calls "the one that matters", passing against a table that never broadcast a point. Lifted into the shared support module. |
| F2 | simplicity | nit | **Accepted** | Confirmed: `createTable` reproduced `enterAt(seat, '/')` line for line in a file that imports `enterAt` and calls it seventy lines further down. All seven tests in the file went through the copy. Replaced. |
| F3 | simplicity | nit | **Accepted** | Confirmed: `invite__lead` and `invite__note` match nothing in the only stylesheet, while every `choose__` sibling has a rule. Dropped, rather than inventing rules for them — `#invite-note` is already addressed by id, which is what `main.ts` uses. |
| F1 | test-quality | minor | **Accepted** | Confirmed and the sharpest finding of the round. The space assertion never called `generateTableId` and multiplied by a literal `900`; the words alone are 234× *under* AC6's bar, so the entire margin came from the one factor nothing measured. I reproduced the reviewer's mutation: narrowing to `{min:100, max:200}` left every other assertion green. It now fails. |
| F2 | test-quality | minor | **Accepted** | Confirmed: the test named for not leaking the address bar passed a location with no query string, so the only way it could fail was a table id containing "seed". Reproduced: a `tableLink` that carried `location.search` passed the old test and fails the new one. |
| F3 | test-quality | minor | **Accepted** | Confirmed, and the one finding that touches AC11. The superseded AC6 test dragged, then tapped elsewhere *on the same page*, then asserted the paddle had not moved to the tap. The rewrite moved that assertion above the tap and put the tap on a fresh page, leaving nothing watching `onPointerDown` — the handler this work item turned from bookkeeping into the thing that starts the game. Mutation reproduced: adding `targetY = courtY(...)` to `onPointerDown` left the whole suite green before, and now misses by 143 px against a 1 px tolerance. |

Rejected: none. Every finding this panel raised was real. That is worth saying
plainly rather than manufacturing a rejection to look discriminating — the two I
did not fix, I did not fix because fixing them is not mine to decide.

## Changes applied

Each fix was watched failing against the defect it guards before being kept.

- `src/net/protocol.ts` — `ID_DIGITS.max` 999 → 1000, so the range really is the
  900 three-digit numbers the doc comment, `README.md:70`, the S5 build note and
  the unit test all claim, and `-999` becomes reachable as AC6's "three-digit
  number" implies. Measured after the change: 900 distinct endings, 100 to 999,
  space 384,039,000. The exclusive bound is now stated in the comment, since
  writing the obvious `999` there is precisely the trap. (correctness F2,
  spec-fidelity F1)
- `src/net/protocol.ts` — the `generateTableId` docstring no longer claims the
  corpus was curated for this use. It was not; see E1. No behaviour change.
- `tests/unit/protocol.test.ts` — the space assertion derives its digit factor
  from the exported `ID_DIGITS` instead of a literal `900`, and a new case
  asserts the generator really draws across that range at both ends. Narrowing
  the range now fails the criterion's own test. (test-quality F1)
- `tests/unit/session.test.ts` — the "nothing else that was in the address bar"
  case is given a location that actually carries `?seed=7&utm_source=email`, and
  asserts the link is exactly `?table=abc`. (test-quality F2)
- `tests/e2e/touch.spec.ts` — the dropped leg restored: after the drag that
  starts the game, a touch elsewhere on the court must leave the paddle where the
  finger left it. (test-quality F3)
- `tests/e2e/support/table.ts` — `expectAgreedScore` lifted here from the two
  specs that each had a copy, with the reason it must be one definition written
  down. `tests/e2e/table.spec.ts` and `tests/e2e/invite.spec.ts` import it; the
  poll body is byte-identical to what both had. (simplicity F1)
- `tests/e2e/invite.spec.ts` — `createTable` calls `enterAt(seat, '/')` instead
  of reproducing it, and the two now-unused imports are gone. (simplicity F2)
- `index.html` — `invite__lead` and `invite__note` class attributes dropped.
  (simplicity F3)
- `src/main.ts` — **the one change beyond the plan's steps.** The create handler
  calls `history.replaceState` to the same URL the invite row displays, so the
  address bar names the table. (behavior F1)
- `tests/e2e/invite.spec.ts` — a test for it: the URL is the link, and a real
  `page.reload()` comes back to the same table rather than to the chooser. Run
  six times over for flakes; the seat is retaken cleanly every time.

### Why the `replaceState` is a fix and not a new feature

It is the closest call I made, so here is the reasoning rather than the
conclusion. Three things decided it:

1. It gives the created table the behaviour the *link-arrival* path has already
   shipped with. A player who opens `?table=<id>` and reloads lands back at the
   table today. This makes the minted id behave the same way, rather than
   inventing anything.
2. It does not touch the *Non-goals*. "Rejoining" there means a server that
   holds a seat for a player who left; nothing server-side changed, `worker/` is
   untouched, and the reloaded page takes a fresh seat exactly as a link arrival
   does. The reconnect is the shipped path, verified six times.
3. Left alone, the failure is silent and unrecoverable *for both players*. The
   feature's whole premise is that the player leaves the browser to send the
   link, which is when a phone reloads a backgrounded tab.

The call is placed **after** `startTable`, so a document whose origin refuses
`replaceState` loses the address bar rather than the button — the exact
behaviour that shipped, rather than a worse one. Nothing re-reads
`location.search` after load, so rewriting it cannot affect the live page;
`tableLink` builds from `origin` and `pathname` only, so the displayed link is
unchanged. The typed-join path is deliberately *not* included: it has the same
loss, but it is pre-existing from `multi-player`, the player can retype what they
typed, and widening the fix there would be reaching outside this change. It is
recorded as a follow-up.

## Escalations

### E1 — the generated id can pair two words a player would rather not send

`unique-names-generator`'s corpus is a general-purpose word list, not one vetted
for this use. Verified directly against the installed package: `adjectives`
contains `naked`, `dirty`, `nasty`, `sexual`, `gay`, `filthy`, `stupid`, `ugly`;
`animals` contains `beaver`, `booby`, `swallow`, `cow`, `pig`, `rat`. So
`naked-beaver-417` is a reachable output, on a page whose next line reads "Send
this link to whoever you are playing". Roughly 1 in 5,000–20,000 creations.

This is not mine to decide because it contradicts a stated rationale rather than
a criterion. The plan's *Open questions* chose this package partly because "the
word list is somebody's curated corpus rather than one improvised here, which is
the part a hand-rolled list gets wrong", and the docstring said the same. That
premise is false, and the security lens confirmed it and placed it below its own
bar rather than filing it. AC6 is met either way — it asks for an adjective, an
animal, three digits and a hundred million ids, and says nothing about which
words. So no criterion forces a choice, and shipping quietly *is* a choice.

I have corrected the docstring so the code no longer asserts something untrue.
The product decision is open.

- **(a) Ship as is.** Cheapest, and the frequency is genuinely low.
- **(b) Filter the two corpora through a blocklist at module scope.** Perhaps
  thirty words; costs a fraction of a percent of the space, which has three
  orders of magnitude of headroom over AC6's bar. Needs a test that the filter is
  actually applied, since nothing else would notice it being dropped.
- **(c) Use a smaller hand-picked adjective list.** Contradicts the plan's own
  reasoning and gives back most of the space.

**Recommended: (b)**, as its own small work item. It is the only option that
makes the shipped rationale true, and the headroom is already there.

### E2 — the chooser still describes two ways in when there are three

`sessionStatusText` returns "Choose single player, or join a table by its id"
while the form beneath it now offers *Single player*, *Create a table* and *Join
table*. Two lenses found this independently. The line steers a player away from
the button AC5 exists to give them — and specifically the player AC5 is for, the
one with nobody to agree an id with. S10 updated the two other places that said
this, the hint text and the README; this third one was missed.

I did not fix it, and the reason is not that it is small. The string is pinned by
three assertions that predate this work item — `tests/unit/status.test.ts:68`,
`tests/e2e/choose.spec.ts:32` and `tests/e2e/choose.spec.ts:90`. Changing the
copy changes all three, and AC11 permits only the assertions AC1 and AC2
supersede to change. Those three are not among them, and I may not amend an
acceptance criterion to make room for my own edit. So it is a decision, not a
repair.

- **(a) Fix it in a follow-up work item**, where the copy change and its three
  assertions are the declared scope. One line of source, three of test.
- **(b) Amend AC11 now to admit this fourth assertion**, and fix it in this work
  item.

**Recommended: (a).** The defect is copy, not behaviour; nothing is broken by
waiting; and amending a criterion at adjudication time to permit an edit the
criterion was written to prevent is a bad precedent even when the edit is right.

## Follow-ups

Real, and out of scope for this change.

- **The typed-join path also loses its table on reload** (`main.ts`'s chooser
  `submit` handler). Pre-existing from `multi-player`, and milder because the
  player can retype the id they typed. Worth doing at the same time as anything
  else that touches the chooser.
- **The `#invite` row overflows a 320×568 screen** by about 111 px, pushing
  `.hint` below the fold while a player waits. Measured by the correctness lens
  and deliberately not filed, because `#choose` already puts 144 px past the
  screen on the same device and the page stays scrollable with the court, the
  link, its button and the mute button all on screen. Recorded so the next
  layout work item does not rediscover it.
- **The table id comes from `Math.random()`**, and `worker/limit.ts` calls the id
  "the only credential". The security lens could construct no practical attack —
  the ~2^28.5 space rather than the PRNG is the binding constraint, that space is
  an approved criterion, and enumeration meets the per-/64 rate limit. If the id
  ever becomes a credential in a stronger sense, this is where to start.
- **`C6`'s bundle baseline is imprecise**, as spec-fidelity recorded: the "5.5 KB
  before" is the post-change bundle with the dependency stubbed out; the real
  pre-change bundle at `5012fe0` is 5.10 KB, and the dependency costs 7.27 KB
  rather than 7.1 KB. No criterion depends on it and the claim's substance holds.

## How the suite was run

No recorded recipe existed under `.claude/skills/`; the recipe came from
`.github/workflows/regression-tests.yml`, which is what gates merges, and matches
`package.json`. I did not write the recipe into the repo, since a new skill file
is not part of this change.

```
npm run build      # tsc --noEmit, tsc --noEmit -p worker, vite build
npm run test:unit  # vitest run          — 130 passed
npm run test:e2e   # playwright test     — 77 passed (chromium + mobile-chrome)
```

Node 22.23.2, as `.nvmrc` and the workflow require — the default `node` on this
machine is v20.16.0, and `wrangler` refuses to start under it. Playwright brings
up its own `vite preview` and a real `wrangler dev` Durable Object; neither
reuses an existing server, so the suite ran against a freshly built bundle both
times. Baseline before any of my edits: 129 unit, 76 behavioural, green. After:
130 and 77, green, run twice with no flake.

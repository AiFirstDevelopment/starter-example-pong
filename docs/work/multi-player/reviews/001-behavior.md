# Review: behavior

- Lens: behavior
- Verdict: findings
- Diff range: f8ffd2b...HEAD

## Notes

Driven as a real user against the built bundle (vite build with VITE_TABLE_URL=ws://127.0.0.1:8787, served by `vite preview` from an isolated outDir on :4174) and a real `wrangler dev` Durable Object on :8787 at the PRODUCTION 60s idle timeout (not the suite's shortened one). Node 22.23.2 per .nvmrc. Chromium via Playwright used only as a hand on the mouse/keyboard - no project test file, config or fixture was used, and the repository tree is unchanged (git status clean at the end). Note for the judge: partway through, another process rebuilt dist/ in the working tree from .env.production, which briefly pointed my pages at wss://pong-table.joelstevick.workers.dev; I rebuilt into a private directory and re-ran everything affected. Also seen once and NOT reported: `wrangler dev` crashed with "Uncaught Error: Network connection lost." while my own (broken) WebSocket shim was throwing "Illegal invocation" on every frame; it did not recur across ~20 later context closes and I could not attribute it to the change. AC1-AC9 were all observed to pass; the three findings below are behaviours outside the criteria.

## Findings

### F1

- Severity: major
- File: worker/table.ts
- Line: 123

**Claim:** At a table, a game that has been won can never be restarted by the two players who played it - no key, click or pointer gesture starts a new one, though the on-screen help and the README both say one does.

**What:** `startGame(this.game)` is only reached when a seat is filled (`this.seats.size === 2` inside `seat()`), and `ClientMessage` (src/net/protocol.ts:53) is only `{kind:'input'}` - there is no message a client can send to begin a new game. So a table that reaches `game-over` stays there for as long as both players remain connected.

**Failure scenario:** Two browsers open /?table=stuck-<id> and play to 11 (observed 11-8). For the next 30 seconds both players pressed Space, Enter, ArrowUp and W, clicked the court, and moved the mouse. The score stayed 11-8, the ball stayed parked at centre, and the two status lines stayed "You win!" / "Your opponent wins!" the whole time - while the help text under the court still read "Tap or click the court, or press any key, to start ... First to 11 wins" and README.md's control table promises "any key except M, or a click on the court | serve, and start a new game once one has been won". Single player, by contrast, says "Computer wins! Press any key to play again" and a key press does return it to 0-0 (verified in the same session). The only ways out at a table are for one player to close their browser and be replaced by a third (which does reset to 0-0), or for both to leave and wait out the full 60 s idle timeout.

**Suggested direction:** Either accept a restart request from a seated player (a new ClientMessage kind that calls startGame when state.phase === 'game-over'), or - if a table is deliberately one game only - stop the page telling both players to press a key to start another, and say what actually has to happen.

### F2

- Severity: major
- File: src/main.ts
- Line: 271

**Claim:** The win/loss line at a table is never cleared, so "You win!" stays painted under the court over the top of the next live game.

**What:** `onSnapshot` calls `showScore()` but never `showStatus()`. `showStatus()` at a table runs only from the connection callbacks (onWelcome/onOpponent/onRefused/onLost) and from `handle()` on a `game-over` event (src/main.ts:152-154). There is no event for a game *starting*, so once the winner line has been written it is never rewritten while the connection state holds steady.

**Failure scenario:** A and B play at /?table=stale-<id> to 11-8 (B wins; B's line reads "You win!"). A closes their browser. A third browser opens the same ?table= URL; the server refills the seat, calls startGame, and a fresh game begins. B's scoreboard correctly follows the new game - 0-0, then 1-0 - but the line under B's court still reads "You win!" and was still reading it 12 s later, with the ball visibly in flight and the new score on the board (screenshot: scoreboard "Opponent 1 - 0 You", ball mid-court, caption "You win!"). The same latch fires for the loser, whose line reads "Your opponent wins!" over the new rally. Reproduced on two independent runs.

**Suggested direction:** Call `showStatus()` alongside `showScore()` in `onSnapshot`, so the line is a function of the snapshot the way `tableStatusText` already assumes it is.

### F3

- Severity: minor
- File: src/main.ts
- Line: 230

**Claim:** A player refused from a full table is told to try another id but is left with no field to type one into - the chooser is hidden and never comes back.

**What:** `startTable()` calls `hideChooser()` before the socket result is known, and nothing restores it on the 'refused' or 'lost' connection states. The message itself (src/status.ts:58) explicitly instructs the user to do something the page no longer offers.

**Failure scenario:** With A and B holding table X, a third browser loads `/`, types X into the id field and clicks "Join table". The page shows "Table X is in use. Agree another id and try that one." - and `#choose` is `hidden`, out of layout, with the mute button the only visible control left on the page. Ten seconds later it is still hidden. The identical dead end appears on "Lost the connection to table X." (reproduced with the worker stopped). The URL is still `/`, so a browser reload does recover, but nothing on the page says so and the instruction the user was just given cannot be followed.

**Suggested direction:** Show the chooser again when the connection ends in 'refused' or 'lost', with the id the player tried still in the field.

# Pong

Pong in the browser, on your own or against somebody else. The three things that
can happen to the ball each make their own sound: a paddle strike, a wall
strike, and the ball leaving the court are told apart by ear without looking at
the screen.

The page opens by asking which game you want. **Single player** gives you the
left paddle and the computer the right one, exactly as it always has. **A table
id** is a string two people agree between themselves — `Johnny-13224`, or
anything else unlikely enough — and the first two people to type it play each
other at it.

## Playing

| Control | Does |
|---|---|
| any key except `M`, or a click on the court | serve, and start a new game once one has been won |
| moving the mouse | put your paddle under the pointer, wherever on the page it is |
| `↑` / `W` | move your paddle up |
| `↓` / `S` | move your paddle down |
| `M` | mute and unmute — the button under the court does the same |

The mouse works outside the canvas as well as over it: take the pointer above
the court and the paddle rests against the top, below it and it rests against
the bottom. Mouse and keys share the paddle, and the most recent of the two
wins — move the mouse and the mouse has it, press a movement key and the keys
do.

First to 11 points wins. Browsers only allow sound to start from a key press or
a click, so the court is silent until you start — moving the mouse is neither,
which is why a click starts the game and a mousemove does not.

**Known behaviour:** the paddle does not follow the pointer until the game has
started. The court is deliberately still before the first key or click, so a
mousemove in that moment sets where the paddle will go without moving it, and
the paddle arrives under the pointer on the click that starts play. This is a
decided trade-off against keeping the opening court silent and motionless, not
an oversight.

## Playing somebody else

Two people agree a table id and both type it in. The first to arrive gets the
left paddle, the second the right, and the scoreboard tells each of them which
is theirs. A third person typing the same id is turned away with a message
saying the table is in use; the two playing are not interrupted.

There is no lobby, no matchmaking and no check that an id is unused. That is
deliberate: an id is a rendezvous string, and two pairs who pick the same one
collide. Pick something long enough that they will not.

When a player leaves, the other is told and the ball stops where it is; the
freed paddle goes to whoever types the id next, and the game carries on from the
score it was at. There is no reconnecting — a player who leaves has left, and
the seat is anyone's. A table nobody is at at all is thrown away after a minute,
so typing that id again then starts a fresh game at 0-0 rather than resuming an
abandoned one.

At a table the server holds the game. Your own paddle is drawn from your own
input the instant you move it, so it never waits for a round trip; the ball, the
score and the other paddle come from the server, and the server is right.

## Running it

```bash
npm install
npm run dev        # development server
npm run build      # typecheck and bundle into dist/
npm run preview    # serve the built bundle on http://localhost:4173
npm run dev:table  # the table server, on http://localhost:8787
```

`npm run dev` serves the page and `npm run dev:table` serves the tables. Only
the second is needed for a two-player game; single player never talks to it, and
the page reads the table server's address from `VITE_TABLE_URL` — unset, it
falls back to its own origin.

Node 22 or later: the table server is a Cloudflare Worker and `wrangler` needs
it. `.nvmrc` says so, and CI reads that.

### `?seed=` and `?table=`

Either parameter answers the opening question, so the page goes straight into
that game rather than asking.

`?seed=1` (any whole number) is single player with a seeded generator: every
serve, bounce and point plays out identically on each load — useful for
reproducing a rally, and what the replay test relies on. Without the parameter
the seed comes from the clock, so every visit differs. A seed means nothing at a
table, where the server holds the generator.

`?table=Johnny-13224` goes straight to that table, which is what makes a table
id something two people can send each other rather than only say out loud.

## Deploying

Two deploys, because a Durable Object cannot live on Pages:

```bash
npm run deploy         # both, table server first
npm run deploy:table   # the Worker holding the tables
npm run deploy:site    # the page, onto Pages
```

| Piece | Where |
|---|---|
| the page | `https://pong.pages.dev` (Cloudflare Pages project `pong`) |
| the tables | `https://pong-table.joelstevick.workers.dev` (Worker `pong-table`) |

The bundle is told the table server's address at build time through
`VITE_TABLE_URL`, which `.env.production` sets to the Worker above. Point it
somewhere else — `ws://127.0.0.1:8787` — to build a page against a local
`wrangler dev`. Unset, the page falls back to its own origin.

The table server is deployed first: a page that goes out before the tables it
talks about would offer a game that cannot be joined.

## Tests

```bash
npm test           # unit tests, then the behavioural suite
npm run test:unit  # Vitest: the collision maths, the computer, the generator
npm run test:e2e   # Playwright: the game in a real browser
```

The Playwright suite builds the app and drives the built bundle through
`vite preview`, pressing real keys. Two boundaries are substituted: the clock
is Playwright's, so frames advance the same number of times every run, and
`window.AudioContext` is replaced by a recorder — Playwright cannot hear, so
the tests assert on the waveform, pitch and length the game asked the browser
to play. The score is read from the DOM and the court is read back out of the
canvas.

The two-browser tests are different in kind. They start a second server — a real
`wrangler dev` running the real Durable Object — and open two or three browser
contexts against it, and they cannot freeze the clock: a server and two browsers
have no clock to share. So they run on real time and poll for what the pages
converge to rather than asserting on a particular frame. The table server they
run against is started with a two-second idle timeout instead of the minute a
real one gets, so a test can watch a table expire without costing the suite a
minute.

The first run needs a browser binary:

```bash
npx playwright install chromium
```

## Layout

```
src/
  main.ts        the loops: one against the computer, one against a person
  audio.ts       the three tones; the only module that touches Web Audio
  input.ts       keyboard and mouse handling
  render.ts      draws the state onto the canvas, between two ticks
  session.ts     which game is being played, and how its connection is doing
  status.ts      the line under the court, for both games
  game/
    state.ts     the shape of a game, its constants and its phase changes
    step.ts      one tick: motion, collisions, scoring, and what happened
    cpu.ts       where the computer wants its paddle
    rng.ts       the seeded generator behind `?seed=`
  net/
    protocol.ts  what a table and a browser say to each other
    table.ts     the browser's end of a table socket
worker/
  table.ts       the Durable Object: one per table id, holding one game
  slots.ts       which paddle an arrival gets, or none
  wrangler.toml  the table server's configuration
```

`src/game/` is pure: no DOM, no clock, no randomness that is not carried in the
state. That is what lets a rally be replayed exactly, and the collision rules be
tested directly.

The Durable Object imports `src/game/` directly rather than keeping a copy, so
the server and the browser cannot drift apart in the rules. `step()` takes both
paddles' inputs; passing `null` for the right-hand one leaves that side to the
computer at the computer's own speed, which is what single player does and why
adding a second human changed nothing about the first game.

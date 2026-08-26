# Pong

Single-player Pong in the browser. You have the left paddle, the computer has
the right one, and the three things that can happen to the ball each make their
own sound: a paddle strike, a wall strike, and the ball leaving the court are
told apart by ear without looking at the screen.

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

## Running it

```bash
npm install
npm run dev        # development server
npm run build      # typecheck and bundle into dist/
npm run preview    # serve the built bundle on http://localhost:4173
```

### `?seed=`

Serves are drawn from a seeded generator. Load the page with `?seed=1` (any
whole number works) and every serve, bounce and point plays out identically on
each load — useful for reproducing a rally, and what the replay test relies on.
Without the parameter the seed comes from the clock, so every visit differs.

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

The first run needs a browser binary:

```bash
npx playwright install chromium
```

## Layout

```
src/
  main.ts        the loop: input in, simulation forward, court and score out
  audio.ts       the three tones; the only module that touches Web Audio
  input.ts       keyboard and mouse handling
  render.ts      draws the state onto the canvas, between two ticks
  game/
    state.ts     the shape of a game, its constants and its phase changes
    step.ts      one tick: motion, collisions, scoring, and what happened
    cpu.ts       where the computer wants its paddle
    rng.ts       the seeded generator behind `?seed=`
```

`src/game/` is pure: no DOM, no clock, no randomness that is not carried in the
state. That is what lets a rally be replayed exactly, and the collision rules be
tested directly.

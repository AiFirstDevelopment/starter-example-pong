/**
 * What a table and a browser say to each other.
 *
 * Both ends import this one module — the client through Vite, the Durable
 * Object through wrangler — so the wire format cannot drift the way it does when
 * each side keeps its own copy. Everything here is a plain value or a pure
 * function: no sockets, no DOM, no Workers runtime, because it is compiled into
 * both.
 *
 * The parsers are deliberately suspicious. A message off a socket is whatever
 * the other end chose to send, and the server in particular is holding the score
 * for two people: an input carrying `NaN` would strand a paddle there for the
 * rest of the game, so a message that is not exactly the right shape is not
 * repaired, it is dropped.
 */

import {
  NumberDictionary,
  adjectives,
  animals,
  uniqueNamesGenerator,
} from 'unique-names-generator';

import type { GameState } from '../game/state';
import type { GameEvent, Input } from '../game/step';

/** Which paddle a player is driving: the left of the court, or the right. */
export type Slot = 'left' | 'right';

/** The simulation runs at the same rate on the server as it does at home. */
export const FIXED_DT_MS = 1000 / 120;
/** How often the table broadcasts the court, and how often a client reports in. */
export const SNAPSHOT_INTERVAL_MS = 1000 / 30;
/** A table with nobody at it is discarded after this long, and starts over. */
export const IDLE_TIMEOUT_MS = 60_000;

/**
 * How often a browser says it is still there when it has nothing else to say.
 *
 * A player who parks their paddle stops sending input entirely — there is
 * nothing to report — so without this a still player and a closed laptop look
 * exactly alike to a table. Far shorter than the timeout below, because the cost
 * of a beat is one small frame and the cost of missing enough of them is a
 * player evicted from a game they are still playing.
 */
export const HEARTBEAT_INTERVAL_MS = 1000;

/**
 * How long a seated socket may say nothing at all before its seat is taken back.
 *
 * The socket, not the player: a player holding still is beating away underneath,
 * and only a browser that has gone — a killed tab, a closed laptop, a cut
 * network — falls silent. A Durable Object is resident and duration-billed for
 * as long as somebody holds a socket to it, and a socket nobody is behind holds
 * one for as long as the connection survives, which can be hours.
 *
 * Ninety seconds is ninety missed beats: long enough that no hiccup reaches it,
 * short enough that an abandoned table is not an afternoon's billing.
 */
export const LIVENESS_TIMEOUT_MS = 90_000;

/**
 * The close code a table uses to turn a third arrival away.
 *
 * In the 4000-4999 range, which is the application's to define. The refusal is
 * sent as a message first — a browser is told the close code but the message is
 * what the player is shown — and the code is what distinguishes a table that is
 * full from a connection that simply failed.
 */
export const REFUSED_CLOSE_CODE = 4409;

/**
 * The close code a table uses on a socket that stopped answering.
 *
 * In the same application-defined range as `REFUSED_CLOSE_CODE`, and distinct
 * from it so that a connection dropped for silence can be told apart from one
 * turned away at a full table. The browser at the other end is, by construction,
 * not listening — this is for whoever reads the logs.
 */
export const SILENT_CLOSE_CODE = 4408;

/** A table id long enough for anything a person would agree out loud. */
export const MAX_TABLE_ID_LENGTH = 64;

/**
 * The three digits a generated id ends with.
 *
 * An adjective and an animal alone is 427 thousand ids; the digits take it to
 * 384 million. They cost nothing to say and they move the point at which two
 * tables alive at the same moment are likely to collide from a few hundred to
 * twenty-three thousand. That matters more than it did when every id was one a
 * player chose: a collision between two ids people picked is theirs to shrug
 * at, and a collision between two this page minted is ours.
 *
 * The dictionary itself is drawn inside `generateTableId` rather than here,
 * because `NumberDictionary.generate` returns a dictionary holding exactly one
 * number, chosen when it was called. Hoisting it would put the same three
 * digits on the end of every id a page ever mints.
 *
 * `max` is exclusive, which is not what its name suggests and not what the
 * package documents: `NumberDictionary.generate` computes
 * `Math.floor(Math.random() * (max - min)) + min`. Written as 999 — the largest
 * three-digit number, the obvious thing to write — it would draw 100 to 998 and
 * no id would ever end in `-999`, leaving 899 endings against the 900 this is
 * counted on to give. Exported so the test that pins the size of the space
 * measures the range the generator actually draws from rather than a literal.
 */
export const ID_DIGITS = { min: 100, max: 1000 };

/**
 * A fresh table id, for a player with nobody to agree one with.
 *
 * Words rather than random characters, because an id has two jobs and only one
 * of them is being sent. `mute-harrier-553` is also something a player can read
 * down a phone line into the field beside the button that minted it, which is
 * what keeps the two ways in to a table complementary — an id of random
 * characters would have made that field vestigial, since nobody invents
 * `k7m-q2x-9fp`.
 *
 * The words are `unique-names-generator`'s corpus rather than a list improvised
 * here, which is a decision about where the list comes from and not a claim
 * that it has been vetted for this use. It has not: the corpus is a general
 * purpose one, `adjectives` holds `naked`, `dirty`, `nasty` and `sexual` among
 * others and `animals` holds `beaver`, `booby`, `cow` and `pig`, so a pairing a
 * player would rather not send to a friend is reachable — rarely, and reachable.
 * Filtering it is a product decision nobody has taken, so it is recorded here
 * rather than quietly assumed away.
 *
 * It satisfies `normaliseTableId` by construction: lowercase letters, hyphens
 * and digits, so there is nothing to trim, and at most 33 characters against a
 * cap of 64.
 */
export function generateTableId(): string {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, animals, NumberDictionary.generate(ID_DIGITS)],
    length: 3,
    separator: '-',
  });
}

export type ServerMessage =
  /** You are in, and this is your paddle. */
  | { kind: 'welcome'; slot: Slot }
  /** Both paddles are taken. Nothing else follows; the socket closes. */
  | { kind: 'refused' }
  /** Whether somebody is on the other paddle right now. */
  | { kind: 'opponent'; present: boolean }
  /** The court, as the server has it, and what happened on the way here. */
  | { kind: 'snapshot'; state: GameState; events: GameEvent[] };

export type ClientMessage =
  /** Where this player is asking their paddle to go. */
  | { kind: 'input'; input: Input }
  /**
   * Play another game at this table.
   *
   * A request, not an instruction: the table holds the game, and it starts one
   * only if this socket has a seat and the last game is over.
   */
  | { kind: 'rematch' }
  /**
   * Still here.
   *
   * Sent when nothing else has been for the heartbeat interval, and carrying
   * nothing: the fact that it arrived is the whole message. A player who stops
   * moving stops sending input, so without this the table cannot tell a parked
   * paddle from a browser that has gone.
   */
  | { kind: 'alive' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * The id this string names, or `null` when it names nothing.
 *
 * Trimmed, because a table id is typed by hand and agreed out loud, and a
 * trailing space is not something two people can hear. Capped, because the id
 * addresses a Durable Object by name and the length of that name is the
 * player's to choose. Collisions are not this function's business: the user
 * asked for a rendezvous string, and two strangers landing on the same one is a
 * consequence they have already accepted.
 */
export function normaliseTableId(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.length > MAX_TABLE_ID_LENGTH) {
    return null;
  }
  return trimmed;
}

function parseInput(value: unknown): Input | null {
  if (!isRecord(value)) {
    return null;
  }
  const { up, down, targetY } = value;
  if (typeof up !== 'boolean' || typeof down !== 'boolean') {
    return null;
  }
  if (targetY !== null && !isFiniteNumber(targetY)) {
    return null;
  }
  return { up, down, targetY };
}

/** What the browser sent, or `null` if it was not something a browser sends. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string') {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  switch (parsed.kind) {
    case 'input': {
      const input = parseInput(parsed.input);
      return input === null ? null : { kind: 'input', input };
    }
    case 'rematch':
      // Nothing carried with it, so there is nothing to check: asking is the
      // whole message, and whether it is granted is the table's business.
      return { kind: 'rematch' };
    case 'alive':
      // Nothing carried with it either, and nothing asked for: arriving is all
      // it does.
      return { kind: 'alive' };
    default:
      return null;
  }
}

/**
 * What the table sent.
 *
 * The client trusts the server — that is the whole trust model — so this checks
 * the shape rather than the values: a truncated or garbled frame should be
 * dropped, not rendered.
 */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  switch (parsed.kind) {
    case 'welcome':
      return parsed.slot === 'left' || parsed.slot === 'right'
        ? { kind: 'welcome', slot: parsed.slot }
        : null;
    case 'refused':
      return { kind: 'refused' };
    case 'opponent':
      return typeof parsed.present === 'boolean'
        ? { kind: 'opponent', present: parsed.present }
        : null;
    case 'snapshot':
      return isRecord(parsed.state) && Array.isArray(parsed.events)
        ? {
            kind: 'snapshot',
            state: parsed.state as unknown as GameState,
            events: parsed.events as GameEvent[],
          }
        : null;
    default:
      return null;
  }
}

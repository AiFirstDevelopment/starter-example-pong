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
 * The close code a table uses to turn a third arrival away.
 *
 * In the 4000-4999 range, which is the application's to define. The refusal is
 * sent as a message first — a browser is told the close code but the message is
 * what the player is shown — and the code is what distinguishes a table that is
 * full from a connection that simply failed.
 */
export const REFUSED_CLOSE_CODE = 4409;

/** A table id long enough for anything a person would agree out loud. */
export const MAX_TABLE_ID_LENGTH = 64;

export type ServerMessage =
  /** You are in, and this is your paddle. */
  | { kind: 'welcome'; slot: Slot }
  /** Both paddles are taken. Nothing else follows; the socket closes. */
  | { kind: 'refused' }
  /** Whether somebody is on the other paddle right now. */
  | { kind: 'opponent'; present: boolean }
  /** The court, as the server has it, and what happened on the way here. */
  | { kind: 'snapshot'; state: GameState; events: GameEvent[] };

export type ClientMessage = { kind: 'input'; input: Input };

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
  if (!isRecord(parsed) || parsed.kind !== 'input') {
    return null;
  }
  const input = parseInput(parsed.input);
  return input === null ? null : { kind: 'input', input };
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

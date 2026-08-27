import { describe, expect, it } from 'vitest';

import {
  normaliseTableId,
  parseClientMessage,
  parseServerMessage,
  MAX_TABLE_ID_LENGTH,
} from '../../src/net/protocol';

describe('parseClientMessage', () => {
  it('reads an input a browser sent', () => {
    expect(
      parseClientMessage(
        JSON.stringify({ kind: 'input', input: { up: true, down: false, targetY: null } }),
      ),
    ).toEqual({ kind: 'input', input: { up: true, down: false, targetY: null } });
  });

  it('drops anything that is not that shape', () => {
    for (const raw of [
      'not json',
      JSON.stringify({ kind: 'snapshot' }),
      JSON.stringify({ kind: 'input' }),
      JSON.stringify({ kind: 'input', input: { up: 'yes', down: false, targetY: null } }),
      JSON.stringify({ kind: 'input', input: { up: true, down: false } }),
    ]) {
      expect(parseClientMessage(raw)).toBeNull();
    }
  });

  it('reads a rematch a browser asked for', () => {
    expect(parseClientMessage(JSON.stringify({ kind: 'rematch' }))).toEqual({ kind: 'rematch' });
  });

  it('drops anything that is only nearly a rematch', () => {
    // The kind is the whole message, so the kind is the whole of what there is
    // to get wrong — and a table that took any of these for a rematch would
    // wipe the score of a game two people are in the middle of.
    for (const raw of [
      '"rematch"',
      JSON.stringify({ kind: 'Rematch' }),
      JSON.stringify({ kind: 'rematch ' }),
      JSON.stringify({ kind: ['rematch'] }),
      JSON.stringify({ rematch: true }),
      JSON.stringify([{ kind: 'rematch' }]),
    ]) {
      expect(parseClientMessage(raw)).toBeNull();
    }
  });

  it('reads a heartbeat, and nothing that is only nearly one', () => {
    // The kind is the whole message here too, and getting it wrong costs a seat
    // either way: a table that read one of these as a heartbeat would hold a
    // paddle for a browser that has gone, and one that dropped a real heartbeat
    // would take the paddle off a player who is still there.
    expect(parseClientMessage(JSON.stringify({ kind: 'alive' }))).toEqual({ kind: 'alive' });
    for (const raw of [
      '"alive"',
      JSON.stringify({ kind: 'Alive' }),
      JSON.stringify({ kind: 'alive ' }),
      JSON.stringify({ alive: true }),
    ]) {
      expect(parseClientMessage(raw)).toBeNull();
    }
  });

  it('drops a target that is not a number the court can hold', () => {
    // A paddle put somewhere that is not a number stays there for the rest of
    // the game, and the server is holding that paddle for somebody else as
    // well. `1e999` is written out rather than stringified because that is how
    // an infinity reaches a parser: `JSON.stringify` turns one into `null`,
    // which is a target the game means, and `JSON.parse` turns this into one.
    for (const targetY of ['1e999', '-1e999', '"200"', '{}', 'true']) {
      expect(
        parseClientMessage(
          `{"kind":"input","input":{"up":false,"down":false,"targetY":${targetY}}}`,
        ),
      ).toBeNull();
    }
  });
});

describe('parseServerMessage', () => {
  it('reads the messages a table sends', () => {
    expect(parseServerMessage(JSON.stringify({ kind: 'welcome', slot: 'right' }))).toEqual({
      kind: 'welcome',
      slot: 'right',
    });
    expect(parseServerMessage(JSON.stringify({ kind: 'refused' }))).toEqual({
      kind: 'refused',
    });
    expect(parseServerMessage(JSON.stringify({ kind: 'opponent', present: false }))).toEqual({
      kind: 'opponent',
      present: false,
    });
  });

  it('drops a message it does not recognise', () => {
    for (const raw of [
      'not json',
      JSON.stringify({ kind: 'welcome', slot: 'middle' }),
      JSON.stringify({ kind: 'snapshot', state: {} }),
      JSON.stringify({ kind: 'nonsense' }),
    ]) {
      expect(parseServerMessage(raw)).toBeNull();
    }
  });
});

describe('normaliseTableId', () => {
  it('takes what two people would agree out loud', () => {
    expect(normaliseTableId('Johnny-13224')).toBe('Johnny-13224');
    expect(normaliseTableId('  Johnny-13224  ')).toBe('Johnny-13224');
  });

  it('refuses an id that names nothing, or more than an id should', () => {
    expect(normaliseTableId('')).toBeNull();
    expect(normaliseTableId('   ')).toBeNull();
    expect(normaliseTableId('x'.repeat(MAX_TABLE_ID_LENGTH))).toBe(
      'x'.repeat(MAX_TABLE_ID_LENGTH),
    );
    expect(normaliseTableId('x'.repeat(MAX_TABLE_ID_LENGTH + 1))).toBeNull();
  });

  it('does not try to make a colliding id unique', () => {
    // The user ruled matchmaking out: the same string is the same table, which
    // is the whole of how two people find each other.
    expect(normaliseTableId('table')).toBe(normaliseTableId('table'));
  });
});

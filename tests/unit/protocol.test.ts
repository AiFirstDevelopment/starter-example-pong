import { adjectives, animals } from 'unique-names-generator';
import { describe, expect, it } from 'vitest';

import {
  generateTableId,
  normaliseTableId,
  parseClientMessage,
  parseServerMessage,
  ID_DIGITS,
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

describe('generateTableId', () => {
  /** Enough ids to say something about the shape rather than about one draw. */
  const MANY = 100;
  const minted = Array.from({ length: MANY }, () => generateTableId());

  it('AC6: is an adjective, an animal and three digits, hyphenated', () => {
    // The parts, not merely the pattern: two words and a number matching
    // `\w+-\w+-\d{3}` would also be satisfied by a generator that had quietly
    // stopped using the corpus this one was chosen for.
    const adjective = new Set(adjectives);
    const animal = new Set(animals);
    for (const id of minted) {
      const parts = id.split('-');
      expect(parts).toHaveLength(3);
      expect(adjective.has(parts[0])).toBe(true);
      expect(animal.has(parts[1])).toBe(true);
      expect(parts[2]).toMatch(/^\d{3}$/);
    }
  });

  it('AC6: draws from a space of at least a hundred million ids', () => {
    // From the dictionary lengths, which is exact, rather than by drawing a
    // thousand ids and demanding no duplicate — that is a test whose own odds
    // decide whether it passes, and the space is the thing the criterion is
    // about. 1202 adjectives, 355 animals and the 900 three-digit numbers.
    //
    // The digit factor comes from `ID_DIGITS` rather than from a literal 900,
    // because the words alone are 426,710 — 234 times *under* the criterion —
    // so the whole margin over the bar is the one factor the implementation
    // owns. Narrowing the range to `{ min: 100, max: 200 }` leaves every other
    // assertion here green, and has to fail this one.
    const endings = ID_DIGITS.max - ID_DIGITS.min;
    const space = new Set(adjectives).size * new Set(animals).size * endings;
    expect(space).toBeGreaterThanOrEqual(100_000_000);
  });

  it('AC6: the digits really span the range the space is counted from', () => {
    // `ID_DIGITS` is only worth multiplying by if the generator draws across
    // all of it, and its `max` is exclusive — written as the 999 it reads as,
    // no id would ever end in `-999` and the space would be 899 endings rather
    // than the 900 the doc comment, the README and the test above all claim.
    const digits = Array.from({ length: 4000 }, () => Number(generateTableId().split('-')[2]));
    for (const digit of digits) {
      expect(digit).toBeGreaterThanOrEqual(ID_DIGITS.min);
      expect(digit).toBeLessThan(ID_DIGITS.max);
    }
    // Both ends are reachable, which is what an off-by-one at either would
    // cost. Four thousand draws miss a given ten-wide band of 900 endings with
    // probability (89/90)^4000, about 5e-20, so this is decided by the range
    // rather than by the draw.
    expect(Math.min(...digits)).toBeLessThan(ID_DIGITS.min + 10);
    expect(Math.max(...digits)).toBeGreaterThan(ID_DIGITS.max - 11);
  });

  it('AC6: two generated in a row differ', () => {
    expect(generateTableId()).not.toBe(generateTableId());
  });

  it('AC6: the digits are drawn afresh rather than once', () => {
    // The trap the generator is written around: `NumberDictionary.generate`
    // hands back a dictionary holding one number it picked when it was called,
    // so a version that built it at module scope would put the same three
    // digits on every id ever minted — and still pass every assertion above,
    // because the words would go on varying.
    const digits = new Set(minted.map((id) => id.split('-')[2]));
    expect(digits.size).toBeGreaterThan(1);
  });

  it('AC6: mints an id the field beside it would have taken', () => {
    // The generated id has to satisfy the same validator a typed one does, or
    // the link it goes into names a table the page refuses to join (AC9).
    for (const id of minted) {
      expect(normaliseTableId(id)).toBe(id);
    }
  });
});

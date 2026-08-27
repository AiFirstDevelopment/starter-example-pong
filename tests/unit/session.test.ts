import { describe, expect, it } from 'vitest';

import { readSession } from '../../src/session';

describe('readSession', () => {
  it('chooses nothing on a bare visit, so the page has to ask', () => {
    expect(readSession('')).toMatchObject({ mode: 'choosing', tableId: null });
    expect(readSession('?')).toMatchObject({ mode: 'choosing' });
    expect(readSession('?sound=off')).toMatchObject({ mode: 'choosing' });
  });

  it('takes a seed as a request for the one-player game', () => {
    // A seed names a replay of the game the computer plays; at a table the
    // server holds the generator and a seed means nothing.
    expect(readSession('?seed=1')).toMatchObject({ mode: 'single', tableId: null });
    expect(readSession('?seed=-7')).toMatchObject({ mode: 'single' });
  });

  it('goes straight to a table the url names, so a link is a rendezvous too', () => {
    expect(readSession('?table=Johnny-13224')).toMatchObject({
      mode: 'table',
      tableId: 'Johnny-13224',
      slot: null,
      connection: 'connecting',
    });
    expect(readSession('?table=%20Johnny%20')).toMatchObject({ tableId: 'Johnny' });
  });

  it('prefers the table when a url somehow names both', () => {
    expect(readSession('?seed=1&table=abc')).toMatchObject({ mode: 'table', tableId: 'abc' });
  });

  it('asks again when the url names a table that is not an id', () => {
    expect(readSession('?table=')).toMatchObject({ mode: 'choosing' });
    expect(readSession('?table=%20%20')).toMatchObject({ mode: 'choosing' });
    expect(readSession(`?table=${'x'.repeat(65)}`)).toMatchObject({ mode: 'choosing' });
  });

  it('falls back to the one-player game when only the seed is unusable', () => {
    // `readSeed` already copes with a seed it cannot parse; what matters here is
    // that naming one at all is still naming the one-player game.
    expect(readSession('?seed=abc')).toMatchObject({ mode: 'single' });
    expect(readSession('?seed=')).toMatchObject({ mode: 'choosing' });
  });
});

import { describe, expect, it } from 'vitest';

import { readSession, tableLink } from '../../src/session';

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

describe('tableLink', () => {
  const here = { origin: 'https://pong.example', pathname: '/' };

  it('AC5: builds a URL that names the table', () => {
    expect(tableLink(here, 'mute-harrier-553')).toBe(
      'https://pong.example/?table=mute-harrier-553',
    );
  });

  it('AC8: reads back as the same table it was built from', () => {
    // The round trip is the criterion: whatever this hands over has to be
    // something `readSession` at the other end takes to the same table.
    for (const tableId of ['mute-harrier-553', 'Johnny-13224', 'a b', 'one&two', 'ü']) {
      const link = tableLink(here, tableId);
      expect(readSession(new URL(link).search)).toMatchObject({
        mode: 'table',
        tableId,
      });
    }
  });

  it('sends on the table and nothing else that was in the address bar', () => {
    // A `?seed=` left over from a one-player game would name a replay at a
    // table that has no generator to seed, and anything else somebody arrived
    // with is not the other player's business.
    //
    // Given a location that really carries a query string, because that is what
    // the caller passes: `main.ts` hands this `window.location`, which has a
    // `search`. Handed a bare `{ origin, pathname }` this case asserted nothing
    // — there was no query for the function to carry over, so the only way it
    // could have failed was a table id with 'seed' in it.
    const arrivedWith = new URL('https://pong.example/?seed=7&utm_source=email');
    const link = tableLink(arrivedWith, 'abc');
    expect(link).toBe('https://pong.example/?table=abc');
    expect(link).not.toContain('seed');
    expect(link).not.toContain('utm_source');

    expect(tableLink({ origin: 'http://localhost:4173', pathname: '/' }, 'abc')).toBe(
      'http://localhost:4173/?table=abc',
    );
  });
});

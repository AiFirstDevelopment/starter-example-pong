import { describe, expect, it } from 'vitest';

import { callerAddress, withinRate, type RateLimiter } from '../../worker/limit';

function asking(headers: Record<string, string> = {}): Request {
  return new Request('https://pong-table.example/table/johnny', { headers });
}

/** A limiter that answers as told, and remembers what it was asked about. */
function limiter(success: boolean): RateLimiter & { keys: string[] } {
  const keys: string[] = [];
  return {
    keys,
    limit: async ({ key }: { key: string }) => {
      keys.push(key);
      return { success };
    },
  };
}

describe('callerAddress', () => {
  it('counts a caller by the address the edge names', () => {
    expect(callerAddress(asking({ 'CF-Connecting-IP': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('counts nobody when no edge named one', () => {
    // Cloudflare sets the header itself and overwrites what the client sent, so
    // the only requests without one are the ones that never crossed an edge: a
    // local runtime, where the whole test suite would otherwise be one player.
    expect(callerAddress(asking())).toBeNull();
    expect(callerAddress(asking({ 'CF-Connecting-IP': '127.0.0.1' }))).toBeNull();
    expect(callerAddress(asking({ 'CF-Connecting-IP': '::1' }))).toBeNull();
  });
});

describe('withinRate', () => {
  it('refuses a caller the limiter has had enough of', async () => {
    const refusing = limiter(false);
    expect(await withinRate(refusing, '203.0.113.7')).toBe(false);
    // Counted against the caller, not against the table: a stranger opening
    // table after table has to be the same stranger each time.
    expect(refusing.keys).toEqual(['203.0.113.7']);
  });

  it('admits a caller the limiter still has room for', async () => {
    expect(await withinRate(limiter(true), '203.0.113.7')).toBe(true);
  });

  it('admits when there is no answer to be had', async () => {
    // A binding the runtime does not have, and a caller nothing named. Neither
    // is a failed check, and refusing on either would take out every local
    // player to protect nothing that is exposed.
    const untouched = limiter(false);
    expect(await withinRate(undefined, '203.0.113.7')).toBe(true);
    expect(await withinRate(untouched, null)).toBe(true);
    expect(untouched.keys).toEqual([]);
  });
});

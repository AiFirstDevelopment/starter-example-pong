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

  it('counts an IPv6 caller by their network, not by the address they picked', () => {
    // A /64 is what one subscriber or one virtual machine is given, and every
    // address in it is theirs to bind. Counted address by address, an attacker
    // with an ordinary allocation is never the same caller twice and the limit
    // is not a limit — so the whole /64 shares one allowance.
    const key = callerAddress(asking({ 'CF-Connecting-IP': '2001:db8:a:b::1' }));
    for (const address of [
      '2001:db8:a:b::2',
      '2001:db8:a:b:c:d:e:f',
      '2001:0db8:000a:000b::dead:beef',
      '2001:DB8:A:B::9',
    ]) {
      expect(callerAddress(asking({ 'CF-Connecting-IP': address })), address).toBe(key);
    }
  });

  it('keeps separate networks separate', () => {
    // The neighbouring /64 is somebody else, and must not spend this one's
    // allowance — a prefix truncated too far would put a whole ISP on one key.
    const keys = [
      '2001:db8:a:b::1',
      '2001:db8:a:c::1',
      '2001:db8:b:b::1',
      '2002:db8:a:b::1',
    ].map((address) => callerAddress(asking({ 'CF-Connecting-IP': address })));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('counts a host as a host', () => {
    // An IPv4 address is one machine, not one network, and the IPv4-mapped form
    // of it is the same machine: truncating either would hand every caller who
    // arrives that way a single shared allowance.
    expect(callerAddress(asking({ 'CF-Connecting-IP': '203.0.113.7' }))).toBe('203.0.113.7');
    expect(callerAddress(asking({ 'CF-Connecting-IP': '203.0.113.8' }))).toBe('203.0.113.8');
    expect(callerAddress(asking({ 'CF-Connecting-IP': '::ffff:203.0.113.7' }))).toBe(
      '::ffff:203.0.113.7',
    );
    expect(callerAddress(asking({ 'CF-Connecting-IP': '::ffff:203.0.113.8' }))).not.toBe(
      callerAddress(asking({ 'CF-Connecting-IP': '::ffff:203.0.113.7' })),
    );
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

  it('admits when the counter cannot be reached', async () => {
    // The third way to get no answer, and the one that is not about missing
    // configuration: the counting happens at the edge rather than in this
    // isolate, so the call to it can fail. Letting that out of here leaves the
    // entry with no response at all and the runtime answers 500 — every player
    // trying to join is turned away because the thing that counts them is
    // unwell, which is the opposite of what this module promises.
    const unwell: RateLimiter = {
      limit: async () => {
        throw new Error('the counter is not answering');
      },
    };
    expect(await withinRate(unwell, '203.0.113.7')).toBe(true);
  });
});

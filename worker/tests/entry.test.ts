/**
 * What the Worker's entry does *before* it addresses a table.
 *
 * The two refusals at the door — a disallowed `Origin`, and a caller over the
 * rate — are not only about the status they answer with. `env.TABLE.get(...)`
 * creates the Durable Object, and an object that has been created is resident
 * and duration-billed; a refusal that happens after it has been addressed costs
 * exactly what letting the caller in would have. So the property under test is
 * "nothing was addressed", and that is invisible from outside: a table created
 * and then refused looks, over the wire, exactly like one never created.
 *
 * It is visible from here, because the binding is this test's. Move either check
 * inside `Table.fetch` and these cases fail — which is the whole reason they
 * exist rather than a behavioural test of the statuses.
 */

import { describe, expect, it } from 'vitest';

import type { RateLimiter } from '../limit';
import worker, { type Env } from '../table';

const ALLOWED = 'https://pong.example';

/** A caller from off the edge, so the rate limit has somebody to count. */
const CALLER = '203.0.113.7';

interface Doorstep {
  env: Env;
  /** Every table id the namespace was asked to name, in order. */
  addressed: string[];
}

/**
 * A `TABLE` binding that records being used, and a limiter that answers as told.
 *
 * The stub answers 200 rather than the 101 a real handshake answers with: node's
 * `Response` refuses any status below 200, and what is being asserted here is
 * that the entry forwarded at all, not what the table said back.
 */
function doorstep(limiter?: RateLimiter): Doorstep {
  const addressed: string[] = [];
  const namespace = {
    idFromName: (name: string): DurableObjectId => {
      addressed.push(name);
      return { toString: () => name } as unknown as DurableObjectId;
    },
    get: (): DurableObjectStub =>
      ({ fetch: async () => new Response('the table answered') }) as unknown as DurableObjectStub,
  } as unknown as DurableObjectNamespace;

  return {
    addressed,
    env: { TABLE: namespace, ALLOWED_ORIGINS: ALLOWED, LIMITER: limiter },
  };
}

/** A limiter that always gives the same answer, and remembers who it was about. */
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

function asking(origin: string | null = ALLOWED, address: string | null = CALLER): Request {
  const headers: Record<string, string> = {};
  if (origin !== null) {
    headers['Origin'] = origin;
  }
  if (address !== null) {
    headers['CF-Connecting-IP'] = address;
  }
  return new Request('https://pong-table.example/table/johnny', { headers });
}

describe('the door', () => {
  it('refuses a browser from somewhere else without addressing a table', async () => {
    const door = doorstep(limiter(true));
    const response = await worker.fetch(asking('https://elsewhere.example'), door.env);

    expect(response.status).toBe(403);
    expect(door.addressed).toEqual([]);
  });

  it('refuses a request with no Origin at all without addressing a table', async () => {
    const door = doorstep(limiter(true));
    const response = await worker.fetch(asking(null), door.env);

    expect(response.status).toBe(403);
    expect(door.addressed).toEqual([]);
  });

  it('refuses a caller over the rate without addressing a table', async () => {
    const full = limiter(false);
    const door = doorstep(full);
    const response = await worker.fetch(asking(), door.env);

    expect(response.status).toBe(429);
    expect(door.addressed).toEqual([]);
    // And it really was the limiter that turned them away, rather than the
    // request never reaching it: the caller was counted, once.
    expect(full.keys).toEqual([CALLER]);
  });

  it('addresses the table once for a caller it admits', async () => {
    const door = doorstep(limiter(true));
    const response = await worker.fetch(asking(), door.env);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('the table answered');
    expect(door.addressed).toEqual(['johnny']);
  });

  it('addresses nothing for a path that is not a table', async () => {
    const door = doorstep(limiter(true));
    const health = await worker.fetch(
      new Request('https://pong-table.example/health'),
      door.env,
    );
    const nowhere = await worker.fetch(
      new Request('https://pong-table.example/elsewhere'),
      door.env,
    );

    expect(health.status).toBe(200);
    expect(nowhere.status).toBe(404);
    expect(door.addressed).toEqual([]);
  });
});

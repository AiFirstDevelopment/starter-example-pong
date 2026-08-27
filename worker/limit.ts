/**
 * How often one address may ask for a table.
 *
 * This is the protection, and the `Origin` allow-list next to it is not: a table
 * id is the only credential, so anyone who can reach this Worker can create
 * Durable Objects, and each one is held resident and billed for as long as a
 * socket stays open. What stops a stranger opening an unbounded number of them
 * is a limit counted at the edge, per address, before any object is addressed.
 *
 * Cloudflare's binding does the counting. This module is the seam in front of
 * it: it says who the counting is against, and what an answer that cannot be
 * obtained means.
 */

/**
 * The part of Cloudflare's rate-limit binding this Worker uses.
 *
 * Declared here rather than taken from the platform types because it is a seam:
 * what the entry needs is something that answers `limit({ key })`, and a test
 * that has to build a whole platform binding to ask for a refusal is a test that
 * will not be written.
 */
export interface RateLimiter {
  limit: (options: { key: string }) => Promise<{ success: boolean }>;
}

/**
 * The loopback addresses, which no caller of a deployed Worker can have.
 *
 * A local runtime fills `CF-Connecting-IP` in with one of these; Cloudflare's
 * edge fills it in with the address the connection actually came from, and
 * nobody reaches a deployed Worker from their own loopback.
 */
const LOOPBACK = new Set(['127.0.0.1', '::1']);

/** How many hextets of an IPv6 address name the network rather than the host. */
const IPV6_PREFIX_HEXTETS = 4;

/** The eight hextets a full IPv6 address has, once `::` is written out. */
const IPV6_HEXTETS = 8;

/**
 * The network an address belongs to, which is what the allowance belongs to.
 *
 * One IPv4 address is one host, so it is counted whole. One IPv6 address is not:
 * it is a single pick out of the /64 that ISPs and cloud providers hand to one
 * subscriber or one virtual machine. Counted whole, anybody with an ordinary
 * allocation binds a fresh source address per request and is never the same
 * caller twice — the limiter grants each of them its own thirty a minute, and
 * the one protection this Worker has stops protecting anything. Counted by the
 * /64, the allowance belongs to the subscriber the way an IPv4 one belongs to a
 * host.
 *
 * The IPv4-mapped form — `::ffff:203.0.113.7` — is a host, not a network: its
 * first four hextets are zero, so truncating it would put every caller who
 * arrives that way on a single shared allowance. A dot inside a colonned
 * address is what says so.
 */
function network(address: string): string {
  if (!address.includes(':') || address.includes('.')) {
    return address;
  }
  const lower = address.toLowerCase();
  const [head, tail] = lower.split('::', 2) as [string, string | undefined];
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  const zeros =
    tail === undefined
      ? []
      : new Array<string>(Math.max(0, IPV6_HEXTETS - left.length - right.length)).fill('0');
  return [...left, ...zeros, ...right]
    .slice(0, IPV6_PREFIX_HEXTETS)
    // `2001:0db8` and `2001:db8` are the same network, and must not be two keys.
    .map((hextet) => hextet.replace(/^0+(?=.)/, ''))
    .join(':');
}

/**
 * Who this request is counted against, or `null` when nobody is.
 *
 * `CF-Connecting-IP` is set by Cloudflare's own edge, which overwrites whatever
 * the client sent: a caller cannot forge it, cannot remove it, and cannot make
 * it say loopback. So both answers that are not a public address mean the same
 * thing — this request did not come through an edge. It is `wrangler dev` on a
 * laptop, where the entire behavioural suite is one address: counting thirty
 * browsers against an allowance meant for one player would take the suite down
 * while protecting nothing that is exposed. A test that wants the real limiter
 * says which address it is speaking for, and is counted like anybody else.
 *
 * What comes back is a network rather than the address verbatim — see
 * `network` for why an IPv6 caller counted verbatim is not counted at all.
 */
export function callerAddress(request: Request): string | null {
  const address = request.headers.get('CF-Connecting-IP');
  if (address === null || LOOPBACK.has(address)) {
    return null;
  }
  return network(address);
}

/**
 * Whether this caller may open another table.
 *
 * Three ways to get no answer, and all three fail **open**. The binding may not
 * be there — it is a platform capability rather than a setting of this Worker's
 * — the address may not be there, which off the edge it never is, and the
 * binding that is there may fail to answer: it counts at the edge rather than in
 * this isolate, so `limit()` is a call that can reject. None of the three is a
 * refusal: a check that cannot be made is not a failed check, and a local
 * runtime that refused every socket after the thirtieth would take the
 * development server and the whole test suite down with it, while protecting
 * nothing that is exposed. Letting a rejection out instead would be worse than
 * refusing — it leaves the entry with no response at all, and the runtime
 * answers 500 to every player trying to join while the counter is unwell.
 *
 * The deployed Worker has a binding and an address, which is the only place the
 * answer is load-bearing.
 *
 * The allow-list in `origins.ts` takes the opposite view of missing
 * configuration, and deliberately: a `var` that did not arrive is a mistake in
 * this repository, not something the runtime withheld.
 */
export async function withinRate(
  limiter: RateLimiter | undefined,
  key: string | null,
): Promise<boolean> {
  if (limiter === undefined || key === null) {
    return true;
  }
  try {
    const { success } = await limiter.limit({ key });
    return success;
  } catch {
    // The counter is at the edge, not in here. A caller is not to be turned away
    // because the thing that counts them could not be reached.
    return true;
  }
}

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
 */
export function callerAddress(request: Request): string | null {
  const address = request.headers.get('CF-Connecting-IP');
  if (address === null || LOOPBACK.has(address)) {
    return null;
  }
  return address;
}

/**
 * Whether this caller may open another table.
 *
 * Two ways to get no answer, and both fail **open**. The binding may not be
 * there — it is a platform capability rather than a setting of this Worker's —
 * and the address may not be there, which off the edge it never is. Neither is a
 * refusal: a check that cannot be made is not a failed check, and a local
 * runtime that refused every socket after the thirtieth would take the
 * development server and the whole test suite down with it, while protecting
 * nothing that is exposed. The deployed Worker has both, which is the only place
 * the answer is load-bearing.
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
  const { success } = await limiter.limit({ key });
  return success;
}

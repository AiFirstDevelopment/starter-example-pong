/**
 * Which pages a browser may open a table from.
 *
 * This is hygiene, not the protection. `Origin` is a header browsers set and
 * cannot be talked out of, so an allow-list stops another site embedding these
 * tables and stops casual cross-origin use — and it stops nothing else: a script
 * with `curl` sends whatever `Origin` it likes, or none at all. What keeps a
 * stranger from running up a bill is the rate limit in `limit.ts`. Anyone
 * reading this should not mistake one for the other.
 *
 * The list is configuration rather than code, so adding a domain is an edit to
 * `wrangler.toml`. It lives here, apart from the Worker, so what it admits and
 * what it refuses can be checked without a network.
 */

/** A scheme and a host — `https` and `pong-3su.pages.dev` — or nothing. */
interface Origin {
  scheme: string;
  host: string;
}

/**
 * One label of a hostname: what a `*` in a pattern stands for.
 *
 * Deliberately narrow. A forged `Origin` is not a browser's, and one carrying a
 * path or a port where a label should be — `https://anything/x.pong.pages.dev` —
 * must not be read as a subdomain of the site.
 */
const LABEL = /^[a-z0-9-]+$/i;

function split(value: string): Origin | null {
  const at = value.indexOf('://');
  if (at === -1) {
    return null;
  }
  return { scheme: value.slice(0, at), host: value.slice(at + 3) };
}

/**
 * Whether `host` is the host this pattern names.
 *
 * A leading `*.` stands for exactly one label, which is what admits the
 * per-deployment previews Pages gives every push — `https://<hash>.<project>.
 * pages.dev` — without admitting anything further up the tree. Only a leading
 * label may be a wildcard: a `*` anywhere else is matched literally, and no
 * origin has one.
 */
function hostMatches(host: string, pattern: string): boolean {
  if (!pattern.startsWith('*.')) {
    return host === pattern;
  }
  const suffix = pattern.slice(1);
  if (!host.endsWith(suffix)) {
    return false;
  }
  return LABEL.test(host.slice(0, host.length - suffix.length));
}

/**
 * Whether a browser at `origin` may open a table.
 *
 * A request with no `Origin` is refused rather than waved through: every browser
 * sends one on a WebSocket upgrade, so a request without one is not this game's
 * client. An allow-list that is missing or empty refuses everything — an
 * unconfigured door is not an open one, and a Worker whose configuration did not
 * arrive should stop rather than serve the world.
 */
export function originAllowed(origin: string | null, allowList: string | undefined): boolean {
  const candidate = origin === null ? null : split(origin);
  if (candidate === null) {
    return false;
  }
  for (const entry of (allowList ?? '').split(',')) {
    const pattern = split(entry.trim());
    if (pattern === null) {
      continue;
    }
    if (candidate.scheme === pattern.scheme && hostMatches(candidate.host, pattern.host)) {
      return true;
    }
  }
  return false;
}

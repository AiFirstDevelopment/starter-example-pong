import { describe, expect, it } from 'vitest';

import { originAllowed } from '../../worker/origins';

/** The list the deployed table server carries, as `wrangler.toml` sets it. */
const ALLOW_LIST = [
  'https://pong-3su.pages.dev',
  'https://*.pong-3su.pages.dev',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].join(',');

describe('originAllowed', () => {
  it('admits the site, its previews and the development servers', () => {
    expect(originAllowed('https://pong-3su.pages.dev', ALLOW_LIST)).toBe(true);
    // Pages gives every deployment its own hostname, so an exact list would
    // refuse the site the moment it was deployed again.
    expect(originAllowed('https://5355cd3f.pong-3su.pages.dev', ALLOW_LIST)).toBe(true);
    expect(originAllowed('https://f227a756.pong-3su.pages.dev', ALLOW_LIST)).toBe(true);
    expect(originAllowed('http://localhost:5173', ALLOW_LIST)).toBe(true);
    expect(originAllowed('http://localhost:4173', ALLOW_LIST)).toBe(true);
  });

  it('refuses a request that names no origin at all', () => {
    // Every browser sends one on a WebSocket upgrade, so a request without one
    // is not this game's client. `null` is also the literal origin a sandboxed
    // frame sends, and it is not a scheme and a host.
    expect(originAllowed(null, ALLOW_LIST)).toBe(false);
    expect(originAllowed('', ALLOW_LIST)).toBe(false);
    expect(originAllowed('null', ALLOW_LIST)).toBe(false);
  });

  it('refuses somebody else on the same shared domain', () => {
    // `pages.dev` is everybody's, so the wildcard has to stop at this project's
    // own name — otherwise anyone who can deploy a Pages site is allow-listed.
    expect(originAllowed('https://pages.dev', ALLOW_LIST)).toBe(false);
    expect(originAllowed('https://somebody-else.pages.dev', ALLOW_LIST)).toBe(false);
    expect(originAllowed('https://evilpong-3su.pages.dev', ALLOW_LIST)).toBe(false);
    expect(originAllowed('https://pong-3su.pages.dev.evil.example', ALLOW_LIST)).toBe(false);
  });

  it('reads a wildcard as one label, and only where a label goes', () => {
    expect(originAllowed('https://a.b.pong-3su.pages.dev', ALLOW_LIST)).toBe(false);
    expect(originAllowed('https://.pong-3su.pages.dev', ALLOW_LIST)).toBe(false);
    // A forged origin can put anything in that position. Whatever stands where
    // a label stands has to look like one.
    expect(originAllowed('https://evil/x.pong-3su.pages.dev', ALLOW_LIST)).toBe(false);
    expect(originAllowed('https://evil.example:1/.pong-3su.pages.dev', ALLOW_LIST)).toBe(false);
  });

  it('holds the scheme and the port to the letter', () => {
    expect(originAllowed('http://pong-3su.pages.dev', ALLOW_LIST)).toBe(false);
    expect(originAllowed('ws://pong-3su.pages.dev', ALLOW_LIST)).toBe(false);
    expect(originAllowed('https://localhost:4173', ALLOW_LIST)).toBe(false);
    expect(originAllowed('http://localhost:4174', ALLOW_LIST)).toBe(false);
    expect(originAllowed('http://localhost', ALLOW_LIST)).toBe(false);
  });

  it('refuses everyone when the list did not arrive', () => {
    // An unconfigured door is not an open one: a Worker whose `var` is missing
    // has lost the only thing that says who its players are.
    expect(originAllowed('https://pong-3su.pages.dev', undefined)).toBe(false);
    expect(originAllowed('https://pong-3su.pages.dev', '')).toBe(false);
    expect(originAllowed('https://pong-3su.pages.dev', ' , ')).toBe(false);
  });

  it('does not mind the spacing of the list it is given', () => {
    expect(originAllowed('https://one.example', ' https://one.example , https://two.example ')).toBe(
      true,
    );
    expect(originAllowed('https://two.example', ' https://one.example , https://two.example ')).toBe(
      true,
    );
  });
});

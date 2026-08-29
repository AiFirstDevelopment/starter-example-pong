import { describe, expect, it } from 'vitest';

import { browserTargets, shareLink, shareNote, type ShareTargets } from '../../src/share';

const LINK = 'https://pong.example/?table=mute-harrier-553';

/** A share sheet that accepts, remembering what it was handed. */
function sheet(): { targets: ShareTargets; offered: { title: string; url: string }[] } {
  const offered: { title: string; url: string }[] = [];
  return {
    offered,
    targets: {
      share: async (data) => {
        offered.push(data);
      },
    },
  };
}

/** A share sheet that rejects with `error` rather than taking the link. */
function refusingSheet(error: unknown): ShareTargets['share'] {
  return async () => {
    throw error;
  };
}

/** A clipboard that accepts, remembering what was put on it. */
function clipboard(): { copy: NonNullable<ShareTargets['copy']>; held: string[] } {
  const held: string[] = [];
  return {
    held,
    copy: async (text) => {
      held.push(text);
    },
  };
}

/** The browser's own `AbortError`: the player closed the sheet themselves. */
function dismissal(): Error {
  const error = new Error('Share canceled');
  error.name = 'AbortError';
  return error;
}

describe('shareLink', () => {
  it('uses the platform share sheet where there is one', async () => {
    const platform = sheet();
    const board = clipboard();

    expect(await shareLink(LINK, { ...platform.targets, copy: board.copy })).toBe('shared');
    expect(platform.offered).toEqual([{ title: 'Pong', url: LINK }]);
    // And nothing was quietly put on the clipboard as well: the player asked
    // for one thing to happen to their link.
    expect(board.held).toEqual([]);
  });

  it('does not copy behind a player who closed the share sheet', async () => {
    const board = clipboard();

    expect(
      await shareLink(LINK, { share: refusingSheet(dismissal()), copy: board.copy }),
    ).toBe('dismissed');
    expect(board.held).toEqual([]);
  });

  it('falls to the clipboard when the share sheet fails rather than declines', async () => {
    const board = clipboard();

    expect(
      await shareLink(LINK, {
        share: refusingSheet(new Error('no share target')),
        copy: board.copy,
      }),
    ).toBe('copied');
    expect(board.held).toEqual([LINK]);
  });

  it('uses the clipboard where there is no share sheet', async () => {
    const board = clipboard();

    expect(await shareLink(LINK, { copy: board.copy })).toBe('copied');
    expect(board.held).toEqual([LINK]);
  });

  it('AC10: says so when the clipboard is there and refuses', async () => {
    // A permission denied, an insecure origin, a tab that is not the front one.
    // The button did nothing, and the one thing it must not do is pretend
    // otherwise.
    const refused: ShareTargets = {
      copy: async () => {
        throw new Error('write permission denied');
      },
    };

    expect(await shareLink(LINK, refused)).toBe('unavailable');
  });

  it('AC10: says so when the browser can do neither', async () => {
    expect(await shareLink(LINK, {})).toBe('unavailable');
  });
});

describe('shareNote', () => {
  it('AC10: tells the player copying is unavailable rather than nothing at all', () => {
    const note = shareNote('unavailable');
    expect(note).not.toBe('');
    // Not merely a message: one that says copying is the thing that did not
    // happen, so the player knows to select the link that is still on screen.
    expect(note.toLowerCase()).toContain('not available');
  });

  it('confirms a copy, and leaves the share sheet to speak for itself', () => {
    expect(shareNote('copied')).toBe('Link copied.');
    expect(shareNote('shared')).toBe('');
    expect(shareNote('dismissed')).toBe('');
  });
});

describe('browserTargets', () => {
  it('offers both where the browser has both', () => {
    const targets = browserTargets({
      share: async () => {},
      clipboard: { writeText: async () => {} },
    } as unknown as Navigator);

    expect(targets.share).toBeTypeOf('function');
    expect(targets.copy).toBeTypeOf('function');
  });

  it('offers neither where the browser has neither', () => {
    // What an insecure origin looks like: `navigator.clipboard` is not an empty
    // clipboard, it is absent, so reading through it would throw rather than
    // return undefined.
    const targets = browserTargets({} as unknown as Navigator);

    expect(targets.share).toBeUndefined();
    expect(targets.copy).toBeUndefined();
  });

  it('offers the clipboard alone on a desktop browser with no share sheet', () => {
    const targets = browserTargets({
      clipboard: { writeText: async () => {} },
    } as unknown as Navigator);

    expect(targets.share).toBeUndefined();
    expect(targets.copy).toBeTypeOf('function');
  });

  it('keeps each one attached to the navigator it came from', async () => {
    // Both are methods, and both throw an "illegal invocation" when called off
    // the object they belong to. Passing them as bare references is the obvious
    // way to write this and the way that fails only in a real browser.
    const written: string[] = [];
    const fake = {
      secret: 'the real navigator',
      async share(this: { secret: string }): Promise<void> {
        if (this?.secret !== 'the real navigator') {
          throw new TypeError('Illegal invocation');
        }
      },
      clipboard: {
        secret: 'the real clipboard',
        async writeText(this: { secret: string }, text: string): Promise<void> {
          if (this?.secret !== 'the real clipboard') {
            throw new TypeError('Illegal invocation');
          }
          written.push(text);
        },
      },
    };

    const targets = browserTargets(fake as unknown as Navigator);
    expect(await shareLink(LINK, { copy: targets.copy })).toBe('copied');
    expect(written).toEqual([LINK]);
    expect(await shareLink(LINK, { share: targets.share })).toBe('shared');
  });
});

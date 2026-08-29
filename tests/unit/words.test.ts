import { adjectives, animals } from 'unique-names-generator';
import { describe, expect, it } from 'vitest';

import { ID_DIGITS } from '../../src/net/protocol';
import {
  BLOCKED_WORDS,
  TABLE_ID_ADJECTIVES,
  TABLE_ID_ANIMALS,
  withoutBlockedWords,
} from '../../src/net/words';

describe('the corpus a table id is drawn from', () => {
  const blocked = new Set(BLOCKED_WORDS);

  it('AC1: holds no blocked word, in either half', () => {
    // Over every word in both corpora rather than over generated ids. A
    // sampled test would be asking whether 35 of 1202 adjectives came up in
    // however many draws it made — millions of them to tell a working filter
    // from a broken one, and still only ever probably. There are 1493 words;
    // checking all of them is exact and takes no time at all.
    for (const word of TABLE_ID_ADJECTIVES) {
      expect(blocked.has(word)).toBe(false);
    }
    for (const word of TABLE_ID_ANIMALS) {
      expect(blocked.has(word)).toBe(false);
    }
  });

  it('AC2: fails the assertion above when the blocklist is emptied', () => {
    // The one test that keeps the filter load-bearing. Nothing else in the
    // suite would notice `BLOCKED_WORDS` being emptied or `withoutBlockedWords`
    // being reduced to the identity: the ids would still be adjective-animal-
    // digits, still be a large enough space, still satisfy `normaliseTableId`.
    //
    // So run the filter the way a rotted blocklist would leave it — the same
    // function, an empty list — and demand that the blocked words are there in
    // what comes back. That is what makes AC1 a statement about the filter
    // rather than a lucky fact about the package's corpus, and it is the
    // assertion that goes red when the list is emptied: AC1 itself would pass
    // vacuously, since an empty blocklist is one no word is on.
    const unfiltered = [
      ...withoutBlockedWords(adjectives, []),
      ...withoutBlockedWords(animals, []),
    ];
    expect(unfiltered.filter((word) => blocked.has(word)).length).toBeGreaterThan(0);
  });

  it('AC3: is strictly smaller than the corpus it comes from', () => {
    // A filter that quietly matched nothing — a typo in every entry, a
    // comparison that never fires — would satisfy AC1 without removing a word.
    expect(TABLE_ID_ADJECTIVES.length).toBeLessThan(adjectives.length);
    expect(TABLE_ID_ANIMALS.length).toBeLessThan(animals.length);
  });

  it('AC3: has lost every blocked word that was in it', () => {
    // The other direction: not merely smaller, but smaller by exactly the words
    // named. An entry matching nothing is not an error — the package may drop a
    // word, or move one between the two corpora — so this asks about the words
    // that are there, and says nothing about the ones that are not.
    for (const word of BLOCKED_WORDS) {
      if (adjectives.includes(word)) {
        expect(TABLE_ID_ADJECTIVES).not.toContain(word);
      }
      if (animals.includes(word)) {
        expect(TABLE_ID_ANIMALS).not.toContain(word);
      }
    }
  });

  it('AC4: still spans at least a hundred million ids after the cut', () => {
    // From the filtered lengths, not from a literal: the point of the criterion
    // is that a corpus shrinking past the bar fails here rather than passing
    // quietly, and a literal 342 million would go on being true of a file
    // somebody had since emptied. `ID_DIGITS.max` is exclusive, so the endings
    // are the difference rather than the difference plus one.
    const endings = ID_DIGITS.max - ID_DIGITS.min;
    const space = TABLE_ID_ADJECTIVES.length * TABLE_ID_ANIMALS.length * endings;
    expect(space).toBeGreaterThanOrEqual(100_000_000);
  });
});

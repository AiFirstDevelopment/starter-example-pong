/**
 * The words a generated table id is built from.
 *
 * `unique-names-generator` ships a general-purpose corpus, and general purpose
 * is not this purpose. A table id is minted so it can be *sent* — the page that
 * shows it says "Send this link to whoever you are playing" on the next line —
 * and the shipped corpus reaches `naked-beaver-417` and `fat-cow-233` about once
 * in five to twenty thousand creations. Rare is not the same as never when the
 * one time it happens is somebody's message to a friend.
 *
 * So the corpus this game draws from is curated, and curated here: the package
 * supplies the words, this module decides which of them are ids. The blocklist
 * is exported alongside the corpora because a filter nothing can see is a filter
 * nothing can check — the tests drive it, including with the list emptied, which
 * is the only thing that keeps it load-bearing rather than decorative.
 *
 * **The list is generous.** Words that are innocuous alone but ugly beside an
 * animal — `fat`, `hard`, `tight`, `wet`, `cow`, `pig` — come out, because the
 * pair is what gets sent. `bat`, `newt`, `goose`, `toad`, `odd` and `strange`
 * are defensible either way and are out too: 1167 x 326 x 900 leaves 342 million
 * ids against the hundred million the feature asks for, so exclusion is free,
 * and a reviewer arguing one back in is a cheaper conversation than a player
 * receiving one.
 *
 * **Whole words, not substrings.** Blocking substrings would take `accurate`,
 * `grateful`, `mongoose` and `pigeon` with them for containing `rat`, `goose`
 * and `pig`. An id's words are corpus entries exactly, so matching them exactly
 * is both what AC1 means and the only reading that does not gut the corpus.
 *
 * Only single words are filtered, never pairs: removing either half kills the
 * pair, and enumerating pairs is a far larger surface to get wrong. If a pair
 * survives that no single word explains, the answer is another word here.
 *
 * The list lives in this repository rather than upstream. Filing against the
 * package would be the neighbourly thing and is not a fix on any timescale a
 * deployment can wait for.
 */

import { adjectives, animals } from 'unique-names-generator';

/**
 * The words no table id may contain.
 *
 * One list against both corpora rather than one each. An entry that matches
 * nothing is not an error — the two corpora are disjoint today and the package
 * may move a word between them tomorrow — but a word here surviving into either
 * corpus is, and the tests say so.
 */
export const BLOCKED_WORDS: readonly string[] = [
  // From `adjectives` (35).
  'awful',
  'bloody',
  'crazy',
  'creepy',
  'crude',
  'dead',
  'dirty',
  'drunk',
  'fat',
  'filthy',
  'gay',
  'greasy',
  'gross',
  'hard',
  'horrible',
  'loose',
  'mad',
  'naked',
  'nasty',
  'odd',
  'open',
  'rotten',
  'sexual',
  'sick',
  'slimy',
  'stiff',
  'straight',
  'strange',
  'stupid',
  'terrible',
  'tight',
  'ugly',
  'violent',
  'weird',
  'wet',
  // From `animals` (29).
  'ape',
  'bat',
  'beaver',
  'boar',
  'booby',
  'buzzard',
  'chimpanzee',
  'cow',
  'crab',
  'donkey',
  'goose',
  'gorilla',
  'leech',
  'louse',
  'monkey',
  'newt',
  'peacock',
  'pig',
  'puma',
  'rat',
  'shrew',
  'skunk',
  'slug',
  'snake',
  'swallow',
  'toad',
  'vulture',
  'weasel',
  'worm',
];

/**
 * A corpus with the blocked words taken out of it.
 *
 * Exported so a test can run it with the blocklist emptied and watch the words
 * come back: that is what proves the filter below is what removes them, and not
 * some accident of the corpus that would go on holding once the list rotted.
 */
export function withoutBlockedWords(
  corpus: readonly string[],
  blocked: readonly string[],
): string[] {
  const removed = new Set(blocked);
  return corpus.filter((word) => !removed.has(word));
}

/**
 * The two corpora a table id is drawn from.
 *
 * Filtered once here rather than per call: the package's arrays are constants,
 * and doing this again for every id would be the same work for the same answer.
 */
export const TABLE_ID_ADJECTIVES = withoutBlockedWords(adjectives, BLOCKED_WORDS);
export const TABLE_ID_ANIMALS = withoutBlockedWords(animals, BLOCKED_WORDS);

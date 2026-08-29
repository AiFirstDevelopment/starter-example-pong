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
 * are defensible either way and are out too: 1150 x 317 x 900 leaves 328 million
 * ids against the hundred million the feature asks for, so exclusion is free,
 * and a reviewer arguing one back in is a cheaper conversation than a player
 * receiving one.
 *
 * Generosity has to cover three things a word-at-a-time list keeps missing, all
 * three found by review after the first cut and all three fixed by adding words
 * rather than by changing how matching works:
 *
 * - **Inflections.** Exact matching means `ugly` does not carry `ugliest`, so
 *   every form of a blocked word needs its own entry.
 * - **Near-synonyms.** Blocking `naked` and leaving `bare`, or `fat` and leaving
 *   `chubby`, draws a line the reader cannot see. If a word is out, the words
 *   that mean the same thing are out.
 * - **Whole classes.** `ape`, `monkey`, `gorilla` and `chimpanzee` are here for
 *   one reading, and that reading does not stop at four names — so the primates
 *   go as a group, `lemur`, `marmoset` and `tarsier` included. They carry
 *   nothing on their own; taking them costs nine words out of 355 and removes
 *   the argument about where the group ends.
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
 * nothing is not an error — the package may drop a word, or move one between the
 * corpora, tomorrow — but a word here surviving into either corpus is, and the
 * tests say so.
 *
 * The corpora themselves are *not* disjoint: `sole` and `swift` are both an
 * adjective and an animal in 4.7.1. No word on this list is, which is why one
 * merged list gives the same two corpora that two separate lists would. Before
 * adding an entry that is a word in both — to kill an animal pun, say — check
 * that losing it from the adjectives is also what you meant, because a merged
 * list takes it from both and no test here will argue.
 */
export const BLOCKED_WORDS: readonly string[] = [
  // From `adjectives` (52).
  'awful',
  'bare',
  'bloody',
  'chubby',
  'coloured',
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
  'grotesque',
  'grubby',
  'handicapped',
  'hard',
  'horrible',
  'juicy',
  'loose',
  'mad',
  'moaning',
  'naked',
  'nasty',
  'obnoxious',
  'odd',
  'open',
  'oral',
  'primitive',
  'racial',
  'repulsive',
  'rotten',
  'scrawny',
  'sexual',
  'sick',
  'slimy',
  'stiff',
  'straight',
  'strange',
  'stupid',
  'terrible',
  'tight',
  'ugliest',
  'ugly',
  'unsightly',
  'violent',
  'weird',
  'wet',
  'xenophobic',
  // From `animals` (38).
  'ape',
  'baboon',
  'bat',
  'beaver',
  'boar',
  'bonobo',
  'booby',
  'buzzard',
  'chimpanzee',
  'cow',
  'crab',
  'donkey',
  'gibbon',
  'goose',
  'gorilla',
  'leech',
  'lemur',
  'louse',
  'mandrill',
  'marmoset',
  'monkey',
  'newt',
  'orangutan',
  'peacock',
  'pig',
  'primate',
  'puma',
  'rat',
  'shrew',
  'skunk',
  'slug',
  'snake',
  'swallow',
  'tarsier',
  'toad',
  'vulture',
  'weasel',
  'worm',
];

/**
 * A corpus with the blocked words taken out of it.
 *
 * The blocklist is a parameter rather than a closed-over constant so a test can
 * run this against an empty list and see the blocked words in what comes back —
 * which is what makes AC1 a statement about the filter rather than a lucky fact
 * about the package's corpus. It does not, on its own, prove the filter removes
 * anything: an empty list removes nothing by construction. AC1 and AC3 are what
 * fail if this function stops filtering.
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

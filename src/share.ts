/**
 * Handing somebody a link, by whatever means the device in front of the player
 * actually has.
 *
 * Three tiers, tried in that order: the platform's own share sheet, then the
 * clipboard, then neither — and the third is the interesting one. A copy button
 * that silently does nothing is worse than no button at all, because the player
 * walks away believing the link is on their clipboard. So "neither worked" is an
 * answer this module returns rather than a case it swallows, and the page says
 * so out loud (AC10).
 *
 * Everything it can do is passed in rather than read off `navigator`, so all
 * three tiers can be exercised through fakes instead of simulated by deleting
 * globals — which is the difference between testing the tiers and testing a
 * mock.
 */

export type ShareOutcome =
  /** The platform's share sheet took it. */
  | 'shared'
  /** The sheet opened and the player closed it. They declined; nothing failed. */
  | 'dismissed'
  /** On the clipboard. */
  | 'copied'
  /** Neither worked. The link is on screen, and copying it is the player's. */
  | 'unavailable';

/** What a browser can do with a link, as far as this module is concerned. */
export interface ShareTargets {
  /** The platform share sheet, where there is one. */
  share?: (data: { title: string; url: string }) => Promise<void>;
  /** The clipboard, where it exists — which is not the same as it working. */
  copy?: (text: string) => Promise<void>;
}

/** What the share sheet is told this link is. */
const SHARE_TITLE = 'Pong';

/**
 * A share sheet the player closed themselves.
 *
 * `AbortError` is what every browser rejects with when the sheet is dismissed,
 * and it is the one rejection that must not fall through to the clipboard: a
 * player who has just declined to send the link has not asked for it to be
 * copied instead.
 */
function wasDismissed(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Offer `url` to whoever the player wants it to reach.
 *
 * The first tier is entered synchronously, before anything is awaited, because
 * a share sheet is only allowed to open from the gesture that asked for it and
 * an `await` in between spends that gesture.
 */
export async function shareLink(url: string, targets: ShareTargets): Promise<ShareOutcome> {
  if (targets.share !== undefined) {
    try {
      await targets.share({ title: SHARE_TITLE, url });
      return 'shared';
    } catch (error) {
      if (wasDismissed(error)) {
        return 'dismissed';
      }
      // Anything else is the sheet failing rather than the player declining,
      // and the clipboard below may still work.
    }
  }
  if (targets.copy !== undefined) {
    try {
      await targets.copy(url);
      return 'copied';
    } catch {
      // A clipboard that exists and refuses — an insecure origin, a permission
      // denied, a tab that is not the front one — is the case AC10 is for.
    }
  }
  return 'unavailable';
}

/** What to tell the player afterwards, or nothing where the platform told them. */
export function shareNote(outcome: ShareOutcome): string {
  switch (outcome) {
    case 'copied':
      return 'Link copied.';
    case 'unavailable':
      return 'Copying is not available here. Select the link above and copy it.';
    default:
      // The share sheet was its own answer, whether it was used or dismissed.
      return '';
  }
}

/**
 * What this browser can do, read off `navigator` once.
 *
 * Both are optional and both are checked here rather than inside `shareLink`,
 * which is what keeps that function a pure function of what it was handed.
 * They are wrapped rather than passed as bare method references because both
 * are methods on `navigator` and neither works detached from it.
 */
export function browserTargets(from: Navigator): ShareTargets {
  const targets: ShareTargets = {};
  if (typeof from.share === 'function') {
    targets.share = (data) => from.share(data);
  }
  // `clipboard` is absent altogether outside a secure context, so this is a
  // check for the object as well as for the method on it.
  if (typeof from.clipboard?.writeText === 'function') {
    targets.copy = (text) => from.clipboard.writeText(text);
  }
  return targets;
}

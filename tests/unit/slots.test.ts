import { describe, expect, it } from 'vitest';

import { assignSlot } from '../../worker/slots';

describe('assignSlot', () => {
  it('gives the first arrival the left paddle and the second the right', () => {
    expect(assignSlot([])).toBe('left');
    expect(assignSlot(['left'])).toBe('right');
  });

  it('turns a third arrival away', () => {
    expect(assignSlot(['left', 'right'])).toBeNull();
    expect(assignSlot(['right', 'left'])).toBeNull();
  });

  it('hands back a slot the player who held it has left', () => {
    // A disconnect frees the table rather than retiring it: whichever paddle
    // the departing player had is the one the next arrival is given.
    expect(assignSlot(['right'])).toBe('left');
    expect(assignSlot(['left'])).toBe('right');
  });

  it('does not care what order it is told about', () => {
    expect(assignSlot(new Set(['right' as const]))).toBe('left');
  });
});

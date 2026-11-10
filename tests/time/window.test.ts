import { describe, it, expect } from 'vitest';
import { isWithinWindow } from '../../src/time/window';
import { NOW } from '../helpers';

describe('isWithinWindow', () => {
  const nowSec = Math.floor(NOW.getTime() / 1000);

  it('accepts timestamps strictly inside the window', () => {
    expect(isWithinWindow(nowSec + 1, NOW)).toBe(true);
    expect(isWithinWindow(nowSec + 7 * 24 * 3600, NOW)).toBe(true); // exact end is included
  });

  it('rejects past timestamps and targets beyond the window', () => {
    expect(isWithinWindow(nowSec, NOW)).toBe(false); // now itself is past
    expect(isWithinWindow(nowSec - 1, NOW)).toBe(false);
    expect(isWithinWindow(nowSec + 7 * 24 * 3600 + 1, NOW)).toBe(false);
  });
});

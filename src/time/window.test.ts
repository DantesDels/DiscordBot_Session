import { describe, it, expect } from 'vitest';
import { isWithinWindow } from './window';

// Fixed reference: Tuesday, November 10, 2026, 12:00 UTC = 13:00 Paris (CET, UTC+1).
const NOW = new Date(Date.UTC(2026, 10, 10, 12, 0));

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

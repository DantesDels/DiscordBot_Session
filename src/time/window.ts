import { WINDOW_SECONDS } from './constants';

/**
 * Sliding booking window: a session target must be strictly in the future
 * and within the next 7 days (never in the past, never beyond the window).
 */
export function isWithinWindow(unix: number, now: Date): boolean {
  const nowSec = Math.floor(now.getTime() / 1000);
  return unix > nowSec && unix <= nowSec + WINDOW_SECONDS;
}

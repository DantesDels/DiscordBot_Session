/**
 * Combine the `jour` and `heure` option values (both UNIX timestamps sent
 * back by autocomplete) into the session timestamp, validated against the
 * sliding window.
 */

import { DAY_SECONDS, HALF_HOUR } from './constants';
import { startOfDay } from './paris';
import { isWithinWindow } from './window';

export function parseDayTime(
  dayValue: string,
  timeValue: string,
  now: Date
): number | null {
  if (!/^\d+$/.test(dayValue.trim()) || !/^\d+$/.test(timeValue.trim())) return null;
  const day = Number(dayValue);
  const time = Number(timeValue);

  // Both values are UNIX seconds. `time` is a concrete half-hour slot on
  // some day: extract its wall-clock time-of-day relative to the Paris
  // midnight of its own day, then apply that offset to the selected day's
  // midnight (`day` is midnight Paris). Pure second arithmetic works for
  // CET/CEST dates without DST transitions at the boundaries we use.
  const timeOfDay = time - startOfDay(new Date(time * 1000));
  if (timeOfDay < 0 || timeOfDay > DAY_SECONDS - HALF_HOUR) return null;

  let unix = day + timeOfDay;
  // `jour` = today + a post-midnight slot from the next-24h list ("01:30")
  // means the coming night: roll the same-day occurrence to tomorrow, so
  // a clicked suggestion always validates.
  if (unix <= Math.floor(now.getTime() / 1000)) unix += DAY_SECONDS;

  return isWithinWindow(unix, now) ? unix : null;
}

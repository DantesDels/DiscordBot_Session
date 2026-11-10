/**
 * Autocomplete choices for the `jour` (day) option of `/session`.
 *
 * The option VALUE is a UNIX timestamp of that day at 00:00 Paris (so any
 * time on that day, snapped to half-hours, stays within the same calendar
 * day).
 *
 * - Empty/partial input: "Aujourd'hui", "Demain", then weekday-labelled
 *   days across the 7-day sliding window.
 * - Hand-typed input: matching French weekdays ("mar", "jeudi") or a
 *   numeric day/month ("13/11").
 */

import { AutocompleteChoice } from '../discord/choices';
import { dayLabel, parisParts, parisToEpochMs, startOfDay } from './paris';
import { isWithinWindow } from './window';
import { matchWeekday, normalize, parseDayMonth } from './text';

/** Cap: a day is only offered if at least one slot on it is still future. */
function dayHasFutureSlots(dayStartUnix: number, now: Date): boolean {
  return dayStartUnix + 36 * 3600 > Math.floor(now.getTime() / 1000) + 60;
}

export function daySuggestions(input: string, now: Date): AutocompleteChoice[] {
  const q = normalize(input);
  const today = startOfDay(now);
  const out: AutocompleteChoice[] = [];

  const push = (delta: number, name?: string) => {
    const dayStart = today + delta * 86400;
    if (!dayHasFutureSlots(dayStart, now)) return;
    out.push({
      name: name ?? dayLabel(dayStart),
      value: String(dayStart),
    });
  };

  if (!q || 'aujourdhui'.startsWith(q) || 'aujourd hui'.startsWith(q)) {
    push(0, 'Aujourd’hui');
  }
  if (!q || 'demain'.startsWith(q)) {
    push(1, 'Demain');
  }

  // Remaining days of the window, labelled by weekday (skips today/tomorrow
  // already pushed above only when the query is empty; with a query like
  // "mar" we search by weekday instead).
  if (!q) {
    for (let delta = 2; delta <= 6; delta++) push(delta);
    return out;
  }

  // Weekday search: match typed text against French weekday names.
  const weekday = matchWeekday(q);
  if (weekday !== null) {
    const nowParts = parisParts(now);
    for (let delta = 0; delta <= 7; delta++) {
      if ((nowParts.weekday + delta) % 7 !== weekday) continue;
      const dayStart = today + delta * 86400;
      if (dayHasFutureSlots(dayStart, now)) out.push({ name: dayLabel(dayStart), value: String(dayStart) });
    }
    return out;
  }

  // Numeric day/month search: "13/11".
  const date = parseDayMonth(q);
  if (date) {
    const nowParts = parisParts(now);
    for (const year of [nowParts.year, nowParts.year + 1]) {
      const dayStart = Math.floor(parisToEpochMs(year, date.month, date.day, 0, 0) / 1000);
      if (dayHasFutureSlots(dayStart, now) && isWithinWindow(dayStart + 12 * 3600, now)) {
        out.push({ name: dayLabel(dayStart), value: String(dayStart) });
      }
    }
  }

  return out;
}

/**
 * Autocomplete choices for the `heure` (time) option, given the selected
 * day (timestamp of that day at 00:00 Paris, from the `jour` option value).
 *
 * The WHOLE range is always visible: hourly slots by default (24 choices,
 * which fits Discord's 25-choice cap where 48 half-hour slots would not).
 * Typing a time ("20", "20h30") switches the list to half-hour steps
 * starting at the typed slot, minutes snapped down to :00 / :30.
 *
 * Range: the next 24h from now when the day is today or not chosen yet
 * (crossing midnight, those slots are labelled "(demain)"), the selected
 * day in full otherwise. A past time typed for today rolls to the same
 * time tomorrow ("8h" typed in the evening means the coming 08:00), so
 * every suggested slot is submittable.
 */

import { AutocompleteChoice, MAX_AUTOCOMPLETE_CHOICES } from '../discord/choices';
import { DAY_SECONDS, HALF_HOUR, HOUR_SECONDS } from './constants';
import { startOfDay, timeLabel } from './paris';
import { isWithinWindow } from './window';
import { normalize, parseTypedTime } from './text';

export function timeSuggestions(
  input: string,
  now: Date,
  dayTimestamp?: string
): AutocompleteChoice[] {
  const q = normalize(input);
  const nowSec = Math.floor(now.getTime() / 1000);
  const today = startOfDay(now);

  const dayStart = dayTimestamp && /^\d+$/.test(dayTimestamp.trim())
    ? Number(dayTimestamp)
    : today;
  const isToday = dayStart === today;
  // +1s so the slot exactly 24h from now is included (still valid); for a
  // selected day the limit is next midnight and stays exclusive.
  const limit = isToday ? nowSec + 24 * HOUR_SECONDS + 1 : dayStart + DAY_SECONDS;

  const typed = parseTypedTime(q);
  if (typed === 'invalid') return [];

  let first: number;
  let step: number;
  if (typed) {
    const slot =
      dayStart + typed.hour * HOUR_SECONDS + Math.floor(typed.minute / 30) * HALF_HOUR;
    first = isToday && slot <= nowSec ? slot + DAY_SECONDS : slot;
    step = HALF_HOUR;
  } else {
    first = isToday ? Math.ceil(nowSec / HOUR_SECONDS) * HOUR_SECONDS : dayStart;
    step = HOUR_SECONDS;
  }

  const out: AutocompleteChoice[] = [];
  for (let t = first; t < limit && out.length < MAX_AUTOCOMPLETE_CHOICES; t += step) {
    if (t <= nowSec || !isWithinWindow(t, now)) continue;
    const isNextDay = isToday && startOfDay(new Date(t * 1000)) !== today;
    out.push({
      name: isNextDay ? `${timeLabel(t)} (demain)` : timeLabel(t),
      value: String(t),
    });
  }
  return out;
}

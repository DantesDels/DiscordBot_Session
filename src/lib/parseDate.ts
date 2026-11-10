/**
 * Date and time handling for the `/session` command.
 *
 * The command takes two separate options:
 * - `jour` (day): autocomplete proposes "Aujourd'hui" / "Demain" / weekday
 *   names over the sliding 7-day window. The option VALUE is a UNIX
 *   timestamp of that day at 00:00 Paris time (so any time on that day,
 *   snapped to half-hours, stays within the same calendar day).
 * - `heure` (time): autocomplete covers the WHOLE range — hourly by
 *   default (24 choices fit Discord's 25-choice cap), switching to
 *   30-minute steps as soon as the user types a time ("20", "20h30").
 *   With `jour` = today (or not chosen yet) the range is the next 24h from
 *   now (crossing midnight, labelled "(demain)"); otherwise it is the
 *   selected day in full.
 *
 * Wall-clock reasoning happens in Europe/Paris (the bot's audience);
 * results are UNIX timestamps for Discord `<t:X:F>` / `<t:X:R>` tags.
 * Hand-typed times are snapped down to the previous half-hour slot.
 */

export interface DateSuggestion {
  /** Human-readable label shown in the autocomplete menu. */
  name: string;
  /** UNIX timestamp (seconds) sent back as the option value. */
  value: string;
}

const PARIS_TZ = 'Europe/Paris';
const WINDOW_SECONDS = 7 * 24 * 60 * 60;
const HALF_HOUR = 1800; // seconds
const HOUR_SECONDS = 3600;
const DAY_SECONDS = 86400;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// French weekday prefixes (short or full name), value = 0 (Sunday) .. 6 (Saturday).
const WEEKDAY_PATTERNS: Array<[RegExp, number]> = [
  [/\b(dim|dimanche)\b/, 0],
  [/\b(lun|lundi)\b/, 1],
  [/\b(mar|mardi)\b/, 2],
  [/\b(mer|mercredi)\b/, 3],
  [/\b(jeu|jeudi)\b/, 4],
  [/\b(ven|vendredi)\b/, 5],
  [/\b(sam|samedi)\b/, 6],
];

// "20h", "20h30", "20:30", "20 h 30" — minutes optional.
const TIME_RE = /(\d{1,2})\s*[h:]\s*(\d{1,2})?/;
// Numeric day/month, e.g. "12/11".
const DATE_RE = /(\d{1,2})\s*\/\s*(\d{1,2})/;

interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  weekday: number; // 0 = Sunday .. 6 = Saturday
}

type DayHint =
  | { kind: 'delta'; days: number }
  | { kind: 'weekday'; weekday: number }
  | { kind: 'date'; day: number; month: number }
  | { kind: 'none' };

/** Lowercase, strip accents and apostrophes, collapse whitespace. */
function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['`]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Paris wall-clock parts of an instant (hour "24" normalized to 0). */
function parisParts(instant: Date): WallClock & { hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: PARIS_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(instant)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday as (typeof WEEKDAYS)[number]),
  };
}

/** Offset of Paris relative to UTC, in ms, at the given instant. */
function parisOffsetMs(instant: Date): number {
  const p = parisParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - instant.getTime();
}

/** Paris wall-clock -> epoch ms (two-pass to be safe across DST changes). */
function parisToEpochMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  return naive - parisOffsetMs(new Date(naive));
}

/** Add `delta` days to a Paris wall-clock date (UTC math, timezone-free). */
function addDays(p: WallClock, delta: number): WallClock {
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + delta));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: (p.weekday + delta) % 7,
  };
}

/** Sliding window check: strictly after now, within the next 7 days. */
export function isWithinWindow(unix: number, now: Date): boolean {
  const nowSec = Math.floor(now.getTime() / 1000);
  return unix > nowSec && unix <= nowSec + WINDOW_SECONDS;
}

/** Snap a UNIX timestamp (seconds) down to the previous half-hour slot. */
function snapToHalfHour(unix: number): number {
  return Math.floor(unix / HALF_HOUR) * HALF_HOUR;
}

/** Midnight (Paris) of the day of `instant`, as a UNIX timestamp. */
function startOfDay(instant: Date): number {
  const p = parisParts(instant);
  return Math.floor(parisToEpochMs(p.year, p.month, p.day, 0, 0) / 1000);
}

// ---------------------------------------------------------------------------
// Day options (jour)
// ---------------------------------------------------------------------------

/** Format a day timestamp as a Paris-local label (e.g. "mardi 10 novembre"). */
function dayLabel(unix: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: PARIS_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(unix * 1000));
}

/** Cap: a day is only offered if at least one slot on it is still future. */
function dayHasFutureSlots(dayStartUnix: number, now: Date): boolean {
  return dayStartUnix + 36 * 3600 > Math.floor(now.getTime() / 1000) + 60;
}

/**
 * Autocomplete choices for the `jour` option.
 * - Empty/partial input: "Aujourd'hui", "Demain", then weekday-labelled days
 *   across the 7-day sliding window (max 8 choices total, Discord allows 25).
 * - Hand-typed input (e.g. "mar", "jeudi", "13/11"): matching days.
 */
export function daySuggestions(input: string, now: Date): DateSuggestion[] {
  const q = normalize(input);
  const today = startOfDay(now);
  const out: DateSuggestion[] = [];

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
  const names = [
    ['dimanche', 'dim'],
    ['lundi', 'lun'],
    ['mardi', 'mar'],
    ['mercredi', 'mer'],
    ['jeudi', 'jeu'],
    ['vendredi', 'ven'],
    ['samedi', 'sam'],
  ];
  const weekday = names.findIndex(([full, short]) => full.startsWith(q) || short.startsWith(q));
  if (weekday >= 0) {
    const nowParts = parisParts(now);
    for (let delta = 0; delta <= 7; delta++) {
      if ((nowParts.weekday + delta) % 7 !== weekday) continue;
      const dayStart = today + delta * 86400;
      if (dayHasFutureSlots(dayStart, now)) out.push({ name: dayLabel(dayStart), value: String(dayStart) });
    }
    return out;
  }

  // Numeric day/month search: "13/11".
  const dateMatch = DATE_RE.exec(q);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const nowParts = parisParts(now);
      for (const year of [nowParts.year, nowParts.year + 1]) {
        const ms = parisToEpochMs(year, month, day, 0, 0);
        const dayStart = Math.floor(ms / 1000);
        if (dayHasFutureSlots(dayStart, now) && isWithinWindow(dayStart + 12 * 3600, now)) {
          out.push({ name: dayLabel(dayStart), value: String(dayStart) });
        }
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Time options (heure)
// ---------------------------------------------------------------------------

const MAX_CHOICES = 25; // Discord hard limit on autocomplete choices

/** Format a UNIX timestamp as a Paris-local time label (e.g. "20:30"). */
function timeLabel(unix: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: PARIS_TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(unix * 1000));
}

/**
 * Parse what the user typed into the `heure` option:
 * - explicit clock text: "20h", "20h30", "20:30", "20 h 30";
 * - bare digits, autocomplete prefix style: "20" (20:00), "2030" / "930"
 *   (20:30 / 9:30).
 * Returns null for non-time text (user still typing -> default list) and
 * 'invalid' for impossible clock values (hour > 23 or minute > 59).
 */
function parseTypedTime(q: string): { hour: number; minute: number } | 'invalid' | null {
  let hour: number;
  let minute: number;
  const m = TIME_RE.exec(q);
  if (m) {
    hour = Number(m[1]);
    minute = m[2] === undefined ? 0 : Number(m[2]);
  } else if (/^\d{1,4}$/.test(q)) {
    hour = Number(q.length <= 2 ? q : q.slice(0, -2));
    minute = q.length <= 2 ? 0 : Number(q.slice(-2));
  } else {
    return null;
  }
  if (hour > 23 || minute > 59) return 'invalid';
  return { hour, minute };
}

/**
 * Autocomplete choices for the `heure` option, given the selected day
 * (timestamp of that day at 00:00 Paris, from the `jour` option value).
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
export function timeSuggestions(
  input: string,
  now: Date,
  dayTimestamp?: string
): DateSuggestion[] {
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

  const out: DateSuggestion[] = [];
  for (let t = first; t < limit && out.length < MAX_CHOICES; t += step) {
    if (t <= nowSec || !isWithinWindow(t, now)) continue;
    const isNextDay = isToday && startOfDay(new Date(t * 1000)) !== today;
    out.push({
      name: isNextDay ? `${timeLabel(t)} (demain)` : timeLabel(t),
      value: String(t),
    });
  }
  return out;
}

/** Parse a full datetime from separate day and time option values. */
export function parseDayTime(dayValue: string, timeValue: string, now: Date): number | null {
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

// ---------------------------------------------------------------------------
// Legacy full-text parser (kept for direct parseDateTime callers)
// ---------------------------------------------------------------------------

/** Extract the time-of-day from the normalized input, or null. */
function extractTime(s: string): { hour: number; minute: number } | null {
  const m = TIME_RE.exec(s);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] === undefined ? 0 : Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** Identify which day the user means, from the input minus the time part. */
function findDayHint(rest: string): DayHint {
  if (/\bapres\s*[- ]?\s*demain\b/.test(rest)) return { kind: 'delta', days: 2 };
  if (/\bdemain\b/.test(rest)) return { kind: 'delta', days: 1 };
  if (/\b(auj|aujourdhui)\b/.test(rest)) return { kind: 'delta', days: 0 };

  const dateMatch = DATE_RE.exec(rest);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { kind: 'date', day, month };
    }
    return { kind: 'none' };
  }

  for (const [pattern, weekday] of WEEKDAY_PATTERNS) {
    if (pattern.test(rest)) return { kind: 'weekday', weekday };
  }
  return { kind: 'none' };
}

/**
 * Parse a human shortcut into a UNIX timestamp (seconds), or null when the
 * input is unparseable or falls outside the sliding 7-day window.
 * Results are snapped to half-hour slots (:00 / :30).
 */
export function parseDateTime(input: string, now: Date): number | null {
  const s = normalize(input);
  const time = extractTime(s);
  if (!time) return null;

  const rest = s.replace(TIME_RE, ' ');
  const hint = findDayHint(rest);

  const nowParts = parisParts(now);
  const inWindow = (unix: number): boolean => isWithinWindow(unix, now);

  const build = (p: WallClock): number =>
    snapToHalfHour(
      Math.floor(parisToEpochMs(p.year, p.month, p.day, time.hour, time.minute) / 1000)
    );

  if (hint.kind === 'date') {
    // Try the current year, then the next one (for late-December inputs).
    for (const year of [nowParts.year, nowParts.year + 1]) {
      const unix = build({ year, month: hint.month, day: hint.day, weekday: 0 });
      if (inWindow(unix)) return unix;
    }
    return null;
  }

  if (hint.kind === 'weekday') {
    // Next occurrence of that weekday that is still in the future,
    // within the sliding window (today counts if the time is still ahead).
    for (let delta = 0; delta <= 7; delta++) {
      if ((nowParts.weekday + delta) % 7 !== hint.weekday) continue;
      const unix = build(addDays(nowParts, delta));
      if (inWindow(unix)) return unix;
    }
    return null;
  }

  if (hint.kind === 'delta') {
    // Explicit day ("demain"): reject instead of silently rolling over.
    const unix = build(addDays(nowParts, hint.days));
    return inWindow(unix) ? unix : null;
  }

  // Time only: today if still in the future, otherwise tomorrow.
  const today = build(nowParts);
  if (inWindow(today)) return today;
  const tomorrow = build(addDays(nowParts, 1));
  return inWindow(tomorrow) ? tomorrow : null;
}

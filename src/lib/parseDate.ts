/**
 * Human-friendly French date/time parsing for the `/session` command.
 *
 * Design constraints (see README):
 * - Players type shortcuts like "jeu 20h", "demain 18h30" or "12/11 21h".
 * - The target must fall inside a sliding 7-day window starting "now".
 * - Past times are rejected (anti-past protection): the bot never schedules
 *   a session that has already started.
 * - All wall-clock reasoning happens in Europe/Paris (the bot's audience);
 *   results are UNIX timestamps for Discord `<t:X:F>` / `<t:X:R>` tags.
 */

export interface DateSuggestion {
  /** Human-readable label shown in the autocomplete menu. */
  name: string;
  /** UNIX timestamp (seconds) sent back as the option value. */
  value: string;
}

const PARIS_TZ = 'Europe/Paris';
const WINDOW_SECONDS = 7 * 24 * 60 * 60;

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

/** Sliding window check: strictly after now, within the next 7 days. */
export function isWithinWindow(unix: number, now: Date): boolean {
  const nowSec = Math.floor(now.getTime() / 1000);
  return unix > nowSec && unix <= nowSec + WINDOW_SECONDS;
}

/**
 * Parse a human shortcut into a UNIX timestamp (seconds), or null when the
 * input is unparseable or falls outside the sliding 7-day window.
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
    Math.floor(parisToEpochMs(p.year, p.month, p.day, time.hour, time.minute) / 1000);

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

/** Format a UNIX timestamp as a Paris-local, human-readable label. */
export function formatDateLabel(unix: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: PARIS_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(unix * 1000));
}

function suggestion(unix: number): DateSuggestion {
  return { name: formatDateLabel(unix), value: String(unix) };
}

/**
 * Autocomplete choices for the `date_heure` option.
 * - Empty input: popular defaults (today/tomorrow evening slots).
 * - Parseable input: the interpretation, plus tomorrow/day+2 alternates when
 *   no explicit day was given.
 * - Unparseable input: no suggestion (the user is still typing).
 */
export function dateSuggestions(input: string, now: Date): DateSuggestion[] {
  const s = normalize(input);
  const inWindow = (unix: number) => isWithinWindow(unix, now);

  if (!s) {
    const nowParts = parisParts(now);
    const defaults: number[] = [];
    for (const delta of [0, 1]) {
      for (const hour of [20, 21]) {
        const unix = Math.floor(
          parisToEpochMs(
            nowParts.year,
            nowParts.month,
            nowParts.day + delta, // Date.UTC normalizes overflow
            hour,
            0
          ) / 1000
        );
        if (inWindow(unix)) defaults.push(unix);
      }
    }
    return defaults.sort((a, b) => a - b).map(suggestion);
  }

  const unix = parseDateTime(s, now);
  if (unix === null) return [];

  const out = [suggestion(unix)];
  if (findDayHint(s.replace(TIME_RE, ' ')).kind === 'none') {
    // No explicit day: also offer the same time on the next days.
    const nowParts = parisParts(now);
    const time = extractTime(s)!;
    for (const delta of [1, 2]) {
      const target = addDays(nowParts, delta);
      const alt = Math.floor(
        parisToEpochMs(target.year, target.month, target.day, time.hour, time.minute) / 1000
      );
      if (inWindow(alt)) out.push(suggestion(alt));
    }
  }
  return out;
}

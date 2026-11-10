/**
 * Typed-text parsing for the `jour` / `heure` autocomplete options: turn
 * what the user typed into structured hints, so suggestion modules never
 * touch raw strings.
 */

// "20h", "20h30", "20:30", "20 h 30" — minutes optional.
const TIME_RE = /(\d{1,2})\s*[h:]\s*(\d{1,2})?/;
// Numeric day/month, e.g. "12/11".
const DATE_RE = /(\d{1,2})\s*\/\s*(\d{1,2})/;

// French weekday names and their short forms, indexed 0 (Sunday) .. 6.
const WEEKDAY_NAMES: Array<[string, string]> = [
  ['dimanche', 'dim'],
  ['lundi', 'lun'],
  ['mardi', 'mar'],
  ['mercredi', 'mer'],
  ['jeudi', 'jeu'],
  ['vendredi', 'ven'],
  ['samedi', 'sam'],
];

/** Lowercase, strip accents and apostrophes, collapse whitespace. */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['`]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse what the user typed into the `heure` option:
 * - explicit clock text: "20h", "20h30", "20:30", "20 h 30";
 * - bare digits, autocomplete prefix style: "20" (20:00), "2030" / "930"
 *   (20:30 / 9:30).
 * Returns null for non-time text (user still typing -> default list) and
 * 'invalid' for impossible clock values (hour > 23 or minute > 59).
 */
export function parseTypedTime(
  q: string
): { hour: number; minute: number } | 'invalid' | null {
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

/** Match a French weekday name or prefix ("mar", "jeudi") to 0..6, or null. */
export function matchWeekday(q: string): number | null {
  const index = WEEKDAY_NAMES.findIndex(
    ([full, short]) => full.startsWith(q) || short.startsWith(q)
  );
  return index >= 0 ? index : null;
}

/** Parse a typed numeric day/month ("13/11"), or null when out of range. */
export function parseDayMonth(q: string): { day: number; month: number } | null {
  const m = DATE_RE.exec(q);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month };
}

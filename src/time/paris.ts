/**
 * Europe/Paris wall-clock <-> UNIX timestamp conversions.
 *
 * The bot's audience is Paris-based: all human-facing reasoning (labels,
 * day boundaries, "today") happens in wall-clock Paris time, while values
 * sent to Discord are UNIX timestamps for `<t:X:F>` / `<t:X:R>` tags.
 */

export const PARIS_TZ = 'Europe/Paris';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  weekday: number; // 0 = Sunday .. 6 = Saturday
}

/** Paris wall-clock parts of an instant (hour "24" normalized to 0). */
export function parisParts(instant: Date): WallClock & { hour: number; minute: number } {
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
export function parisToEpochMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  return naive - parisOffsetMs(new Date(naive));
}

/** Midnight (Paris) of the day of `instant`, as a UNIX timestamp (seconds). */
export function startOfDay(instant: Date): number {
  const p = parisParts(instant);
  return Math.floor(parisToEpochMs(p.year, p.month, p.day, 0, 0) / 1000);
}

/** Format a day timestamp as a Paris-local label (e.g. "mardi 10 novembre"). */
export function dayLabel(unix: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: PARIS_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(unix * 1000));
}

/** Format a UNIX timestamp as a Paris-local time label (e.g. "20:30"). */
export function timeLabel(unix: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: PARIS_TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(unix * 1000));
}

import { describe, it, expect } from 'vitest';
import { parseDateTime, dateSuggestions } from './parseDate';

// Fixed reference: Tuesday, November 10, 2026, 12:00 UTC = 13:00 Paris (CET, UTC+1).
const NOW = new Date(Date.UTC(2026, 10, 10, 12, 0));

// November 2026 Paris time is UTC+1, so Paris hh:mm = UTC (hh-1):mm.
const utc = (day: number, hour: number, minute = 0): number =>
  Math.floor(Date.UTC(2026, 10, day, hour - 1, minute) / 1000);

describe('parseDateTime', () => {
  it('parses weekday shortcuts to the next upcoming occurrence', () => {
    expect(parseDateTime('jeu 20h', NOW)).toBe(utc(12, 20)); // Thursday Nov 12
    expect(parseDateTime('sam 11h15', NOW)).toBe(utc(14, 11, 15)); // Saturday Nov 14
  });

  it('uses today when the weekday matches and the time is still ahead', () => {
    expect(parseDateTime('mar 15h', NOW)).toBe(utc(10, 15)); // Tuesday = today
  });

  it('rolls a past weekday to next week when still inside the window', () => {
    expect(parseDateTime('mar 9h', NOW)).toBe(utc(17, 9)); // Tuesday Nov 17
  });

  it('parses relative day keywords', () => {
    expect(parseDateTime('demain 18h30', NOW)).toBe(utc(11, 18, 30));
    expect(parseDateTime("aujourd'hui 20h", NOW)).toBe(utc(10, 20));
    expect(parseDateTime('après-demain 20:30', NOW)).toBe(utc(12, 20, 30));
  });

  it('parses numeric day/month dates', () => {
    expect(parseDateTime('12/11 21h', NOW)).toBe(utc(12, 21));
  });

  it('defaults a bare time to today, then tomorrow when already past', () => {
    expect(parseDateTime('20h', NOW)).toBe(utc(10, 20)); // 13:00 now -> 20:00 today
    expect(parseDateTime('10h', NOW)).toBe(utc(11, 10)); // past -> tomorrow
  });

  it('rejects unparseable inputs', () => {
    expect(parseDateTime('nimporte quoi', NOW)).toBeNull();
    expect(parseDateTime('25h', NOW)).toBeNull(); // invalid hour
    expect(parseDateTime('20h99', NOW)).toBeNull(); // invalid minutes
    expect(parseDateTime('jeu 25h', NOW)).toBeNull();
  });

  it('rejects targets outside the sliding 7-day window (anti-past)', () => {
    expect(parseDateTime('10/11 8h', NOW)).toBeNull(); // earlier today
    expect(parseDateTime('18/11 20h', NOW)).toBeNull(); // beyond the window
  });

  it('treats an unknown day keyword as a bare time (label is shown in autocomplete)', () => {
    // "hier" is not a recognized keyword: the parser falls back to time-only
    // semantics (today if future), never producing a past timestamp.
    expect(parseDateTime('hier 20h', NOW)).toBe(utc(10, 20));
  });
});

describe('dateSuggestions', () => {
  it('returns defaults when nothing is typed', () => {
    const choices = dateSuggestions('  ', NOW);
    expect(choices.length).toBeGreaterThan(0);
    // All values are distinct, increasing timestamps inside the window.
    const values = choices.map((c) => Number(c.value));
    expect(new Set(values).size).toBe(values.length);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    for (const v of values) {
      expect(v).toBeGreaterThan(Math.floor(NOW.getTime() / 1000));
    }
    expect(values[values.length - 1]).toBeLessThanOrEqual(
      Math.floor(NOW.getTime() / 1000) + 7 * 24 * 3600
    );
  });

  it('offers the next days too when only a time is given', () => {
    const choices = dateSuggestions('20h', NOW);
    expect(choices.length).toBe(3); // today, tomorrow, day+2
    expect(choices[0].value).toBe(String(utc(10, 20)));
    expect(choices[1].value).toBe(String(utc(11, 20)));
    expect(choices[2].value).toBe(String(utc(12, 20)));
    expect(choices[0].name).toMatch(/20:00/);
  });

  it('returns a single choice for an explicit day', () => {
    const choices = dateSuggestions('jeu 20h', NOW);
    expect(choices.length).toBe(1);
    expect(choices[0].value).toBe(String(utc(12, 20)));
  });

  it('returns no suggestion for unparseable input', () => {
    expect(dateSuggestions('blabla', NOW)).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import {
  parseDateTime,
  parseDayTime,
  daySuggestions,
  timeSuggestions,
  isWithinWindow,
} from './parseDate';

// Fixed reference: Tuesday, November 10, 2026, 12:00 UTC = 13:00 Paris (CET, UTC+1).
const NOW = new Date(Date.UTC(2026, 10, 10, 12, 0));

// November 2026 Paris time is UTC+1, so Paris hh:mm = UTC (hh-1):mm.
const utc = (day: number, hour: number, minute = 0): number =>
  Math.floor(Date.UTC(2026, 10, day, hour - 1, minute) / 1000);

describe('parseDateTime', () => {
  it('parses weekday shortcuts to the next upcoming occurrence', () => {
    expect(parseDateTime('jeu 20h', NOW)).toBe(utc(12, 20)); // Thursday Nov 12
    expect(parseDateTime('sam 11h15', NOW)).toBe(utc(14, 11, 0)); // snapped to 11:00
  });

  it('snaps hand-typed minutes down to the previous half-hour slot', () => {
    expect(parseDateTime('demain 20h10', NOW)).toBe(utc(11, 20, 0));
    expect(parseDateTime('demain 20h45', NOW)).toBe(utc(11, 20, 30));
    expect(parseDateTime('demain 20h30', NOW)).toBe(utc(11, 20, 30)); // already aligned
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

describe('daySuggestions', () => {
  it('proposes today and tomorrow first, then weekday-labelled days', () => {
    const choices = daySuggestions('', NOW);
    expect(choices[0].name).toBe('Aujourd’hui');
    expect(choices[1].name).toBe('Demain');
    // 7-day window from Tuesday: today + 6 more days = 7 total.
    expect(choices).toHaveLength(7);
    expect(choices[2].name).toMatch(/jeudi/i);
    // Values are day starts (00:00 Paris) strictly increasing.
    const values = choices.map((c) => Number(c.value));
    expect(values).toEqual([...values].sort((a, b) => a - b));
    for (const v of values) {
      // 00:00 Paris = 23:00 UTC of the previous day (CET, UTC+1).
      expect(new Date(v * 1000).toISOString()).toMatch(/T23:00:00\.000Z$/);
    }
  });

  it('matches hand-typed weekdays', () => {
    const choices = daySuggestions('jeu', NOW);
    expect(choices).toHaveLength(1); // only Thursday within the window
    expect(choices[0].name).toMatch(/jeudi/i);
    expect(Number(choices[0].value)).toBe(utc(12, 0));
  });

  it('matches numeric day/month', () => {
    const choices = daySuggestions('13/11', NOW);
    expect(choices).toHaveLength(1);
    expect(choices[0].name).toMatch(/vendredi 13 novembre/i);
  });

  it('returns nothing for unparseable input', () => {
    expect(daySuggestions('blabla', NOW)).toEqual([]);
  });
});

describe('timeSuggestions', () => {
  it('offers the next 24h hourly by default, so the whole range is visible', () => {
    const choices = timeSuggestions('', NOW); // NOW = 13:00 Paris
    // 48 half-hour slots cannot fit Discord's 25-choice cap; hourly slots
    // cover the full next 24h instead (14:00 today -> 13:00 tomorrow).
    expect(choices).toHaveLength(24);
    expect(choices[0].name).toBe('14:00');
    expect(choices[23].name).toBe('13:00 (demain)');
    for (const c of choices) {
      expect(Number(c.value) % 3600).toBe(0); // hourly by default
      expect(isWithinWindow(Number(c.value), NOW)).toBe(true);
    }
    // Post-midnight slots are labelled so today/tomorrow is unambiguous.
    expect(choices[10].name).toBe('00:00 (demain)');
  });

  it('covers the selected day hourly (tomorrow), without day labels', () => {
    const tomorrow = String(utc(11, 0)); // day value at 00:00 Paris
    const choices = timeSuggestions('', NOW, tomorrow);
    expect(choices).toHaveLength(24);
    expect(choices[0].name).toBe('00:00');
    expect(choices[23].name).toBe('23:00');
    for (const c of choices) {
      expect(c.name).not.toContain('demain');
      expect(isWithinWindow(Number(c.value), NOW)).toBe(true);
    }
  });

  it('starts today’s default list at the next full hour, not the past', () => {
    const today = String(utc(10, 0));
    const nowOdd = new Date(Date.UTC(2026, 10, 10, 12, 47)); // 13:47 Paris
    const choices = timeSuggestions('', nowOdd, today);
    expect(choices[0].name).toBe('14:00');
  });

  it('switches to half-hour steps when a time is typed', () => {
    const tomorrow = String(utc(11, 0));
    const choices = timeSuggestions('20h10', NOW, tomorrow);
    expect(choices[0].name).toBe('20:00'); // 20h10 snapped down
    expect(choices[1].name).toBe('20:30');
    expect(choices[2].name).toBe('21:00');
  });

  it('accepts bare digits as a typed time (autocomplete prefix style)', () => {
    const choices = timeSuggestions('20', NOW); // no day selected
    expect(choices[0].name).toBe('20:00');
    expect(choices[1].name).toBe('20:30');
    const withMinutes = timeSuggestions('2030', NOW);
    expect(withMinutes[0].name).toBe('20:30');
  });

  it('rolls a past time typed today to the same time tomorrow', () => {
    const today = String(utc(10, 0)); // NOW = 13:00
    const choices = timeSuggestions('8h', NOW, today);
    expect(choices[0].name).toBe('08:00 (demain)');
    expect(choices[1].name).toBe('08:30 (demain)');
  });

  it('rejects an impossible hand-typed time', () => {
    expect(timeSuggestions('25h', NOW)).toEqual([]);
    expect(timeSuggestions('25', NOW)).toEqual([]);
    // Unrecognized text falls back to the default upcoming slots (the user
    // is still typing) rather than an empty menu.
    expect(timeSuggestions('xx', NOW)[0].name).toBe('14:00');
  });

  it('makes every suggested slot submittable with jour = today', () => {
    // Every choice value must resolve, via parseDayTime, to exactly that
    // slot — including post-midnight ones, which roll to tomorrow.
    const today = String(utc(10, 0));
    for (const choice of timeSuggestions('', NOW, today)) {
      expect(parseDayTime(today, choice.value, NOW)).toBe(Number(choice.value));
    }
  });
});

describe('parseDayTime', () => {
  it('combines a day value with a time value', () => {
    const day = String(utc(12, 0)); // Thursday Nov 12
    const time = String(utc(10, 20)); // any day at 20:00
    expect(parseDayTime(day, time, NOW)).toBe(utc(12, 20));
  });

  it('rejects non-numeric or out-of-window combinations', () => {
    expect(parseDayTime('abc', String(utc(10, 20)), NOW)).toBeNull();
    expect(parseDayTime(String(utc(10, 0)), 'abc', NOW)).toBeNull();
    // Day + 23:30 within window is fine; a day beyond the window is not.
    expect(parseDayTime(String(utc(20, 0)), String(utc(10, 23, 30)), NOW)).toBeNull();
  });

  it('rolls a same-day slot that has already passed to tomorrow', () => {
    // A stale suggestion (picked then submitted minutes later) must still
    // resolve — to the coming occurrence, never to a past timestamp.
    const today = String(utc(10, 0)); // NOW = 13:00
    expect(parseDayTime(today, String(utc(10, 8, 30)), NOW)).toBe(utc(11, 8, 30));
    expect(parseDayTime(today, String(utc(10, 20, 30)), NOW)).toBe(utc(10, 20, 30));
  });

  it('resolves a post-midnight slot picked with jour = today to the coming night', () => {
    // "01:00 (demain)" suggested under Aujourd'hui: the value is tomorrow's
    // 01:00; combining it with today's midnight rolls to exactly that slot.
    const today = String(utc(10, 0));
    expect(parseDayTime(today, String(utc(11, 1, 0)), NOW)).toBe(utc(11, 1, 0));
  });
});

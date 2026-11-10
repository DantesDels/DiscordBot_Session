import { describe, it, expect } from 'vitest';
import { daySuggestions } from './daySuggestions';

// Fixed reference: Tuesday, November 10, 2026, 12:00 UTC = 13:00 Paris (CET, UTC+1).
const NOW = new Date(Date.UTC(2026, 10, 10, 12, 0));

// November 2026 Paris time is UTC+1, so Paris hh:mm = UTC (hh-1):mm.
const utc = (day: number, hour: number, minute = 0): number =>
  Math.floor(Date.UTC(2026, 10, day, hour - 1, minute) / 1000);

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

import { describe, it, expect } from 'vitest';
import { timeSuggestions } from './timeSuggestions';
import { isWithinWindow } from './window';
import { parseDayTime } from './combine';

// Fixed reference: Tuesday, November 10, 2026, 12:00 UTC = 13:00 Paris (CET, UTC+1).
const NOW = new Date(Date.UTC(2026, 10, 10, 12, 0));

// November 2026 Paris time is UTC+1, so Paris hh:mm = UTC (hh-1):mm.
const utc = (day: number, hour: number, minute = 0): number =>
  Math.floor(Date.UTC(2026, 10, day, hour - 1, minute) / 1000);

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

import { describe, it, expect } from 'vitest';
import { parseDayTime } from '../../src/time/combine';
import { NOW, utc } from '../helpers';

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

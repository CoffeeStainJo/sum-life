import { describe, expect, it } from 'vitest';
import {
  formatDateHeading,
  isDateKey,
  parseDateKey,
  retainedKeys,
  toDateKey,
  todayKey,
  yesterdayKey,
} from '../lib/dates';

describe('date keys', () => {
  it('formats local dates as YYYY-MM-DD with zero padding', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toDateKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('computes yesterday across month and year boundaries', () => {
    expect(yesterdayKey(new Date(2026, 2, 1))).toBe('2026-02-28');
    expect(yesterdayKey(new Date(2028, 2, 1))).toBe('2028-02-29'); // leap year
    expect(yesterdayKey(new Date(2026, 0, 1, 0, 30))).toBe('2025-12-31');
  });

  it('uses local wall-clock time, not UTC', () => {
    const lateEvening = new Date(2026, 8, 18, 23, 30);
    expect(todayKey(lateEvening)).toBe('2026-09-18');
    expect(retainedKeys(lateEvening)).toEqual(['2026-09-18', '2026-09-17']);
  });

  it('validates and parses keys', () => {
    expect(isDateKey('2026-09-18')).toBe(true);
    expect(isDateKey('2026-9-18')).toBe(false);
    expect(isDateKey('sumlife')).toBe(false);
    expect(parseDateKey('2026-09-18')?.getDate()).toBe(18);
    expect(parseDateKey('nope')).toBeNull();
  });

  it('formats a readable heading and falls back to the raw key', () => {
    expect(formatDateHeading('2026-09-18', 'en-GB')).toMatch(/Friday/);
    expect(formatDateHeading('bad')).toBe('bad');
  });
});

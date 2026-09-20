import { beforeEach, describe, expect, it } from 'vitest';
import type { DailyLog, JournalEntry } from '../types';
import {
  STORAGE_PREFIX,
  listLogDates,
  loadLog,
  logKey,
  pruneLogs,
  sanitizeLog,
  saveLog,
  type StorageLike,
} from '../lib/storage';

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const entry = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  id: 'e1',
  foodItem: { id: 'f1', name: 'Oats', calories: 380, protein: 13, carbs: 68, fat: 7, servingSize: '100 g' },
  servings: 0.5,
  mealType: 'Breakfast',
  loggedAt: '2026-09-18T07:00:00.000Z',
  ...overrides,
});

describe('storage', () => {
  let store: StorageLike;

  beforeEach(() => {
    store = memoryStorage();
  });

  it('round-trips a log', () => {
    const log: DailyLog = { date: '2026-09-18', entries: [entry(), entry({ id: 'e2', mealType: 'Snack' })] };
    expect(saveLog(log, store)).toBe(true);
    expect(loadLog('2026-09-18', store)).toEqual(log);
    expect(listLogDates(store)).toEqual(['2026-09-18']);
  });

  it('returns an empty log when nothing is stored or the JSON is corrupt', () => {
    store.setItem(logKey('2026-09-18'), '{not json');
    expect(loadLog('2026-09-18', store)).toEqual({ date: '2026-09-18', entries: [] });
    expect(loadLog('2026-01-01', store).entries).toEqual([]);
  });

  it('drops malformed entries but keeps valid ones', () => {
    const raw = {
      entries: [
        entry(),
        { id: 'no-food', foodItem: { name: 'missing id' }, servings: 1, mealType: 'Lunch' },
        { ...entry({ id: 'bad-meal' }), mealType: 'Brunch' },
        { ...entry({ id: 'zero-servings' }), servings: 0 },
        { ...entry({ id: 'nan-macro' }), foodItem: { ...entry().foodItem, fat: Number.NaN } },
        'garbage',
      ],
    };
    expect(sanitizeLog(raw, '2026-09-18').entries.map((e) => e.id)).toEqual(['e1']);
    expect(sanitizeLog({ entries: 'nope' }, '2026-09-18').entries).toEqual([]);
    expect(sanitizeLog(null, '2026-09-18').entries).toEqual([]);
  });

  it('keeps valid weight fields and drops invalid ones', () => {
    const raw = {
      entries: [
        { ...entry(), amountUnit: 'grams', foodItem: { ...entry().foodItem, servingGrams: 100 } },
        { ...entry({ id: 'e2' }), amountUnit: 'cups', foodItem: { ...entry().foodItem, servingGrams: -5 } },
        { ...entry({ id: 'e3' }), foodItem: { ...entry().foodItem, servingGrams: '100' } },
      ],
    };
    const [a, b, c] = sanitizeLog(raw, '2026-09-18').entries;
    expect(a?.amountUnit).toBe('grams');
    expect(a?.foodItem.servingGrams).toBe(100);
    expect(b?.amountUnit).toBeUndefined();
    expect(b?.foodItem.servingGrams).toBeUndefined();
    expect(c?.foodItem.servingGrams).toBeUndefined();
  });

  it('prunes everything except today and yesterday, leaving foreign keys alone', () => {
    for (const date of ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18']) {
      saveLog({ date, entries: [entry()] }, store);
    }
    store.setItem('other-app:key', 'x');

    const removed = pruneLogs(new Date(2026, 8, 18, 12), store);

    expect(removed.sort()).toEqual(['2026-09-15', '2026-09-16']);
    expect(listLogDates(store).sort()).toEqual(['2026-09-17', '2026-09-18']);
    expect(store.getItem('other-app:key')).toBe('x');
  });

  it('prunes yesterday once the day rolls over again', () => {
    saveLog({ date: '2026-09-17', entries: [entry()] }, store);
    saveLog({ date: '2026-09-18', entries: [entry()] }, store);
    expect(pruneLogs(new Date(2026, 8, 19, 0, 1), store)).toEqual(['2026-09-17']);
    expect(listLogDates(store)).toEqual(['2026-09-18']);
  });

  it('ignores keys under the prefix that are not date keys', () => {
    store.setItem(`${STORAGE_PREFIX}settings`, '{}');
    expect(listLogDates(store)).toEqual([]);
    expect(pruneLogs(new Date(), store)).toEqual([]);
  });

  it('degrades gracefully without a store', () => {
    expect(loadLog('2026-09-18', null).entries).toEqual([]);
    expect(saveLog({ date: '2026-09-18', entries: [] }, null)).toBe(false);
    expect(pruneLogs(new Date(), null)).toEqual([]);
  });

  it('reports a failed write instead of throwing', () => {
    const throwing: StorageLike = {
      ...memoryStorage(),
      length: 0,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(saveLog({ date: '2026-09-18', entries: [] }, throwing)).toBe(false);
  });
});

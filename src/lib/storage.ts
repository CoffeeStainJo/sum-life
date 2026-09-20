import type { DailyLog, FoodItem, JournalEntry, MealType } from '../types';
import { MEAL_TYPES } from '../types';
import { isDateKey, retainedKeys } from './dates';

/** Every journal lives under `sumlife:log:<YYYY-MM-DD>`. Other keys in localStorage are never touched. */
export const STORAGE_PREFIX = 'sumlife:log:';

/** The subset of the Storage API we use, so tests can pass an in-memory implementation. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

function defaultStore(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Accessing localStorage can throw when storage is blocked (e.g. some private-browsing modes).
  }
  return null;
}

export function logKey(date: string): string {
  return STORAGE_PREFIX + date;
}

export function emptyLog(date: string): DailyLog {
  return { date, entries: [] };
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isMealType = (v: unknown): v is MealType => MEAL_TYPES.includes(v as MealType);

function sanitizeFood(raw: unknown): FoodItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isNonEmptyString(r.id) || !isNonEmptyString(r.name)) return null;
  const { calories, protein, carbs, fat } = r;
  if (!isFiniteNumber(calories) || !isFiniteNumber(protein) || !isFiniteNumber(carbs) || !isFiniteNumber(fat)) {
    return null;
  }
  const food: FoodItem = { id: r.id, name: r.name, calories, protein, carbs, fat };
  if (isNonEmptyString(r.brand)) food.brand = r.brand;
  if (isNonEmptyString(r.servingSize)) food.servingSize = r.servingSize;
  if (isFiniteNumber(r.servingGrams) && r.servingGrams > 0) food.servingGrams = r.servingGrams;
  return food;
}

function sanitizeEntry(raw: unknown): JournalEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const foodItem = sanitizeFood(r.foodItem);
  if (!foodItem) return null;
  if (!isNonEmptyString(r.id) || !isMealType(r.mealType)) return null;
  if (!isFiniteNumber(r.servings) || r.servings <= 0) return null;
  const entry: JournalEntry = {
    id: r.id,
    foodItem,
    servings: r.servings,
    mealType: r.mealType,
    loggedAt: isNonEmptyString(r.loggedAt) ? r.loggedAt : new Date(0).toISOString(),
  };
  if (r.amountUnit === 'servings' || r.amountUnit === 'grams') entry.amountUnit = r.amountUnit;
  return entry;
}

/** Coerce whatever was in storage into a valid DailyLog, dropping entries that don't parse. */
export function sanitizeLog(raw: unknown, date: string): DailyLog {
  if (!raw || typeof raw !== 'object') return emptyLog(date);
  const entries = (raw as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return emptyLog(date);
  return {
    date,
    entries: entries.map(sanitizeEntry).filter((e): e is JournalEntry => e !== null),
  };
}

export function loadLog(date: string, store: StorageLike | null = defaultStore()): DailyLog {
  if (!store) return emptyLog(date);
  try {
    const raw = store.getItem(logKey(date));
    if (!raw) return emptyLog(date);
    return sanitizeLog(JSON.parse(raw), date);
  } catch {
    return emptyLog(date);
  }
}

/** Returns false when the write failed (quota exceeded, storage blocked). */
export function saveLog(log: DailyLog, store: StorageLike | null = defaultStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(logKey(log.date), JSON.stringify(log));
    return true;
  } catch {
    return false;
  }
}

/** All date keys that currently have a journal in storage. */
export function listLogDates(store: StorageLike | null = defaultStore()): string[] {
  if (!store) return [];
  const dates: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) {
      const date = key.slice(STORAGE_PREFIX.length);
      if (isDateKey(date)) dates.push(date);
    }
  }
  return dates;
}

/**
 * Delete every journal except today's and yesterday's.
 * Returns the removed date keys.
 */
export function pruneLogs(now: Date = new Date(), store: StorageLike | null = defaultStore()): string[] {
  if (!store) return [];
  const keep = new Set<string>(retainedKeys(now));
  const removed: string[] = [];
  for (const date of listLogDates(store)) {
    if (!keep.has(date)) {
      try {
        store.removeItem(logKey(date));
        removed.push(date);
      } catch {
        /* ignore */
      }
    }
  }
  return removed;
}

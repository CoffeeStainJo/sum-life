import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AmountUnit, DailyLog, FoodItem, JournalEntry, MacroTotals, MealType } from '../types';
import { MEAL_TYPES } from '../types';
import { todayKey, yesterdayKey } from '../lib/dates';
import { newId } from '../lib/id';
import { clampServings, sumMacros } from '../lib/nutrition';
import { STORAGE_PREFIX, loadLog, pruneLogs, saveLog } from '../lib/storage';

interface JournalState {
  today: DailyLog;
  yesterday: DailyLog;
  /** True when `today` has unsaved changes made through this hook. */
  dirty: boolean;
}

/** Prune stale days and load the two we keep. Called on mount, on day rollover, and when another tab writes. */
function readState(now: Date = new Date()): JournalState {
  pruneLogs(now);
  return {
    today: loadLog(todayKey(now)),
    yesterday: loadLog(yesterdayKey(now)),
    dirty: false,
  };
}

const ROLLOVER_POLL_MS = 60_000;

export type EntriesByMeal = Record<MealType, JournalEntry[]>;

export interface DailyJournal {
  /** Today's date key, YYYY-MM-DD */
  date: string;
  entries: JournalEntry[];
  entriesByMeal: EntriesByMeal;
  totals: MacroTotals;
  yesterdayEntryCount: number;
  yesterdayTotals: MacroTotals;
  canCopyYesterday: boolean;
  addEntry: (foodItem: FoodItem, servings: number, mealType: MealType, amountUnit?: AmountUnit) => JournalEntry;
  updateServings: (entryId: string, servings: number) => void;
  removeEntry: (entryId: string) => void;
  copyYesterday: () => void;
}

export function useDailyJournal(): DailyJournal {
  const [state, setState] = useState<JournalState>(() => readState());

  // Persist whenever an action changed today's log. Saving is idempotent, so StrictMode's
  // double effects are harmless.
  useEffect(() => {
    if (state.dirty) saveLog(state.today);
  }, [state]);

  // Keep the loaded day in sync with the wall clock and with other tabs.
  useEffect(() => {
    const checkRollover = () => {
      setState((prev) => (prev.today.date === todayKey() ? prev : readState()));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) setState(readState());
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkRollover();
    };

    window.addEventListener('focus', checkRollover);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);
    const timer = window.setInterval(checkRollover, ROLLOVER_POLL_MS);
    return () => {
      window.removeEventListener('focus', checkRollover);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(timer);
    };
  }, []);

  /**
   * Apply a change to today's entries. If the day has rolled over since the last render,
   * the change is applied to the *new* day rather than the stale one.
   */
  const mutate = useCallback((fn: (base: JournalState) => JournalEntry[]) => {
    setState((prev) => {
      const base = prev.today.date === todayKey() ? prev : readState();
      return { ...base, today: { ...base.today, entries: fn(base) }, dirty: true };
    });
  }, []);

  const addEntry = useCallback(
    (foodItem: FoodItem, servings: number, mealType: MealType, amountUnit: AmountUnit = 'servings'): JournalEntry => {
      const entry: JournalEntry = {
        id: newId(),
        foodItem,
        servings: clampServings(servings),
        mealType,
        loggedAt: new Date().toISOString(),
        amountUnit,
      };
      mutate((base) => [...base.today.entries, entry]);
      return entry;
    },
    [mutate],
  );

  const updateServings = useCallback(
    (entryId: string, servings: number) => {
      const next = clampServings(servings);
      mutate((base) => base.today.entries.map((e) => (e.id === entryId ? { ...e, servings: next } : e)));
    },
    [mutate],
  );

  const removeEntry = useCallback(
    (entryId: string) => {
      mutate((base) => base.today.entries.filter((e) => e.id !== entryId));
    },
    [mutate],
  );

  const copyYesterday = useCallback(() => {
    mutate((base) => {
      if (base.today.entries.length > 0) return base.today.entries;
      const loggedAt = new Date().toISOString();
      return base.yesterday.entries.map((e) => ({ ...e, id: newId(), loggedAt }));
    });
  }, [mutate]);

  const entries = state.today.entries;

  const entriesByMeal = useMemo<EntriesByMeal>(() => {
    const groups = Object.fromEntries(MEAL_TYPES.map((m) => [m, [] as JournalEntry[]])) as EntriesByMeal;
    for (const entry of entries) groups[entry.mealType].push(entry);
    return groups;
  }, [entries]);

  const totals = useMemo(() => sumMacros(entries), [entries]);
  const yesterdayTotals = useMemo(() => sumMacros(state.yesterday.entries), [state.yesterday.entries]);

  return {
    date: state.today.date,
    entries,
    entriesByMeal,
    totals,
    yesterdayEntryCount: state.yesterday.entries.length,
    yesterdayTotals,
    canCopyYesterday: entries.length === 0 && state.yesterday.entries.length > 0,
    addEntry,
    updateServings,
    removeEntry,
    copyYesterday,
  };
}

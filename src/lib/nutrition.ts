import type { AmountUnit, FoodItem, JournalEntry, MacroTotals } from '../types';

export const EMPTY_TOTALS: MacroTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export interface AmountConfig {
  label: string;
  /** Short unit shown after the number in steppers; empty for servings. */
  suffix: string;
  step: number;
  min: number;
  max: number;
  /** Decimals shown in inputs. Stored values keep 4. */
  decimals: number;
}

export const AMOUNT_CONFIG: Record<AmountUnit, AmountConfig> = {
  servings: { label: 'Servings', suffix: '', step: 0.5, min: 0.25, max: 99, decimals: 2 },
  grams: { label: 'Grams', suffix: 'g', step: 10, min: 1, max: 5000, decimals: 1 },
};

const PRECISION = 10_000;

export function roundAmount(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

export function clampAmount(unit: AmountUnit, value: number): number {
  const cfg = AMOUNT_CONFIG[unit];
  if (!Number.isFinite(value)) return unit === 'grams' ? 100 : 1;
  return Math.min(cfg.max, Math.max(cfg.min, roundAmount(value)));
}

export const clampServings = (value: number): number => clampAmount('servings', value);
export const clampGrams = (value: number): number => clampAmount('grams', value);

export function canLogByWeight(food: FoodItem): food is FoodItem & { servingGrams: number } {
  return typeof food.servingGrams === 'number' && Number.isFinite(food.servingGrams) && food.servingGrams > 0;
}

export function servingsFromGrams(grams: number, servingGrams: number): number {
  return clampServings(grams / servingGrams);
}

export function gramsFromServings(servings: number, servingGrams: number): number {
  return Math.round(servings * servingGrams * 10) / 10;
}

export interface EntryAmount {
  unit: AmountUnit;
  value: number;
}

/** The amount as the user thinks of it: grams when they logged by weight, otherwise servings. */
export function entryAmount(entry: JournalEntry): EntryAmount {
  if (entry.amountUnit === 'grams' && canLogByWeight(entry.foodItem)) {
    return { unit: 'grams', value: gramsFromServings(entry.servings, entry.foodItem.servingGrams) };
  }
  return { unit: 'servings', value: entry.servings };
}

/** Convert an amount in the given unit back to the canonical servings multiplier. */
export function servingsForAmount(unit: AmountUnit, value: number, servingGrams?: number): number {
  if (unit === 'grams' && servingGrams !== undefined && servingGrams > 0) {
    return servingsFromGrams(value, servingGrams);
  }
  return clampServings(value);
}

export function entryMacros(entry: JournalEntry): MacroTotals {
  const { foodItem, servings } = entry;
  return {
    calories: foodItem.calories * servings,
    protein: foodItem.protein * servings,
    carbs: foodItem.carbs * servings,
    fat: foodItem.fat * servings,
  };
}

export function sumMacros(entries: readonly JournalEntry[]): MacroTotals {
  return entries.reduce<MacroTotals>(
    (acc, entry) => {
      const m = entryMacros(entry);
      return {
        calories: acc.calories + m.calories,
        protein: acc.protein + m.protein,
        carbs: acc.carbs + m.carbs,
        fat: acc.fat + m.fat,
      };
    },
    { ...EMPTY_TOTALS },
  );
}

/** Format a gram/kcal total for display: whole numbers, no trailing ".0". */
export function fmt(n: number): string {
  return String(Math.round(n));
}

/** Format an amount for an input: "1", "1.5", "180", "12.5". */
export function formatAmount(value: number, decimals = 2): string {
  const factor = 10 ** decimals;
  return String(Math.round(value * factor) / factor);
}

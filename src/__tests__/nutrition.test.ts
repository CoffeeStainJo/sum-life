import { describe, expect, it } from 'vitest';
import type { JournalEntry } from '../types';
import { suggestMealType } from '../lib/meals';
import {
  canLogByWeight,
  clampGrams,
  clampServings,
  entryAmount,
  entryMacros,
  fmt,
  formatAmount,
  gramsFromServings,
  servingsForAmount,
  servingsFromGrams,
  sumMacros,
} from '../lib/nutrition';

const entry = (calories: number, servings: number, overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  id: 'x',
  foodItem: { id: 'f', name: 'Food', calories, protein: 10, carbs: 20, fat: 5 },
  servings,
  mealType: 'Lunch',
  loggedAt: '2026-09-18T12:00:00.000Z',
  ...overrides,
});

describe('nutrition maths', () => {
  it('multiplies macros by servings and sums entries', () => {
    expect(entryMacros(entry(200, 1.5))).toEqual({ calories: 300, protein: 15, carbs: 30, fat: 7.5 });
    expect(sumMacros([entry(200, 1), entry(100, 0.5, { id: 'y' })])).toEqual({
      calories: 250,
      protein: 15,
      carbs: 30,
      fat: 7.5,
    });
    expect(sumMacros([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it('clamps servings to a sane range with four decimals', () => {
    expect(clampServings(0)).toBe(0.25);
    expect(clampServings(-3)).toBe(0.25);
    expect(clampServings(500)).toBe(99);
    expect(clampServings(1.33333)).toBe(1.3333);
    expect(clampServings(Number.NaN)).toBe(1);
  });

  it('clamps grams', () => {
    expect(clampGrams(0)).toBe(1);
    expect(clampGrams(12.34)).toBe(12.34);
    expect(clampGrams(99999)).toBe(5000);
    expect(clampGrams(Number.NaN)).toBe(100);
  });

  it('formats numbers for display', () => {
    expect(fmt(112.5)).toBe('113');
    expect(fmt(0.4)).toBe('0');
    expect(formatAmount(1)).toBe('1');
    expect(formatAmount(1.5)).toBe('1.5');
    expect(formatAmount(0.5833)).toBe('0.58');
    expect(formatAmount(180, 1)).toBe('180');
    expect(formatAmount(12.55, 1)).toBe('12.6');
  });
});

describe('logging by weight', () => {
  const rice = { id: 'r', name: 'Rice', calories: 130, protein: 2.7, carbs: 28, fat: 0.3, servingSize: '100 g', servingGrams: 100 };
  const bar = { id: 'b', name: 'Bar', calories: 240, protein: 20, carbs: 22, fat: 8, servingSize: '1 bar (60 g)', servingGrams: 60 };

  it('converts between grams and servings', () => {
    expect(servingsFromGrams(180, 100)).toBe(1.8);
    expect(servingsFromGrams(35, 60)).toBe(0.5833);
    expect(gramsFromServings(0.5833, 60)).toBe(35);
    expect(gramsFromServings(2, 100)).toBe(200);
  });

  it('knows which foods can be weighed', () => {
    expect(canLogByWeight(rice)).toBe(true);
    expect(canLogByWeight({ ...bar, servingGrams: 0 })).toBe(false);
    expect(canLogByWeight({ id: 'n', name: 'No weight', calories: 1, protein: 0, carbs: 0, fat: 0 })).toBe(false);
  });

  it('presents an entry in the unit it was logged in', () => {
    expect(entryAmount(entry(130, 1.8, { foodItem: rice, amountUnit: 'grams' }))).toEqual({ unit: 'grams', value: 180 });
    expect(entryAmount(entry(240, 2, { foodItem: bar }))).toEqual({ unit: 'servings', value: 2 });
    expect(entryAmount(entry(240, 2, { foodItem: bar, amountUnit: 'servings' }))).toEqual({ unit: 'servings', value: 2 });
  });

  it('falls back to servings when a grams entry has no serving weight', () => {
    const noWeight = { ...rice, servingGrams: undefined };
    expect(entryAmount(entry(130, 1.8, { foodItem: noWeight, amountUnit: 'grams' }))).toEqual({
      unit: 'servings',
      value: 1.8,
    });
  });

  it('maps an edited amount back to servings', () => {
    expect(servingsForAmount('grams', 90, 60)).toBe(1.5);
    expect(servingsForAmount('grams', 90, undefined)).toBe(90); // no weight known: treated as servings
    expect(servingsForAmount('servings', 2.5, 60)).toBe(2.5);
  });

  it('keeps calorie maths exact for weighed entries', () => {
    const weighed = entry(130, servingsFromGrams(180, 100), { foodItem: rice, amountUnit: 'grams' });
    expect(entryMacros(weighed).calories).toBeCloseTo(234, 5);
  });
});

describe('suggestMealType', () => {
  it('picks a meal from the time of day', () => {
    expect(suggestMealType(new Date(2026, 8, 18, 8, 0))).toBe('Breakfast');
    expect(suggestMealType(new Date(2026, 8, 18, 12, 30))).toBe('Lunch');
    expect(suggestMealType(new Date(2026, 8, 18, 19, 0))).toBe('Dinner');
    expect(suggestMealType(new Date(2026, 8, 18, 22, 15))).toBe('Snack');
  });
});

import type { MealType } from '../types';

export const MEAL_LABELS: Record<MealType, string> = {
  Breakfast: 'Breakfast',
  Lunch: 'Lunch',
  Dinner: 'Dinner',
  Snack: 'Snacks',
};

/** Pick a sensible default meal from the time of day. */
export function suggestMealType(now: Date = new Date()): MealType {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < 10 * 60 + 30) return 'Breakfast';
  if (minutes < 15 * 60) return 'Lunch';
  if (minutes < 21 * 60) return 'Dinner';
  return 'Snack';
}

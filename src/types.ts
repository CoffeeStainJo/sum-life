export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

export const MEAL_TYPES: readonly MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

/** How the user expressed an entry's amount. `servings` stays the canonical multiplier either way. */
export type AmountUnit = 'servings' | 'grams';

export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  /** kcal per one serving (as described by `servingSize`). */
  calories: number;
  /** grams per one serving */
  protein: number;
  carbs: number;
  fat: number;
  /** Human-readable description of what "1 serving" means, e.g. "100 g" or "1 bar (30 g)". */
  servingSize?: string;
  /** Weight of one serving in grams, when known. Enables logging by weight. */
  servingGrams?: number;
}

export interface JournalEntry {
  id: string;
  foodItem: FoodItem;
  servings: number;
  mealType: MealType;
  /** ISO-8601 timestamp */
  loggedAt: string;
  /** Unit the user logged in; defaults to servings. */
  amountUnit?: AmountUnit;
}

export interface DailyLog {
  /** Local date key, YYYY-MM-DD */
  date: string;
  entries: JournalEntry[];
}

export interface MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

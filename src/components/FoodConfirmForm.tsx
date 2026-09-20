import { Check } from 'lucide-react';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { AmountUnit, FoodItem, MealType } from '../types';
import { MEAL_TYPES } from '../types';
import { newId } from '../lib/id';
import { MEAL_LABELS } from '../lib/meals';
import { AMOUNT_CONFIG, fmt, gramsFromServings, servingsFromGrams } from '../lib/nutrition';
import type { Basis, FoodCandidate, MacroKey, Macros } from '../lib/openFoodFacts';
import { Stepper } from './Stepper';

interface Props {
  candidate: FoodCandidate;
  defaultMeal: MealType;
  onSubmit: (food: FoodItem, servings: number, meal: MealType, amountUnit: AmountUnit) => void;
}

interface FormValues {
  name: string;
  brand: string;
  servingSize: string;
  /** Weight of one serving in grams, as typed. */
  servingGrams: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

interface FormState {
  basis: Basis;
  values: FormValues;
  unit: AmountUnit;
  /** Amount in `unit`. */
  amount: number;
}

const MACRO_FIELDS: ReadonlyArray<{ key: MacroKey; label: string; unit: string }> = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
];

const MACRO_NAMES: Record<MacroKey, string> = {
  calories: 'calorie',
  protein: 'protein',
  carbs: 'carbohydrate',
  fat: 'fat',
};

/** Parses a non-negative number; NaN when invalid. Accepts a decimal comma. */
function parseMacro(raw: string): number {
  const n = Number.parseFloat(raw.trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : Number.NaN;
}

/** Parses a positive weight; NaN when invalid or empty. */
function parseGrams(raw: string): number {
  const n = Number.parseFloat(raw.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : Number.NaN;
}

function valuesFor(candidate: FoodCandidate, basis: Basis): FormValues {
  const serving = basis === 'serving' ? candidate.serving : undefined;
  const m = serving ? serving.macros : candidate.per100g;
  return {
    name: candidate.name,
    brand: candidate.brand ?? '',
    servingSize: serving ? serving.label : '100 g',
    servingGrams: serving ? (serving.grams ? String(serving.grams) : '') : '100',
    calories: String(m.calories),
    protein: String(m.protein),
    carbs: String(m.carbs),
    fat: String(m.fat),
  };
}

/** Weighing is the natural default when the figures are per 100 g; otherwise count servings. */
function defaultUnit(servingGrams: number): AmountUnit {
  return servingGrams === 100 ? 'grams' : 'servings';
}

function initialState(candidate: FoodCandidate, basis: Basis): FormState {
  const values = valuesFor(candidate, basis);
  const unit = defaultUnit(parseGrams(values.servingGrams));
  return { basis, values, unit, amount: unit === 'grams' ? 100 : 1 };
}

function listMissing(missing: MacroKey[]): string {
  const names = missing.map((k) => MACRO_NAMES[k]);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function FoodConfirmForm({ candidate, defaultMeal, onSubmit }: Props) {
  const canToggleBasis = candidate.source === 'openfoodfacts' && candidate.serving !== undefined;
  const [form, setForm] = useState<FormState>(() => initialState(candidate, candidate.serving ? 'serving' : '100g'));
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [error, setError] = useState<string | null>(null);
  const { basis, values, unit, amount } = form;

  const servingGrams = parseGrams(values.servingGrams);
  const canWeigh = servingGrams > 0; // NaN > 0 is false
  const effectiveUnit: AmountUnit = unit === 'grams' && canWeigh ? 'grams' : 'servings';
  const amountCfg = AMOUNT_CONFIG[effectiveUnit];

  const setField = (key: keyof FormValues) => (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setForm((f) => {
      const nextValues = { ...f.values, [key]: next };
      // Losing the serving weight while logging in grams: fall back to servings.
      if (key === 'servingGrams' && f.unit === 'grams' && !(parseGrams(next) > 0)) {
        return { ...f, values: nextValues, unit: 'servings', amount: 1 };
      }
      return { ...f, values: nextValues };
    });
    setError(null);
  };

  const switchBasis = (next: Basis) => setForm(initialState(candidate, next));

  const switchUnit = (next: AmountUnit) => {
    if (next === effectiveUnit || !canWeigh) return;
    setForm((f) => ({
      ...f,
      unit: next,
      amount: next === 'grams' ? gramsFromServings(f.amount, servingGrams) : servingsFromGrams(f.amount, servingGrams),
    }));
  };

  const setAmount = (next: number) => setForm((f) => ({ ...f, amount: next }));

  const macros: Macros = {
    calories: parseMacro(values.calories),
    protein: parseMacro(values.protein),
    carbs: parseMacro(values.carbs),
    fat: parseMacro(values.fat),
  };
  const macrosValid = Object.values(macros).every(Number.isFinite);
  const nameValid = values.name.trim().length > 0;

  const multiplier = effectiveUnit === 'grams' ? servingsFromGrams(amount, servingGrams) : amount;
  const preview = {
    calories: (macros.calories || 0) * multiplier,
    protein: (macros.protein || 0) * multiplier,
    carbs: (macros.carbs || 0) * multiplier,
    fat: (macros.fat || 0) * multiplier,
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!nameValid) {
      setError('Give the food a name.');
      return;
    }
    if (!macrosValid) {
      setError('Nutrition values must be numbers of 0 or more.');
      return;
    }
    const food: FoodItem = {
      id: newId(),
      name: values.name.trim(),
      calories: macros.calories,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      servingSize: values.servingSize.trim() || (basis === 'serving' ? '1 serving' : '100 g'),
    };
    const brand = values.brand.trim();
    if (brand) food.brand = brand;
    if (canWeigh) food.servingGrams = servingGrams;
    onSubmit(food, multiplier, meal, effectiveUnit);
  };

  return (
    <form className="confirm" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="food-name">Name</label>
        <input
          id="food-name"
          className="input"
          value={values.name}
          onChange={setField('name')}
          autoComplete="off"
          autoFocus={candidate.source === 'manual'}
          placeholder="e.g. Chicken breast"
        />
      </div>

      <div className="field">
        <label htmlFor="food-brand">
          Brand <span className="optional">optional</span>
        </label>
        <input id="food-brand" className="input" value={values.brand} onChange={setField('brand')} autoComplete="off" />
      </div>

      {canToggleBasis && candidate.serving && (
        <div className="field">
          <span className="field__label">Nutrition basis</span>
          <div className="segmented" role="radiogroup" aria-label="Nutrition basis">
            <button
              type="button"
              role="radio"
              aria-checked={basis === 'serving'}
              className={`segmented__btn${basis === 'serving' ? ' is-active' : ''}`}
              onClick={() => switchBasis('serving')}
            >
              Per serving
              <small>{candidate.serving.label}</small>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={basis === '100g'}
              className={`segmented__btn${basis === '100g' ? ' is-active' : ''}`}
              onClick={() => switchBasis('100g')}
            >
              Per 100 g
            </button>
          </div>
        </div>
      )}

      {candidate.missing.length > 0 && (
        <p className="notice notice--warn">
          Open Food Facts has no {listMissing(candidate.missing)} data for this product, so those values default to 0.
          Edit them if you know them.
        </p>
      )}

      <div className="macro-grid">
        {MACRO_FIELDS.map((field) => (
          <div key={field.key} className={`field field--${field.key}`}>
            <label htmlFor={`food-${field.key}`}>
              {field.label} <span className="unit">{field.unit}</span>
            </label>
            <input
              id={`food-${field.key}`}
              className="input"
              inputMode="decimal"
              autoComplete="off"
              value={values[field.key]}
              onChange={setField(field.key)}
              aria-invalid={!Number.isFinite(macros[field.key])}
            />
          </div>
        ))}
      </div>

      <div className="field-grid">
        <div className="field">
          <label htmlFor="food-serving">Values above are per</label>
          <input
            id="food-serving"
            className="input"
            value={values.servingSize}
            onChange={setField('servingSize')}
            placeholder="e.g. 1 bar (30 g)"
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="food-serving-grams">
            Serving weight <span className="unit">g</span>
          </label>
          <input
            id="food-serving-grams"
            className="input"
            inputMode="decimal"
            autoComplete="off"
            value={values.servingGrams}
            onChange={setField('servingGrams')}
            placeholder="e.g. 100"
          />
        </div>
      </div>
      {!canWeigh && <p className="hint">Add the weight of one serving to log this food in grams.</p>}

      <div className="field">
        <span className="field__label">Amount</span>
        <div className="amount-row">
          <Stepper
            label={amountCfg.label}
            unit={amountCfg.suffix || undefined}
            step={amountCfg.step}
            min={amountCfg.min}
            max={amountCfg.max}
            decimals={amountCfg.decimals}
            value={amount}
            onChange={setAmount}
          />
          {canWeigh && (
            <div className="segmented segmented--compact" role="radiogroup" aria-label="Amount unit">
              <button
                type="button"
                role="radio"
                aria-checked={effectiveUnit === 'grams'}
                className={`segmented__btn${effectiveUnit === 'grams' ? ' is-active' : ''}`}
                onClick={() => switchUnit('grams')}
              >
                Grams
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={effectiveUnit === 'servings'}
                className={`segmented__btn${effectiveUnit === 'servings' ? ' is-active' : ''}`}
                onClick={() => switchUnit('servings')}
              >
                Servings
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="field">
        <span className="field__label">Meal</span>
        <div className="segmented segmented--4" role="radiogroup" aria-label="Meal">
          {MEAL_TYPES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={meal === m}
              className={`segmented__btn${meal === m ? ' is-active' : ''}`}
              onClick={() => setMeal(m)}
            >
              {MEAL_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}

      <div className="confirm__footer">
        <div className="confirm__preview">
          <strong>{fmt(preview.calories)} kcal</strong>
          <span>
            P {fmt(preview.protein)} · C {fmt(preview.carbs)} · F {fmt(preview.fat)}
          </span>
        </div>
        <button type="submit" className="btn btn--primary btn--lg" disabled={!nameValid || !macrosValid}>
          <Check size={20} /> Add to {MEAL_LABELS[meal]}
        </button>
      </div>
    </form>
  );
}

import { Coffee, Cookie, Moon, Plus, Sun, type LucideIcon } from 'lucide-react';
import type { JournalEntry, MealType } from '../types';
import { MEAL_LABELS } from '../lib/meals';
import { fmt, sumMacros } from '../lib/nutrition';
import { EntryRow } from './EntryRow';

const ICONS: Record<MealType, LucideIcon> = {
  Breakfast: Coffee,
  Lunch: Sun,
  Dinner: Moon,
  Snack: Cookie,
};

interface Props {
  meal: MealType;
  entries: JournalEntry[];
  onAdd: (meal: MealType) => void;
  onChangeServings: (entryId: string, servings: number) => void;
  onRemove: (entryId: string) => void;
}

export function MealSection({ meal, entries, onAdd, onChangeServings, onRemove }: Props) {
  const Icon = ICONS[meal];
  const label = MEAL_LABELS[meal];
  const totals = sumMacros(entries);

  return (
    <section className="meal" aria-labelledby={`meal-${meal}`}>
      <header className="meal__header">
        <span className="meal__icon" aria-hidden="true">
          <Icon size={18} />
        </span>
        <h2 id={`meal-${meal}`} className="meal__title">
          {label}
        </h2>
        <span className="meal__kcal">{entries.length > 0 ? `${fmt(totals.calories)} kcal` : ''}</span>
        <button
          type="button"
          className="icon-btn icon-btn--accent"
          aria-label={`Add to ${label}`}
          onClick={() => onAdd(meal)}
        >
          <Plus size={20} />
        </button>
      </header>
      {entries.length > 0 ? (
        <ul className="meal__list">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} onChangeServings={onChangeServings} onRemove={onRemove} />
          ))}
        </ul>
      ) : (
        <p className="meal__empty">Nothing logged yet.</p>
      )}
    </section>
  );
}

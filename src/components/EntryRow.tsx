import { Trash2 } from 'lucide-react';
import type { JournalEntry } from '../types';
import { AMOUNT_CONFIG, entryAmount, entryMacros, fmt, servingsForAmount } from '../lib/nutrition';
import { Stepper } from './Stepper';

interface Props {
  entry: JournalEntry;
  onChangeServings: (entryId: string, servings: number) => void;
  onRemove: (entryId: string) => void;
}

export function EntryRow({ entry, onChangeServings, onRemove }: Props) {
  const { foodItem } = entry;
  const macros = entryMacros(entry);
  const amount = entryAmount(entry);
  const cfg = AMOUNT_CONFIG[amount.unit];
  const meta = [foodItem.brand, foodItem.servingSize].filter(Boolean).join(' · ');

  return (
    <li className="entry">
      <div className="entry__main">
        <div className="entry__info">
          <span className="entry__name">{foodItem.name}</span>
          {meta && <span className="entry__meta">{meta}</span>}
        </div>
        <span className="entry__kcal">
          {fmt(macros.calories)} <small>kcal</small>
        </span>
      </div>
      <div className="entry__controls">
        <span className="entry__macros" aria-label="Macros">
          <b className="c-protein">P</b> {fmt(macros.protein)}
          <b className="c-carbs">C</b> {fmt(macros.carbs)}
          <b className="c-fat">F</b> {fmt(macros.fat)}
        </span>
        <Stepper
          size="sm"
          label={cfg.label}
          unit={cfg.suffix || undefined}
          step={cfg.step}
          min={cfg.min}
          max={cfg.max}
          decimals={cfg.decimals}
          value={amount.value}
          onChange={(v) => onChangeServings(entry.id, servingsForAmount(amount.unit, v, foodItem.servingGrams))}
        />
        <button
          type="button"
          className="icon-btn icon-btn--danger"
          aria-label={`Delete ${foodItem.name}`}
          onClick={() => onRemove(entry.id)}
        >
          <Trash2 size={18} />
        </button>
      </div>
    </li>
  );
}

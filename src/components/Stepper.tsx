import { Minus, Plus } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { formatAmount, roundAmount } from '../lib/nutrition';

interface Props {
  value: number;
  onChange: (value: number) => void;
  label: string;
  step: number;
  min: number;
  max: number;
  /** Decimals shown while not editing. */
  decimals?: number;
  /** Short unit rendered after the number, e.g. "g". */
  unit?: string;
  size?: 'sm' | 'md';
}

/** ± buttons around a directly editable number. Free-typed values are applied on blur / Enter. */
export function Stepper({ value, onChange, label, step, min, max, decimals = 2, unit, size = 'md' }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => formatAmount(value, decimals));
  const [syncedValue, setSyncedValue] = useState(value);

  // Keep the text in sync with the prop unless the user is mid-edit.
  if (!editing && value !== syncedValue) {
    setSyncedValue(value);
    setDraft(formatAmount(value, decimals));
  }

  const clamp = (n: number) => Math.min(max, Math.max(min, roundAmount(n)));

  const commit = () => {
    setEditing(false);
    const parsed = Number.parseFloat(draft.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) {
      const next = clamp(parsed);
      setDraft(formatAmount(next, decimals));
      if (next !== value) onChange(next);
    } else {
      setDraft(formatAmount(value, decimals));
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  const stepBy = (direction: 1 | -1) => onChange(clamp(value + direction * step));

  return (
    <div className={`stepper stepper--${size}`}>
      <button
        type="button"
        className="stepper__btn"
        aria-label={`Decrease ${label.toLowerCase()}`}
        onClick={() => stepBy(-1)}
        disabled={value <= min}
      >
        <Minus size={18} />
      </button>
      <input
        className="stepper__input"
        aria-label={label}
        inputMode="decimal"
        autoComplete="off"
        value={draft}
        onFocus={(e) => {
          setEditing(true);
          // Select the current number so typing on a phone replaces it instead of appending.
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      {unit && (
        <span className="stepper__unit" aria-hidden="true">
          {unit}
        </span>
      )}
      <button
        type="button"
        className="stepper__btn"
        aria-label={`Increase ${label.toLowerCase()}`}
        onClick={() => stepBy(1)}
        disabled={value >= max}
      >
        <Plus size={18} />
      </button>
    </div>
  );
}

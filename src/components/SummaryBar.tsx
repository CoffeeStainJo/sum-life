import type { MacroTotals } from '../types';
import { fmt } from '../lib/nutrition';

const TILES = [
  { key: 'calories', label: 'kcal', unit: '' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
] as const;

export function SummaryBar({ totals }: { totals: MacroTotals }) {
  return (
    <section className="summary" aria-label="Today's totals">
      {TILES.map((tile) => (
        <div key={tile.key} className={`summary__tile summary__tile--${tile.key}`}>
          <span className="summary__value">
            {fmt(totals[tile.key])}
            {tile.unit && <small>{tile.unit}</small>}
          </span>
          <span className="summary__label">{tile.label}</span>
        </div>
      ))}
    </section>
  );
}

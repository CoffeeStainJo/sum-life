import type { Ref } from 'react';
import type { MacroTotals } from '../types';
import { energySplit, fmt, fmtGrouped } from '../lib/nutrition';

const MACROS = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
] as const;

interface Props {
  totals: MacroTotals;
  /** e.g. "Saturday, 7 Nov" */
  dateLabel: string;
  ref?: Ref<HTMLElement>;
}

/** The day at a glance: total kcal, and how that energy splits across protein, carbs and fat. */
export function SummaryBar({ totals, dateLabel, ref }: Props) {
  const split = energySplit(totals);
  const hasData = totals.calories > 0 || totals.protein + totals.carbs + totals.fat > 0;
  const pct = (share: number) => Math.round(share * 100);
  const splitLabel = hasData
    ? `Energy split: ${pct(split.protein)}% protein, ${pct(split.carbs)}% carbs, ${pct(split.fat)}% fat`
    : 'Nothing logged yet';

  return (
    <section ref={ref} className="hero" aria-label="Today's totals">
      <p className="hero__date">{dateLabel}</p>
      <p className="hero__kcal">
        <span className="hero__num">{fmtGrouped(totals.calories)}</span>
        <span className="hero__unit">kcal</span>
      </p>
      <p className="hero__caption">{hasData ? 'eaten so far today' : 'A fresh page. What’s first?'}</p>

      <div className={`split${hasData ? '' : ' split--empty'}`} role="img" aria-label={splitLabel}>
        {MACROS.map(({ key }) => (
          <span key={key} className={`split__seg split__seg--${key}`} style={{ flexGrow: split[key] }} />
        ))}
      </div>

      <ul className="legend">
        {MACROS.map(({ key, label }) => (
          <li key={key} className={`legend__item legend__item--${key}`}>
            <span className="legend__dot" aria-hidden="true" />
            <span className="legend__label">{label}</span>
            <span className="legend__value">
              {fmt(totals[key])}
              <small>g</small>
            </span>
            {hasData && <span className="legend__pct">{pct(split[key])}%</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

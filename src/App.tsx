import { Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MealType } from './types';
import { MEAL_TYPES } from './types';
import { useDailyJournal } from './hooks/useDailyJournal';
import { formatDateHeading } from './lib/dates';
import { suggestMealType } from './lib/meals';
import { fmtGrouped } from './lib/nutrition';
import { AddFoodDrawer } from './components/AddFoodDrawer';
import { CopyYesterdayButton } from './components/CopyYesterdayButton';
import { MealSection } from './components/MealSection';
import { SummaryBar } from './components/SummaryBar';

interface DrawerState {
  open: boolean;
  meal: MealType;
}

export default function App() {
  const journal = useDailyJournal();
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, meal: 'Breakfast' });

  const openDrawer = useCallback((meal?: MealType) => {
    setDrawer({ open: true, meal: meal ?? suggestMealType() });
  }, []);
  const closeDrawer = useCallback(() => setDrawer((d) => ({ ...d, open: false })), []);

  // Once the big summary scrolls away, show a compact kcal count in the top bar.
  const mainRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const [heroHidden, setHeroHidden] = useState(false);
  useEffect(() => {
    const root = mainRef.current;
    const hero = heroRef.current;
    if (!root || !hero || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setHeroHidden(entry.intersectionRatio < 0.3), {
      root,
      threshold: 0.3,
    });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="app">
      <header className={`topbar${heroHidden ? ' is-condensed' : ''}`}>
        <h1 className="wordmark">
          Sum <em>Life</em>
        </h1>
        <p className="topbar__kcal" aria-hidden={!heroHidden}>
          {fmtGrouped(journal.totals.calories)} <small>kcal</small>
        </p>
      </header>

      <main ref={mainRef} className="app__main">
        <SummaryBar ref={heroRef} totals={journal.totals} dateLabel={formatDateHeading(journal.date)} />

        {journal.canCopyYesterday && (
          <CopyYesterdayButton
            entryCount={journal.yesterdayEntryCount}
            calories={journal.yesterdayTotals.calories}
            onCopy={journal.copyYesterday}
          />
        )}

        {MEAL_TYPES.map((meal) => (
          <MealSection
            key={meal}
            meal={meal}
            entries={journal.entriesByMeal[meal]}
            onAdd={openDrawer}
            onChangeServings={journal.updateServings}
            onRemove={journal.removeEntry}
          />
        ))}
      </main>

      <button type="button" className="fab" onClick={() => openDrawer()}>
        <Plus size={22} strokeWidth={2.5} aria-hidden="true" />
        <span>Add food</span>
      </button>

      <AddFoodDrawer open={drawer.open} initialMeal={drawer.meal} onClose={closeDrawer} onAdd={journal.addEntry} />
    </div>
  );
}

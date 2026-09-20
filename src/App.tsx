import { Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { MealType } from './types';
import { MEAL_TYPES } from './types';
import { useDailyJournal } from './hooks/useDailyJournal';
import { formatDateHeading } from './lib/dates';
import { suggestMealType } from './lib/meals';
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

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Sum Life</h1>
        <p className="app__date">{formatDateHeading(journal.date)}</p>
      </header>

      <SummaryBar totals={journal.totals} />

      <main className="app__main">
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

      <button type="button" className="fab" aria-label="Add food" onClick={() => openDrawer()}>
        <Plus size={28} />
      </button>

      <AddFoodDrawer open={drawer.open} initialMeal={drawer.meal} onClose={closeDrawer} onAdd={journal.addEntry} />
    </div>
  );
}

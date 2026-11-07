import { ChevronLeft, ScanBarcode, Search, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { AmountUnit, FoodItem, MealType } from '../types';
import { useBarcodeLookup, type BarcodeLookup } from '../hooks/useBarcodeLookup';
import { useFoodSearch } from '../hooks/useFoodSearch';
import { primeAudio } from '../lib/feedback';
import { emptyCandidate, type FoodCandidate } from '../lib/openFoodFacts';
// Light on its own: the zxing decoder lives in a Web Worker that loads only when the camera starts.
import { BarcodeScanner } from './BarcodeScanner';
import { FoodConfirmForm } from './FoodConfirmForm';
import { FoodSearchTab } from './FoodSearchTab';

type Tab = 'search' | 'scan';

interface Props {
  open: boolean;
  initialMeal: MealType;
  onClose: () => void;
  onAdd: (food: FoodItem, servings: number, meal: MealType, amountUnit: AmountUnit) => void;
}

/**
 * Bottom sheet for adding food. The content is mounted fresh on every open, which resets
 * search/scan state and guarantees the camera is released on close.
 */
export function AddFoodDrawer({ open, ...rest }: Props) {
  if (!open) return null;
  return <DrawerContent {...rest} />;
}

function DrawerContent({ initialMeal, onClose, onAdd }: Omit<Props, 'open'>) {
  const [tab, setTab] = useState<Tab>('search');
  const [candidate, setCandidate] = useState<FoodCandidate | null>(null);
  const search = useFoodSearch();
  const lookup = useBarcodeLookup();
  const { status: lookupStatus, candidate: lookupCandidate, reset: resetLookup } = lookup;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A successful barcode lookup jumps straight to the confirm form.
  useEffect(() => {
    if (lookupStatus === 'found' && lookupCandidate) setCandidate(lookupCandidate);
  }, [lookupStatus, lookupCandidate]);

  const back = useCallback(() => {
    setCandidate(null);
    resetLookup();
  }, [resetLookup]);

  const startManual = useCallback(() => setCandidate(emptyCandidate()), []);

  const handleSubmit = useCallback(
    (food: FoodItem, servings: number, meal: MealType, amountUnit: AmountUnit) => {
      onAdd(food, servings, meal, amountUnit);
      onClose();
    },
    [onAdd, onClose],
  );

  const title = candidate ? (candidate.source === 'manual' ? 'Add food manually' : 'Confirm food') : 'Add food';

  return (
    <div className="drawer-root">
      <div className="drawer__backdrop" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer__grip" aria-hidden="true" />
        <header className="drawer__header">
          {candidate ? (
            <button type="button" className="icon-btn" aria-label="Back" onClick={back}>
              <ChevronLeft size={22} />
            </button>
          ) : (
            <span className="icon-btn icon-btn--spacer" aria-hidden="true" />
          )}
          <h2 id="drawer-title" className="drawer__title">
            {title}
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={22} />
          </button>
        </header>

        {candidate ? (
          <div className="drawer__body">
            <FoodConfirmForm candidate={candidate} defaultMeal={initialMeal} onSubmit={handleSubmit} />
          </div>
        ) : (
          <>
            <div className="tabs" role="tablist" aria-label="How to add food">
              <button
                type="button"
                role="tab"
                id="tab-search"
                aria-selected={tab === 'search'}
                aria-controls="panel-search"
                className={`tabs__tab${tab === 'search' ? ' is-active' : ''}`}
                onClick={() => setTab('search')}
              >
                <Search size={18} /> Search
              </button>
              <button
                type="button"
                role="tab"
                id="tab-scan"
                aria-selected={tab === 'scan'}
                aria-controls="panel-scan"
                className={`tabs__tab${tab === 'scan' ? ' is-active' : ''}`}
                onClick={() => {
                  // The camera starts on its own, so unlock the success beep (iOS) with this tap.
                  primeAudio();
                  setTab('scan');
                }}
              >
                <ScanBarcode size={18} /> Scan
              </button>
            </div>
            <div className="drawer__body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
              {tab === 'search' ? (
                <FoodSearchTab search={search} onPick={setCandidate} onManual={startManual} />
              ) : (
                <ScanTab lookup={lookup} onManual={startManual} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ScanTab({ lookup, onManual }: { lookup: BarcodeLookup; onManual: () => void }) {
  return (
    <div className="scan-tab">
      {/* Stays frozen on the captured frame until the lookup is reset ("Scan again"). */}
      <BarcodeScanner
        onDetected={lookup.lookup}
        paused={lookup.status !== 'idle'}
        statusText={lookup.status === 'loading' ? `Looking up ${lookup.barcode ?? ''}…` : null}
      />

      {lookup.status === 'not-found' && (
        <div className="notice notice--warn" role="status">
          <p>
            Open Food Facts has no product with barcode <b>{lookup.barcode}</b>.
          </p>
          <div className="notice__actions">
            <button type="button" className="btn btn--ghost" onClick={lookup.reset}>
              Scan again
            </button>
            <button type="button" className="btn btn--primary" onClick={onManual}>
              Enter manually
            </button>
          </div>
        </div>
      )}

      {lookup.status === 'error' && (
        <div className="notice notice--error" role="alert">
          <p>{lookup.error}</p>
          <div className="notice__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => lookup.barcode && lookup.lookup(lookup.barcode)}
            >
              Retry
            </button>
            <button type="button" className="btn btn--ghost" onClick={lookup.reset}>
              Scan again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { PencilLine, Search } from 'lucide-react';
import type { FoodSearch } from '../hooks/useFoodSearch';
import { fmt } from '../lib/nutrition';
import type { FoodCandidate } from '../lib/openFoodFacts';
import { Spinner } from './Spinner';

interface Props {
  search: FoodSearch;
  onPick: (candidate: FoodCandidate) => void;
  onManual: () => void;
}

export function FoodSearchTab({ search, onPick, onManual }: Props) {
  const { query, setQuery, results, status, error, isEmpty, retry } = search;

  return (
    <div className="search">
      <label className="search__bar">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          className="search__input"
          placeholder="Search Open Food Facts"
          aria-label="Search foods"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <button type="button" className="btn btn--ghost btn--block" onClick={onManual}>
        <PencilLine size={18} /> Enter food manually
      </button>

      {status === 'idle' && (
        <p className="hint">
          Type at least two characters. Results come from the community-maintained Open Food Facts database.
        </p>
      )}
      {status === 'loading' && <Spinner label="Searching…" />}
      {status === 'error' && (
        <div className="notice notice--error" role="alert">
          <p>{error}</p>
          <div className="notice__actions">
            <button type="button" className="btn btn--ghost" onClick={retry}>
              Retry
            </button>
          </div>
        </div>
      )}
      {isEmpty && <p className="notice">No products found for “{query.trim()}”.</p>}

      {results.length > 0 && (
        <ul className="results">
          {results.map((candidate, index) => {
            const basis = candidate.serving ?? { label: '100 g', macros: candidate.per100g };
            return (
              <li key={`${candidate.barcode ?? candidate.name}-${index}`}>
                <button type="button" className="result" onClick={() => onPick(candidate)}>
                  <span className="result__name">{candidate.name}</span>
                  <span className="result__meta">
                    {candidate.brand ? `${candidate.brand} · ` : ''}
                    {fmt(basis.macros.calories)} kcal per {basis.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

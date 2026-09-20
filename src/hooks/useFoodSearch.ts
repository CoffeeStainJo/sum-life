import { useEffect, useState } from 'react';
import { errorMessage } from '../lib/errors';
import { searchProducts, type FoodCandidate } from '../lib/openFoodFacts';

export type SearchStatus = 'idle' | 'loading' | 'success' | 'error';

export interface FoodSearch {
  query: string;
  setQuery: (query: string) => void;
  results: FoodCandidate[];
  status: SearchStatus;
  error: string | null;
  /** A completed search that returned nothing. */
  isEmpty: boolean;
  /** Re-run the current query (after an error). */
  retry: () => void;
}

const DEFAULT_DEBOUNCE_MS = 400;
const DEFAULT_MIN_LENGTH = 2;

/** Debounced Open Food Facts text search. Stale responses are discarded via AbortController. */
export function useFoodSearch(debounceMs = DEFAULT_DEBOUNCE_MS, minLength = DEFAULT_MIN_LENGTH): FoodSearch {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodCandidate[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < minLength) {
      setResults([]);
      setStatus('idle');
      setError(null);
      return;
    }

    const controller = new AbortController();
    setStatus('loading');
    setError(null);

    const timer = window.setTimeout(async () => {
      try {
        const found = await searchProducts(term, controller.signal);
        if (controller.signal.aborted) return;
        setResults(found);
        setStatus('success');
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(errorMessage(err) || 'Search failed.');
        setStatus('error');
      }
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, debounceMs, minLength, attempt]);

  return {
    query,
    setQuery,
    results,
    status,
    error,
    isEmpty: status === 'success' && results.length === 0,
    retry: () => setAttempt((n) => n + 1),
  };
}

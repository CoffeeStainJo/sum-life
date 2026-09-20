import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/errors';
import { fetchProductByBarcode, normalizeBarcode, type FoodCandidate } from '../lib/openFoodFacts';

export type LookupStatus = 'idle' | 'loading' | 'found' | 'not-found' | 'error';

export interface BarcodeLookup {
  status: LookupStatus;
  barcode: string | null;
  candidate: FoodCandidate | null;
  error: string | null;
  lookup: (barcode: string) => void;
  reset: () => void;
}

/** Resolve a scanned or typed barcode to a FoodCandidate via Open Food Facts. */
export function useBarcodeLookup(): BarcodeLookup {
  const [status, setStatus] = useState<LookupStatus>('idle');
  const [barcode, setBarcode] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<FoodCandidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const lookup = useCallback((raw: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const code = normalizeBarcode(raw);
    setBarcode(code);
    setCandidate(null);
    setError(null);
    setStatus('loading');

    void (async () => {
      try {
        const found = await fetchProductByBarcode(code, controller.signal);
        if (controller.signal.aborted) return;
        if (found) {
          setCandidate(found);
          setStatus('found');
        } else {
          setStatus('not-found');
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(errorMessage(err) || 'Lookup failed.');
        setStatus('error');
      }
    })();
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStatus('idle');
    setBarcode(null);
    setCandidate(null);
    setError(null);
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { status, barcode, candidate, error, lookup, reset };
}

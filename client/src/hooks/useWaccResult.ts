import { useEffect, useRef, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import type { WACCInputs, WACCResult } from '@shared/types';
import { postCalculate } from '../api/wacc';

// Heaviness-based debounce: a radio toggle (Damodaran ↔ Kroll) shouldn't wait 800ms; a ticker
// edit or a valuation-date change hits FRED/FMP and deserves a longer window so we don't burn
// the quota on every keystroke.
const DEBOUNCE_LIGHT = 250;
const DEBOUNCE_HEAVY = 800;

// Fields whose change requires upstream (FRED/FMP) re-fetch → longer debounce.
const HEAVY_KEYS: ReadonlyArray<keyof WACCInputs> = [
  'valuationDate',
  'currency',
  'waccMethodology',
  'countryOperations',
  'countryHQ',
  'industry',
  'companySize',
];

function heavyFingerprint(i: WACCInputs): string {
  return (
    HEAVY_KEYS.map((k) => JSON.stringify(i[k])).join('|') +
    '|' + i.minBound.comparableTickers + '|' + i.maxBound.comparableTickers +
    '|' + i.minBound.analogTickers + '|' + i.maxBound.analogTickers
  );
}

export function useWaccResult(inputs: WACCInputs, isValid: boolean) {
  const [result, setResult] = useState<WACCResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSentRef = useRef<string | null>(null);
  const lastHeavyRef = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);

  const runCalculation = async (next: WACCInputs) => {
    const key = JSON.stringify(next);
    if (key === lastSentRef.current) return; // dedupe identical payloads
    lastSentRef.current = key;

    // Cancel any in-flight request so fast successive changes don't race (last-one-wins).
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    try {
      const r = await postCalculate(next, ac.signal);
      if (!ac.signal.aborted) {
        setResult(r);
        setError(null);
      }
    } catch (err) {
      if (ac.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Calculation failed');
      // Keep the last successful result visible — stale data is better than a blank panel
      // during live-edit sessions.
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  };

  const debouncedLight = useDebouncedCallback(runCalculation, DEBOUNCE_LIGHT);
  const debouncedHeavy = useDebouncedCallback(runCalculation, DEBOUNCE_HEAVY);

  useEffect(() => {
    if (!isValid) return;
    const heavyKey = heavyFingerprint(inputs);
    const isHeavy = heavyKey !== lastHeavyRef.current;
    lastHeavyRef.current = heavyKey;
    if (isHeavy) {
      debouncedLight.cancel();
      debouncedHeavy(inputs);
    } else {
      debouncedHeavy.cancel();
      debouncedLight(inputs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, isValid]);

  return { result, loading, error };
}

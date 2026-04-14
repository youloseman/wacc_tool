import { useCallback, useState } from 'react';
import type { WACCInputs, WACCResult } from '@shared/types';
import { postCalculate } from '../api/wacc';

export function useWaccResult() {
  const [result, setResult] = useState<WACCResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculate = useCallback(async (inputs: WACCInputs) => {
    setLoading(true);
    setError(null);
    try {
      const r = await postCalculate(inputs);
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calculation failed');
    } finally {
      setLoading(false);
    }
  }, []);

  return { result, loading, error, calculate };
}

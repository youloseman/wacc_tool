import { useEffect, useState } from 'react';
import type { Currency, WACCMethodology } from '@shared/types';

interface RfData {
  rate: number;
  date: string;
  series: string;
  source: string;
  description: string;
  fallback?: boolean;
  effectiveCurrency?: string;
  isStatic?: boolean;
}

interface State {
  loading: boolean;
  data: RfData | null;
  error: string | null;
}

export function useRiskFreeRate(
  currency: Currency,
  country: string,
  methodology: WACCMethodology,
  horizon: '10Y' = '10Y',
): State {
  const [state, setState] = useState<State>({ loading: true, data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null, error: null });
    (async () => {
      try {
        const url = `/api/risk-free-rate?currency=${encodeURIComponent(currency)}&horizon=${horizon}&country=${encodeURIComponent(country)}&methodology=${methodology}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as RfData;
        if (cancelled) return;
        setState({ loading: false, data, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          data: null,
          error: err instanceof Error ? err.message : 'failed',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currency, country, methodology, horizon]);

  return state;
}

import { cache, TTL } from './cache.js';
import { getEMRate } from './emRates.ts';

export type Currency = 'USD' | 'EUR' | 'GBP' | 'CHF';
export type Horizon = '5Y' | '10Y' | '20Y' | '30Y';
export type Methodology = 'hard_currency' | 'local_currency';

export interface RiskFreeRateResult {
  rate: number;
  date: string;
  series: string;
  source: string;
  description: string;
  fallback?: boolean;
  effectiveCurrency?: string;
  isStatic?: boolean;
}

const SERIES_MAP: Partial<Record<Currency, Partial<Record<Horizon, { id: string; label: string }>>>> = {
  USD: {
    '5Y': { id: 'DGS5', label: '5-Year US Treasury yield' },
    '10Y': { id: 'DGS10', label: '10-Year US Treasury yield' },
    '20Y': { id: 'DGS20', label: '20-Year US Treasury yield' },
    '30Y': { id: 'DGS30', label: '30-Year US Treasury yield' },
  },
  EUR: {
    '10Y': { id: 'IRLTLT01EZM156N', label: 'Euro area 10Y government bond' },
  },
  GBP: {
    '10Y': { id: 'IRLTLT01GBM156N', label: 'UK 10Y government bond' },
  },
  CHF: {
    '10Y': { id: 'IRLTLT01CHM156N', label: 'Switzerland 10Y government bond' },
  },
};

const FALLBACK_RATES: Record<Currency, number> = {
  USD: 0.0425,
  EUR: 0.025,
  GBP: 0.042,
  CHF: 0.012,
};

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations?: FredObservation[];
}

export async function getRiskFreeRate(
  currency: Currency,
  horizon: Horizon = '10Y',
  country?: string,
  methodology: Methodology = 'hard_currency',
): Promise<RiskFreeRateResult> {
  if (methodology === 'local_currency' && country) {
    const em = getEMRate(country);
    if (em) {
      return {
        rate: em.rate10Y,
        date: em.asOfDate,
        series: 'Local 10Y govt bond',
        source: em.rateSource,
        description: `${country} 10Y government bond yield (local currency, as of ${em.asOfDate})`,
        effectiveCurrency: em.currency,
        isStatic: true,
      };
    }
    // No EM data for this country → fall through to hard-currency behavior.
  }
  const currencyMap = SERIES_MAP[currency];
  const series = currencyMap?.[horizon] ?? currencyMap?.['10Y'];
  if (!series) {
    return {
      rate: FALLBACK_RATES[currency],
      date: 'N/A',
      series: 'N/A',
      source: 'Fallback (no FRED series)',
      description: `Fallback risk-free rate for ${currency}`,
      fallback: true,
    };
  }

  const cacheKey = `rf:${series.id}`;
  const cached = cache.get<RiskFreeRateResult>(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return {
      rate: FALLBACK_RATES[currency],
      date: 'N/A',
      series: series.id,
      source: 'FRED (fallback — missing API key)',
      description: series.label,
      fallback: true,
    };
  }

  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${series.id}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=10`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FRED ${res.status}`);
    const json = (await res.json()) as FredResponse;
    const obs = (json.observations ?? []).find((o) => o.value !== '.' && !Number.isNaN(Number(o.value)));
    if (!obs) throw new Error('No valid observation');
    const result: RiskFreeRateResult = {
      rate: Number(obs.value) / 100,
      date: obs.date,
      series: series.id,
      source: 'FRED',
      description: `${series.label} as of ${obs.date}`,
    };
    cache.set(cacheKey, result, TTL.DAY);
    return result;
  } catch {
    return {
      rate: FALLBACK_RATES[currency],
      date: 'N/A',
      series: series.id,
      source: 'FRED (cached fallback)',
      description: `${series.label} (fallback)`,
      fallback: true,
    };
  }
}

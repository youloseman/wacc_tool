import { cache, TTL } from './cache.ts';

export interface MonthlyPrice {
  date: string; // YYYY-MM-DD (last trading day of the month)
  adjClose: number;
}

export interface HistoricalPriceResult {
  symbol: string;
  prices: MonthlyPrice[];
  source: string;
  rawDataPoints: number;
}

interface FmpHistoricalEntry {
  date: string;
  adjClose?: number;
  close?: number;
}

const FMP_BASE = 'https://financialmodelingprep.com/stable';

// Map our market symbol "^GSPC" → FMP accepts both ^GSPC and SPY; SPY is more reliable on free tier.
function resolveMarketSymbol(symbol: string): string {
  if (symbol === '^GSPC') return 'SPY';
  return symbol;
}

// Take the LAST trading day's adjClose for each year-month.
function resampleMonthly(daily: FmpHistoricalEntry[]): MonthlyPrice[] {
  if (!daily.length) return [];
  // daily is oldest-first after our sort.
  const byMonth = new Map<string, FmpHistoricalEntry>();
  for (const row of daily) {
    if (!row.date) continue;
    const ym = row.date.slice(0, 7); // YYYY-MM
    byMonth.set(ym, row); // last write wins → last trading day of month since sorted asc
  }
  const out: MonthlyPrice[] = [];
  for (const [, row] of byMonth) {
    const price = row.adjClose ?? row.close;
    if (price == null) continue;
    out.push({ date: row.date, adjClose: price });
  }
  return out;
}

export async function getMonthlyPrices(
  symbol: string,
  from: string,
  to: string,
): Promise<HistoricalPriceResult> {
  const apiKey = process.env.FMP_API_KEY;
  const resolved = resolveMarketSymbol(symbol);
  const isMarket = symbol === '^GSPC' || symbol === 'SPY';
  const ttl = isMarket ? TTL.MONTH : TTL.WEEK;
  const cacheKey = `hist:${resolved}:${from}:${to}`;
  const cached = cache.get<HistoricalPriceResult>(cacheKey);
  if (cached) return cached;

  if (!apiKey) {
    return { symbol: resolved, prices: [], source: 'no-api-key', rawDataPoints: 0 };
  }

  try {
    const url = `${FMP_BASE}/historical-price-eod/full?symbol=${encodeURIComponent(resolved)}&from=${from}&to=${to}&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      const empty: HistoricalPriceResult = {
        symbol: resolved,
        prices: [],
        source: `fmp-error-${res.status}`,
        rawDataPoints: 0,
      };
      cache.set(cacheKey, empty, 600);
      return empty;
    }
    const body = (await res.json()) as FmpHistoricalEntry[] | { 'Error Message'?: string };
    const hist = Array.isArray(body) ? body : null;
    if (!hist || hist.length === 0) {
      const empty: HistoricalPriceResult = {
        symbol: resolved,
        prices: [],
        source: 'fmp-empty',
        rawDataPoints: 0,
      };
      cache.set(cacheKey, empty, 600);
      return empty;
    }
    // Sort ascending by date.
    const sorted = [...hist].sort((a, b) => a.date.localeCompare(b.date));
    const monthly = resampleMonthly(sorted);
    const result: HistoricalPriceResult = {
      symbol: resolved,
      prices: monthly,
      source: `FMP historical ${resolved}`,
      rawDataPoints: sorted.length,
    };
    cache.set(cacheKey, result, ttl);
    return result;
  } catch {
    return { symbol: resolved, prices: [], source: 'fmp-exception', rawDataPoints: 0 };
  }
}

export function subtractYears(isoDate: string, years: number): string {
  const d = new Date(isoDate);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

import yahooFinance from 'yahoo-finance2';
import { cache, TTL } from './cache.ts';

// Silence yahoo-finance2 noisy notices on startup (survey + validation warnings).
try {
  (yahooFinance as any).suppressNotices?.(['yahooSurvey', 'ripHistorical']);
  (yahooFinance as any).setGlobalConfig?.({ validation: { logErrors: false, logOptionsErrors: false } });
} catch {
  // no-op: older/newer versions may rename these APIs.
}

export interface YahooFundamentals {
  ticker: string;
  name: string;
  exchange: string;
  country: string;
  sector: string;
  industry: string;
  marketCap: number;
  currency: string;
  leveredBeta: number | null;
  unleveredBeta: number | null;
  deRatio: number | null;
  totalDebt: number | null;
  taxRate: number;
}

// Common exchange suffixes tried when a bare ticker returns nothing.
export const EXCHANGE_SUFFIXES = [
  '', // as-is (US default)
  '.L', // London
  '.PA', // Euronext Paris
  '.AS', // Euronext Amsterdam
  '.DE', // Frankfurt XETRA
  '.MI', // Milan
  '.MC', // Madrid
  '.BR', // Brussels
  '.ST', // Stockholm
  '.OL', // Oslo
  '.HE', // Helsinki
  '.CO', // Copenhagen
  '.SW', // Swiss
  '.VI', // Vienna
  '.WA', // Warsaw
  '.HK', // Hong Kong
  '.T', // Tokyo
  '.SS', // Shanghai
  '.SZ', // Shenzhen
  '.KS', // Korea
  '.TW', // Taiwan
  '.SR', // Saudi Tadawul
  '.ME', // Moscow
  '.TO', // Toronto
  '.SA', // Sao Paulo
  '.MX', // Mexico
  '.AX', // Australia
  '.NS', // India NSE
  '.BO', // India BSE
  '.JO', // Johannesburg
];

function computeFundamentals(qs: {
  symbol: string;
  shortName?: string | null;
  longName?: string | null;
  exchange?: string | null;
  fullExchangeName?: string | null;
  financialCurrency?: string | null;
  currency?: string | null;
  marketCap?: number | null;
  beta?: number | null;
  totalDebt?: number | null;
  effectiveTaxRate?: number | null;
  sector?: string | null;
  industry?: string | null;
  country?: string | null;
}): YahooFundamentals {
  const marketCap = qs.marketCap ?? 0;
  const totalDebt = qs.totalDebt ?? 0;
  const deRatio = marketCap > 0 ? totalDebt / marketCap : null;
  const taxRate =
    qs.effectiveTaxRate != null ? Math.max(0, Math.min(0.5, qs.effectiveTaxRate)) : 0.25;
  const leveredBeta = qs.beta ?? null;
  const unleveredBeta =
    leveredBeta != null && deRatio != null
      ? leveredBeta / (1 + (1 - taxRate) * deRatio)
      : null;

  return {
    ticker: qs.symbol,
    name: qs.shortName || qs.longName || qs.symbol,
    exchange: qs.fullExchangeName || qs.exchange || '',
    country: qs.country || '',
    sector: qs.sector || '',
    industry: qs.industry || '',
    marketCap,
    currency: qs.currency || qs.financialCurrency || 'USD',
    leveredBeta: leveredBeta != null ? Number(leveredBeta.toFixed(4)) : null,
    unleveredBeta: unleveredBeta != null ? Number(unleveredBeta.toFixed(4)) : null,
    deRatio: deRatio != null ? Number(deRatio.toFixed(4)) : null,
    totalDebt,
    taxRate: Number(taxRate.toFixed(4)),
  };
}

// Fetch quoteSummary → price, summaryProfile, summaryDetail, defaultKeyStatistics, financialData.
export async function yahooLookup(symbol: string): Promise<YahooFundamentals | null> {
  const cacheKey = `yh:${symbol.toUpperCase()}`;
  const cached = cache.get<YahooFundamentals>(cacheKey);
  if (cached) return cached;

  try {
    const res = await yahooFinance.quoteSummary(symbol, {
      modules: [
        'price',
        'summaryProfile',
        'summaryDetail',
        'defaultKeyStatistics',
        'financialData',
      ],
    });
    const price = res.price ?? null;
    const sp = res.summaryProfile ?? null;
    const sd = res.summaryDetail ?? null;
    const ks = res.defaultKeyStatistics ?? null;
    const fd = res.financialData ?? null;
    if (!price?.symbol || price.marketCap == null) return null;

    const fundamentals = computeFundamentals({
      symbol: price.symbol,
      shortName: price.shortName ?? null,
      longName: price.longName ?? null,
      exchange: price.exchangeName ?? null,
      fullExchangeName: (price as any).exchange ?? null,
      currency: price.currency ?? null,
      financialCurrency: fd?.financialCurrency ?? null,
      marketCap: typeof price.marketCap === 'number' ? price.marketCap : Number(price.marketCap),
      beta: (sd?.beta ?? ks?.beta ?? null) as number | null,
      totalDebt: (fd?.totalDebt ?? null) as number | null,
      effectiveTaxRate: null, // Yahoo doesn't expose this directly; composer uses country tax.
      sector: sp?.sector ?? null,
      industry: sp?.industry ?? null,
      country: sp?.country ?? null,
    });

    cache.set(cacheKey, fundamentals, TTL.DAY);
    return fundamentals;
  } catch (err) {
    if (process.env.YAHOO_DEBUG) console.warn('yahoo lookup failed', symbol, (err as Error).message);
    return null;
  }
}

// Try bare symbol, then each suffix. Return all hits (dedup by symbol).
export async function yahooLookupWithSuffixProbe(symbol: string): Promise<YahooFundamentals[]> {
  const base = symbol.trim().toUpperCase();
  // If user already provided a suffix (contains "." or alphanumeric exchange code), try as-is only.
  if (base.includes('.')) {
    const one = await yahooLookup(base);
    return one ? [one] : [];
  }
  // Probe: as-is first; if found on US, often that's enough. Also probe common EU/Asia suffixes.
  const results: YahooFundamentals[] = [];
  const seen = new Set<string>();
  // Try the most likely ones in parallel to speed things up.
  const candidates = await Promise.all(
    EXCHANGE_SUFFIXES.map((suffix) => yahooLookup(`${base}${suffix}`)),
  );
  for (const r of candidates) {
    if (r && !seen.has(r.ticker)) {
      seen.add(r.ticker);
      results.push(r);
    }
  }
  return results;
}

// Search by name or ticker via Yahoo search.
export async function yahooSearch(query: string, limit = 10): Promise<YahooFundamentals[]> {
  const cacheKey = `yhsearch:${query.toLowerCase()}`;
  const cached = cache.get<YahooFundamentals[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await yahooFinance.search(query, { quotesCount: limit, newsCount: 0 });
    const quotes = (res.quotes ?? []).filter((q: any) => q && q.symbol) as Array<{
      symbol: string;
      longname?: string;
      shortname?: string;
      exchange?: string;
      quoteType?: string;
    }>;
    // Hydrate each candidate — quote summary has the full fundamentals.
    const fundamentals: YahooFundamentals[] = [];
    await Promise.all(
      quotes.slice(0, limit).map(async (q) => {
        if (q.quoteType && !['EQUITY', 'ETF'].includes(q.quoteType)) return;
        const full = await yahooLookup(q.symbol);
        if (full) fundamentals.push(full);
      }),
    );
    // Preserve search-order.
    const ordered: YahooFundamentals[] = [];
    const byTicker = new Map(fundamentals.map((f) => [f.ticker, f]));
    for (const q of quotes) {
      const f = byTicker.get(q.symbol);
      if (f && !ordered.includes(f)) ordered.push(f);
    }
    cache.set(cacheKey, ordered, TTL.DAY);
    return ordered;
  } catch {
    return [];
  }
}

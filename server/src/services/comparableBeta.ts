import { cache, TTL } from './cache.ts';
import { findCountryTax, findIndustry } from './damodaranData.ts';
import { isIsin, resolveIsin } from './openFigi.ts';
import { getMonthlyPrices, subtractYears, type MonthlyPrice } from './historicalPrices.ts';
import { selectBeta, type BetaSelectionResult } from './betaCalculator.ts';
import { getFinancialData, type DeSource, type TaxSource } from './financialStatements.ts';
import type { BetaAnalysis, BetaMethod, BetaStability } from '../../../shared/types.ts';

export interface ComparableCompany {
  ticker: string;
  name: string;
  leveredBeta: number;
  deRatio: number;
  taxRate: number;
  unleveredBeta: number;
  marketCap: number;
  exchange?: string;
  country?: string;
  currency?: string;
  // Legacy roll-up of the data quality. Derived from deSource for backward compat.
  source?: 'fmp-firm' | 'fmp-industry-proxy' | 'yahoo';
  // Provenance — explicit per-field source so the UI can show the right badge.
  deSource?: DeSource;
  taxSource?: TaxSource;
  statementDate?: string;
  statementPeriod?: string;
  notes?: string;
  // Calculated-beta fields (populated only via calculateComparableBeta with valuationDate + market series).
  betaMethod?: BetaMethod;
  betaAnalysis?: BetaAnalysis;
  averageRSquared?: number;
  significantWindows?: number;
  totalWindows?: number;
  stability?: BetaStability;
  fmpProviderBeta?: number;
}

export interface ComparableBetaResult {
  companies: ComparableCompany[];
  missing: string[];
  medianUnleveredBeta: number | null;
  releveredBeta: number | null;
  source: string;
  description: string;
  benchmark?: string;
  frequency?: 'Monthly';
  valuationDate?: string;
}

interface FmpProfile {
  symbol?: string;
  name?: string;
  companyName?: string;
  beta?: number;
  marketCap?: number;
  currency?: string;
  exchangeFullName?: string;
  exchange?: string;
  industry?: string;
  sector?: string;
  country?: string;
  isin?: string;
}

interface FmpRatiosTTM {
  debtToEquityRatioTTM?: number;
  effectiveTaxRateTTM?: number;
}

const FMP_BASE = 'https://financialmodelingprep.com/stable';

async function fmpFetch<T>(endpoint: string, symbol: string): Promise<T[] | null> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return null;
  const key = `fmpraw:${endpoint}:${symbol.toUpperCase()}`;
  const cached = cache.get<T[] | null>(key);
  if (cached !== null && cached !== undefined) return cached as T[] | null;

  try {
    const res = await fetch(
      `${FMP_BASE}/${endpoint}?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`,
    );
    if (res.status === 429) {
      // Quota exhausted — cache a negative result for 10 minutes so we stop hammering.
      cache.set(key, null, 600);
      return null;
    }
    if (!res.ok) {
      cache.set(key, null, 600);
      return null;
    }
    const text = await res.text();
    // FMP returns 200 with an error body for gated endpoints — treat as miss.
    if (
      text.startsWith('Premium') ||
      text.startsWith('Restricted') ||
      text.includes('Limit Reach') ||
      !text.trim().startsWith('[')
    ) {
      cache.set(key, null, 600);
      return null;
    }
    const json = JSON.parse(text) as T[];
    cache.set(key, json, TTL.WEEK);
    return json;
  } catch {
    return null;
  }
}

async function fmpSearch(query: string): Promise<FmpProfile[]> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return [];
  const key = `fmpsearch:${query.toLowerCase()}`;
  const cached = cache.get<FmpProfile[]>(key);
  if (cached) return cached;
  // Hit both name and symbol search endpoints; merge and dedupe by symbol.
  const urls = [
    `${FMP_BASE}/search-name?query=${encodeURIComponent(query)}&apikey=${apiKey}`,
    `${FMP_BASE}/search-symbol?query=${encodeURIComponent(query)}&apikey=${apiKey}`,
  ];
  try {
    const responses = await Promise.all(
      urls.map((u) => fetch(u).then((r) => (r.ok ? r.json() : [])).catch(() => [])),
    );
    const merged: FmpProfile[] = [];
    const seen = new Set<string>();
    for (const arr of responses as FmpProfile[][]) {
      if (!Array.isArray(arr)) continue;
      for (const p of arr) {
        if (!p?.symbol || seen.has(p.symbol)) continue;
        seen.add(p.symbol);
        merged.push(p);
      }
    }
    cache.set(key, merged, TTL.DAY);
    return merged;
  } catch {
    return [];
  }
}

// FMP profile.country is an ISO-3166 alpha-2 code (e.g. "GB", "FR"). Damodaran's tax/risk tables
// use full English names ("United Kingdom", "France"). Map the codes we actually encounter.
const ISO2_TO_NAME: Record<string, string> = {
  US: 'United States',
  GB: 'United Kingdom',
  UK: 'United Kingdom',
  FR: 'France',
  DE: 'Germany',
  NL: 'Netherlands',
  CH: 'Switzerland',
  IT: 'Italy',
  ES: 'Spain',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
  AT: 'Austria',
  BE: 'Belgium',
  IE: 'Ireland',
  LU: 'Luxembourg',
  PT: 'Portugal',
  PL: 'Poland',
  CA: 'Canada',
  AU: 'Australia',
  NZ: 'New Zealand',
  JP: 'Japan',
  CN: 'China',
  HK: 'Hong Kong',
  TW: 'Taiwan',
  KR: 'South Korea',
  IN: 'India',
  ID: 'Indonesia',
  SG: 'Singapore',
  TH: 'Thailand',
  MY: 'Malaysia',
  PH: 'Philippines',
  VN: 'Vietnam',
  RU: 'Russia',
  KZ: 'Kazakhstan',
  UA: 'Ukraine',
  TR: 'Turkey',
  SA: 'Saudi Arabia',
  AE: 'United Arab Emirates',
  IL: 'Israel',
  EG: 'Egypt',
  ZA: 'South Africa',
  NG: 'Nigeria',
  BR: 'Brazil',
  MX: 'Mexico',
  AR: 'Argentina',
  CL: 'Chile',
  CO: 'Colombia',
  PE: 'Peru',
};

// Infer country name from an FMP profile. Prefers ISO-2 → full name mapping (FMP populates
// `country` with codes like "GB"); falls back to exchange-name heuristics for older payloads.
function inferCountry(profile: FmpProfile): string | null {
  if (profile.country) {
    const code = profile.country.toUpperCase();
    if (ISO2_TO_NAME[code]) return ISO2_TO_NAME[code];
    // FMP sometimes returns full name already (e.g. "United States") — pass it through.
    if (profile.country.length > 2) return profile.country;
  }
  const ex = (profile.exchangeFullName || profile.exchange || '').toLowerCase();
  if (ex.includes('london')) return 'United Kingdom';
  if (ex.includes('paris') || ex.includes('euronext paris')) return 'France';
  if (ex.includes('amsterdam')) return 'Netherlands';
  if (ex.includes('hong kong')) return 'Hong Kong';
  if (ex.includes('tokyo')) return 'Japan';
  if (ex.includes('saudi')) return 'Saudi Arabia';
  if (ex.includes('toronto')) return 'Canada';
  if (ex.includes('moscow')) return 'Russia';
  if (ex.includes('shanghai') || ex.includes('shenzhen')) return 'China';
  if (ex.includes('frankfurt') || ex.includes('xetra')) return 'Germany';
  if (ex.includes('new york') || ex.includes('nasdaq')) return 'United States';
  return null;
}

// Apply a calculated beta selection on top of a base ComparableCompany (recomputes unlevered beta).
function applyCalculatedBeta(base: ComparableCompany, sel: BetaSelectionResult): ComparableCompany {
  const leveredBeta = sel.selectedBeta;
  const unlevered = leveredBeta / (1 + (1 - base.taxRate) * Math.max(0, base.deRatio));
  const chosenAnalysis =
    sel.selectionMethod === 'calculated-5Y' ? sel.analysis5Y : sel.analysis3Y;
  return {
    ...base,
    leveredBeta: Number(leveredBeta.toFixed(4)),
    unleveredBeta: Number(unlevered.toFixed(4)),
    betaMethod: sel.selectionMethod,
    betaAnalysis: chosenAnalysis,
    averageRSquared: Number(sel.averageRSquared.toFixed(4)),
    significantWindows: sel.significantWindows,
    totalWindows: sel.totalWindows,
    stability: sel.stability,
    fmpProviderBeta: sel.fmpBeta,
    notes: [base.notes, ...sel.notes].filter(Boolean).join(' '),
  };
}

async function buildComparableFromProfile(
  profile: FmpProfile,
  industryName?: string,
): Promise<ComparableCompany | null> {
  if (!profile.symbol || profile.beta == null || profile.marketCap == null) return null;
  const leveredBeta = profile.beta;

  // Resolution cascade (stops at first hit):
  //   1. ratios-ttm for bare US tickers (firm-specific D/E + effective tax). Free tier.
  //   2. balance-sheet + income-statement (firm-specific via raw statements). Free tier US-only;
  //      international 402s gracefully and falls through.
  //   3. Damodaran industry D/E + country marginal tax (proxy).
  const isInternational = /[.\-]/.test(profile.symbol);
  const ratios = isInternational ? null : await fmpFetch<FmpRatiosTTM>('ratios-ttm', profile.symbol);
  const firmDE = ratios?.[0]?.debtToEquityRatioTTM ?? null;
  const firmTax = ratios?.[0]?.effectiveTaxRateTTM ?? null;

  // Inputs needed for the proxy fallback regardless of which branch we end up in.
  const ind = industryName ? findIndustry(industryName) : null;
  const industryDeRatio = ind?.deRatio ?? 0.35;
  const country = inferCountry(profile);
  const countryTax = (country ? findCountryTax(country)?.marginalTaxRate : null) ?? 0.25;

  let deRatio: number;
  let taxRate: number;
  let deSource: DeSource;
  let taxSource: TaxSource;
  const notes: string[] = [];
  let statementDate: string | undefined;
  let statementPeriod: string | undefined;

  if (firmDE != null && firmDE >= 0) {
    // Tier 1: firm-level via TTM ratios.
    deRatio = firmDE;
    deSource = 'firm';
    taxRate = firmTax != null ? Math.max(0, Math.min(0.5, firmTax)) : countryTax;
    taxSource = firmTax != null ? 'firm' : 'country-default';
  } else {
    // Tier 2: try raw balance sheet + income statement.
    const fin = await getFinancialData(
      profile.symbol,
      profile.marketCap,
      countryTax,
      industryDeRatio,
    );
    deRatio = fin.deRatio;
    deSource = fin.deSource;
    taxRate = fin.effectiveTaxRate;
    taxSource = fin.taxSource;
    statementDate = fin.statementDate;
    statementPeriod = fin.statementPeriod;
    notes.push(...fin.notes);
    // Augment the proxy note with industry context for the UI tooltip.
    if (deSource === 'industry-proxy') {
      notes.push(
        `Industry: ${ind?.name ?? 'default'} (D/E ${(industryDeRatio * 100).toFixed(1)}%). Country: ${country ?? 'default US'}.`,
      );
    }
  }

  // Legacy `source` field — preserved so older code paths and Excel export keep working.
  const legacySource: ComparableCompany['source'] =
    deSource === 'firm' ? 'fmp-firm' : deSource === 'industry-proxy' ? 'fmp-industry-proxy' : 'fmp-firm';

  const unleveredBeta = leveredBeta / (1 + (1 - taxRate) * Math.max(0, deRatio));

  return {
    ticker: profile.symbol,
    name: profile.companyName ?? profile.symbol,
    leveredBeta: Number(leveredBeta.toFixed(4)),
    deRatio: Number(deRatio.toFixed(4)),
    taxRate: Number(taxRate.toFixed(4)),
    unleveredBeta: Number(unleveredBeta.toFixed(4)),
    marketCap: profile.marketCap,
    exchange: profile.exchangeFullName ?? profile.exchange,
    country: inferCountry(profile) ?? profile.country ?? '',
    currency: profile.currency ?? 'USD',
    source: legacySource,
    deSource,
    taxSource,
    statementDate,
    statementPeriod,
    notes: notes.length > 0 ? notes.join(' ') : undefined,
  };
}

// Enrich a base ComparableCompany with calculated beta using valuationDate. No-op if prices unavailable.
async function maybeEnrichWithCalculatedBeta(
  base: ComparableCompany,
  valuationDate: string,
): Promise<ComparableCompany> {
  const marketFrom = subtractYears(valuationDate, 7);
  const market = await getMonthlyPrices('^GSPC', marketFrom, valuationDate);
  if (market.prices.length < 24) return base;
  const stock = await getMonthlyPrices(base.ticker, marketFrom, valuationDate);
  if (stock.prices.length < 12) return base;
  const sel = selectBeta(stock.prices, market.prices, valuationDate, base.leveredBeta);
  return applyCalculatedBeta(base, sel);
}

// Canonical lookup. Handles bare tickers, suffixed tickers (BP.L, TTE.PA, 0857.HK), and ISIN codes.
export async function lookupCompany(
  input: string,
  industryHint?: string,
  valuationDate?: string,
): Promise<ComparableCompany | null> {
  const q = input.trim();
  if (!q) return null;
  const cacheKey = `cmp:${q.toUpperCase()}:${industryHint ?? ''}:${valuationDate ?? ''}`;
  const cached = cache.get<ComparableCompany>(cacheKey);
  if (cached) return cached;

  // ISIN → OpenFIGI → pick best ticker (prefer primary listing: common share / equity).
  if (isIsin(q)) {
    const matches = await resolveIsin(q);
    for (const m of matches.slice(0, 5)) {
      // FMP recognizes many global suffixed tickers directly; try `${ticker}.${exchange}` guess first.
      const candidates = [m.ticker, `${m.ticker}.L`, `${m.ticker}.PA`, `${m.ticker}.AS`];
      for (const c of candidates) {
        const profile = await fmpFetch<FmpProfile>('profile', c);
        if (profile?.[0]) {
          const comp = await buildComparableFromProfile(profile[0], industryHint);
          if (comp) {
            const enriched = valuationDate ? await maybeEnrichWithCalculatedBeta(comp, valuationDate) : comp;
            cache.set(cacheKey, enriched, TTL.WEEK);
            return enriched;
          }
        }
      }
    }
    return null;
  }

  // Direct FMP profile lookup (supports `BP.L`, `0857.HK`, `2222.SR`, etc. globally on free tier).
  const profile = await fmpFetch<FmpProfile>('profile', q.toUpperCase());
  if (profile?.[0]) {
    const comp = await buildComparableFromProfile(profile[0], industryHint);
    if (comp) {
      const enriched = valuationDate ? await maybeEnrichWithCalculatedBeta(comp, valuationDate) : comp;
      cache.set(cacheKey, enriched, TTL.WEEK);
      return enriched;
    }
  }

  // If bare ticker and FMP couldn't resolve, try a single name-search fallback.
  const matches = await fmpSearch(q);
  if (matches.length > 0) {
    const profile2 = await fmpFetch<FmpProfile>('profile', matches[0].symbol!);
    if (profile2?.[0]) {
      const comp = await buildComparableFromProfile(profile2[0], industryHint);
      if (comp) {
        const enriched = valuationDate ? await maybeEnrichWithCalculatedBeta(comp, valuationDate) : comp;
        cache.set(cacheKey, enriched, TTL.WEEK);
        return enriched;
      }
    }
  }
  return null;
}

export interface SearchCandidate {
  ticker: string;
  name: string;
  exchange: string;
  country: string;
  currency: string;
  marketCap?: number;
}

// Search by ticker / name / ISIN. Returns candidates for the user to pick from.
export async function searchCompanies(query: string, limit = 10): Promise<SearchCandidate[]> {
  const q = query.trim();
  if (!q) return [];

  if (isIsin(q)) {
    const matches = await resolveIsin(q);
    return matches.slice(0, limit).map((m) => ({
      ticker: m.ticker,
      name: m.name,
      exchange: m.exchange,
      country: '',
      currency: '',
    }));
  }

  const matches = await fmpSearch(q);
  return matches.slice(0, limit).map((m) => ({
    ticker: m.symbol ?? '',
    name: m.name ?? m.companyName ?? m.symbol ?? '',
    exchange: m.exchangeFullName ?? m.exchange ?? '',
    country: m.country ?? '',
    currency: m.currency ?? '',
  }));
}

// Fetch 7 years of historical prices and compute calculated beta for one company. Returns null if no price data.
async function buildCalculatedBeta(
  ticker: string,
  fmpProviderBeta: number | null,
  valuationDate: string,
  marketPrices: MonthlyPrice[],
): Promise<BetaSelectionResult | null> {
  if (marketPrices.length < 24) return null;
  const from = subtractYears(valuationDate, 7);
  const stock = await getMonthlyPrices(ticker, from, valuationDate);
  if (stock.prices.length < 12) return null;
  return selectBeta(stock.prices, marketPrices, valuationDate, fmpProviderBeta);
}

export async function calculateComparableBeta(
  tickers: string[],
  targetDeRatio: number,
  targetTaxRate: number,
  industryHint?: string,
  valuationDate?: string,
): Promise<ComparableBetaResult> {
  const normalized = tickers.map((t) => t.trim()).filter(Boolean).slice(0, 10);

  // Kept-style: fetch S&P 500 monthly prices ONCE, share across all peers.
  let marketPrices: MonthlyPrice[] = [];
  if (valuationDate) {
    const marketFrom = subtractYears(valuationDate, 7);
    const market = await getMonthlyPrices('^GSPC', marketFrom, valuationDate);
    marketPrices = market.prices;
  }

  const baseResults = await Promise.all(normalized.map((t) => lookupCompany(t, industryHint)));
  const enriched = await Promise.all(
    baseResults.map(async (base) => {
      if (!base || !valuationDate || marketPrices.length === 0) return base;
      const sel = await buildCalculatedBeta(base.ticker, base.leveredBeta, valuationDate, marketPrices);
      return sel ? applyCalculatedBeta(base, sel) : base;
    }),
  );

  const companies: ComparableCompany[] = [];
  const missing: string[] = [];
  normalized.forEach((t, i) => {
    const r = enriched[i];
    if (r) companies.push(r);
    else missing.push(t);
  });

  // --- inlined original median + relever, then return ---
  if (companies.length === 0) {
    return {
      companies: [],
      missing,
      medianUnleveredBeta: null,
      releveredBeta: null,
      source: 'FMP',
      description: 'No comparable company data available.',
      benchmark: 'S&P 500',
      frequency: 'Monthly',
      valuationDate,
    };
  }
  const betas = companies.map((c) => c.unleveredBeta).sort((a, b) => a - b);
  const mid = Math.floor(betas.length / 2);
  const medianUnleveredBeta =
    betas.length % 2 === 0 ? (betas[mid - 1] + betas[mid]) / 2 : betas[mid];
  const releveredBeta = medianUnleveredBeta * (1 + (1 - targetTaxRate) * targetDeRatio);
  const anyCalculated = companies.some((c) => c.betaMethod?.startsWith('calculated'));
  return {
    companies,
    missing,
    medianUnleveredBeta,
    releveredBeta,
    source: anyCalculated
      ? `Calculated (monthly vs S&P 500, as of ${valuationDate})`
      : 'FMP (profile, global)',
    description: `Bottom-up median unlevered β from ${companies.length} comparable(s).`,
    benchmark: 'S&P 500',
    frequency: 'Monthly',
    valuationDate,
  };
}


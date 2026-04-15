import { cache, TTL } from './cache.ts';

// FMP balance-sheet + income-statement endpoints. On free tier these return HTTP 200 for US
// tickers but HTTP 402 ("Premium Query Parameter") for international tickers. The cascade
// below handles all cases gracefully and labels the source so the UI can show the right badge.

const FMP_BASE = 'https://financialmodelingprep.com/stable';

interface FmpBalanceSheet {
  date?: string;
  period?: string;
  totalDebt?: number;
  totalStockholdersEquity?: number;
  totalAssets?: number;
  netDebt?: number;
}

interface FmpIncomeStatement {
  date?: string;
  period?: string;
  incomeBeforeTax?: number;
  incomeTaxExpense?: number;
  netIncome?: number;
}

export type DeSource = 'firm' | 'balance-sheet' | 'market-cap' | 'industry-proxy';
export type TaxSource = 'firm' | 'income-statement' | 'country-default';

export interface FinancialData {
  deRatio: number;
  deSource: DeSource;
  effectiveTaxRate: number;
  taxSource: TaxSource;

  // Provenance — surfaced in tooltips and Excel sources sheet.
  totalDebt?: number;
  totalEquity?: number;
  marketCap?: number;
  incomeBeforeTax?: number;
  incomeTaxExpense?: number;
  statementDate?: string;
  statementPeriod?: string;

  notes: string[];
}

async function fmpStatementFetch<T>(endpoint: string, symbol: string): Promise<T[] | null> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return null;
  const key = `fs:${endpoint}:${symbol.toUpperCase()}`;
  const cached = cache.get<T[] | null>(key);
  if (cached !== null && cached !== undefined) return cached as T[] | null;

  try {
    const url = `${FMP_BASE}/${endpoint}?symbol=${encodeURIComponent(symbol)}&limit=1&apikey=${apiKey}`;
    const res = await fetch(url);
    if (res.status === 402 || res.status === 429) {
      // Paid-tier-only or quota exhausted. Cache negative briefly so we don't keep hitting
      // it for every comparable lookup in the same session.
      cache.set(key, null, 600);
      return null;
    }
    if (!res.ok) {
      cache.set(key, null, 600);
      return null;
    }
    const text = await res.text();
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
    // Statements update at most quarterly — 30-day cache is safe.
    cache.set(key, json, TTL.MONTH);
    return json;
  } catch {
    return null;
  }
}

export function calculateDeRatio(
  totalDebt: number | null,
  totalEquity: number | null,
  marketCap: number | null,
  industryDeRatio: number,
): { deRatio: number; deSource: DeSource; notes: string[] } {
  const notes: string[] = [];

  if (totalDebt != null && totalEquity != null && totalEquity > 0) {
    const de = totalDebt / totalEquity;
    if (de > 10) {
      notes.push(
        `Balance-sheet D/E extremely high (${(de * 100).toFixed(0)}%); switching to market-cap method.`,
      );
      // Fall through to market-cap branch below.
    } else {
      return { deRatio: de, deSource: 'balance-sheet', notes };
    }
  }

  if (totalDebt != null && marketCap != null && marketCap > 0) {
    notes.push('Book equity negative or unavailable; D/E = Total Debt / Market Cap.');
    return { deRatio: totalDebt / marketCap, deSource: 'market-cap', notes };
  }

  notes.push('Financial statements unavailable; using Damodaran industry D/E.');
  return { deRatio: industryDeRatio, deSource: 'industry-proxy', notes };
}

export function calculateEffectiveTax(
  incomeTaxExpense: number | null,
  incomeBeforeTax: number | null,
  countryMarginalTax: number,
): { taxRate: number; taxSource: TaxSource; notes: string[] } {
  const notes: string[] = [];

  if (incomeTaxExpense != null && incomeBeforeTax != null) {
    if (incomeBeforeTax <= 0) {
      notes.push('Pre-tax income negative (loss year); using country marginal tax rate.');
      return { taxRate: countryMarginalTax, taxSource: 'country-default', notes };
    }
    const rawRate = incomeTaxExpense / incomeBeforeTax;
    if (rawRate < 0) {
      notes.push(
        `Negative effective tax rate (${(rawRate * 100).toFixed(1)}%) — likely tax refund; using country rate.`,
      );
      return { taxRate: countryMarginalTax, taxSource: 'country-default', notes };
    }
    if (rawRate > 0.45) {
      notes.push(
        `Unusually high effective tax rate (${(rawRate * 100).toFixed(1)}%); capped at 45%.`,
      );
      return { taxRate: 0.45, taxSource: 'income-statement', notes };
    }
    return { taxRate: rawRate, taxSource: 'income-statement', notes };
  }

  notes.push('Income statement unavailable; using country marginal tax rate.');
  return { taxRate: countryMarginalTax, taxSource: 'country-default', notes };
}

// Orchestrator: fetch BS+IS in parallel, run cascades, return single FinancialData.
// `marketCap` is taken from the profile call so we don't need a 5th request.
export async function getFinancialData(
  symbol: string,
  marketCap: number,
  countryMarginalTax: number,
  industryDeRatio: number,
): Promise<FinancialData> {
  const [bsRes, isRes] = await Promise.all([
    fmpStatementFetch<FmpBalanceSheet>('balance-sheet-statement', symbol),
    fmpStatementFetch<FmpIncomeStatement>('income-statement', symbol),
  ]);

  const bs = bsRes?.[0] ?? null;
  const is = isRes?.[0] ?? null;

  const totalDebt = bs?.totalDebt ?? null;
  const totalEquity = bs?.totalStockholdersEquity ?? null;
  const incomeBeforeTax = is?.incomeBeforeTax ?? null;
  const incomeTaxExpense = is?.incomeTaxExpense ?? null;

  const de = calculateDeRatio(totalDebt, totalEquity, marketCap, industryDeRatio);
  const tax = calculateEffectiveTax(incomeTaxExpense, incomeBeforeTax, countryMarginalTax);

  return {
    deRatio: de.deRatio,
    deSource: de.deSource,
    effectiveTaxRate: tax.taxRate,
    taxSource: tax.taxSource,
    totalDebt: totalDebt ?? undefined,
    totalEquity: totalEquity ?? undefined,
    marketCap,
    incomeBeforeTax: incomeBeforeTax ?? undefined,
    incomeTaxExpense: incomeTaxExpense ?? undefined,
    statementDate: bs?.date ?? is?.date,
    statementPeriod: bs?.period ?? is?.period,
    notes: [...de.notes, ...tax.notes],
  };
}

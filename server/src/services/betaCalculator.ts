import type {
  BetaAnalysis,
  BetaMethod,
  BetaStability,
  BetaWindow,
} from '../../../shared/types.ts';
import type { MonthlyPrice } from './historicalPrices.ts';
import { subtractYears } from './historicalPrices.ts';

export interface RegressionResult {
  beta: number;
  alpha: number;
  rSquared: number;
  standardError: number;
  tStatistic: number;
  observations: number;
  isSignificant: boolean;
}

export interface MonthlyReturn {
  date: string;
  return: number;
}

export function calculateMonthlyReturns(prices: MonthlyPrice[]): MonthlyReturn[] {
  const out: MonthlyReturn[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1].adjClose;
    if (prev <= 0) continue;
    out.push({
      date: prices[i].date.slice(0, 7), // YYYY-MM for alignment
      return: (prices[i].adjClose - prev) / prev,
    });
  }
  return out;
}

// Critical t-value for two-tailed 95% test at df = n - 2. Hardcoded lookup is fine for our n range.
function criticalT(n: number): number {
  if (n >= 120) return 1.98;
  if (n >= 60) return 2.0;
  if (n >= 30) return 2.04;
  if (n >= 24) return 2.074;
  if (n >= 18) return 2.12;
  return 2.2;
}

export function linearRegression(
  stockReturns: number[],
  marketReturns: number[],
): RegressionResult {
  const n = Math.min(stockReturns.length, marketReturns.length);
  if (n < 3) {
    return {
      beta: 0,
      alpha: 0,
      rSquared: 0,
      standardError: 0,
      tStatistic: 0,
      observations: n,
      isSignificant: false,
    };
  }
  let sumY = 0;
  let sumX = 0;
  for (let i = 0; i < n; i++) {
    sumY += stockReturns[i];
    sumX += marketReturns[i];
  }
  const meanY = sumY / n;
  const meanX = sumX / n;
  let ssXY = 0;
  let ssXX = 0;
  let ssYY = 0;
  for (let i = 0; i < n; i++) {
    const dx = marketReturns[i] - meanX;
    const dy = stockReturns[i] - meanY;
    ssXY += dx * dy;
    ssXX += dx * dx;
    ssYY += dy * dy;
  }
  if (ssXX === 0 || ssYY === 0) {
    return {
      beta: 0,
      alpha: meanY,
      rSquared: 0,
      standardError: 0,
      tStatistic: 0,
      observations: n,
      isSignificant: false,
    };
  }
  const beta = ssXY / ssXX;
  const alpha = meanY - beta * meanX;
  const ssRes = Math.max(0, ssYY - (ssXY * ssXY) / ssXX);
  const rSquared = 1 - ssRes / ssYY;
  const residualVariance = n > 2 ? ssRes / (n - 2) : 0;
  const standardError = residualVariance > 0 ? Math.sqrt(residualVariance / ssXX) : 0;
  const tStatistic = standardError > 0 ? beta / standardError : 0;
  return {
    beta,
    alpha,
    rSquared,
    standardError,
    tStatistic,
    observations: n,
    isSignificant: Math.abs(tStatistic) > criticalT(n),
  };
}

// Align two series on YYYY-MM, return pairs in matching order.
export function alignReturns(
  stock: MonthlyReturn[],
  market: MonthlyReturn[],
): { stock: number[]; market: number[] } {
  const mMap = new Map(market.map((r) => [r.date, r.return]));
  const s: number[] = [];
  const m: number[] = [];
  for (const row of stock) {
    const mv = mMap.get(row.date);
    if (mv != null) {
      s.push(row.return);
      m.push(mv);
    }
  }
  return { stock: s, market: m };
}

export function assessStability(betas: number[]): {
  stability: BetaStability;
  range: number;
  note: string;
} {
  if (betas.length === 0) {
    return { stability: 'unstable', range: 0, note: 'No windows produced a beta.' };
  }
  const range = Math.max(...betas) - Math.min(...betas);
  if (range <= 0.2) {
    return { stability: 'stable', range, note: `Beta stable across windows (range ${range.toFixed(2)}).` };
  }
  if (range <= 0.5) {
    return {
      stability: 'moderate',
      range,
      note: `Beta moderately variable (range ${range.toFixed(2)}); average used.`,
    };
  }
  return {
    stability: 'unstable',
    range,
    note: `Beta highly variable (range ${range.toFixed(2)}); consider industry beta.`,
  };
}

interface WindowSpec {
  label: BetaWindow['label'];
  shiftYears: number;
}

const WINDOWS: WindowSpec[] = [
  { label: 'VAL YR', shiftYears: 0 },
  { label: 'YR-1', shiftYears: 1 },
  { label: 'YR-2', shiftYears: 2 },
];

function filterPricesInRange(prices: MonthlyPrice[], from: string, to: string): MonthlyPrice[] {
  return prices.filter((p) => p.date >= from && p.date <= to);
}

export function calculateRollingBeta(
  stockPrices: MonthlyPrice[],
  marketPrices: MonthlyPrice[],
  valuationDate: string,
  period: '5Y' | '3Y',
): BetaAnalysis {
  const years = period === '5Y' ? 5 : 3;
  const windows: BetaWindow[] = [];

  for (const spec of WINDOWS) {
    const end = subtractYears(valuationDate, spec.shiftYears);
    const start = subtractYears(end, years);
    const stockSlice = filterPricesInRange(stockPrices, start, end);
    const marketSlice = filterPricesInRange(marketPrices, start, end);
    const stockReturns = calculateMonthlyReturns(stockSlice);
    const marketReturns = calculateMonthlyReturns(marketSlice);
    const aligned = alignReturns(stockReturns, marketReturns);
    const reg = linearRegression(aligned.stock, aligned.market);
    windows.push({
      label: spec.label,
      startDate: start,
      endDate: end,
      beta: reg.beta,
      alpha: reg.alpha,
      rSquared: reg.rSquared,
      standardError: reg.standardError,
      tStatistic: reg.tStatistic,
      isSignificant: reg.isSignificant,
      observations: reg.observations,
    });
  }

  const validBetas = windows.filter((w) => w.observations >= 12).map((w) => w.beta);
  const averageBeta =
    validBetas.length > 0 ? validBetas.reduce((a, b) => a + b, 0) / validBetas.length : 0;
  const averageRSquared =
    windows.length > 0
      ? windows.reduce((a, w) => a + (w.rSquared || 0), 0) / windows.length
      : 0;
  const significantCount = windows.filter((w) => w.isSignificant).length;
  const stability = assessStability(validBetas);

  return {
    period,
    frequency: 'Monthly',
    benchmark: 'S&P 500',
    windows,
    averageBeta,
    averageRSquared,
    significantCount,
    totalWindows: windows.length,
    stability: stability.stability,
    stabilityRange: stability.range,
    stabilityNote: stability.note,
  };
}

export interface BetaSelectionResult {
  selectedBeta: number;
  selectionMethod: BetaMethod;
  analysis5Y?: BetaAnalysis;
  analysis3Y?: BetaAnalysis;
  fmpBeta?: number;
  averageRSquared: number;
  significantWindows: number;
  totalWindows: number;
  stability: BetaStability;
  benchmark: string;
  frequency: 'Monthly';
  valuationDate: string;
  notes: string[];
}

// Kept-style selection: prefer 5Y if all 3 windows have >= 36 obs; else 3Y if >= 18 obs; else FMP fallback.
export function selectBeta(
  stockPrices: MonthlyPrice[],
  marketPrices: MonthlyPrice[],
  valuationDate: string,
  fmpProviderBeta: number | null,
): BetaSelectionResult {
  const analysis5Y = calculateRollingBeta(stockPrices, marketPrices, valuationDate, '5Y');
  const analysis3Y = calculateRollingBeta(stockPrices, marketPrices, valuationDate, '3Y');

  const enough5Y = analysis5Y.windows.every((w) => w.observations >= 36);
  const enough3Y = analysis3Y.windows.every((w) => w.observations >= 18);

  const notes: string[] = [];

  if (enough5Y) {
    if (analysis5Y.averageRSquared < 0.05) notes.push('Very low average R² (<0.05).');
    if (analysis5Y.significantCount < 2) notes.push('<2/3 windows statistically significant.');
    return {
      selectedBeta: analysis5Y.averageBeta,
      selectionMethod: 'calculated-5Y',
      analysis5Y,
      analysis3Y,
      averageRSquared: analysis5Y.averageRSquared,
      significantWindows: analysis5Y.significantCount,
      totalWindows: analysis5Y.totalWindows,
      stability: analysis5Y.stability,
      benchmark: 'S&P 500',
      frequency: 'Monthly',
      valuationDate,
      notes,
    };
  }
  if (enough3Y) {
    notes.push('Using 3Y window — 5Y has insufficient observations.');
    if (analysis3Y.averageRSquared < 0.05) notes.push('Very low average R² (<0.05).');
    return {
      selectedBeta: analysis3Y.averageBeta,
      selectionMethod: 'calculated-3Y',
      analysis5Y,
      analysis3Y,
      averageRSquared: analysis3Y.averageRSquared,
      significantWindows: analysis3Y.significantCount,
      totalWindows: analysis3Y.totalWindows,
      stability: analysis3Y.stability,
      benchmark: 'S&P 500',
      frequency: 'Monthly',
      valuationDate,
      notes,
    };
  }
  notes.push('Insufficient price history — using FMP provider beta.');
  return {
    selectedBeta: fmpProviderBeta ?? 1.0,
    selectionMethod: 'fmp-provider',
    analysis5Y,
    analysis3Y,
    fmpBeta: fmpProviderBeta ?? undefined,
    averageRSquared: 0,
    significantWindows: 0,
    totalWindows: 0,
    stability: 'unstable',
    benchmark: 'S&P 500',
    frequency: 'Monthly',
    valuationDate,
    notes,
  };
}

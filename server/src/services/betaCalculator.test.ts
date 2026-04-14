import { describe, expect, it } from 'vitest';
import {
  alignReturns,
  assessStability,
  calculateMonthlyReturns,
  calculateRollingBeta,
  linearRegression,
} from './betaCalculator.ts';
import type { MonthlyPrice } from './historicalPrices.ts';

// Build a monthly price series whose month-over-month return satisfies stock_i = beta*market_i + alpha + noise_i.
function makePricesFromReturns(returns: number[], startDate: string, startPrice = 100): MonthlyPrice[] {
  const prices: MonthlyPrice[] = [];
  const [y, m] = startDate.split('-').map(Number);
  let p = startPrice;
  prices.push({ date: `${y}-${String(m).padStart(2, '0')}-28`, adjClose: p });
  for (let i = 0; i < returns.length; i++) {
    p = p * (1 + returns[i]);
    const mi = m + i + 1;
    const yi = y + Math.floor((mi - 1) / 12);
    const mm = ((mi - 1) % 12) + 1;
    prices.push({ date: `${yi}-${String(mm).padStart(2, '0')}-28`, adjClose: p });
  }
  return prices;
}

describe('linearRegression', () => {
  it('recovers exact beta for perfect linear data', () => {
    const market = [0.01, -0.02, 0.03, 0.0, 0.05, -0.01, 0.02, -0.03, 0.04, -0.02, 0.01, 0.0];
    const stock = market.map((x) => 1.5 * x + 0.001);
    const r = linearRegression(stock, market);
    expect(r.beta).toBeCloseTo(1.5, 4);
    expect(r.alpha).toBeCloseTo(0.001, 4);
    expect(r.rSquared).toBeCloseTo(1.0, 4);
    expect(r.isSignificant).toBe(true);
  });

  it('gives near-zero R² for uncorrelated data', () => {
    const n = 60;
    const market = Array.from({ length: n }, (_, i) => Math.sin(i) * 0.02);
    const stock = Array.from({ length: n }, (_, i) => Math.cos(i * 17) * 0.02);
    const r = linearRegression(stock, market);
    expect(r.rSquared).toBeLessThan(0.15);
  });

  it('returns observations = min length', () => {
    const r = linearRegression([0.01, 0.02, 0.03, 0.04], [0.005, 0.01, 0.015, 0.02]);
    expect(r.observations).toBe(4);
    expect(r.beta).toBeCloseTo(2.0, 3);
  });
});

describe('calculateMonthlyReturns', () => {
  it('computes month-over-month returns', () => {
    const prices: MonthlyPrice[] = [
      { date: '2024-01-31', adjClose: 100 },
      { date: '2024-02-29', adjClose: 110 },
      { date: '2024-03-31', adjClose: 99 },
    ];
    const r = calculateMonthlyReturns(prices);
    expect(r).toHaveLength(2);
    expect(r[0].return).toBeCloseTo(0.1, 6);
    expect(r[1].return).toBeCloseTo(-0.1, 6);
  });
});

describe('alignReturns', () => {
  it('only keeps months where both series have data', () => {
    const stock = [
      { date: '2024-01', return: 0.01 },
      { date: '2024-02', return: 0.02 },
      { date: '2024-03', return: 0.03 },
    ];
    const market = [
      { date: '2024-02', return: 0.01 },
      { date: '2024-03', return: 0.015 },
    ];
    const a = alignReturns(stock, market);
    expect(a.stock).toEqual([0.02, 0.03]);
    expect(a.market).toEqual([0.01, 0.015]);
  });
});

describe('assessStability', () => {
  it('flags stable when range <= 0.2', () => {
    expect(assessStability([1.0, 1.1, 1.15]).stability).toBe('stable');
  });
  it('flags moderate when range 0.2-0.5', () => {
    expect(assessStability([0.8, 1.0, 1.2]).stability).toBe('moderate');
  });
  it('flags unstable when range > 0.5', () => {
    expect(assessStability([0.5, 1.0, 1.6]).stability).toBe('unstable');
  });
});

describe('calculateRollingBeta', () => {
  it('produces three windows with shifted date ranges', () => {
    // Build 7 years of synthetic monthly data with stock = 1.2 * market + noise.
    const n = 84;
    const marketReturns = Array.from({ length: n }, (_, i) => Math.sin(i / 3) * 0.03 + 0.005);
    const stockReturns = marketReturns.map((m, i) => 1.2 * m + Math.cos(i / 7) * 0.005);
    const marketPrices = makePricesFromReturns(marketReturns, '2019-04', 1000);
    const stockPrices = makePricesFromReturns(stockReturns, '2019-04', 100);

    const r = calculateRollingBeta(stockPrices, marketPrices, '2026-04-14', '5Y');

    expect(r.windows).toHaveLength(3);
    expect(r.windows[0].label).toBe('VAL YR');
    expect(r.windows[1].label).toBe('YR-1');
    expect(r.windows[2].label).toBe('YR-2');
    // VAL YR end should be ~2026-04, YR-1 end ~2025-04, YR-2 end ~2024-04.
    expect(r.windows[0].endDate.slice(0, 4)).toBe('2026');
    expect(r.windows[1].endDate.slice(0, 4)).toBe('2025');
    expect(r.windows[2].endDate.slice(0, 4)).toBe('2024');
    // Each window uses 5 years of history → ~60 monthly observations.
    for (const w of r.windows) {
      expect(w.observations).toBeGreaterThan(40);
      expect(w.beta).toBeGreaterThan(1.0);
      expect(w.beta).toBeLessThan(1.5);
    }
    expect(r.averageBeta).toBeGreaterThan(1.0);
    expect(r.averageBeta).toBeLessThan(1.5);
  });
});

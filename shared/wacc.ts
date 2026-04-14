import type { CreditRating } from './types.ts';

// Pure formula library — no data sources, no I/O.

export function calculateBetaUnlevered(leveredBeta: number, taxRate: number, deRatio: number): number {
  return leveredBeta / (1 + (1 - taxRate) * deRatio);
}

export function calculateBetaRelevered(
  unleveredBeta: number,
  taxRate: number,
  debtToEquity: number,
): number {
  return unleveredBeta * (1 + (1 - taxRate) * debtToEquity);
}

export interface CostOfEquityParams {
  riskFreeRate: number;
  betaRelevered: number;
  equityRiskPremium: number;
  sizeRiskPremium: number;
  countryRiskPremium: number;
  currencyRiskPremium: number;
  specificRiskPremium: number;
}

export function calculateCostOfEquity(p: CostOfEquityParams): number {
  return (
    p.riskFreeRate +
    p.betaRelevered * p.equityRiskPremium +
    p.sizeRiskPremium +
    p.countryRiskPremium +
    p.currencyRiskPremium +
    p.specificRiskPremium
  );
}

export function calculateCostOfDebtAfterTax(costOfDebtPreTax: number, taxRate: number): number {
  return costOfDebtPreTax * (1 - taxRate);
}

export function calculateShareOfEquity(debtToEquity: number): number {
  return 1 / (1 + debtToEquity);
}

export function calculateWACC(
  costOfEquity: number,
  costOfDebtAfterTax: number,
  shareOfEquity: number,
): number {
  return costOfEquity * shareOfEquity + costOfDebtAfterTax * (1 - shareOfEquity);
}

export function calculateICR(ebit: number, interestExpense: number): number {
  if (!interestExpense) return Number.POSITIVE_INFINITY;
  return ebit / interestExpense;
}

// Minimal built-in ICR → rating (used by UI for live preview only; server uses the full Damodaran JSON).
const ICR_FALLBACK: ReadonlyArray<{ min: number; rating: CreditRating; spread: number }> = [
  { min: 12.5, rating: 'AAA', spread: 0.0063 },
  { min: 9.5, rating: 'AA', spread: 0.0078 },
  { min: 7.5, rating: 'A+', spread: 0.0098 },
  { min: 6.0, rating: 'A', spread: 0.0108 },
  { min: 4.5, rating: 'A-', spread: 0.0122 },
  { min: 4.0, rating: 'BBB', spread: 0.0156 },
  { min: 3.5, rating: 'BB+', spread: 0.02 },
  { min: 3.0, rating: 'BB', spread: 0.0241 },
  { min: 2.5, rating: 'B+', spread: 0.0316 },
  { min: 2.0, rating: 'B', spread: 0.0385 },
  { min: 1.5, rating: 'B-', spread: 0.0446 },
  { min: 1.25, rating: 'CCC', spread: 0.0518 },
  { min: 0.8, rating: 'CC', spread: 0.0581 },
  { min: 0.5, rating: 'C', spread: 0.0889 },
  { min: -Infinity, rating: 'D', spread: 0.1432 },
];

export function mapICRtoRating(icr: number): { rating: CreditRating; spread: number } {
  for (const entry of ICR_FALLBACK) {
    if (icr >= entry.min) return { rating: entry.rating, spread: entry.spread };
  }
  return { rating: 'D', spread: 0.1432 };
}

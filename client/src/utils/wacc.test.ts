import { describe, it, expect } from 'vitest';
import {
  calculateBetaRelevered,
  calculateBetaUnlevered,
  calculateCostOfDebtAfterTax,
  calculateCostOfEquity,
  calculateICR,
  calculateShareOfEquity,
  calculateWACC,
  mapICRtoRating,
} from '@shared/wacc';

describe('WACC pure formulas', () => {
  it('relevers beta with D/E and tax shield', () => {
    expect(calculateBetaRelevered(0.8, 0.25, 0.35)).toBeCloseTo(1.01, 6);
  });

  it('unlevers beta', () => {
    // Inverse of the relever
    expect(calculateBetaUnlevered(1.01, 0.25, 0.35)).toBeCloseTo(0.8, 4);
  });

  it('Cost of Equity sums components', () => {
    const coe = calculateCostOfEquity({
      riskFreeRate: 0.04,
      betaRelevered: 1.0,
      equityRiskPremium: 0.05,
      sizeRiskPremium: 0.01,
      countryRiskPremium: 0.02,
      currencyRiskPremium: 0,
      specificRiskPremium: 0,
    });
    expect(coe).toBeCloseTo(0.12, 6);
  });

  it('after-tax cost of debt', () => {
    expect(calculateCostOfDebtAfterTax(0.06, 0.25)).toBeCloseTo(0.045, 6);
  });

  it('share of equity', () => {
    expect(calculateShareOfEquity(0.35)).toBeCloseTo(1 / 1.35, 6);
  });

  it('WACC weights equity and debt', () => {
    expect(calculateWACC(0.12, 0.045, 1 / 1.35)).toBeCloseTo(0.1006, 3);
  });

  it('ICR divides EBIT by interest expense', () => {
    expect(calculateICR(500, 100)).toBe(5);
    expect(calculateICR(50, 8)).toBeCloseTo(6.25, 4);
  });

  it('maps ICR to rating using Damodaran table', () => {
    expect(mapICRtoRating(15).rating).toBe('AAA');
    expect(mapICRtoRating(6.25).rating).toBe('A');
    expect(mapICRtoRating(0.1).rating).toBe('D');
  });
});

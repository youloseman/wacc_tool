import type { WACCBoundInputs, WACCInputs } from '@shared/types';
import { calculateICR, mapICRtoRating } from '@shared/wacc';
import type { MetadataBundle } from '../context/MetadataContext';

function isLocalMode(shared: Pick<WACCInputs, 'waccMethodology' | 'countryOperations'>, meta: MetadataBundle): boolean {
  return shared.waccMethodology === 'local_currency' && meta.getEMRate(shared.countryOperations) != null;
}

export interface ResolvedBoundUI {
  debtToEquity: number;
  unleveredBeta: number;
  equityRiskPremium: number;
  taxRate: number;
  costOfDebtPreTax: number;
  sizePremium: number;
  countryRiskPremium: number;
}

export function resolveBoundForUI(
  shared: Pick<WACCInputs, 'currency' | 'countryOperations' | 'industry' | 'companySize' | 'waccMethodology'>,
  b: WACCBoundInputs,
  meta: MetadataBundle,
): ResolvedBoundUI {
  const industry = meta.findIndustry(shared.industry);
  const country = meta.findCountry(shared.countryOperations);
  const local = isLocalMode(shared, meta);
  const emRate = meta.getEMRate(shared.countryOperations);

  // D/E — UI shows industry default for 'analogs' until the server recomputes the analog median.
  let debtToEquity = industry?.deRatio ?? 0.35;
  if (b.deRatioSource === 'custom' && b.customDeRatio != null) debtToEquity = b.customDeRatio;

  // Tax
  let taxRate = country?.marginalTaxRate ?? 0.25;
  if (b.taxRateSource === 'custom' && b.customTaxRate != null) taxRate = b.customTaxRate;

  // Beta — findIndustry resolves aliases to canonical Damodaran rows, so industry.krollBeta
  // is already keyed correctly regardless of what alias the user typed/selected.
  let unleveredBeta = industry?.unleveredBeta ?? 0.9;
  if (b.betaSource === 'kroll') {
    if (industry?.krollBeta != null) unleveredBeta = industry.krollBeta;
  }
  // Comparables: UI shows Damodaran fallback until calculation runs.

  // ERP
  let equityRiskPremium = meta.matureMarketERP;
  if (b.erpSource === 'kroll') equityRiskPremium = meta.krollERP;
  else if (b.erpSource === 'custom' && b.customErp != null) equityRiskPremium = b.customErp;

  // Cost of Debt pre-tax (illustrative; server uses live FRED)
  const RATING_SPREADS: Record<string, number> = {
    AAA: 0.0063, 'AA+': 0.0078, AA: 0.0078, 'AA-': 0.0078,
    'A+': 0.0098, A: 0.0108, 'A-': 0.0122,
    'BBB+': 0.0156, BBB: 0.0156, 'BBB-': 0.022,
    'BB+': 0.024, BB: 0.0266, 'B+': 0.0316, B: 0.0385, 'B-': 0.0446,
    CCC: 0.0782, CC: 0.0878, C: 0.1174, D: 0.1546,
  };
  const FALLBACK_RF: Record<string, number> = { USD: 0.0425, EUR: 0.025, GBP: 0.042, CHF: 0.012 };
  const rf = local && emRate ? emRate.rate10Y : FALLBACK_RF[shared.currency] ?? 0.0425;

  let costOfDebtPreTax = rf + RATING_SPREADS['A'];
  if (b.costOfDebtMethod === 'direct' && b.directCostOfDebt != null) {
    costOfDebtPreTax = b.directCostOfDebt;
  } else if (b.costOfDebtMethod === 'rating' && b.creditRating) {
    costOfDebtPreTax = rf + (RATING_SPREADS[b.creditRating] ?? RATING_SPREADS['A']);
  } else if (
    b.costOfDebtMethod === 'icr' &&
    b.ebit != null &&
    b.interestExpense != null &&
    b.interestExpense > 0
  ) {
    const { spread } = mapICRtoRating(calculateICR(b.ebit, b.interestExpense));
    costOfDebtPreTax = rf + spread;
  }

  // Size
  const sizeDefault = meta.krollSizePremiums[shared.companySize]?.premium ?? 0;
  const sizePremium = b.sizePremiumOverride != null ? b.sizePremiumOverride : sizeDefault;

  // Country — in local mode CRP is embedded in Rf, force to 0 regardless of override.
  const countryDefault = country?.countryRiskPremium ?? 0;
  const countryRiskPremium = local
    ? 0
    : b.countryRiskPremiumOverride != null
      ? b.countryRiskPremiumOverride
      : countryDefault;

  return {
    debtToEquity,
    unleveredBeta,
    equityRiskPremium,
    taxRate,
    costOfDebtPreTax,
    sizePremium,
    countryRiskPremium,
  };
}

import type {
  BetaSourceSingle,
  CreditRating,
  WACCBoundInputs,
  WACCInputs,
  WACCResult,
  WACCResultRow,
} from '../../../shared/types.ts';
import {
  calculateBetaRelevered,
  calculateCostOfDebtAfterTax,
  calculateCostOfEquity,
  calculateICR,
  calculateShareOfEquity,
  calculateWACC,
} from '../../../shared/wacc.ts';
import { getRiskFreeRate, type Currency as RfCurrency, type Horizon, type Methodology } from './riskFreeRate.ts';
import { getEMRate } from './emRates.ts';
import { getCreditSpread } from './creditSpread.ts';
import {
  findCountryRisk,
  findCountryTax,
  findIndustry,
  getMatureMarketERP,
  getIndustriesLastUpdated,
  getCountryRiskLastUpdated,
  mapIcrToRatingFromFile,
} from './damodaranData.ts';
import {
  getKrollERP,
  getKrollLastUpdated,
  getKrollSizePremium,
  lookupKrollBeta,
} from './krollData.ts';
import { calculateComparableBeta, lookupCompany, type ComparableBetaResult } from './comparableBeta.ts';

interface ResolvedBound {
  debtToEquity: number;
  deSource: string;
  unleveredBeta: number;
  betaSourceLabel: string;
  equityRiskPremium: number;
  erpSourceLabel: string;
  costOfDebtPreTax: number;
  costOfDebtSource: string;
  costOfDebtDescription: string;
  taxRate: number;
  taxSource: string;
  sizePremium: number;
  sizeSource: string;
  countryRiskPremium: number;
  countrySource: string;
  currencyRiskPremium: number;
  specificRiskPremium: number;
  comparable?: ComparableBetaResult;
}

function betaLabel(source: BetaSourceSingle, date: string): string {
  if (source === 'damodaran') return `Damodaran (${date})`;
  if (source === 'kroll') return `Kroll (${date})`;
  return 'Comparables';
}

function describeOneSideBeta(r: ResolvedBound): string {
  const c = r.comparable;
  if (!c || c.companies.length === 0) return 'Industry unlevered beta.';
  const anyCalc = c.companies.some((x) => x.betaMethod?.startsWith('calculated'));
  // D/E source breakdown — counts per provenance category for transparency.
  const deCounts = {
    firm: c.companies.filter((x) => x.deSource === 'firm').length,
    bs: c.companies.filter((x) => x.deSource === 'balance-sheet').length,
    mkt: c.companies.filter((x) => x.deSource === 'market-cap').length,
    proxy: c.companies.filter((x) => x.deSource === 'industry-proxy').length,
  };
  const deBreakdownParts: string[] = [];
  if (deCounts.firm) deBreakdownParts.push(`${deCounts.firm} firm`);
  if (deCounts.bs) deBreakdownParts.push(`${deCounts.bs} from balance sheet`);
  if (deCounts.mkt) deBreakdownParts.push(`${deCounts.mkt} market-cap`);
  if (deCounts.proxy) deBreakdownParts.push(`${deCounts.proxy} industry proxy`);
  const deBreakdown =
    deBreakdownParts.length > 0 ? ` D/E sources: ${deBreakdownParts.join(', ')}.` : '';
  if (!anyCalc) {
    return `Median unlevered beta from ${c.companies.length} comparable(s).${deBreakdown}`;
  }
  const avgR2 =
    c.companies.reduce((a, x) => a + (x.averageRSquared ?? 0), 0) / c.companies.length;
  const stabilityCounts = {
    stable: c.companies.filter((x) => x.stability === 'stable').length,
    moderate: c.companies.filter((x) => x.stability === 'moderate').length,
    unstable: c.companies.filter((x) => x.stability === 'unstable').length,
  };
  return (
    `Median unlevered β from ${c.companies.length} comparable(s). 5Y monthly returns vs ${c.benchmark ?? 'S&P 500'}, ` +
    `3 rolling windows. Avg R²: ${avgR2.toFixed(2)}. Peer stability: ${stabilityCounts.stable} stable, ${stabilityCounts.moderate} moderate, ${stabilityCounts.unstable} unstable.${deBreakdown}`
  );
}

function describeUnleveredBeta(lo: ResolvedBound, hi: ResolvedBound): string {
  const l = describeOneSideBeta(lo);
  const h = describeOneSideBeta(hi);
  return l === h ? l : `MIN: ${l} / MAX: ${h}`;
}

function describeRelevered(lo: ResolvedBound, hi: ResolvedBound): string {
  const base = 'β_u × (1 + (1 − t) × D/E).';
  const extras: string[] = [];
  for (const [tag, r] of [['MIN', lo], ['MAX', hi]] as const) {
    if (r.comparable?.companies?.some((c) => c.betaMethod?.startsWith('calculated'))) {
      const c = r.comparable;
      extras.push(
        `${tag}: β_u ${c.medianUnleveredBeta?.toFixed(2)} × (1 + (1 − ${(r.taxRate * 100).toFixed(1)}%) × ${(r.debtToEquity * 100).toFixed(1)}%)`,
      );
    }
  }
  return extras.length > 0 ? `${base} ${extras.join(' · ')}` : base;
}

async function resolveUnleveredBeta(
  industry: string,
  source: BetaSourceSingle,
  tickers: string,
  targetDE: number,
  targetTax: number,
  valuationDate: string,
  krollSectorGics: string | null,
): Promise<{ beta: number; label: string; comparable?: ComparableBetaResult }> {
  if (source === 'damodaran') {
    const ind = findIndustry(industry);
    return {
      beta: ind?.unleveredBeta ?? 0.9,
      label: betaLabel('damodaran', getIndustriesLastUpdated()),
    };
  }
  if (source === 'kroll') {
    // Resolve alias to the canonical Damodaran industry name for name-based fallback lookup.
    const canonical = findIndustry(industry)?.name ?? industry;
    // Time-series-aware lookup: uses the user-selected Kroll GICS sector if provided, falls
    // back to Damodaran-name matching if not. Returns the nearest quarter ≤ valuationDate.
    const lookup = lookupKrollBeta({
      krollSector: krollSectorGics,
      damodaranIndustry: canonical,
      valuationDate,
    });
    if (lookup) {
      return {
        beta: lookup.beta,
        label: `Kroll ${lookup.industryName} (${lookup.quarterLabel})`,
      };
    }
    const ind = findIndustry(industry);
    return {
      beta: ind?.unleveredBeta ?? 0.9,
      label: `Kroll (no data → Damodaran ${getIndustriesLastUpdated()})`,
    };
  }
  // comparables
  const tickerList = tickers
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (tickerList.length === 0) {
    const ind = findIndustry(industry);
    return {
      beta: ind?.unleveredBeta ?? 0.9,
      label: 'Comparables (no tickers → Damodaran fallback)',
    };
  }
  const comp = await calculateComparableBeta(tickerList, targetDE, targetTax, industry, valuationDate);
  return {
    beta: comp.medianUnleveredBeta ?? findIndustry(industry)?.unleveredBeta ?? 0.9,
    label: `Comparables (${comp.companies.map((c) => c.ticker).join(', ') || tickerList.join(', ')})`,
    comparable: comp,
  };
}

async function resolveBound(
  shared: Pick<WACCInputs, 'currency' | 'countryOperations' | 'companySize' | 'waccMethodology' | 'valuationDate'>,
  b: WACCBoundInputs,
): Promise<ResolvedBound> {
  const rf = await getRiskFreeRate(
    shared.currency as RfCurrency,
    '10Y' as Horizon,
    shared.countryOperations,
    shared.waccMethodology as Methodology,
  );
  const isLocal = shared.waccMethodology === 'local_currency' && rf.isStatic === true;

  // D/E — the Damodaran industry is per-bound now, so MIN and MAX can target different
  // industry classifications independently.
  const ind = findIndustry(b.damodaranIndustry);
  let debtToEquity = ind?.deRatio ?? 0.35;
  let deSource = `Damodaran (${getIndustriesLastUpdated()})`;
  if (b.deRatioSource === 'custom' && b.customDeRatio != null) {
    debtToEquity = b.customDeRatio;
    deSource = 'Analyst input';
  } else if (b.deRatioSource === 'analogs' && b.analogTickers.trim()) {
    // Median D/E across analog companies.
    const analogList = b.analogTickers.split(',').map((t) => t.trim()).filter(Boolean);
    const results = await Promise.all(
      analogList.map((t) => lookupCompany(t, b.damodaranIndustry, shared.valuationDate)),
    );
    const hits = results.filter((r): r is NonNullable<typeof r> => r != null);
    if (hits.length > 0) {
      const sorted = hits.map((r) => r.deRatio).sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      debtToEquity =
        sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      deSource = `Analogs median (${hits.map((r) => r.ticker).join(', ')})`;
    } else {
      deSource = 'Analogs n/a → Damodaran industry';
    }
  }

  // Tax (needed before beta unlever in some cases, but we use it only for relever/cod)
  let taxRate = findCountryTax(shared.countryOperations)?.marginalTaxRate ?? 0.25;
  let taxSource = `Damodaran (${getIndustriesLastUpdated()})`;
  if (b.taxRateSource === 'custom' && b.customTaxRate != null) {
    taxRate = b.customTaxRate;
    taxSource = 'Analyst input';
  }

  // Unlevered beta
  const betaRes = await resolveUnleveredBeta(
    b.damodaranIndustry,
    b.betaSource,
    b.comparableTickers,
    debtToEquity,
    taxRate,
    shared.valuationDate,
    b.krollSectorGics ?? null,
  );

  // ERP
  let equityRiskPremium = getMatureMarketERP();
  let erpSourceLabel = `Damodaran (${getCountryRiskLastUpdated()})`;
  if (b.erpSource === 'kroll') {
    equityRiskPremium = getKrollERP();
    erpSourceLabel = `Kroll (${getKrollLastUpdated()})`;
  } else if (b.erpSource === 'custom' && b.customErp != null) {
    equityRiskPremium = b.customErp;
    erpSourceLabel = 'Analyst input';
  }

  // Cost of Debt pre-tax
  let costOfDebtPreTax: number;
  let costOfDebtSource: string;
  let costOfDebtDescription: string;
  if (b.costOfDebtMethod === 'direct' && b.directCostOfDebt != null) {
    costOfDebtPreTax = b.directCostOfDebt;
    costOfDebtSource = 'Analyst input';
    costOfDebtDescription = 'User-provided pre-tax cost of debt.';
  } else if (b.costOfDebtMethod === 'rating' && b.creditRating) {
    const cs = await getCreditSpread(b.creditRating);
    costOfDebtPreTax = rf.rate + cs.spread;
    costOfDebtSource = `${cs.source} (${cs.series})`;
    costOfDebtDescription = `Rf + OAS for ${b.creditRating} (${cs.date}).`;
  } else if (
    b.costOfDebtMethod === 'icr' &&
    b.ebit != null &&
    b.interestExpense != null &&
    b.interestExpense > 0
  ) {
    const icr = calculateICR(b.ebit, b.interestExpense);
    const bucket = shared.companySize === 'micro' || shared.companySize === 'small' ? 'small' : 'large';
    const mapped = mapIcrToRatingFromFile(icr, bucket);
    costOfDebtPreTax = rf.rate + mapped.spread;
    costOfDebtSource = `Damodaran ICR → ${mapped.rating}`;
    costOfDebtDescription = `ICR = ${icr.toFixed(2)} → ${mapped.rating}; Rf + ${(mapped.spread * 100).toFixed(2)}%.`;
  } else {
    const cs = await getCreditSpread('A' as CreditRating);
    costOfDebtPreTax = rf.rate + cs.spread;
    costOfDebtSource = `${cs.source} (${cs.series})`;
    costOfDebtDescription = `Fallback: Rf + spread for A (${cs.date}).`;
  }

  // Country risk premium. In local-currency mode with a known EM Rf, CRP is embedded in Rf → force 0.
  let countryRiskPremium: number;
  let countrySource: string;
  if (isLocal) {
    countryRiskPremium = 0;
    countrySource = 'N/A (embedded in Rf)';
  } else {
    countryRiskPremium = findCountryRisk(shared.countryOperations)?.countryRiskPremium ?? 0;
    countrySource = `Damodaran (${getCountryRiskLastUpdated()})`;
    if (b.countryRiskPremiumOverride != null) {
      countryRiskPremium = b.countryRiskPremiumOverride;
      countrySource = 'Analyst input';
    }
  }

  // Size premium
  let sizePremium = getKrollSizePremium(shared.companySize);
  let sizeSource = `Kroll (${getKrollLastUpdated()})`;
  if (b.sizePremiumOverride != null) {
    sizePremium = b.sizePremiumOverride;
    sizeSource = 'Analyst input';
  }

  return {
    debtToEquity,
    deSource,
    unleveredBeta: betaRes.beta,
    betaSourceLabel: betaRes.label,
    comparable: betaRes.comparable,
    equityRiskPremium,
    erpSourceLabel,
    costOfDebtPreTax,
    costOfDebtSource,
    costOfDebtDescription,
    taxRate,
    taxSource,
    sizePremium,
    sizeSource,
    countryRiskPremium,
    countrySource,
    currencyRiskPremium: b.currencyRiskPremium,
    specificRiskPremium: b.specificRiskPremium,
  };
}

export async function composeWACC(inputs: WACCInputs): Promise<WACCResult> {
  const rf = await getRiskFreeRate(
    inputs.currency as RfCurrency,
    '10Y' as Horizon,
    inputs.countryOperations,
    inputs.waccMethodology as Methodology,
  );
  const [minR, maxR] = await Promise.all([
    resolveBound(inputs, inputs.minBound),
    resolveBound(inputs, inputs.maxBound),
  ]);

  const minBetaRelev = calculateBetaRelevered(minR.unleveredBeta, minR.taxRate, minR.debtToEquity);
  const maxBetaRelev = calculateBetaRelevered(maxR.unleveredBeta, maxR.taxRate, maxR.debtToEquity);

  const minCoE = calculateCostOfEquity({
    riskFreeRate: rf.rate,
    betaRelevered: minBetaRelev,
    equityRiskPremium: minR.equityRiskPremium,
    sizeRiskPremium: minR.sizePremium,
    countryRiskPremium: minR.countryRiskPremium,
    currencyRiskPremium: minR.currencyRiskPremium,
    specificRiskPremium: minR.specificRiskPremium,
  });
  const maxCoE = calculateCostOfEquity({
    riskFreeRate: rf.rate,
    betaRelevered: maxBetaRelev,
    equityRiskPremium: maxR.equityRiskPremium,
    sizeRiskPremium: maxR.sizePremium,
    countryRiskPremium: maxR.countryRiskPremium,
    currencyRiskPremium: maxR.currencyRiskPremium,
    specificRiskPremium: maxR.specificRiskPremium,
  });

  const minCoDAfter = calculateCostOfDebtAfterTax(minR.costOfDebtPreTax, minR.taxRate);
  const maxCoDAfter = calculateCostOfDebtAfterTax(maxR.costOfDebtPreTax, maxR.taxRate);

  const minShareEq = calculateShareOfEquity(minR.debtToEquity);
  const maxShareEq = calculateShareOfEquity(maxR.debtToEquity);

  const minWacc = calculateWACC(minCoE, minCoDAfter, minShareEq);
  const maxWacc = calculateWACC(maxCoE, maxCoDAfter, maxShareEq);

  // Ensure MIN column holds the lower WACC and MAX the higher one.
  // If the calculated "min" scenario yields a higher WACC than "max", swap all paired values.
  let lo = {
    R: minR,
    betaRelev: minBetaRelev,
    coE: minCoE,
    coDAfter: minCoDAfter,
    shareEq: minShareEq,
    wacc: minWacc,
  };
  let hi = {
    R: maxR,
    betaRelev: maxBetaRelev,
    coE: maxCoE,
    coDAfter: maxCoDAfter,
    shareEq: maxShareEq,
    wacc: maxWacc,
  };
  if (lo.wacc > hi.wacc) {
    [lo, hi] = [hi, lo];
  }

  const rfSource = `${rf.source} (${rf.series})`;

  const rows: WACCResultRow[] = [
    {
      component: 'Risk-free rate',
      min: rf.rate,
      max: rf.rate,
      format: 'percent',
      description: rf.description,
      sourceMin: rfSource,
      sourceMax: rfSource,
    },
    {
      component: 'Equity risk premium',
      min: lo.R.equityRiskPremium,
      max: hi.R.equityRiskPremium,
      format: 'percent',
      description: 'Mature-market equity risk premium.',
      sourceMin: lo.R.erpSourceLabel,
      sourceMax: hi.R.erpSourceLabel,
    },
    {
      component: 'Beta (unlevered)',
      min: lo.R.unleveredBeta,
      max: hi.R.unleveredBeta,
      format: 'beta',
      description: describeUnleveredBeta(lo.R, hi.R),
      sourceMin: lo.R.betaSourceLabel,
      sourceMax: hi.R.betaSourceLabel,
    },
    {
      component: 'Beta (relevered)',
      min: lo.betaRelev,
      max: hi.betaRelev,
      format: 'beta',
      description: describeRelevered(lo.R, hi.R),
      sourceMin: 'Calculation',
      sourceMax: 'Calculation',
    },
    {
      component: 'Small size risk premium',
      min: lo.R.sizePremium,
      max: hi.R.sizePremium,
      format: 'percent',
      description: `Size premium for ${inputs.companySize}.`,
      sourceMin: lo.R.sizeSource,
      sourceMax: hi.R.sizeSource,
    },
    {
      component: 'Country risk premium',
      min: lo.R.countryRiskPremium,
      max: hi.R.countryRiskPremium,
      format: 'percent',
      description: `CRP for ${inputs.countryOperations}.`,
      sourceMin: lo.R.countrySource,
      sourceMax: hi.R.countrySource,
    },
    {
      component: 'Currency risk premium',
      min: lo.R.currencyRiskPremium,
      max: hi.R.currencyRiskPremium,
      format: 'percent',
      description: 'Currency risk premium.',
      sourceMin: 'Analyst input',
      sourceMax: 'Analyst input',
    },
    {
      component: 'Specific risk premium',
      min: lo.R.specificRiskPremium,
      max: hi.R.specificRiskPremium,
      format: 'percent',
      description: 'Company-specific risk premium.',
      sourceMin: 'Analyst input',
      sourceMax: 'Analyst input',
    },
    {
      component: 'Cost of Equity',
      min: lo.coE,
      max: hi.coE,
      format: 'percent',
      description: 'Rf + β_relev × ERP + size + country + currency + specific.',
      sourceMin: 'Calculation',
      sourceMax: 'Calculation',
      isBold: true,
      isSubtotal: true,
      highlight: 'purple',
    },
    {
      component: 'Cost of Debt (pre-tax)',
      min: lo.R.costOfDebtPreTax,
      max: hi.R.costOfDebtPreTax,
      format: 'percent',
      description:
        lo.R.costOfDebtDescription === hi.R.costOfDebtDescription
          ? lo.R.costOfDebtDescription
          : `MIN: ${lo.R.costOfDebtDescription} / MAX: ${hi.R.costOfDebtDescription}`,
      sourceMin: lo.R.costOfDebtSource,
      sourceMax: hi.R.costOfDebtSource,
    },
    {
      component: 'Tax rate',
      min: lo.R.taxRate,
      max: hi.R.taxRate,
      format: 'percent',
      description: 'Marginal corporate tax rate.',
      sourceMin: lo.R.taxSource,
      sourceMax: hi.R.taxSource,
    },
    {
      component: 'Cost of Debt (after-tax)',
      min: lo.coDAfter,
      max: hi.coDAfter,
      format: 'percent',
      description: 'Cost of Debt pre-tax × (1 − tax rate).',
      sourceMin: 'Calculation',
      sourceMax: 'Calculation',
      isBold: true,
      isSubtotal: true,
      highlight: 'darkPurple',
    },
    {
      component: 'Share of Equity',
      min: lo.shareEq,
      max: hi.shareEq,
      format: 'percent',
      description: `1 / (1 + D/E) · D/E MIN ${(lo.R.debtToEquity * 100).toFixed(2)}% / MAX ${(hi.R.debtToEquity * 100).toFixed(2)}%.`,
      sourceMin: lo.R.deSource,
      sourceMax: hi.R.deSource,
    },
    {
      component: 'Share of Debt',
      min: 1 - lo.shareEq,
      max: 1 - hi.shareEq,
      format: 'percent',
      description: '1 − Share of Equity.',
      sourceMin: lo.R.deSource,
      sourceMax: hi.R.deSource,
    },
    {
      component: 'WACC',
      min: lo.wacc,
      max: hi.wacc,
      format: 'percent',
      description: 'CoE × w_e + CoD_after-tax × w_d.',
      sourceMin: 'Calculation',
      sourceMax: 'Calculation',
      isBold: true,
      isSubtotal: true,
      highlight: 'purple',
    },
  ];

  const effectiveCurrency = rf.effectiveCurrency ?? inputs.currency;
  return {
    rows,
    currency: effectiveCurrency,
    valuationDate: inputs.valuationDate,
    companyName: inputs.companyName,
    methodology: inputs.waccMethodology,
    effectiveCurrency,
  };
}

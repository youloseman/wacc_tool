import { Router } from 'express';
import type { WACCInputs } from '../../../shared/types.ts';
import { composeWACC } from '../services/waccComposer.ts';
import { getRiskFreeRate, type Currency, type Horizon, type Methodology } from '../services/riskFreeRate.ts';
import { lookupCompany, searchCompanies } from '../services/comparableBeta.ts';
import { DEVELOPED_COUNTRIES, getEMData } from '../services/emRates.ts';
import {
  getDamodaranIndustries,
  getDamodaranCountries,
  getDamodaranTaxRates,
  getIndustriesLastUpdated,
  getCountryRiskLastUpdated,
  getMatureMarketERP,
  findIndustry,
  findCountryRisk,
  findCountryTax,
} from '../services/damodaranData.ts';
import {
  findKrollIndustryBeta,
  getKrollERP,
  getKrollIndustryBetas,
  getKrollLastUpdated,
  getKrollSizePremiumMap,
} from '../services/krollData.ts';

export const apiRouter = Router();

apiRouter.get('/health', async (_req, res) => {
  const hasFredKey = !!process.env.FRED_API_KEY;
  const hasFmpKey = !!process.env.FMP_API_KEY;
  let fredReachable = false;
  try {
    const r = await getRiskFreeRate('USD', '10Y');
    fredReachable = !r.fallback;
  } catch {
    fredReachable = false;
  }
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    dataSources: {
      fred: { reachable: fredReachable, hasApiKey: hasFredKey },
      fmp: { hasApiKey: hasFmpKey },
      damodaranIndustries: {
        loaded: true,
        count: getDamodaranIndustries().length,
        lastUpdated: getIndustriesLastUpdated(),
      },
      damodaranCountries: {
        loaded: true,
        count: getDamodaranCountries().length,
        lastUpdated: getCountryRiskLastUpdated(),
      },
      kroll: { loaded: true, lastUpdated: getKrollLastUpdated() },
      emRates: { loaded: true, count: Object.keys(getEMData().rates).length },
    },
  });
});

apiRouter.post('/calculate', async (req, res) => {
  const inputs = req.body as WACCInputs;
  if (!inputs || typeof inputs !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  try {
    const result = await composeWACC(inputs);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Calculation failed',
    });
  }
});

apiRouter.get('/risk-free-rate', async (req, res) => {
  const currency = (req.query.currency as Currency) || 'USD';
  const horizon = (req.query.horizon as Horizon) || '10Y';
  const country = (req.query.country as string) || undefined;
  const methodology = (req.query.methodology as Methodology) || 'hard_currency';
  const r = await getRiskFreeRate(currency, horizon, country, methodology);
  res.json(r);
});

apiRouter.get('/em-rates', (_req, res) => {
  res.json({
    ...getEMData(),
    developedCountries: Array.from(DEVELOPED_COUNTRIES),
  });
});

apiRouter.get('/industries', (_req, res) => {
  const dam = getDamodaranIndustries();
  const kroll = getKrollIndustryBetas();
  // Match Kroll by canonical Damodaran name only (client alias resolution happens separately).
  const krollMap = new Map(kroll.map((k) => [k.industry.toLowerCase(), k.fullInformationBeta]));
  const merged = dam.map((d) => ({
    name: d.name,
    aliases: d.aliases,
    region: d.region,
    unleveredBeta: d.unleveredBeta,
    leveredBeta: d.leveredBeta,
    deRatio: d.deRatio,
    effectiveTaxRate: d.effectiveTaxRate,
    numberOfFirms: d.numberOfFirms,
    krollBeta: krollMap.get(d.name.toLowerCase()) ?? null,
  }));
  res.json({
    lastUpdated: getIndustriesLastUpdated(),
    industries: merged,
  });
});

apiRouter.get('/industry-info', (req, res) => {
  const name = (req.query.name as string) || '';
  const dam = findIndustry(name);
  if (!dam) return res.status(404).json({ error: 'Industry not found' });
  const krollBeta = findKrollIndustryBeta(dam.name);
  res.json({
    damodaran: dam,
    kroll: krollBeta == null ? null : { fullInformationBeta: krollBeta, lastUpdated: getKrollLastUpdated() },
  });
});

apiRouter.get('/countries', (_req, res) => {
  const risks = getDamodaranCountries();
  const taxes = getDamodaranTaxRates();
  const taxMap = new Map(taxes.map((t) => [t.name.toLowerCase(), t]));
  const merged = risks.map((c) => {
    const t = taxMap.get(c.name.toLowerCase());
    return {
      name: c.name,
      region: c.region,
      moodysRating: c.moodysRating,
      countryRiskPremium: c.countryRiskPremium,
      equityRiskPremium: c.equityRiskPremium,
      marginalTaxRate: t?.marginalTaxRate ?? null,
      effectiveTaxRate: t?.effectiveTaxRate ?? null,
    };
  });
  res.json({
    lastUpdated: getCountryRiskLastUpdated(),
    matureMarketERP: getMatureMarketERP(),
    countries: merged,
  });
});

apiRouter.get('/country-info', (req, res) => {
  const name = (req.query.name as string) || '';
  const risk = findCountryRisk(name);
  const tax = findCountryTax(name);
  if (!risk && !tax) return res.status(404).json({ error: 'Country not found' });
  res.json({ risk, tax });
});

apiRouter.get('/company-lookup', async (req, res) => {
  const ticker = (req.query.ticker as string) || '';
  const valuationDate = (req.query.valuationDate as string) || undefined;
  const industry = (req.query.industry as string) || undefined;
  if (!ticker) return res.status(400).json({ error: 'Missing ticker' });
  const result = await lookupCompany(ticker, industry, valuationDate);
  if (!result) return res.status(404).json({ error: `Ticker '${ticker}' not found` });
  res.json(result);
});

apiRouter.get('/company-search', async (req, res) => {
  const q = (req.query.q as string) || '';
  if (!q.trim()) return res.status(400).json({ error: 'Missing q' });
  const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 10));
  const results = await searchCompanies(q, limit);
  res.json({ query: q, results });
});

apiRouter.get('/metadata', (_req, res) => {
  const em = getEMData();
  res.json({
    matureMarketERP: getMatureMarketERP(),
    krollERP: getKrollERP(),
    krollSizePremiums: getKrollSizePremiumMap(),
    industriesLastUpdated: getIndustriesLastUpdated(),
    countriesLastUpdated: getCountryRiskLastUpdated(),
    krollLastUpdated: getKrollLastUpdated(),
    emRates: em.rates,
    emLastUpdated: em.lastUpdated,
    developedCountries: Array.from(DEVELOPED_COUNTRIES),
  });
});

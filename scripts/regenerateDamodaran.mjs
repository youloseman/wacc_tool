// Regenerate damodaran-*.json files from the Jan 2026 Damodaran Excel files.
import XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'E:/WACC_Tool/wacc-calculator/scripts/Damodaran';
const OUT = 'E:/WACC_Tool/wacc-calculator/server/src/data/damodaran';

function read(file, sheetName) {
  const buf = fs.readFileSync(path.join(SRC, file));
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = sheetName ? wb.Sheets[sheetName] : wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
}

function excelSerialToISO(serial) {
  // Excel epoch: 1900-01-00. Serial 46027 → 2026-01-05.
  const ms = (serial - 25569) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

// ---------- Industries ----------
const industriesRows = read('betas.xls', 'Industry Averages');
const industryDateSerial = industriesRows[0]?.[1];
const industriesLastUpdated = typeof industryDateSerial === 'number'
  ? excelSerialToISO(industryDateSerial)
  : '2026-01-05';

// Header at row 9, data rows 10+
const industries = [];
for (let i = 10; i < industriesRows.length; i++) {
  const r = industriesRows[i];
  if (!r || !r[0]) continue;
  const name = String(r[0]).trim();
  if (!name) continue;
  const numberOfFirms = Number(r[1] ?? 0);
  const leveredBeta = Number(r[2] ?? 0);
  const deRatio = Number(r[3] ?? 0);
  const effectiveTaxRate = Number(r[4] ?? 0);
  const unleveredBeta = Number(r[5] ?? 0);
  const cashFirmValue = Number(r[6] ?? 0);
  const unleveredBetaCorrected = Number(r[7] ?? 0);
  industries.push({
    name,
    aliases: [],
    region: 'US',
    numberOfFirms,
    unleveredBeta: Number(unleveredBeta.toFixed(4)),
    leveredBeta: Number(leveredBeta.toFixed(4)),
    deRatio: Number(deRatio.toFixed(4)),
    effectiveTaxRate: Number(effectiveTaxRate.toFixed(4)),
    cashFirmValue: Number(cashFirmValue.toFixed(4)),
    unleveredBetaCorrected: Number(unleveredBetaCorrected.toFixed(4)),
  });
}

// Preserve useful aliases for well-known industry names
const ALIASES = {
  'Oil/Gas (Integrated)': ['Oil/Gas', 'Integrated Oil'],
  'Oil/Gas (Production and Exploration)': ['Oil/Gas E&P', 'E&P'],
  Advertising: ['Advertising'],
  'Aerospace/Defense': ['Defense'],
  'Air Transport': ['Airlines'],
  'Auto & Truck': ['Automotive'],
  'Bank (Money Center)': ['Banks'],
  'Drugs (Biotechnology)': ['Biotech'],
  'Drugs (Pharmaceutical)': ['Pharmaceutical'],
  'Farming/Agriculture': ['Agriculture'],
  'Financial Svcs. (Non-bank & Insurance)': ['Financials'],
  'Food Processing': ['Food Products'],
  'Green & Renewable Energy': ['Renewables'],
  'Metals & Mining': ['Mining'],
  'R.E.I.T.': ['REIT'],
  'Real Estate (General/Diversified)': ['Real Estate'],
  'Restaurant/Dining': ['Restaurant'],
  'Retail (General)': ['Retail'],
  'Software (System & Application)': ['Software', 'Technology'],
  'Telecom (Wireless)': ['Telecom'],
  Power: ['Utilities'],
};
for (const ind of industries) {
  if (ALIASES[ind.name]) ind.aliases = ALIASES[ind.name];
}

// ---------- Europe overlay ----------
const europeRows = read('betaEurope.xls', 'Industry Averages');
const europeByName = new Map();
for (let i = 10; i < europeRows.length; i++) {
  const r = europeRows[i];
  if (!r || !r[0]) continue;
  const name = String(r[0]).trim();
  if (!name || name === 'Grand Total') continue;
  const entry = {
    numberOfFirms: Number(r[1] ?? 0),
    leveredBeta: Number(Number(r[2] ?? 0).toFixed(4)),
    deRatio: Number(Number(r[3] ?? 0).toFixed(4)),
    effectiveTaxRate: Number(Number(r[4] ?? 0).toFixed(4)),
    unleveredBeta: Number(Number(r[5] ?? 0).toFixed(4)),
  };
  europeByName.set(name.toLowerCase(), { name, ...entry });
}

// Attach Europe overlay to existing industries; add Europe-only rows as region='Europe'.
for (const ind of industries) {
  const e = europeByName.get(ind.name.toLowerCase());
  if (e) {
    ind.europe = {
      numberOfFirms: e.numberOfFirms,
      unleveredBeta: e.unleveredBeta,
      leveredBeta: e.leveredBeta,
      deRatio: e.deRatio,
      effectiveTaxRate: e.effectiveTaxRate,
    };
    europeByName.delete(ind.name.toLowerCase());
  }
}
let europeOnlyCount = 0;
for (const e of europeByName.values()) {
  industries.push({
    name: `${e.name} (Europe)`,
    aliases: [e.name],
    region: 'Europe',
    numberOfFirms: e.numberOfFirms,
    unleveredBeta: e.unleveredBeta,
    leveredBeta: e.leveredBeta,
    deRatio: e.deRatio,
    effectiveTaxRate: e.effectiveTaxRate,
    cashFirmValue: 0,
    unleveredBetaCorrected: e.unleveredBeta,
  });
  europeOnlyCount++;
}
console.log(`[europe]    attached overlay to ${industries.filter((i) => i.europe).length} US rows, added ${europeOnlyCount} Europe-only rows`);

fs.writeFileSync(
  path.join(OUT, 'damodaran-industries.json'),
  JSON.stringify(
    {
      lastUpdated: industriesLastUpdated,
      source: 'Aswath Damodaran, NYU Stern',
      sourceUrl: 'https://pages.stern.nyu.edu/~adamodar/pc/datasets/betas.html',
      industries,
    },
    null,
    2,
  ),
);
console.log(`[industries] wrote ${industries.length} industries, lastUpdated=${industriesLastUpdated}`);

// ---------- Country risk ----------
const ctryRows = read('ctryprem.xlsx', 'Regional breakdown');
// Header row 0; data from row 1
const countries = [];
for (let i = 1; i < ctryRows.length; i++) {
  const r = ctryRows[i];
  if (!r || !r[0]) continue;
  const name = String(r[0]).trim();
  const moodys = r[2] == null ? null : String(r[2]).trim();
  const adjDefaultSpread = typeof r[4] === 'number' ? r[4] : null;
  const erp = typeof r[5] === 'number' ? r[5] : null;
  const crp = typeof r[6] === 'number' ? r[6] : null;
  const region = r[8] == null ? '' : String(r[8]).trim();
  if (erp == null || crp == null) continue;
  countries.push({
    name,
    region,
    moodysRating: moodys ?? '',
    countryDefaultSpread: Number((adjDefaultSpread ?? 0).toFixed(4)),
    equityRiskPremium: Number(erp.toFixed(4)),
    countryRiskPremium: Number(crp.toFixed(4)),
  });
}

// Russia is not included in Damodaran's Jan 2026 country-risk dataset (sovereign rating withdrawn).
// Add it back with conservative high-risk values so the dropdown remains complete.
if (!countries.some((c) => c.name.toLowerCase().includes('russ'))) {
  countries.push({
    name: 'Russia',
    region: 'Eastern Europe & Russia',
    moodysRating: 'Ca',
    countryDefaultSpread: 0.1019,
    equityRiskPremium: 0.1442,
    countryRiskPremium: 0.1019,
  });
}

// Mature market ERP: ERPs sheet row "mature market" or compute from US: US ERP - US default spread.
const us = countries.find((c) => c.name.toLowerCase() === 'united states');
let matureMarketERP = 0.0423;
if (us) {
  matureMarketERP = Number((us.equityRiskPremium - us.countryDefaultSpread).toFixed(4));
}

fs.writeFileSync(
  path.join(OUT, 'damodaran-country-risk.json'),
  JSON.stringify(
    {
      lastUpdated: industriesLastUpdated,
      source: 'Aswath Damodaran, NYU Stern',
      sourceUrl: 'https://pages.stern.nyu.edu/~adamodar/pc/datasets/ctryprem.html',
      matureMarketERP,
      countries,
    },
    null,
    2,
  ),
);
console.log(`[countries] wrote ${countries.length} countries, matureMarketERP=${matureMarketERP}`);

// ---------- Tax rates ----------
// Damodaran's countrytaxrates.xls: header row 5, data rows 6+
// Also grab effective tax rates from the Regional breakdown (column 7) for countries that don't overlap.
const taxRows = read('countrytaxrates.xls', 'Sheet1');
const taxMap = new Map();
for (let i = 6; i < taxRows.length; i++) {
  const r = taxRows[i];
  if (!r || !r[0]) continue;
  const name = String(r[0]).trim();
  const marginal = typeof r[1] === 'number' ? r[1] : null;
  const globalMin = typeof r[2] === 'number' ? r[2] : marginal;
  if (marginal == null) continue;
  taxMap.set(name.toLowerCase(), {
    name,
    marginalTaxRate: Number(marginal.toFixed(4)),
    effectiveTaxRate: Number((globalMin ?? marginal).toFixed(4)),
  });
}

// Also pick up the "Corporate Tax Rate" column from the country-risk file for countries
// whose names in that sheet are the canonical form used in our country-risk JSON.
const ctryTaxRows = read('ctryprem.xlsx', 'Regional breakdown');
for (let i = 1; i < ctryTaxRows.length; i++) {
  const r = ctryTaxRows[i];
  if (!r) continue;
  const name = String(r[0] ?? '').trim();
  const rate = typeof r[7] === 'number' ? r[7] : null;
  if (!name || rate == null) continue;
  const key = name.toLowerCase();
  if (!taxMap.has(key)) {
    taxMap.set(key, {
      name,
      marginalTaxRate: Number(rate.toFixed(4)),
      effectiveTaxRate: Number(rate.toFixed(4)),
    });
  }
}

// --- Overrides / additions ---
// Russia: source file says 20%; the statutory marginal corporate tax rate rose to 25% on 2025-01-01.
const russiaTaxKey = Array.from(taxMap.keys()).find((k) => k.includes('russ'));
if (russiaTaxKey) {
  const prev = taxMap.get(russiaTaxKey);
  taxMap.set(russiaTaxKey, { ...prev, name: 'Russia', marginalTaxRate: 0.25, effectiveTaxRate: 0.25 });
} else {
  taxMap.set('russia', { name: 'Russia', marginalTaxRate: 0.25, effectiveTaxRate: 0.25 });
}

const taxes = Array.from(taxMap.values()).sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(
  path.join(OUT, 'damodaran-tax-rates.json'),
  JSON.stringify(
    {
      lastUpdated: industriesLastUpdated,
      source: 'Aswath Damodaran, NYU Stern (countrytaxrates.xls + Tax Foundation)',
      sourceUrl: 'https://pages.stern.nyu.edu/~adamodar/pc/datasets/countrytaxrates.html',
      countries: taxes,
    },
    null,
    2,
  ),
);
console.log(`[tax]       wrote ${taxes.length} countries`);

// ---------- Summary ----------
console.log('\n=== Summary ===');
console.log(`Industries:      ${industries.length}`);
console.log(`Countries (CRP): ${countries.length}`);
console.log(`Mature market ERP: ${matureMarketERP}`);
const russiaRisk = countries.find((c) => c.name.toLowerCase().includes('russia'));
const russiaTax = taxes.find((c) => c.name.toLowerCase().includes('russia'));
console.log('Russia risk:', russiaRisk);
console.log('Russia tax :', russiaTax);
const oilgas = industries.find((i) => i.name === 'Oil/Gas (Integrated)');
console.log('Oil/Gas (Integrated):', oilgas);
const food = industries.find((i) => i.name === 'Food Processing');
console.log('Food Processing:', food);
const us2 = countries.find((c) => c.name === 'United States');
console.log('United States risk:', us2);
const ukTax = taxes.find((c) => c.name.toLowerCase().includes('united kingdom'));
console.log('UK tax :', ukTax);
const deTax = taxes.find((c) => c.name.toLowerCase().includes('germany'));
console.log('Germany tax:', deTax);

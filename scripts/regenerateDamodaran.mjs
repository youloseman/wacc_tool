// Regenerate damodaran-*.json files from all archived Damodaran Excel snapshots.
// Produces time-indexed schema so waccComposer can snap to valuationDate.
//
// Input layout (multiple snapshots):
//   scripts/Damodaran/betas.xls            ← current (Jan 2026, data Dec 2025)
//   scripts/Damodaran/betas23.xls          ← Jan 2023 (data Dec 2022)
//   scripts/Damodaran/betas24.xls          ← Jan 2024 (data Dec 2023)
//   scripts/Damodaran/betaEurope.xls       ← current Europe overlay
//   scripts/Damodaran/betaGlobal22/23/24.xls
//   scripts/Damodaran/betaemerg23.xls
//   scripts/Damodaran/ctryprem.xlsx + ctryprem23.xlsx + ctryprem24.xlsx
//   scripts/Damodaran/countrytaxrates.xls + countrytaxrates24.xls
//   scripts/Damodaran/taxrateGlobal22/23/24.xls
//
// Output (3 JSON files):
//   server/src/data/damodaran/damodaran-industries.json     — snapshots array, US + Europe overlay + Global + emerg
//   server/src/data/damodaran/damodaran-country-risk.json   — snapshots array
//   server/src/data/damodaran/damodaran-tax-rates.json      — snapshots array (+ industry-tax under separate key)

import XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = 'E:/WACC_Tool';
const SCRIPTS_SRC = path.join(PROJECT_ROOT, 'wacc-calculator/scripts/Damodaran');
const ARCHIVE_SRC = path.join(PROJECT_ROOT, 'Damodaran'); // user's download dir
const OUT = path.join(PROJECT_ROOT, 'wacc-calculator/server/src/data/damodaran');

// Mirror archived files from the user's download dir into scripts/Damodaran/ so the parser
// is self-contained. Only copies files that don't already exist in the destination.
function mirrorArchive() {
  if (!fs.existsSync(ARCHIVE_SRC)) return;
  const entries = fs.readdirSync(ARCHIVE_SRC);
  let copied = 0;
  for (const name of entries) {
    const src = path.join(ARCHIVE_SRC, name);
    const dst = path.join(SCRIPTS_SRC, name);
    if (fs.statSync(src).isFile() && !fs.existsSync(dst)) {
      fs.copyFileSync(src, dst);
      copied++;
    }
  }
  if (copied > 0) console.log(`[mirror]    copied ${copied} archived file(s) → scripts/Damodaran/`);
}

function read(file, sheetName) {
  const buf = fs.readFileSync(path.join(SCRIPTS_SRC, file));
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = sheetName ? wb.Sheets[sheetName] : wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
}

function excelSerialToISO(serial) {
  // Excel epoch: 1900-01-00. Serial 46027 → 2026-01-05.
  const ms = (serial - 25569) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

// Damodaran convention: file published January of year YYYY contains data as of Dec 31 YYYY-1.
// Serial 45662 (Jan 1 2025 publish) → asOf "2024-12-31".
function publishDateToAsOf(iso) {
  const [y] = iso.split('-').map(Number);
  return `${y - 1}-12-31`;
}

// ---------- Helpers: parse betas-style industry sheet (shared shape across betas/betaGlobal/betaEurope/betaemerg) ----------
function parseIndustryAverages(file, sheet = 'Industry Averages') {
  const rows = read(file, sheet);
  if (rows.length < 11) return null;
  const serial = rows[0]?.[1];
  const publishDate = typeof serial === 'number' ? excelSerialToISO(serial) : null;
  const asOf = publishDate ? publishDateToAsOf(publishDate) : null;
  // Header at row 9, data from row 10. Columns:
  //   0 Industry Name · 1 Number of firms · 2 Beta · 3 D/E · 4 Effective tax ·
  //   5 Unlevered beta · 6 Cash/Firm value · 7 Unlevered β corrected for cash
  const industries = [];
  for (let i = 10; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const name = String(r[0]).trim();
    if (!name || /^total$/i.test(name) || /^grand total$/i.test(name)) continue;
    const firms = Number(r[1] ?? 0);
    if (!firms) continue;
    industries.push({
      name,
      numberOfFirms: firms,
      leveredBeta: round4(r[2]),
      deRatio: round4(r[3]),
      effectiveTaxRate: round4(r[4]),
      unleveredBeta: round4(r[5]),
      cashFirmValue: round4(r[6]),
      unleveredBetaCorrected: round4(r[7]),
    });
  }
  return { asOf, publishDate, industries };
}

function round4(v) {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(4));
}

// ---------- Aliases for canonical industry names ----------
const INDUSTRY_ALIASES = {
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

function withAliases(list) {
  for (const ind of list) {
    ind.aliases = INDUSTRY_ALIASES[ind.name] ?? [];
  }
  return list;
}

// =========================================================================
// 1. Industries: US snapshots (3 years) + Europe overlay (current) + Global (3) + Emerg (1)
// =========================================================================
mirrorArchive();

const usSnapshots = [];
const usFiles = [
  ['betas23.xls', null],
  ['betas24.xls', null],
  ['betas.xls', null], // current — asOf comes from Excel serial
];
for (const [file] of usFiles) {
  if (!fs.existsSync(path.join(SCRIPTS_SRC, file))) {
    console.warn(`[industries] skipping missing file ${file}`);
    continue;
  }
  const parsed = parseIndustryAverages(file);
  if (!parsed) continue;
  if (!parsed.asOf) {
    console.warn(`[industries] ${file}: no publish date serial, skipping`);
    continue;
  }
  parsed.industries = withAliases(parsed.industries);
  usSnapshots.push({ asOf: parsed.asOf, region: 'US', source: file, industries: parsed.industries });
  console.log(`[industries] ${file} → asOf ${parsed.asOf}, ${parsed.industries.length} rows`);
}
usSnapshots.sort((a, b) => a.asOf.localeCompare(b.asOf));

// Europe overlay — attach to the LATEST US snapshot (current) per the old schema behavior.
// We store as a separate snapshots array since Europe file is only current.
const europeSnapshots = [];
if (fs.existsSync(path.join(SCRIPTS_SRC, 'betaEurope.xls'))) {
  const parsed = parseIndustryAverages('betaEurope.xls');
  if (parsed) {
    parsed.industries = withAliases(parsed.industries);
    europeSnapshots.push({
      asOf: parsed.asOf,
      region: 'Europe',
      source: 'betaEurope.xls',
      industries: parsed.industries,
    });
    console.log(`[europe]     asOf ${parsed.asOf}, ${parsed.industries.length} rows`);
  }
}

// Global snapshots (3 years)
const globalSnapshots = [];
for (const file of ['betaGlobal22.xls', 'betaGlobal23.xls', 'betaGlobal24.xls']) {
  if (!fs.existsSync(path.join(SCRIPTS_SRC, file))) continue;
  const parsed = parseIndustryAverages(file);
  if (parsed && parsed.asOf) {
    parsed.industries = withAliases(parsed.industries);
    globalSnapshots.push({
      asOf: parsed.asOf,
      region: 'Global',
      source: file,
      industries: parsed.industries,
    });
    console.log(`[global]     ${file} → asOf ${parsed.asOf}, ${parsed.industries.length} rows`);
  }
}
globalSnapshots.sort((a, b) => a.asOf.localeCompare(b.asOf));

// Emerging markets (one snapshot)
const emergSnapshots = [];
if (fs.existsSync(path.join(SCRIPTS_SRC, 'betaemerg23.xls'))) {
  const parsed = parseIndustryAverages('betaemerg23.xls');
  if (parsed && parsed.asOf) {
    parsed.industries = withAliases(parsed.industries);
    emergSnapshots.push({
      asOf: parsed.asOf,
      region: 'Emerging',
      source: 'betaemerg23.xls',
      industries: parsed.industries,
    });
    console.log(`[emerg]      asOf ${parsed.asOf}, ${parsed.industries.length} rows`);
  }
}

// Latest asOf across all snapshots — used as file-level lastUpdated.
const allSnapshotDates = [
  ...usSnapshots.map((s) => s.asOf),
  ...europeSnapshots.map((s) => s.asOf),
  ...globalSnapshots.map((s) => s.asOf),
  ...emergSnapshots.map((s) => s.asOf),
].sort();
const industriesLastUpdated = allSnapshotDates.at(-1) ?? '2026-01-05';

fs.writeFileSync(
  path.join(OUT, 'damodaran-industries.json'),
  JSON.stringify(
    {
      lastUpdated: industriesLastUpdated,
      source: 'Aswath Damodaran, NYU Stern — historical snapshots',
      sourceUrl: 'https://pages.stern.nyu.edu/~adamodar/pc/datasets/betas.html',
      snapshots: usSnapshots,
      europeSnapshots,
      globalSnapshots,
      emergSnapshots,
    },
    null,
    2,
  ),
);
console.log(`[industries] wrote ${usSnapshots.length} US snapshots + ${europeSnapshots.length} EU + ${globalSnapshots.length} Global + ${emergSnapshots.length} Emerg, lastUpdated=${industriesLastUpdated}`);

// =========================================================================
// 2. Country risk premium — 3 snapshots (ctryprem23/24/current)
// =========================================================================
function parseCountryRisk(file) {
  const rows = read(file, 'Regional breakdown');
  if (rows.length === 0) return null;
  // ctryprem has a header row 0 (text labels). We parse from row 1.
  // To detect asOf, read the "Summary of Most Recent Update" sheet.
  let asOf = null;
  try {
    const summaryRows = read(file, 'Summary of Most Recent Update');
    // Publish-date serial often sits in the A/B region.
    const maybeDate = summaryRows.flat().find((v) => typeof v === 'number' && v > 40000 && v < 70000);
    if (maybeDate) asOf = publishDateToAsOf(excelSerialToISO(maybeDate));
  } catch {
    /* no-op */
  }
  // Fallback: infer from filename YY suffix. Damodaran convention: file "23" = data as
  // of Dec 2023 (published in Jan 2024). So filename year = data year, NOT publish-year-minus-1.
  if (!asOf) {
    const m = file.match(/ctryprem(\d{2})?\./);
    if (m?.[1]) {
      const yy = Number(m[1]);
      asOf = `${2000 + yy}-12-31`;
    } else {
      // Current file — use latest industries asOf as best guess.
      asOf = industriesLastUpdated;
    }
  }

  const countries = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
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
      countryDefaultSpread: round4(adjDefaultSpread ?? 0),
      equityRiskPremium: round4(erp),
      countryRiskPremium: round4(crp),
    });
  }
  return { asOf, countries };
}

const ctrySnapshots = [];
for (const file of ['ctryprem23.xlsx', 'ctryprem24.xlsx', 'ctryprem.xlsx']) {
  if (!fs.existsSync(path.join(SCRIPTS_SRC, file))) {
    console.warn(`[ctryprem]   skipping missing ${file}`);
    continue;
  }
  const parsed = parseCountryRisk(file);
  if (!parsed) continue;
  // Add Russia fallback to current-year snapshot only (sovereign rating was withdrawn mid-2022).
  const isCurrent = file === 'ctryprem.xlsx';
  if (isCurrent && !parsed.countries.some((c) => c.name.toLowerCase().includes('russ'))) {
    parsed.countries.push({
      name: 'Russia',
      region: 'Eastern Europe & Russia',
      moodysRating: 'Ca',
      countryDefaultSpread: 0.1019,
      equityRiskPremium: 0.1442,
      countryRiskPremium: 0.1019,
    });
  }
  ctrySnapshots.push({ asOf: parsed.asOf, source: file, countries: parsed.countries });
  console.log(`[ctryprem]   ${file} → asOf ${parsed.asOf}, ${parsed.countries.length} rows`);
}
ctrySnapshots.sort((a, b) => a.asOf.localeCompare(b.asOf));

// Mature-market ERP per snapshot (US ERP - US default spread).
for (const s of ctrySnapshots) {
  const us = s.countries.find((c) => c.name.toLowerCase() === 'united states');
  s.matureMarketERP = us ? round4(us.equityRiskPremium - us.countryDefaultSpread) : 0.0423;
}

const ctryLastUpdated = ctrySnapshots.at(-1)?.asOf ?? industriesLastUpdated;

fs.writeFileSync(
  path.join(OUT, 'damodaran-country-risk.json'),
  JSON.stringify(
    {
      lastUpdated: ctryLastUpdated,
      source: 'Aswath Damodaran, NYU Stern — country risk snapshots',
      sourceUrl: 'https://pages.stern.nyu.edu/~adamodar/pc/datasets/ctryprem.html',
      snapshots: ctrySnapshots,
    },
    null,
    2,
  ),
);
console.log(`[ctryprem]   wrote ${ctrySnapshots.length} snapshots, latest=${ctryLastUpdated}`);

// =========================================================================
// 3. Corporate tax rates — 2 snapshots (countrytaxrates24 + current; 23 missing)
// =========================================================================
function parseTaxRates(file) {
  const rows = read(file, 'Sheet1');
  if (rows.length < 7) return null;
  const serial = rows[0]?.[1];
  const publishDate = typeof serial === 'number' ? excelSerialToISO(serial) : null;
  const asOf = publishDate
    ? publishDateToAsOf(publishDate)
    : (() => {
        const m = file.match(/countrytaxrates(\d{2})?\./);
        if (m?.[1]) return `${2000 + Number(m[1])}-12-31`;
        return industriesLastUpdated;
      })();

  const map = new Map();
  for (let i = 6; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const name = String(r[0]).trim();
    const marginal = typeof r[1] === 'number' ? r[1] : null;
    const globalMin = typeof r[2] === 'number' ? r[2] : marginal;
    if (marginal == null) continue;
    map.set(name.toLowerCase(), {
      name,
      marginalTaxRate: round4(marginal),
      effectiveTaxRate: round4(globalMin ?? marginal),
    });
  }

  // Canonical-name aliasing — same logic as before.
  const countryAliases = [
    ['United States of America', 'United States'],
    ['United Kingdom of Great Britain and Northern Ireland', 'United Kingdom'],
    ['Russian Federation', 'Russia'],
    ['Korea, Republic of', 'South Korea'],
  ];
  for (const [long, short] of countryAliases) {
    const longEntry = map.get(long.toLowerCase());
    if (longEntry) {
      map.set(short.toLowerCase(), { ...longEntry, name: short });
    }
  }

  // Russia override (statutory rose to 25% on 2025-01-01; earlier snapshots stay at 20%).
  if (asOf >= '2024-12-31') {
    const russiaKey = Array.from(map.keys()).find((k) => k.includes('russ'));
    if (russiaKey) {
      map.set(russiaKey, { ...map.get(russiaKey), name: 'Russia', marginalTaxRate: 0.25, effectiveTaxRate: 0.25 });
    } else {
      map.set('russia', { name: 'Russia', marginalTaxRate: 0.25, effectiveTaxRate: 0.25 });
    }
  }

  return { asOf, countries: Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)) };
}

const taxSnapshots = [];
for (const file of ['countrytaxrates24.xls', 'countrytaxrates.xls']) {
  if (!fs.existsSync(path.join(SCRIPTS_SRC, file))) {
    console.warn(`[tax]        skipping missing ${file}`);
    continue;
  }
  const parsed = parseTaxRates(file);
  if (!parsed) continue;
  taxSnapshots.push({ asOf: parsed.asOf, source: file, countries: parsed.countries });
  console.log(`[tax]        ${file} → asOf ${parsed.asOf}, ${parsed.countries.length} rows`);
}
taxSnapshots.sort((a, b) => a.asOf.localeCompare(b.asOf));

const taxLastUpdated = taxSnapshots.at(-1)?.asOf ?? industriesLastUpdated;

// Also carry the industry-effective-tax snapshots (taxrateGlobal) under a separate key —
// used when the user picks taxRateSource = 'damodaran-industry' (future UI addition).
// Schema: each row is [industryName, numFirms, ..., effective tax columns at index 6/7].
function parseIndustryTaxGlobal(file) {
  const rows = read(file, 'Industry Averages');
  if (rows.length < 11) return null;
  const serial = rows[0]?.[1];
  const publishDate = typeof serial === 'number' ? excelSerialToISO(serial) : null;
  const asOf = publishDate
    ? publishDateToAsOf(publishDate)
    : (() => {
        const m = file.match(/taxrateGlobal(\d{2})?\./);
        if (m?.[1]) return `${2000 + Number(m[1])}-12-31`;
        return industriesLastUpdated;
      })();
  const industries = [];
  for (let i = 9; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const name = String(r[0]).trim();
    if (!name || /^total$/i.test(name) || /^grand total$/i.test(name)) continue;
    // taxrateGlobal columns vary slightly year to year; the effective tax rate is typically
    // computed as (total tax paid) / (total pre-tax income) — col 6 in recent files.
    const effectiveTax = typeof r[6] === 'number' ? r[6] : null;
    if (effectiveTax == null) continue;
    industries.push({ name, effectiveTaxRate: round4(effectiveTax) });
  }
  return { asOf, industries };
}

const industryTaxSnapshots = [];
for (const file of ['taxrateGlobal22.xls', 'taxrateGlobal23.xls', 'taxrateGlobal24.xls']) {
  if (!fs.existsSync(path.join(SCRIPTS_SRC, file))) continue;
  const parsed = parseIndustryTaxGlobal(file);
  if (!parsed) continue;
  industryTaxSnapshots.push({ asOf: parsed.asOf, source: file, industries: parsed.industries });
  console.log(`[ind-tax]    ${file} → asOf ${parsed.asOf}, ${parsed.industries.length} rows`);
}
industryTaxSnapshots.sort((a, b) => a.asOf.localeCompare(b.asOf));

fs.writeFileSync(
  path.join(OUT, 'damodaran-tax-rates.json'),
  JSON.stringify(
    {
      lastUpdated: taxLastUpdated,
      source: 'Aswath Damodaran, NYU Stern — corporate tax rates (country + industry snapshots)',
      sourceUrl: 'https://pages.stern.nyu.edu/~adamodar/pc/datasets/countrytaxrates.html',
      snapshots: taxSnapshots,
      industrySnapshots: industryTaxSnapshots,
    },
    null,
    2,
  ),
);
console.log(`[tax]        wrote ${taxSnapshots.length} country snapshots + ${industryTaxSnapshots.length} industry-tax snapshots`);

// =========================================================================
// Summary
// =========================================================================
console.log('\n=== Summary ===');
console.log(`Industries (US):  ${usSnapshots.length} snapshots`);
for (const s of usSnapshots) console.log(`  ${s.asOf}: ${s.industries.length} rows`);
console.log(`Industries (EU):  ${europeSnapshots.length}`);
console.log(`Industries (GL):  ${globalSnapshots.length}`);
console.log(`Industries (EM):  ${emergSnapshots.length}`);
console.log(`Country risk:     ${ctrySnapshots.length} snapshots`);
for (const s of ctrySnapshots) console.log(`  ${s.asOf}: ${s.countries.length} rows, matureMarketERP=${s.matureMarketERP}`);
console.log(`Tax rates:        ${taxSnapshots.length} country snapshots, ${industryTaxSnapshots.length} industry-tax snapshots`);

// Spot-checks so the user can verify against the source.
const oilgas = usSnapshots.at(-1)?.industries.find((i) => i.name === 'Oil/Gas (Integrated)');
if (oilgas) console.log('Oil/Gas (Integrated) latest:', oilgas);
const russia = ctrySnapshots.at(-1)?.countries.find((c) => c.name === 'Russia');
if (russia) console.log('Russia risk latest:', russia);

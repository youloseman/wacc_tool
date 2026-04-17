// Parse scripts/em-risk-free-rates.xlsx (10Y_Yields sheet) → server/src/data/em-risk-free-rates.json
// Sheet layout:
//   Row 3 (index 3): headers — Country | Currency | Instrument | Source | Difficulty | Q1 2020 | ... | Q4 2025 | CB Rate
//   Row 4 (index 4): end-of-quarter dates (info row, skipped)
//   Rows 5..: one country per row. Yields as decimals (0.0681 = 6.81%).
//   Columns: 0=country, 1=currency, 2=instrument, 3=source, 4=difficulty, 5-28=24 quarters, 29=CB Rate

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as X from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, 'em-risk-free-rates.xlsx');
const OUT = path.join(__dirname, '..', 'server', 'src', 'data', 'em-risk-free-rates.json');

const HEADER_ROW = 3;
const QUARTER_COL_START = 5;
const QUARTER_COL_END = 28; // inclusive (Q4 2025)
const CB_RATE_COL = 29;

function quarterToDate(label) {
  // "Q1 2020" → "2020-03-31"
  const m = label.trim().match(/^Q([1-4])\s*(\d{4})$/i);
  if (!m) return null;
  const q = Number(m[1]);
  const year = Number(m[2]);
  const md = ['03-31', '06-30', '09-30', '12-31'][q - 1];
  return `${year}-${md}`;
}

function normLabel(raw) {
  return String(raw).trim();
}

// Sanity: yields outside [0.5%, 60%] → warning. Argentina/Turkey can exceed 60%.
function validateRate(country, date, rate) {
  const errors = [];
  const warnings = [];
  if (!Number.isFinite(rate) || Number.isNaN(rate)) {
    errors.push(`[${country} ${date}] rate is not finite (${rate})`);
  } else if (rate < 0) {
    errors.push(`[${country} ${date}] negative rate ${rate}`);
  } else if (rate < 0.005 || rate > 0.60) {
    warnings.push(`[${country} ${date}] rate ${(rate * 100).toFixed(2)}% outside typical 0.5–60% band`);
  }
  return { errors, warnings };
}

function parse() {
  const wb = X.read(fs.readFileSync(SRC), { type: 'buffer' });
  const sheet = wb.Sheets['10Y_Yields'];
  if (!sheet) throw new Error('Sheet "10Y_Yields" not found');
  const rows = X.utils.sheet_to_json(sheet, { header: 1, defval: null });

  const header = rows[HEADER_ROW] ?? [];
  const quarterCols = [];
  for (let c = QUARTER_COL_START; c <= QUARTER_COL_END; c++) {
    const label = header[c];
    if (!label) continue;
    const date = quarterToDate(normLabel(label));
    if (date) quarterCols.push({ col: c, label: normLabel(label), date });
  }
  if (quarterCols.length === 0) throw new Error('No quarter columns found in header');

  const countries = {};
  const allErrors = [];
  const allWarnings = [];
  let totalQuarters = 0;

  for (let r = HEADER_ROW + 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[0]) continue;
    const country = String(row[0]).trim();
    if (!country) continue;

    const currency = row[1] ? String(row[1]).trim() : '';
    const instrument = row[2] ? String(row[2]).trim() : '';
    const source = row[3] ? String(row[3]).trim() : '';

    // Collect filled quarters only.
    const quarters = [];
    for (const { col, date } of quarterCols) {
      const v = row[col];
      if (v == null || v === '' || v === 0) continue;
      const rate = Number(v);
      const { errors, warnings } = validateRate(country, date, rate);
      allErrors.push(...errors);
      allWarnings.push(...warnings);
      if (errors.length === 0) {
        quarters.push({ date, rate: Number(rate.toFixed(6)) });
      }
    }

    if (quarters.length === 0) {
      // Skip country with no data at all.
      continue;
    }

    const cbRaw = row[CB_RATE_COL];
    const centralBankRate =
      cbRaw != null && cbRaw !== '' && Number.isFinite(Number(cbRaw))
        ? Number(cbRaw)
        : null;

    countries[country] = {
      currency,
      instrument,
      source,
      centralBankRate,
      quarters,
    };
    totalQuarters += quarters.length;
  }

  if (Object.keys(countries).length === 0) {
    allErrors.push('No country has any filled quarter data');
  }

  return { countries, errors: allErrors, warnings: allWarnings, totalQuarters };
}

function main() {
  const { countries, errors, warnings, totalQuarters } = parse();

  if (errors.length > 0) {
    console.error('EM rates validation FAILED:');
    errors.forEach((e) => console.error('  ❌', e));
    process.exit(1);
  }
  warnings.forEach((w) => console.warn('  ⚠️', w));

  const out = {
    lastUpdated: new Date().toISOString().slice(0, 10),
    source: 'Central banks, Investing.com, TradingEconomics — quarterly time series',
    countries,
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

  console.log(`✅ EM rates written: ${Object.keys(countries).length} countries, ${totalQuarters} quarter-entries`);
  const sample = countries['Russia'];
  if (sample) {
    const last = sample.quarters.at(-1);
    console.log(
      `  spot: Russia — latest ${last?.date}: ${(last?.rate * 100).toFixed(2)}%, CB rate: ${sample.centralBankRate != null ? (sample.centralBankRate * 100).toFixed(2) + '%' : 'n/a'}`,
    );
  }
}

main();

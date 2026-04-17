// Parse `scripts/Kroll.xlsx` (Kroll / Duff & Phelps Cost of Capital Yearbook, quarterly
// time series, full GICS hierarchy) into server/src/data/kroll/kroll-data.json.
//
// XLSX layout (Sheet1):
//   Row 3: period header, starts at col 2, every 3 columns:  3Q 20 | 4Q 20 | 1Q 21 | ...
//   Row 7..N: data rows:
//     col 0       = GICS code (2, 4, 6, or 8 digits — level in the hierarchy)
//     col 1       = industry name
//     col 2+3k    = avg size (MM, usually blank)
//     col 3+3k    = 5-yr avg Debt/Capital (%)      ← "21,7" means 21.7%
//     col 4+3k    = Unlevered Adj. Beta            ← "0,93"
//   European number formatting: comma as decimal separator.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as X from 'xlsx';
import { validateKrollSectors } from './validateKrollData.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, 'Kroll.xlsx');
const OUT = path.join(__dirname, '..', 'server', 'src', 'data', 'kroll', 'kroll-data.json');
// Preserve the ERP + size-premium tables from the existing JSON (they aren't in the XLSX).
const EXISTING_OUT = JSON.parse(fs.readFileSync(OUT, 'utf-8'));

const wb = X.read(fs.readFileSync(SRC), { type: 'buffer' });
const rows = X.utils.sheet_to_json(wb.Sheets['Sheet1'], { header: 1, defval: null });

// Row 3 = period header. Scan every third column starting at col 2.
const PERIOD_HEADER_ROW = 3;
const periods = [];
const hdr = rows[PERIOD_HEADER_ROW] ?? [];
for (let c = 2; c < hdr.length; c += 3) {
  const label = hdr[c];
  if (typeof label !== 'string' || !label.trim()) continue;
  const m = label.trim().match(/^(\d)Q\s*(\d{2,4})$/i);
  if (!m) continue;
  const q = Number(m[1]);
  const yy = Number(m[2]);
  const year = yy < 100 ? 2000 + yy : yy;
  // Each quarter → end-of-quarter calendar date (used for nearest-date lookup).
  const monthDay = ['03-31', '06-30', '09-30', '12-31'][q - 1];
  periods.push({ col: c, label: `${q}Q ${year}`, date: `${year}-${monthDay}` });
}

// Parse European-formatted number ("21,7" → 21.7). Returns null for "n/a", empty, or non-numeric.
function parseEuro(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (!s || /^n\/?a$/i.test(s)) return null;
  const n = Number(s.replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(n) ? n : null;
}

// GICS level by string length: 2=sector, 4=industry group, 6=industry, 8=sub-industry.
function gicsLevel(code) {
  switch (code.length) {
    case 2:
      return 'sector';
    case 4:
      return 'industryGroup';
    case 6:
      return 'industry';
    case 8:
      return 'subIndustry';
    default:
      return 'other';
  }
}

function parentCode(code) {
  if (code.length <= 2) return null;
  return code.slice(0, code.length - 2);
}

// Data rows — start at row 7 (after the header block).
const industries = [];
for (let i = 7; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r[0] == null) continue;
  const rawCode = r[0];
  // Normalise to string with leading zeros preserved (Excel often stores as number).
  const codeStr =
    typeof rawCode === 'number'
      ? String(Math.round(rawCode))
      : String(rawCode).trim();
  if (!/^\d+$/.test(codeStr)) continue;
  const name = r[1] == null ? '' : String(r[1]).trim();
  if (!name) continue;

  // Debt/Capital comes in % (21.7 means 21.7%). Convert to decimal and then to D/E ratio:
  //   D/E = (D/C) / (1 - D/C)
  const quarters = [];
  for (const p of periods) {
    const dcPct = parseEuro(r[p.col + 1]); // "Debt/Capital"
    const beta = parseEuro(r[p.col + 2]); // "Unlevered Adj. Beta"
    if (dcPct == null && beta == null) continue;
    const dc = dcPct != null ? dcPct / 100 : null;
    const de = dc != null && dc < 1 ? dc / (1 - dc) : null;
    quarters.push({
      date: p.date,
      label: p.label,
      debtToCapital: dc != null ? Number(dc.toFixed(4)) : null,
      debtToEquity: de != null ? Number(de.toFixed(4)) : null,
      unleveredBeta: beta != null ? Number(beta.toFixed(4)) : null,
    });
  }

  industries.push({
    gicsCode: codeStr,
    gicsLevel: gicsLevel(codeStr),
    parentCode: parentCode(codeStr),
    name,
    quarters,
  });
}

// Build display "path" for UI breadcrumbs: e.g. "Energy › Oil, Gas & Consumable Fuels".
const byCode = new Map(industries.map((i) => [i.gicsCode, i]));
for (const ind of industries) {
  const chain = [ind.name];
  let parent = ind.parentCode;
  while (parent) {
    const p = byCode.get(parent);
    if (!p) break;
    chain.unshift(p.name);
    parent = p.parentCode;
  }
  ind.path = chain.join(' › ');
}

// Validate before writing — errors abort, warnings log but don't block.
const validation = validateKrollSectors(industries);
if (!validation.ok) {
  console.error('Kroll validation FAILED:');
  validation.errors.forEach((e) => console.error('  ❌', e));
  process.exit(1);
}
if (validation.warnings.length > 0) {
  validation.warnings.forEach((w) => console.warn('  ⚠️', w));
}
const totalQuarters = industries.reduce((a, i) => a + i.quarters.length, 0);
console.log(`✅ Validation passed: ${industries.length} sectors, ${totalQuarters} quarter-entries`);

const out = {
  lastUpdated: new Date().toISOString().slice(0, 10),
  source: 'Kroll / Duff & Phelps Cost of Capital Yearbook (quarterly time series)',
  sourceUrl: 'https://www.kroll.com/en/cost-of-capital',
  // Preserve static ERP + size-premium tables from the prior JSON — the XLSX doesn't cover them.
  equityRiskPremium: EXISTING_OUT.equityRiskPremium,
  sizePremiums: EXISTING_OUT.sizePremiums,
  periods: periods.map((p) => ({ label: p.label, date: p.date })),
  industries,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

// Quick summary so we can spot problems at a glance.
const levels = industries.reduce((acc, i) => {
  acc[i.gicsLevel] = (acc[i.gicsLevel] || 0) + 1;
  return acc;
}, {});
console.log('Kroll regen OK');
console.log('  periods:    ', periods.length, `(${periods[0]?.label} → ${periods.at(-1)?.label})`);
console.log('  industries: ', industries.length, 'by level:', levels);
// Spot-check one series so the user can verify against the source file.
const spot = byCode.get('10');
if (spot) {
  const last = spot.quarters.at(-1);
  console.log(`  spot: ${spot.name} (${spot.gicsCode}) — ${last?.label}: βu=${last?.unleveredBeta}, D/E=${last?.debtToEquity}`);
}

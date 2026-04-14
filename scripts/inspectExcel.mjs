// One-shot script: inspect sheet names + headers + first rows for each file.
import XLSX from 'xlsx';
import path from 'node:path';
import fs from 'node:fs';

const DAMO = 'E:/WACC_Tool/wacc-calculator/scripts/Damodaran';
const files = ['betas.xls', 'countrytaxrates.xls', 'ctryprem.xlsx'];

for (const f of files) {
  const p = path.join(DAMO, f);
  console.log(`\n=== ${f} ===`);
  const buf = fs.readFileSync(p);
  const wb = XLSX.read(buf, { type: 'buffer' });
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    console.log(`  [sheet] ${name}  rows=${rows.length}`);
    // Print up to 3 header-ish rows.
    rows.slice(0, 4).forEach((r, i) => {
      const snippet = JSON.stringify(r).slice(0, 240);
      console.log(`    row${i}: ${snippet}`);
    });
  }
}

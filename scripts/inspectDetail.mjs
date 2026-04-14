import XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';

const DAMO = 'E:/WACC_Tool/wacc-calculator/scripts/Damodaran';

function dump(file, sheetName, rowSlice = [0, 12]) {
  const buf = fs.readFileSync(path.join(DAMO, file));
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  console.log(`\n=== ${file} :: ${sheetName} (rows ${rowSlice[0]}-${rowSlice[1]} of ${rows.length}) ===`);
  rows.slice(rowSlice[0], rowSlice[1]).forEach((r, i) => {
    console.log(`row${i + rowSlice[0]}:`, JSON.stringify(r).slice(0, 400));
  });
}

dump('betas.xls', 'Industry Averages', [5, 15]);
dump('betas.xls', 'Industry Averages', [100, 106]);
dump('countrytaxrates.xls', 'Sheet1', [4, 14]);
dump('countrytaxrates.xls', 'Sheet1', [250, 257]);
dump('ctryprem.xlsx', 'Regional breakdown', [0, 5]);
dump('ctryprem.xlsx', 'Regional breakdown', [155, 158]);
dump('ctryprem.xlsx', 'Default Spreads for Ratings', [0, 20]);

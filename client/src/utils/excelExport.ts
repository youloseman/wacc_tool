import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { WACCInputs, WACCResult, WACCResultRow } from '@shared/types';

// Clariva palette, ExcelJS ARGB form (FF prefix = fully opaque)
const NAVY = 'FF1C3A2F'; // forest — replaces former navy bands
const PURPLE_LIGHT = 'FFF5EDD5'; // goldPale — primary highlight row
const PURPLE = 'FFF0EBE1'; // creamDeep — secondary highlight
const BLUE_FONT = 'FFC9A84C'; // gold — formula/input font colour

interface ComparableCompany {
  ticker: string;
  name: string;
  leveredBeta: number;
  deRatio: number;
  taxRate: number;
  unleveredBeta: number;
}

function findRow(rows: WACCResultRow[], component: string): WACCResultRow | undefined {
  return rows.find((r) => r.component === component);
}

function buildSummarySheet(wb: ExcelJS.Workbook, result: WACCResult, inputs: WACCInputs) {
  const sheet = wb.addWorksheet('WACC Summary');

  sheet.columns = [
    { width: 40 },
    { width: 12 },
    { width: 12 },
    { width: 60 },
    { width: 35 },
  ];

  // Row 1 — title
  const title = `WACC for ${inputs.companyName || 'Company'} as at ${inputs.valuationDate}`;
  sheet.mergeCells('A1:E1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = title;
  // Prefer Cormorant Garamond italic for the title — falls back to Georgia italic then Arial
  // on machines without the display face. Italic serif matches the on-screen report band.
  titleCell.font = {
    italic: true,
    color: { argb: 'FFFAF7F2' },
    size: 14,
    name: 'Cormorant Garamond',
  };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getRow(1).height = 30;

  // Row 2 — column headers
  sheet.getCell('A2').value = 'Discount Rate Component';
  sheet.mergeCells('B2:C2');
  sheet.getCell('B2').value = 'WACC Calculator';
  sheet.getCell('D2').value = 'Description';
  sheet.getCell('E2').value = 'Source';
  ['A2', 'B2', 'D2', 'E2'].forEach((addr) => {
    const c = sheet.getCell(addr);
    c.font = { bold: true, name: 'Arial' };
    c.alignment = { horizontal: addr === 'B2' ? 'center' : 'left', vertical: 'middle' };
  });

  // Row 3 — sub-headers
  const methodSuffix =
    result.methodology === 'local_currency' ? ' — Local Currency Approach' : '';
  sheet.getCell('A3').value = `(Post-tax, ${result.effectiveCurrency || result.currency}, Nominal${methodSuffix})`;
  sheet.getCell('A3').font = { bold: true, italic: true, name: 'Arial' };
  sheet.getCell('B3').value = 'MIN';
  sheet.getCell('C3').value = 'MAX';
  ['B3', 'C3'].forEach((addr) => {
    sheet.getCell(addr).font = { bold: true, name: 'Arial' };
    sheet.getCell(addr).alignment = { horizontal: 'center' };
  });
  sheet.getRow(3).border = { bottom: { style: 'thin' } } as any;

  // Helper to map UI rows to a fixed row schema (rows 4-18)
  const labels: Array<{ component: string; row: number; format: 'percent' | 'beta' }> = [
    { component: 'Risk-free rate', row: 4, format: 'percent' },
    { component: 'Equity risk premium', row: 5, format: 'percent' },
    { component: 'Beta (unlevered)', row: 6, format: 'beta' },
    { component: 'Beta (relevered)', row: 7, format: 'beta' },
    { component: 'Small size risk premium', row: 8, format: 'percent' },
    { component: 'Country risk premium', row: 9, format: 'percent' },
    { component: 'Currency risk premium', row: 10, format: 'percent' },
    { component: 'Specific risk premium', row: 11, format: 'percent' },
    { component: 'Cost of Equity', row: 12, format: 'percent' },
    { component: 'Cost of Debt (pre-tax)', row: 13, format: 'percent' },
    { component: 'Tax rate', row: 14, format: 'percent' },
    { component: 'Cost of Debt (after-tax)', row: 15, format: 'percent' },
    { component: 'Share of Equity', row: 16, format: 'percent' },
    { component: 'Share of Debt', row: 17, format: 'percent' },
    { component: 'WACC', row: 18, format: 'percent' },
  ];

  const formulaRows = new Set([7, 12, 15, 16, 17, 18]);
  const subtotalRows = new Map<number, string>([
    [12, PURPLE_LIGHT],
    [15, PURPLE],
    [18, PURPLE_LIGHT],
  ]);

  for (const { component, row, format } of labels) {
    const data = findRow(result.rows, component);
    if (!data) continue;
    // Excel custom format: positive;negative;zero → show em-dash for zero while keeping cell numeric.
    const numFmt = format === 'percent' ? '0.00%;-0.00%;"—"' : '0.00;-0.00;"—"';
    const isFormula = formulaRows.has(row);

    sheet.getCell(`A${row}`).value = component;

    // Per-row Excel formulas
    let bFormula: string | null = null;
    let cFormula: string | null = null;
    if (row === 7) {
      // Beta relevered = Beta_unlevered * (1 + (1 - tax) * D/E)
      // D/E derived from share-of-equity row: D/E = (1-Eshare)/Eshare = B17/B16
      bFormula = 'B6*(1+(1-B14)*(B17/B16))';
      cFormula = 'C6*(1+(1-C14)*(C17/C16))';
    } else if (row === 12) {
      bFormula = 'B4+B7*B5+B8+B9+B10+B11';
      cFormula = 'C4+C7*C5+C8+C9+C10+C11';
    } else if (row === 15) {
      bFormula = 'B13*(1-B14)';
      cFormula = 'C13*(1-C14)';
    } else if (row === 16) {
      // Equity share — keep as input value (server-resolved D/E)
      bFormula = null;
    } else if (row === 17) {
      bFormula = '1-B16';
      cFormula = '1-C16';
    } else if (row === 18) {
      bFormula = 'B12*B16+B15*B17';
      cFormula = 'C12*C16+C15*C17';
    }

    const minCell = sheet.getCell(`B${row}`);
    const maxCell = sheet.getCell(`C${row}`);
    if (bFormula && cFormula) {
      minCell.value = { formula: bFormula, result: data.min ?? 0 };
      maxCell.value = { formula: cFormula, result: data.max ?? 0 };
    } else {
      minCell.value = data.min ?? 0;
      maxCell.value = data.max ?? 0;
    }
    minCell.numFmt = numFmt;
    maxCell.numFmt = numFmt;
    minCell.alignment = { horizontal: 'center' };
    maxCell.alignment = { horizontal: 'center' };

    sheet.getCell(`D${row}`).value = data.description;
    sheet.getCell(`D${row}`).alignment = { wrapText: true, vertical: 'top' };
    sheet.getCell(`E${row}`).value =
      data.sourceMin === data.sourceMax ? data.sourceMin : `${data.sourceMin} / ${data.sourceMax}`;

    // Input rows in blue, formula rows black
    const fontColor = isFormula ? 'FF000000' : BLUE_FONT;
    minCell.font = { color: { argb: fontColor }, name: 'Arial' };
    maxCell.font = { color: { argb: fontColor }, name: 'Arial' };

    // Subtotal styling
    const highlight = subtotalRows.get(row);
    if (highlight) {
      ['A', 'B', 'C', 'D', 'E'].forEach((col) => {
        const c = sheet.getCell(`${col}${row}`);
        c.font = { ...c.font, bold: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: highlight } };
      });
      sheet.getRow(row).height = 25;
      sheet.getRow(row).border = { top: { style: 'thin' } } as any;
    } else {
      sheet.getRow(row).height = 20;
    }
  }

  // Bottom border on row 18
  ['A', 'B', 'C', 'D', 'E'].forEach((col) => {
    sheet.getCell(`${col}18`).border = {
      top: { style: 'medium' },
      bottom: { style: 'thin' },
    };
  });
}

function buildInputsSheet(wb: ExcelJS.Workbook, inputs: WACCInputs) {
  const sheet = wb.addWorksheet('Inputs & Assumptions');
  sheet.columns = [{ width: 40 }, { width: 50 }];

  sheet.mergeCells('A1:B1');
  const t = sheet.getCell('A1');
  t.value = 'WACC Calculator — Input Parameters';
  t.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12, name: 'Arial' };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  sheet.getRow(1).height = 28;

  const sectionHeader = (row: number, label: string) => {
    const c = sheet.getCell(`A${row}`);
    c.value = label;
    c.font = { bold: true, name: 'Arial' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFF5' } };
    sheet.mergeCells(`A${row}:B${row}`);
  };
  const kv = (row: number, label: string, value: string | number, isInput = true) => {
    sheet.getCell(`A${row}`).value = label;
    sheet.getCell(`A${row}`).font = { bold: true, name: 'Arial' };
    const v = sheet.getCell(`B${row}`);
    v.value = value;
    if (isInput) v.font = { color: { argb: BLUE_FONT }, name: 'Arial' };
  };

  sectionHeader(3, 'General Parameters');
  kv(4, 'Company / CGU name', inputs.companyName || '—');
  kv(5, 'Valuation date', inputs.valuationDate);
  kv(6, 'Currency', inputs.currency);
  kv(7, 'Country (HQ)', inputs.countryHQ);
  kv(8, 'Country (operations)', inputs.countryOperations);
  kv(9, 'Industry', inputs.industry);
  kv(10, 'Company size', inputs.companySize);

  const writeBound = (
    startRow: number,
    title: string,
    b: WACCInputs['minBound'],
  ): number => {
    sectionHeader(startRow, title);
    let r = startRow + 1;
    kv(r++, 'D/E ratio source', b.deRatioSource);
    if (b.deRatioSource === 'custom' && b.customDeRatio != null) {
      kv(r++, 'Custom D/E ratio', b.customDeRatio);
    }
    kv(r++, 'Beta source', b.betaSource);
    if (b.betaSource === 'comparables') {
      kv(r++, 'Comparable tickers', b.comparableTickers);
    }
    kv(r++, 'ERP source', b.erpSource);
    if (b.erpSource === 'custom' && b.customErp != null) {
      const c = sheet.getCell(`B${r}`);
      kv(r++, 'Custom ERP', b.customErp);
      c.numFmt = '0.00%';
    }
    kv(r++, 'Cost of debt method', b.costOfDebtMethod);
    if (b.costOfDebtMethod === 'rating' && b.creditRating) kv(r++, 'Credit rating', b.creditRating);
    if (b.costOfDebtMethod === 'icr') {
      kv(r++, 'EBIT', b.ebit ?? '—');
      kv(r++, 'Interest expense', b.interestExpense ?? '—');
    }
    if (b.costOfDebtMethod === 'direct' && b.directCostOfDebt != null) {
      kv(r++, 'Cost of debt (pre-tax)', b.directCostOfDebt);
      sheet.getCell(`B${r - 1}`).numFmt = '0.00%';
    }
    kv(r++, 'Tax rate source', b.taxRateSource);
    if (b.taxRateSource === 'custom' && b.customTaxRate != null) {
      kv(r++, 'Custom tax rate', b.customTaxRate);
      sheet.getCell(`B${r - 1}`).numFmt = '0.00%';
    }
    if (b.sizePremiumOverride != null) {
      kv(r++, 'Size premium (override)', b.sizePremiumOverride);
      sheet.getCell(`B${r - 1}`).numFmt = '0.00%';
    }
    if (b.countryRiskPremiumOverride != null) {
      kv(r++, 'Country RP (override)', b.countryRiskPremiumOverride);
      sheet.getCell(`B${r - 1}`).numFmt = '0.00%';
    }
    if (b.currencyRiskPremium) {
      kv(r++, 'Currency risk premium', b.currencyRiskPremium);
      sheet.getCell(`B${r - 1}`).numFmt = '0.00%';
    }
    if (b.specificRiskPremium) {
      kv(r++, 'Specific risk premium', b.specificRiskPremium);
      sheet.getCell(`B${r - 1}`).numFmt = '0.00%';
    }
    return r;
  };

  const minEnd = writeBound(12, 'Lower Bound (MIN) Assumptions', inputs.minBound);
  writeBound(minEnd + 1, 'Upper Bound (MAX) Assumptions', inputs.maxBound);
}

function buildBetaDetailSheet(
  wb: ExcelJS.Workbook,
  companies: ComparableCompany[],
  targetDE: number,
  targetTax: number,
) {
  const sheet = wb.addWorksheet('Beta Detail');
  sheet.columns = [
    { width: 12 },
    { width: 32 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
  ];

  sheet.mergeCells('A1:F1');
  const t = sheet.getCell('A1');
  t.value = 'Comparable Companies Beta Analysis';
  t.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12, name: 'Arial' };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  sheet.getRow(1).height = 28;

  const headers = ['Ticker', 'Company Name', 'β Levered', 'D/E Ratio', 'Tax Rate', 'β Unlevered'];
  headers.forEach((h, i) => {
    const c = sheet.getCell(3, i + 1);
    c.value = h;
    c.font = { bold: true, name: 'Arial' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFF5' } };
    c.alignment = { horizontal: i < 2 ? 'left' : 'center' };
  });

  companies.forEach((co, i) => {
    const row = 4 + i;
    sheet.getCell(`A${row}`).value = co.ticker;
    sheet.getCell(`B${row}`).value = co.name;
    sheet.getCell(`C${row}`).value = co.leveredBeta;
    sheet.getCell(`C${row}`).font = { color: { argb: BLUE_FONT } };
    sheet.getCell(`D${row}`).value = co.deRatio;
    sheet.getCell(`D${row}`).font = { color: { argb: BLUE_FONT } };
    sheet.getCell(`D${row}`).numFmt = '0.00%';
    sheet.getCell(`E${row}`).value = co.taxRate;
    sheet.getCell(`E${row}`).font = { color: { argb: BLUE_FONT } };
    sheet.getCell(`E${row}`).numFmt = '0.00%';
    sheet.getCell(`F${row}`).value = {
      formula: `C${row}/(1+(1-E${row})*D${row})`,
      result: co.unleveredBeta,
    };
    sheet.getCell(`F${row}`).numFmt = '0.00';
    ['C', 'D', 'E', 'F'].forEach((col) => {
      sheet.getCell(`${col}${row}`).alignment = { horizontal: 'center' };
    });
  });

  const lastRow = 3 + companies.length;
  const medianRow = lastRow + 1;
  sheet.getCell(`E${medianRow}`).value = 'Median βu:';
  sheet.getCell(`E${medianRow}`).font = { bold: true };
  sheet.getCell(`E${medianRow}`).alignment = { horizontal: 'right' };
  sheet.getCell(`F${medianRow}`).value = {
    formula: `MEDIAN(F4:F${lastRow})`,
    result: 0,
  };
  sheet.getCell(`F${medianRow}`).font = { bold: true };
  sheet.getCell(`F${medianRow}`).numFmt = '0.00';
  sheet.getCell(`F${medianRow}`).alignment = { horizontal: 'center' };

  const targetRow = medianRow + 2;
  sheet.getCell(`A${targetRow}`).value = 'Re-levering for target';
  sheet.getCell(`A${targetRow}`).font = { bold: true, name: 'Arial' };
  sheet.getCell(`A${targetRow + 1}`).value = 'Target D/E ratio';
  sheet.getCell(`B${targetRow + 1}`).value = targetDE;
  sheet.getCell(`B${targetRow + 1}`).numFmt = '0.00%';
  sheet.getCell(`B${targetRow + 1}`).font = { color: { argb: BLUE_FONT } };
  sheet.getCell(`A${targetRow + 2}`).value = 'Target tax rate';
  sheet.getCell(`B${targetRow + 2}`).value = targetTax;
  sheet.getCell(`B${targetRow + 2}`).numFmt = '0.00%';
  sheet.getCell(`B${targetRow + 2}`).font = { color: { argb: BLUE_FONT } };
  sheet.getCell(`A${targetRow + 3}`).value = 'β Relevered';
  sheet.getCell(`A${targetRow + 3}`).font = { bold: true, name: 'Arial' };
  sheet.getCell(`B${targetRow + 3}`).value = {
    formula: `F${medianRow}*(1+(1-B${targetRow + 2})*B${targetRow + 1})`,
    result: 0,
  };
  sheet.getCell(`B${targetRow + 3}`).numFmt = '0.00';
  sheet.getCell(`B${targetRow + 3}`).font = { bold: true };
}

function buildSourcesSheet(wb: ExcelJS.Workbook, result: WACCResult, inputs: WACCInputs) {
  const sheet = wb.addWorksheet('Sources & Methodology');
  sheet.columns = [{ width: 100 }];

  const lines: string[] = [];
  lines.push('WACC Calculator — Sources & Methodology');
  lines.push(`Generated on: ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`Company: ${inputs.companyName || '—'}`);
  lines.push(`Valuation date: ${inputs.valuationDate}`);
  lines.push(`Methodology: ${result.methodology === 'local_currency' ? 'Local currency approach' : 'Hard currency approach'}`);
  lines.push(`Display currency: ${result.effectiveCurrency || result.currency}`);
  if (result.methodology === 'local_currency') {
    lines.push(
      'Note: Risk-free rate is the local government bond yield. Country risk premium is embedded in the local Rf and therefore set to 0%.',
    );
  }
  lines.push('');
  lines.push('DATA SOURCES');
  lines.push('─────────────────────────────────────');
  for (const r of result.rows) {
    if (r.sourceMin === r.sourceMax) {
      lines.push(`${r.component}: ${r.sourceMin} — ${r.description}`);
    } else {
      lines.push(`${r.component}:`);
      lines.push(`  MIN — ${r.sourceMin}`);
      lines.push(`  MAX — ${r.sourceMax}`);
      lines.push(`  ${r.description}`);
    }
  }
  lines.push('');
  lines.push('METHODOLOGY');
  lines.push('─────────────────────────────────────');
  lines.push('Cost of Equity (CAPM):');
  lines.push('  Ke = Rf + β_relevered × ERP + Size premium + CRP + Currency RP + Specific RP');
  lines.push('');
  lines.push('Beta Re-levering (Hamada equation):');
  lines.push('  β_levered = β_unlevered × (1 + (1 − Tax rate) × D/E)');
  lines.push('');
  lines.push('Cost of Debt:');
  lines.push('  Kd (pre-tax)   = Rf + Credit spread');
  lines.push('  Kd (after-tax) = Kd (pre-tax) × (1 − Tax rate)');
  lines.push('');
  lines.push('WACC:');
  lines.push('  WACC = Ke × (E/V) + Kd(at) × (D/V)');
  lines.push('');
  lines.push('DISCLAIMER');
  lines.push('─────────────────────────────────────');
  lines.push('This calculation is for informational purposes only and should not be');
  lines.push('considered financial advice. All data sources are publicly available.');
  lines.push('Users should verify inputs and assumptions independently.');

  lines.forEach((line, i) => {
    sheet.getCell(i + 1, 1).value = line;
    sheet.getCell(i + 1, 1).font = { name: 'Consolas', size: 10 };
  });
}

export async function exportWACCToExcel(
  result: WACCResult,
  inputs: WACCInputs,
  comparableCompanies?: ComparableCompany[],
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'WACC Calculator';
  wb.created = new Date();

  buildSummarySheet(wb, result, inputs);
  buildInputsSheet(wb, inputs);
  if (comparableCompanies && comparableCompanies.length > 0) {
    // Use MIN bound's D/E and tax as the relever target.
    const minRow = result.rows.find((r) => r.component === 'Beta (relevered)');
    const taxRow = result.rows.find((r) => r.component === 'Tax rate');
    const shareEqRow = result.rows.find((r) => r.component === 'Share of Equity');
    const targetTax = taxRow?.min ?? 0.25;
    const targetDE = shareEqRow?.min ? (1 - shareEqRow.min) / shareEqRow.min : 0.35;
    void minRow;
    buildBetaDetailSheet(wb, comparableCompanies, targetDE, targetTax);
  }
  buildSourcesSheet(wb, result, inputs);

  const buf = await wb.xlsx.writeBuffer();
  const company = (inputs.companyName || 'Company').replace(/[^a-zA-Z0-9]+/g, '_');
  const dateStr = inputs.valuationDate.replace(/-/g, '');
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `WACC_${company}_${dateStr}.xlsx`,
  );
}

export type { ComparableCompany };

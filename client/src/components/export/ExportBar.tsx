import { useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import type { WACCInputs, WACCResult } from '@shared/types';
import { exportWACCToExcel, type ComparableCompany } from '../../utils/excelExport';
import { exportWACCToPDF } from '../../utils/pdfExport';

interface Props {
  result: WACCResult | null;
  inputs: WACCInputs;
}

async function fetchComparables(inputs: WACCInputs): Promise<ComparableCompany[]> {
  const tickerSet = new Set<string>();
  for (const b of [inputs.minBound, inputs.maxBound]) {
    if (b.betaSource === 'comparables') {
      b.comparableTickers
        .split(',')
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean)
        .forEach((t) => tickerSet.add(t));
    }
  }
  const tickers = Array.from(tickerSet).slice(0, 10);
  if (tickers.length === 0) return [];
  const results = await Promise.all(
    tickers.map(async (t) => {
      try {
        const res = await fetch(`/api/company-lookup?ticker=${t}`);
        if (!res.ok) return null;
        return (await res.json()) as ComparableCompany;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((r): r is ComparableCompany => r !== null);
}

export function ExportBar({ result, inputs }: Props) {
  const [excelBusy, setExcelBusy] = useState(false);
  const disabled = !result;

  const onExcel = async () => {
    if (!result) return;
    setExcelBusy(true);
    try {
      const comps = await fetchComparables(inputs);
      await exportWACCToExcel(result, inputs, comps);
    } finally {
      setExcelBusy(false);
    }
  };

  return (
    <div className="export-buttons flex flex-col gap-2 rounded-card border border-forest/10 bg-white p-3">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled || excelBusy}
          onClick={onExcel}
          className="flex items-center gap-2 rounded bg-gold px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-forest shadow-gold transition-colors hover:bg-goldLight disabled:cursor-not-allowed disabled:bg-creamDeep disabled:text-stone disabled:shadow-none"
        >
          <FileSpreadsheet size={14} />
          {excelBusy ? 'Generating…' : 'Export to Excel'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={exportWACCToPDF}
          className="flex items-center gap-2 rounded border-[1.5px] border-forest/25 bg-white px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-forest transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:border-forest/10 disabled:text-stone"
        >
          <FileText size={14} />
          Export to PDF
        </button>
      </div>
      {disabled && (
        <p className="text-[11px] text-stone">Run a calculation to enable exports.</p>
      )}
    </div>
  );
}

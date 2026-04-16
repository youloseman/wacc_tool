import { useState } from 'react';
import { FileSpreadsheet, FileText, RotateCcw, Share2 } from 'lucide-react';
import type { WACCInputs, WACCResult } from '@shared/types';
import { exportWACCToExcel, type ComparableCompany } from '../../utils/excelExport';
import { exportWACCToPDF } from '../../utils/pdfExport';
import { clearLocalStorage, encodeStateToHash } from '../../utils/sessionState';

interface Props {
  result: WACCResult | null;
  inputs: WACCInputs;
  onReset: () => void;
  onShareNotice: (text: string, kind: 'success' | 'warning' | 'error') => void;
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

export function ExportBar({ result, inputs, onReset, onShareNotice }: Props) {
  const [excelBusy, setExcelBusy] = useState(false);
  const exportDisabled = !result;

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

  const onShare = async () => {
    const hash = encodeStateToHash(inputs);
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    try {
      await navigator.clipboard.writeText(url);
      const extra = url.length > 4000 ? ' (link is long; may not fit some clients)' : '';
      onShareNotice(`Link copied.${extra}`, url.length > 4000 ? 'warning' : 'success');
    } catch {
      // Older browsers: fall back to prompt.
      window.prompt('Copy this link:', url);
      onShareNotice('Link ready in prompt — copy manually.', 'success');
    }
  };

  const onResetClick = () => {
    if (!window.confirm('Reset all inputs? Your current calculation will be lost.')) return;
    clearLocalStorage();
    history.replaceState(null, '', window.location.pathname);
    onReset();
    onShareNotice('Inputs reset to defaults.', 'success');
  };

  return (
    <div className="export-buttons flex flex-wrap items-center gap-2 rounded-card border border-forest/10 bg-white p-3">
      <button
        type="button"
        onClick={onShare}
        title="Copy shareable link with current inputs"
        className="flex items-center gap-2 rounded border-[1.5px] border-forest/25 bg-white px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-forest transition-colors hover:border-gold hover:text-gold"
      >
        <Share2 size={14} />
        Share
      </button>
      <button
        type="button"
        disabled={exportDisabled || excelBusy}
        onClick={onExcel}
        className="flex items-center gap-2 rounded bg-gold px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-forest shadow-gold transition-colors hover:bg-goldLight disabled:cursor-not-allowed disabled:bg-creamDeep disabled:text-stone disabled:shadow-none"
      >
        <FileSpreadsheet size={14} />
        {excelBusy ? 'Generating…' : 'Export to Excel'}
      </button>
      <button
        type="button"
        disabled={exportDisabled}
        onClick={exportWACCToPDF}
        className="flex items-center gap-2 rounded border-[1.5px] border-forest/25 bg-white px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-forest transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:border-forest/10 disabled:text-stone"
      >
        <FileText size={14} />
        Export to PDF
      </button>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onResetClick}
        title="Reset all inputs to defaults"
        className="flex items-center gap-1.5 rounded border border-transparent px-2 py-1 text-[11px] uppercase tracking-[0.1em] text-stone transition-colors hover:bg-cream hover:text-red-700"
      >
        <RotateCcw size={12} />
        Reset
      </button>
    </div>
  );
}

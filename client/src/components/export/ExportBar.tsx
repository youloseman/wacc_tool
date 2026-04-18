import { useState } from 'react';
import { Check, FileSpreadsheet, FileText, RotateCcw, Share2 } from 'lucide-react';
import type { WACCInputs, WACCResult } from '@shared/types';
import { exportWACCToExcel, type ComparableCompany } from '../../utils/excelExport';
import { exportWACCToPDF } from '../../utils/pdfExport';
import { broadcastReset, clearLocalStorage, encodeStateToHash } from '../../utils/sessionState';
import { ShareModal } from '../ShareModal';

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
  const [shareModalUrl, setShareModalUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
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
    // Try the one-click clipboard path. If clipboard API is missing (iframe, old browsers,
    // insecure origin) or throws, fall back to a modal with the URL pre-selected so the user
    // can copy manually. Covers every environment without dead-ending on any of them.
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard-unsupported');
      await navigator.clipboard.writeText(url);
      // Inline visual feedback: button briefly swaps to "COPIED!" + green. Simpler and more
      // legible than a toast that competes with other UI. Reverts after 2s.
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
      if (url.length > 4000) {
        onShareNotice('Link is long — may not fit some email clients.', 'warning');
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('clipboard.writeText failed, opening share modal', err);
      setShareModalUrl(url);
    }
  };

  const onResetClick = () => {
    if (!window.confirm('Reset all inputs? Your current calculation will be lost.')) return;
    // 1. Wipe persisted blobs so nothing re-hydrates on next mount.
    clearLocalStorage();
    // 2. Drop the shared URL hash so a forward-nav or reload won't restore it either.
    history.replaceState(null, '', window.location.pathname);
    // 3. Reset the form model back to INITIAL_INPUTS (done in App via useWaccForm.reset).
    onReset();
    // 4. Broadcast so every BoundSection / ComparablePreview resets its local UI state
    //    (collapsed sections, expanded peer cards, dual-input draft).
    broadcastReset();
    onShareNotice('Inputs reset to defaults.', 'success');
  };

  return (
    <div className="export-buttons flex flex-wrap items-center gap-2 rounded-card border border-forest/10 bg-white p-2 lg:p-3">
      <button
        type="button"
        onClick={onShare}
        title="Copy shareable link with current inputs"
        className={`flex items-center gap-1.5 rounded border-[1.5px] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors lg:gap-2 lg:px-3 lg:py-1.5 lg:text-[12px] ${
          shareCopied
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-forest/25 bg-white text-forest hover:border-gold hover:text-gold'
        }`}
      >
        {shareCopied ? <Check size={14} /> : <Share2 size={14} />}
        <span className="hidden lg:inline">{shareCopied ? 'Copied!' : 'Share'}</span>
        {shareCopied && <span className="lg:hidden">✓</span>}
      </button>
      <button
        type="button"
        disabled={exportDisabled || excelBusy}
        onClick={onExcel}
        className="flex items-center gap-1.5 rounded bg-gold px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-forest shadow-gold transition-colors hover:bg-goldLight disabled:cursor-not-allowed disabled:bg-creamDeep disabled:text-stone disabled:shadow-none lg:gap-2 lg:px-3 lg:py-1.5 lg:text-[12px]"
      >
        <FileSpreadsheet size={14} />
        <span className="hidden lg:inline">{excelBusy ? 'Generating…' : 'Export to Excel'}</span>
        <span className="lg:hidden">{excelBusy ? '…' : 'Excel'}</span>
      </button>
      <button
        type="button"
        disabled={exportDisabled}
        onClick={exportWACCToPDF}
        className="flex items-center gap-1.5 rounded border-[1.5px] border-forest/25 bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-forest transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:border-forest/10 disabled:text-stone lg:gap-2 lg:px-3 lg:py-1.5 lg:text-[12px]"
      >
        <FileText size={14} />
        <span className="hidden lg:inline">Export to PDF</span>
        <span className="lg:hidden">PDF</span>
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
      {shareModalUrl && (
        <ShareModal url={shareModalUrl} onClose={() => setShareModalUrl(null)} />
      )}
    </div>
  );
}

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { WACCResult } from '@shared/types';
import { CostOfEquityWaterfall } from './CostOfEquityWaterfall';
import { CapitalStructurePie } from './CapitalStructurePie';

interface Props {
  result: WACCResult;
}

export function AnalysisSection({ result }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="charts-section rounded border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="chart-toggle flex w-full items-center justify-between px-3 py-2 text-left text-[13px] font-semibold text-slate-800 hover:bg-surface"
      >
        <span>Analysis</span>
        {open ? (
          <ChevronDown size={16} className="text-slate-500" />
        ) : (
          <ChevronRight size={16} className="text-slate-500" />
        )}
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-slate-200 p-3 lg:grid lg:grid-cols-[2fr_1fr]">
          <CostOfEquityWaterfall result={result} />
          <CapitalStructurePie result={result} />
        </div>
      )}
    </div>
  );
}

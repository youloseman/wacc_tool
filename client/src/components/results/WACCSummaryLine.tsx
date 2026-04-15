import type { WACCResult } from '@shared/types';
import { fmtPercent } from '../../utils/format';

export function WACCSummaryLine({ result }: { result: WACCResult }) {
  const wacc = result.rows.find((r) => r.component === 'WACC');
  if (!wacc || wacc.min == null || wacc.max == null) return null;
  const spreadBps = Math.round((wacc.max - wacc.min) * 10000);
  return (
    <div className="rounded border-y border-gold/30 bg-goldPale px-4 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[13px] italic text-forest">WACC</span>
        {wacc.min === wacc.max ? (
          <>
            <span className="font-mono text-[18px] font-medium text-gold">
              {fmtPercent(wacc.min)}
            </span>
            <span className="text-[11px] uppercase tracking-[0.12em] text-stonePale">
              Single point estimate
            </span>
          </>
        ) : (
          <>
            <span className="font-mono text-[18px] font-medium text-gold">
              {fmtPercent(wacc.min)} — {fmtPercent(wacc.max)}
            </span>
            <span className="text-[11px] uppercase tracking-[0.12em] text-stonePale">
              Spread {spreadBps} bps
            </span>
          </>
        )}
      </div>
    </div>
  );
}

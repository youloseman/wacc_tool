import type { WACCResult } from '@shared/types';
import { fmtPercent } from '../../utils/format';

export function WACCSummaryLine({ result }: { result: WACCResult }) {
  const wacc = result.rows.find((r) => r.component === 'WACC');
  if (!wacc || wacc.min == null || wacc.max == null) return null;
  const spreadBps = Math.round((wacc.max - wacc.min) * 10000);
  return (
    <div className="rounded border border-slate-200 bg-purple-light px-3 py-2 text-sm">
      {wacc.min === wacc.max ? (
        <>
          WACC: <span className="font-mono font-semibold">{fmtPercent(wacc.min)}</span>{' '}
          <span className="text-slate-500">(single point estimate)</span>
        </>
      ) : (
        <>
          WACC range:{' '}
          <span className="font-mono font-semibold">{fmtPercent(wacc.min)} — {fmtPercent(wacc.max)}</span>{' '}
          <span className="text-slate-500">(spread: {spreadBps} bps)</span>
        </>
      )}
    </div>
  );
}

import type { WACCResult } from '@shared/types';
import { fmtPercent } from '../../utils/format';

interface Props {
  result: WACCResult;
}

const SCALE_MAX = 0.15; // 15%

export function WACCRangeBar({ result }: Props) {
  const wacc = result.rows.find((r) => r.component === 'WACC');
  const min = wacc?.min ?? 0;
  const max = wacc?.max ?? 0;
  const spreadBps = Math.round((max - min) * 10000);

  const left = (Math.min(min, max) / SCALE_MAX) * 100;
  const width = Math.max(0.5, (Math.abs(max - min) / SCALE_MAX) * 100);

  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <div className="mb-1 flex items-baseline justify-between text-[12px]">
        <span className="font-semibold text-slate-800">WACC range</span>
        <span className="text-slate-500">
          {min === max ? (
            <>
              Single point estimate: <span className="font-mono">{fmtPercent(min)}</span>
            </>
          ) : (
            <>
              <span className="font-mono">{fmtPercent(min)}</span> —{' '}
              <span className="font-mono">{fmtPercent(max)}</span> · spread{' '}
              <span className="font-mono">{spreadBps}</span> bps
            </>
          )}
        </span>
      </div>
      <div className="relative h-4 w-full overflow-hidden rounded bg-slate-100">
        <div
          className="absolute top-0 h-full rounded"
          style={{
            left: `${left}%`,
            width: `${width}%`,
            background: 'linear-gradient(90deg, #10B981 0%, #3B82F6 100%)',
          }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>0%</span>
        <span>5%</span>
        <span>10%</span>
        <span>15%</span>
      </div>
    </div>
  );
}

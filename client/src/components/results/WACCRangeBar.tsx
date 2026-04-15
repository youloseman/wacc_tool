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
    <div className="rounded-card border border-forest/10 bg-white p-3">
      <div className="mb-1 flex items-baseline justify-between text-[12px]">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sage">
          WACC range
        </span>
        <span className="text-stone">
          {min === max ? (
            <>
              Single point estimate:{' '}
              <span className="font-mono text-ink">{fmtPercent(min)}</span>
            </>
          ) : (
            <>
              <span className="font-mono text-ink">{fmtPercent(min)}</span> —{' '}
              <span className="font-mono text-ink">{fmtPercent(max)}</span> · spread{' '}
              <span className="font-mono text-goldDark">{spreadBps}</span> bps
            </>
          )}
        </span>
      </div>
      <div className="relative h-4 w-full overflow-hidden rounded bg-creamDeep">
        <div
          className="absolute top-0 h-full rounded"
          style={{
            left: `${left}%`,
            width: `${width}%`,
            background: 'linear-gradient(90deg, #2D6A4F 0%, #C9A84C 100%)',
          }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-mono text-stone">
        <span>0%</span>
        <span>5%</span>
        <span>10%</span>
        <span>15%</span>
      </div>
    </div>
  );
}

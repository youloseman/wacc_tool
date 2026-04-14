import type { WACCResult, WACCResultRow } from '@shared/types';
import { fmtValue, isDash } from '../../utils/format';

interface Props {
  result: WACCResult | null;
}

function rowClass(row: WACCResultRow): string {
  const base = 'border-b border-slate-200';
  const weight = row.isBold ? ' font-semibold' : '';
  const bg =
    row.highlight === 'purple'
      ? ' bg-purple-light'
      : row.highlight === 'darkPurple'
        ? ' bg-purple'
        : '';
  return base + weight + bg;
}

function renderSource(row: WACCResultRow) {
  if (row.sourceMin === row.sourceMax) return row.sourceMin;
  return (
    <span>
      <span className="text-emerald-700">{row.sourceMin}</span>
      <span className="text-slate-400"> / </span>
      <span className="text-blue-700">{row.sourceMax}</span>
    </span>
  );
}

export function ResultTable({ result }: Props) {
  if (!result) {
    return (
      <div className="flex h-48 items-center justify-center rounded border border-dashed border-slate-300 bg-surface text-sm text-slate-500">
        Fill in the form and click "Calculate WACC" to see results.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-navy text-white">
            <th className="px-3 py-2 text-left font-semibold">Discount Rate Component</th>
            <th className="px-3 py-2 text-right font-semibold">MIN</th>
            <th className="px-3 py-2 text-right font-semibold">MAX</th>
            <th className="px-3 py-2 text-left font-semibold">Description</th>
            <th className="px-3 py-2 text-left font-semibold">Source (MIN / MAX)</th>
          </tr>
          <tr className="bg-navy/90 text-xs text-white/80">
            <th className="px-3 py-1 text-left font-normal italic">
              (Post-tax, {result.effectiveCurrency || result.currency}, Nominal
              {result.methodology === 'local_currency' ? ' — Local Currency Approach' : ''})
            </th>
            <th className="px-3 py-1 text-right font-normal">MIN</th>
            <th className="px-3 py-1 text-right font-normal">MAX</th>
            <th className="px-3 py-1" />
            <th className="px-3 py-1" />
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr key={row.component} className={`${rowClass(row)} hover:bg-[#F9FAFB]`}>
              <td className="px-3 py-1.5">{row.component}</td>
              {(() => {
                const minStr = fmtValue(row.min, row.format);
                const maxStr = fmtValue(row.max, row.format);
                return (
                  <>
                    <td className={`px-3 py-1.5 text-right font-mono ${isDash(minStr) ? 'text-slate-400' : ''}`}>
                      {minStr}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-mono ${isDash(maxStr) ? 'text-slate-400' : ''}`}>
                      {maxStr}
                    </td>
                  </>
                );
              })()}
              <td className="px-3 py-1.5 text-slate-600">{row.description}</td>
              <td className="px-3 py-1.5 text-slate-500">{renderSource(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

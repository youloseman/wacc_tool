import type { WACCResult, WACCResultRow } from '@shared/types';
import { fmtValue, isDash } from '../../utils/format';
import { DiagPattern } from '../decor/DiagPattern';

interface Props {
  result: WACCResult | null;
}

function rowClass(row: WACCResultRow): string {
  const base = 'border-b border-forest/8';
  const weight = row.isBold ? ' font-semibold' : '';
  const bg =
    row.highlight === 'purple'
      ? ' bg-goldPale/50'
      : row.highlight === 'darkPurple'
        ? ' bg-goldPale border-t border-gold/30'
        : '';
  return base + weight + bg;
}

function renderSource(row: WACCResultRow) {
  if (row.sourceMin === row.sourceMax) return <span className="text-stone">{row.sourceMin}</span>;
  return (
    <span>
      <span className="text-sage">{row.sourceMin}</span>
      <span className="text-stonePale"> / </span>
      <span className="text-gold">{row.sourceMax}</span>
    </span>
  );
}

// Rows that should get a gold gradient divider ABOVE them (visual section breaks).
const SECTION_BREAK_BEFORE = new Set(['Cost of Debt (pre-tax)', 'WACC']);

interface KpiCellProps {
  label: string;
  value: string;
}
function KpiCell({ label, value }: KpiCellProps) {
  return (
    <div className="flex flex-1 flex-col items-start gap-1 px-4 py-2.5">
      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-stonePale">
        {label}
      </span>
      <span className="font-mono text-[18px] font-medium leading-none text-gold">{value}</span>
    </div>
  );
}

export function ResultTable({ result }: Props) {
  if (!result) {
    return (
      <div className="flex h-48 items-center justify-center rounded-card border border-dashed border-forest/20 bg-cream text-sm text-stone">
        Fill in the form and click "Calculate WACC" to see results.
      </div>
    );
  }

  const wacc = result.rows.find((r) => r.component === 'WACC');
  const minPct = wacc?.min != null ? `${(wacc.min * 100).toFixed(2)}%` : '—';
  const maxPct = wacc?.max != null ? `${(wacc.max * 100).toFixed(2)}%` : '—';
  const spreadBps =
    wacc?.min != null && wacc?.max != null
      ? `${Math.round((wacc.max - wacc.min) * 10000)} bp`
      : '—';
  const midPct =
    wacc?.min != null && wacc?.max != null
      ? `${(((wacc.min + wacc.max) / 2) * 100).toFixed(2)}%`
      : '—';

  const displayCurrency = result.effectiveCurrency || result.currency;
  const methodologyLabel =
    result.methodology === 'local_currency' ? 'Local Currency' : 'Hard Currency';

  return (
    <div className="result-table overflow-hidden rounded-card border border-forest/10 bg-white shadow-sm">
      {/* Report header band — forest with subtle diagonal gold pattern. */}
      <div className="result-band relative overflow-hidden bg-forest px-5 py-4 text-cream">
        <DiagPattern color="#C9A84C" opacity={0.06} />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-cream/50">
              WACC Analysis · {result.valuationDate}
            </div>
            <h2 className="mt-1 truncate font-display text-[22px] italic leading-tight">
              {result.companyName || 'Untitled Valuation'}
            </h2>
          </div>
          <div className="flex flex-col items-end gap-0.5 whitespace-nowrap text-right text-[10px]">
            <span className="font-mono text-cream">
              Post-tax · {displayCurrency} · Nominal
            </span>
            <span className="font-sans uppercase tracking-[0.12em] text-cream/50">
              {methodologyLabel}
            </span>
          </div>
        </div>
      </div>

      {/* KPI strip — bold gold monospace numbers flanking WACC range. */}
      <div className="flex border-b border-forest/10 bg-cream divide-x divide-forest/10">
        <KpiCell label="WACC · MIN" value={minPct} />
        <KpiCell label="WACC · MAX" value={maxPct} />
        <KpiCell label="Spread" value={spreadBps} />
        <KpiCell label="Mid-point" value={midPct} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-forest text-cream">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em]">
                Discount Rate Component
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em]">
                MIN
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em]">
                MAX
              </th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em]">
                Description
              </th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em]">
                Source (MIN / MAX)
              </th>
            </tr>
            <tr className="bg-forestDark text-[11px] text-cream/70">
              <th className="px-3 py-1 text-left font-display italic">
                (Post-tax, {displayCurrency}, Nominal
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
              <>
                {SECTION_BREAK_BEFORE.has(row.component) && (
                  <tr key={`${row.component}-break`} aria-hidden="true">
                    <td colSpan={5} className="p-0">
                      <div className="gold-divider h-px w-full bg-gradient-to-r from-gold/40 via-gold/15 to-transparent" />
                    </td>
                  </tr>
                )}
                <tr key={row.component} className={`${rowClass(row)} hover:bg-cream`}>
                  <td className="px-3 py-1.5 text-ink">{row.component}</td>
                  {(() => {
                    const minStr = fmtValue(row.min, row.format);
                    const maxStr = fmtValue(row.max, row.format);
                    return (
                      <>
                        <td
                          className={`px-3 py-1.5 text-right font-mono ${isDash(minStr) ? 'text-stonePale' : 'text-ink'}`}
                        >
                          {minStr}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-right font-mono ${isDash(maxStr) ? 'text-stonePale' : 'text-ink'}`}
                        >
                          {maxStr}
                        </td>
                      </>
                    );
                  })()}
                  <td className="px-3 py-1.5 text-stone">{row.description}</td>
                  <td className="px-3 py-1.5 text-[12px]">{renderSource(row)}</td>
                </tr>
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Editorial footer — cream band with mono provenance line. */}
      <div className="border-t border-forest/10 bg-cream px-5 py-2 text-[10px] font-mono text-stonePale">
        Prepared via WACC Calculator · {new Date().toISOString().slice(0, 10)} · Data: FRED,
        Damodaran, Kroll, FMP
      </div>
    </div>
  );
}

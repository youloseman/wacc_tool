import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import type { BetaAnalysis, BetaMethod, BetaStability } from '@shared/types';
import { fmtBeta, fmtPercent } from '../../../utils/format';

type DeSource = 'firm' | 'balance-sheet' | 'market-cap' | 'industry-proxy';
type TaxSource = 'firm' | 'income-statement' | 'country-default';

interface CompanyData {
  ticker: string;
  name: string;
  leveredBeta: number;
  deRatio: number;
  taxRate: number;
  unleveredBeta: number;
  marketCap: number;
  exchange?: string;
  country?: string;
  currency?: string;
  source?: 'fmp-firm' | 'fmp-industry-proxy' | 'yahoo';
  deSource?: DeSource;
  taxSource?: TaxSource;
  statementDate?: string;
  statementPeriod?: string;
  notes?: string;
  betaMethod?: BetaMethod;
  betaAnalysis?: BetaAnalysis;
  averageRSquared?: number;
  significantWindows?: number;
  totalWindows?: number;
  stability?: BetaStability;
  fmpProviderBeta?: number;
}

interface DeBadge {
  label: string;
  cls: string;
  tooltip: string;
}

function deBadge(c: CompanyData): DeBadge | null {
  const src = c.deSource ?? (c.source === 'fmp-industry-proxy' ? 'industry-proxy' : 'firm');
  const dateSuffix = c.statementDate ? ` (${c.statementPeriod ?? 'FY'} ${c.statementDate})` : '';
  switch (src) {
    case 'firm':
      return null;
    case 'balance-sheet':
      return {
        label: 'BS D/E',
        cls: 'bg-sage/15 text-sage',
        tooltip: `D/E from balance sheet (Total Debt / Total Equity)${dateSuffix}.${c.notes ? ' ' + c.notes : ''}`,
      };
    case 'market-cap':
      return {
        label: 'Mkt D/E',
        cls: 'bg-goldPale text-goldDark',
        tooltip: `Book equity unavailable or negative — D/E = Total Debt / Market Cap${dateSuffix}.${c.notes ? ' ' + c.notes : ''}`,
      };
    case 'industry-proxy':
      return {
        label: 'proxy D/E',
        cls: 'bg-red-100 text-red-700',
        tooltip: c.notes ?? 'D/E proxied from Damodaran industry average.',
      };
  }
}

function taxLabel(c: CompanyData): string {
  const src = c.taxSource;
  if (src === 'firm') return `Tax: ${(c.taxRate * 100).toFixed(1)}% (firm-level, FMP TTM)`;
  if (src === 'income-statement')
    return `Tax: ${(c.taxRate * 100).toFixed(1)}% (income statement${c.statementDate ? `, ${c.statementPeriod ?? 'FY'} ${c.statementDate}` : ''})`;
  return `Tax: ${(c.taxRate * 100).toFixed(1)}% (country marginal rate — no statement data)`;
}

interface SearchCandidate {
  ticker: string;
  name: string;
  exchange: string;
  country: string;
  currency: string;
}

interface Row {
  ticker: string;
  data: CompanyData | null;
  loading: boolean;
}

interface Props {
  tickers: string;
  onTickersChange: (tickers: string) => void;
  valuationDate?: string;
  metric?: 'beta' | 'de';
}

function fmtMarketCap(mc: number): string {
  if (mc >= 1e12) return `$${(mc / 1e12).toFixed(1)}T`;
  if (mc >= 1e9) return `$${(mc / 1e9).toFixed(1)}B`;
  if (mc >= 1e6) return `$${(mc / 1e6).toFixed(0)}M`;
  return `$${mc.toLocaleString()}`;
}

function methodBadge(method?: BetaMethod) {
  if (!method) return { label: 'FMP', cls: 'bg-slate-100 text-slate-600' };
  if (method === 'calculated-5Y') return { label: '5Y', cls: 'bg-green-100 text-green-700' };
  if (method === 'calculated-3Y') return { label: '3Y', cls: 'bg-amber-100 text-amber-700' };
  return { label: 'Provider', cls: 'bg-red-100 text-red-700' };
}

function r2Class(r2?: number): string {
  if (r2 == null) return 'text-slate-400';
  if (r2 >= 0.2) return 'text-green-700';
  if (r2 >= 0.1) return 'text-amber-700';
  return 'text-red-700';
}

function signifClass(sig?: number, total?: number): string {
  if (!total) return 'text-slate-400';
  if (sig === total) return 'text-green-700';
  if (sig != null && sig >= total - 1) return 'text-amber-700';
  return 'text-red-700';
}

function stabilityDot(s?: BetaStability): { dot: string; cls: string; label: string } {
  if (s === 'stable') return { dot: '●', cls: 'text-green-700', label: 'Stable' };
  if (s === 'moderate') return { dot: '◐', cls: 'text-amber-700', label: 'Moderate' };
  if (s === 'unstable') return { dot: '○', cls: 'text-red-700', label: 'Unstable' };
  return { dot: '–', cls: 'text-slate-400', label: '—' };
}

function fmtMonth(d: string): string {
  // YYYY-MM-DD → MMM'YY
  const [y, m] = d.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(m) - 1]}'${y.slice(2)}`;
}

export function ComparablePreview({ tickers, onTickersChange, valuationDate, metric = 'beta' }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<SearchCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const tickerList = useMemo(
    () => tickers.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean),
    [tickers],
  );

  useEffect(() => {
    if (tickerList.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setRows(tickerList.map((t) => ({ ticker: t, data: null, loading: true })));
    (async () => {
      const qs = valuationDate ? `&valuationDate=${encodeURIComponent(valuationDate)}` : '';
      const fetched = await Promise.all(
        tickerList.map(async (t) => {
          try {
            const res = await fetch(`/api/company-lookup?ticker=${encodeURIComponent(t)}${qs}`);
            if (!res.ok) return { ticker: t, data: null, loading: false };
            const data = (await res.json()) as CompanyData;
            return { ticker: t, data, loading: false };
          } catch {
            return { ticker: t, data: null, loading: false };
          }
        }),
      );
      if (!cancelled) setRows(fetched);
    })();
    return () => {
      cancelled = true;
    };
  }, [tickers, valuationDate]);

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/company-search?q=${encodeURIComponent(query)}&limit=8`);
      if (res.ok) {
        const body = (await res.json()) as { results: SearchCandidate[] };
        setCandidates(body.results);
      } else {
        setCandidates([]);
      }
    } catch {
      setCandidates([]);
    } finally {
      setSearching(false);
    }
  };

  const addTicker = (ticker: string) => {
    const set = new Set(tickerList);
    set.add(ticker.toUpperCase());
    onTickersChange(Array.from(set).join(', '));
    setCandidates(null);
    setQuery('');
  };

  const removeTicker = (ticker: string) => {
    const next = tickerList.filter((t) => t !== ticker.toUpperCase());
    onTickersChange(next.join(', '));
  };

  const toggleExpand = (ticker: string) => {
    const next = new Set(expanded);
    if (next.has(ticker)) next.delete(ticker);
    else next.add(ticker);
    setExpanded(next);
  };

  const validData = rows.filter((r) => r.data).map((r) => r.data!);
  const medianOf = (vals: number[]): number | null => {
    if (vals.length === 0) return null;
    const s = [...vals].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
  };
  const medianBeta = medianOf(validData.map((d) => d.unleveredBeta));
  const medianDE = medianOf(validData.map((d) => d.deRatio));

  const calculatedCount = validData.filter((d) => d.betaMethod?.startsWith('calculated')).length;
  const avgR2 = calculatedCount > 0
    ? validData.reduce((a, d) => a + (d.averageRSquared ?? 0), 0) / calculatedCount
    : null;
  const totalSig = validData.reduce((a, d) => a + (d.significantWindows ?? 0), 0);
  const totalWin = validData.reduce((a, d) => a + (d.totalWindows ?? 0), 0);

  const stabilityCounts = {
    stable: validData.filter((d) => d.stability === 'stable').length,
    moderate: validData.filter((d) => d.stability === 'moderate').length,
    unstable: validData.filter((d) => d.stability === 'unstable').length,
  };

  // Warning banners
  const warnings: string[] = [];
  if (calculatedCount > 0) {
    const unstableTickers = validData.filter((d) => d.stability === 'unstable').map((d) => d.ticker);
    if (unstableTickers.length > 0) {
      warnings.push(
        `⚠ Unstable beta across rolling windows for ${unstableTickers.join(', ')}. Estimate may be unreliable.`,
      );
    }
    if (avgR2 != null && avgR2 < 0.15) {
      warnings.push(
        `⚠ Low average R² (${avgR2.toFixed(2)}). Stock returns poorly explained by market; consider Damodaran industry beta.`,
      );
    }
    const poorSig = validData.filter((d) => (d.significantWindows ?? 0) < (d.totalWindows ?? 3) - 1).length;
    if (poorSig > validData.length / 2) {
      warnings.push('⚠ Most peers have <2/3 significant rolling windows. Peer set may not be reliable.');
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, ticker, or ISIN…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), runSearch())}
            className="w-full rounded border border-slate-300 pl-6 pr-2 py-1 text-[12px] focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          />
        </div>
        <button
          type="button"
          onClick={runSearch}
          disabled={searching || !query.trim()}
          className="rounded border border-navy bg-navy px-2 py-1 text-[11px] text-white hover:bg-[#002770] disabled:opacity-50"
        >
          {searching ? '…' : 'Search'}
        </button>
      </div>

      {candidates && (
        <div className="max-h-48 overflow-auto rounded border border-slate-200 bg-white">
          {candidates.length === 0 ? (
            <div className="px-2 py-1.5 text-[11px] text-slate-500">No matches</div>
          ) : (
            candidates.map((c) => (
              <button
                key={c.ticker}
                type="button"
                onClick={() => addTicker(c.ticker)}
                className="flex w-full items-center justify-between px-2 py-1 text-left text-[11px] hover:bg-surface"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-mono font-medium">{c.ticker}</span>
                  <span className="ml-2 text-slate-600">{c.name}</span>
                </div>
                <span className="ml-2 shrink-0 text-slate-400">{c.exchange}</span>
              </button>
            ))
          )}
        </div>
      )}

      {warnings.map((w, i) => (
        <div
          key={i}
          className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800"
        >
          {w}
        </div>
      ))}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded border border-forest/10 bg-white text-[11px]">
          {/* Compact peer cards — vertical layout fits the 380px sidebar without horizontal scroll.
              Click anywhere on the card to expand full diagnostics (β windows, D/E source, tax). */}
          <ul className="divide-y divide-forest/8">
            {rows.map((r) => {
              const data = r.data;
              const hasDetail = !!data?.betaAnalysis;
              const isExpanded = expanded.has(r.ticker);
              const m = methodBadge(data?.betaMethod);
              const stab = stabilityDot(data?.stability);
              const badge = data ? deBadge(data) : null;

              if (!data) {
                return (
                  <li key={r.ticker} className="flex items-center justify-between px-2 py-1.5">
                    <span className="font-mono font-medium text-forest">{r.ticker}</span>
                    {r.loading ? (
                      <span className="text-stonePale">Loading…</span>
                    ) : (
                      <span className="text-red-700">not found</span>
                    )}
                  </li>
                );
              }

              return (
                <li key={r.ticker}>
                  {/* Use a div with click handler — nesting <button> inside <button> for the
                      remove ✕ would be invalid HTML and break accessibility. */}
                  <div
                    role={hasDetail ? 'button' : undefined}
                    tabIndex={hasDetail ? 0 : undefined}
                    onClick={() => hasDetail && toggleExpand(r.ticker)}
                    onKeyDown={(e) => {
                      if (hasDetail && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        toggleExpand(r.ticker);
                      }
                    }}
                    className={`flex w-full items-start gap-2 px-2 py-1.5 text-left transition-colors ${
                      hasDetail ? 'cursor-pointer hover:bg-cream' : ''
                    }`}
                  >
                    {/* Caret column: aligned, occupies space even when no detail to keep layout stable. */}
                    <span className="mt-0.5 text-goldDark">
                      {hasDetail ? (
                        isExpanded ? (
                          <ChevronDown size={12} />
                        ) : (
                          <ChevronRight size={12} />
                        )
                      ) : (
                        <span className="inline-block w-3" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      {/* Top row: ticker + name (truncated) */}
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono font-semibold text-forest">{r.ticker}</span>
                        <span className="truncate text-stone">{data.name}</span>
                      </div>

                      {/* Metric row: βu / D/E / inline badges */}
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px]">
                        <span>
                          <span className="text-stonePale">βu </span>
                          <span className="font-mono font-semibold text-forest">
                            {fmtBeta(data.unleveredBeta)}
                          </span>
                        </span>
                        <span>
                          <span className="text-stonePale">D/E </span>
                          <span className="font-mono text-forest">{fmtPercent(data.deRatio)}</span>
                        </span>
                        {badge && (
                          <span title={badge.tooltip} className={`rounded px-1 py-px ${badge.cls}`}>
                            {badge.label}
                          </span>
                        )}
                        <span className={`rounded px-1 py-px ${m.cls}`} title="Beta method">
                          {m.label}
                        </span>
                        <span className={stab.cls} title={`${stab.label} stability`}>
                          {stab.dot}
                        </span>
                      </div>
                    </div>

                    {/* Right: remove button — stops click propagation so we don't expand on remove. */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTicker(r.ticker);
                      }}
                      className="mt-0.5 shrink-0 text-stonePale hover:text-red-700"
                      aria-label={`Remove ${r.ticker}`}
                    >
                      <X size={12} />
                    </button>
                  </div>

                  {hasDetail && isExpanded && data.betaAnalysis && (
                    <div className="border-t border-forest/8 bg-cream px-3 py-2 text-[10px] text-stone">
                      {/* Header line: method + benchmark + stability */}
                      <div className="mb-1">
                        <span className="font-semibold text-forest">
                          {data.betaAnalysis.period} Monthly
                        </span>{' '}
                        vs {data.betaAnalysis.benchmark} —{' '}
                        <span className="italic">{data.betaAnalysis.stabilityNote}</span>
                      </div>

                      {/* Mkt Cap + R² + Signif row */}
                      <div className="mb-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono">
                        <span>
                          <span className="text-stonePale">Mkt cap </span>
                          {fmtMarketCap(data.marketCap)}
                        </span>
                        <span>
                          <span className="text-stonePale">β lev </span>
                          {fmtBeta(data.leveredBeta)}
                        </span>
                        <span>
                          <span className="text-stonePale">R² </span>
                          <span className={r2Class(data.averageRSquared)}>
                            {data.averageRSquared != null ? data.averageRSquared.toFixed(2) : '—'}
                          </span>
                        </span>
                        <span>
                          <span className="text-stonePale">Signif </span>
                          <span className={signifClass(data.significantWindows, data.totalWindows)}>
                            {data.totalWindows
                              ? `${data.significantWindows}/${data.totalWindows}`
                              : '—'}
                          </span>
                        </span>
                      </div>

                      {/* Provenance: D/E source + tax source */}
                      <div className="mb-1.5 text-stonePale">
                        D/E: {fmtPercent(data.deRatio)} ({data.deSource ?? 'firm'}
                        {data.statementDate
                          ? `, ${data.statementPeriod ?? 'FY'} ${data.statementDate}`
                          : ''}
                        ) · {taxLabel(data)}
                      </div>

                      {/* Rolling-window regression table */}
                      <table className="w-full font-mono">
                        <thead className="text-stonePale">
                          <tr>
                            <th className="pr-2 text-left">Window</th>
                            <th className="pr-2 text-left">Period</th>
                            <th className="pr-2 text-right">β</th>
                            <th className="pr-2 text-right">R²</th>
                            <th className="pr-2 text-right">t-stat</th>
                            <th className="pr-2 text-right">n</th>
                            <th className="text-center">Sig</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.betaAnalysis.windows.map((w) => (
                            <tr key={w.label}>
                              <td className="pr-2">{w.label}</td>
                              <td className="pr-2 text-stonePale">
                                {fmtMonth(w.startDate)} — {fmtMonth(w.endDate)}
                              </td>
                              <td className="pr-2 text-right">{w.beta.toFixed(2)}</td>
                              <td className="pr-2 text-right">{w.rSquared.toFixed(2)}</td>
                              <td className="pr-2 text-right">{w.tStatistic.toFixed(2)}</td>
                              <td className="pr-2 text-right">{w.observations}</td>
                              <td className="text-center">{w.isSignificant ? '✓' : '✗'}</td>
                            </tr>
                          ))}
                          <tr className="border-t border-forest/15 font-semibold text-forest">
                            <td className="pr-2">Avg</td>
                            <td></td>
                            <td className="pr-2 text-right">
                              {data.betaAnalysis.averageBeta.toFixed(2)}
                            </td>
                            <td className="pr-2 text-right">
                              {data.betaAnalysis.averageRSquared.toFixed(2)}
                            </td>
                            <td></td>
                            <td></td>
                            <td className="text-center">
                              {data.betaAnalysis.significantCount}/{data.betaAnalysis.totalWindows}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {(medianBeta != null || medianDE != null) && (
            <div className="border-t border-forest/10 bg-cream px-2 py-1.5 text-[11px]">
              <div className="font-mono">
                {metric === 'de' ? (
                  <>
                    <span className="font-semibold">Median D/E: {medianDE != null ? fmtPercent(medianDE) : '—'}</span>
                    {medianBeta != null && (
                      <span className="ml-3 text-slate-500">· Median βu: {fmtBeta(medianBeta)}</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="font-semibold">Median βu: {medianBeta != null ? fmtBeta(medianBeta) : '—'}</span>
                    {medianDE != null && (
                      <span className="ml-3 text-slate-500">· Median D/E: {fmtPercent(medianDE)}</span>
                    )}
                  </>
                )}
              </div>
              {calculatedCount > 0 && (
                <div className="mt-0.5 text-[10px] text-stone">
                  Method: 5Y/3Y Monthly vs S&P 500 · Avg R²:{' '}
                  {avgR2?.toFixed(2) ?? '—'} · Significant: {totalSig}/{totalWin} windows ·
                  Stability: {stabilityCounts.stable} stable
                  {stabilityCounts.moderate ? `, ${stabilityCounts.moderate} moderate` : ''}
                  {stabilityCounts.unstable ? `, ${stabilityCounts.unstable} unstable` : ''}
                  {valuationDate ? ` · as of ${valuationDate}` : ''}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

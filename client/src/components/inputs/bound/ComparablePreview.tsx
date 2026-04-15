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
        cls: 'bg-goldPale text-gold',
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

      {tickerList.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tickerList.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-mono"
            >
              {t}
              <button
                type="button"
                onClick={() => removeTicker(t)}
                className="text-slate-400 hover:text-slate-700"
                aria-label={`Remove ${t}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {warnings.map((w, i) => (
        <div key={i} className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          {w}
        </div>
      ))}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded border border-slate-200 bg-white text-[11px]">
          <table className="w-full">
            <thead className="bg-surface text-left">
              <tr>
                <th className="px-1 py-1 w-4"></th>
                <th className="px-1.5 py-1">Ticker</th>
                <th className="px-1.5 py-1">Name</th>
                <th className="px-1.5 py-1">Mkt Cap</th>
                <th className="px-1.5 py-1 text-right">β lev</th>
                <th className="px-1.5 py-1 text-center">Method</th>
                <th className="px-1.5 py-1 text-right">R²</th>
                <th className="px-1.5 py-1 text-center">Signif</th>
                <th className="px-1.5 py-1 text-center">Stab</th>
                <th className="px-1.5 py-1 text-right">D/E</th>
                <th className="px-1.5 py-1 text-right">βu</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const m = methodBadge(r.data?.betaMethod);
                const stab = stabilityDot(r.data?.stability);
                const hasDetail = !!r.data?.betaAnalysis;
                const isExpanded = expanded.has(r.ticker);
                return (
                  <>
                    <tr key={r.ticker} className="border-t border-slate-100">
                      <td className="px-1 py-1">
                        {hasDetail && (
                          <button
                            type="button"
                            onClick={() => toggleExpand(r.ticker)}
                            className="text-slate-400 hover:text-slate-700"
                            aria-label="expand"
                          >
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          </button>
                        )}
                      </td>
                      <td className="px-1.5 py-1 font-mono">{r.ticker}</td>
                      {r.data ? (
                        <>
                          <td className="px-1.5 py-1">
                            <div>{r.data.name}</div>
                            <div className="text-[10px] text-slate-400">
                              {r.data.exchange}
                              {(() => {
                                const b = deBadge(r.data!);
                                if (!b) return null;
                                return (
                                  <span
                                    title={b.tooltip}
                                    className={`ml-1 rounded px-1 py-px ${b.cls}`}
                                  >
                                    {b.label}
                                  </span>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="px-1.5 py-1 font-mono">{fmtMarketCap(r.data.marketCap)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtBeta(r.data.leveredBeta)}</td>
                          <td className="px-1.5 py-1 text-center">
                            <span className={`rounded px-1 py-px text-[10px] ${m.cls}`}>{m.label}</span>
                          </td>
                          <td className={`px-1.5 py-1 text-right font-mono ${r2Class(r.data.averageRSquared)}`}>
                            {r.data.averageRSquared != null ? r.data.averageRSquared.toFixed(2) : '—'}
                          </td>
                          <td className={`px-1.5 py-1 text-center font-mono ${signifClass(r.data.significantWindows, r.data.totalWindows)}`}>
                            {r.data.totalWindows ? `${r.data.significantWindows}/${r.data.totalWindows}` : '—'}
                          </td>
                          <td className="px-1.5 py-1 text-center">
                            <span className={stab.cls} title={stab.label}>{stab.dot}</span>
                          </td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtPercent(r.data.deRatio)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtBeta(r.data.unleveredBeta)}</td>
                        </>
                      ) : r.loading ? (
                        <td colSpan={9} className="px-1.5 py-1 text-slate-400">Loading…</td>
                      ) : (
                        <td colSpan={9} className="px-1.5 py-1 text-red-600">not found</td>
                      )}
                    </tr>
                    {hasDetail && isExpanded && r.data?.betaAnalysis && (
                      <tr className="bg-slate-50">
                        <td></td>
                        <td colSpan={10} className="px-2 py-1">
                          <div className="text-[10px] text-slate-600 mb-1">
                            {r.data.betaAnalysis.period} Monthly vs {r.data.betaAnalysis.benchmark} — {r.data.betaAnalysis.stabilityNote}
                          </div>
                          <div className="mb-1 text-[10px] text-slate-500">
                            D/E: {fmtPercent(r.data.deRatio)} ({r.data.deSource ?? 'firm'}
                            {r.data.statementDate ? `, ${r.data.statementPeriod ?? 'FY'} ${r.data.statementDate}` : ''}) · {taxLabel(r.data)}
                          </div>
                          <table className="w-full text-[10px] font-mono">
                            <thead className="text-slate-500">
                              <tr>
                                <th className="text-left pr-2">Window</th>
                                <th className="text-left pr-2">Period</th>
                                <th className="text-right pr-2">β</th>
                                <th className="text-right pr-2">R²</th>
                                <th className="text-right pr-2">t-stat</th>
                                <th className="text-right pr-2">n</th>
                                <th className="text-center">Sig</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.data.betaAnalysis.windows.map((w) => (
                                <tr key={w.label}>
                                  <td className="pr-2">{w.label}</td>
                                  <td className="pr-2 text-slate-500">{fmtMonth(w.startDate)} — {fmtMonth(w.endDate)}</td>
                                  <td className="text-right pr-2">{w.beta.toFixed(2)}</td>
                                  <td className="text-right pr-2">{w.rSquared.toFixed(2)}</td>
                                  <td className="text-right pr-2">{w.tStatistic.toFixed(2)}</td>
                                  <td className="text-right pr-2">{w.observations}</td>
                                  <td className="text-center">{w.isSignificant ? '✓' : '✗'}</td>
                                </tr>
                              ))}
                              <tr className="border-t border-slate-200 font-semibold">
                                <td className="pr-2">Avg</td>
                                <td></td>
                                <td className="text-right pr-2">{r.data.betaAnalysis.averageBeta.toFixed(2)}</td>
                                <td className="text-right pr-2">{r.data.betaAnalysis.averageRSquared.toFixed(2)}</td>
                                <td></td>
                                <td></td>
                                <td className="text-center">{r.data.betaAnalysis.significantCount}/{r.data.betaAnalysis.totalWindows}</td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
          {(medianBeta != null || medianDE != null) && (
            <div className="border-t border-slate-200 bg-surface px-1.5 py-1 text-[11px]">
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
                <div className="mt-0.5 text-[10px] text-slate-500">
                  Method: 5Y/3Y Monthly vs S&P 500 · Avg R²: {avgR2?.toFixed(2) ?? '—'} · Significant:{' '}
                  {totalSig}/{totalWin} windows · Stability: {stabilityCounts.stable} stable
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

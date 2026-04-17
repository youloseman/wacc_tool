import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { fmtBeta, fmtPercent } from '../../../utils/format';
import { BetaSparkline } from './BetaSparkline';

export interface KrollSectorRow {
  gicsCode: string;
  gicsLevel: 'sector' | 'industryGroup' | 'industry' | 'subIndustry' | 'other';
  parentCode: string | null;
  name: string;
  path: string;
  latestBeta: number | null;
  latestDebtToEquity: number | null;
  latestQuarter: string | null;
  quarterCount: number;
  betaTrend: number[];
}

interface Props {
  /** Currently selected GICS code, or null to fall back to Damodaran-name matching. */
  value: string | null;
  onChange: (gics: string | null) => void;
}

// Indent visually by GICS hierarchy level. Sector (2-digit) stays flush left; subIndustry
// (8-digit) is the most indented.
const INDENT_BY_LEVEL: Record<KrollSectorRow['gicsLevel'], string> = {
  sector: 'pl-0',
  industryGroup: 'pl-3',
  industry: 'pl-6',
  subIndustry: 'pl-9',
  other: 'pl-0',
};

const LEVEL_STYLES: Record<KrollSectorRow['gicsLevel'], string> = {
  sector: 'font-semibold text-forest',
  industryGroup: 'font-medium text-forest',
  industry: 'text-ink',
  subIndustry: 'text-stone',
  other: 'text-stone',
};

export function KrollSectorPicker({ value, onChange }: Props) {
  const [rows, setRows] = useState<KrollSectorRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/kroll-sectors');
        if (!res.ok) return;
        const body = (await res.json()) as { industries: KrollSectorRow[] };
        if (!cancelled) setRows(body.industries);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.path.toLowerCase().includes(q) ||
        r.gicsCode.includes(q),
    );
  }, [rows, query]);

  const selected = rows?.find((r) => r.gicsCode === value) ?? null;

  return (
    <div className="space-y-1">
      <label className="block text-[12px] font-medium text-forest">Kroll GICS sector</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded border-[1.5px] border-forest/10 bg-white px-2 py-1.5 text-left text-[12px] text-ink focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/15"
      >
        {selected ? (
          <span className="flex items-center gap-2 truncate">
            <span className="truncate">{selected.path}</span>
            {selected.betaTrend.length > 0 && (
              <BetaSparkline values={selected.betaTrend} className="shrink-0" />
            )}
            {selected.latestBeta != null && (
              <span className="shrink-0 font-mono text-goldDark">
                βu {fmtBeta(selected.latestBeta)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-stonePale">
            — pick a Kroll sector (falls back to Damodaran name match)
          </span>
        )}
        <span className="text-goldDark">▾</span>
      </button>

      {open && (
        <div className="rounded border border-forest/15 bg-white shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-forest/8 px-2 py-1">
            <Search size={12} className="text-stonePale" />
            <input
              autoFocus
              type="text"
              placeholder="Search name, path, or GICS code…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-[12px] text-ink placeholder:text-stonePale focus:outline-none"
            />
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="text-[11px] text-stone hover:text-red-700"
              >
                Clear
              </button>
            )}
          </div>
          <div className="max-h-[50vh] overflow-auto lg:max-h-72">
            {rows == null ? (
              <div className="px-2 py-2 text-[11px] text-stonePale">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-2 py-2 text-[11px] text-stonePale">No matches</div>
            ) : (
              filtered.map((r) => {
                const isSelected = r.gicsCode === value;
                return (
                  <button
                    key={r.gicsCode}
                    type="button"
                    onClick={() => {
                      onChange(r.gicsCode);
                      setOpen(false);
                    }}
                    className={`flex w-full min-h-[44px] items-center gap-2 px-2 py-1.5 text-left text-[11.5px] sm:min-h-0 sm:py-1 ${INDENT_BY_LEVEL[r.gicsLevel]} ${LEVEL_STYLES[r.gicsLevel]} ${isSelected ? 'bg-goldPale' : 'hover:bg-cream'}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    {r.betaTrend.length > 1 && (
                      <BetaSparkline values={r.betaTrend} className="hidden shrink-0 sm:inline-block" />
                    )}
                    {r.latestBeta != null && (
                      <span className="shrink-0 font-mono text-[10px] text-goldDark">
                        β {fmtBeta(r.latestBeta)}
                      </span>
                    )}
                    {r.latestDebtToEquity != null && (
                      <span className="shrink-0 font-mono text-[10px] text-stone">
                        D/E {fmtPercent(r.latestDebtToEquity)}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-forest/8 bg-cream px-2 py-1 text-[10px] text-stonePale">
            Beta is looked up for the nearest quarter ≤ your valuation date. 22 quarters
            available (3Q 2020 → 4Q 2025).
          </div>
        </div>
      )}
    </div>
  );
}

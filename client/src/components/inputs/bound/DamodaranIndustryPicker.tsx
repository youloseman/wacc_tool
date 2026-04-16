import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useMetadata } from '../../../context/MetadataContext';
import { fmtBeta, fmtPercent } from '../../../utils/format';

interface Props {
  value: string;
  onChange: (industryName: string) => void;
}

// Per-bound Damodaran industry picker. Mirrors the Kroll sector picker visually so the user
// sees consistent controls. The chosen industry drives: Damodaran β, industry-average D/E in
// Capital Structure, and proxy D/E in the financial-statement cascade for non-US peers.
export function DamodaranIndustryPicker({ value, onChange }: Props) {
  const meta = useMetadata();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => meta.findIndustry(value), [meta, value]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = meta.industries;
    if (!q) return list;
    return list.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.aliases ?? []).some((a: string) => a.toLowerCase().includes(q)),
    );
  }, [meta.industries, query]);

  return (
    <div className="space-y-1">
      <label className="block text-[12px] font-medium text-forest">Damodaran industry</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded border-[1.5px] border-forest/10 bg-white px-2 py-1.5 text-left text-[12px] text-ink focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/15"
      >
        {selected ? (
          <span className="flex min-w-0 flex-1 items-baseline gap-2 truncate">
            <span className="truncate">{selected.name}</span>
            <span className="shrink-0 font-mono text-goldDark">
              βu {fmtBeta(selected.unleveredBeta)}
            </span>
          </span>
        ) : (
          <span className="text-stonePale">— pick an industry</span>
        )}
        <span className="ml-2 text-goldDark">▾</span>
      </button>

      {open && (
        <div className="rounded border border-forest/15 bg-white shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-forest/8 px-2 py-1">
            <Search size={12} className="text-stonePale" />
            <input
              autoFocus
              type="text"
              placeholder="Search industry (name or alias)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-[12px] text-ink placeholder:text-stonePale focus:outline-none"
            />
          </div>
          <div className="max-h-72 overflow-auto">
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-[11px] text-stonePale">No matches</div>
            ) : (
              filtered.map((i) => {
                const isSelected = i.name === value;
                return (
                  <button
                    key={i.name}
                    type="button"
                    onClick={() => {
                      onChange(i.name);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`flex w-full items-center gap-2 px-2 py-1 text-left text-[11.5px] ${isSelected ? 'bg-goldPale font-medium text-forest' : 'text-ink hover:bg-cream'}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{i.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-goldDark">
                      βu {fmtBeta(i.unleveredBeta)}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-stone">
                      D/E {fmtPercent(i.deRatio)}
                    </span>
                    <span className="shrink-0 font-mono text-[9.5px] text-stonePale">
                      {i.numberOfFirms} firms
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-forest/8 bg-cream px-2 py-1 text-[10px] text-stonePale">
            This industry also drives the "Industry average" D/E in Capital Structure and the
            proxy D/E fallback for international comparables.
          </div>
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface SearchableSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}

export function SearchableSelect({ label, value, onChange, options }: SearchableSelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div className="relative text-sm">
      <span className="mb-1 block text-[12px] font-medium text-forest">{label}</span>
      <button
        type="button"
        className="flex w-full items-center justify-between rounded border-[1.5px] border-forest/10 bg-white px-2 py-1.5 text-left text-sm text-ink focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/15"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{value || 'Select…'}</span>
        <ChevronDown size={13} className="text-gold" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded border border-forest/15 bg-white shadow-lg">
          <input
            autoFocus
            type="text"
            className="w-full border-b border-forest/10 px-2 py-1.5 text-sm text-ink placeholder:text-stonePale focus:outline-none"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {filtered.length === 0 && (
            <div className="px-2 py-2 text-xs text-stone">No matches</div>
          )}
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`block w-full px-2 py-1.5 text-left text-sm text-ink hover:bg-cream ${
                opt === value ? 'bg-goldPale/60 font-medium text-forest' : ''
              }`}
              onClick={() => {
                onChange(opt);
                setOpen(false);
                setQuery('');
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

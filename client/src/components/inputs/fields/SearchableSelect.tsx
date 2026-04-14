import { useMemo, useState } from 'react';

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
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <button
        type="button"
        className="flex w-full items-center justify-between rounded border border-slate-300 bg-white px-2 py-1.5 text-left text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{value || 'Select…'}</span>
        <span className="text-slate-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded border border-slate-300 bg-white shadow-lg">
          <input
            autoFocus
            type="text"
            className="w-full border-b border-slate-200 px-2 py-1.5 text-sm focus:outline-none"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {filtered.length === 0 && (
            <div className="px-2 py-2 text-xs text-slate-500">No matches</div>
          )}
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`block w-full px-2 py-1.5 text-left text-sm hover:bg-surface ${
                opt === value ? 'bg-surface font-medium' : ''
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

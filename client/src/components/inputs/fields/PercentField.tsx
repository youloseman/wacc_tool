interface PercentFieldProps {
  label: string;
  // Value is stored as a decimal (e.g. 0.25 for 25%).
  value: number | null;
  onChange: (v: number | null) => void;
  error?: string;
}

export function PercentField({ label, value, onChange, error }: PercentFieldProps) {
  const display = value == null ? '' : (value * 100).toString();
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-[12px] font-medium text-forest">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.01"
          className="w-full rounded border-[1.5px] border-forest/10 bg-white px-2 py-1.5 font-mono text-sm text-ink focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/15"
          value={display}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === '' ? null : Number(raw) / 100);
          }}
        />
        <span className="font-mono text-xs text-stone">%</span>
      </div>
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}

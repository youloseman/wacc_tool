interface NumberFieldProps {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  step?: number;
  min?: number;
  suffix?: string;
  error?: string;
}

export function NumberField({
  label,
  value,
  onChange,
  placeholder,
  step,
  min,
  suffix,
  error,
}: NumberFieldProps) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          value={value ?? ''}
          step={step}
          min={min}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === '' ? null : Number(raw));
          }}
        />
        {suffix && <span className="text-xs text-slate-500">{suffix}</span>}
      </div>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

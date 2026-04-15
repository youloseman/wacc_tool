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
      <span className="mb-1 block text-[12px] font-medium text-forest">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          className="w-full rounded border-[1.5px] border-forest/10 bg-white px-2 py-1.5 font-mono text-sm text-ink placeholder:text-stonePale focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/15"
          value={value ?? ''}
          step={step}
          min={min}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === '' ? null : Number(raw));
          }}
        />
        {suffix && <span className="font-mono text-xs text-stone">{suffix}</span>}
      </div>
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}

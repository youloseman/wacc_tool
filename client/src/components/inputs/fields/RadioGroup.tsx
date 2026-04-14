interface Option<T extends string> {
  value: T;
  label: string;
}

interface RadioGroupProps<T extends string> {
  label?: string;
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<Option<T>>;
  inline?: boolean;
}

export function RadioGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  inline,
}: RadioGroupProps<T>) {
  return (
    <div className="text-sm">
      {label && <span className="mb-1 block font-medium text-slate-700">{label}</span>}
      <div className={inline ? 'flex flex-wrap gap-3' : 'flex flex-col gap-1.5'}>
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              className="accent-navy"
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
}

export function TextField({ label, value, onChange, placeholder, id }: TextFieldProps) {
  return (
    <label className="block text-sm" htmlFor={id}>
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input
        id={id}
        type="text"
        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

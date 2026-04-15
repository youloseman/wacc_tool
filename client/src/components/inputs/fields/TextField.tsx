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
      <span className="mb-1 block text-[12px] font-medium text-forest">{label}</span>
      <input
        id={id}
        type="text"
        className="w-full rounded border-[1.5px] border-forest/10 bg-white px-2 py-1.5 text-sm text-ink placeholder:text-stonePale focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/15"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

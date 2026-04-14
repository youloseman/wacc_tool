import { useState, type ReactNode } from 'react';

interface BoundSectionProps {
  title: string;
  summary?: string;
  diff?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function BoundSection({
  title,
  summary,
  diff,
  defaultOpen = true,
  children,
}: BoundSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      className={`rounded border text-[13px] ${
        diff ? 'border-amber-300 bg-[#FFF9DB]' : 'border-slate-200 bg-white'
      }`}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between px-2.5 py-1.5 text-left font-semibold text-slate-800 hover:bg-surface"
        onClick={() => setOpen((o) => !o)}
      >
        <span>
          {title}
          {summary && (
            <span className="ml-1.5 font-normal text-slate-500">({summary})</span>
          )}
        </span>
        <span className="text-slate-400">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="space-y-2 border-t border-slate-200 p-2.5">{children}</div>}
    </section>
  );
}

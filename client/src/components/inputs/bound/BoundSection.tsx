import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

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
      className={`rounded border text-[13px] transition-colors ${
        diff ? 'border-gold/50 bg-goldPale/60' : 'border-forest/10 bg-white'
      }`}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between px-2.5 py-1.5 text-left hover:bg-cream"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-baseline gap-1.5">
          <span className="font-semibold text-forest">{title}</span>
          {summary && (
            <span className="rounded-pill bg-goldPale px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-goldDark">
              {summary}
            </span>
          )}
        </span>
        <span className="shrink-0 text-goldDark">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>
      {open && <div className="space-y-2 border-t border-forest/8 p-2.5">{children}</div>}
    </section>
  );
}

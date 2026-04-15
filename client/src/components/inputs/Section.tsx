import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
  /** Optional small uppercase eyebrow shown above the title, e.g. "SECTION 01". */
  eyebrow?: string;
}

export function Section({ title, defaultOpen = true, children, eyebrow }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-card border border-forest/10 bg-white shadow-sm">
      <button
        type="button"
        className="flex w-full items-start justify-between px-4 py-3 text-left transition-colors hover:bg-cream"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex min-w-0 flex-col">
          {eyebrow && (
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-sage">
              {eyebrow}
            </span>
          )}
          <span className="text-[13px] font-semibold text-forest">{title}</span>
        </div>
        <span className="shrink-0 text-gold">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {open && <div className="space-y-3 border-t border-forest/8 p-3">{children}</div>}
    </section>
  );
}

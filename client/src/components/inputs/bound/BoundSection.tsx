import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  EXPANDED_SECTIONS_KEY,
  RESET_EVENT,
  loadExpandedSections,
  saveExpandedSections,
} from '../../../utils/sessionState';

interface BoundSectionProps {
  title: string;
  /** Numeric/descriptive summary, e.g. "D/E: 37.59%". */
  summary?: string;
  /** Short source label shown on the right, e.g. "Damodaran", "Rating A". */
  badge?: string;
  /** True when MIN and MAX differ for this section — highlights the row in amber. */
  diff?: boolean;
  /**
   * Stable id used for localStorage-backed expand/collapse persistence.
   * Must be unique across MIN and MAX (e.g. "min.beta", "max.beta").
   */
  persistId?: string;
  /** Default collapsed when there's no persisted state. Bound sections use false. */
  defaultOpen?: boolean;
  children: ReactNode;
}

// A tiny shared store so multiple BoundSection instances write through the same in-memory map
// before flushing to localStorage. Without this each useState('open') would fight the storage
// blob and cause "last write wins" nondeterminism on fast toggles.
const expandedStore: Record<string, boolean> = loadExpandedSections();

function readPersisted(id: string | undefined, fallback: boolean): boolean {
  if (!id) return fallback;
  if (id in expandedStore) return expandedStore[id];
  return fallback;
}

function writePersisted(id: string, open: boolean) {
  expandedStore[id] = open;
  saveExpandedSections(expandedStore);
}

// React to changes in other tabs (rare but cheap).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== EXPANDED_SECTIONS_KEY || !e.newValue) return;
    try {
      const next = JSON.parse(e.newValue) as Record<string, boolean>;
      Object.keys(expandedStore).forEach((k) => delete expandedStore[k]);
      Object.assign(expandedStore, next);
    } catch {
      /* ignore */
    }
  });
}

export function BoundSection({
  title,
  summary,
  badge,
  diff,
  persistId,
  defaultOpen = false,
  children,
}: BoundSectionProps) {
  const [open, setOpen] = useState(() => readPersisted(persistId, defaultOpen));

  useEffect(() => {
    if (persistId) writePersisted(persistId, open);
  }, [open, persistId]);

  // Reset broadcast — wipes the shared in-memory map once, then collapses every section back
  // to its defaultOpen. Listener added on every BoundSection; they all see the same event.
  useEffect(() => {
    const handler = () => {
      Object.keys(expandedStore).forEach((k) => delete expandedStore[k]);
      setOpen(defaultOpen);
    };
    window.addEventListener(RESET_EVENT, handler);
    return () => window.removeEventListener(RESET_EVENT, handler);
  }, [defaultOpen]);

  return (
    <section
      className={`overflow-hidden rounded border text-[13px] transition-colors ${
        diff ? 'border-gold/50 bg-goldPale/50' : 'border-forest/10 bg-white'
      }`}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-cream"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="shrink-0 text-goldDark">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold text-forest">{title}</span>
        {summary && (
          <span className="shrink-0 rounded-pill bg-goldPale px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-goldDark">
            {summary}
          </span>
        )}
        {badge && (
          <span className="shrink-0 rounded border border-forest/10 bg-creamDeep/50 px-1.5 py-0.5 text-[10px] text-stone">
            {badge}
          </span>
        )}
      </button>
      {open && <div className="space-y-2 border-t border-forest/8 p-2.5">{children}</div>}
    </section>
  );
}

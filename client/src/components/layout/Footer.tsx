import { useMetadata } from '../../context/MetadataContext';

export function Footer() {
  const meta = useMetadata();

  const damDate = meta.industriesLastUpdated || 'Jan 2026';
  const krollDate = meta.krollLastUpdated || '4Q 2025';

  return (
    <footer className="border-t border-forest/10 bg-forestDark px-6 py-2 text-[11px] text-cream/70">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-y-1">
        <span>
          Made by{' '}
          <a
            href="https://www.linkedin.com/in/artur-podgoornyi/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-cream underline decoration-cream/30 hover:text-gold hover:decoration-gold/50"
          >
            Artur Podgoornyi
          </a>
        </span>
        <span className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px]">
          <span>
            Damodaran:{' '}
            <span className="text-cream/90">{damDate}</span>
          </span>
          <span>
            Kroll:{' '}
            <span className="text-cream/90">{krollDate}</span>
          </span>
          <span>
            FRED:{' '}
            <span className="text-cream/90">live</span>
          </span>
        </span>
      </div>
    </footer>
  );
}

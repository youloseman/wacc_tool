interface HeaderProps {
  companyName: string;
  valuationDate: string;
}

export function Header({ companyName, valuationDate }: HeaderProps) {
  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-forest/10 bg-cream px-6">
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sage">
            Confidential · Cost of Capital · 2026
          </span>
          <h1 className="font-display text-[22px] italic leading-none text-forest">
            WACC Calculator
          </h1>
        </div>
        <div className="flex items-center gap-8 text-[11px]">
          <div className="flex flex-col items-end">
            <span className="text-[9px] uppercase tracking-[0.14em] text-stonePale">
              Valuation date
            </span>
            <span className="font-mono text-stone">{valuationDate || '—'}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[9px] uppercase tracking-[0.14em] text-stonePale">
              Company
            </span>
            <span className="font-sans font-medium text-forest">{companyName || '—'}</span>
          </div>
        </div>
      </header>
      {/* Editorial gold accent divider under the header. */}
      <div className="h-px bg-gradient-to-r from-gold/40 via-gold/10 to-transparent" />
    </>
  );
}

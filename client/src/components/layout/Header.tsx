interface HeaderProps {
  companyName: string;
  valuationDate: string;
}

export function Header({ companyName, valuationDate }: HeaderProps) {
  return (
    <>
      <header className="flex h-14 items-center justify-between border-b border-forest/10 bg-cream px-4 lg:h-16 lg:px-6">
        <div className="flex flex-col">
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-sage lg:block">
            Confidential · Cost of Capital · 2026
          </span>
          <h1 className="font-display text-[18px] italic leading-none text-forest lg:text-[22px]">
            WACC Calculator
          </h1>
        </div>
        <div className="flex items-center gap-4 text-[10px] lg:gap-8 lg:text-[11px]">
          <div className="flex flex-col items-end">
            <span className="hidden text-[9px] uppercase tracking-[0.14em] text-stonePale lg:block">
              Valuation date
            </span>
            <span className="font-mono text-stone">{valuationDate || '—'}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="hidden text-[9px] uppercase tracking-[0.14em] text-stonePale lg:block">
              Company
            </span>
            <span className="font-sans font-medium text-forest">{companyName || '—'}</span>
          </div>
        </div>
      </header>
      <div className="hidden h-px bg-gradient-to-r from-gold/40 via-gold/10 to-transparent lg:block" />
    </>
  );
}

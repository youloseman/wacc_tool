interface HeaderProps {
  companyName: string;
  valuationDate: string;
}

export function Header({ companyName, valuationDate }: HeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between bg-navy px-6 text-white">
      <h1 className="text-lg font-semibold tracking-tight">WACC Calculator</h1>
      <div className="flex items-center gap-6 text-sm">
        <div>
          <span className="text-white/60">Valuation date: </span>
          <span className="font-mono">{valuationDate || '—'}</span>
        </div>
        <div>
          <span className="text-white/60">Company: </span>
          <span className="font-medium">{companyName || '—'}</span>
        </div>
      </div>
    </header>
  );
}

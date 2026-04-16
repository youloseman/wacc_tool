import { useState } from 'react';
import type { DebtEquitySource, WACCBoundInputs, WACCInputs } from '@shared/types';
import { BoundSection } from './BoundSection';
import { RadioGroup } from '../fields/RadioGroup';
import { PercentField } from '../fields/PercentField';
import { ComparablePreview } from './ComparablePreview';
import { fmtPercent } from '../../../utils/format';
import { resolveBoundForUI } from '../../../utils/resolveBoundForUI';
import { useMetadata } from '../../../context/MetadataContext';

interface Props {
  shared: WACCInputs;
  bound: WACCBoundInputs;
  onUpdate: <K extends keyof WACCBoundInputs>(k: K, v: WACCBoundInputs[K]) => void;
  diff: boolean;
  error?: string;
  persistPrefix: string;
}

const SOURCES: ReadonlyArray<{ value: DebtEquitySource; label: string }> = [
  { value: 'industry', label: 'Industry average' },
  { value: 'custom', label: 'Custom input' },
  { value: 'analogs', label: 'Company analogs' },
];

const BADGES: Record<DebtEquitySource, string> = {
  industry: 'Industry avg',
  custom: 'Custom input',
  analogs: 'Company analogs',
};

// Two UI representations for the same underlying D/E decimal. Valuation pros typically think
// in "debt share" terms (e.g. 30% debt / 70% equity); we always persist as D/E internally so
// downstream calc (Hamada relever, share-of-equity) stays unchanged.
type CapInputMode = 'de' | 'debtShare';

// debtShare s ∈ [0, 1) → D/E = s / (1 - s)
function debtShareToDe(share: number): number {
  const clamped = Math.min(Math.max(share, 0), 0.999);
  return clamped / (1 - clamped);
}

// D/E de ≥ 0 → debtShare = de / (1 + de)
function deToDebtShare(de: number): number {
  if (de < 0) return 0;
  return de / (1 + de);
}

export function BoundCapitalStructure({
  shared,
  bound,
  onUpdate,
  diff,
  error,
  persistPrefix,
}: Props) {
  const meta = useMetadata();
  const resolved = resolveBoundForUI(shared, bound, meta);
  const [mode, setMode] = useState<CapInputMode>('de');

  // Derive the value displayed in the input from the current stored D/E and the chosen mode.
  const currentDe = bound.customDeRatio;
  const displayedValue =
    mode === 'de' ? currentDe : currentDe != null ? deToDebtShare(currentDe) : null;

  const handleChange = (next: number | null) => {
    if (next == null) {
      onUpdate('customDeRatio', null);
      return;
    }
    const asDe = mode === 'de' ? next : debtShareToDe(next);
    onUpdate('customDeRatio', asDe);
  };

  // Helper text — always show BOTH interpretations so the user can see the conversion live.
  const helperText = (() => {
    if (currentDe == null) return null;
    return mode === 'de'
      ? `Debt share equivalent: ${fmtPercent(deToDebtShare(currentDe))}`
      : `D/E equivalent: ${fmtPercent(currentDe)}`;
  })();

  return (
    <BoundSection
      title="Capital Structure"
      summary={`D/E: ${fmtPercent(resolved.debtToEquity)}`}
      badge={BADGES[bound.deRatioSource]}
      diff={diff}
      persistId={`${persistPrefix}.capital`}
    >
      <RadioGroup
        value={bound.deRatioSource}
        onChange={(v) => onUpdate('deRatioSource', v)}
        options={SOURCES}
      />
      {bound.deRatioSource === 'custom' && (
        <div className="space-y-1.5 rounded border border-forest/10 bg-cream/40 p-2">
          <RadioGroup
            label="Custom capital structure"
            value={mode}
            onChange={(v) => setMode(v)}
            options={[
              { value: 'de', label: 'Enter D/E ratio' },
              { value: 'debtShare', label: 'Enter Debt share' },
            ]}
            inline
          />
          <PercentField
            label={mode === 'de' ? 'D/E ratio' : 'Debt share'}
            value={displayedValue}
            onChange={handleChange}
            error={error}
          />
          {helperText && (
            <div className="text-[10.5px] text-stone">
              <span className="text-stonePale">↳</span> {helperText}
            </div>
          )}
        </div>
      )}
      {bound.deRatioSource === 'analogs' && (
        <ComparablePreview
          tickers={bound.analogTickers}
          onTickersChange={(v) => onUpdate('analogTickers', v)}
          valuationDate={shared.valuationDate}
          metric="de"
        />
      )}
    </BoundSection>
  );
}

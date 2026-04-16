import { useEffect, useRef, useState } from 'react';
import type { DebtEquitySource, WACCBoundInputs, WACCInputs } from '@shared/types';
import { BoundSection } from './BoundSection';
import { RadioGroup } from '../fields/RadioGroup';
import { ComparablePreview } from './ComparablePreview';
import { fmtPercent } from '../../../utils/format';
import { resolveBoundForUI } from '../../../utils/resolveBoundForUI';
import { useMetadata } from '../../../context/MetadataContext';
import { RESET_EVENT } from '../../../utils/sessionState';

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

// Format a decimal as a percent string without trailing FP noise. "0.29999999999999993"
// would otherwise surface as "29.999999999999993" in the input field — here we round to 4
// decimals and trim trailing zeros so it shows cleanly as "30".
function toDisplayString(decimal: number | null): string {
  if (decimal == null || !Number.isFinite(decimal)) return '';
  const percent = decimal * 100;
  // Round to 4 dp, trim trailing zeros after the decimal point, drop the point if empty.
  return percent
    .toFixed(4)
    .replace(/\.?0+$/, '');
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

  // Global Reset: return the dual-input toggle to its default (D/E ratio) so the user sees
  // a clean initial state, not whichever view they had mid-edit.
  useEffect(() => {
    const handler = () => setMode('de');
    window.addEventListener(RESET_EVENT, handler);
    return () => window.removeEventListener(RESET_EVENT, handler);
  }, []);

  // Local input string decoupled from the stored D/E. Without this the "raw → decimal →
  // convert → decimal → raw" round-trip would replace what the user is typing with
  // FP-noise garbage (e.g. typing "3" mutates into "3.0000000000000004"). We commit to
  // the store only on blur / Enter / external change.
  const [draft, setDraft] = useState<string>(() => {
    if (bound.customDeRatio == null) return '';
    return toDisplayString(mode === 'de' ? bound.customDeRatio : deToDebtShare(bound.customDeRatio));
  });
  const focusedRef = useRef(false);

  // When the mode toggles OR the stored D/E changes externally (e.g. copy-to-MAX, reset),
  // re-sync the draft — but only while the field isn't being actively typed in.
  useEffect(() => {
    if (focusedRef.current) return;
    const next =
      bound.customDeRatio == null
        ? ''
        : toDisplayString(
            mode === 'de' ? bound.customDeRatio : deToDebtShare(bound.customDeRatio),
          );
    setDraft(next);
  }, [mode, bound.customDeRatio]);

  const commit = (raw: string) => {
    const trimmed = raw.trim().replace(',', '.');
    if (trimmed === '') {
      onUpdate('customDeRatio', null);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return; // ignore junk; draft stays as-is for editing
    const asDecimal = parsed / 100;
    const asDe = mode === 'de' ? asDecimal : debtShareToDe(asDecimal);
    onUpdate('customDeRatio', asDe);
  };

  // Helper text — always show BOTH interpretations so the user can see the conversion live.
  // Derived from the CURRENT DRAFT (not the committed value) so it updates while typing.
  const helperText = (() => {
    const trimmed = draft.trim().replace(',', '.');
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    const asDecimal = parsed / 100;
    const de = mode === 'de' ? asDecimal : debtShareToDe(asDecimal);
    return mode === 'de'
      ? `Debt share equivalent: ${fmtPercent(deToDebtShare(de))}`
      : `D/E equivalent: ${fmtPercent(de)}`;
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
          <label className="block text-sm">
            <span className="mb-1 block text-[12px] font-medium text-forest">
              {mode === 'de' ? 'D/E ratio' : 'Debt share'}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                max={mode === 'debtShare' ? 100 : undefined}
                value={draft}
                placeholder={mode === 'de' ? 'e.g. 42.86' : 'e.g. 30'}
                onFocus={() => {
                  focusedRef.current = true;
                }}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={(e) => {
                  focusedRef.current = false;
                  commit(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-full rounded border-[1.5px] border-forest/10 bg-white px-2 py-1.5 font-mono text-sm text-ink focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/15"
              />
              <span className="font-mono text-xs text-stone">%</span>
            </div>
            {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
          </label>
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

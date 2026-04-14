import type { BetaSourceSingle, WACCBoundInputs, WACCInputs } from '@shared/types';
import { BoundSection } from './BoundSection';
import { RadioGroup } from '../fields/RadioGroup';
import { TextField } from '../fields/TextField';
import { fmtBeta } from '../../../utils/format';
import { resolveBoundForUI } from '../../../utils/resolveBoundForUI';
import { useMetadata } from '../../../context/MetadataContext';
import { ComparablePreview } from './ComparablePreview';

interface Props {
  shared: WACCInputs;
  bound: WACCBoundInputs;
  onUpdate: <K extends keyof WACCBoundInputs>(k: K, v: WACCBoundInputs[K]) => void;
  diff: boolean;
}

const SOURCES: ReadonlyArray<{ value: BetaSourceSingle; label: string }> = [
  { value: 'damodaran', label: 'Damodaran' },
  { value: 'kroll', label: 'Kroll' },
  { value: 'comparables', label: 'Comparable companies' },
];

export function BoundBeta({ shared, bound, onUpdate, diff }: Props) {
  const meta = useMetadata();
  const resolved = resolveBoundForUI(shared, bound, meta);
  const industry = meta.findIndustry(shared.industry);
  const krollMissing = bound.betaSource === 'kroll' && (industry?.krollBeta ?? null) == null;
  const summary = `βu: ${fmtBeta(resolved.unleveredBeta)}${krollMissing ? ' (Kroll n/a)' : ''}`;
  return (
    <BoundSection
      title="Beta"
      summary={summary}
      diff={diff}
    >
      <RadioGroup
        value={bound.betaSource}
        onChange={(v) => onUpdate('betaSource', v)}
        options={SOURCES}
      />
      {bound.betaSource === 'comparables' && (
        <>
          <TextField
            label="Ticker symbols (manual entry)"
            value={bound.comparableTickers}
            onChange={(v) => onUpdate('comparableTickers', v)}
            placeholder="e.g. XOM, BP.L, TTE.PA, 0857.HK, 2222.SR"
          />
          <ComparablePreview
            tickers={bound.comparableTickers}
            onTickersChange={(v) => onUpdate('comparableTickers', v)}
            valuationDate={shared.valuationDate}
          />
        </>
      )}
    </BoundSection>
  );
}

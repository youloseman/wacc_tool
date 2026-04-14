import type { DebtEquitySource, WACCBoundInputs, WACCInputs } from '@shared/types';
import { BoundSection } from './BoundSection';
import { RadioGroup } from '../fields/RadioGroup';
import { NumberField } from '../fields/NumberField';
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
}

const SOURCES: ReadonlyArray<{ value: DebtEquitySource; label: string }> = [
  { value: 'industry', label: 'Industry average' },
  { value: 'custom', label: 'Custom input' },
  { value: 'analogs', label: 'Company analogs' },
];

export function BoundCapitalStructure({ shared, bound, onUpdate, diff, error }: Props) {
  const meta = useMetadata();
  const resolved = resolveBoundForUI(shared, bound, meta);
  return (
    <BoundSection
      title="Capital Structure"
      summary={`D/E: ${fmtPercent(resolved.debtToEquity)}`}
      diff={diff}
    >
      <RadioGroup
        value={bound.deRatioSource}
        onChange={(v) => onUpdate('deRatioSource', v)}
        options={SOURCES}
      />
      {bound.deRatioSource === 'custom' && (
        <NumberField
          label="D/E ratio (decimal)"
          value={bound.customDeRatio}
          onChange={(v) => onUpdate('customDeRatio', v)}
          step={0.01}
          min={0}
          placeholder="e.g. 0.35"
          error={error}
        />
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

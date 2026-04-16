import type { TaxRateSource, WACCBoundInputs, WACCInputs } from '@shared/types';
import { BoundSection } from './BoundSection';
import { RadioGroup } from '../fields/RadioGroup';
import { PercentField } from '../fields/PercentField';
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

const SOURCES: ReadonlyArray<{ value: TaxRateSource; label: string }> = [
  { value: 'damodaran', label: 'Damodaran (by country)' },
  { value: 'custom', label: 'Custom' },
];

const BADGES: Record<TaxRateSource, string> = {
  damodaran: 'Damodaran',
  custom: 'Custom',
};

export function BoundTaxRate({ shared, bound, onUpdate, diff, error, persistPrefix }: Props) {
  const meta = useMetadata();
  const resolved = resolveBoundForUI(shared, bound, meta);
  return (
    <BoundSection
      title="Tax Rate"
      summary={`Tax: ${fmtPercent(resolved.taxRate)}`}
      badge={BADGES[bound.taxRateSource]}
      diff={diff}
      persistId={`${persistPrefix}.tax`}
    >
      <RadioGroup
        value={bound.taxRateSource}
        onChange={(v) => onUpdate('taxRateSource', v)}
        options={SOURCES}
      />
      {bound.taxRateSource === 'custom' && (
        <PercentField
          label="Tax rate"
          value={bound.customTaxRate}
          onChange={(v) => onUpdate('customTaxRate', v)}
          error={error}
        />
      )}
    </BoundSection>
  );
}

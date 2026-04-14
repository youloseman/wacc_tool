import type { ErpSource, WACCBoundInputs, WACCInputs } from '@shared/types';
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
}

const SOURCES: ReadonlyArray<{ value: ErpSource; label: string }> = [
  { value: 'damodaran', label: 'Damodaran' },
  { value: 'kroll', label: 'Kroll' },
  { value: 'custom', label: 'Custom' },
];

export function BoundErp({ shared, bound, onUpdate, diff, error }: Props) {
  const meta = useMetadata();
  const resolved = resolveBoundForUI(shared, bound, meta);
  return (
    <BoundSection
      title="Equity Risk Premium"
      summary={`ERP: ${fmtPercent(resolved.equityRiskPremium)}`}
      diff={diff}
    >
      <RadioGroup
        value={bound.erpSource}
        onChange={(v) => onUpdate('erpSource', v)}
        options={SOURCES}
      />
      {bound.erpSource === 'custom' && (
        <PercentField
          label="ERP"
          value={bound.customErp}
          onChange={(v) => onUpdate('customErp', v)}
          error={error}
        />
      )}
    </BoundSection>
  );
}

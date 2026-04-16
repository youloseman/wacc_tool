import type { WACCBoundInputs, WACCInputs } from '@shared/types';
import type { BoundKey, FormErrors } from '../../hooks/useWaccForm';
import { GeneralParametersSection } from './GeneralParametersSection';
import { BoundColumn } from './bound/BoundColumn';

interface Props {
  inputs: WACCInputs;
  updateShared: <K extends keyof WACCInputs>(key: K, value: WACCInputs[K]) => void;
  updateBound: <K extends keyof WACCBoundInputs>(
    bound: BoundKey,
    key: K,
    value: WACCBoundInputs[K],
  ) => void;
  copyBound: (from: BoundKey, to: BoundKey) => void;
  errors: FormErrors;
}

// Live-recalc flow: every edit dispatches a debounced /api/calculate via useWaccResult.
// The Calculate button is gone; the result panel on the right is always the current truth.
export function InputForm({ inputs, updateShared, updateBound, copyBound, errors }: Props) {
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
      <GeneralParametersSection inputs={inputs} update={updateShared} />

      <div className="flex flex-col gap-3 lg:flex-row">
        <BoundColumn
          kind="min"
          shared={inputs}
          bound={inputs.minBound}
          other={inputs.maxBound}
          onUpdate={(k, v) => updateBound('minBound', k, v)}
          onCopyToOther={() => copyBound('minBound', 'maxBound')}
          errors={errors.minBound}
        />
        <BoundColumn
          kind="max"
          shared={inputs}
          bound={inputs.maxBound}
          other={inputs.minBound}
          onUpdate={(k, v) => updateBound('maxBound', k, v)}
          onCopyToOther={() => copyBound('maxBound', 'minBound')}
          errors={errors.maxBound}
        />
      </div>
    </form>
  );
}

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
  isValid: boolean;
  loading: boolean;
  onCalculate: () => void;
}

export function InputForm({
  inputs,
  updateShared,
  updateBound,
  copyBound,
  errors,
  isValid,
  loading,
  onCalculate,
}: Props) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (isValid) onCalculate();
      }}
    >
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

      <button
        type="submit"
        disabled={!isValid || loading}
        className="w-full rounded bg-gold px-4 py-2.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-forest shadow-gold transition-colors hover:bg-goldLight disabled:cursor-not-allowed disabled:bg-creamDeep disabled:text-stone disabled:shadow-none"
      >
        {loading ? 'Calculating…' : 'Calculate WACC'}
      </button>
    </form>
  );
}

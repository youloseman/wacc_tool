import type { WACCBoundInputs, WACCInputs } from '@shared/types';
import { BoundCapitalStructure } from './BoundCapitalStructure';
import { BoundBeta } from './BoundBeta';
import { BoundErp } from './BoundErp';
import { BoundCostOfDebt } from './BoundCostOfDebt';
import { BoundTaxRate } from './BoundTaxRate';
import { BoundPremiums } from './BoundPremiums';

export type BoundKind = 'min' | 'max';

interface Props {
  kind: BoundKind;
  shared: WACCInputs;
  bound: WACCBoundInputs;
  other: WACCBoundInputs;
  onUpdate: <K extends keyof WACCBoundInputs>(k: K, v: WACCBoundInputs[K]) => void;
  onCopyToOther: () => void;
  errors?: Partial<Record<keyof WACCBoundInputs, string>>;
}

// Per-group diff: we consider a group "diff" when any relevant field differs.
function capitalStructureDiff(a: WACCBoundInputs, b: WACCBoundInputs): boolean {
  return (
    a.deRatioSource !== b.deRatioSource ||
    a.customDeRatio !== b.customDeRatio ||
    a.analogTickers !== b.analogTickers
  );
}

function betaDiff(a: WACCBoundInputs, b: WACCBoundInputs): boolean {
  return a.betaSource !== b.betaSource || a.comparableTickers !== b.comparableTickers;
}

function erpDiff(a: WACCBoundInputs, b: WACCBoundInputs): boolean {
  return a.erpSource !== b.erpSource || a.customErp !== b.customErp;
}

function codDiff(a: WACCBoundInputs, b: WACCBoundInputs): boolean {
  return (
    a.costOfDebtMethod !== b.costOfDebtMethod ||
    a.ebit !== b.ebit ||
    a.interestExpense !== b.interestExpense ||
    a.creditRating !== b.creditRating ||
    a.directCostOfDebt !== b.directCostOfDebt
  );
}

function taxDiff(a: WACCBoundInputs, b: WACCBoundInputs): boolean {
  return a.taxRateSource !== b.taxRateSource || a.customTaxRate !== b.customTaxRate;
}

function premiumsDiff(a: WACCBoundInputs, b: WACCBoundInputs): boolean {
  return (
    a.sizePremiumOverride !== b.sizePremiumOverride ||
    a.countryRiskPremiumOverride !== b.countryRiskPremiumOverride ||
    a.currencyRiskPremium !== b.currencyRiskPremium ||
    a.specificRiskPremium !== b.specificRiskPremium
  );
}

export function BoundColumn({
  kind,
  shared,
  bound,
  other,
  onUpdate,
  onCopyToOther,
  errors,
}: Props) {
  const isMin = kind === 'min';
  const borderColor = isMin ? 'border-l-[#10B981]' : 'border-l-[#3B82F6]';
  const title = isMin ? 'Lower Bound (MIN)' : 'Upper Bound (MAX)';
  const copyLabel = isMin ? 'Copy to MAX →' : '← Copy to MIN';

  return (
    <div
      className={`flex min-w-0 flex-1 flex-col gap-2 rounded border-l-4 ${borderColor} bg-surface p-2`}
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <h3 className="text-[13px] font-semibold text-slate-800">{title}</h3>
        <button
          type="button"
          onClick={onCopyToOther}
          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-white"
        >
          {copyLabel}
        </button>
      </div>

      <BoundCapitalStructure
        shared={shared}
        bound={bound}
        onUpdate={onUpdate}
        diff={capitalStructureDiff(bound, other)}
        error={errors?.customDeRatio}
      />
      <BoundBeta
        shared={shared}
        bound={bound}
        onUpdate={onUpdate}
        diff={betaDiff(bound, other)}
      />
      <BoundErp
        shared={shared}
        bound={bound}
        onUpdate={onUpdate}
        diff={erpDiff(bound, other)}
        error={errors?.customErp}
      />
      <BoundCostOfDebt
        shared={shared}
        bound={bound}
        onUpdate={onUpdate}
        diff={codDiff(bound, other)}
        errors={errors}
      />
      <BoundTaxRate
        shared={shared}
        bound={bound}
        onUpdate={onUpdate}
        diff={taxDiff(bound, other)}
        error={errors?.customTaxRate}
      />
      <BoundPremiums
        shared={shared}
        bound={bound}
        onUpdate={onUpdate}
        diff={premiumsDiff(bound, other)}
      />
    </div>
  );
}

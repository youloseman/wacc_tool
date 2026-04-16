import { useEffect } from 'react';
import type {
  CostOfDebtMethod,
  CreditRating,
  WACCBoundInputs,
  WACCInputs,
} from '@shared/types';
import { calculateICR, mapICRtoRating } from '@shared/wacc';
import { CREDIT_RATINGS } from '../../../data/ratings';
import { BoundSection } from './BoundSection';
import { NumberField } from '../fields/NumberField';
import { PercentField } from '../fields/PercentField';
import { fmtPercent } from '../../../utils/format';
import { resolveBoundForUI } from '../../../utils/resolveBoundForUI';
import { useMetadata } from '../../../context/MetadataContext';

interface Props {
  shared: WACCInputs;
  bound: WACCBoundInputs;
  onUpdate: <K extends keyof WACCBoundInputs>(k: K, v: WACCBoundInputs[K]) => void;
  diff: boolean;
  errors?: Partial<Record<keyof WACCBoundInputs, string>>;
  persistPrefix: string;
}

const TABS: ReadonlyArray<{ value: CostOfDebtMethod; label: string }> = [
  { value: 'icr', label: 'ICR' },
  { value: 'rating', label: 'Rating' },
  { value: 'direct', label: 'Direct' },
];

const BADGES: Record<CostOfDebtMethod, string> = {
  icr: 'ICR coverage',
  rating: 'Credit rating',
  direct: 'Direct input',
};

export function BoundCostOfDebt({ shared, bound, onUpdate, diff, errors, persistPrefix }: Props) {
  const meta = useMetadata();
  const resolved = resolveBoundForUI(shared, bound, meta);
  const em = meta.getEMRate(shared.countryOperations);
  const isLocal = shared.waccMethodology === 'local_currency' && em != null;
  const suggestedCoD = em != null ? em.centralBankRate + 0.03 : null;

  // Auto-switch to Direct Input with suggested rate when entering local-EM mode and the current
  // method is still the USD-based rating/ICR approach.
  useEffect(() => {
    if (!isLocal || suggestedCoD == null) return;
    if (bound.costOfDebtMethod !== 'direct' || bound.directCostOfDebt == null) {
      onUpdate('costOfDebtMethod', 'direct');
      onUpdate('directCostOfDebt', suggestedCoD);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocal, shared.countryOperations]);

  const icr =
    bound.ebit != null && bound.interestExpense != null && bound.interestExpense > 0
      ? calculateICR(bound.ebit, bound.interestExpense)
      : null;
  const impliedRating = icr != null ? mapICRtoRating(icr).rating : null;

  const showEmWarning = isLocal && bound.costOfDebtMethod !== 'direct';
  const showUsdRateWarning =
    isLocal && bound.costOfDebtMethod !== 'direct' && resolved.costOfDebtPreTax < 0.1;

  const ratingBadge =
    bound.costOfDebtMethod === 'rating' && bound.creditRating
      ? `Rating ${bound.creditRating}`
      : BADGES[bound.costOfDebtMethod];

  return (
    <BoundSection
      title="Cost of Debt"
      summary={`Kd: ${fmtPercent(resolved.costOfDebtPreTax)}`}
      badge={ratingBadge}
      diff={diff}
      persistId={`${persistPrefix}.cod`}
    >
      {showEmWarning && em && (
        <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          ⚠ For {shared.countryOperations}, cost of debt should reflect local borrowing rates. CB
          rate: <span className="font-mono">{fmtPercent(em.centralBankRate)}</span>. Suggested:{' '}
          <span className="font-mono">
            ~{fmtPercent(em.centralBankRate + 0.03)}
          </span>{' '}
          (CB + ~3%).
        </div>
      )}
      {showUsdRateWarning && (
        <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] text-red-700">
          This CoD ({fmtPercent(resolved.costOfDebtPreTax)}) uses USD rates — unrealistic for
          local-currency debt. Switch to "Direct".
        </div>
      )}

      <div className="flex rounded border border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            className={`flex-1 px-2 py-1 text-[12px] ${
              bound.costOfDebtMethod === t.value
                ? 'bg-navy text-white'
                : 'bg-white text-slate-700 hover:bg-surface'
            }`}
            onClick={() => onUpdate('costOfDebtMethod', t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {bound.costOfDebtMethod === 'icr' && (
        <div className="space-y-2">
          <NumberField
            label="EBIT"
            value={bound.ebit}
            onChange={(v) => onUpdate('ebit', v)}
            placeholder="e.g. 1000"
            error={errors?.ebit}
          />
          <NumberField
            label="Interest expense"
            value={bound.interestExpense}
            onChange={(v) => onUpdate('interestExpense', v)}
            min={0}
            placeholder="e.g. 250"
            error={errors?.interestExpense}
          />
          <div className="rounded bg-surface px-2 py-1 text-[11px] text-slate-600">
            ICR:{' '}
            <span className="font-mono">
              {icr == null ? '—' : Number.isFinite(icr) ? icr.toFixed(2) : '∞'}
            </span>{' '}
            · <span className="font-mono">{impliedRating ?? '—'}</span>
          </div>
        </div>
      )}

      {bound.costOfDebtMethod === 'rating' && (
        <label className="block text-[12px]">
          <span className="mb-1 block font-medium text-slate-700">Credit rating</span>
          <select
            className="w-full rounded border border-slate-300 px-2 py-1 text-[12px] focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            value={bound.creditRating ?? ''}
            onChange={(e) =>
              onUpdate('creditRating', (e.target.value || null) as CreditRating | null)
            }
          >
            {CREDIT_RATINGS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {errors?.creditRating && (
            <span className="mt-1 block text-[11px] text-red-600">{errors.creditRating}</span>
          )}
        </label>
      )}

      {bound.costOfDebtMethod === 'direct' && (
        <>
          <PercentField
            label="Cost of Debt (pre-tax)"
            value={bound.directCostOfDebt}
            onChange={(v) => onUpdate('directCostOfDebt', v)}
            error={errors?.directCostOfDebt}
          />
          {isLocal && em && suggestedCoD != null && (
            <p className="text-[11px] text-slate-500">
              Suggested for {shared.countryOperations}:{' '}
              <button
                type="button"
                className="font-mono underline decoration-dotted hover:text-slate-800"
                onClick={() => onUpdate('directCostOfDebt', suggestedCoD)}
              >
                {fmtPercent(suggestedCoD)}
              </button>{' '}
              (CB {fmtPercent(em.centralBankRate)} + ~3%)
            </p>
          )}
        </>
      )}
    </BoundSection>
  );
}

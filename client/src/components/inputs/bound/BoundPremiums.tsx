import type { WACCBoundInputs, WACCInputs } from '@shared/types';
import { BoundSection } from './BoundSection';
import { PercentField } from '../fields/PercentField';
import { fmtPercent } from '../../../utils/format';
import { useMetadata } from '../../../context/MetadataContext';

interface Props {
  shared: WACCInputs;
  bound: WACCBoundInputs;
  onUpdate: <K extends keyof WACCBoundInputs>(k: K, v: WACCBoundInputs[K]) => void;
  diff: boolean;
  persistPrefix: string;
}

export function BoundPremiums({ shared, bound, onUpdate, diff, persistPrefix }: Props) {
  const meta = useMetadata();
  const sizeDefault = meta.krollSizePremiums[shared.companySize]?.premium ?? 0;
  const country = meta.findCountry(shared.countryOperations);
  const countryDefault = country?.countryRiskPremium ?? 0;
  const isLocal =
    shared.waccMethodology === 'local_currency' && meta.getEMRate(shared.countryOperations) != null;
  const size = bound.sizePremiumOverride ?? sizeDefault;
  const crp = isLocal ? 0 : (bound.countryRiskPremiumOverride ?? countryDefault);
  const summary = `Size: ${fmtPercent(size)} · CRP: ${fmtPercent(crp)}`;
  const badge = isLocal ? 'Kroll · CRP embedded' : 'Kroll · Damodaran';
  return (
    <BoundSection
      title="Additional Premiums"
      summary={summary}
      badge={badge}
      diff={diff}
      persistId={`${persistPrefix}.premiums`}
    >
      <PercentField
        label={`Size premium (Kroll default: ${fmtPercent(sizeDefault)})`}
        value={bound.sizePremiumOverride}
        onChange={(v) => onUpdate('sizePremiumOverride', v)}
      />
      {isLocal ? (
        <div className="rounded bg-surface px-2 py-1 text-[11px] text-slate-500">
          Country risk premium:{' '}
          <span className="font-mono">0.00%</span> — embedded in local-currency Rf.
        </div>
      ) : (
        <PercentField
          label={`Country risk premium (Damodaran default: ${fmtPercent(countryDefault)})`}
          value={bound.countryRiskPremiumOverride}
          onChange={(v) => onUpdate('countryRiskPremiumOverride', v)}
        />
      )}
      <PercentField
        label="Currency risk premium"
        value={bound.currencyRiskPremium}
        onChange={(v) => onUpdate('currencyRiskPremium', v ?? 0)}
      />
      <PercentField
        label="Specific risk premium"
        value={bound.specificRiskPremium}
        onChange={(v) => onUpdate('specificRiskPremium', v ?? 0)}
      />
    </BoundSection>
  );
}

import { useEffect, useMemo } from 'react';
import type { CompanySize, Currency, WACCInputs, WACCMethodology } from '@shared/types';
import { Section } from './Section';
import { TextField } from './fields/TextField';
import { SearchableSelect } from './fields/SearchableSelect';
import { RadioGroup } from './fields/RadioGroup';
import { useMetadata } from '../../context/MetadataContext';
import { useRiskFreeRate } from '../../hooks/useRiskFreeRate';
import { fmtBeta, fmtPercent } from '../../utils/format';

interface Props {
  inputs: WACCInputs;
  update: <K extends keyof WACCInputs>(key: K, value: WACCInputs[K]) => void;
}

const CURRENCIES: ReadonlyArray<{ value: Currency; label: string }> = [
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
  { value: 'CHF', label: 'CHF' },
];

const METHODOLOGIES: ReadonlyArray<{ value: WACCMethodology; label: string }> = [
  { value: 'hard_currency', label: 'Hard currency (USD/EUR/GBP)' },
  { value: 'local_currency', label: 'Local currency' },
];

const SIZES: ReadonlyArray<{ value: CompanySize; label: string }> = [
  { value: 'large', label: 'Large' },
  { value: 'mid', label: 'Mid' },
  { value: 'small', label: 'Small' },
  { value: 'micro', label: 'Micro' },
];

export function GeneralParametersSection({ inputs, update }: Props) {
  const meta = useMetadata();
  const rf = useRiskFreeRate(inputs.currency, inputs.countryOperations, inputs.waccMethodology);
  const industryNames = useMemo(() => meta.industries.map((i) => i.name), [meta.industries]);
  const countryNames = useMemo(() => meta.countries.map((c) => c.name), [meta.countries]);
  const industry = meta.findIndustry(inputs.industry);
  const country = meta.findCountry(inputs.countryOperations);
  const em = meta.getEMRate(inputs.countryOperations);

  // Auto-switch methodology when the user changes country of operations.
  // Developed → hard_currency; EM with local data → local_currency.
  useEffect(() => {
    if (meta.loading) return;
    const desired: WACCMethodology = meta.isDevelopedCountry(inputs.countryOperations)
      ? 'hard_currency'
      : 'local_currency';
    if (desired !== inputs.waccMethodology) {
      update('waccMethodology', desired);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs.countryOperations, meta.loading]);

  const isLocal = inputs.waccMethodology === 'local_currency';
  const effectiveCurrency = isLocal && em ? em.currency : inputs.currency;

  return (
    <Section title="General Parameters">
      <TextField
        label="Company / CGU name"
        value={inputs.companyName}
        onChange={(v) => update('companyName', v)}
        placeholder="e.g. Acme Corp."
      />
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Valuation date</span>
        <input
          type="date"
          className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          value={inputs.valuationDate}
          onChange={(e) => update('valuationDate', e.target.value)}
        />
      </label>

      {isLocal ? (
        <div className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Currency</span>
          <div className="rounded border border-slate-200 bg-surface px-2 py-1.5 font-mono text-sm text-slate-700">
            {effectiveCurrency}{' '}
            <span className="text-[11px] font-normal text-slate-500">
              (auto-detected from country)
            </span>
          </div>
        </div>
      ) : (
        <RadioGroup
          label="Currency"
          value={inputs.currency}
          onChange={(v) => update('currency', v)}
          options={CURRENCIES}
          inline
        />
      )}

      <RadioGroup
        label="WACC methodology"
        value={inputs.waccMethodology}
        onChange={(v) => update('waccMethodology', v)}
        options={METHODOLOGIES}
      />

      <div className="rounded bg-surface px-2 py-1 text-[11px] text-slate-600">
        {rf.loading
          ? 'Loading current rates…'
          : rf.data
            ? `Rf (${effectiveCurrency}, 10Y): ${fmtPercent(rf.data.rate)} as of ${rf.data.date} · ${rf.data.source}${rf.data.isStatic ? ' · static snapshot' : ''}${rf.data.fallback ? ' (fallback)' : ''}`
            : 'Rf unavailable'}
      </div>

      <SearchableSelect
        label="Country (HQ)"
        value={inputs.countryHQ}
        onChange={(v) => update('countryHQ', v)}
        options={countryNames}
      />
      <SearchableSelect
        label="Country of operations"
        value={inputs.countryOperations}
        onChange={(v) => update('countryOperations', v)}
        options={countryNames}
      />
      {country && (
        <div className="rounded bg-surface px-2 py-1 text-[11px] text-slate-600">
          {isLocal ? (
            <>CRP: <span className="font-mono">0.00%</span> (embedded in Rf) · Tax:{' '}
            <span className="font-mono">{fmtPercent(country.marginalTaxRate ?? 0)}</span></>
          ) : (
            <>CRP: <span className="font-mono">{fmtPercent(country.countryRiskPremium)}</span> · Tax:{' '}
            <span className="font-mono">{fmtPercent(country.marginalTaxRate ?? 0)}</span> · Moody's:{' '}
            {country.moodysRating}</>
          )}
        </div>
      )}

      <SearchableSelect
        label="Industry"
        value={inputs.industry}
        onChange={(v) => update('industry', v)}
        options={industryNames}
      />
      {industry && (
        <div className="rounded bg-surface px-2 py-1 text-[11px] text-slate-600">
          Damodaran βu: <span className="font-mono">{fmtBeta(industry.unleveredBeta)}</span> · D/E:{' '}
          <span className="font-mono">{fmtPercent(industry.deRatio)}</span> · firms:{' '}
          <span className="font-mono">{industry.numberOfFirms}</span>
          {industry.krollBeta != null && (
            <>
              {' · '}Kroll βu: <span className="font-mono">{fmtBeta(industry.krollBeta)}</span>
            </>
          )}
        </div>
      )}
      <RadioGroup
        label="Company size"
        value={inputs.companySize}
        onChange={(v) => update('companySize', v)}
        options={SIZES}
        inline
      />
    </Section>
  );
}

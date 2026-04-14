import { useCallback, useMemo, useState } from 'react';
import type { WACCBoundInputs, WACCInputs } from '@shared/types';

const today = (): string => new Date().toISOString().slice(0, 10);

export const DEFAULT_BOUND: WACCBoundInputs = {
  deRatioSource: 'industry',
  customDeRatio: null,
  analogTickers: '',
  betaSource: 'damodaran',
  comparableTickers: '',
  erpSource: 'damodaran',
  customErp: null,
  costOfDebtMethod: 'rating',
  ebit: null,
  interestExpense: null,
  creditRating: 'A',
  directCostOfDebt: null,
  taxRateSource: 'damodaran',
  customTaxRate: null,
  sizePremiumOverride: null,
  countryRiskPremiumOverride: null,
  currencyRiskPremium: 0,
  specificRiskPremium: 0,
};

export const INITIAL_INPUTS: WACCInputs = {
  companyName: '',
  valuationDate: today(),
  currency: 'USD',
  waccMethodology: 'hard_currency',
  countryHQ: 'United States',
  countryOperations: 'United States',
  industry: 'Oil/Gas (Production and Exploration)',
  companySize: 'large',
  minBound: { ...DEFAULT_BOUND },
  // Default MAX diverges on beta source to illustrate a real range.
  maxBound: { ...DEFAULT_BOUND, betaSource: 'kroll', erpSource: 'kroll' },
};

export type BoundKey = 'minBound' | 'maxBound';

export interface FormErrors {
  minBound?: Partial<Record<keyof WACCBoundInputs, string>>;
  maxBound?: Partial<Record<keyof WACCBoundInputs, string>>;
}

function validateBound(b: WACCBoundInputs): Partial<Record<keyof WACCBoundInputs, string>> {
  const e: Partial<Record<keyof WACCBoundInputs, string>> = {};
  if (b.deRatioSource === 'custom' && b.customDeRatio == null) {
    e.customDeRatio = 'Enter a D/E ratio.';
  }
  if (b.erpSource === 'custom' && b.customErp == null) {
    e.customErp = 'Enter ERP.';
  }
  if (b.taxRateSource === 'custom' && b.customTaxRate == null) {
    e.customTaxRate = 'Enter tax rate.';
  }
  if (b.costOfDebtMethod === 'icr') {
    if (b.ebit == null) e.ebit = 'Enter EBIT.';
    if (b.interestExpense == null || b.interestExpense <= 0) {
      e.interestExpense = 'Enter positive interest.';
    }
  }
  if (b.costOfDebtMethod === 'rating' && !b.creditRating) {
    e.creditRating = 'Select rating.';
  }
  if (b.costOfDebtMethod === 'direct' && b.directCostOfDebt == null) {
    e.directCostOfDebt = 'Enter cost of debt.';
  }
  return e;
}

export function useWaccForm() {
  const [inputs, setInputs] = useState<WACCInputs>(INITIAL_INPUTS);

  const updateShared = useCallback(
    <K extends keyof WACCInputs>(key: K, value: WACCInputs[K]) => {
      setInputs((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const updateBound = useCallback(
    <K extends keyof WACCBoundInputs>(
      bound: BoundKey,
      key: K,
      value: WACCBoundInputs[K],
    ) => {
      setInputs((prev) => ({
        ...prev,
        [bound]: { ...prev[bound], [key]: value },
      }));
    },
    [],
  );

  const copyBound = useCallback((from: BoundKey, to: BoundKey) => {
    setInputs((prev) => ({ ...prev, [to]: { ...prev[from] } }));
  }, []);

  const errors = useMemo<FormErrors>(() => {
    const minErrs = validateBound(inputs.minBound);
    const maxErrs = validateBound(inputs.maxBound);
    const result: FormErrors = {};
    if (Object.keys(minErrs).length) result.minBound = minErrs;
    if (Object.keys(maxErrs).length) result.maxBound = maxErrs;
    return result;
  }, [inputs]);

  const isValid = !errors.minBound && !errors.maxBound;

  return { inputs, updateShared, updateBound, copyBound, errors, isValid };
}

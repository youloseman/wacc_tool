import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WACCBoundInputs, WACCInputs } from '@shared/types';
import { loadInitialState, saveToLocalStorage } from '../utils/sessionState';

const today = (): string => new Date().toISOString().slice(0, 10);

export const DEFAULT_BOUND: WACCBoundInputs = {
  damodaranIndustry: 'Computers/Peripherals',
  deRatioSource: 'industry',
  customDeRatio: null,
  analogTickers: '',
  betaSource: 'damodaran',
  comparableTickers: '',
  krollSectorGics: null,
  krollCapStructGics: null,
  erpSource: 'damodaran',
  customErp: null,
  costOfDebtMethod: 'rating',
  ebit: null,
  interestExpense: null,
  creditRating: 'AA',
  directCostOfDebt: null,
  taxRateSource: 'damodaran',
  customTaxRate: null,
  sizePremiumOverride: null,
  countryRiskPremiumOverride: null,
  currencyRiskPremium: 0,
  specificRiskPremium: 0,
};

export const INITIAL_INPUTS: WACCInputs = {
  companyName: 'Apple',
  valuationDate: '2025-12-31',
  currency: 'USD',
  waccMethodology: 'hard_currency',
  countryHQ: 'United States',
  countryOperations: 'United States',
  companySize: 'large',
  // MIN: fully Damodaran (industry D/E + industry beta + Damodaran ERP). CRP=0 for US.
  minBound: {
    ...DEFAULT_BOUND,
    deRatioSource: 'industry',
    betaSource: 'damodaran',
    erpSource: 'damodaran',
    krollSectorGics: '4520',
    countryRiskPremiumOverride: 0,
  },
  // MAX: fully Kroll (Kroll D/E + Kroll beta + Kroll ERP). Clean provider comparison.
  maxBound: {
    ...DEFAULT_BOUND,
    deRatioSource: 'kroll',
    betaSource: 'kroll',
    erpSource: 'kroll',
    krollSectorGics: '4520',
    krollCapStructGics: '4520',
    countryRiskPremiumOverride: 0,
  },
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

export interface UseWaccFormApi {
  inputs: WACCInputs;
  updateShared: <K extends keyof WACCInputs>(key: K, value: WACCInputs[K]) => void;
  updateBound: <K extends keyof WACCBoundInputs>(
    bound: BoundKey,
    key: K,
    value: WACCBoundInputs[K],
  ) => void;
  copyBound: (from: BoundKey, to: BoundKey) => void;
  reset: () => void;
  replaceAll: (next: WACCInputs) => void;
  errors: FormErrors;
  isValid: boolean;
  initialSource: 'hash' | 'storage' | 'default';
}

export function useWaccForm(): UseWaccFormApi {
  // On mount, priority: URL hash → localStorage → defaults. See sessionState.loadInitialState.
  const [{ state: initial, source: initialSource }] = useState(() => {
    const { state, source } = loadInitialState();
    return { state: state ?? INITIAL_INPUTS, source };
  });
  const [inputs, setInputs] = useState<WACCInputs>(initial);

  // Auto-save on every input change (debounced by 300ms). Private-browsing safe.
  useEffect(() => {
    const t = setTimeout(() => saveToLocalStorage(inputs), 300);
    return () => clearTimeout(t);
  }, [inputs]);

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

  const reset = useCallback(() => {
    setInputs({ ...INITIAL_INPUTS, valuationDate: today() });
  }, []);

  const replaceAll = useCallback((next: WACCInputs) => {
    setInputs(next);
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

  return { inputs, updateShared, updateBound, copyBound, reset, replaceAll, errors, isValid, initialSource };
}

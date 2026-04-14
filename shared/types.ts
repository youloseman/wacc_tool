export type Currency = 'USD' | 'EUR' | 'GBP' | 'CHF';

export type WACCMethodology = 'hard_currency' | 'local_currency';

export type CompanySize = 'large' | 'mid' | 'small' | 'micro';

export type BetaSourceSingle = 'damodaran' | 'kroll' | 'comparables';

export type DebtEquitySource = 'industry' | 'custom' | 'analogs';

export type ErpSource = 'damodaran' | 'kroll' | 'custom';

export type CostOfDebtMethod = 'icr' | 'rating' | 'direct';

export type TaxRateSource = 'damodaran' | 'custom';

export type CreditRating =
  | 'AAA'
  | 'AA+'
  | 'AA'
  | 'AA-'
  | 'A+'
  | 'A'
  | 'A-'
  | 'BBB+'
  | 'BBB'
  | 'BBB-'
  | 'BB+'
  | 'BB'
  | 'B+'
  | 'B'
  | 'B-'
  | 'CCC'
  | 'CC'
  | 'C'
  | 'D';

export interface WACCBoundInputs {
  deRatioSource: DebtEquitySource;
  customDeRatio: number | null;
  analogTickers: string;

  betaSource: BetaSourceSingle;
  comparableTickers: string;

  erpSource: ErpSource;
  customErp: number | null;

  costOfDebtMethod: CostOfDebtMethod;
  ebit: number | null;
  interestExpense: number | null;
  creditRating: CreditRating | null;
  directCostOfDebt: number | null;

  taxRateSource: TaxRateSource;
  customTaxRate: number | null;

  sizePremiumOverride: number | null;
  countryRiskPremiumOverride: number | null;
  currencyRiskPremium: number;
  specificRiskPremium: number;
}

export interface WACCInputs {
  companyName: string;
  valuationDate: string;
  currency: Currency;
  waccMethodology: WACCMethodology;
  countryHQ: string;
  countryOperations: string;
  industry: string;
  companySize: CompanySize;

  minBound: WACCBoundInputs;
  maxBound: WACCBoundInputs;
}

export interface BetaWindow {
  label: 'VAL YR' | 'YR-1' | 'YR-2';
  startDate: string;
  endDate: string;
  beta: number;
  alpha: number;
  rSquared: number;
  standardError: number;
  tStatistic: number;
  isSignificant: boolean;
  observations: number;
}

export type BetaStability = 'stable' | 'moderate' | 'unstable';

export interface BetaAnalysis {
  period: '5Y' | '3Y';
  frequency: 'Monthly';
  benchmark: string;
  windows: BetaWindow[];
  averageBeta: number;
  averageRSquared: number;
  significantCount: number;
  totalWindows: number;
  stability: BetaStability;
  stabilityRange: number;
  stabilityNote: string;
}

export type BetaMethod = 'calculated-5Y' | 'calculated-3Y' | 'fmp-provider';

export type ResultSource =
  | 'FRED'
  | 'Damodaran'
  | 'Kroll'
  | 'Comparables'
  | 'Calculation'
  | 'User input';

export type RowHighlight = 'purple' | 'darkPurple';

export interface WACCResultRow {
  component: string;
  min: number | null;
  max: number | null;
  format: 'percent' | 'beta' | 'ratio';
  description: string;
  sourceMin: string;
  sourceMax: string;
  isBold?: boolean;
  isSubtotal?: boolean;
  highlight?: RowHighlight;
}

export interface WACCResult {
  rows: WACCResultRow[];
  currency: string;
  valuationDate: string;
  companyName: string;
  methodology: WACCMethodology;
  effectiveCurrency: string;
}

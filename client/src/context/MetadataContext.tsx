import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface IndustryMeta {
  name: string;
  aliases: string[];
  region: string;
  unleveredBeta: number;
  leveredBeta: number;
  deRatio: number;
  effectiveTaxRate: number;
  numberOfFirms: number;
  krollBeta: number | null;
}

export interface CountryMeta {
  name: string;
  region: string;
  moodysRating: string;
  countryRiskPremium: number;
  equityRiskPremium: number;
  marginalTaxRate: number | null;
  effectiveTaxRate: number | null;
}

export interface EMRateMeta {
  currency: string;
  rate10Y: number;
  rateSource: string;
  sourceUrl: string;
  asOfDate: string;
  centralBankRate: number;
}

export interface MetadataBundle {
  loading: boolean;
  error: string | null;
  industries: IndustryMeta[];
  countries: CountryMeta[];
  matureMarketERP: number;
  krollERP: number;
  krollSizePremiums: Record<string, { premium: number; description: string }>;
  industriesLastUpdated: string;
  countriesLastUpdated: string;
  krollLastUpdated: string;
  emRates: Record<string, EMRateMeta>;
  emLastUpdated: string;
  developedCountries: Set<string>;
  findIndustry(name: string): IndustryMeta | null;
  findCountry(name: string): CountryMeta | null;
  getEMRate(country: string): EMRateMeta | null;
  isDevelopedCountry(country: string): boolean;
}

const MetadataContext = createContext<MetadataBundle | null>(null);

const EMPTY: MetadataBundle = {
  loading: true,
  error: null,
  industries: [],
  countries: [],
  matureMarketERP: 0.0472,
  krollERP: 0.06,
  krollSizePremiums: {},
  industriesLastUpdated: '',
  countriesLastUpdated: '',
  krollLastUpdated: '',
  emRates: {},
  emLastUpdated: '',
  developedCountries: new Set(),
  findIndustry: () => null,
  findCountry: () => null,
  getEMRate: () => null,
  isDevelopedCountry: () => true,
};

type RawState = Omit<MetadataBundle, 'findIndustry' | 'findCountry' | 'getEMRate' | 'isDevelopedCountry'>;

export function MetadataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RawState>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [indRes, ctyRes, metaRes] = await Promise.all([
          fetch('/api/industries'),
          fetch('/api/countries'),
          fetch('/api/metadata'),
        ]);
        if (!indRes.ok || !ctyRes.ok || !metaRes.ok) throw new Error('metadata fetch failed');
        const [indJson, ctyJson, metaJson] = await Promise.all([
          indRes.json(),
          ctyRes.json(),
          metaRes.json(),
        ]);
        if (cancelled) return;
        setState({
          loading: false,
          error: null,
          industries: indJson.industries,
          countries: ctyJson.countries,
          matureMarketERP: metaJson.matureMarketERP,
          krollERP: metaJson.krollERP,
          krollSizePremiums: metaJson.krollSizePremiums,
          industriesLastUpdated: metaJson.industriesLastUpdated,
          countriesLastUpdated: metaJson.countriesLastUpdated,
          krollLastUpdated: metaJson.krollLastUpdated,
          emRates: metaJson.emRates ?? {},
          emLastUpdated: metaJson.emLastUpdated ?? '',
          developedCountries: new Set<string>(metaJson.developedCountries ?? []),
        });
      } catch (err) {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load metadata',
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<MetadataBundle>(() => {
    const industryMap = new Map<string, IndustryMeta>();
    for (const ind of state.industries) {
      industryMap.set(ind.name.toLowerCase(), ind);
      for (const a of ind.aliases) industryMap.set(a.toLowerCase(), ind);
    }
    const countryMap = new Map<string, CountryMeta>();
    for (const c of state.countries) countryMap.set(c.name.toLowerCase(), c);
    const emMap = new Map<string, EMRateMeta>();
    for (const [name, rate] of Object.entries(state.emRates)) {
      emMap.set(name.toLowerCase(), rate);
    }
    const developedLower = new Set<string>();
    state.developedCountries.forEach((c) => developedLower.add(c.toLowerCase()));
    return {
      ...state,
      findIndustry: (name) => industryMap.get(name.trim().toLowerCase()) ?? null,
      findCountry: (name) => countryMap.get(name.trim().toLowerCase()) ?? null,
      getEMRate: (name) => emMap.get(name.trim().toLowerCase()) ?? null,
      isDevelopedCountry: (name) => developedLower.has(name.trim().toLowerCase()),
    };
  }, [state]);

  return <MetadataContext.Provider value={value}>{children}</MetadataContext.Provider>;
}

export function useMetadata(): MetadataBundle {
  const ctx = useContext(MetadataContext);
  if (!ctx) throw new Error('useMetadata must be used inside MetadataProvider');
  return ctx;
}

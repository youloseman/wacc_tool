import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'damodaran');

export interface DamodaranIndustry {
  name: string;
  aliases: string[];
  region?: string;
  numberOfFirms: number;
  unleveredBeta: number;
  leveredBeta: number;
  deRatio: number;
  effectiveTaxRate: number;
  cashFirmValue?: number;
  unleveredBetaCorrected?: number;
  // Europe overlay, if available on a per-industry basis (legacy — now in separate snapshots).
  europe?: {
    numberOfFirms: number;
    unleveredBeta: number;
    leveredBeta: number;
    deRatio: number;
    effectiveTaxRate: number;
  };
}

export interface IndustrySnapshot {
  asOf: string;
  region: 'US' | 'Europe' | 'Global' | 'Emerging';
  source?: string;
  industries: DamodaranIndustry[];
}

interface IndustriesFile {
  lastUpdated: string;
  source: string;
  sourceUrl: string;
  snapshots: IndustrySnapshot[];
  europeSnapshots: IndustrySnapshot[];
  globalSnapshots: IndustrySnapshot[];
  emergSnapshots: IndustrySnapshot[];
}

export interface DamodaranCountry {
  name: string;
  region: string;
  moodysRating: string;
  countryDefaultSpread: number;
  equityRiskPremium: number;
  countryRiskPremium: number;
}

export interface CountrySnapshot {
  asOf: string;
  source?: string;
  matureMarketERP: number;
  countries: DamodaranCountry[];
}

interface CountryRiskFile {
  lastUpdated: string;
  source: string;
  sourceUrl: string;
  snapshots: CountrySnapshot[];
}

export interface DamodaranTaxRate {
  name: string;
  marginalTaxRate: number;
  effectiveTaxRate: number;
}

export interface TaxSnapshot {
  asOf: string;
  source?: string;
  countries: DamodaranTaxRate[];
}

export interface IndustryTaxSnapshot {
  asOf: string;
  source?: string;
  industries: { name: string; effectiveTaxRate: number }[];
}

interface TaxRatesFile {
  lastUpdated: string;
  source: string;
  snapshots: TaxSnapshot[];
  industrySnapshots: IndustryTaxSnapshot[];
}

export interface IcrRatingRow {
  icrMin: number;
  icrMax: number;
  rating: string;
  spread: number;
}

interface IcrRatingFile {
  lastUpdated: string;
  source: string;
  sourceUrl: string;
  large: IcrRatingRow[];
  small: IcrRatingRow[];
}

function readJson<T>(file: string): T {
  const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
  return JSON.parse(raw) as T;
}

const industriesFile = readJson<IndustriesFile>('damodaran-industries.json');
const countryRiskFile = readJson<CountryRiskFile>('damodaran-country-risk.json');
const taxRatesFile = readJson<TaxRatesFile>('damodaran-tax-rates.json');
const icrRatingFile = readJson<IcrRatingFile>('damodaran-icr-rating.json');

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// Snap to latest snapshot with asOf <= valuationDate. If none match (valuationDate is
// earlier than every snapshot), fall back to the earliest — better stale data than nothing.
// Shared pattern across Damodaran snapshots, Kroll quarters, EM rates, and FRED Rf.
function snapToSnapshot<T extends { asOf: string }>(snapshots: T[], valuationDate: string): T | null {
  if (snapshots.length === 0) return null;
  const sorted = [...snapshots].sort((a, b) => a.asOf.localeCompare(b.asOf));
  const eligible = sorted.filter((s) => s.asOf <= valuationDate);
  if (eligible.length > 0) return eligible[eligible.length - 1];
  return sorted[0];
}

// ---------- Industries (with Europe overlay behavior preserved) ----------

// The current industries.json has three separate snapshot arrays: US / Europe / Global / Emerg.
// For the dropdown / list endpoints we want the latest US snapshot merged with the latest
// Europe overlay (attached under `europe` field) + any Europe-only industries appended, to
// match the old flat shape. Snapshot-aware lookups use the individual snapshots.

const latestUsSnapshot = industriesFile.snapshots[industriesFile.snapshots.length - 1];
const latestEuropeSnapshot = industriesFile.europeSnapshots[industriesFile.europeSnapshots.length - 1];

function buildFlatLatestList(): DamodaranIndustry[] {
  const out: DamodaranIndustry[] = latestUsSnapshot
    ? latestUsSnapshot.industries.map((i) => ({ ...i, region: 'US' }))
    : [];
  if (!latestEuropeSnapshot) return out;
  const euByName = new Map(latestEuropeSnapshot.industries.map((i) => [norm(i.name), i]));
  for (const ind of out) {
    const e = euByName.get(norm(ind.name));
    if (e) {
      ind.europe = {
        numberOfFirms: e.numberOfFirms,
        unleveredBeta: e.unleveredBeta,
        leveredBeta: e.leveredBeta,
        deRatio: e.deRatio,
        effectiveTaxRate: e.effectiveTaxRate,
      };
      euByName.delete(norm(ind.name));
    }
  }
  // Europe-only rows: append with "(Europe)" suffix, same as legacy behavior.
  for (const e of euByName.values()) {
    out.push({
      name: `${e.name} (Europe)`,
      aliases: [e.name],
      region: 'Europe',
      numberOfFirms: e.numberOfFirms,
      unleveredBeta: e.unleveredBeta,
      leveredBeta: e.leveredBeta,
      deRatio: e.deRatio,
      effectiveTaxRate: e.effectiveTaxRate,
    });
  }
  return out;
}

const flatLatestIndustries: DamodaranIndustry[] = buildFlatLatestList();

export function getDamodaranIndustries(): DamodaranIndustry[] {
  return flatLatestIndustries;
}

export function getIndustriesLastUpdated(): string {
  return industriesFile.lastUpdated;
}

// List of asOf dates across all regions — for UI tooltips + /api/metadata.
export function getIndustrySnapshots(): { asOf: string; region: string }[] {
  return [
    ...industriesFile.snapshots.map((s) => ({ asOf: s.asOf, region: 'US' as string })),
    ...industriesFile.europeSnapshots.map((s) => ({ asOf: s.asOf, region: 'Europe' })),
    ...industriesFile.globalSnapshots.map((s) => ({ asOf: s.asOf, region: 'Global' })),
    ...industriesFile.emergSnapshots.map((s) => ({ asOf: s.asOf, region: 'Emerging' })),
  ];
}

// Legacy-compatible latest-only lookup (used by list endpoints, UI previews, etc).
export function findIndustry(name: string): DamodaranIndustry | null {
  const target = norm(name);
  for (const ind of flatLatestIndustries) {
    if (norm(ind.name) === target) return ind;
    if (ind.aliases.some((a) => norm(a) === target)) return ind;
  }
  return null;
}

// Time-aware lookup: returns the industry row matching the snapshot on-or-before valuationDate.
// `region` selects which snapshot series (default US). Falls back to name match within the
// chosen snapshot, then to the latest snapshot for that region if the chosen one lacks the
// industry (can happen when Damodaran renames industries year over year).
export function findIndustryForDate(
  name: string,
  valuationDate: string,
  region: 'US' | 'Europe' | 'Global' | 'Emerging' = 'US',
): { industry: DamodaranIndustry; asOf: string } | null {
  const series =
    region === 'Europe'
      ? industriesFile.europeSnapshots
      : region === 'Global'
        ? industriesFile.globalSnapshots
        : region === 'Emerging'
          ? industriesFile.emergSnapshots
          : industriesFile.snapshots;
  const snapshot = snapToSnapshot(series, valuationDate);
  if (!snapshot) return null;
  const target = norm(name);
  const hit =
    snapshot.industries.find((i) => norm(i.name) === target) ??
    snapshot.industries.find((i) => i.aliases.some((a) => norm(a) === target));
  if (hit) return { industry: hit, asOf: snapshot.asOf };
  return null;
}

// ---------- Country risk ----------

const latestCountrySnapshot = countryRiskFile.snapshots[countryRiskFile.snapshots.length - 1];

export function getDamodaranCountries(): DamodaranCountry[] {
  return latestCountrySnapshot?.countries ?? [];
}

export function getMatureMarketERP(): number {
  return latestCountrySnapshot?.matureMarketERP ?? 0.0423;
}

export function getCountryRiskLastUpdated(): string {
  return countryRiskFile.lastUpdated;
}

export function getCountryRiskSnapshots(): { asOf: string }[] {
  return countryRiskFile.snapshots.map((s) => ({ asOf: s.asOf }));
}

export function findCountryRisk(name: string): DamodaranCountry | null {
  const target = norm(name);
  return latestCountrySnapshot?.countries.find((c) => norm(c.name) === target) ?? null;
}

export function findCountryRiskForDate(
  name: string,
  valuationDate: string,
): { country: DamodaranCountry; asOf: string; matureMarketERP: number } | null {
  const snapshot = snapToSnapshot(countryRiskFile.snapshots, valuationDate);
  if (!snapshot) return null;
  const target = norm(name);
  const hit = snapshot.countries.find((c) => norm(c.name) === target);
  if (!hit) return null;
  return { country: hit, asOf: snapshot.asOf, matureMarketERP: snapshot.matureMarketERP };
}

// ---------- Corporate tax rates ----------

const latestTaxSnapshot = taxRatesFile.snapshots[taxRatesFile.snapshots.length - 1];

export function findCountryTax(name: string): DamodaranTaxRate | null {
  const target = norm(name);
  return latestTaxSnapshot?.countries.find((c) => norm(c.name) === target) ?? null;
}

export function findCountryTaxForDate(
  name: string,
  valuationDate: string,
): { tax: DamodaranTaxRate; asOf: string } | null {
  const snapshot = snapToSnapshot(taxRatesFile.snapshots, valuationDate);
  if (!snapshot) return null;
  const target = norm(name);
  const hit = snapshot.countries.find((c) => norm(c.name) === target);
  if (!hit) return null;
  return { tax: hit, asOf: snapshot.asOf };
}

export function getDamodaranTaxRates(): DamodaranTaxRate[] {
  return latestTaxSnapshot?.countries ?? [];
}

// Industry-specific effective tax (from taxrateGlobal). Used when taxRateSource = 'damodaran-industry'.
export function findIndustryTaxForDate(
  industryName: string,
  valuationDate: string,
): { effectiveTaxRate: number; asOf: string } | null {
  const snapshot = snapToSnapshot(taxRatesFile.industrySnapshots ?? [], valuationDate);
  if (!snapshot) return null;
  const target = norm(industryName);
  const hit = snapshot.industries.find((i) => norm(i.name) === target);
  if (!hit) return null;
  return { effectiveTaxRate: hit.effectiveTaxRate, asOf: snapshot.asOf };
}

// ---------- ICR rating table (unchanged, no historical variant) ----------

export function getIcrRatingTable(bucket: 'large' | 'small' = 'large'): IcrRatingRow[] {
  return icrRatingFile[bucket];
}

export function mapIcrToRatingFromFile(
  icr: number,
  bucket: 'large' | 'small' = 'large',
): { rating: string; spread: number } {
  const table = icrRatingFile[bucket];
  for (const row of table) {
    if (icr >= row.icrMin && icr <= row.icrMax) {
      return { rating: row.rating, spread: row.spread };
    }
  }
  const last = table[table.length - 1];
  return { rating: last.rating, spread: last.spread };
}

// Shared snap util — exported for tests.
export { snapToSnapshot };

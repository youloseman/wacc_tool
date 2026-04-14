import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'damodaran');

export interface DamodaranIndustry {
  name: string;
  aliases: string[];
  region: string;
  numberOfFirms: number;
  unleveredBeta: number;
  leveredBeta: number;
  deRatio: number;
  effectiveTaxRate: number;
}

interface IndustriesFile {
  lastUpdated: string;
  source: string;
  sourceUrl: string;
  industries: DamodaranIndustry[];
}

export interface DamodaranCountry {
  name: string;
  region: string;
  moodysRating: string;
  countryDefaultSpread: number;
  equityRiskPremium: number;
  countryRiskPremium: number;
}

interface CountryRiskFile {
  lastUpdated: string;
  source: string;
  sourceUrl: string;
  matureMarketERP: number;
  countries: DamodaranCountry[];
}

export interface DamodaranTaxRate {
  name: string;
  marginalTaxRate: number;
  effectiveTaxRate: number;
}

interface TaxRatesFile {
  lastUpdated: string;
  source: string;
  countries: DamodaranTaxRate[];
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
// bump 2026-01-05 (alias reshuffle)

const industriesFile = readJson<IndustriesFile>('damodaran-industries.json');
const countryRiskFile = readJson<CountryRiskFile>('damodaran-country-risk.json');
const taxRatesFile = readJson<TaxRatesFile>('damodaran-tax-rates.json');
const icrRatingFile = readJson<IcrRatingFile>('damodaran-icr-rating.json');

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function getDamodaranIndustries(): DamodaranIndustry[] {
  return industriesFile.industries;
}

export function getIndustriesLastUpdated(): string {
  return industriesFile.lastUpdated;
}

export function findIndustry(name: string): DamodaranIndustry | null {
  const target = norm(name);
  for (const ind of industriesFile.industries) {
    if (norm(ind.name) === target) return ind;
    if (ind.aliases.some((a) => norm(a) === target)) return ind;
  }
  return null;
}

export function getDamodaranCountries(): DamodaranCountry[] {
  return countryRiskFile.countries;
}

export function getMatureMarketERP(): number {
  return countryRiskFile.matureMarketERP;
}

export function getCountryRiskLastUpdated(): string {
  return countryRiskFile.lastUpdated;
}

export function findCountryRisk(name: string): DamodaranCountry | null {
  const target = norm(name);
  return countryRiskFile.countries.find((c) => norm(c.name) === target) ?? null;
}

export function findCountryTax(name: string): DamodaranTaxRate | null {
  const target = norm(name);
  return taxRatesFile.countries.find((c) => norm(c.name) === target) ?? null;
}

export function getDamodaranTaxRates(): DamodaranTaxRate[] {
  return taxRatesFile.countries;
}

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

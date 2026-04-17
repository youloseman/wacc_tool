import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'em-risk-free-rates.json');

export interface EMQuarter {
  date: string; // YYYY-MM-DD end-of-quarter
  rate: number; // decimal, e.g. 0.1444 = 14.44%
}

export interface EMCountry {
  currency: string;
  instrument: string;
  source?: string;
  centralBankRate: number | null;
  quarters: EMQuarter[];
}

interface EMFile {
  lastUpdated: string;
  source: string;
  countries: Record<string, EMCountry>;
}

// Backward-compat shape for legacy callers that expected a single-rate snapshot.
export interface EMRate {
  currency: string;
  rate10Y: number;
  rateSource: string;
  sourceUrl: string;
  asOfDate: string;
  centralBankRate: number;
}

const emFile: EMFile = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function findCountryKey(country: string): string | null {
  if (!country) return null;
  const target = norm(country);
  return Object.keys(emFile.countries).find((k) => norm(k) === target) ?? null;
}

export interface EMRateLookup {
  rate: number;
  date: string; // YYYY-MM-DD of the quarter used
  quarter: string; // e.g. "Q3 2024"
  currency: string;
  instrument: string;
  centralBankRate: number | null;
  country: string;
}

function quarterLabel(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number);
  const q = Math.ceil(m / 3);
  return `Q${q} ${y}`;
}

// Time-dependent lookup: snaps to the nearest quarter ≤ valuationDate. If the date is before
// the first quarter, returns the earliest quarter. If after the last, returns the latest.
export function getEMRiskFreeRate(country: string, valuationDate: string): EMRateLookup | null {
  const key = findCountryKey(country);
  if (!key) return null;
  const entry = emFile.countries[key];
  if (!entry.quarters || entry.quarters.length === 0) return null;

  const sortedAsc = [...entry.quarters].sort((a, b) => a.date.localeCompare(b.date));
  let picked: EMQuarter = sortedAsc[0];
  for (const q of sortedAsc) {
    if (q.date <= valuationDate) picked = q;
  }
  // If valuationDate is before all quarters, `picked` is still the earliest — that's the fallback.

  return {
    rate: picked.rate,
    date: picked.date,
    quarter: quarterLabel(picked.date),
    currency: entry.currency,
    instrument: entry.instrument,
    centralBankRate: entry.centralBankRate,
    country: key,
  };
}

// Back-compat: return the latest quarter as a flat EMRate snapshot. Used where callers can't
// thread a valuationDate (e.g. client metadata preview). Prefer getEMRiskFreeRate elsewhere.
export function getEMRate(country: string): EMRate | null {
  const key = findCountryKey(country);
  if (!key) return null;
  const entry = emFile.countries[key];
  if (!entry.quarters || entry.quarters.length === 0) return null;
  const latest = [...entry.quarters].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!;
  return {
    currency: entry.currency,
    rate10Y: latest.rate,
    rateSource: entry.instrument,
    sourceUrl: entry.source ?? '',
    asOfDate: latest.date,
    centralBankRate: entry.centralBankRate ?? 0,
  };
}

export function getEMCountries(): string[] {
  return Object.keys(emFile.countries);
}

export function getEMData(): EMFile {
  return emFile;
}

export function getEMLastUpdated(): string {
  return emFile.lastUpdated;
}

// Set of countries where we default to "hard currency" approach (FRED). Everything else → EM.
export const DEVELOPED_COUNTRIES = new Set([
  'United States',
  'United Kingdom',
  'Germany',
  'France',
  'Netherlands',
  'Switzerland',
  'Sweden',
  'Norway',
  'Denmark',
  'Finland',
  'Austria',
  'Canada',
  'Australia',
  'New Zealand',
  'Japan',
  'Singapore',
  'Hong Kong',
  'Ireland',
  'Belgium',
  'Luxembourg',
]);

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'em-risk-free-rates.json');

export interface EMRate {
  currency: string;
  rate10Y: number;
  rateSource: string;
  sourceUrl: string;
  asOfDate: string;
  centralBankRate: number;
}

interface EMFile {
  lastUpdated: string;
  source: string;
  rates: Record<string, EMRate>;
}

const emFile: EMFile = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

export function getEMRate(country: string): EMRate | null {
  if (!country) return null;
  // Case-insensitive lookup.
  const key = Object.keys(emFile.rates).find((k) => k.toLowerCase() === country.trim().toLowerCase());
  return key ? emFile.rates[key] : null;
}

export function getEMCountries(): string[] {
  return Object.keys(emFile.rates);
}

export function getEMData(): EMFile {
  return emFile;
}

// Set of countries where we default to "hard currency" approach. Everything else → local currency.
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

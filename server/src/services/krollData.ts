import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'kroll');

export interface KrollIndustryBeta {
  industry: string;
  fullInformationBeta: number;
  numberOfCompanies: number;
}

export interface KrollSizePremiumEntry {
  premium: number;
  description: string;
}

interface KrollFile {
  lastUpdated: string;
  source: string;
  sourceUrl: string;
  equityRiskPremium: { recommended: number; description: string };
  sizePremiums: Record<string, KrollSizePremiumEntry>;
  industryBetas: KrollIndustryBeta[];
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8')) as T;
}

const krollFile = readJson<KrollFile>('kroll-data.json');

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function getKrollERP(): number {
  return krollFile.equityRiskPremium.recommended;
}

export function getKrollLastUpdated(): string {
  return krollFile.lastUpdated;
}

export function getKrollSizePremium(size: string): number {
  const entry = krollFile.sizePremiums[size];
  return entry ? entry.premium : 0;
}

export function getKrollSizePremiumMap(): Record<string, KrollSizePremiumEntry> {
  return krollFile.sizePremiums;
}

export function findKrollIndustryBeta(industryName: string): number | null {
  const target = norm(industryName);
  const entry = krollFile.industryBetas.find((b) => norm(b.industry) === target);
  return entry ? entry.fullInformationBeta : null;
}

export function getKrollIndustryBetas(): KrollIndustryBeta[] {
  return krollFile.industryBetas;
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'kroll');

export type GicsLevel = 'sector' | 'industryGroup' | 'industry' | 'subIndustry' | 'other';

export interface KrollQuarter {
  date: string; // YYYY-MM-DD end-of-quarter
  label: string; // e.g. "4Q 2025"
  debtToCapital: number | null;
  debtToEquity: number | null;
  unleveredBeta: number | null;
}

export interface KrollIndustry {
  gicsCode: string;
  gicsLevel: GicsLevel;
  parentCode: string | null;
  name: string;
  path: string; // "Energy › Oil, Gas & Consumable Fuels" for UI breadcrumb
  quarters: KrollQuarter[];
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
  periods: { label: string; date: string }[];
  industries: KrollIndustry[];
}

// Legacy industry-mapping file — keeps the old "Damodaran-industry-name → Kroll GICS code"
// association for users who haven't picked a Kroll sector explicitly.
interface LegacyMapping {
  [damodaranName: string]: { krollName?: string; krollGics?: string; krollBeta?: number };
}

const krollFile = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'kroll-data.json'), 'utf-8')) as KrollFile;
const legacyMapping = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'industry-mapping.json'), 'utf-8')) as LegacyMapping;
  } catch {
    return {} as LegacyMapping;
  }
})();

const byCode = new Map(krollFile.industries.map((i) => [i.gicsCode, i]));
const byNameLower = new Map(krollFile.industries.map((i) => [i.name.trim().toLowerCase(), i]));

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

export function getKrollPeriods(): { label: string; date: string }[] {
  return krollFile.periods;
}

export function getKrollIndustries(): KrollIndustry[] {
  return krollFile.industries;
}

export function findKrollByGics(gicsCode: string): KrollIndustry | null {
  return byCode.get(gicsCode.trim()) ?? null;
}

// Pick the Kroll industry most likely to match a Damodaran-style name. Tries the explicit
// legacy mapping first (hand-curated pairings + a couple of β snapshots), then a case-
// insensitive name match against the full GICS tree.
export function findKrollByDamodaranName(damodaranName: string): KrollIndustry | null {
  const mapped = legacyMapping[damodaranName];
  if (mapped?.krollGics) {
    const byGics = findKrollByGics(mapped.krollGics);
    if (byGics) return byGics;
  }
  if (mapped?.krollName) {
    const byName = byNameLower.get(norm(mapped.krollName));
    if (byName) return byName;
  }
  // Fallback: direct case-insensitive name match.
  return byNameLower.get(norm(damodaranName)) ?? null;
}

// Find the quarter closest to (but not after) the valuation date. If valuationDate is earlier
// than the first quarter, returns the earliest quarter. Always prefers a non-null β over null.
export function findNearestQuarter(
  industry: KrollIndustry,
  valuationDate: string,
): KrollQuarter | null {
  const quartersDesc = [...industry.quarters]
    .filter((q) => q.unleveredBeta != null)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (quartersDesc.length === 0) return null;
  // Prefer the latest quarter whose date ≤ valuationDate.
  for (const q of quartersDesc) {
    if (q.date <= valuationDate) return q;
  }
  // Valuation date is before all quarters — return the earliest we have (oldest with data).
  return quartersDesc[quartersDesc.length - 1];
}

export interface KrollBetaLookup {
  beta: number;
  debtToEquity: number | null;
  quarterLabel: string;
  quarterDate: string;
  gicsCode: string;
  industryName: string;
  industryPath: string;
}

// Primary lookup used by waccComposer. Resolution order:
//   1. If `krollSector` (GICS code) was explicitly chosen by the user → exact match.
//   2. Otherwise fall back to the Damodaran industry name via the legacy mapping.
// Then pick the nearest quarter on or before `valuationDate`.
export function lookupKrollBeta(args: {
  krollSector: string | null | undefined;
  damodaranIndustry: string;
  valuationDate: string;
}): KrollBetaLookup | null {
  const ind = args.krollSector
    ? findKrollByGics(args.krollSector)
    : findKrollByDamodaranName(args.damodaranIndustry);
  if (!ind) return null;
  const q = findNearestQuarter(ind, args.valuationDate);
  if (!q || q.unleveredBeta == null) return null;
  return {
    beta: q.unleveredBeta,
    debtToEquity: q.debtToEquity,
    quarterLabel: q.label,
    quarterDate: q.date,
    gicsCode: ind.gicsCode,
    industryName: ind.name,
    industryPath: ind.path,
  };
}

// Back-compat exports — kept so existing call sites in routes/waccComposer keep compiling
// until they're migrated to lookupKrollBeta().
export interface KrollIndustryBeta {
  industry: string;
  fullInformationBeta: number;
  numberOfCompanies: number;
}

export function findKrollIndustryBeta(industryName: string): number | null {
  const ind = findKrollByDamodaranName(industryName);
  if (!ind) return null;
  // Use the latest non-null β for back-compat callers that don't pass a valuation date.
  const q = findNearestQuarter(ind, '9999-12-31');
  return q?.unleveredBeta ?? null;
}

export function getKrollIndustryBetas(): KrollIndustryBeta[] {
  // Emit one entry per Kroll industry with its latest β — used by the /api/industries merge.
  return krollFile.industries
    .map((i) => {
      const q = findNearestQuarter(i, '9999-12-31');
      return q?.unleveredBeta != null
        ? { industry: i.name, fullInformationBeta: q.unleveredBeta, numberOfCompanies: 0 }
        : null;
    })
    .filter((x): x is KrollIndustryBeta => x != null);
}

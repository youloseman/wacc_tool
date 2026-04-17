import { describe, expect, it } from 'vitest';
import { lookupKrollBeta } from './krollData.ts';

// Tests use GICS 10102020 "Oil & Gas Exploration & Production" which has data from 3Q 2020
// through 4Q 2025 in the current Kroll dataset. The exact beta values come from the parsed
// Kroll/Betas.xlsx and may shift if the source file is updated — the tests assert structural
// properties (non-null, date snap logic, range bounds) rather than exact values.

describe('lookupKrollBeta', () => {
  const GICS_OIL_EP = '10102020';
  const DAM_OIL_EP = 'Oil & Gas Exploration & Production';

  it('returns correct quarter for exact end-of-quarter date', () => {
    const r = lookupKrollBeta({
      krollSector: GICS_OIL_EP,
      damodaranIndustry: DAM_OIL_EP,
      valuationDate: '2025-12-31',
    });
    expect(r).not.toBeNull();
    expect(r!.quarterLabel).toContain('4Q 2025');
    expect(r!.beta).toBeGreaterThan(0);
  });

  it('snaps to last completed quarter for mid-quarter date', () => {
    // 2023-08-15 is mid-Q3 2023. The latest quarter ending ≤ 2023-08-15 is 2Q 2023 (2023-06-30).
    const r = lookupKrollBeta({
      krollSector: GICS_OIL_EP,
      damodaranIndustry: DAM_OIL_EP,
      valuationDate: '2023-08-15',
    });
    expect(r).not.toBeNull();
    expect(r!.quarterLabel).toContain('2Q 2023');
  });

  it('returns earliest quarter when date is before the series', () => {
    const r = lookupKrollBeta({
      krollSector: GICS_OIL_EP,
      damodaranIndustry: DAM_OIL_EP,
      valuationDate: '2019-06-30',
    });
    expect(r).not.toBeNull();
    // Should be the very first quarter with data — 3Q 2020 or whichever is earliest.
    expect(r!.quarterDate <= '2021-01-01').toBe(true);
  });

  it('returns last quarter when date is after the series', () => {
    const r = lookupKrollBeta({
      krollSector: GICS_OIL_EP,
      damodaranIndustry: DAM_OIL_EP,
      valuationDate: '2027-01-15',
    });
    expect(r).not.toBeNull();
    expect(r!.quarterLabel).toContain('4Q 2025');
  });

  it('falls back to Damodaran name match when krollSector is null', () => {
    const r = lookupKrollBeta({
      krollSector: null,
      damodaranIndustry: 'Oil, Gas & Consumable Fuels',
      valuationDate: '2025-06-30',
    });
    // "Oil, Gas & Consumable Fuels" exists as GICS 101020 in the Kroll dataset.
    expect(r).not.toBeNull();
    expect(r!.beta).toBeGreaterThan(0);
  });

  it('returns null for non-existent GICS code and unknown industry', () => {
    const r = lookupKrollBeta({
      krollSector: '99999999',
      damodaranIndustry: 'Nonexistent Industry XYZ',
      valuationDate: '2025-06-30',
    });
    expect(r).toBeNull();
  });

  it('treats undefined krollSector same as null', () => {
    const r = lookupKrollBeta({
      krollSector: undefined,
      damodaranIndustry: 'Nonexistent Industry XYZ',
      valuationDate: '2025-06-30',
    });
    expect(r).toBeNull();
  });

  it('snaps to previous quarter on first day of a new quarter', () => {
    // 2024-01-01 is the first day of Q1 2024. The last quarter ending ≤ 2024-01-01 is
    // 4Q 2023 (2023-12-31), NOT 1Q 2024 (2024-03-31 which is after).
    const r = lookupKrollBeta({
      krollSector: GICS_OIL_EP,
      damodaranIndustry: DAM_OIL_EP,
      valuationDate: '2024-01-01',
    });
    expect(r).not.toBeNull();
    expect(r!.quarterLabel).toContain('4Q 2023');
  });

  it('returns beta within plausible range (regression guard)', () => {
    const r = lookupKrollBeta({
      krollSector: GICS_OIL_EP,
      damodaranIndustry: DAM_OIL_EP,
      valuationDate: '2025-06-30',
    });
    expect(r).not.toBeNull();
    expect(r!.beta).toBeGreaterThanOrEqual(0.1);
    expect(r!.beta).toBeLessThanOrEqual(3.0);
    if (r!.debtToEquity != null) {
      expect(r!.debtToEquity).toBeGreaterThanOrEqual(0);
    }
  });
});

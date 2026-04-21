import { describe, expect, it } from 'vitest';
import {
  findCountryRiskForDate,
  findCountryTaxForDate,
  findIndustryForDate,
  snapToSnapshot,
} from './damodaranData.ts';

describe('snapToSnapshot', () => {
  const snaps = [
    { asOf: '2022-12-31', value: 'A' },
    { asOf: '2023-12-31', value: 'B' },
    { asOf: '2024-12-31', value: 'C' },
  ];

  it('picks latest snapshot ≤ date', () => {
    expect(snapToSnapshot(snaps, '2024-06-15')?.value).toBe('B');
    expect(snapToSnapshot(snaps, '2025-01-01')?.value).toBe('C');
  });

  it('on exact snapshot date returns that snapshot', () => {
    expect(snapToSnapshot(snaps, '2023-12-31')?.value).toBe('B');
  });

  it('before all snapshots returns earliest (fallback)', () => {
    expect(snapToSnapshot(snaps, '2019-01-01')?.value).toBe('A');
  });

  it('empty array returns null', () => {
    expect(snapToSnapshot([], '2024-01-01')).toBeNull();
  });
});

describe('findIndustryForDate', () => {
  it('snaps to latest US snapshot on or before date', () => {
    // Available US snapshots: 2023-12-31, 2024-12-31, 2025-12-31.
    // For valuationDate 2025-06-30: latest ≤ date is 2024-12-31.
    const r = findIndustryForDate('Computers/Peripherals', '2025-06-30', 'US');
    expect(r).not.toBeNull();
    expect(r?.asOf).toBe('2024-12-31');
    expect(r?.industry.unleveredBeta).toBeGreaterThan(0.5);
    expect(r?.industry.unleveredBeta).toBeLessThan(2.5);
  });

  it('before all snapshots → fallback to earliest', () => {
    // valuationDate 2020-06-30 is before all snapshots → returns earliest (2023-12-31).
    const r = findIndustryForDate('Computers/Peripherals', '2020-06-30', 'US');
    expect(r).not.toBeNull();
    expect(r?.asOf).toBe('2023-12-31');
  });

  it('current date picks the latest available snapshot', () => {
    const r = findIndustryForDate('Computers/Peripherals', '2026-01-01', 'US');
    expect(r).not.toBeNull();
    // latest available US snapshot is 2025-12-31 (current betas.xls)
    expect(r?.asOf).toBe('2025-12-31');
  });

  it('returns null for unknown industry', () => {
    expect(findIndustryForDate('Nonsense Industry Zzz', '2024-01-01', 'US')).toBeNull();
  });
});

describe('findCountryRiskForDate', () => {
  it('snaps to latest country-risk snapshot', () => {
    // Available CRP snapshots: 2023-12-31, 2024-12-31, 2025-12-31.
    // For valuationDate 2025-06-30: latest ≤ date is 2024-12-31.
    const r = findCountryRiskForDate('United States', '2025-06-30');
    expect(r).not.toBeNull();
    expect(r?.asOf).toBe('2024-12-31');
    expect(r?.country.equityRiskPremium).toBeGreaterThan(0);
    expect(r?.matureMarketERP).toBeGreaterThan(0);
  });
});

describe('findCountryTaxForDate', () => {
  it('snaps to latest tax snapshot on or before date', () => {
    // Only 2 tax snapshots available (2024-12-31 and 2025-12-31). A mid-2025 valuation
    // should pick 2024-12-31.
    const r = findCountryTaxForDate('United States', '2025-06-30');
    expect(r).not.toBeNull();
    expect(r?.asOf).toBe('2024-12-31');
  });
});

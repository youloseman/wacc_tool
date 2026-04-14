const DASH = '—';

export function fmtPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  if (value === 0) return DASH;
  return `${(value * 100).toFixed(2)}%`;
}

export function fmtBeta(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  if (value === 0) return DASH;
  return value.toFixed(2);
}

export function fmtRatio(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  if (value === 0) return DASH;
  return value.toFixed(2);
}

export function fmtValue(
  value: number | null | undefined,
  format: 'percent' | 'beta' | 'ratio',
): string {
  switch (format) {
    case 'percent':
      return fmtPercent(value);
    case 'beta':
      return fmtBeta(value);
    case 'ratio':
      return fmtRatio(value);
  }
}

export function isDash(str: string): boolean {
  return str === DASH;
}

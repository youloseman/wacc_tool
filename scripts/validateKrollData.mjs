// Sanity-check parsed Kroll sector data before it's written to kroll-data.json.
// Errors block the write; warnings are logged but don't abort.

const GICS_RX = /^(\d{2}|\d{4}|\d{6}|\d{8})$/;
const QUARTER_LABEL_RX = /^[1-4]Q \d{4}$/;
const EXPECTED_COUNT = 293;
const TOLERANCE = 0.10; // ±10%

export function validateKrollSectors(sectors) {
  const errors = [];
  const warnings = [];

  // --- Global checks ---
  const lo = Math.floor(EXPECTED_COUNT * (1 - TOLERANCE));
  const hi = Math.ceil(EXPECTED_COUNT * (1 + TOLERANCE));
  if (sectors.length < lo || sectors.length > hi) {
    errors.push(`Sector count ${sectors.length} outside expected range ${lo}–${hi}`);
  }

  const seenCodes = new Set();
  const allCodes = new Set(sectors.map((s) => s.gicsCode));

  for (const s of sectors) {
    const tag = `[${s.gicsCode} "${s.name}"]`;

    // GICS code format
    if (!GICS_RX.test(s.gicsCode)) {
      errors.push(`${tag} GICS code doesn't match /^(\\d{2}|\\d{4}|\\d{6}|\\d{8})$/`);
    }

    // Duplicates
    if (seenCodes.has(s.gicsCode)) {
      errors.push(`${tag} duplicate GICS code`);
    }
    seenCodes.add(s.gicsCode);

    // Name
    if (!s.name || !s.name.trim()) {
      errors.push(`${tag} empty sector name`);
    }

    // Time-series presence — discontinued GICS codes legitimately have no data ("n/a" in source).
    if (!Array.isArray(s.quarters) || s.quarters.length === 0) {
      warnings.push(`${tag} no time-series data (quarters empty — possibly discontinued)`);
      continue;
    }

    // Per-quarter checks
    for (const q of s.quarters) {
      // Beta must be a finite number when present
      if (q.unleveredBeta != null && (!Number.isFinite(q.unleveredBeta) || Number.isNaN(q.unleveredBeta))) {
        errors.push(`${tag} quarter ${q.label}: unleveredBeta is not a finite number (${q.unleveredBeta})`);
      }

      // Negative D/E
      if (q.debtToEquity != null && q.debtToEquity < 0) {
        errors.push(`${tag} quarter ${q.label}: negative debtToEquity (${q.debtToEquity})`);
      }

      // Outlier beta
      if (q.unleveredBeta != null && Number.isFinite(q.unleveredBeta)) {
        if (q.unleveredBeta < 0.1 || q.unleveredBeta > 3.0) {
          warnings.push(`${tag} quarter ${q.label}: outlier beta ${q.unleveredBeta} (outside 0.1–3.0)`);
        }
      }

      // Extreme leverage
      if (q.debtToEquity != null && q.debtToEquity > 20) {
        warnings.push(`${tag} quarter ${q.label}: extreme D/E ${q.debtToEquity} (>20)`);
      }

      // Quarter label format
      if (q.label && !QUARTER_LABEL_RX.test(q.label)) {
        warnings.push(`${tag} quarter label "${q.label}" doesn't match /^[1-4]Q \\d{4}$/`);
      }
    }

    // GICS hierarchy: 8-digit should have a 6-digit parent in the set
    if (s.gicsCode.length === 8) {
      const parent6 = s.gicsCode.slice(0, 6);
      if (!allCodes.has(parent6)) {
        warnings.push(`${tag} 8-digit code has no 6-digit parent ${parent6} in the set`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    warnings,
    errors,
  };
}

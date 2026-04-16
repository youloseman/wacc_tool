import type { WACCInputs } from '@shared/types';

// Versioned storage key — bump when the WACCInputs schema changes in a breaking way so old
// localStorage blobs don't hydrate into a stale shape. v2 = industry moved from shared to
// per-bound (bound.damodaranIndustry).
export const STATE_STORAGE_KEY = 'wacc-calculator-state-v2';
export const EXPANDED_SECTIONS_KEY = 'wacc-calculator-expanded-sections-v1';

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

// Validate that a parsed object matches the WACCInputs shape well enough to use.
// Don't deep-validate every field — just sanity-check the top-level structure so a
// corrupted blob doesn't crash the app.
export function isValidInputs(v: unknown): v is WACCInputs {
  if (!isObj(v)) return false;
  if (
    typeof v.companyName !== 'string' ||
    typeof v.valuationDate !== 'string' ||
    typeof v.currency !== 'string' ||
    !isObj(v.minBound) ||
    !isObj(v.maxBound)
  ) {
    return false;
  }
  // v2 requires damodaranIndustry at the bound level. Reject v1 blobs so defaults reload.
  const min = v.minBound as Record<string, unknown>;
  const max = v.maxBound as Record<string, unknown>;
  return typeof min.damodaranIndustry === 'string' && typeof max.damodaranIndustry === 'string';
}

export function loadFromLocalStorage(): WACCInputs | null {
  try {
    const raw = localStorage.getItem(STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidInputs(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveToLocalStorage(inputs: WACCInputs): void {
  try {
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(inputs));
  } catch {
    // Storage quota or disabled (private browsing) — silently degrade.
  }
}

export function clearLocalStorage(): void {
  try {
    localStorage.removeItem(STATE_STORAGE_KEY);
    localStorage.removeItem(EXPANDED_SECTIONS_KEY);
  } catch {
    /* no-op */
  }
}

// Broadcast a reset event so stateful components (BoundSection, ComparablePreview) can
// collapse their local UI state. Avoids a context refactor just for one action.
export const RESET_EVENT = 'wacc-calculator-reset';

export function broadcastReset(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(RESET_EVENT));
}

// URL hash encoding — base64url so the URL is safe in emails / chats without percent-encoding.
export function encodeStateToHash(state: WACCInputs): string {
  const json = JSON.stringify(state);
  // btoa needs UTF-8 → latin1 workaround for non-ASCII company names.
  const base64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `#state=${base64}`;
}

export function decodeStateFromHash(hash: string): WACCInputs | null {
  const match = hash.match(/^#state=(.+)$/);
  if (!match) return null;
  try {
    let b64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const json = decodeURIComponent(escape(atob(b64)));
    const parsed = JSON.parse(json);
    return isValidInputs(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Priority: URL hash (shared link) > localStorage > null (caller uses default).
export function loadInitialState(): { state: WACCInputs; source: 'hash' | 'storage' | 'default' } {
  const fromHash = decodeStateFromHash(window.location.hash);
  if (fromHash) return { state: fromHash, source: 'hash' };
  const fromStorage = loadFromLocalStorage();
  if (fromStorage) return { state: fromStorage, source: 'storage' };
  return { state: null as unknown as WACCInputs, source: 'default' };
}

export function loadExpandedSections(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(EXPANDED_SECTIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return isObj(parsed) ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function saveExpandedSections(map: Record<string, boolean>): void {
  try {
    localStorage.setItem(EXPANDED_SECTIONS_KEY, JSON.stringify(map));
  } catch {
    /* no-op */
  }
}

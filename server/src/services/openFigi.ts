import { cache, TTL } from './cache.ts';

interface OpenFigiDataRow {
  figi?: string;
  ticker?: string;
  name?: string;
  exchCode?: string;
  securityType?: string;
}

interface OpenFigiResponseRow {
  data?: OpenFigiDataRow[];
  error?: string;
}

export interface IsinMatch {
  ticker: string;
  exchange: string;
  name: string;
  figi: string;
}

const ISIN_RX = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

export function isIsin(input: string): boolean {
  return ISIN_RX.test(input.trim().toUpperCase());
}

// Free tier: 25 req/min without API key. No auth needed.
export async function resolveIsin(isin: string): Promise<IsinMatch[]> {
  const key = `figi:${isin.toUpperCase()}`;
  const cached = cache.get<IsinMatch[]>(key);
  if (cached) return cached;

  try {
    const res = await fetch('https://api.openfigi.com/v3/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin.toUpperCase() }]),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as OpenFigiResponseRow[];
    const first = body?.[0];
    if (!first || !first.data) return [];
    const matches: IsinMatch[] = first.data.map((d) => ({
      ticker: d.ticker ?? '',
      exchange: d.exchCode ?? '',
      name: d.name ?? '',
      figi: d.figi ?? '',
    }));
    cache.set(key, matches, TTL.WEEK);
    return matches;
  } catch {
    return [];
  }
}

// Map OpenFIGI exchange codes to Yahoo suffixes for a best-effort conversion.
const EXCH_TO_YAHOO_SUFFIX: Record<string, string> = {
  US: '',
  LN: '.L',
  FP: '.PA',
  NA: '.AS',
  GR: '.DE',
  IM: '.MI',
  SM: '.MC',
  BB: '.BR',
  SS: '.ST',
  NO: '.OL',
  SF: '.HE',
  DC: '.CO',
  SW: '.SW',
  VI: '.VI',
  PW: '.WA',
  HK: '.HK',
  JP: '.T',
  CH: '.SS',
  CS: '.SZ',
  KS: '.KS',
  TT: '.TW',
  AB: '.SR',
  RM: '.ME',
  CN: '.TO',
  BZ: '.SA',
  MM: '.MX',
  AT: '.AX',
  IN: '.NS',
  SJ: '.JO',
};

export function figiExchangeToYahooSymbol(ticker: string, exchCode: string): string {
  const suffix = EXCH_TO_YAHOO_SUFFIX[exchCode] ?? '';
  return suffix && !ticker.endsWith(suffix) ? `${ticker}${suffix}` : ticker;
}

import { cache, TTL } from './cache.js';

export interface CreditSpreadResult {
  spread: number;
  date: string;
  series: string;
  source: string;
  description: string;
  fallback?: boolean;
}

const RATING_TO_SERIES: Record<string, { id: string; label: string; fallback: number }> = {
  AAA: { id: 'BAMLC0A1CAAA', label: 'ICE BofA AAA US Corporate OAS', fallback: 0.0063 },
  'AA+': { id: 'BAMLC0A2CAA', label: 'ICE BofA AA US Corporate OAS', fallback: 0.0078 },
  AA: { id: 'BAMLC0A2CAA', label: 'ICE BofA AA US Corporate OAS', fallback: 0.0078 },
  'AA-': { id: 'BAMLC0A2CAA', label: 'ICE BofA AA US Corporate OAS', fallback: 0.0078 },
  'A+': { id: 'BAMLC0A3CA', label: 'ICE BofA A US Corporate OAS', fallback: 0.0098 },
  A: { id: 'BAMLC0A3CA', label: 'ICE BofA A US Corporate OAS', fallback: 0.0108 },
  'A-': { id: 'BAMLC0A3CA', label: 'ICE BofA A US Corporate OAS', fallback: 0.0122 },
  'BBB+': { id: 'BAMLC0A4CBBB', label: 'ICE BofA BBB US Corporate OAS', fallback: 0.0156 },
  BBB: { id: 'BAMLC0A4CBBB', label: 'ICE BofA BBB US Corporate OAS', fallback: 0.0156 },
  'BBB-': { id: 'BAMLC0A4CBBB', label: 'ICE BofA BBB US Corporate OAS', fallback: 0.022 },
  'BB+': { id: 'BAMLH0A1HYBB', label: 'ICE BofA BB US High Yield OAS', fallback: 0.024 },
  BB: { id: 'BAMLH0A1HYBB', label: 'ICE BofA BB US High Yield OAS', fallback: 0.0266 },
  'B+': { id: 'BAMLH0A2HYB', label: 'ICE BofA B US High Yield OAS', fallback: 0.0316 },
  B: { id: 'BAMLH0A2HYB', label: 'ICE BofA B US High Yield OAS', fallback: 0.0385 },
  'B-': { id: 'BAMLH0A2HYB', label: 'ICE BofA B US High Yield OAS', fallback: 0.0446 },
  CCC: { id: 'BAMLH0A3HYC', label: 'ICE BofA CCC & Lower US High Yield OAS', fallback: 0.0782 },
  CC: { id: 'BAMLH0A3HYC', label: 'ICE BofA CCC & Lower US High Yield OAS', fallback: 0.0878 },
  C: { id: 'BAMLH0A3HYC', label: 'ICE BofA CCC & Lower US High Yield OAS', fallback: 0.1174 },
  D: { id: 'BAMLH0A3HYC', label: 'ICE BofA CCC & Lower US High Yield OAS', fallback: 0.1546 },
};

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations?: FredObservation[];
}

export async function getCreditSpread(rating: string): Promise<CreditSpreadResult> {
  const entry = RATING_TO_SERIES[rating] ?? RATING_TO_SERIES['A'];
  const cacheKey = `cs:${entry.id}`;
  const cached = cache.get<CreditSpreadResult>(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return {
      spread: entry.fallback,
      date: 'N/A',
      series: entry.id,
      source: 'FRED (fallback — missing API key)',
      description: entry.label,
      fallback: true,
    };
  }

  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${entry.id}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=10`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FRED ${res.status}`);
    const json = (await res.json()) as FredResponse;
    const obs = (json.observations ?? []).find((o) => o.value !== '.' && !Number.isNaN(Number(o.value)));
    if (!obs) throw new Error('No valid observation');
    const result: CreditSpreadResult = {
      spread: Number(obs.value) / 100,
      date: obs.date,
      series: entry.id,
      source: 'FRED',
      description: `${entry.label} as of ${obs.date}`,
    };
    cache.set(cacheKey, result, TTL.DAY);
    return result;
  } catch {
    return {
      spread: entry.fallback,
      date: 'N/A',
      series: entry.id,
      source: 'FRED (cached fallback)',
      description: `${entry.label} (fallback)`,
      fallback: true,
    };
  }
}

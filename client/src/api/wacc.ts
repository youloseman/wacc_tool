import type { WACCInputs, WACCResult } from '@shared/types';

export async function postCalculate(inputs: WACCInputs, signal?: AbortSignal): Promise<WACCResult> {
  const response = await fetch('/api/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inputs),
    signal,
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return (await response.json()) as WACCResult;
}

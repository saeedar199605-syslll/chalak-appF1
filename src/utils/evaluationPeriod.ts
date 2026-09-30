import type { Evaluation } from '../types';
import { normalizeDigits } from './personnelSearch';

/** Stable key for legacy periods while the persisted evaluation stores the key explicitly. */
export function canonicalEvaluationPeriodId(label: string): string {
  const canonical = normalizeDigits(String(label || '').normalize('NFKC'))
    .replace(/[\u200c\u200f\u0640]/g, '')
    .replace(/[‐‑‒–—]/g, '-')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
  return canonical ? `period:${encodeURIComponent(canonical)}` : '';
}

export function getEvaluationPeriodId(evaluation: Pick<Evaluation, 'period' | 'evaluationPeriodId'>): string {
  return evaluation.evaluationPeriodId?.trim() || canonicalEvaluationPeriodId(evaluation.period);
}

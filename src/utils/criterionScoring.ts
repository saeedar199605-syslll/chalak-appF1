import type { Criterion, KpiScoreThresholds } from '../types';

export function mergeCriterionEdit(
  existing: Criterion,
  updates: Partial<Omit<Criterion, 'id'>>,
  clearableKeys: readonly (keyof Omit<Criterion, 'id'>)[] = [],
): Criterion {
  const defined = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined));
  const intentionalClears = Object.fromEntries(clearableKeys.map(key => [key, updates[key]]));
  return { ...existing, ...defined, ...intentionalClears, id: existing.id } as Criterion;
}

/** Only fields shown in the current editor may be intentionally cleared. */
export function criterionScoringClearableKeys(
  criterion: Pick<Criterion, 'cat' | 'scoringSource'>
): Array<keyof Omit<Criterion, 'id'>> {
  const keys: Array<keyof Omit<Criterion, 'id'>> = [];
  if (!criterion.scoringSource || criterion.scoringSource === 'supervisor') {
    keys.push('allowedScoreMin', 'allowedScoreMax');
  }
  if (criterion.cat === 'K' && criterion.scoringSource !== 'supervisor') {
    keys.push('targetValue', 'scoreThresholds');
  }
  return keys;
}

export function manualScoreRange(criterion: Pick<Criterion, 'allowedScoreMin' | 'allowedScoreMax'>): { min: number; max: number } {
  return { min: criterion.allowedScoreMin ?? 1, max: criterion.allowedScoreMax ?? 5 };
}

export function isManualScoreInRange(criterion: Pick<Criterion, 'allowedScoreMin' | 'allowedScoreMax'>, score: number): boolean {
  if (score === 0) return true;
  if (!Number.isInteger(score) || score < 1 || score > 5) return false;
  const { min, max } = manualScoreRange(criterion);
  return Number.isInteger(min) && Number.isInteger(max) && min >= 1 && max <= 5 && min <= max && score >= min && score <= max;
}

export function thresholdsFollowDirection(thresholds: KpiScoreThresholds, direction: 'more' | 'less' = 'more'): boolean {
  const values = [thresholds.score5, thresholds.score4, thresholds.score3, thresholds.score2];
  if (values.some(value => !Number.isFinite(value))) return false;
  return direction === 'less'
    ? values[0] <= values[1] && values[1] <= values[2] && values[2] <= values[3]
    : values[0] >= values[1] && values[1] >= values[2] && values[2] >= values[3];
}

export function validManualScoreLimits(min?: number, max?: number): boolean {
  if (min === undefined && max === undefined) return true;
  const effectiveMin = min ?? 1;
  const effectiveMax = max ?? 5;
  return Number.isInteger(effectiveMin) && Number.isInteger(effectiveMax) && effectiveMin >= 1 && effectiveMin <= effectiveMax && effectiveMax <= 5;
}

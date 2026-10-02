import type { Evaluation } from '../types';

/** Status is a legacy display flag; workflow stage defines committee location. */
export function calibrationCounts(evaluations: Evaluation[]) {
  return {
    ready: evaluations.filter(record => record.stage === 'calibration_review' && record.status !== 'locked'),
    approved: evaluations.filter(record => ['hr_approval', 'feedback_meeting'].includes(record.stage || '') && record.status !== 'locked').length,
    completed: evaluations.filter(record => record.stage === 'completed' && record.status === 'locked').length,
  };
}

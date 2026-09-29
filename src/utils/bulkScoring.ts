import type { Criterion, Employee, Evaluation, JobProfile } from '../types';
import { authorize, canAccessWorkflowStage, isWithinWorkflowCeiling, readGranularPermissionPolicy, type GranularPermissionPolicy } from './authorization';
import { canPerformWorkflowAction } from './workflowAuthorization';
import { calculateMultiSourceCompositeScore } from './formulaEngine';
import { isManualScoreInRange } from './criterionScoring';

export type BulkScoringReason = 'eligible' | 'not_found' | 'wrong_stage' | 'not_current_owner' | 'outside_scope' |
  'criterion_not_in_profile' | 'source_protected' | 'score_limit' | 'permission_denied' | 'no_score_input' | 'finalized';

export interface BulkScoringRow {
  evaluationId: string;
  employeeId: string;
  employeeName: string;
  eligible: boolean;
  reason: BulkScoringReason;
  reasonLabel: string;
}

export interface BulkScoringPlan {
  selected: number;
  eligible: number;
  rejected: number;
  rows: BulkScoringRow[];
  updatedEvaluations: Evaluation[];
  operationId: string;
}

export type ScoreAssignments = Record<string, Record<string, number>>;

const reasonText: Record<BulkScoringReason, string> = {
  eligible: 'آماده ثبت',
  not_found: 'پرونده یا کارمند پیدا نشد',
  wrong_stage: 'مرحله گردش کار برای امتیازدهی گروهی مجاز نیست',
  not_current_owner: 'مسئول فعلی پرونده نیستید',
  outside_scope: 'خارج از محدوده سازمانی مجاز',
  criterion_not_in_profile: 'معیار در پروفایل شغلی پرونده نیست',
  source_protected: 'معیار متعلق به MIS، کسری یا سامانه است',
  score_limit: 'نمره خارج از بازه مجاز معیار است',
  permission_denied: 'مجوز اقدام یا ویرایش وجود ندارد',
  no_score_input: 'نمره‌ای برای ثبت وارد نشده است',
  finalized: 'پرونده نهایی یا قفل شده است',
};

export function isSupervisorScorableScore(score: Evaluation['scores'][number] | undefined, criterion: Criterion): boolean {
  if (!score) return false;
  if (score.autoPopulated || ['mis', 'kasra', 'system', 'auto'].includes(score.sourceType || '') ||
      ['mis', 'kasra', 'system'].includes(criterion.scoringSource || '')) return false;
  if (score.sourceType === 'multi_source' || criterion.scoringSource === 'multi_source') {
    return criterion.multiSourceConfig?.items.some(item => item.source === 'supervisor') === true;
  }
  return criterion.scoringSource === 'supervisor' || (!criterion.scoringSource && (!score.sourceType || score.sourceType === 'supervisor'));
}

export function prepareBulkScorePlan(args: {
  evaluationIds: string[];
  assignments: ScoreAssignments;
  comment?: string;
  evaluations: Evaluation[];
  employees: Employee[];
  profiles: JobProfile[];
  criteria: Criterion[];
  actor: Employee;
  operationId: string;
  permissionPolicy?: GranularPermissionPolicy;
}): BulkScoringPlan {
  const { evaluations, employees, profiles, criteria, actor, operationId } = args;
  const policy = args.permissionPolicy || readGranularPermissionPolicy();
  const evalById = new Map(evaluations.map(evaluation => [evaluation.id, evaluation]));
  const employeeById = new Map(employees.map(employee => [employee.id, employee]));
  const profileById = new Map(profiles.map(profile => [profile.id, profile]));
  const criterionById = new Map(criteria.map(criterion => [criterion.id, criterion]));
  const rows: BulkScoringRow[] = [];
  const updatedEvaluations: Evaluation[] = [];

  for (const evaluationId of Array.from(new Set(args.evaluationIds))) {
    const evaluation = evalById.get(evaluationId);
    const employee = evaluation ? employeeById.get(evaluation.empId) : undefined;
    const profile = evaluation ? profileById.get(evaluation.profileId) : undefined;
    const assignment = args.assignments[evaluationId] || {};
    let reason: BulkScoringReason = 'eligible';
    const entries = Object.entries(assignment).filter(([, value]) => value !== undefined && value !== null);

    if (!evaluation || !employee || !profile) reason = 'not_found';
    else if (evaluation.status === 'locked' || evaluation.stage === 'completed') reason = 'finalized';
    else if (evaluation.stage !== 'supervisor_review') reason = 'wrong_stage';
    else if (actor.role !== 'admin' && evaluation.currentAssigneeId !== actor.id) reason = 'not_current_owner';
    else if (actor.role !== 'admin' && !authorize(actor, 'evaluations', 'edit', employee, policy).allowed) reason = 'outside_scope';
    else if (actor.role !== 'admin' && (!canAccessWorkflowStage(actor, 'supervisor_review', 'edit', policy) || !isWithinWorkflowCeiling(actor, 'supervisor_review', policy))) reason = 'permission_denied';
    else if (actor.role !== 'admin' && !canPerformWorkflowAction(actor, evaluation, 'approve', { employees, permissionPolicy: policy }).authorized) reason = 'permission_denied';
    else if (!entries.length) reason = 'no_score_input';

    const scoreByCriterion = new Map(evaluation?.scores.map(score => [score.cid, score]) || []);
    if (reason === 'eligible') {
      for (const [criterionId, value] of entries) {
        const criterion = criterionById.get(criterionId);
        if (!criterion || !profile!.items.some(item => item.cid === criterionId)) { reason = 'criterion_not_in_profile'; break; }
        const existingScore = scoreByCriterion.get(criterionId);
        if (!existingScore || !isSupervisorScorableScore(existingScore, criterion)) { reason = 'source_protected'; break; }
        const multiSource = existingScore.sourceType === 'multi_source' || criterion.scoringSource === 'multi_source';
        const rangeInput = multiSource ? value : value;
        if (!isManualScoreInRange(criterion, rangeInput) || value === 0) { reason = 'score_limit'; break; }
      }
    }

    const eligible = reason === 'eligible';
    rows.push({
      evaluationId,
      employeeId: evaluation?.empId || '',
      employeeName: employee?.name || 'نامشخص',
      eligible,
      reason,
      reasonLabel: reasonText[reason],
    });
    if (!eligible || !evaluation) continue;

    const nextScores = evaluation.scores.map(score => {
      const value = assignment[score.cid];
      if (value === undefined) return score;
      const criterion = criterionById.get(score.cid)!;
      const multiSource = score.sourceType === 'multi_source' || criterion.scoringSource === 'multi_source';
      if (multiSource) {
        const sourceBreakdown = { ...(score.sourceBreakdown || {}), supervisorScore: value };
        const composite = calculateMultiSourceCompositeScore(criterion, sourceBreakdown);
        return { ...score, value: composite.score, sourceBreakdown, doc: args.comment?.trim() || score.doc || composite.docText };
      }
      return { ...score, value, doc: args.comment?.trim() || score.doc };
    });
    updatedEvaluations.push({ ...evaluation, scores: nextScores, bulkOperationId: operationId });
  }

  return {
    selected: rows.length,
    eligible: rows.filter(row => row.eligible).length,
    rejected: rows.filter(row => !row.eligible).length,
    rows,
    updatedEvaluations,
    operationId,
  };
}

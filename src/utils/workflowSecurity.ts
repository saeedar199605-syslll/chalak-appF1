import type { Criterion, Employee, Evaluation, JobProfile, ScoreSourceBreakdown, WorkflowStageKey, WorkflowTransitionLog } from '../types';
import { NEED_DOCUMENT_SCORES } from '../types';
import { authorize, canAccessWorkflowStage, canImport, isWithinWorkflowCeiling, type GranularPermissionPolicy } from './authorization';
import { canPerformWorkflowAction, isExplicitlyReassigned, isWithinSupervisorScope, type DelegationRecord } from './workflowAuthorization';
import { calculateMultiSourceCompositeScore } from './formulaEngine';
import { resolveWorkflowAssignee } from './workflowAssignee';
import { isManualScoreInRange } from './criterionScoring';
import { DEFAULT_ROUTE_RULES } from '../types';
import type { EvaluationRouteRule } from '../types';
import { resolveInitialEvaluationWorkflow } from './evaluationStart';
import { getEvaluationPeriodId } from './evaluationPeriod';
import { isProtectedSourceImportContext, validImportedScoreChange, type ProtectedSourceImportContext } from './sourceImports';

export type EvaluationWriteFailure =
  | 'identity_changed' | 'new_evaluation_requires_admin' | 'transition_missing_history'
  | 'history_rewritten' | 'invalid_transition' | 'permission_denied' | 'ceiling_exceeded'
  | 'completed_immutable' | 'mis_value_read_only' | 'score_stage_denied' | 'score_field_denied'
  | 'owner_change_requires_reassignment' | 'missing_required_input' | 'score_limit_exceeded'
  | 'kasra_import_not_authorized' | 'mis_import_not_authorized' | 'source_import_invalid';

const stageNext: Partial<Record<WorkflowStageKey, WorkflowStageKey[]>> = {
  self_review: ['supervisor_review'],
  supervisor_review: ['peer_review', 'calibration_review'],
  peer_review: ['calibration_review'],
  calibration_review: ['hr_approval'],
  hr_approval: ['feedback_meeting'],
  feedback_meeting: ['completed'],
  rejected: ['supervisor_review'],
  appealed: ['feedback_meeting'],
};

export function isValidWorkflowEdge(from: WorkflowStageKey, to: WorkflowStageKey, action: string, role: Employee['role']): boolean {
  if (from === 'hse_review' || to === 'hse_review') {
    if (action === 'route_hse') return (role === 'admin' || role === 'supervisor') &&
      ['supervisor_review', 'peer_review', 'calibration_review', 'hr_approval'].includes(from) && to === 'hse_review';
    if (action === 'complete_hse_review') return from === 'hse_review' &&
      ['supervisor_review', 'peer_review', 'calibration_review', 'hr_approval'].includes(to);
    return false;
  }
  if (action === 'admin_override') return role === 'admin';
  if (action === 'reassign_assignee') return from === to;
  if (action === 'reject_to_supervisor' || action === 'reject_to_employee') return to === 'rejected' && ['supervisor_review', 'peer_review', 'calibration_review', 'hr_approval'].includes(from);
  if (action === 'submit_appeal') return role === 'employee' && ['supervisor_review', 'feedback_meeting', 'completed'].includes(from) && to === 'appealed';
  if (action === 'resolve_appeal') return from === 'appealed' && to === 'feedback_meeting';
  if (action === 'submit_self') return role === 'employee' && from === 'self_review' && to === 'supervisor_review';
  if (action === 'submit_supervisor') return role === 'employee'
    ? from === 'rejected' && to === 'supervisor_review'
    : (from === 'supervisor_review' || from === 'rejected') && ['calibration_review', 'peer_review'].includes(to);
  if (action === 'submit_peer') return from === 'peer_review' && to === 'calibration_review';
  if (action === 'approve_calibration') return from === 'calibration_review' && to === 'hr_approval';
  if (action === 'approve_hr') return from === 'hr_approval' && to === 'feedback_meeting';
  if (action === 'complete_feedback') return from === 'feedback_meeting' && to === 'completed';
  if (action === 'advance') return (stageNext[from] || []).includes(to);
  return false;
}

function scoreSnapshot(score: Evaluation['scores'][number]): string {
  return JSON.stringify(score);
}

export function hasRequiredFinalizationInputs(evaluation: Evaluation): boolean {
  return Array.isArray(evaluation.scores) && evaluation.scores.length > 0 && evaluation.scores.every(score =>
    score.value > 0 && (!NEED_DOCUMENT_SCORES.includes(score.value) || Boolean(score.doc?.trim() && score.doc.trim().length >= 5))
  );
}

function withoutSupervisorInput(breakdown: ScoreSourceBreakdown | undefined): Omit<ScoreSourceBreakdown, 'supervisorScore'> | undefined {
  if (!breakdown) return undefined;
  const { supervisorScore: _supervisorScore, ...sourceOwnedValues } = breakdown;
  return Object.keys(sourceOwnedValues).length ? sourceOwnedValues : undefined;
}

function equalExcept(record: Record<string, unknown>, other: Record<string, unknown>, ignored: string[]): boolean {
  const omit = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => !ignored.includes(key)));
  return JSON.stringify(omit(record)) === JSON.stringify(omit(other));
}

function multiSourceWriteAllowed(
  oldScore: Evaluation['scores'][number],
  next: Evaluation['scores'][number],
  criterion: Criterion | undefined
): EvaluationWriteFailure | null {
  const acceptsSupervisorInput = criterion?.multiSourceConfig?.items.some(item => item.source === 'supervisor') === true;
  if (!acceptsSupervisorInput || !criterion || !next.sourceBreakdown ||
      JSON.stringify(withoutSupervisorInput(oldScore.sourceBreakdown)) !== JSON.stringify(withoutSupervisorInput(next.sourceBreakdown)) ||
      !equalExcept(oldScore as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>, ['value', 'doc', 'sourceBreakdown'])) return 'mis_value_read_only';

  const oldSupervisorInput = oldScore.sourceBreakdown?.supervisorScore;
  const newSupervisorInput = next.sourceBreakdown.supervisorScore;
  if (newSupervisorInput !== undefined && (!Number.isFinite(newSupervisorInput) || newSupervisorInput < 1 || newSupervisorInput > 5)) return 'score_field_denied';
  const inputChanged = oldSupervisorInput !== newSupervisorInput;
  if (!inputChanged && next.value !== oldScore.value) return 'mis_value_read_only';
  if (inputChanged) {
    const composite = calculateMultiSourceCompositeScore(criterion, next.sourceBreakdown);
    if (next.value !== composite.score || (next.doc !== oldScore.doc && next.doc !== composite.docText)) return 'score_field_denied';
  }
  return null;
}

function adminMISImportAllowed(
  oldScore: Evaluation['scores'][number],
  next: Evaluation['scores'][number],
  criterion: Criterion | undefined
): boolean {
  if (criterion?.scoringSource !== 'mis' || criterion.autoPopulate === false ||
      next.sourceType !== 'mis' || next.autoPopulated !== true ||
      !Number.isFinite(next.value) || next.value < 0 || next.value > 5 ||
      typeof next.rawMetricValue !== 'number' || !Number.isFinite(next.rawMetricValue) || next.rawMetricValue < 0 ||
      !next.doc?.startsWith('داده خودکار MIS:')) return false;

  return equalExcept(
    oldScore as unknown as Record<string, unknown>,
    next as unknown as Record<string, unknown>,
    ['value', 'doc', 'sourceType', 'autoPopulated', 'rawMetricValue']
  );
}

function scoreWriteAllowed(existing: Evaluation, incoming: Evaluation, actor: Employee, criteria: Criterion[], sourceImport?: ProtectedSourceImportContext): EvaluationWriteFailure | null {
  const oldByCid = new Map(existing.scores.map(score => [score.cid, score]));
  const newByCid = new Map(incoming.scores.map(score => [score.cid, score]));
  if (oldByCid.size !== newByCid.size || [...oldByCid.keys()].some(cid => !newByCid.has(cid))) return 'score_field_denied';
  const stage = existing.stage || 'self_review';
  for (const [cid, oldScore] of oldByCid) {
    const next = newByCid.get(cid)!;
    if (scoreSnapshot(oldScore) === scoreSnapshot(next)) continue;
    const criterion = criteria.find(item => item.id === cid);
    const multiSource = oldScore.sourceType === 'multi_source' || criterion?.scoringSource === 'multi_source';
    if ((criterion?.scoringSource === 'supervisor' || (!criterion?.scoringSource && oldScore.sourceType === 'supervisor')) &&
        next.value !== oldScore.value && !isManualScoreInRange(criterion || {}, next.value)) return 'score_limit_exceeded';
    if (multiSource && criterion?.multiSourceConfig?.items.some(item => item.source === 'supervisor') &&
        next.sourceBreakdown?.supervisorScore !== oldScore.sourceBreakdown?.supervisorScore &&
        !isManualScoreInRange(criterion, next.sourceBreakdown?.supervisorScore ?? 0)) return 'score_limit_exceeded';
    const sourceOwned = oldScore.autoPopulated || ['mis', 'kasra', 'system', 'auto'].includes(oldScore.sourceType || '') ||
      ['mis', 'kasra', 'system'].includes(criterion?.scoringSource || '');
    if (sourceOwned && !multiSource) {
      const employeeSelfScoreAllowed = actor.role === 'employee' && ['self_review', 'rejected'].includes(stage) &&
        Number.isInteger(next.self) && next.self >= 0 && next.self <= 5 &&
        equalExcept(oldScore as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>, ['self']);
      if (employeeSelfScoreAllowed) continue;
      if (sourceImport) {
        if (sourceImport.importType.toLowerCase() !== criterion?.scoringSource ||
            !validImportedScoreChange(oldScore, next, criterion, sourceImport.importType)) return 'source_import_invalid';
        continue;
      }
      if (actor.role !== 'admin' || !adminMISImportAllowed(oldScore, next, criterion)) return 'mis_value_read_only';
      continue;
    }
    if (actor.role === 'supervisor') {
      if (stage !== 'supervisor_review') return 'score_stage_denied';
      if (multiSource) {
        const failure = multiSourceWriteAllowed(oldScore, next, criterion);
        if (failure) return failure;
        continue;
      }
      if (next.sourceType !== oldScore.sourceType || next.autoPopulated !== oldScore.autoPopulated ||
          !equalExcept(oldScore as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>, ['value', 'doc'])) return 'score_field_denied';
    } else if (actor.role === 'employee') {
      if (stage !== 'self_review' && stage !== 'rejected') return 'score_stage_denied';
      if (next.value !== oldScore.value || !equalExcept(oldScore as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>, ['self', 'doc'])) return 'score_field_denied';
    } else {
      if (multiSource) {
        const failure = multiSourceWriteAllowed(oldScore, next, criterion);
        if (failure) return failure;
        continue;
      }
      if (next.sourceType !== oldScore.sourceType && oldScore.sourceType && oldScore.sourceType !== 'supervisor') return 'mis_value_read_only';
    }
  }
  return null;
}

export interface EvaluationWriteContext {
  actor: Employee;
  employees: Employee[];
  criteria?: Criterion[];
  profiles?: JobProfile[];
  delegations: DelegationRecord[];
  permissionPolicy: GranularPermissionPolicy;
  routeRules?: EvaluationRouteRule[];
  sourceImport?: ProtectedSourceImportContext;
}

function validateSourceImportEvaluation(existing: Evaluation, incoming: Evaluation, context: EvaluationWriteContext): EvaluationWriteFailure | null {
  const sourceImport = context.sourceImport;
  if (!sourceImport) return null;
  const importType = sourceImport.importType.toLowerCase() as 'mis' | 'kasra';
  const employee = context.employees.find(item => item.id === existing.empId);
  if (!employee || !canImport(context.actor, importType, employee, context.permissionPolicy).allowed) {
    return sourceImport.importType === 'KASRA' ? 'kasra_import_not_authorized' : 'mis_import_not_authorized';
  }
  if (getEvaluationPeriodId(existing) !== sourceImport.evaluationPeriodId ||
      getEvaluationPeriodId(incoming) !== sourceImport.evaluationPeriodId ||
      existing.status === 'locked' || existing.stage === 'completed' ||
      !equalExcept(existing as unknown as Record<string, unknown>, incoming as unknown as Record<string, unknown>, ['scores']) ||
      JSON.stringify(existing.scores) === JSON.stringify(incoming.scores)) return 'source_import_invalid';

  const profile = context.profiles?.find(item => item.id === existing.profileId);
  if (!profile) return 'source_import_invalid';
  const criteriaById = new Map<string, Criterion>();
  (context.criteria || []).forEach(item => { criteriaById.set(item.id, item); criteriaById.set(item.code, item); });
  const profileCriterionIds = new Set(profile.items.flatMap(item => {
    const criterion = criteriaById.get(item.cid);
    return criterion ? [item.cid, criterion.id, criterion.code] : [item.cid];
  }));
  const previousScores = new Map(existing.scores.map(item => [item.cid, item]));
  const nextScores = new Map(incoming.scores.map(item => [item.cid, item]));
  for (const [cid, previous] of previousScores) {
    const next = nextScores.get(cid);
    if (!next) return 'source_import_invalid';
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;
    if (!profileCriterionIds.has(cid) || !validImportedScoreChange(previous, next, criteriaById.get(cid), sourceImport.importType)) return 'source_import_invalid';
  }
  if (nextScores.size !== previousScores.size) return 'source_import_invalid';
  return null;
}

/** Keep only workflow-owned payload fields when building a transition from the stored record. */
export function workflowTransitionPayloadFields(
  requested: Evaluation,
  action: WorkflowTransitionLog['action']
): Partial<Pick<Evaluation, 'appeal' | 'scores'>> {
  const fields: Partial<Pick<Evaluation, 'appeal' | 'scores'>> = {};
  if ((action === 'submit_appeal' || action === 'resolve_appeal') && requested.appeal) {
    fields.appeal = requested.appeal;
  }
  if (action === 'resolve_appeal') fields.scores = requested.scores;
  return fields;
}

function isValidCompletedAppealSubmission(existing: Evaluation, incoming: Evaluation, actor: Employee): boolean {
  const log = incoming.history?.[0];
  const appeal = incoming.appeal;
  if (actor.role !== 'employee' || existing.empId !== actor.id || existing.stage !== 'completed' || existing.status !== 'locked' ||
      incoming.stage !== 'appealed' || incoming.status !== 'draft' || log?.action !== 'submit_appeal' ||
      log.fromStage !== 'completed' || log.toStage !== 'appealed' || !appeal || appeal.status !== 'submitted' ||
      appeal.id === existing.appeal?.id || appeal.evalId !== existing.id || appeal.empId !== actor.id ||
      appeal.period !== existing.period || !appeal.reason?.trim() || existing.appeal?.status === 'submitted') return false;

  // Allow only the appeal transition fields to differ on a completed record.
  // Scores, MIS data, employee identity, period, and all other business data stay locked.
  return equalExcept(
    existing as unknown as Record<string, unknown>,
    incoming as unknown as Record<string, unknown>,
    ['stage', 'status', 'currentAssigneeId', 'currentAssigneeName', 'currentAssigneeRole', 'history', 'appeal', 'rejectionReason']
  );
}

/** Persistence boundary guard for full-array client sync; caller keeps exact no-op rows. */
export function validateEvaluationWrite(existing: Evaluation | undefined, incoming: Evaluation, context: EvaluationWriteContext): EvaluationWriteFailure | null {
  const { actor, employees, delegations, permissionPolicy } = context;
  if (!incoming?.id || !incoming.empId || (existing && (existing.empId !== incoming.empId || existing.id !== incoming.id))) return 'identity_changed';
  if (!existing) {
    if (actor.role !== 'admin') return 'new_evaluation_requires_admin';
    const employee = employees.find(item => item.id === incoming.empId);
    if (!employee) return 'identity_changed';
    const initial = resolveInitialEvaluationWorkflow(employee, employees, context.routeRules || DEFAULT_ROUTE_RULES, incoming.profileId);
    if (incoming.stage !== initial.stage || incoming.currentAssigneeId !== initial.currentAssigneeId ||
        incoming.currentAssigneeName !== initial.currentAssigneeName || incoming.currentAssigneeRole !== initial.currentAssigneeRole ||
        incoming.requiresSelfReview !== initial.requiresSelfReview ||
        (incoming.routeRuleId && incoming.routeRuleId !== initial.routeRuleId)) return 'invalid_transition';
    return null;
  }
  if (JSON.stringify(existing) === JSON.stringify(incoming)) return null;
  const completedAppealSubmission = isValidCompletedAppealSubmission(existing, incoming, actor);
  if ((existing.stage === 'completed' || existing.status === 'locked') && JSON.stringify(existing) !== JSON.stringify(incoming) && !completedAppealSubmission) return 'completed_immutable';

  if (context.sourceImport) {
    const importFailure = validateSourceImportEvaluation(existing, incoming, context);
    if (importFailure) return importFailure;
    return scoreWriteAllowed(existing, incoming, actor, context.criteria || [], context.sourceImport);
  }

  const oldHistory = existing.history || [];
  const nextHistory = incoming.history || [];
  const newest = nextHistory[0];
  const historyUnchanged = JSON.stringify(oldHistory) === JSON.stringify(nextHistory);
  const stageChanged = (existing.stage || 'self_review') !== (incoming.stage || 'self_review');
  const ownerChanged = existing.currentAssigneeId !== incoming.currentAssigneeId;
  if (!historyUnchanged) {
    if (nextHistory.length !== oldHistory.length + 1 || !newest || JSON.stringify(nextHistory.slice(1)) !== JSON.stringify(oldHistory)) return 'history_rewritten';
    const from = existing.stage || 'self_review';
    const to = incoming.stage || 'self_review';
    if (newest.fromStage !== from || newest.toStage !== to || !isValidWorkflowEdge(from, to, newest.action, actor.role)) return 'invalid_transition';
    const hseRoute = newest.action === 'route_hse';
    const hseComplete = newest.action === 'complete_hse_review';
    if (hseRoute || hseComplete) {
      const employee = employees.find(item => item.id === existing.empId);
      const context = incoming.hseReviewContext;
      const reviewer = employee?.hseReviewerId ? employees.find(item => item.id === employee.hseReviewerId) : undefined;
      const allowedReturnStages: WorkflowStageKey[] = ['supervisor_review', 'peer_review', 'calibration_review', 'hr_approval'];
      if (!employee || existing.status === 'locked' || existing.stage === 'completed') return 'completed_immutable';
      if (!equalExcept(existing as unknown as Record<string, unknown>, incoming as unknown as Record<string, unknown>,
        ['stage', 'status', 'currentAssigneeId', 'currentAssigneeName', 'currentAssigneeRole', 'history', 'hseReviewContext'])) return 'invalid_transition';
      if (hseRoute) {
        if (!allowedReturnStages.includes(from) || to !== 'hse_review' || !reviewer ||
            context?.requestedFromStage !== from || context.returnStage !== from ||
            context.requestedById !== actor.id || !context.reason?.trim() ||
            context.hseReviewerId !== reviewer.id ||
            context.returnAssigneeId !== existing.currentAssigneeId ||
            context.returnAssigneeName !== existing.currentAssigneeName ||
            context.returnAssigneeRole !== existing.currentAssigneeRole ||
            incoming.currentAssigneeId !== reviewer.id || incoming.currentAssigneeName !== reviewer.name ||
            incoming.currentAssigneeRole !== reviewer.role || incoming.status !== existing.status) return 'invalid_transition';
        if (actor.role !== 'admin') {
          const auth = canPerformWorkflowAction(actor, existing, 'route_hse', { employees, delegations, permissionPolicy });
          if (!auth.authorized) return 'permission_denied';
        }
      } else {
        const prior = existing.hseReviewContext;
        if (from !== 'hse_review' || !prior || actor.id !== prior.hseReviewerId ||
            existing.currentAssigneeId !== actor.id || to !== prior.returnStage ||
            !allowedReturnStages.includes(prior.returnStage) || context?.requestedAt !== prior.requestedAt ||
            context.requestedById !== prior.requestedById || context.hseReviewerId !== prior.hseReviewerId ||
            context.returnStage !== prior.returnStage || context.returnAssigneeId !== prior.returnAssigneeId ||
            context.returnAssigneeName !== prior.returnAssigneeName || context.returnAssigneeRole !== prior.returnAssigneeRole ||
            !context.reviewedAt || incoming.currentAssigneeId !== prior.returnAssigneeId ||
            incoming.currentAssigneeName !== prior.returnAssigneeName || incoming.currentAssigneeRole !== prior.returnAssigneeRole ||
            incoming.status !== existing.status) return 'permission_denied';
        const auth = canPerformWorkflowAction(actor, existing, 'complete_hse_review', { employees, delegations, permissionPolicy });
        if (!auth.authorized) return 'permission_denied';
      }
    }
    if (newest.action !== 'reassign_assignee' && !hseRoute && !hseComplete) {
      const expectedOwner = resolveWorkflowAssignee(to, employees.find(item => item.id === incoming.empId), employees);
      if (incoming.currentAssigneeId !== expectedOwner.id || incoming.currentAssigneeName !== expectedOwner.name || incoming.currentAssigneeRole !== expectedOwner.role) return 'owner_change_requires_reassignment';
    }
    if (newest.action === 'reassign_assignee') {
      const newOwner = employees.find(item => item.id === incoming.currentAssigneeId);
      if (!newOwner || incoming.currentAssigneeName !== newOwner.name || incoming.currentAssigneeRole !== newOwner.role) return 'owner_change_requires_reassignment';
      if (actor.role === 'supervisor' && !isWithinSupervisorScope(actor, newOwner, employees)) return 'permission_denied';
    }
    if (newest.actorId !== actor.id) return 'permission_denied';
    if (newest.action === 'reassign_assignee' && !ownerChanged) return 'invalid_transition';
    if (newest.action !== 'reassign_assignee' && !stageChanged && newest.action !== 'admin_override') return 'invalid_transition';
    if (actor.role !== 'admin' && !hseRoute && !hseComplete) {
      const actionName = newest.action === 'reject_to_employee' || newest.action === 'reject_to_supervisor' ? 'reject'
        : newest.action === 'reassign_assignee' ? 'reassign'
          : newest.action === 'submit_appeal' ? 'appeal'
            : newest.action === 'complete_feedback' ? 'finalize'
              : newest.action === 'submit_supervisor' && from === 'rejected' ? 'advance'
                : ['submit_supervisor', 'submit_peer', 'approve_calibration', 'approve_hr', 'resolve_appeal'].includes(newest.action) ? 'approve' : 'advance';
      const currentEval = { ...existing, history: oldHistory };
      const check = canPerformWorkflowAction(actor, currentEval, actionName, { employees, delegations, permissionPolicy });
      if (!check.authorized) return 'permission_denied';
      if (actor.role === 'supervisor' && !isWithinWorkflowCeiling(actor, to, permissionPolicy)) return 'ceiling_exceeded';
      if (['submit_self', 'submit_supervisor', 'submit_peer', 'approve_calibration', 'approve_hr', 'complete_feedback', 'resolve_appeal', 'advance'].includes(newest.action) &&
          !canAccessWorkflowStage(actor, from, actionName === 'advance' ? 'advance' : 'act', permissionPolicy)) return 'ceiling_exceeded';
    }
  } else if (stageChanged) return 'transition_missing_history';
  else if (ownerChanged) return 'owner_change_requires_reassignment';

  const scoreFailure = scoreWriteAllowed(existing, incoming, actor, context.criteria || []);
  if (scoreFailure) return scoreFailure;

  if (incoming.stage === 'completed' && incoming.status !== 'locked') return 'invalid_transition';
  if (incoming.status === 'locked' && incoming.stage !== 'completed') return 'invalid_transition';
  if (incoming.stage === 'completed' && !hasRequiredFinalizationInputs(incoming)) return 'missing_required_input';
  if (incoming.status === 'locked' && existing.status !== 'locked' && (historyUnchanged || !['complete_feedback', 'admin_override'].includes(newest?.action || ''))) return 'permission_denied';
  if (!historyUnchanged && newest?.action !== 'reassign_assignee' && actor.role !== 'admin' && !stageChanged) return 'invalid_transition';
  if (actor.role !== 'admin' && !stageChanged && !ownerChanged) {
    const emp = employees.find(item => item.id === existing.empId);
    const canEdit = emp && (actor.role === 'employee'
      ? actor.id === emp.id && ['self_review', 'rejected'].includes(existing.stage || 'self_review')
      : authorize(actor, 'evaluations', 'edit', isExplicitlyReassigned(existing) && existing.currentAssigneeId === actor.id ? undefined : emp, permissionPolicy).allowed &&
        canAccessWorkflowStage(actor, existing.stage || 'self_review', 'edit', permissionPolicy) && existing.stage === 'supervisor_review' &&
        canPerformWorkflowAction(actor, existing, 'approve', { employees, delegations, permissionPolicy }).authorized);
    if (!canEdit) return 'permission_denied';
  }
  return null;
}

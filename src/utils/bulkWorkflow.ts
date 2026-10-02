import type { Employee, Evaluation, WorkflowStageKey, WorkflowTransitionLog } from '../types';
import type { DelegationRecord } from './workflowAuthorization';
import { canPerformWorkflowAction, workflowPermissionForTransition } from './workflowAuthorization';
import { hasRequiredFinalizationInputs } from './workflowSecurity';
import { resolveWorkflowAssignee } from './workflowAssignee';
import type { GranularPermissionPolicy } from './authorization';

export type BulkAdvanceReason = 'eligible' | 'not_owned' | 'wrong_state' | 'missing_input' | 'missing_assignee' | 'permission_denied' | 'already_transitioned';
export type BulkAdvanceRow = {
  evaluationId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  fromStage: WorkflowStageKey;
  toStage: WorkflowStageKey | null;
  action: WorkflowTransitionLog['action'] | null;
  currentOwnerId?: string;
  reason: BulkAdvanceReason;
};
export type BulkAdvanceSnapshot = Pick<BulkAdvanceRow, 'evaluationId' | 'fromStage' | 'currentOwnerId'>;

const nextStage: Partial<Record<WorkflowStageKey, WorkflowStageKey>> = {
  self_review: 'supervisor_review',
  supervisor_review: 'calibration_review',
  peer_review: 'calibration_review',
  calibration_review: 'hr_approval',
  hr_approval: 'feedback_meeting',
  feedback_meeting: 'completed',
  rejected: 'supervisor_review',
  appealed: 'feedback_meeting',
};

const transitionAction: Partial<Record<WorkflowStageKey, WorkflowTransitionLog['action']>> = {
  self_review: 'submit_self',
  supervisor_review: 'submit_supervisor',
  peer_review: 'submit_peer',
  calibration_review: 'approve_calibration',
  hr_approval: 'approve_hr',
  feedback_meeting: 'complete_feedback',
  rejected: 'submit_supervisor',
  appealed: 'resolve_appeal',
};

export function previewBulkAdvance(
  selectedIds: string[],
  evaluations: Evaluation[],
  actor: Employee,
  employees: Employee[],
  delegations: DelegationRecord[] = [],
  permissionPolicy?: GranularPermissionPolicy,
  snapshot?: BulkAdvanceSnapshot[],
): { selected: number; eligible: number; rows: BulkAdvanceRow[] } {
  const selected = Array.from(new Set(selectedIds));
  const byId = new Map(evaluations.map(evaluation => [evaluation.id, evaluation]));
  const employeesById = new Map(employees.map(employee => [employee.id, employee]));
  const snapshotById = new Map(snapshot?.map(item => [item.evaluationId, item]) || []);
  const rows = selected.map(id => {
    const evaluation = byId.get(id);
    const employee = evaluation && employeesById.get(evaluation.empId);
    const stage = evaluation?.stage || 'self_review';
    const target = nextStage[stage];
    const action = transitionAction[stage] || null;
    const base = {
      evaluationId: id,
      employeeId: evaluation?.empId || '',
      employeeName: employee?.name || 'نامشخص',
      employeeCode: employee?.code || '',
      fromStage: stage,
      toStage: target || null,
      action,
      currentOwnerId: evaluation?.currentAssigneeId,
    } as const;

    if (!evaluation || !employee || !target || !action) return { ...base, reason: 'wrong_state' as const };
    const previous = snapshotById.get(id);
    if (previous && (previous.fromStage !== stage || previous.currentOwnerId !== evaluation.currentAssigneeId)) return { ...base, reason: 'already_transitioned' as const };
    if (target === 'completed' && !hasRequiredFinalizationInputs(evaluation)) return { ...base, reason: 'missing_input' as const };
    const permission = workflowPermissionForTransition(action, stage);
    if (!permission) return { ...base, reason: 'permission_denied' as const };
    const allowed = canPerformWorkflowAction(actor, evaluation, permission, { employees, delegations, permissionPolicy, targetStage: target });
    if (!allowed.authorized) {
      const wrongOwner = Boolean(evaluation.currentAssigneeId && evaluation.currentAssigneeId !== actor.id && !allowed.delegation);
      return { ...base, reason: wrongOwner ? 'not_owned' as const : 'permission_denied' as const };
    }
    const owner = resolveWorkflowAssignee(target, employee, employees);
    if (target !== 'completed' && !employeesById.has(owner.id)) return { ...base, reason: 'missing_assignee' as const };
    return { ...base, reason: 'eligible' as const };
  });
  return { selected: rows.length, eligible: rows.filter(row => row.reason === 'eligible').length, rows };
}

export function buildBulkAdvanceUpdates(
  previewRows: BulkAdvanceRow[],
  evaluations: Evaluation[],
  employees: Employee[],
  actor: Employee,
  now = Date.now(),
): Evaluation[] {
  const eligibleIds = new Set(previewRows.filter(row => row.reason === 'eligible').map(row => row.evaluationId));
  const byId = new Map(evaluations.map(evaluation => [evaluation.id, evaluation]));
  return previewRows.filter(row => eligibleIds.has(row.evaluationId)).flatMap(row => {
    const current = byId.get(row.evaluationId);
    if (!current || !row.toStage || !row.action) return [];
    const owner = resolveWorkflowAssignee(row.toStage, employees.find(employee => employee.id === current.empId), employees);
    const log: WorkflowTransitionLog = {
      id: `bulk:${current.id}:${now}`,
      fromStage: row.fromStage,
      toStage: row.toStage,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: row.action,
      timestamp: new Date(now).toISOString(),
      comment: 'انتقال گروهی پس از بررسی صلاحیت هر پرونده',
    };
    return [{
      ...current,
      stage: row.toStage,
      status: row.toStage === 'completed' ? 'locked' as const : row.toStage === 'calibration_review' || row.toStage === 'hr_approval' ? 'calibrated' as const : 'draft' as const,
      currentAssigneeId: owner.id,
      currentAssigneeName: owner.name,
      currentAssigneeRole: owner.role,
      history: [log, ...(current.history || [])],
    }];
  });
}

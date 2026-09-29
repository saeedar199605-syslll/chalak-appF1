import { AuthSession, CloudflareEnv, jsonResponse } from '../../cloudflare/auth';
import { CloudState, sanitizeCloudState } from '../../cloudflare/syncState';
import { canDelegate, canPerformWorkflowAction, isWithinSupervisorScope, workflowPermissionForTransition, type DelegationRecord } from '../../src/utils/workflowAuthorization';
import { authorize, DEFAULT_GRANULAR_PERMISSION_POLICY, type GranularPermissionPolicy } from '../../src/utils/authorization';
import { validateEvaluationWrite } from '../../src/utils/workflowSecurity';
import { resolveWorkflowAssignee } from '../../src/utils/workflowAssignee';
import { getEmployeeDeletionBlockReason } from '../../src/utils/employeeDeletion';
import { thresholdsFollowDirection, validManualScoreLimits } from '../../src/utils/criterionScoring';
import { DEFAULT_ROUTE_RULES, type Criterion, type Employee, type Evaluation, type EvaluationRouteRule, type UserNotification, type WorkflowTransitionLog } from '../../src/types';

interface Context {
  request: Request;
  env: CloudflareEnv;
  data: { session?: AuthSession };
}

interface StateMeta {
  revision: number;
  updatedAt: string;
  updatedBy?: string;
  clientId?: string;
}

interface StateEnvelope {
  state?: unknown;
  baseRevision?: unknown;
  clientId?: unknown;
}

const NON_ADMIN_WRITABLE_KEYS = new Set([
  'pe_evaluations', 'pe_delegations', 'pe_notifications',
  'pe_lattice_okrs', 'pe_lattice_one_on_ones', 'pe_lattice_kudos', 'pe_tickets',
]);

type EmployeeRecord = { id: string; username?: string; supervisorId?: string; role?: string; unit?: string };
type EvaluationRecord = {
  id: string;
  empId: string;
  stage?: string;
  currentAssigneeId?: string;
  bulkOperationId?: string;
  history?: Array<{ id?: string; action?: string; actorId?: string; delegationId?: string }>;
};

async function readState(env: CloudflareEnv): Promise<{ state: CloudState; meta: StateMeta }> {
  const [rawState, rawMeta] = await Promise.all([
    env.CHALAK_DB.get('app_state'),
    env.CHALAK_DB.get('app_state_meta'),
  ]);
  let state: CloudState = {};
  let meta: StateMeta = { revision: 0, updatedAt: '' };
  try { state = rawState ? sanitizeCloudState(JSON.parse(rawState)) : {}; } catch { state = {}; }
  try {
    const parsed = rawMeta ? JSON.parse(rawMeta) as Partial<StateMeta> : {};
    meta = {
      revision: Number.isInteger(parsed.revision) && Number(parsed.revision) >= 0 ? Number(parsed.revision) : 0,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      updatedBy: typeof parsed.updatedBy === 'string' ? parsed.updatedBy : undefined,
      clientId: typeof parsed.clientId === 'string' ? parsed.clientId : undefined,
    };
  } catch { /* legacy state starts at revision zero */ }
  return { state, meta };
}

function allowedEmployeeIds(state: CloudState, session: AuthSession): Set<string> {
  const employees = getEmployees(state);
  const actor = getActor(state, session);
  const policy = getPermissionPolicy(state);
  const allowed = new Set<string>();
  if (!actor) return allowed;
  for (const employee of employees) {
    if (['evaluations', 'workflow', 'cartable'].some(module =>
      authorize(actor, module as 'evaluations' | 'workflow' | 'cartable', 'view', employee, policy).allowed
    )) allowed.add(employee.id);
  }
  return allowed;
}

function isExplicitReassignment(evaluation: EvaluationRecord | undefined): boolean {
  return Boolean(evaluation?.currentAssigneeId && evaluation.history?.[0]?.action === 'reassign_assignee');
}

function getEmployees(state: CloudState): Employee[] {
  return (Array.isArray(state.pe_employees) ? state.pe_employees : []) as Employee[];
}

function getDelegations(state: CloudState): DelegationRecord[] {
  return (Array.isArray(state.pe_delegations) ? state.pe_delegations : []) as DelegationRecord[];
}

function getPermissionPolicy(state: CloudState): GranularPermissionPolicy {
  const value = state.pe_granular_permissions as Partial<GranularPermissionPolicy> | undefined;
  return value?.version === 1 ? { ...DEFAULT_GRANULAR_PERMISSION_POLICY, ...value } : DEFAULT_GRANULAR_PERMISSION_POLICY;
}

function getRouteRules(state: CloudState): EvaluationRouteRule[] {
  return Array.isArray(state.pe_route_rules) ? state.pe_route_rules as EvaluationRouteRule[] : DEFAULT_ROUTE_RULES;
}

/** Validate criterion scoring configuration again at the cloud persistence boundary. */
function validCriterionScoringConfiguration(value: unknown): value is Criterion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const criterion = value as Partial<Criterion>;
  if (typeof criterion.id !== 'string' || !criterion.id) return false;
  if (criterion.dir !== undefined && criterion.dir !== 'more' && criterion.dir !== 'less') return false;
  if (criterion.allowedScoreMin !== undefined && typeof criterion.allowedScoreMin !== 'number') return false;
  if (criterion.allowedScoreMax !== undefined && typeof criterion.allowedScoreMax !== 'number') return false;
  if (!validManualScoreLimits(criterion.allowedScoreMin, criterion.allowedScoreMax)) return false;
  if (criterion.targetValue !== undefined && (typeof criterion.targetValue !== 'number' || !Number.isFinite(criterion.targetValue))) return false;
  if (criterion.scoreThresholds !== undefined) {
    const thresholds = criterion.scoreThresholds;
    if (!thresholds || typeof thresholds !== 'object' ||
        !['score5', 'score4', 'score3', 'score2'].every(key => typeof thresholds[key as keyof typeof thresholds] === 'number' && Number.isFinite(thresholds[key as keyof typeof thresholds]))) return false;
    if (!thresholdsFollowDirection(thresholds, criterion.dir || 'more')) return false;
  }
  return true;
}

function getActor(state: CloudState, session: AuthSession): Employee | null {
  if (session.role === 'admin') return { id: session.id, name: session.name, code: 'ADMIN', profileId: '', unit: '', role: 'admin', username: session.username };
  return getEmployees(state).find(employee => employee.id === session.id && employee.role === session.role) || null;
}

function notificationFor(evaluation: EvaluationRecord, actor: AuthSession, log: WorkflowTransitionLog | undefined, isCreation: boolean, employeeIds: Set<string>): UserNotification | null {
  // Score/document edits are not workflow events. Notify only on creation or
  // an explicit transition, keeping bulk edits from generating notification noise.
  if (!isCreation && !log) return null;
  const recipientId = evaluation.currentAssigneeId;
  if (!recipientId || recipientId === actor.id || !employeeIds.has(recipientId)) return null;
  const action = log?.action;
  const eventType: UserNotification['eventType'] = isCreation ? 'evaluation_started'
    : action === 'reject_to_employee' || action === 'reject_to_supervisor' ? 'workflow_returned'
      : action === 'reassign_assignee' ? 'workflow_reassigned'
        : action === 'route_hse' ? 'hse_review_requested'
          : action === 'complete_hse_review' ? 'hse_review_completed'
            : action === 'submit_self' ? 'workflow_submitted' : 'workflow_advanced';
  const eventKey = `${evaluation.id}:${log?.id || 'created'}`;
  return {
    id: `notification:${eventKey}`,
    eventKey,
    recipientId,
    eventType,
    title: eventType === 'evaluation_started' ? 'ارزیابی جدید' : eventType === 'workflow_returned' ? 'پرونده برای اصلاح بازگشت' : eventType === 'workflow_reassigned' ? 'پرونده به شما ارجاع شد' : eventType === 'hse_review_requested' ? 'درخواست بررسی HSE' : eventType === 'hse_review_completed' ? 'بررسی HSE تکمیل شد' : 'اقدام جدید در ارزیابی',
    message: eventType === 'hse_review_requested' ? `${actor.name} پرونده ${evaluation.id} را برای بررسی HSE ارجاع داد.` : eventType === 'hse_review_completed' ? `بررسی HSE پرونده ${evaluation.id} تکمیل شد.` : `پرونده ارزیابی ${evaluation.id} نیازمند پیگیری شماست.`,
    targetTab: eventType === 'evaluation_started' ? 'evaluations' : 'workflow',
    evaluationId: evaluation.id,
    actorId: actor.id,
    createdAt: new Date().toISOString(),
  };
}

function getNotifications(state: CloudState): UserNotification[] {
  return (Array.isArray(state.pe_notifications) ? state.pe_notifications : []) as UserNotification[];
}

function evaluationAuditState(evaluation: EvaluationRecord): Record<string, unknown> {
  const record = evaluation as Evaluation;
  return {
    stage: record.stage,
    status: record.status,
    currentAssigneeId: record.currentAssigneeId,
    bulkOperationId: record.bulkOperationId,
  };
}

function evaluationScoreChanges(before: EvaluationRecord | undefined, after: EvaluationRecord): Array<Record<string, unknown>> {
  if (!before) return [];
  const oldScores = new Map(((before as Evaluation).scores || []).map(score => [score.cid, score]));
  return ((after as Evaluation).scores || []).flatMap(score => {
    const previous = oldScores.get(score.cid);
    if (!previous || JSON.stringify(previous) === JSON.stringify(score)) return [];
    return [{ cid: score.cid, previous: { value: previous.value, self: previous.self, peer: previous.peer, doc: previous.doc, sourceType: previous.sourceType, sourceBreakdown: previous.sourceBreakdown }, resulting: { value: score.value, self: score.self, peer: score.peer, doc: score.doc, sourceType: score.sourceType, sourceBreakdown: score.sourceBreakdown } }];
  });
}

function validNotificationReadUpdates(changes: CloudState, current: CloudState, session: AuthSession): boolean {
  if (!Array.isArray(changes.pe_notifications)) return true;
  const old = new Map(getNotifications(current).map(item => [item.id, item]));
  return (changes.pe_notifications as UserNotification[]).every(next => {
    const previous = old.get(next?.id);
    if (!previous) return false;
    return previous.recipientId === session.id && next.recipientId === previous.recipientId &&
      next.eventKey === previous.eventKey && next.title === previous.title && next.message === previous.message &&
      next.actorId === previous.actorId && next.createdAt === previous.createdAt &&
      next.evaluationId === previous.evaluationId && next.targetTab === previous.targetTab &&
      (next.readAt === previous.readAt || (typeof next.readAt === 'string' && !previous.readAt));
  });
}

function delegatedAuthority(
  existing: EvaluationRecord,
  incoming: EvaluationRecord | undefined,
  state: CloudState,
  session: AuthSession
): boolean {
  const actor = getEmployees(state).find(employee => employee.id === session.id && employee.role === session.role);
  if (!actor) return false;
  const employees = getEmployees(state);
  const delegations = getDelegations(state);
  if (incoming) {
    const latest = incoming.history?.[0];
    if (!latest || latest.actorId !== session.id || !latest.delegationId ||
        latest.id === existing.history?.[0]?.id) return false;
    const action = workflowPermissionForTransition(
      latest.action as WorkflowTransitionLog['action'],
      (existing.stage || 'self_review') as Evaluation['stage']
    );
    if (!action) return false;
    const auth = canPerformWorkflowAction(actor, existing as Evaluation, action, { employees, delegations });
    return auth.authorized && auth.delegation?.id === latest.delegationId;
  }
  return (['approve', 'reject', 'reassign', 'advance'] as const).some(action =>
    Boolean(canPerformWorkflowAction(actor, existing as Evaluation, action, { employees, delegations }).delegation)
  );
}

function authorizedEvaluationWrite(existing: EvaluationRecord | undefined, incoming: EvaluationRecord, state: CloudState, session: AuthSession): boolean {
  if (!incoming?.id || !incoming.empId || (existing && existing.empId !== incoming.empId)) return false;
  // The client synchronizes its full visible array. Exact no-op entries are
  // safe and must not require fresh authority for each unrelated record.
  if (existing && JSON.stringify(existing) === JSON.stringify(incoming)) return true;
  if (existing && delegatedAuthority(existing, incoming, state, session)) return true;
  if (isExplicitReassignment(existing)) return existing?.currentAssigneeId === session.id;
  return allowedEmployeeIds(state, session).has(incoming.empId);
}

function authorizedDelegationWrite(incoming: DelegationRecord, existing: DelegationRecord | undefined, state: CloudState, session: AuthSession): boolean {
  if (!incoming?.id || incoming.delegateId === session.id || (session.role !== 'admin' && incoming.delegatorId !== session.id)) return false;
  if (session.role === 'admin' && existing) {
    if (JSON.stringify(incoming) === JSON.stringify(existing)) return true;
    return incoming.status === 'revoked' && existing.status !== 'revoked' && incoming.revokedById === session.id &&
      incoming.delegatorId === existing.delegatorId && incoming.delegateId === existing.delegateId &&
      incoming.action === existing.action && incoming.scope === existing.scope && incoming.targetEmpId === existing.targetEmpId &&
      incoming.targetUnit === existing.targetUnit && incoming.startDate === existing.startDate && incoming.endDate === existing.endDate &&
      incoming.createdAt === existing.createdAt && incoming.reason === existing.reason && Number.isFinite(incoming.revokedAt);
  }
  const employees = getEmployees(state);
  const delegator = employees.find(employee => employee.id === session.id && employee.role === session.role);
  if (!delegator || !employees.some(employee => employee.id === incoming.delegateId) ||
      !canDelegate(delegator, incoming.action, employees, getDelegations(state))) return false;
  if (existing) {
    return existing.delegatorId === session.id &&
      (JSON.stringify(incoming) === JSON.stringify(existing) ||
       (incoming.status === 'revoked' && existing.status !== 'revoked' && incoming.revokedById === session.id &&
        incoming.delegateId === existing.delegateId && incoming.action === existing.action &&
        incoming.scope === existing.scope && incoming.targetEmpId === existing.targetEmpId &&
        incoming.targetUnit === existing.targetUnit && incoming.startDate === existing.startDate &&
        incoming.endDate === existing.endDate));
  }
  if (!Number.isFinite(incoming.startDate) || !Number.isFinite(incoming.endDate) ||
      incoming.startDate > incoming.endDate || !['active', 'future'].includes(incoming.status)) return false;
  if (incoming.scope === 'employee') {
    const target = employees.find(employee => employee.id === incoming.targetEmpId);
    return Boolean(target && (session.role === 'supervisor'
      ? isWithinSupervisorScope(delegator, target, employees)
      : target.id === session.id));
  }
  if (incoming.scope === 'unit' && session.role === 'supervisor') {
    return Boolean(incoming.targetUnit && employees.some(employee =>
      employee.unit === incoming.targetUnit && isWithinSupervisorScope(delegator, employee, employees)));
  }
  return false;
}

function canAccessEvaluation(evaluation: EvaluationRecord, state: CloudState, session: AuthSession, scopedAllowedIds?: Set<string>): boolean {
  if (session.role === 'admin') return true;
  if (delegatedAuthority(evaluation, undefined, state, session)) return true;
  const allowedIds = scopedAllowedIds || allowedEmployeeIds(state, session);
  if (allowedIds.has(evaluation.empId)) return true;

  // An explicit assignment can grant visibility when no view scope was configured,
  // but it must not override an administrator's explicit unit/employee restriction.
  const actor = getActor(state, session);
  if (!actor || evaluation.currentAssigneeId !== session.id) return false;
  const policy = getPermissionPolicy(state);
  const hasExplicitViewGrant = (['evaluations', 'workflow', 'cartable'] as const).some(module => {
    const userGrants = policy.users?.[session.id]?.[module];
    const roleGrants = policy.roles?.[actor.role]?.[module];
    return Boolean(
      (userGrants && Object.prototype.hasOwnProperty.call(userGrants, 'view')) ||
      (roleGrants && Object.prototype.hasOwnProperty.call(roleGrants, 'view'))
    );
  });
  return !hasExplicitViewGrant;
}

function hasAuthorizedEvaluationChanges(current: CloudState, changes: CloudState, session: AuthSession): boolean {
  if (!validNotificationReadUpdates(changes, current, session)) return false;
  if (session.role === 'admin') {
    const oldAudit = JSON.stringify(current.pe_audit_logs || []);
    if ('pe_audit_logs' in changes && JSON.stringify(changes.pe_audit_logs) !== oldAudit) return false;
    if (!safeAdminMasterDataChanges(current, changes)) return false;
    const byId = new Map((Array.isArray(current.pe_evaluations) ? current.pe_evaluations as Evaluation[] : []).map(item => [item.id, item]));
    const actor = getActor(current, session);
    if (!actor) return false;
    if ('pe_criteria' in changes && (!Array.isArray(changes.pe_criteria) || !(changes.pe_criteria as unknown[]).every(validCriterionScoringConfiguration))) return false;
    const delegationsById = new Map(getDelegations(current).map(item => [item.id, item]));
    if (Array.isArray(changes.pe_delegations) && !(changes.pe_delegations as DelegationRecord[]).every(incoming =>
      authorizedDelegationWrite(incoming, delegationsById.get(incoming?.id), current, session))) return false;
    if (!Array.isArray(changes.pe_evaluations)) return true;
    const incomingIds = new Set((changes.pe_evaluations as Evaluation[]).map(item => item.id));
    if ([...byId.values()].some(item => !incomingIds.has(item.id) && (item.status === 'locked' || item.stage === 'completed'))) return false;
    return (changes.pe_evaluations as Evaluation[]).every(incoming => validateEvaluationWrite(byId.get(incoming?.id), incoming, { actor, employees: getEmployees(current), criteria: (current.pe_criteria || []) as Criterion[], delegations: getDelegations(current), permissionPolicy: getPermissionPolicy(current), routeRules: getRouteRules(current) }) === null);
  }
  if (Object.keys(changes).some(key => !NON_ADMIN_WRITABLE_KEYS.has(key))) return false;
  const byId = new Map((Array.isArray(current.pe_evaluations) ? current.pe_evaluations as EvaluationRecord[] : []).map(item => [item.id, item]));
  const actor = getActor(current, session);
  if (Array.isArray(changes.pe_evaluations) && (!actor || !(changes.pe_evaluations as Evaluation[]).every(incoming => {
    const existing = byId.get(incoming?.id) as Evaluation | undefined;
    return validateEvaluationWrite(existing, incoming, {
      actor, employees: getEmployees(current), criteria: (current.pe_criteria || []) as Criterion[], delegations: getDelegations(current), permissionPolicy: getPermissionPolicy(current), routeRules: getRouteRules(current),
    }) === null;
  }))) return false;
  const delegationsById = new Map(getDelegations(current).map(item => [item.id, item]));
  if (Array.isArray(changes.pe_delegations) && !(changes.pe_delegations as DelegationRecord[]).every(incoming =>
    authorizedDelegationWrite(incoming, delegationsById.get(incoming?.id), current, session))) return false;
  return true;
}

type SafeWriteDenialReason = 'workflow_owner_mismatch' | 'outside_scope' | 'stage_not_authorized' |
  'mis_owned_value_tamper' | 'finalized_record_locked' | 'score_limit_exceeded' | 'invalid_criterion_configuration' | 'permission_denied';

function safeDenialReason(failure: string): SafeWriteDenialReason {
  if (failure === 'owner_change_requires_reassignment') return 'workflow_owner_mismatch';
  if (failure === 'mis_value_read_only') return 'mis_owned_value_tamper';
  if (failure === 'completed_immutable') return 'finalized_record_locked';
  if (failure === 'score_limit_exceeded') return 'score_limit_exceeded';
  if (['score_stage_denied', 'invalid_transition', 'transition_missing_history', 'ceiling_exceeded'].includes(failure)) return 'stage_not_authorized';
  return 'permission_denied';
}

function diagnoseStateWriteDenial(current: CloudState, changes: CloudState, session: AuthSession): {
  reason: SafeWriteDenialReason;
  recordId?: string;
} {
  if (session.role === 'admin' && 'pe_criteria' in changes &&
      (!Array.isArray(changes.pe_criteria) || !(changes.pe_criteria as unknown[]).every(validCriterionScoringConfiguration))) {
    return { reason: 'invalid_criterion_configuration' };
  }
  const actor = getActor(current, session);
  if (actor && Array.isArray(changes.pe_evaluations)) {
    const byId = new Map((Array.isArray(current.pe_evaluations) ? current.pe_evaluations as Evaluation[] : []).map(item => [item.id, item]));
    for (const incoming of changes.pe_evaluations as Evaluation[]) {
      const existing = byId.get(incoming?.id);
      const failure = validateEvaluationWrite(existing, incoming, {
        actor,
        employees: getEmployees(current),
        criteria: (current.pe_criteria || []) as Criterion[],
        delegations: getDelegations(current),
        permissionPolicy: getPermissionPolicy(current),
        routeRules: getRouteRules(current),
      });
      if (!failure) continue;
      if (failure === 'permission_denied' && existing) {
        const employee = getEmployees(current).find(item => item.id === existing.empId);
        const scope = employee ? authorize(actor, 'evaluations', 'edit', employee, getPermissionPolicy(current)) : null;
        if (scope?.reason.includes('outside authorized employee scope')) return { reason: 'outside_scope' };
      }
      const visible = Boolean(existing && canAccessEvaluation(existing, current, session));
      return { reason: safeDenialReason(failure), ...(visible ? { recordId: existing.id } : {}) };
    }
  }
  return { reason: 'permission_denied' };
}

function safeWriteDenialResponse(current: CloudState, changes: CloudState, session: AuthSession): Response {
  const denial = diagnoseStateWriteDenial(current, changes, session);
  const messages: Record<SafeWriteDenialReason, string> = {
    workflow_owner_mismatch: 'این پرونده به مسئول دیگری واگذار شده است.',
    outside_scope: 'این پرونده خارج از محدوده دسترسی شماست.',
    stage_not_authorized: 'ثبت این تغییر در مرحله فعلی گردش کار مجاز نیست.',
    mis_owned_value_tamper: 'مقدار خودکار و محافظت‌شده قابل ویرایش دستی نیست.',
    finalized_record_locked: 'پرونده نهایی یا قفل‌شده قابل ویرایش نیست.',
    score_limit_exceeded: 'نمره واردشده خارج از بازه مجاز این معیار است.',
    invalid_criterion_configuration: 'محدوده نمره، هدف یا ترتیب آستانه‌های این معیار معتبر نیست.',
    permission_denied: 'برای ثبت این تغییر مجوز کافی وجود ندارد.',
  };
  return jsonResponse({
    error: messages[denial.reason],
    code: denial.reason === 'invalid_criterion_configuration' ? 'criterion_configuration_invalid' : 'evaluation_write_denied',
    reason: denial.reason,
    ...(denial.recordId ? { recordId: denial.recordId } : {}),
    retryable: false,
  }, 403);
}

function safeAdminMasterDataChanges(current: CloudState, changes: CloudState): boolean {
  if ('pe_archived_evaluations' in changes) {
    const before = Array.isArray(current.pe_archived_evaluations) ? current.pe_archived_evaluations as Array<Record<string, unknown>> : [];
    const after = Array.isArray(changes.pe_archived_evaluations) ? changes.pe_archived_evaluations as Array<Record<string, unknown>> : [];
    const afterById = new Map(after.map(item => [String(item.id), item]));
    if (before.some(item => JSON.stringify(item) !== JSON.stringify(afterById.get(String(item.id))))) return false;
  }
  const existingEmployees = Array.isArray(current.pe_employees) ? current.pe_employees as Employee[] : [];
  const employees = Array.isArray(changes.pe_employees) ? changes.pe_employees as Employee[] : existingEmployees;
  const remainingEmployeeIds = new Set(employees.map(item => item.id));
  const currentEvaluations = Array.isArray(current.pe_evaluations) ? current.pe_evaluations as Evaluation[] : [];
  const evaluations = Array.isArray(changes.pe_evaluations) ? changes.pe_evaluations as Evaluation[] : currentEvaluations;
  const archivedEvaluations = Array.isArray(current.pe_archived_evaluations) ? current.pe_archived_evaluations as Evaluation[] : [];
  for (const item of existingEmployees) {
    if (remainingEmployeeIds.has(item.id)) continue;
    if (getEmployeeDeletionBlockReason(item, employees, evaluations, archivedEvaluations)) return false;
  }

  const existingCriteria = Array.isArray(current.pe_criteria) ? current.pe_criteria as Array<{ id: string }> : [];
  const criteria = Array.isArray(changes.pe_criteria) ? changes.pe_criteria as Array<{ id: string }> : existingCriteria;
  const remainingCriterionIds = new Set(criteria.map(item => item.id));
  const existingProfiles = Array.isArray(current.pe_profiles) ? current.pe_profiles as Array<{ id: string; items?: Array<{ cid: string }> }> : [];
  const profiles = Array.isArray(changes.pe_profiles) ? changes.pe_profiles as Array<{ id: string; items?: Array<{ cid: string }> }> : existingProfiles;
  for (const criterion of existingCriteria) {
    if (remainingCriterionIds.has(criterion.id)) continue;
    if (existingProfiles.some(profile => profile.items?.some(item => item.cid === criterion.id)) ||
        currentEvaluations.some(evaluation => evaluation.scores.some(score => score.cid === criterion.id)) ||
        archivedEvaluations.some(evaluation => evaluation.scores.some(score => score.cid === criterion.id))) return false;
  }

  const remainingProfileIds = new Set(profiles.map(item => item.id));
  for (const profile of existingProfiles) {
    if (remainingProfileIds.has(profile.id)) continue;
    if (employees.some(employee => employee.profileId === profile.id) ||
        currentEvaluations.some(evaluation => evaluation.profileId === profile.id) ||
        archivedEvaluations.some(evaluation => evaluation.profileId === profile.id)) return false;
  }
  return true;
}

function scopedState(state: CloudState, session: AuthSession): CloudState {
  if (session.role === 'admin') return { ...state, pe_notifications: getNotifications(state).filter(item => item.recipientId === session.id) };
  const employees = Array.isArray(state.pe_employees) ? state.pe_employees as EmployeeRecord[] : [];
  const allowedIds = allowedEmployeeIds(state, session);
  const result: CloudState = { ...state };
  if (Array.isArray(state.pe_evaluations)) {
    const evaluations = state.pe_evaluations as EvaluationRecord[];
    result.pe_evaluations = evaluations.filter(item => canAccessEvaluation(item, state, session, allowedIds));
    const assignedEmployeeIds = new Set(evaluations.filter(item =>
      canAccessEvaluation(item, state, session, allowedIds)
    ).map(item => item.empId));
    allowedIds.forEach(id => assignedEmployeeIds.add(id));
    getDelegations(state).filter(item => item.delegatorId === session.id || item.delegateId === session.id)
      .forEach(item => { assignedEmployeeIds.add(item.delegatorId); assignedEmployeeIds.add(item.delegateId); });
    result.pe_employees = employees.filter(employee => assignedEmployeeIds.has(employee.id));
  }
  if (!Array.isArray(state.pe_evaluations)) {
    getDelegations(state).filter(item => item.delegatorId === session.id || item.delegateId === session.id)
      .forEach(item => { allowedIds.add(item.delegatorId); allowedIds.add(item.delegateId); });
    result.pe_employees = employees.filter(employee => allowedIds.has(employee.id));
  }
  result.pe_delegations = getDelegations(state).filter(item => item.delegatorId === session.id || item.delegateId === session.id);
  result.pe_notifications = getNotifications(state).filter(item => item.recipientId === session.id);
  const policy = getPermissionPolicy(state);
  result.pe_granular_permissions = {
    version: 1,
    roles: { [session.role]: policy.roles?.[session.role] },
    users: policy.users?.[session.id] ? { [session.id]: policy.users[session.id] } : {},
    workflowCeilings: { [session.role]: policy.workflowCeilings?.[session.role] },
    userWorkflowCeilings: policy.userWorkflowCeilings?.[session.id] ? { [session.id]: policy.userWorkflowCeilings[session.id] } : {},
    workflowStageCapabilities: { [session.role]: policy.workflowStageCapabilities?.[session.role] },
    userWorkflowStageCapabilities: policy.userWorkflowStageCapabilities?.[session.id] ? { [session.id]: policy.userWorkflowStageCapabilities[session.id] } : {},
  };
  for (const key of [
    'pe_reward_config', 'pe_reward_batch_history', 'pe_system_logs', 'pe_audit_logs',
    'pe_role_permissions', 'pe_user_custom_permissions', 'pe_locked_users',
  ]) delete result[key];
  return sanitizeCloudState(result);
}

function mergeAuthorizedState(current: CloudState, changes: CloudState, session: AuthSession): CloudState {
  const next = { ...current };
  if (Array.isArray(changes.pe_evaluations)) {
    const currentEvaluations = Array.isArray(current.pe_evaluations) ? current.pe_evaluations as EvaluationRecord[] : [];
    const currentById = new Map(currentEvaluations.map(item => [item.id, item]));
    const incoming = (changes.pe_evaluations as EvaluationRecord[]).filter(item => {
      const existing = currentById.get(item?.id);
      return !existing || JSON.stringify(existing) !== JSON.stringify(item);
    });
    const byId = new Map(currentEvaluations.map(item => [item.id, item]));
    const notifications = getNotifications(current);
    const notificationEventKeys = new Set(notifications.map(item => item.eventKey));
    const employeeIds = new Set(getEmployees(current).map(employee => employee.id));
    const audit = Array.isArray(current.pe_audit_logs) ? [...current.pe_audit_logs as Array<Record<string, unknown>>] : [];
    if (session.role === 'admin') {
      const retainedIds = new Set((changes.pe_evaluations as EvaluationRecord[]).map(item => item.id));
      for (const existing of currentEvaluations) {
        if (retainedIds.has(existing.id)) continue;
        byId.delete(existing.id);
        audit.unshift({ id: `audit:evaluation_deleted:${existing.id}`, timestamp: new Date().toISOString(), actorId: session.id, actorName: session.name, actorRole: session.role, action: 'evaluation_deleted', target: existing.id, previousState: { stage: existing.stage, status: (existing as Evaluation).status, currentAssigneeId: existing.currentAssigneeId }, resultingState: null, result: 'accepted' });
      }
    }
    incoming.forEach(item => {
      const existing = currentById.get(item.id);
      const newestLog = (item.history?.[0] || undefined) as WorkflowTransitionLog | undefined;
      const log = newestLog && (!existing || newestLog.id !== existing.history?.[0]?.id) ? newestLog : undefined;
      if (log && existing) {
        log.actorId = session.id;
        log.actorName = session.name;
        log.actorRole = session.role;
        log.timestamp = new Date().toISOString();
      }
      byId.set(item.id, item);
      const notification = notificationFor(item, session, log, !existing, employeeIds);
      if (notification && !notificationEventKeys.has(notification.eventKey)) {
        notifications.push(notification);
        notificationEventKeys.add(notification.eventKey);
      }
      const before = existing ? evaluationAuditState(existing) : null;
      const after = evaluationAuditState(item);
      const scoreChanges = evaluationScoreChanges(existing, item);
      if (scoreChanges.length) {
        if (before) before.scoreChanges = scoreChanges.map(change => ({ cid: change.cid, value: (change.previous as Record<string, unknown>).value }));
        after.scoreChanges = scoreChanges.map(change => ({ cid: change.cid, value: (change.resulting as Record<string, unknown>).value }));
      }
      audit.unshift({ id: `audit:${item.id}:${log?.id || (existing ? `edit:${crypto.randomUUID()}` : 'created')}`, timestamp: new Date().toISOString(), actorId: session.id, actorName: session.name, actorRole: session.role, action: log?.action || (existing ? (scoreChanges.length && item.bulkOperationId ? 'bulk_score' : 'evaluation_updated') : 'evaluation_started'), target: item.id, bulkOperationId: item.bulkOperationId, previousState: before, resultingState: after, result: 'accepted' });
    });
    next.pe_evaluations = Array.from(byId.values());
    next.pe_notifications = notifications.slice(0, 10_000);
    next.pe_audit_logs = audit.slice(0, 10_000);
  }
  if (Array.isArray(changes.pe_delegations)) {
    const byId = new Map(getDelegations(current).map(item => [item.id, item]));
    const notices = getNotifications(next);
    const noticeEventKeys = new Set(notices.map(item => item.eventKey));
    const audit = Array.isArray(next.pe_audit_logs) ? [...next.pe_audit_logs as Array<Record<string, unknown>>] : [];
    (changes.pe_delegations as DelegationRecord[]).forEach(item => {
      const previous = byId.get(item.id);
      if (previous && JSON.stringify(previous) === JSON.stringify(item)) return;
      byId.set(item.id, item);
      if (!previous || (previous.status !== 'revoked' && item.status === 'revoked')) {
        const isRevoked = item.status === 'revoked';
        const eventKey = `delegation:${item.id}:${isRevoked ? 'revoked' : 'created'}`;
        const recipientId = item.delegateId;
        if (!noticeEventKeys.has(eventKey)) {
          notices.push({
          id: `notification:${eventKey}`, eventKey, recipientId,
          eventType: isRevoked ? 'delegation_revoked' : 'delegation_created',
          title: isRevoked ? 'تفویض اختیار لغو شد' : 'اختیار جدید به شما واگذار شد',
          message: isRevoked ? 'دسترسی تفویض‌شده برای این پرونده/محدوده لغو شده است.' : 'یک اختیار موقت برای پیگیری پرونده به شما واگذار شده است.',
          targetTab: 'workflow', actorId: session.id, createdAt: new Date().toISOString(),
          });
          noticeEventKeys.add(eventKey);
        }
        audit.unshift({ id: `audit:delegation:${item.id}:${isRevoked ? 'revoked' : 'created'}`, timestamp: new Date().toISOString(), actorId: session.id, actorName: session.name, actorRole: session.role, action: isRevoked ? 'delegation_revoked' : 'delegation_created', target: item.id, previousState: previous || null, resultingState: item, result: 'accepted' });
      }
    });
    next.pe_delegations = Array.from(byId.values());
    next.pe_notifications = notices.slice(0, 10_000);
    next.pe_audit_logs = audit.slice(0, 10_000);
  }
  if (Array.isArray(changes.pe_notifications)) {
    const byId = new Map(getNotifications(current).map(item => [item.id, item]));
    (changes.pe_notifications as UserNotification[]).forEach(item => {
      const existing = byId.get(item.id);
      if (existing?.recipientId === session.id && !existing.readAt && item.readAt) byId.set(item.id, { ...existing, readAt: item.readAt });
    });
    next.pe_notifications = Array.from(byId.values());
  }
  for (const key of ['pe_lattice_okrs', 'pe_lattice_one_on_ones', 'pe_lattice_kudos', 'pe_tickets']) {
    if (key in changes) next[key] = changes[key];
  }
  if (session.role === 'admin') {
    for (const [key, value] of Object.entries(changes)) {
      if (key === 'pe_evaluations' || key === 'pe_notifications' || key === 'pe_audit_logs') continue;
      next[key] = value;
    }
    const masterKeys = ['pe_employees', 'pe_criteria', 'pe_profiles'];
    let audit = Array.isArray(next.pe_audit_logs) ? [...next.pe_audit_logs as Array<Record<string, unknown>>] : [];
    for (const masterKey of masterKeys) {
      if (!(masterKey in changes) || JSON.stringify(changes[masterKey]) === JSON.stringify(current[masterKey])) continue;
      const previousRows = Array.isArray(current[masterKey]) ? current[masterKey] as Array<Record<string, unknown>> : [];
      const nextRows = Array.isArray(changes[masterKey]) ? changes[masterKey] as Array<Record<string, unknown>> : [];
      const oldById = new Map(previousRows.map(item => [String(item.id), item]));
      const newById = new Map(nextRows.map(item => [String(item.id), item]));
      for (const [id, item] of oldById) if (!newById.has(id)) audit.unshift({ id: `audit:delete:${masterKey}:${id}:${Date.now()}`, timestamp: new Date().toISOString(), actorId: session.id, actorName: session.name, actorRole: session.role, action: `${masterKey}_deleted`, target: id, previousState: item, resultingState: null, result: 'accepted' });
      for (const [id, item] of newById) {
        const old = oldById.get(id);
        if (!old) audit.unshift({ id: `audit:create:${masterKey}:${id}:${Date.now()}`, timestamp: new Date().toISOString(), actorId: session.id, actorName: session.name, actorRole: session.role, action: `${masterKey}_created`, target: id, previousState: null, resultingState: item, result: 'accepted' });
        else if (JSON.stringify(old) !== JSON.stringify(item)) audit.unshift({ id: `audit:edit:${masterKey}:${id}:${Date.now()}`, timestamp: new Date().toISOString(), actorId: session.id, actorName: session.name, actorRole: session.role, action: `${masterKey}_edited`, target: id, previousState: old, resultingState: item, result: 'accepted' });
      }
    }
    next.pe_audit_logs = audit.slice(0, 10_000);
    const auditedPolicyKeys = ['pe_granular_permissions', 'pe_role_permissions', 'pe_user_custom_permissions'];
    const changedPolicyKeys = auditedPolicyKeys.filter(key => key in changes && JSON.stringify(changes[key]) !== JSON.stringify(current[key]));
    if (changedPolicyKeys.length) {
      const policyAudit = Array.isArray(next.pe_audit_logs) ? [...next.pe_audit_logs as Array<Record<string, unknown>>] : [];
      for (const changedPolicyKey of changedPolicyKeys) policyAudit.unshift({ id: `audit:policy:${Date.now()}:${session.id}:${changedPolicyKey}`, timestamp: new Date().toISOString(), actorId: session.id, actorName: session.name, actorRole: session.role, action: 'permission_policy_updated', target: changedPolicyKey, previousState: current[changedPolicyKey] ?? null, resultingState: changes[changedPolicyKey], result: 'accepted' });
      next.pe_audit_logs = policyAudit.slice(0, 10_000);
    }
    if ('pe_active_period' in changes && JSON.stringify(changes.pe_active_period) !== JSON.stringify(current.pe_active_period)) {
      const audit = Array.isArray(next.pe_audit_logs) ? [...next.pe_audit_logs as Array<Record<string, unknown>>] : [];
      audit.unshift({ id: `audit:period:${Date.now()}:${session.id}`, timestamp: new Date().toISOString(), actorId: session.id, actorName: session.name, actorRole: session.role, action: 'evaluation_period_started', target: String(changes.pe_active_period), previousState: current.pe_active_period ?? null, resultingState: changes.pe_active_period, result: 'accepted' });
      next.pe_audit_logs = audit.slice(0, 10_000);
    }
  }
  return sanitizeCloudState(next);
}

/** Resolve the new workflow owner from authoritative employee records before validating and persisting a transition. */
function resolveTransitionOwners(current: CloudState, changes: CloudState, session: AuthSession): CloudState {
  if (!Array.isArray(changes.pe_evaluations)) return changes;
  const employees = getEmployees(current);
  const existingById = new Map((Array.isArray(current.pe_evaluations) ? current.pe_evaluations as Evaluation[] : []).map(item => [item.id, item]));
  return {
    ...changes,
    pe_evaluations: (changes.pe_evaluations as Evaluation[]).map(incoming => {
      const existing = existingById.get(incoming.id);
      const newest = incoming.history?.[0];
      if (existing && newest?.action === 'route_hse' && newest.id !== existing.history?.[0]?.id) {
        const employee = employees.find(item => item.id === existing.empId);
        const reviewer = employee?.hseReviewerId ? employees.find(item => item.id === employee.hseReviewerId) : undefined;
        const reason = typeof incoming.hseReviewContext?.reason === 'string' ? incoming.hseReviewContext.reason.trim().slice(0, 1000) : '';
        return {
          ...incoming,
          status: existing.status,
          currentAssigneeId: reviewer?.id,
          currentAssigneeName: reviewer?.name,
          currentAssigneeRole: reviewer?.role,
          hseReviewContext: reviewer ? {
            requestedFromStage: existing.stage || 'self_review',
            returnStage: existing.stage || 'self_review',
            requestedById: session.id,
            requestedAt: new Date().toISOString(),
            hseReviewerId: reviewer.id,
            reason,
            returnAssigneeId: existing.currentAssigneeId || '',
            returnAssigneeName: existing.currentAssigneeName || '',
            returnAssigneeRole: existing.currentAssigneeRole || 'admin',
          } : incoming.hseReviewContext,
        };
      }
      if (existing && newest?.action === 'complete_hse_review' && newest.id !== existing.history?.[0]?.id) {
        const prior = existing.hseReviewContext;
        const note = typeof incoming.hseReviewContext?.reviewNote === 'string' ? incoming.hseReviewContext.reviewNote.trim().slice(0, 1000) : '';
        return {
          ...incoming,
          status: existing.status,
          currentAssigneeId: prior?.returnAssigneeId,
          currentAssigneeName: prior?.returnAssigneeName,
          currentAssigneeRole: prior?.returnAssigneeRole,
          hseReviewContext: prior ? { ...prior, reviewNote: note || undefined, reviewedAt: new Date().toISOString() } : incoming.hseReviewContext,
        };
      }
      if (session.role === 'admin') return incoming;
      if (!existing || !newest || newest.action === 'reassign_assignee' || (existing.stage || 'self_review') === (incoming.stage || 'self_review')) return incoming;
      const assignee = resolveWorkflowAssignee(incoming.stage || 'self_review', employees.find(item => item.id === incoming.empId), employees);
      return { ...incoming, currentAssigneeId: assignee.id, currentAssigneeName: assignee.name, currentAssigneeRole: assignee.role };
    }),
  };
}

function responseEnvelope(state: CloudState, meta: StateMeta, session: AuthSession): Response {
  return jsonResponse({ state: scopedState(state, session), ...meta });
}

export async function onRequestGet({ env, data }: Context): Promise<Response> {
  if (!data.session) return jsonResponse({ error: 'Authentication required.' }, 401);
  const { state, meta } = await readState(env);
  return responseEnvelope(state, meta, data.session);
}

export async function onRequestPost({ request, env, data }: Context): Promise<Response> {
  if (!data.session) return jsonResponse({ error: 'Authentication required.' }, 401);
  if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json.' }, 415);
  }
  const text = await request.text();
  if (text.length > 5_000_000) return jsonResponse({ error: 'Payload is too large.' }, 413);

  let body: StateEnvelope;
  try { body = JSON.parse(text) as StateEnvelope; }
  catch { return jsonResponse({ error: 'Invalid JSON payload.' }, 400); }

  const changes = sanitizeCloudState(body.state === undefined ? body : body.state);
  if (Object.keys(changes).length === 0) return jsonResponse({ error: 'No synchronized changes were supplied.' }, 400);
  const nonAdminSystemLogsOnly = data.session.role !== 'admin' &&
    Object.keys(changes).every(key => key === 'pe_system_logs');
  if (data.session.role !== 'admin') delete changes.pe_system_logs;

  const { state: current, meta: currentMeta } = await readState(env);
  const baseRevision = Number(body.baseRevision);
  if (!Number.isInteger(baseRevision) || baseRevision !== currentMeta.revision) {
    return jsonResponse({
      error: 'داده ابری در مرورگر دیگری تغییر کرده است؛ آخرین نسخه دریافت و ذخیره دوباره انجام شود.',
      revision: currentMeta.revision,
      updatedAt: currentMeta.updatedAt,
    }, 409);
  }
  // Authentication writes a local system-log entry for every user. These logs
  // are intentionally absent from non-admin cloud state and are never accepted
  // as authoritative; acknowledge a logs-only sync without persisting or bumping revision.
  if (nonAdminSystemLogsOnly) return responseEnvelope(current, currentMeta, data.session);
  const canonicalChanges = resolveTransitionOwners(current, changes, data.session);
  if (!hasAuthorizedEvaluationChanges(current, canonicalChanges, data.session)) {
    return safeWriteDenialResponse(current, canonicalChanges, data.session);
  }
  if (Array.isArray(canonicalChanges.pe_evaluations)) {
    const existing = new Map((Array.isArray(current.pe_evaluations) ? current.pe_evaluations as Evaluation[] : []).map(item => [item.id, item]));
    const ids = new Set<string>();
    const periodEmployees = new Set((Array.isArray(current.pe_evaluations) ? current.pe_evaluations as Evaluation[] : []).map(item => `${item.empId}\u0000${item.period}`));
    for (const item of canonicalChanges.pe_evaluations as Evaluation[]) {
      const old = existing.get(item.id);
      if (!old && (ids.has(item.id) || periodEmployees.has(`${item.empId}\u0000${item.period}`))) return jsonResponse({ error: 'An evaluation already exists for this employee and period.' }, 409);
      ids.add(item.id);
      periodEmployees.add(`${item.empId}\u0000${item.period}`);
    }
  }
  const next = mergeAuthorizedState(current, canonicalChanges, data.session);
  const meta: StateMeta = {
    revision: currentMeta.revision + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: data.session.username,
    clientId: typeof body.clientId === 'string' ? body.clientId.slice(0, 80) : undefined,
  };
  await env.CHALAK_DB.put('app_state', JSON.stringify(next));
  await env.CHALAK_DB.put('app_state_meta', JSON.stringify(meta));
  return responseEnvelope(next, meta, data.session);
}

export function onRequest(): Response {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' });
}

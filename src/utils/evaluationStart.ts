import { DEFAULT_ROUTE_RULES, type Employee, type Evaluation, type EvaluationRouteRule, type JobProfile, type WorkflowStageKey } from '../types';
import { resolveWorkflowAssignee } from './workflowAssignee';
import { canonicalEvaluationPeriodId, getEvaluationPeriodId } from './evaluationPeriod';

export interface EvaluationStartRow { employeeId: string; code: string; name: string; reason: 'eligible' | 'already_exists' | 'missing_profile' | 'missing_configuration'; }
export interface EvaluationStartPreview { selected: number; eligible: number; alreadyExists: number; ineligible: number; rows: EvaluationStartRow[]; }
export interface InitialEvaluationWorkflow {
  stage: WorkflowStageKey;
  status: 'draft';
  currentAssigneeId: string;
  currentAssigneeName: string;
  currentAssigneeRole: Employee['role'];
  routeRuleId?: string;
  requiresSelfReview: boolean;
}

export function resolveEvaluationRouteRule(employee: Employee, profileId: string, routeRules: EvaluationRouteRule[] = DEFAULT_ROUTE_RULES): EvaluationRouteRule | undefined {
  const matches = routeRules.filter(rule =>
    (!rule.unit || rule.unit === 'all' || rule.unit === employee.unit) &&
    (!rule.profileId || rule.profileId === 'all' || rule.profileId === profileId)
  );
  matches.sort((left, right) => {
    const score = (rule: EvaluationRouteRule) => (rule.profileId && rule.profileId !== 'all' ? 2 : 0) + (rule.unit && rule.unit !== 'all' ? 1 : 0);
    return score(right) - score(left);
  });
  return matches[0];
}

export function resolveInitialEvaluationWorkflow(
  employee: Employee,
  employees: Employee[],
  routeRules: EvaluationRouteRule[] = DEFAULT_ROUTE_RULES,
  profileId = employee.profileId,
): InitialEvaluationWorkflow {
  const rule = resolveEvaluationRouteRule(employee, profileId, routeRules);
  const stage: WorkflowStageKey = rule?.requiresSelfReview === true ? 'self_review' : 'supervisor_review';
  const assignee = resolveWorkflowAssignee(stage, {
    ...employee,
    supervisorId: rule?.defaultSupervisorId || employee.supervisorId,
  }, employees);
  return {
    stage,
    status: 'draft',
    currentAssigneeId: assignee.id,
    currentAssigneeName: assignee.name,
    currentAssigneeRole: assignee.role,
    routeRuleId: rule?.id,
    requiresSelfReview: rule?.requiresSelfReview === true,
  };
}

export function isEvaluationPeriodActive(activePeriod: string | null | undefined, requestedPeriod: string): boolean {
  return Boolean(activePeriod?.trim()) && activePeriod.trim() === requestedPeriod.trim();
}

export function previewEvaluationStart(employeeIds: string[], period: string, employees: Employee[], profiles: JobProfile[], evaluations: Evaluation[]): EvaluationStartPreview {
  const selected = Array.from(new Set(employeeIds));
  const selectedEmployees = new Map(employees.map(employee => [employee.id, employee]));
  const profilesById = new Map(profiles.map(profile => [profile.id, profile]));
  const periodId = canonicalEvaluationPeriodId(period);
  const existing = new Set(evaluations.map(evaluation => `${evaluation.empId}\u0000${getEvaluationPeriodId(evaluation)}`));
  const rows = selected.map(id => {
    const employee = selectedEmployees.get(id);
    if (!employee || !employee.profileId || !profilesById.has(employee.profileId)) return { employeeId: id, code: employee?.code || '', name: employee?.name || id, reason: 'missing_profile' as const };
    if (existing.has(`${id}\u0000${periodId}`)) return { employeeId: id, code: employee.code, name: employee.name, reason: 'already_exists' as const };
    const profile = profilesById.get(employee.profileId);
    if (!profile?.items?.length) return { employeeId: id, code: employee.code, name: employee.name, reason: 'missing_configuration' as const };
    return { employeeId: id, code: employee.code, name: employee.name, reason: 'eligible' as const };
  });
  return {
    selected: rows.length,
    eligible: rows.filter(row => row.reason === 'eligible').length,
    alreadyExists: rows.filter(row => row.reason === 'already_exists').length,
    ineligible: rows.filter(row => row.reason === 'missing_profile' || row.reason === 'missing_configuration').length,
    rows,
  };
}

export function buildEvaluationStarts(employeeIds: string[], period: string, employees: Employee[], profiles: JobProfile[], evaluations: Evaluation[], now = Date.now(), routeRules: EvaluationRouteRule[] = DEFAULT_ROUTE_RULES): Evaluation[] {
  if (!period.trim()) return [];
  const plan = previewEvaluationStart(employeeIds, period.trim(), employees, profiles, evaluations);
  const byId = new Map(employees.map(employee => [employee.id, employee]));
  const profilesById = new Map(profiles.map(profile => [profile.id, profile]));
  return plan.rows.filter(row => row.reason === 'eligible').flatMap(row => {
    const employee = byId.get(row.employeeId)!;
    const profile = profilesById.get(employee.profileId)!;
    const workflow = resolveInitialEvaluationWorkflow(employee, employees, routeRules, profile.id);
    return [{
      id: `eval:${encodeURIComponent(period.trim())}:${encodeURIComponent(employee.id)}`,
      empId: employee.id,
      profileId: profile.id,
      period: period.trim(),
      evaluationPeriodId: canonicalEvaluationPeriodId(period),
      ...workflow,
      scores: profile.items.map(item => ({ cid: item.cid, weight: item.weight, value: 0, self: 0, doc: '', sourceType: 'supervisor' as const })),
      created: now,
    }];
  });
}

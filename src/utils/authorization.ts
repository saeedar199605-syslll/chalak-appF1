import type { Employee, WorkflowStageKey } from '../types';

export const AUTHORIZATION_MODULES = [
  'employees', 'evaluations', 'mis', 'workflow', 'cartable', 'reports', 'analytics',
  'criteria', 'profiles', 'delegation', 'calibration', 'rewards', 'administration', 'support', 'onboarding',
] as const;
export type AuthorizationModule = typeof AUTHORIZATION_MODULES[number];
export const AUTHORIZATION_CAPABILITIES = [
  'view', 'create', 'edit', 'delete', 'bulk_edit', 'bulk_delete', 'import', 'export',
  'submit', 'return', 'approve', 'reassign', 'delegate', 'advance_workflow', 'finalize',
  'route_hse', 'bulk_score', 'employee_import', 'criteria_import', 'mis_import', 'kasra_import',
] as const;
export type AuthorizationCapability = typeof AUTHORIZATION_CAPABILITIES[number];
export type ImportType = 'employee' | 'criteria' | 'mis' | 'kasra';
/** Capabilities exposed for each source-supported product area. */
export const MODULE_CAPABILITIES: Record<AuthorizationModule, readonly AuthorizationCapability[]> = {
  employees: ['view', 'create', 'edit', 'delete', 'bulk_edit', 'bulk_delete', 'import', 'employee_import', 'export'],
  evaluations: ['view', 'create', 'edit', 'delete', 'bulk_edit', 'bulk_delete', 'bulk_score', 'import', 'export', 'submit', 'finalize'],
  mis: ['view', 'import', 'mis_import', 'kasra_import', 'export'],
  workflow: ['view', 'submit', 'return', 'approve', 'reassign', 'delegate', 'advance_workflow', 'finalize', 'route_hse'],
  cartable: ['view', 'submit', 'return', 'approve', 'reassign', 'delegate', 'advance_workflow', 'route_hse'],
  reports: ['view', 'export'],
  analytics: ['view', 'export'],
  criteria: ['view', 'create', 'edit', 'delete', 'import', 'criteria_import', 'export'],
  profiles: ['view', 'create', 'edit', 'delete', 'import', 'export'],
  delegation: ['view', 'create', 'edit', 'delete', 'delegate'],
  calibration: ['view', 'edit', 'approve', 'advance_workflow'],
  rewards: ['view', 'export', 'finalize'],
  administration: ['view', 'edit', 'import', 'export'],
  support: ['view', 'create', 'edit', 'delete'],
  onboarding: ['view', 'edit'],
};
export type PermissionScope =
  | { type: 'own' }
  | { type: 'direct_reports' }
  | { type: 'own_unit' }
  | { type: 'selected_units'; unitIds: string[] }
  | { type: 'authorized_employees'; employeeIds?: string[] }
  | { type: 'all' };
export type CapabilityGrants = Partial<Record<AuthorizationCapability, PermissionScope | null>>;
export type ModuleGrants = Partial<Record<AuthorizationModule, CapabilityGrants>>;
export type WorkflowStageCapability = 'view' | 'edit' | 'act' | 'advance';
export type WorkflowStageMatrix = Partial<Record<WorkflowStageKey, Partial<Record<WorkflowStageCapability, boolean>>>>;

export interface GranularPermissionPolicy {
  version: 1;
  roles?: Partial<Record<Employee['role'], ModuleGrants>>;
  users?: Record<string, ModuleGrants>;
  workflowCeilings?: Partial<Record<Employee['role'], WorkflowStageKey>>;
  userWorkflowCeilings?: Record<string, WorkflowStageKey>;
  workflowStageCapabilities?: Partial<Record<Employee['role'], WorkflowStageMatrix>>;
  userWorkflowStageCapabilities?: Record<string, WorkflowStageMatrix>;
}

export const WORKFLOW_STAGE_ORDER: readonly WorkflowStageKey[] = [
  'self_review', 'supervisor_review', 'peer_review', 'calibration_review',
  'hr_approval', 'feedback_meeting', 'completed',
];
export const DEFAULT_WORKFLOW_CEILINGS: Record<Employee['role'], WorkflowStageKey> = {
  admin: 'completed', supervisor: 'supervisor_review', employee: 'self_review',
};

const grant = (type: PermissionScope['type']): PermissionScope => ({ type } as PermissionScope);
export const DEFAULT_ROLE_GRANTS: Record<Employee['role'], ModuleGrants> = {
  admin: {},
  supervisor: {
    evaluations: { view: grant('authorized_employees'), edit: grant('authorized_employees'), submit: grant('authorized_employees'), advance_workflow: grant('authorized_employees') },
    mis: { view: grant('authorized_employees') },
    workflow: { view: grant('authorized_employees'), submit: grant('authorized_employees'), return: grant('authorized_employees'), approve: grant('authorized_employees'), reassign: grant('authorized_employees'), delegate: grant('authorized_employees'), advance_workflow: grant('authorized_employees') },
    cartable: { view: grant('authorized_employees'), advance_workflow: grant('authorized_employees') },
    reports: { view: grant('authorized_employees'), export: grant('authorized_employees') },
    analytics: { view: grant('authorized_employees') },
    support: { view: grant('own'), create: grant('own') },
    onboarding: { view: grant('own') },
  },
  employee: {
    evaluations: { view: grant('own'), edit: grant('own'), submit: grant('own') },
    workflow: { view: grant('own'), submit: grant('own') },
    cartable: { view: grant('own') },
    support: { view: grant('own'), create: grant('own') },
    onboarding: { view: grant('own') },
  },
};

export const DEFAULT_GRANULAR_PERMISSION_POLICY: GranularPermissionPolicy = {
  version: 1,
  workflowCeilings: DEFAULT_WORKFLOW_CEILINGS,
};

export function readGranularPermissionPolicy(): GranularPermissionPolicy {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_GRANULAR_PERMISSION_POLICY;
    const value = localStorage.getItem('pe_granular_permissions');
    if (!value) return DEFAULT_GRANULAR_PERMISSION_POLICY;
    const parsed = JSON.parse(value) as Partial<GranularPermissionPolicy>;
    return parsed.version === 1 ? { ...DEFAULT_GRANULAR_PERMISSION_POLICY, ...parsed } as GranularPermissionPolicy : DEFAULT_GRANULAR_PERMISSION_POLICY;
  } catch { return DEFAULT_GRANULAR_PERMISSION_POLICY; }
}

export function getEffectivePermissionGrant(policy: GranularPermissionPolicy, user: Employee, module: AuthorizationModule, capability: AuthorizationCapability): PermissionScope | null {
  const userGrants = policy.users?.[user.id]?.[module];
  if (userGrants && Object.prototype.hasOwnProperty.call(userGrants, capability)) return userGrants[capability] ?? null;
  const roleGrants = policy.roles?.[user.role]?.[module];
  if (roleGrants && Object.prototype.hasOwnProperty.call(roleGrants, capability)) return roleGrants[capability] ?? null;
  return DEFAULT_ROLE_GRANTS[user.role]?.[module]?.[capability] ?? null;
}

export function employeeWithinScope(actor: Employee, subject: Employee, grantScope: PermissionScope): boolean {
  switch (grantScope.type) {
    case 'all': return actor.role === 'admin';
    case 'own': return subject.id === actor.id;
    case 'direct_reports': return subject.supervisorId === actor.id;
    case 'own_unit': return Boolean(actor.unit && subject.unit === actor.unit && (subject.supervisorId === actor.id || !subject.supervisorId));
    case 'selected_units': return grantScope.unitIds.includes(subject.unit);
    case 'authorized_employees': {
      const ids = grantScope.employeeIds || [];
      if (ids.length) return ids.includes(subject.id);
      return subject.id === actor.id || subject.supervisorId === actor.id ||
        (!subject.supervisorId && subject.unit === actor.unit) || subject.peerReviewerId === actor.id ||
        subject.calibrationLeadId === actor.id || subject.approverId === actor.id || subject.hrPartnerId === actor.id;
    }
  }
}

export function authorize(
  actor: Employee,
  module: AuthorizationModule,
  capability: AuthorizationCapability,
  subject?: Employee,
  policy: GranularPermissionPolicy = readGranularPermissionPolicy(),
): { allowed: boolean; scope?: PermissionScope; reason: string } {
  if (actor.role === 'admin') return { allowed: true, scope: grant('all'), reason: 'administrator' };
  const permission = getEffectivePermissionGrant(policy, actor, module, capability);
  if (!permission) return { allowed: false, reason: `missing ${module}.${capability} grant` };
  if (!subject) return { allowed: true, scope: permission, reason: 'capability granted' };
  if (!employeeWithinScope(actor, subject, permission)) return { allowed: false, scope: permission, reason: 'outside authorized employee scope' };
  return { allowed: true, scope: permission, reason: 'capability and scope granted' };
}

const IMPORT_AUTHORIZATION: Record<ImportType, { module: AuthorizationModule; capability: AuthorizationCapability }> = {
  employee: { module: 'employees', capability: 'employee_import' },
  criteria: { module: 'criteria', capability: 'criteria_import' },
  mis: { module: 'mis', capability: 'mis_import' },
  kasra: { module: 'mis', capability: 'kasra_import' },
};

/** Import rights are independent capabilities; generic edit/import grants never imply source import rights. */
export function canImport(
  actor: Employee,
  importType: ImportType,
  subject?: Employee,
  policy: GranularPermissionPolicy = readGranularPermissionPolicy(),
): { allowed: boolean; scope?: PermissionScope; reason: string } {
  const target = IMPORT_AUTHORIZATION[importType];
  return authorize(actor, target.module, target.capability, subject, policy);
}

export function getWorkflowCeiling(actor: Employee, policy: GranularPermissionPolicy = readGranularPermissionPolicy()): WorkflowStageKey {
  return policy.userWorkflowCeilings?.[actor.id] ?? policy.workflowCeilings?.[actor.role] ?? DEFAULT_WORKFLOW_CEILINGS[actor.role];
}

export function isWithinWorkflowCeiling(actor: Employee, stage: WorkflowStageKey, policy: GranularPermissionPolicy = readGranularPermissionPolicy()): boolean {
  if (actor.role === 'admin') return true;
  const normalized = stage === 'rejected' ? (actor.role === 'employee' ? 'self_review' : 'supervisor_review') : stage === 'appealed' ? 'feedback_meeting' : stage;
  const stageIndex = WORKFLOW_STAGE_ORDER.indexOf(normalized);
  const ceilingIndex = WORKFLOW_STAGE_ORDER.indexOf(getWorkflowCeiling(actor, policy));
  return stageIndex >= 0 && ceilingIndex >= 0 && stageIndex <= ceilingIndex;
}

export function canAccessWorkflowStage(actor: Employee, stage: WorkflowStageKey, capability: WorkflowStageCapability, policy: GranularPermissionPolicy = readGranularPermissionPolicy()): boolean {
  if (actor.role === 'admin') return true;
  const configured = policy.userWorkflowStageCapabilities?.[actor.id]?.[stage]?.[capability] ?? policy.workflowStageCapabilities?.[actor.role]?.[stage]?.[capability];
  if (typeof configured === 'boolean') return configured;
  if (capability === 'view' || capability === 'act') return true;
  if (capability === 'edit') return actor.role === 'supervisor'
    ? stage === 'supervisor_review' || stage === 'feedback_meeting'
    : stage === 'self_review' || stage === 'rejected';
  return actor.role === 'supervisor' ? stage === 'supervisor_review' : stage === 'self_review' || stage === 'rejected';
}

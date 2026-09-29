import type { Employee } from '../types';
import { authorize, getEffectivePermissionGrant, readGranularPermissionPolicy, type AuthorizationModule } from './authorization';

const COMMON_TABS = new Set(['workflow', 'lattice-hub', 'onboarding', 'support']);
const ADMIN_TABS = new Set(['dashboard', 'evaluations', 'kickidler-hub', 'criteria', 'profiles', 'employees', 'calibration', 'reports', 'rewards', 'settings']);
const SUPERVISOR_TABS = new Set(['dashboard', 'evaluations', 'kickidler-hub']);
const EMPLOYEE_TABS = new Set(['my-evaluation']);
const TAB_MODULES: Partial<Record<string, AuthorizationModule>> = {
  dashboard: 'analytics', evaluations: 'evaluations', 'my-evaluation': 'evaluations',
  workflow: 'cartable', criteria: 'criteria', profiles: 'profiles', employees: 'employees',
  calibration: 'calibration', reports: 'reports', rewards: 'rewards',
  'kickidler-hub': 'analytics', settings: 'administration', support: 'support', onboarding: 'onboarding',
};

function hasExplicitGrant(user: Employee, module: AuthorizationModule, policy: ReturnType<typeof readGranularPermissionPolicy>): boolean {
  const userGrants = policy.users?.[user.id]?.[module];
  const roleGrants = policy.roles?.[user.role]?.[module];
  return Boolean((userGrants && Object.keys(userGrants).length) || (roleGrants && Object.keys(roleGrants).length));
}

export function defaultTabFor(user: Employee): string {
  return user.role === 'employee' ? 'my-evaluation' : 'dashboard';
}

export function canAccessTab(user: Employee, tab: string, policy = readGranularPermissionPolicy()): boolean {
  if (user.role === 'admin') return ADMIN_TABS.has(tab) || COMMON_TABS.has(tab);
  const module = TAB_MODULES[tab];
  if (module && hasExplicitGrant(user, module, policy)) return authorize(user, module, 'view', undefined, policy).allowed;
  if (module && authorize(user, module, 'view', undefined, policy).allowed) return true;
  if (COMMON_TABS.has(tab)) return true;
  if (tab === 'criteria' && user.permissions?.includes('manage_criteria')) return true;
  if (tab === 'reports' && user.permissions?.includes('view_all_reports')) return true;
  if (user.role === 'supervisor') return SUPERVISOR_TABS.has(tab);
  return EMPLOYEE_TABS.has(tab);
}

import { UserRole, Employee } from '../types';

export interface ManualAccessPolicy {
  allowedRolesToView: UserRole[];
  allowedRolesToDownload: UserRole[];
  allowedUserIds: string[];
  deniedUserIds: string[];
  allowedUnits: string[];
  showWatermark: boolean;
  lastUpdated?: string;
  updatedBy?: string;
}

export const DEFAULT_MANUAL_ACCESS_POLICY: ManualAccessPolicy = {
  allowedRolesToView: ['admin', 'supervisor', 'employee'],
  allowedRolesToDownload: ['admin', 'supervisor', 'employee'],
  allowedUserIds: [],
  deniedUserIds: [],
  allowedUnits: [],
  showWatermark: true,
  lastUpdated: '۱۴۰۳/۰۶/۱۵',
  updatedBy: 'مدیر ارشد سیستم (admin)'
};

export function getManualAccessPolicy(): ManualAccessPolicy {
  try {
    const saved = localStorage.getItem('pe_manual_access_policy');
    if (saved) {
      const parsed = JSON.parse(saved);
      const allowedRolesToView: UserRole[] = Array.isArray(parsed.allowedRolesToView) 
        ? parsed.allowedRolesToView 
        : ['admin', 'supervisor', 'employee'];
      const allowedRolesToDownload: UserRole[] = Array.isArray(parsed.allowedRolesToDownload) 
        ? parsed.allowedRolesToDownload 
        : ['admin', 'supervisor', 'employee'];

      // Admin always has view and download access
      if (!allowedRolesToView.includes('admin')) allowedRolesToView.push('admin');
      if (!allowedRolesToDownload.includes('admin')) allowedRolesToDownload.push('admin');

      return {
        allowedRolesToView,
        allowedRolesToDownload,
        allowedUserIds: Array.isArray(parsed.allowedUserIds) ? parsed.allowedUserIds : [],
        deniedUserIds: Array.isArray(parsed.deniedUserIds) ? parsed.deniedUserIds : [],
        allowedUnits: Array.isArray(parsed.allowedUnits) ? parsed.allowedUnits : [],
        showWatermark: parsed.showWatermark !== false,
        lastUpdated: parsed.lastUpdated || '۱۴۰۳/۰۶/۱۵',
        updatedBy: parsed.updatedBy || 'مدیر ارشد سیستم (admin)'
      };
    }
  } catch (e) {
    console.error('Failed to parse manual access policy', e);
  }
  return DEFAULT_MANUAL_ACCESS_POLICY;
}

export function saveManualAccessPolicy(policy: ManualAccessPolicy, updatedBy = 'مدیر سیستم'): void {
  const safePolicy: ManualAccessPolicy = {
    allowedRolesToView: Array.from(new Set([...policy.allowedRolesToView, 'admin' as UserRole])),
    allowedRolesToDownload: Array.from(new Set([...policy.allowedRolesToDownload, 'admin' as UserRole])),
    allowedUserIds: policy.allowedUserIds || [],
    deniedUserIds: policy.deniedUserIds || [],
    allowedUnits: policy.allowedUnits || [],
    showWatermark: policy.showWatermark !== false,
    lastUpdated: new Date().toLocaleDateString('fa-IR'),
    updatedBy
  };
  localStorage.setItem('pe_manual_access_policy', JSON.stringify(safePolicy));
  window.dispatchEvent(new Event('manual_access_policy_updated'));
}

export function canUserViewManual(user: Employee | null, policy?: ManualAccessPolicy): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.username === 'admin') return true;

  const currentPolicy = policy || getManualAccessPolicy();

  // Explicit individual blacklist
  if (currentPolicy.deniedUserIds && currentPolicy.deniedUserIds.includes(user.id)) {
    return false;
  }

  // Explicit individual whitelist
  if (currentPolicy.allowedUserIds && currentPolicy.allowedUserIds.includes(user.id)) {
    return true;
  }

  // Department filter (if any specific units are configured)
  if (currentPolicy.allowedUnits && currentPolicy.allowedUnits.length > 0) {
    if (!currentPolicy.allowedUnits.includes(user.unit)) {
      return false;
    }
  }

  return currentPolicy.allowedRolesToView.includes(user.role);
}

export function canUserDownloadManual(user: Employee | null, policy?: ManualAccessPolicy): boolean {
  if (!user) return false;
  const currentPolicy = policy || getManualAccessPolicy();

  if (!canUserViewManual(user, currentPolicy)) {
    return false;
  }

  if (user.role === 'admin' || user.username === 'admin') return true;

  return currentPolicy.allowedRolesToDownload.includes(user.role);
}

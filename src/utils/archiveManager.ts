/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Evaluation, Employee, JobProfile, Criterion } from '../types';

export const ARCHIVE_STORAGE_KEY = 'pe_archived_evaluations';
export const AUTO_ARCHIVE_SETTINGS_KEY = 'pe_auto_archive_settings';

export interface AutoArchiveSettings {
  enabled: boolean;
  archiveLockedOnly: boolean;
  archiveOlderThanMonths: number; // e.g. 6 months
  lastAutoArchiveRun?: string;
}

export interface ArchiveStats {
  archivedCount: number;
  activeCount: number;
  archivedPeriods: string[];
  estimatedBytesSaved: number; // in KB/MB
  performanceBoostEstimate: string; // e.g. "+35%"
}

/**
 * Retrieve all archived evaluations from local storage
 */
export function getArchivedEvaluations(): Evaluation[] {
  try {
    const raw = localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading archived evaluations:', err);
    return [];
  }
}

/**
 * Persist archived evaluations
 */
export function saveArchivedEvaluations(archived: Evaluation[]): void {
  try {
    localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(archived));
  } catch (err) {
    console.error('Error saving archived evaluations:', err);
  }
}

/**
 * Retrieve auto-archive settings
 */
export function getAutoArchiveSettings(): AutoArchiveSettings {
  try {
    const raw = localStorage.getItem(AUTO_ARCHIVE_SETTINGS_KEY);
    if (!raw) {
      return {
        enabled: false,
        archiveLockedOnly: true,
        archiveOlderThanMonths: 6
      };
    }
    return JSON.parse(raw);
  } catch {
    return {
      enabled: false,
      archiveLockedOnly: true,
      archiveOlderThanMonths: 6
    };
  }
}

export function saveAutoArchiveSettings(settings: AutoArchiveSettings): void {
  try {
    localStorage.setItem(AUTO_ARCHIVE_SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('Error saving auto archive settings:', err);
  }
}

/**
 * Calculate storage stats and performance metrics
 */
export function calculateArchiveStats(activeEvaluations: Evaluation[], archivedEvaluations: Evaluation[]): ArchiveStats {
  const archivedPeriods = Array.from(new Set(archivedEvaluations.map(e => e.period))).filter(Boolean);
  
  // Approximate size calculation
  const archivedBytes = JSON.stringify(archivedEvaluations).length;
  const estimatedBytesSaved = Math.round((archivedBytes / 1024) * 10) / 10; // in KB

  const total = activeEvaluations.length + archivedEvaluations.length;
  const ratioArchived = total > 0 ? archivedEvaluations.length / total : 0;
  const performanceBoost = Math.round(ratioArchived * 45); // up to 45% estimated load speedup

  return {
    archivedCount: archivedEvaluations.length,
    activeCount: activeEvaluations.length,
    archivedPeriods,
    estimatedBytesSaved,
    performanceBoostEstimate: `+${Math.max(10, performanceBoost)}٪`
  };
}

/**
 * Detects distinct evaluation periods and determines if they are older / candidates for archiving
 */
export function detectPeriodsSummary(evaluations: Evaluation[], activePeriod: string = 'نیمه اول ۱۴۰۵') {
  const periodMap = new Map<string, { count: number; lockedCount: number; isCurrent: boolean }>();

  evaluations.forEach(ev => {
    const period = ev.period || 'نامشخص';
    const isLocked = ev.status === 'locked' || ev.status === 'calibrated';
    const isCurrent = period === activePeriod || period.includes('۱۴۰۵');

    const current = periodMap.get(period) || { count: 0, lockedCount: 0, isCurrent };
    current.count += 1;
    if (isLocked) current.lockedCount += 1;
    current.isCurrent = isCurrent;
    periodMap.set(period, current);
  });

  return Array.from(periodMap.entries()).map(([period, data]) => ({
    period,
    ...data,
    isArchivable: !data.isCurrent || data.lockedCount === data.count
  }));
}

/**
 * Archives a specific evaluation by ID
 */
export function archiveEvaluationById(
  evalId: string,
  activeEvaluations: Evaluation[],
  archivedEvaluations: Evaluation[]
): { nextActive: Evaluation[]; nextArchived: Evaluation[]; movedItem: Evaluation | null } {
  const target = activeEvaluations.find(e => e.id === evalId);
  if (!target) {
    return { nextActive: activeEvaluations, nextArchived: archivedEvaluations, movedItem: null };
  }

  const nextActive = activeEvaluations.filter(e => e.id !== evalId);
  // Avoid duplicate in archived
  const filteredArchived = archivedEvaluations.filter(e => e.id !== evalId);
  const nextArchived = [target, ...filteredArchived];

  saveArchivedEvaluations(nextArchived);
  return { nextActive, nextArchived, movedItem: target };
}

/**
 * Archives an entire period
 */
export function archivePeriod(
  periodName: string,
  activeEvaluations: Evaluation[],
  archivedEvaluations: Evaluation[]
): { nextActive: Evaluation[]; nextArchived: Evaluation[]; movedCount: number } {
  const toArchive = activeEvaluations.filter(e => e.period === periodName);
  if (toArchive.length === 0) {
    return { nextActive: activeEvaluations, nextArchived: archivedEvaluations, movedCount: 0 };
  }

  const nextActive = activeEvaluations.filter(e => e.period !== periodName);
  const existingIds = new Set(toArchive.map(e => e.id));
  const remainingArchived = archivedEvaluations.filter(e => !existingIds.has(e.id));
  const nextArchived = [...toArchive, ...remainingArchived];

  saveArchivedEvaluations(nextArchived);
  return { nextActive, nextArchived, movedCount: toArchive.length };
}

/**
 * Restores an evaluation from archive back to active database
 */
export function restoreArchivedEvaluationById(
  evalId: string,
  activeEvaluations: Evaluation[],
  archivedEvaluations: Evaluation[]
): { nextActive: Evaluation[]; nextArchived: Evaluation[]; restoredItem: Evaluation | null } {
  const target = archivedEvaluations.find(e => e.id === evalId);
  if (!target) {
    return { nextActive: activeEvaluations, nextArchived: archivedEvaluations, restoredItem: null };
  }

  const nextArchived = archivedEvaluations.filter(e => e.id !== evalId);
  const nextActive = [target, ...activeEvaluations.filter(e => e.id !== evalId)];

  saveArchivedEvaluations(nextArchived);
  return { nextActive, nextArchived, restoredItem: target };
}

/**
 * Restores an entire period back to active database
 */
export function restoreArchivedPeriod(
  periodName: string,
  activeEvaluations: Evaluation[],
  archivedEvaluations: Evaluation[]
): { nextActive: Evaluation[]; nextArchived: Evaluation[]; restoredCount: number } {
  const toRestore = archivedEvaluations.filter(e => e.period === periodName);
  if (toRestore.length === 0) {
    return { nextActive: activeEvaluations, nextArchived: archivedEvaluations, restoredCount: 0 };
  }

  const nextArchived = archivedEvaluations.filter(e => e.period !== periodName);
  const restoredIds = new Set(toRestore.map(e => e.id));
  const cleanActive = activeEvaluations.filter(e => !restoredIds.has(e.id));
  const nextActive = [...toRestore, ...cleanActive];

  saveArchivedEvaluations(nextArchived);
  return { nextActive, nextArchived, restoredCount: toRestore.length };
}

/**
 * Auto-archive all completed / old cycles (e.g. anything older than current period or 100% locked past periods)
 */
export function autoArchiveOldCycles(
  activeEvaluations: Evaluation[],
  archivedEvaluations: Evaluation[],
  currentActivePeriod: string = 'نیمه اول ۱۴۰۵'
): { nextActive: Evaluation[]; nextArchived: Evaluation[]; movedCount: number; archivedPeriodsList: string[] } {
  // Find all evaluations where period is not current period
  const toArchive = activeEvaluations.filter(ev => {
    // Keep current active period
    if (ev.period === currentActivePeriod) return false;
    // Archive locked or old periods (e.g. ۱۴۰۴, ۱۴۰۳, etc.)
    return ev.period.includes('۱۴۰۴') || ev.period.includes('۱۴۰۳') || ev.status === 'locked';
  });

  if (toArchive.length === 0) {
    return { nextActive: activeEvaluations, nextArchived: archivedEvaluations, movedCount: 0, archivedPeriodsList: [] };
  }

  const archivedIds = new Set(toArchive.map(e => e.id));
  const nextActive = activeEvaluations.filter(e => !archivedIds.has(e.id));
  const cleanArchived = archivedEvaluations.filter(e => !archivedIds.has(e.id));
  const nextArchived = [...toArchive, ...cleanArchived];

  const archivedPeriodsList = Array.from(new Set(toArchive.map(e => e.period)));
  saveArchivedEvaluations(nextArchived);

  return {
    nextActive,
    nextArchived,
    movedCount: toArchive.length,
    archivedPeriodsList
  };
}

/**
 * Export archived evaluations to CSV with UTF-8 BOM
 */
export function exportArchivedEvaluationsToCSV(
  archivedEvaluations: Evaluation[],
  employees: Employee[],
  profiles: JobProfile[]
): void {
  const headers = [
    'کد پرسنلی',
    'نام و نام خانوادگی',
    'واحد سازمانی',
    'دوره ارزیابی',
    'عنوان شغل',
    'وضعیت نهایی',
    'میانگین موزون امتیاز',
    'سطح شایستگی',
    'تعداد شاخص‌ها',
    'یادداشت مربیگری و توضیحات',
    'تاریخ ثبت سابقه'
  ];

  const rows = archivedEvaluations.map(ev => {
    const emp = employees.find(e => e.id === ev.empId);
    const prof = profiles.find(p => p.id === ev.profileId);
    
    // Calculate weighted score
    const totalWeight = ev.scores.reduce((sum, s) => sum + s.weight, 0);
    const weightedSum = ev.scores.reduce((sum, s) => sum + ((s.value || 0) * s.weight), 0);
    const avgScore = totalWeight > 0 ? (weightedSum / totalWeight).toFixed(2) : '0';

    let level = 'متوسط';
    const num = Number(avgScore);
    if (num >= 4.5) level = 'عالی';
    else if (num >= 3.75) level = 'خوب';
    else if (num >= 2.75) level = 'متوسط';
    else level = 'نیازمند بهبود';

    const statusText = ev.status === 'locked' ? 'قفل شده' : ev.status === 'calibrated' ? 'کالیبره شده' : 'پیش‌نویس';
    const createdDate = ev.created ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date(ev.created)) : '-';

    const escapeCSV = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    return [
      escapeCSV(emp?.code || ev.empId),
      escapeCSV(emp?.name || 'نامشخص'),
      escapeCSV(emp?.unit || '-'),
      escapeCSV(ev.period),
      escapeCSV(prof?.title || '-'),
      escapeCSV(statusText),
      escapeCSV(avgScore),
      escapeCSV(level),
      escapeCSV(ev.scores.length),
      escapeCSV(ev.note || ''),
      escapeCSV(createdDate)
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `آرشیو_تاریخچه_عملکرد_اصفهان_چالاک_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

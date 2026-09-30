/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Centralized Database & Storage Service for Esfahan Chalak Performance System
 * Fully compatible with:
 * - Cloudflare Pages (Free tier static SPA & KV)
 * - Local & Containerized Node/Express Server
 * - Offline-first browser storage (resilient & persistent)
 */

import { Criterion, JobProfile, Employee, Evaluation, OKRGoal, OneOnOneMeeting, PraiseKudos } from '../types';
import { SEED_CRITERIA, SEED_PROFILES, SEED_EMPLOYEES, SEED_EVALUATIONS } from '../seedData';
import { INITIAL_OKRS, INITIAL_ONE_ON_ONES, INITIAL_KUDOS } from '../data/latticeKickidlerSeed';
import { CLOUD_SYNC_KEYS, CloudState, isCloudSyncKey } from '../../cloudflare/syncState';
import { DelegationRecord } from './workflowAuthorization';
import type { MasterDataSourceImportContext, ProtectedSourceImportContext, SourceImportContext } from './sourceImports';
import { planEmployeeBulkDeletion } from './employeeDeletion';
import { CLOUD_SYNC_MAX_RETRIES, CLOUD_SYNC_POLL_INTERVAL_MS, cloudWriteFingerprint, getCloudRetryDelay, isCurrentSyncGeneration, isSameRejectedSnapshot, isTerminalCloudWriteStatus, selectCloudSyncOperation, shouldAttemptSync, shouldRetryCloudStatus, shouldScheduleCloudSyncFollowup } from '../../cloudflare/syncPolicy';

const STORAGE_KEYS = {
  EMPLOYEES: 'pe_employees',
  CRITERIA: 'pe_criteria',
  PROFILES: 'pe_profiles',
  EVALUATIONS: 'pe_evaluations',
  ARCHIVED_EVALUATIONS: 'pe_archived_evaluations',
  THEME: 'pe_theme',
  ACTIVE_PERIOD: 'pe_active_period',
  BACKUP_TIMESTAMP: 'pe_last_backup_ts',
  OKRS: 'pe_lattice_okrs',
  ONE_ON_ONES: 'pe_lattice_one_on_ones',
  KUDOS: 'pe_lattice_kudos',
  WORKSHOP_TARGETS: 'pe_workshop_targets',
  DELEGATIONS: 'pe_delegations'
} as const;

export const CURRENT_ACTIVE_PERIOD = 'بهار ۱۴۰۵';

const BACKUP_COLLECTION_KEYS = [
  'employees', 'criteria', 'profiles', 'evaluations', 'archivedEvaluations', 'delegations',
] as const;

function isBackupRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateBackupTopLevel(data: unknown): asserts data is Record<string, any> {
  if (!isBackupRecord(data) || !isBackupRecord(data.meta)) throw new Error('Invalid backup top-level structure');
  const schemaVersion = (data.meta as Record<string, unknown>).schemaVersion;
  if (schemaVersion !== 1) throw new Error('Unsupported or invalid backup schema version');
  for (const key of BACKUP_COLLECTION_KEYS) if (!Array.isArray(data[key])) throw new Error(`Backup collection ${key} must be an array`);
}

function validateBackupCollectionShapes(data: Record<string, any>): void {
  for (const key of BACKUP_COLLECTION_KEYS) {
    for (const record of data[key]) {
      if (!isBackupRecord(record)) throw new Error(`Backup collection ${key} contains an invalid record`);
    }
  }
}

function requireString(record: Record<string, unknown>, key: string, collection: string): void {
  if (typeof record[key] !== 'string') throw new Error(`Backup ${collection}.${key} must be a string`);
}

function requireNumber(record: Record<string, unknown>, key: string, collection: string): void {
  if (typeof record[key] !== 'number') throw new Error(`Backup ${collection}.${key} must be a number`);
}

function validateBackupRequiredFields(data: Record<string, any>): void {
  for (const record of data.employees) for (const key of ['id', 'name', 'code', 'profileId', 'unit', 'role', 'username']) requireString(record, key, 'employees');
  for (const record of data.criteria) for (const key of ['id', 'code', 'cat', 'name', 'def']) requireString(record, key, 'criteria');
  for (const record of data.profiles) {
    for (const key of ['id', 'title', 'code', 'family']) requireString(record, key, 'profiles');
    if (typeof record.locked !== 'boolean' || !Array.isArray(record.items)) throw new Error('Backup profiles required shape is invalid');
    for (const item of record.items) {
      if (!isBackupRecord(item)) throw new Error('Backup profiles.items record is invalid');
      requireString(item, 'cid', 'profiles.items');
      requireNumber(item, 'weight', 'profiles.items');
    }
  }
  for (const record of [...data.evaluations, ...data.archivedEvaluations]) {
    for (const key of ['id', 'empId', 'profileId', 'period', 'status']) requireString(record, key, 'evaluations');
    requireNumber(record, 'created', 'evaluations');
    if (!Array.isArray(record.scores)) throw new Error('Backup evaluations.scores must be an array');
    for (const score of record.scores) {
      if (!isBackupRecord(score)) throw new Error('Backup evaluations.scores record is invalid');
      requireString(score, 'cid', 'evaluations.scores');
      for (const key of ['weight', 'value', 'self']) requireNumber(score, key, 'evaluations.scores');
    }
  }
  for (const record of data.delegations) {
    for (const key of ['id', 'delegatorId', 'delegateId', 'action', 'scope', 'status']) requireString(record, key, 'delegations');
    for (const key of ['startDate', 'endDate']) requireNumber(record, key, 'delegations');
  }
}

function validateBackupUniqueIds(data: Record<string, any>): void {
  for (const key of BACKUP_COLLECTION_KEYS) {
    const seen = new Set<string>();
    for (const record of data[key]) {
      if (seen.has(record.id)) throw new Error(`Backup collection ${key} contains duplicate id`);
      seen.add(record.id);
    }
  }
}

function validateBackupReferences(data: Record<string, any>): void {
  const employeeIds = new Set(data.employees.map((employee: Record<string, unknown>) => employee.id));
  for (const evaluation of data.evaluations) {
    if (!employeeIds.has(evaluation.empId)) throw new Error('Backup evaluation references an unknown employee');
  }
}

const OPTIONAL_BACKUP_KEYS = {
  permissions: 'pe_role_permissions',
  customUserPermissions: 'pe_user_custom_permissions',
  lockedUsers: 'pe_locked_users',
  logs: 'pe_system_logs',
} as const;

const PENDING_SYNC_BACKUP_PREFIX = 'pe_pending_cloud_write_v1_';

function hasBackupField(data: Record<string, any>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function validateOptionalBackupSettings(data: Record<string, any>): void {
  const requireBooleans = (record: Record<string, unknown>, keys: readonly string[], label: string) => {
    for (const key of keys) if (typeof record[key] !== 'boolean') throw new Error(`Backup ${label}.${key} must be a boolean`);
  };
  if (hasBackupField(data, 'permissions')) {
    if (!Array.isArray(data.permissions)) throw new Error('Backup permissions must be an array');
    for (const record of data.permissions) {
      if (!isBackupRecord(record)) throw new Error('Backup permissions record is invalid');
      requireString(record, 'role', 'permissions');
      requireBooleans(record, ['canEditCriteria', 'canEditProfiles', 'canEditEmployees', 'canStartEvaluations', 'canLockScores', 'canViewSalaries', 'canDefineTargets', 'canRestoreBackup'], 'permissions');
    }
  }
  if (hasBackupField(data, 'customUserPermissions')) {
    if (!isBackupRecord(data.customUserPermissions)) throw new Error('Backup customUserPermissions must be an object');
    for (const record of Object.values(data.customUserPermissions)) {
      if (!isBackupRecord(record)) throw new Error('Backup customUserPermissions record is invalid');
      requireString(record, 'userId', 'customUserPermissions');
      requireBooleans(record, ['canEditCriteria', 'canEditProfiles', 'canEditEmployees', 'canStartEvaluations', 'canLockScores', 'canDefineTargets', 'canViewReports', 'canRestoreBackup'], 'customUserPermissions');
    }
  }
  if (hasBackupField(data, 'lockedUsers')) {
    if (!Array.isArray(data.lockedUsers) || data.lockedUsers.some((id: unknown) => typeof id !== 'string')) throw new Error('Backup lockedUsers must be an array of strings');
  }
  if (hasBackupField(data, 'logs')) {
    if (!Array.isArray(data.logs)) throw new Error('Backup logs must be an array');
    for (const record of data.logs) {
      if (!isBackupRecord(record)) throw new Error('Backup logs record is invalid');
      for (const key of ['id', 'timestamp', 'operator', 'action', 'details', 'type']) requireString(record, key, 'logs');
    }
  }
}

/** Parse and validate without touching persistence, for restore previews/merges. */
export function validateBackupJSON(jsonStr: string): Record<string, any> {
  const data = JSON.parse(jsonStr) as Record<string, any>;
  validateBackupTopLevel(data);
  validateBackupCollectionShapes(data);
  validateBackupRequiredFields(data);
  validateBackupUniqueIds(data);
  validateBackupReferences(data);
  validateOptionalBackupSettings(data);
  return data;
}

/** Preserve the established code/id upsert semantics before one atomic commit. */
export function mergeBackupCollections(incoming: Record<string, any>, current: Record<string, any>): Record<string, any> {
  const byCode = (key: 'employees' | 'criteria' | 'profiles') => {
    const merged = new Map<string, any>();
    for (const record of current[key]) merged.set(record.code.toUpperCase(), record);
    for (const record of incoming[key]) merged.set(record.code.toUpperCase(), record);
    return Array.from(merged.values());
  };
  const byId = (key: 'evaluations' | 'archivedEvaluations' | 'delegations') => {
    const merged = new Map<string, any>();
    for (const record of current[key]) merged.set(record.id, record);
    for (const record of incoming[key]) merged.set(record.id, record);
    return Array.from(merged.values());
  };
  return {
    ...incoming,
    employees: byCode('employees'),
    criteria: byCode('criteria'),
    profiles: byCode('profiles'),
    evaluations: byId('evaluations'),
    archivedEvaluations: byId('archivedEvaluations'),
    delegations: byId('delegations'),
  };
}

export class AppDatabase {
  private syncTimeout: any = null;
  private listeners: Set<(key: string, data: any) => void> = new Set();

  /**
   * Subscribe to real-time database state mutations
   */
  public subscribe(listener: (key: string, data: any) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public notifyChange(key: string, data: any): void {
    this.listeners.forEach(fn => {
      try { fn(key, data); } catch (e) { console.error('Error in db listener:', e); }
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pe_db_updated', { detail: { key, data } }));
    }
  }

  // Safe JSON getter
  private getItem<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch (e) {
      console.warn(`Error reading ${key} from storage:`, e);
      return fallback;
    }
  }

  // Safe JSON setter with synchronous notification
  private setItem<T>(key: string, value: T, scheduleSync = true): void {
    try {
      const stringVal = JSON.stringify(value);
      const currentVal = localStorage.getItem(key);
      if (currentVal === stringVal) return; // Prevent unnecessary cycles

      localStorage.setItem(key, stringVal);
      this.notifyChange(key, value);
      if (this.cloudSyncEnabled && isCloudSyncKey(key)) {
        this.dirtyKeys.add(key);
        if (scheduleSync) this.triggerCloudSyncDebounced();
      }
    } catch (e) {
      console.error(`Error saving ${key} to storage:`, e);
    }
  }

  private restoreRawStorage(rawValues: Map<string, string | null>): void {
    for (const [key, raw] of rawValues) {
      if (raw === null) localStorage.removeItem(key);
      else localStorage.setItem(key, raw);
    }
    for (const [key, raw] of rawValues) {
      if (localStorage.getItem(key) !== raw) throw new Error(`Rollback verification failed for ${key}`);
    }
  }

  // --- EMPLOYEES ---
  public getEmployees(): Employee[] {
    const raw = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
    if (raw === null) {
      this.setItem(STORAGE_KEYS.EMPLOYEES, SEED_EMPLOYEES);
      return SEED_EMPLOYEES;
    }
    return this.getItem<Employee[]>(STORAGE_KEYS.EMPLOYEES, []);
  }

  public saveEmployees(employees: Employee[]): void {
    this.setItem(STORAGE_KEYS.EMPLOYEES, employees);
  }

  public addEmployee(empData: Omit<Employee, 'id'>): { employee: Employee; evaluation: Evaluation | null } {
    const employees = this.getEmployees();
    
    // Generate clean username if empty
    let username = (empData.username || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
    if (!username) {
      const cleanCode = (empData.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      username = `user_${cleanCode || Math.random().toString(36).substring(2, 7)}`;
    }

    // Ensure unique username
    let finalUsername = username;
    let counter = 1;
    while (employees.some(e => e.username.toLowerCase() === finalUsername.toLowerCase())) {
      finalUsername = `${username}_${counter}`;
      counter++;
    }

    const newEmp: Employee = {
      ...empData,
      id: `emp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      username: finalUsername,
      code: empData.code.trim().toUpperCase()
    };

    const updatedEmployees = [...employees, newEmp];
    this.saveEmployees(updatedEmployees);

    // Evaluation creation is a deliberate period operation, never an employee-import side effect.
    return { employee: newEmp, evaluation: null };
  }

  public updateEmployee(id: string, empData: Omit<Employee, 'id'>): Employee | null {
    const employees = this.getEmployees();
    const index = employees.findIndex(e => e.id === id);
    if (index === -1) return null;

    const updated: Employee = {
      ...empData,
      id,
      code: empData.code.trim().toUpperCase(),
      username: empData.username.trim().toLowerCase()
    };

    employees[index] = updated;
    this.saveEmployees(employees);
    return updated;
  }

  public deleteEmployee(id: string): boolean {
    const employees = this.getEmployees();
    const target = employees.find(e => e.id === id);
    if (!target) return false;

    const deletionPlan = planEmployeeBulkDeletion([id], employees, this.getEvaluations(), this.getArchivedEvaluations());
    if (!deletionPlan.deletableIds.has(id)) return false;

    const filtered = employees.filter(e => e.id !== id);
    this.saveEmployees(filtered);

    return true;
  }

  /** Batch-delete employees only when history, open tasks, and remaining links permit removal. */
  public deleteEmployeesBatch(ids: string[]): { success: boolean; deletedCount: number; blockedCount: number } {
    if (!ids || ids.length === 0) return { success: true, deletedCount: 0, blockedCount: 0 };
    const employees = this.getEmployees();
    const deletionPlan = planEmployeeBulkDeletion(ids, employees, this.getEvaluations(), this.getArchivedEvaluations());
    const targetsToDelete = employees.filter(employee => deletionPlan.deletableIds.has(employee.id));
    const blockedCount = new Set(ids).size - targetsToDelete.length;
    if (targetsToDelete.length === 0) return { success: true, deletedCount: 0, blockedCount };

    const validDeleteIds = new Set(targetsToDelete.map(e => e.id));
    const remainingEmployees = employees.filter(e => !validDeleteIds.has(e.id));
    this.saveEmployees(remainingEmployees);

    return { success: true, deletedCount: targetsToDelete.length, blockedCount };
  }

  // --- CRITERIA (PARAMETERS) ---
  public getCriteria(): Criterion[] {
    const raw = localStorage.getItem(STORAGE_KEYS.CRITERIA);
    if (raw === null) {
      this.setItem(STORAGE_KEYS.CRITERIA, SEED_CRITERIA);
      return SEED_CRITERIA;
    }
    return this.getItem<Criterion[]>(STORAGE_KEYS.CRITERIA, []);
  }

  public saveCriteria(criteria: Criterion[]): void {
    this.setItem(STORAGE_KEYS.CRITERIA, criteria);
  }

  public addCriterion(critData: Omit<Criterion, 'id'>): Criterion {
    const criteria = this.getCriteria();
    const newCrit: Criterion = {
      ...critData,
      id: `crit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      code: critData.code.trim().toUpperCase()
    };
    this.saveCriteria([...criteria, newCrit]);
    return newCrit;
  }

  public updateCriterion(id: string, critData: Omit<Criterion, 'id'>): Criterion | null {
    const criteria = this.getCriteria();
    const index = criteria.findIndex(c => c.id === id);
    if (index === -1) return null;

    const updated: Criterion = {
      ...critData,
      id,
      code: critData.code.trim().toUpperCase()
    };
    criteria[index] = updated;
    this.saveCriteria(criteria);
    return updated;
  }

  /**
   * Delete criterion with automatic CASCADE removal from profiles and evaluations.
   * This guarantees that any parameter can be deleted cleanly without blocking errors!
   */
  public deleteCriterion(id: string): { success: boolean; affectedProfiles: number; affectedEvaluations: number } {
    const criteria = this.getCriteria();
    const target = criteria.find(c => c.id === id);
    if (!target) return { success: false, affectedProfiles: 0, affectedEvaluations: 0 };

    const profilesUsing = this.getProfiles().filter(profile => profile.items.some(item => item.cid === id)).length;
    const evaluationsUsing = [...this.getEvaluations(), ...this.getArchivedEvaluations()]
      .filter(evaluation => evaluation.scores.some(score => score.cid === id)).length;
    if (profilesUsing > 0 || evaluationsUsing > 0) return { success: false, affectedProfiles: profilesUsing, affectedEvaluations: evaluationsUsing };

    // 1. Remove from criteria bank
    const updatedCriteria = criteria.filter(c => c.id !== id);
    this.saveCriteria(updatedCriteria);

    // 2. Cascade remove from all job profiles
    const profiles = this.getProfiles();
    let affectedProfiles = 0;
    const updatedProfiles = profiles.map(profile => {
      const hasItem = profile.items.some(item => item.cid === id);
      if (hasItem) {
        affectedProfiles++;
        const filteredItems = profile.items.filter(item => item.cid !== id);
        return {
          ...profile,
          items: filteredItems
        };
      }
      return profile;
    });
    if (affectedProfiles > 0) {
      this.saveProfiles(updatedProfiles);
    }

    // 3. Cascade remove from all evaluations
    const evals = this.getEvaluations();
    let affectedEvaluations = 0;
    const updatedEvals = evals.map(evaluation => {
      const hasScore = evaluation.scores.some(s => s.cid === id);
      if (hasScore) {
        affectedEvaluations++;
        return {
          ...evaluation,
          scores: evaluation.scores.filter(s => s.cid !== id)
        };
      }
      return evaluation;
    });
    if (affectedEvaluations > 0) {
      this.saveEvaluations(updatedEvals);
    }

    return { success: true, affectedProfiles, affectedEvaluations };
  }

  /**
   * Batch delete multiple criteria with cascading removal from all profiles and evaluations
   */
  public deleteCriteriaBatch(ids: string[]): { success: boolean; affectedProfiles: number; affectedEvaluations: number; deletedCount: number } {
    if (!ids || ids.length === 0) return { success: true, affectedProfiles: 0, affectedEvaluations: 0, deletedCount: 0 };
    const idSet = new Set(ids);
    const criteria = this.getCriteria();
    const profiles = this.getProfiles();
    const evals = this.getEvaluations();
    const archivedEvals = this.getArchivedEvaluations();
    const safeIds = new Set(criteria.filter(c => idSet.has(c.id) &&
      !profiles.some(profile => profile.items.some(item => item.cid === c.id)) &&
      !evals.some(evaluation => evaluation.scores.some(score => score.cid === c.id)) &&
      !archivedEvals.some(evaluation => evaluation.scores.some(score => score.cid === c.id))).map(c => c.id));
    const remainingCriteria = criteria.filter(c => !safeIds.has(c.id));
    const deletedCount = criteria.length - remainingCriteria.length;
    if (deletedCount === 0) return { success: true, affectedProfiles: 0, affectedEvaluations: 0, deletedCount: 0 };

    this.saveCriteria(remainingCriteria);

    // Cascade only IDs that passed the dependency checks above. A mixed bulk
    // request must leave protected criteria and their references intact.
    let affectedProfiles = 0;
    const updatedProfiles = profiles.map(profile => {
      const hasItem = profile.items.some(item => safeIds.has(item.cid));
      if (hasItem) {
        affectedProfiles++;
        return {
          ...profile,
          items: profile.items.filter(item => !safeIds.has(item.cid))
        };
      }
      return profile;
    });
    if (affectedProfiles > 0) {
      this.saveProfiles(updatedProfiles);
    }

    // Cascade remove from evaluations
    let affectedEvaluations = 0;
    const updatedEvals = evals.map(evaluation => {
      const hasScore = evaluation.scores.some(s => safeIds.has(s.cid));
      if (hasScore) {
        affectedEvaluations++;
        return {
          ...evaluation,
          scores: evaluation.scores.filter(s => !safeIds.has(s.cid))
        };
      }
      return evaluation;
    });
    if (affectedEvaluations > 0) {
      this.saveEvaluations(updatedEvals);
    }

    return { success: true, affectedProfiles, affectedEvaluations, deletedCount };
  }

  // --- JOB PROFILES ---
  public getProfiles(): JobProfile[] {
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILES);
    if (raw === null) {
      this.setItem(STORAGE_KEYS.PROFILES, SEED_PROFILES);
      return SEED_PROFILES;
    }
    return this.getItem<JobProfile[]>(STORAGE_KEYS.PROFILES, []);
  }

  public saveProfiles(profiles: JobProfile[]): void {
    this.setItem(STORAGE_KEYS.PROFILES, profiles);
  }

  public addProfile(profData: Omit<JobProfile, 'id'>): JobProfile {
    const profiles = this.getProfiles();
    const newProf: JobProfile = {
      ...profData,
      id: `prof-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    };
    this.saveProfiles([...profiles, newProf]);
    return newProf;
  }

  public updateProfile(id: string, profData: Omit<JobProfile, 'id'>): JobProfile | null {
    const profiles = this.getProfiles();
    const index = profiles.findIndex(p => p.id === id);
    if (index === -1) return null;

    const updated: JobProfile = {
      ...profData,
      id
    };
    profiles[index] = updated;
    this.saveProfiles(profiles);
    return updated;
  }

  public deleteProfile(id: string, force = false): { success: boolean; error?: string; affectedEmployees?: number } {
    const employees = this.getEmployees();
    const assignedEmployees = employees.filter(e => e.profileId === id);
    
    if (assignedEmployees.length > 0) {
      return { success: false, error: `این رده شغلی به ${assignedEmployees.length} پرسنل منتسب است و ابتدا باید رده شغلی آن‌ها تغییر کند.` };
    }

    if (this.getEvaluations().some(evaluation => evaluation.profileId === id) || this.getArchivedEvaluations().some(evaluation => evaluation.profileId === id)) return { success: false, error: 'این پروفایل در سوابق ارزیابی استفاده شده و قابل حذف نیست.' };

    const profiles = this.getProfiles();
    this.saveProfiles(profiles.filter(p => p.id !== id));
    return { success: true, affectedEmployees: assignedEmployees.length };
  }

  public deleteProfilesBatch(ids: string[]): { success: boolean; deletedCount: number; affectedEmployees: number } {
    if (!ids || ids.length === 0) return { success: true, deletedCount: 0, affectedEmployees: 0 };
    const idSet = new Set(ids);

    const profiles = this.getProfiles();
    const employees = this.getEmployees();
    const evals = [...this.getEvaluations(), ...this.getArchivedEvaluations()];
    const safeIds = new Set(profiles.filter(profile => idSet.has(profile.id) && !employees.some(employee => employee.profileId === profile.id) && !evals.some(evaluation => evaluation.profileId === profile.id)).map(profile => profile.id));
    const remaining = profiles.filter(p => !safeIds.has(p.id));
    const deletedCount = profiles.length - remaining.length;
    const affectedEmployees = employees.filter(employee => idSet.has(employee.profileId)).length;
    if (deletedCount) this.saveProfiles(remaining);

    return { success: true, deletedCount, affectedEmployees };
  }

  // --- EVALUATIONS ---
  public getEvaluations(): Evaluation[] {
    const raw = localStorage.getItem(STORAGE_KEYS.EVALUATIONS);
    if (raw === null) {
      this.setItem(STORAGE_KEYS.EVALUATIONS, SEED_EVALUATIONS);
      return SEED_EVALUATIONS;
    }
    return this.getItem<Evaluation[]>(STORAGE_KEYS.EVALUATIONS, []);
  }

  public saveEvaluations(evaluations: Evaluation[]): void {
    this.setItem(STORAGE_KEYS.EVALUATIONS, evaluations);
  }

  /** Save one audited protected-source batch and wait for the Pages/KV decision. */
  private async saveStateWithSourceImport(key: string, value: unknown, sourceImport: SourceImportContext): Promise<boolean> {
    if (!this.cloudSyncEnabled || this.pendingSourceImportContext) return false;
    let waitCount = 0;
    while (this.isSyncing && waitCount < 1_600) {
      await new Promise(resolve => setTimeout(resolve, 10));
      waitCount++;
    }
    if (!this.cloudSyncEnabled || this.isSyncing || this.pendingSourceImportContext) return false;
    const previousRaw = localStorage.getItem(key);
    const previousDirty = this.dirtyKeys.has(key);
    const nextRaw = JSON.stringify(value);
    if (previousRaw === nextRaw) return false;
    this.pendingSourceImportContext = sourceImport;
    this.terminalRejectedSnapshot = null;
    this.setItem(key, value, false);
    if (localStorage.getItem(key) !== nextRaw) {
      this.pendingSourceImportContext = null;
      return false;
    }
    const saved = await this.pushStateToCloud([key]);
    if (saved) return true;

    if (this.pendingSourceImportContext?.operationId === sourceImport.operationId) this.pendingSourceImportContext = null;
    if (localStorage.getItem(key) === nextRaw) {
      if (previousRaw === null) localStorage.removeItem(key);
      else localStorage.setItem(key, previousRaw);
      if (previousDirty) this.dirtyKeys.add(key);
      else if (previousRaw === this.lastSyncedValues.get(key)) this.dirtyKeys.delete(key);
      else if (previousRaw !== null) this.dirtyKeys.add(key);
    }
    return false;
  }

  public saveEvaluationsWithSourceImport(evaluations: Evaluation[], sourceImport: ProtectedSourceImportContext): Promise<boolean> {
    return this.saveStateWithSourceImport(STORAGE_KEYS.EVALUATIONS, evaluations, sourceImport);
  }

  public saveEmployeesWithSourceImport(employees: Employee[], sourceImport: MasterDataSourceImportContext): Promise<boolean> {
    return this.saveStateWithSourceImport(STORAGE_KEYS.EMPLOYEES, employees, sourceImport);
  }

  public saveCriteriaWithSourceImport(criteria: Criterion[], sourceImport: MasterDataSourceImportContext): Promise<boolean> {
    return this.saveStateWithSourceImport(STORAGE_KEYS.CRITERIA, criteria, sourceImport);
  }

  public deleteEvaluation(id: string): boolean {
    const evals = this.getEvaluations();
    const target = evals.find(e => e.id === id);
    if (target?.status === 'locked' || target?.stage === 'completed') return false;
    const filtered = evals.filter(e => e.id !== id);
    if (filtered.length === evals.length) return false;
    this.saveEvaluations(filtered);
    return true;
  }

  public deleteEvaluationsBatch(ids: string[]): { success: boolean; deletedCount: number } {
    if (!ids || ids.length === 0) return { success: true, deletedCount: 0 };
    const idSet = new Set(ids);
    const evals = this.getEvaluations();
    const filtered = evals.filter(e => !idSet.has(e.id) || e.status === 'locked' || e.stage === 'completed');
    const deletedCount = evals.length - filtered.length;
    if (deletedCount > 0) {
      this.saveEvaluations(filtered);
    }
    return { success: true, deletedCount };
  }

  public getArchivedEvaluations(): Evaluation[] {
    return this.getItem<Evaluation[]>(STORAGE_KEYS.ARCHIVED_EVALUATIONS, []);
  }

  public saveArchivedEvaluations(archived: Evaluation[]): void {
    this.setItem(STORAGE_KEYS.ARCHIVED_EVALUATIONS, archived);
  }

  public updateEvaluation(id: string, updatedEv: Evaluation): Evaluation {
    const evals = this.getEvaluations();
    const index = evals.findIndex(e => e.id === id);
    let nextList: Evaluation[];
    if (index >= 0) {
      nextList = [...evals];
      nextList[index] = updatedEv;
    } else {
      nextList = [...evals, updatedEv];
    }
    this.saveEvaluations(nextList);
    return updatedEv;
  }

  // --- DELEGATIONS ---
  public getDelegations(): DelegationRecord[] {
    return this.getItem<DelegationRecord[]>(STORAGE_KEYS.DELEGATIONS, []);
  }

  public saveDelegations(delegations: DelegationRecord[]): void {
    this.setItem(STORAGE_KEYS.DELEGATIONS, delegations);
  }

  public createDelegation(delegation: Omit<DelegationRecord, 'id' | 'createdAt'>): DelegationRecord {
    const delegations = this.getDelegations();
    const now = Date.now();
    const newDelegation: DelegationRecord = {
      ...delegation,
      id: `deleg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: now,
      status: 'active',
    };
    delegations.push(newDelegation);
    this.saveDelegations(delegations);
    return newDelegation;
  }

  public revokeDelegation(id: string, revokedById: string, reason?: string): boolean {
    const delegations = this.getDelegations();
    const index = delegations.findIndex(d => d.id === id);
    if (index === -1) return false;
    delegations[index] = {
      ...delegations[index],
      status: 'revoked',
      revokedAt: Date.now(),
      revokedById,
      ...(reason ? { reason: `${delegations[index].reason || ''}\nلغو توسط ${revokedById}: ${reason}` } : {}),
    };
    this.saveDelegations(delegations);
    return true;
  }

  public getActiveDelegations(): DelegationRecord[] {
    const now = Date.now();
    return this.getDelegations().filter(d => {
      if (d.status === 'revoked') return false;
      if (d.status === 'expired') return false;
      // 'future' delegations that have entered their date range are active
      if (d.status !== 'active' && d.status !== 'future') return false;
      if (now < d.startDate) return false;
      if (now > d.endDate) return false;
      return true;
    });
  }

  public getDelegationsByDelegate(delegateId: string): DelegationRecord[] {
    return this.getDelegations().filter(d => d.delegateId === delegateId);
  }

  public getDelegationsByDelegator(delegatorId: string): DelegationRecord[] {
    return this.getDelegations().filter(d => d.delegatorId === delegatorId);
  }

  // --- OKRS & GOALS MANAGEMENT --
  public getOkrs(): OKRGoal[] {
    const raw = localStorage.getItem(STORAGE_KEYS.OKRS);
    if (raw === null) {
      this.setItem(STORAGE_KEYS.OKRS, INITIAL_OKRS);
      return INITIAL_OKRS;
    }
    return this.getItem<OKRGoal[]>(STORAGE_KEYS.OKRS, []);
  }

  public saveOkrs(okrs: OKRGoal[]): void {
    this.setItem(STORAGE_KEYS.OKRS, okrs);
  }

  public updateOkr(id: string, partial: Partial<OKRGoal>): OKRGoal | null {
    const okrs = this.getOkrs();
    const index = okrs.findIndex(o => o.id === id);
    if (index === -1) return null;

    const existing = okrs[index];
    const updated: OKRGoal = {
      ...existing,
      ...partial
    };

    // Auto-recalculate progress if key results were supplied
    if (updated.keyResults && updated.keyResults.length > 0) {
      const sum = updated.keyResults.reduce((acc, kr) => {
        const range = kr.targetValue - kr.startValue;
        if (range === 0) return acc + 100;
        return acc + Math.min(100, Math.max(0, ((kr.currentValue - kr.startValue) / range) * 100));
      }, 0);
      updated.progress = Math.round(sum / updated.keyResults.length);
      if (updated.progress >= 100) updated.confidence = 'completed';
      else if (updated.progress < 50) updated.confidence = 'behind';
      else if (updated.progress < 75) updated.confidence = 'at_risk';
      else updated.confidence = 'on_track';
    }

    okrs[index] = updated;
    this.saveOkrs(okrs);
    return updated;
  }

  public addOkr(okrData: Omit<OKRGoal, 'id'>): OKRGoal {
    const okrs = this.getOkrs();
    const newOkr: OKRGoal = {
      ...okrData,
      id: `okr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    };
    this.saveOkrs([newOkr, ...okrs]);
    return newOkr;
  }

  public deleteOkr(id: string): boolean {
    const okrs = this.getOkrs();
    const filtered = okrs.filter(o => o.id !== id);
    if (filtered.length === okrs.length) return false;
    this.saveOkrs(filtered);
    return true;
  }

  // --- WORKSHOP TARGETS ---
  public getWorkshopTargets<T = any>(fallback: T[] = []): T[] {
    return this.getItem<T[]>(STORAGE_KEYS.WORKSHOP_TARGETS, fallback);
  }

  public saveWorkshopTargets<T = any>(targets: T[]): void {
    this.setItem(STORAGE_KEYS.WORKSHOP_TARGETS, targets);
  }

  public getMiscData<T>(key: string, fallback: T): T {
    return this.getItem<T>(key, fallback);
  }
  public saveMiscData<T>(key: string, value: T): void {
    this.setItem(key, value);
  }

  // --- BATCH CRITERIA MERGE / MULTI-SOURCE REGISTER ---
  public prepareCriteriaBatch(
    newCriteria: Array<Omit<Criterion, 'id'> & { id?: string }>,
    mode: 'merge' | 'replace' | 'skip_existing' = 'merge'
  ): { addedCount: number; updatedCount: number; totalCount: number; criteria: Criterion[] } {
    let currentCriteria = this.getCriteria();
    let addedCount = 0;
    let updatedCount = 0;

    if (mode === 'replace') {
      const formatted = newCriteria.map((c, idx) => ({
        ...c,
        id: c.id || `crit-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
        code: c.code.trim().toUpperCase()
      } as Criterion));
      return { addedCount: formatted.length, updatedCount: 0, totalCount: formatted.length, criteria: formatted };
    }

    const updatedList = [...currentCriteria];

    newCriteria.forEach((critCandidate, idx) => {
      const cleanCode = critCandidate.code.trim().toUpperCase();
      const existingIdx = updatedList.findIndex(c => c.code.trim().toUpperCase() === cleanCode);

      if (existingIdx >= 0) {
        if (mode === 'merge') {
          // Merge fields, preserve existing ID
          const existing = updatedList[existingIdx];
          updatedList[existingIdx] = {
            ...existing,
            ...critCandidate,
            id: existing.id,
            code: cleanCode
          };
          updatedCount++;
        }
        // If mode === 'skip_existing', do nothing
      } else {
        // Add new
        const newCrit: Criterion = {
          ...critCandidate,
          id: critCandidate.id || `crit-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
          code: cleanCode
        };
        updatedList.push(newCrit);
        addedCount++;
      }
    });

    return { addedCount, updatedCount, totalCount: updatedList.length, criteria: updatedList };
  }

  public saveCriteriaBatch(
    newCriteria: Array<Omit<Criterion, 'id'> & { id?: string }>,
    mode: 'merge' | 'replace' | 'skip_existing' = 'merge'
  ): { addedCount: number; updatedCount: number; totalCount: number; criteria: Criterion[] } {
    const result = this.prepareCriteriaBatch(newCriteria, mode);
    this.saveCriteria(result.criteria);
    return result;
  }

  // --- CLOUD & CLOUDFLARE SYNC (Safe & Non-Destructive) ---
  private cloudSyncEnabled = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;
  private isInitializingSync = false;
  private initializationPromise: Promise<void> | null = null;
  private syncGeneration = 0;
  private dirtyKeys = new Set<string>();
  private lastSyncedValues = new Map<string, string | null>();
  private cloudRevision = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private retryExhausted = false;
  private hasRevisionConflict = false;
  private activeRequestController: AbortController | null = null;
  private terminalRejectedSnapshot: { fingerprint: string; status: number; baseRevision: number; code?: string } | null = null;
  private activeSyncUserId: string | null = null;
  private authRequired = false;
  private restoredPendingBaseRevision: number | null = null;
  private visibilityHandler: (() => void) | null = null;
  private onlineHandler: (() => void) | null = null;
  private pendingSourceImportContext: SourceImportContext | null = null;
  
  public async initializeCloudSync(userId?: string): Promise<void> {
    if (userId) {
      this.activeSyncUserId = userId;
      this.authRequired = false;
    }
    if (this.initializationPromise) {
      await this.initializationPromise;
      if (this.cloudSyncEnabled) return;
      return this.initializeCloudSync(userId);
    }
    const generation = this.syncGeneration;
    const initialization = this.initializeCloudSyncGeneration(generation);
    this.initializationPromise = initialization;
    try {
      await initialization;
    } finally {
      if (this.initializationPromise === initialization) this.initializationPromise = null;
    }
  }

  private async initializeCloudSyncGeneration(generation: number): Promise<void> {
    if (this.isInitializingSync) return;
    this.isInitializingSync = true;
    if (this.cloudSyncEnabled) this.detectDirectStorageChanges();
    this.restorePendingLocalSnapshot(this.activeSyncUserId);
    const pendingLocalKeys = new Set(this.dirtyKeys);
    clearTimeout(this.syncTimeout);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.activeRequestController?.abort();
    this.cloudSyncEnabled = false;
    if (this.visibilityHandler && typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.visibilityHandler = null;
    if (this.onlineHandler && typeof window !== 'undefined') window.removeEventListener('online', this.onlineHandler);
    this.onlineHandler = null;
    this.retryExhausted = false;
    this.retryAttempt = 0;
    this.terminalRejectedSnapshot = null;
    this.emitCloudStatus('syncing', 'در حال دریافت پایگاه داده ابری…');

    try {
      const cloudHadState = await this.runSyncCycle('pull');
      if (!isCurrentSyncGeneration(generation, this.syncGeneration)) return;
      if (this.authRequired) return;
      this.cloudSyncEnabled = true;
      if (cloudHadState === false) {
        for (const key of CLOUD_SYNC_KEYS) {
          if (localStorage.getItem(key) !== null) this.dirtyKeys.add(key);
        }
        await this.runSyncCycle('push');
      } else if (cloudHadState === true && pendingLocalKeys.size > 0) {
        if (this.restoredPendingBaseRevision !== null && this.cloudRevision === this.restoredPendingBaseRevision) {
          this.hasRevisionConflict = false;
          await this.runSyncCycle('push');
        } else {
          this.hasRevisionConflict = true;
          this.emitCloudStatus('error', 'تغییرات محلی همگام‌نشده با نسخه ابری مقایسه شده‌اند؛ برای جلوگیری از بازنویسی خودکار، نسخه نگه‌داشته‌شده را انتخاب کنید.', { conflict: true });
        }
      }
      this.restoredPendingBaseRevision = null;
      this.pollTimer = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        if (!shouldAttemptSync(this.retryExhausted, 'poll')) return;
        this.runSyncCycle('auto').catch(() => {});
      }, CLOUD_SYNC_POLL_INTERVAL_MS);
      this.visibilityHandler = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible' && shouldAttemptSync(this.retryExhausted, 'visible')) {
          if (this.retryExhausted) this.clearCloudRetry();
          this.runSyncCycle('auto').catch(() => {});
        }
      };
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.visibilityHandler);
      this.onlineHandler = () => {
        if (!this.cloudSyncEnabled || !shouldAttemptSync(this.retryExhausted, 'online')) return;
        if (this.retryExhausted) this.clearCloudRetry();
        this.runSyncCycle('auto').catch(() => {});
      };
      if (typeof window !== 'undefined') window.addEventListener('online', this.onlineHandler);
      if (cloudHadState === null) this.scheduleCloudRetry();
    } finally {
      this.isInitializingSync = false;
    }
  }

  public stopCloudSync(): void {
    this.syncGeneration += 1;
    this.cloudSyncEnabled = false;
    clearTimeout(this.syncTimeout);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.activeRequestController?.abort();
    this.activeRequestController = null;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (this.visibilityHandler && typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.visibilityHandler = null;
    if (this.onlineHandler && typeof window !== 'undefined') window.removeEventListener('online', this.onlineHandler);
    this.onlineHandler = null;
    this.dirtyKeys.clear();
    this.hasRevisionConflict = false;
    this.terminalRejectedSnapshot = null;
    this.emitCloudStatus('idle', 'همگام‌سازی متوقف است.');
  }

  private pendingSyncBackupKey(userId: string): string {
    return `${PENDING_SYNC_BACKUP_PREFIX}${encodeURIComponent(userId)}`;
  }

  /** Keep rejected or otherwise unsynced writes across an auth-expiry cache clear. */
  private preservePendingLocalSnapshot(): void {
    const userId = this.activeSyncUserId;
    if (!userId || this.dirtyKeys.size === 0) return;
    try {
      const entries: Record<string, string | null> = {};
      for (const key of this.dirtyKeys) {
        if (isCloudSyncKey(key)) entries[key] = localStorage.getItem(key);
      }
      if (Object.keys(entries).length > 0) {
        localStorage.setItem(this.pendingSyncBackupKey(userId), JSON.stringify({ version: 1, baseRevision: this.cloudRevision, entries }));
      }
    } catch {
      // Keep the active local state intact if browser storage is unavailable.
    }
  }

  /** Restore pending keys only for the same account; never reuse another user's cache. */
  private restorePendingLocalSnapshot(userId: string | null): void {
    this.restoredPendingBaseRevision = null;
    if (!userId) return;
    const backupKey = this.pendingSyncBackupKey(userId);
    try {
      const raw = localStorage.getItem(backupKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { version?: unknown; entries?: unknown; baseRevision?: unknown };
      if (parsed.version !== 1 || !parsed.entries || typeof parsed.entries !== 'object' || Array.isArray(parsed.entries)) return;
      for (const [key, value] of Object.entries(parsed.entries as Record<string, unknown>)) {
        if (!isCloudSyncKey(key) || (value !== null && typeof value !== 'string')) continue;
        if (typeof value === 'string') localStorage.setItem(key, value);
        else localStorage.removeItem(key);
        this.dirtyKeys.add(key);
      }
      if (Number.isInteger(parsed.baseRevision) && Number(parsed.baseRevision) >= 0) this.restoredPendingBaseRevision = Number(parsed.baseRevision);
    } catch {
      // Leave an unreadable snapshot in place for recovery rather than deleting it.
    }
  }

  private pauseCloudSyncForAuthentication(): void {
    this.authRequired = true;
    this.cloudSyncEnabled = false;
    clearTimeout(this.syncTimeout);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (this.visibilityHandler && typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.visibilityHandler = null;
    if (this.onlineHandler && typeof window !== 'undefined') window.removeEventListener('online', this.onlineHandler);
    this.onlineHandler = null;
  }

  private emitCloudStatus(
    status: 'idle' | 'syncing' | 'synced' | 'retrying' | 'offline' | 'error' | 'conflict' | 'authentication_required' | 'write_rejected',
    message: string,
    extra: Record<string, unknown> = {}
  ): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('pe_cloud_sync_status', {
      detail: { status, message, revision: this.cloudRevision, ...extra }
    }));
  }

  private scheduleCloudRetry(): void {
    if (!this.cloudSyncEnabled || this.retryTimer || this.retryExhausted) return;
    if (this.retryAttempt >= CLOUD_SYNC_MAX_RETRIES) {
      this.retryExhausted = true;
      this.emitCloudStatus('error', 'تلاش‌های بازیابی به پایان رسید؛ پس از بازگشت اتصال یا فعال‌کردن صفحه دوباره تلاش می‌شود. تغییرات محلی حفظ شده‌اند.');
      return;
    }
    const delay = getCloudRetryDelay(this.retryAttempt++);
    this.emitCloudStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'retrying', `ارتباط ابری موقتاً برقرار نیست؛ تلاش مجدد تا ${Math.ceil(delay / 1000)} ثانیه دیگر.`);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.cloudSyncEnabled) return;
      this.runSyncCycle('auto').catch(() => {});
    }, delay);
  }

  private clearCloudRetry(): void {
    this.retryAttempt = 0;
    this.retryExhausted = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private getClientId(): string {
    const key = 'chalak_cloud_client_id';
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(key, id);
    }
    return id;
  }

  private detectDirectStorageChanges(): void {
    if (!this.cloudSyncEnabled) return;
    for (const key of CLOUD_SYNC_KEYS) {
      const current = localStorage.getItem(key);
      const previous = this.lastSyncedValues.get(key) ?? null;
      if (current !== previous) this.dirtyKeys.add(key);
    }
  }

  private async runSyncCycle(mode: 'pull' | 'push' | 'auto', forceAll = false, explicitRetry = false, onlyKeys?: string[]): Promise<boolean | null> {
    if (this.isSyncing) return null;
    this.isSyncing = true;
    this.detectDirectStorageChanges();
    const attemptedEntries = Array.from(this.dirtyKeys).map(key => [key, localStorage.getItem(key)] as [string, string | null]);
    const attemptedFingerprint = cloudWriteFingerprint(this.cloudRevision, attemptedEntries);
    try {
      if (mode === 'auto') {
        this.detectDirectStorageChanges();
        const operation = selectCloudSyncOperation(this.hasRevisionConflict, this.dirtyKeys.size);
        return operation === 'push' ? await this.pushStateToCloudInternal(false, true, explicitRetry) : await this.pullFromCloud();
      }
      if (mode === 'push') return this.pushStateToCloudInternal(forceAll, true, explicitRetry, onlyKeys);
      return this.pullFromCloud();
    } finally {
      this.isSyncing = false;
      this.detectDirectStorageChanges();
      const currentEntries = Array.from(this.dirtyKeys).map(key => [key, localStorage.getItem(key)] as [string, string | null]);
      const currentFingerprint = cloudWriteFingerprint(this.cloudRevision, currentEntries);
      if (shouldScheduleCloudSyncFollowup({
        enabled: this.cloudSyncEnabled,
        hasConflict: this.hasRevisionConflict,
        dirtyKeyCount: this.dirtyKeys.size,
        attemptedFingerprint,
        currentFingerprint,
        rejectedFingerprint: this.terminalRejectedSnapshot?.fingerprint || null,
      })) {
        this.triggerCloudSyncDebounced();
      }
    }
  }

  private applyRemoteState(remoteState: CloudState): void {
    let changed = false;
    for (const key of CLOUD_SYNC_KEYS) {
      if (this.dirtyKeys.has(key)) continue;
      const hasRemoteValue = Object.prototype.hasOwnProperty.call(remoteState, key);
      const nextRaw = hasRemoteValue ? JSON.stringify(remoteState[key]) : null;
      const localRaw = localStorage.getItem(key);
      if (nextRaw === null) {
        if (this.lastSyncedValues.has(key) && localRaw !== null) {
          localStorage.removeItem(key);
          this.notifyChange(key, null);
          changed = true;
        }
      } else if (localRaw !== nextRaw) {
        localStorage.setItem(key, nextRaw);
        this.notifyChange(key, remoteState[key]);
        changed = true;
      }
      this.lastSyncedValues.set(key, nextRaw);
    }
    if (changed) window.dispatchEvent(new CustomEvent('pe_cloud_data_received'));
  }

  private async pullFromCloud(): Promise<boolean | null> {
    const requestGeneration = this.syncGeneration;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    try {
      controller = new AbortController();
      this.activeRequestController = controller;
      timeoutId = setTimeout(() => controller.abort(), 10_000);

      const res = await fetch('/api/state', { signal: controller.signal, credentials: 'same-origin' });
      if (!isCurrentSyncGeneration(requestGeneration, this.syncGeneration)) return null;
      clearTimeout(timeoutId);
      timeoutId = null;

      const contentType = res.headers.get('Content-Type') || '';
      if (!contentType.includes('application/json')) {
        this.emitCloudStatus('error', 'API فضای ابری در این اجرا فعال نیست؛ داده فقط محلی ذخیره می‌شود.');
        return null;
      }
      const result = contentType.includes('application/json')
        ? await res.json() as { state?: CloudState; revision?: number; updatedAt?: string; error?: string }
        : {};
      if (!isCurrentSyncGeneration(requestGeneration, this.syncGeneration)) return null;
      if (!res.ok) {
        if (res.status === 401) this.pauseCloudSyncForAuthentication();
        this.emitCloudStatus(res.status === 401 ? 'authentication_required' : 'error', result.error || `خطای دریافت داده ابری (${res.status})`);
        if (shouldRetryCloudStatus(res.status)) this.scheduleCloudRetry();
        return null;
      }

      const cloudState = result.state && typeof result.state === 'object' ? result.state : {};
      this.cloudRevision = Number.isInteger(result.revision) ? Number(result.revision) : this.cloudRevision;
      if (Object.keys(cloudState).length === 0 && this.cloudRevision === 0) return false;
      this.applyRemoteState(cloudState);
      if (this.hasRevisionConflict) {
        this.emitCloudStatus('error', 'نسخه ابری تازه دریافت شد. تغییرات محلی متعارض نگه داشته شده‌اند؛ برای حل تعارض یکی از گزینه‌های «نسخه ابری» یا «نسخه محلی» را انتخاب کنید.', { conflict: true });
      } else {
        this.emitCloudStatus('synced', 'داده‌ها با فضای ابری همگام هستند.', {
          lastSyncedAt: result.updatedAt || new Date().toISOString()
        });
      }
      this.clearCloudRetry();
      return true;
    } catch (error) {
      if (!isCurrentSyncGeneration(requestGeneration, this.syncGeneration)) return null;
      const message = error instanceof DOMException && error.name === 'AbortError'
        ? 'پاسخ فضای ابری بیش از حد طول کشید.'
        : 'ارتباط با پایگاه داده ابری برقرار نشد.';
      this.emitCloudStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'retrying', message);
      this.scheduleCloudRetry();
      return null;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (controller && this.activeRequestController === controller) this.activeRequestController = null;
    }
  }

  private triggerCloudSyncDebounced(): void {
    if (!this.cloudSyncEnabled) return;
    clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => {
      this.runSyncCycle('auto').catch(() => {});
    }, 700);
  }

  public async syncToCloudNow(): Promise<boolean> {
    clearTimeout(this.syncTimeout);
    if (!this.cloudSyncEnabled) {
      this.emitCloudStatus(this.authRequired ? 'authentication_required' : 'error', this.authRequired ? 'نشست معتبر نیست؛ تغییر محلی حفظ شده و پس از ورود دوباره می‌توانید ذخیره را امتحان کنید.' : 'ابتدا باید با حساب معتبر وارد سامانه شوید.');
      return false;
    }
    return (await this.runSyncCycle('auto')) === true;
  }

  /** Explicit user retry clears only the terminal rejection latch; local dirty data remains intact. */
  public async retryRejectedCloudWrite(): Promise<boolean> {
    if (!this.cloudSyncEnabled) return false;
    this.terminalRejectedSnapshot = null;
    this.clearCloudRetry();
    return (await this.runSyncCycle('push', false, true)) === true;
  }

  /** Flush local edits first, then explicitly request and apply the latest cloud revision. */
  public async refreshFromCloudNow(): Promise<boolean> {
    clearTimeout(this.syncTimeout);
    if (!this.cloudSyncEnabled) {
      this.emitCloudStatus(this.authRequired ? 'authentication_required' : 'error', this.authRequired ? 'نشست معتبر نیست؛ تغییر محلی حفظ شده و پس از ورود دوباره می‌توانید ذخیره را امتحان کنید.' : 'ابتدا باید با حساب معتبر وارد سامانه شوید.');
      return false;
    }
    if (this.hasRevisionConflict) {
      this.emitCloudStatus('error', 'تعارض نسخه نیازمند انتخاب صریح شماست.', { conflict: true });
      return false;
    }
    if (this.isSyncing) return false;
    // Include any legacy/direct storage mutation that occurred since the last
    // successful sync before deciding whether it is safe to pull.
    this.detectDirectStorageChanges();
    if (this.dirtyKeys.size > 0) {
      const pushed = await this.runSyncCycle('push');
      if (pushed !== true) return false;
    }
    return (await this.runSyncCycle('pull')) === true;
  }

  /** Resolve a whole-key revision conflict only after the user chooses which copy to keep. */
  public async resolveCloudRevisionConflict(choice: 'local' | 'remote'): Promise<boolean> {
    if (!this.cloudSyncEnabled || !this.hasRevisionConflict) return false;
    if (choice === 'local') {
      this.hasRevisionConflict = false;
      this.terminalRejectedSnapshot = null;
      return (await this.runSyncCycle('push', false, true)) === true;
    }
    const preservedDirtyKeys = new Set(this.dirtyKeys);
    this.dirtyKeys.clear();
    this.hasRevisionConflict = false;
    const pulled = (await this.runSyncCycle('pull')) === true;
    if (!pulled) {
      preservedDirtyKeys.forEach(key => this.dirtyKeys.add(key));
      this.hasRevisionConflict = true;
    } else if (this.activeSyncUserId) {
      localStorage.removeItem(this.pendingSyncBackupKey(this.activeSyncUserId));
    }
    return pulled;
  }

  /** Remove only server-rehydratable shared data after sign-out; preferences remain local. */
  public clearAuthorizedCache(): void {
    try { this.detectDirectStorageChanges(); } catch { /* Preserve already tracked dirty keys. */ }
    this.preservePendingLocalSnapshot();
    this.stopCloudSync();
    for (const key of CLOUD_SYNC_KEYS) localStorage.removeItem(key);
    this.lastSyncedValues.clear();
    this.dirtyKeys.clear();
    this.terminalRejectedSnapshot = null;
    this.activeSyncUserId = null;
    this.authRequired = false;
    this.restoredPendingBaseRevision = null;
  }

  public async pushStateToCloud(onlyKeys?: string[]): Promise<boolean> {
    if (!this.cloudSyncEnabled) return false;
    return (await this.runSyncCycle('push', false, false, onlyKeys)) === true;
  }

  private async pushStateToCloudInternal(forceAll: boolean, allowConflictRetry = true, explicitRetry = false, onlyKeys?: string[]): Promise<boolean> {
    const requestGeneration = this.syncGeneration;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    try {
      if (this.hasRevisionConflict) {
        this.emitCloudStatus('error', 'تغییرات محلی تا زمان حل تعارض نسخه نگه داشته شده‌اند.', { conflict: true });
        return false;
      }
      this.detectDirectStorageChanges();
      if (forceAll) {
        for (const key of CLOUD_SYNC_KEYS) {
          if (localStorage.getItem(key) !== null) this.dirtyKeys.add(key);
        }
      }

      const keysToSend = onlyKeys ? onlyKeys.filter(key => this.dirtyKeys.has(key)) : Array.from(this.dirtyKeys);
      if (keysToSend.length === 0) {
        this.emitCloudStatus('synced', 'تغییری برای ارسال وجود ندارد.', { lastSyncedAt: new Date().toISOString() });
        return true;
      }

      const changes: CloudState = {};
      const sentRaw = new Map<string, string | null>();
      for (const key of keysToSend) {
        const raw = localStorage.getItem(key);
        sentRaw.set(key, raw);
        if (raw === null) changes[key] = null;
        else {
          try { changes[key] = JSON.parse(raw); }
          catch { changes[key] = raw; }
        }
      }

      const sourceImportContext = this.pendingSourceImportContext;
      const fingerprintEntries: Array<[string, string | null]> = Array.from(sentRaw.entries());
      if (sourceImportContext) fingerprintEntries.push(['sourceImport', JSON.stringify(sourceImportContext)]);
      const fingerprint = cloudWriteFingerprint(this.cloudRevision, fingerprintEntries);
      if (this.terminalRejectedSnapshot && isSameRejectedSnapshot(this.terminalRejectedSnapshot.fingerprint, fingerprint) && !explicitRetry) {
        const status = this.terminalRejectedSnapshot.status === 401 ? 'authentication_required' : 'write_rejected';
        const message = this.terminalRejectedSnapshot.status === 403
          ? 'ذخیره ابری این تغییر به دلیل محدودیت دسترسی پذیرفته نشد. تغییر محلی حذف نشده است.'
          : this.terminalRejectedSnapshot.status === 401
            ? 'نشست معتبر نیست؛ تغییر محلی حفظ شده و پس از ورود دوباره می‌توانید ذخیره را امتحان کنید.'
            : 'این تغییر با پاسخ غیرقابل‌تکرار رد شد؛ داده محلی حفظ شده است.';
        this.emitCloudStatus(status, message, { code: this.terminalRejectedSnapshot.code, rejectedStatus: this.terminalRejectedSnapshot.status, retryable: false });
        return false;
      }
      if (this.terminalRejectedSnapshot && this.terminalRejectedSnapshot.fingerprint !== fingerprint) this.terminalRejectedSnapshot = null;

      this.emitCloudStatus('syncing', `در حال ارسال ${keysToSend.length} تغییر به فضای ابری…`);
      controller = new AbortController();
      this.activeRequestController = controller;
      timeoutId = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch('/api/state', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          state: changes,
          baseRevision: this.cloudRevision,
          clientId: this.getClientId(),
          ...(sourceImportContext ? { sourceImport: sourceImportContext } : {}),
        })
      });
      if (!isCurrentSyncGeneration(requestGeneration, this.syncGeneration)) return false;
      clearTimeout(timeoutId);
      timeoutId = null;
      const contentType = res.headers.get('Content-Type') || '';
      if (!contentType.includes('application/json')) {
        this.emitCloudStatus('error', 'API فضای ابری در این اجرا فعال نیست؛ ذخیره فقط محلی انجام شد.');
        return false;
      }
      const result = contentType.includes('application/json')
        ? await res.json() as { state?: CloudState; revision?: number; updatedAt?: string; error?: string; code?: string; reason?: string; retryable?: boolean }
        : {};
      if (!isCurrentSyncGeneration(requestGeneration, this.syncGeneration)) return false;
      if (!res.ok) {
        if (res.status === 401) this.pauseCloudSyncForAuthentication();
        if (res.status === 409 && allowConflictRetry) {
          // Keep the local dirty values intact. Pulling and retrying the same
          // whole-key payload could silently overwrite another client's edit.
          this.cloudRevision = Number.isInteger(result.revision) ? Number(result.revision) : this.cloudRevision;
          this.hasRevisionConflict = true;
          this.emitCloudStatus('conflict', 'داده ابری در مرورگر دیگری تغییر کرده است. تغییر محلی نگه داشته شد؛ پیش از ادامه، نسخه ابری یا محلی را انتخاب کنید.', { conflict: true });
          return false;
        }
        if (isTerminalCloudWriteStatus(res.status)) {
          this.terminalRejectedSnapshot = { fingerprint, status: res.status, baseRevision: this.cloudRevision, code: result.code };
          const status = res.status === 401 ? 'authentication_required' : 'write_rejected';
          const message = res.status === 403
            ? 'ذخیره ابری این تغییر به دلیل محدودیت دسترسی پذیرفته نشد. تغییر محلی حذف نشده است.'
            : result.error || `ذخیره ابری قابل تکرار نیست (${res.status}). تغییر محلی حفظ شده است.`;
          this.emitCloudStatus(status, message, { code: result.code, reason: result.reason, rejectedStatus: res.status, retryable: false });
        } else {
          this.emitCloudStatus('error', result.error || `ذخیره ابری ناموفق بود (${res.status}).`);
        }
        if (shouldRetryCloudStatus(res.status)) this.scheduleCloudRetry();
        return false;
      }

      for (const [key, raw] of sentRaw) {
        if (localStorage.getItem(key) === raw) {
          this.dirtyKeys.delete(key);
          this.lastSyncedValues.set(key, raw);
        }
      }
      this.cloudRevision = Number.isInteger(result.revision) ? Number(result.revision) : this.cloudRevision + 1;
      this.terminalRejectedSnapshot = null;
      if (sourceImportContext && this.pendingSourceImportContext?.operationId === sourceImportContext.operationId) this.pendingSourceImportContext = null;
      if (result.state && typeof result.state === 'object') this.applyRemoteState(result.state);
      this.emitCloudStatus('synced', 'همه تغییرات در پایگاه داده ابری ذخیره شد.', {
        lastSyncedAt: result.updatedAt || new Date().toISOString()
      });
      this.clearCloudRetry();
      if (this.dirtyKeys.size === 0 && this.activeSyncUserId) {
        localStorage.removeItem(this.pendingSyncBackupKey(this.activeSyncUserId));
      }
      if (this.dirtyKeys.size > 0) this.triggerCloudSyncDebounced();
      return true;
    } catch (error) {
      if (!isCurrentSyncGeneration(requestGeneration, this.syncGeneration)) return false;
      const message = error instanceof DOMException && error.name === 'AbortError'
        ? 'ذخیره ابری به‌دلیل پایان زمان انتظار انجام نشد.'
        : 'ذخیره ابری به‌دلیل خطای شبکه انجام نشد.';
      this.emitCloudStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'retrying', message);
      this.scheduleCloudRetry();
      return false;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (controller && this.activeRequestController === controller) this.activeRequestController = null;
    }
  }

  // --- BACKUP & RESTORE ---
  public exportBackupJSON(): string {
    const backupData = {
      meta: {
        app: 'اصفهان چالاک - سامانه ارزیابی عملکرد',
        version: '4.0.0-Cloudflare',
        exportedAt: new Date().toISOString(),
        schemaVersion: 1,
        recordCounts: {
          employees: this.getEmployees().length,
          criteria: this.getCriteria().length,
          profiles: this.getProfiles().length,
          evaluations: this.getEvaluations().length,
          archivedEvaluations: this.getArchivedEvaluations().length,
          delegations: this.getDelegations().length,
        },
      },
      employees: this.getEmployees(),
      criteria: this.getCriteria(),
      profiles: this.getProfiles(),
      evaluations: this.getEvaluations(),
      archivedEvaluations: this.getArchivedEvaluations(),
      delegations: this.getDelegations(),
    };
    return JSON.stringify(backupData, null, 2);
  }

  public importBackupJSON(jsonStr: string): { success: boolean; message: string } {
    try {
      const data = validateBackupJSON(jsonStr);
      if (!data || typeof data !== 'object') {
        return { success: false, message: 'فایل پشتیبان معتبر نیست.' };
      }

      // Schema version compatibility check (forward-compatible: warn but proceed)
      const currentSchema = 1;
      const meta = data.meta as Record<string, unknown>;
      if (meta.schemaVersion && Number(meta.schemaVersion) > currentSchema) {
        return {
          success: false,
          message: `نسخه اسکیمای فایل (${data.meta.schemaVersion}) جدیدتر از نسخه پشتیبانی شده (${currentSchema}) است. لطفاً ابتدا برنامه را به‌روزرسانی کنید.`,
        };
      }

      const restoreEntries: Array<[string, unknown]> = [
        [STORAGE_KEYS.EMPLOYEES, data.employees],
        [STORAGE_KEYS.CRITERIA, data.criteria],
        [STORAGE_KEYS.PROFILES, data.profiles],
        [STORAGE_KEYS.EVALUATIONS, data.evaluations],
        [STORAGE_KEYS.ARCHIVED_EVALUATIONS, data.archivedEvaluations],
        [STORAGE_KEYS.DELEGATIONS, data.delegations],
      ];
      for (const [field, key] of Object.entries(OPTIONAL_BACKUP_KEYS)) {
        if (hasBackupField(data, field)) restoreEntries.push([key, data[field]]);
      }
      const restoreKeys = restoreEntries.map(([key]) => key);
      const previousRaw = new Map(restoreKeys.map(key => [key, localStorage.getItem(key)]));
      try {
        for (const [key, value] of restoreEntries) {
          const serialized = JSON.stringify(value);
          if (localStorage.getItem(key) !== serialized) localStorage.setItem(key, serialized);
        }
      } catch (restoreError: any) {
        try {
          this.restoreRawStorage(previousRaw);
        } catch (rollbackError: any) {
          throw new Error(`Restore failed and rollback failed: ${rollbackError?.message || rollbackError}; original error: ${restoreError?.message || restoreError}`);
        }
        throw restoreError;
      }

      // Publish the restore as one committed change only after every storage
      // write succeeds. Failed writes and rollbacks must not leak partial state
      // to subscribers or schedule a cloud push of transient data.
      for (const [key, value] of restoreEntries) {
        const serialized = JSON.stringify(value);
        if (previousRaw.get(key) === serialized) continue;
        this.notifyChange(key, value);
        if (this.cloudSyncEnabled && isCloudSyncKey(key)) this.dirtyKeys.add(key);
      }
      if (this.dirtyKeys.size > 0) this.triggerCloudSyncDebounced();

      return { success: true, message: 'اطلاعات پشتیبان با موفقیت بازیابی شد.' };
    } catch (e: any) {
      return { success: false, message: `خطا در بازخوانی فایل: ${e?.message || 'فرمت نامعتبر'}` };
    }
  }

  public resetToFactoryDefaults(): void {
    this.saveEmployees(SEED_EMPLOYEES);
    this.saveCriteria(SEED_CRITERIA);
    this.saveProfiles(SEED_PROFILES);
    this.saveEvaluations(SEED_EVALUATIONS);
    this.saveArchivedEvaluations([]);
  }

  // --- STORAGE MONITORING ---
  /** Approximate total bytes used by localStorage keys this app manages. */
  public getStorageUsage(): { totalBytes: number; keyCount: number; byKey: Record<string, number> } {
    let totalBytes = 0;
    const byKey: Record<string, number> = {};
    if (typeof localStorage === 'undefined') return { totalBytes: 0, keyCount: 0, byKey: {} };

    // Gather all keys this app controls (STORAGE_KEYS + misc + templates + logs)
    const appKeys = new Set<string>([
      ...Object.values(STORAGE_KEYS),
      'pe_system_logs',
      'chalak_excel_templates',
      'chalak_onboarding_step_guest',
      'chalak_cloud_client_id',
    ]);

    // Also include any onboarding step keys and known prefix keys
    const allKeys = Object.keys(localStorage);
    for (const key of allKeys) {
      if (key.startsWith('chalak_') || key.startsWith('pe_')) {
        appKeys.add(key);
      }
    }

    const keyCount = appKeys.size;
    for (const key of appKeys) {
      const val = localStorage.getItem(key);
      if (val !== null) {
        const size = val.length + key.length;
        byKey[key] = size;
        totalBytes += size;
      }
    }

    return { totalBytes, keyCount, byKey };
  }

  /** Attempt to estimate storage quota (best-effort, browser-dependent). */
  public async getStorageQuota(): Promise<{ quota?: number; usage?: number; percentage?: number } | null> {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
      return null;
    }
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage;
      const quota = estimate.quota;
      return {
        quota,
        usage,
        percentage: quota ? Math.round((usage / quota) * 100) : undefined,
      };
    } catch {
      return null;
    }
  }
}

export const db = new AppDatabase();

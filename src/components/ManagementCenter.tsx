/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  validateAdminPasswordChange, 
  sanitizeInputString, 
  clearLegacyAdminSessions,
  validateEmployeeInput,
  validateCriterionInput,
  validateJobProfileInput,
  validateEvaluationInput
} from '../utils/validation';
import { callPasswordApi, clearLegacyPasswordPersistence } from '../utils/passwordApi';
import { 
  Shield, 
  Key, 
  Download, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  FileSpreadsheet, 
  FileText, 
  FileJson,
  RefreshCw, 
  Trash2, 
  Search, 
  Users, 
  HelpCircle,
  FolderLock,
  UserCheck,
  Sparkles,
  Sliders,
  Award,
  UserCog,
  Check,
  RotateCcw,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  ShieldCheck,
  ShieldAlert,
  Dices,
  LockKeyhole,
  Filter,
  Activity,
  Clock,
  Layers,
  Database,
  FileCheck,
  ArrowUpDown,
  HardDrive,
  Server,
  Boxes,
  FileCode,
  Zap,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  History,
  Gauge,
  BookOpen,
  Printer
  ,X
} from 'lucide-react';
import { Employee, JobProfile, Criterion, Evaluation, UserRole, UserCustomPermission, CategoryKey, DEFAULT_ROUTE_RULES } from '../types';
import ExcelIntegrationCenter from './ExcelIntegrationCenter';
import GranularPermissionEditor from './GranularPermissionEditor';
import PerformanceArchiveVault from './PerformanceArchiveVault';
import ProductionCycleTimeCalculator from './ProductionCycleTimeCalculator';
import { getArchivedEvaluations, saveArchivedEvaluations } from '../utils/archiveManager';
import { db, mergeBackupCollections, validateBackupJSON } from '../utils/db';
import { generateSecurePassword } from '../utils/password';
import { planEmployeeBulkDeletion } from '../utils/employeeDeletion';
import { resolveInitialEvaluationWorkflow } from '../utils/evaluationStart';
import { Table as UiTable } from './ui/Primitives';
import { 
  ManualAccessPolicy, 
  getManualAccessPolicy, 
  saveManualAccessPolicy, 
  canUserViewManual, 
  canUserDownloadManual 
} from '../utils/manualAccessManager';

export interface SystemLog {
  id: string;
  timestamp: string;
  operator: string;
  action: string;
  details: string;
  type: 'info' | 'warning' | 'success' | 'danger';
}

interface ManagementCenterProps {
  employees: Employee[];
  profiles: JobProfile[];
  criteria: Criterion[];
  evaluations: Evaluation[];
  archivedEvaluations?: Evaluation[];
  onSetEmployees: (emps: Employee[]) => void;
  onSetProfiles: (profs: JobProfile[]) => void;
  onSetCriteria: (crits: Criterion[]) => void;
  onSetEvaluations: (evals: Evaluation[]) => void;
  onSetArchivedEvaluations?: (archived: Evaluation[]) => void;
  currentUser: Employee;
  theme: 'dark' | 'light';
  onForceReauth?: () => void;
}

export default function ManagementCenter({
  employees,
  profiles,
  criteria,
  evaluations,
  archivedEvaluations,
  onSetEmployees,
  onSetProfiles,
  onSetCriteria,
  onSetEvaluations,
  onSetArchivedEvaluations,
  currentUser,
  theme,
  onForceReauth
}: ManagementCenterProps) {
  // Navigation Tab inside Management Center
  const [activeSectionTab, setActiveSectionTab] = useState<'security' | 'rbac' | 'backup' | 'history' | 'logs' | 'all'>('security');

  // Internal fallback state for archived evaluations if not passed directly
  const [internalArchivedEvaluations, setInternalArchivedEvaluations] = useState<Evaluation[]>(() => {
    return archivedEvaluations || getArchivedEvaluations();
  });

  const effectiveArchived = archivedEvaluations || internalArchivedEvaluations;
  const handleSetArchived = (nextArchived: Evaluation[]) => {
    setInternalArchivedEvaluations(nextArchived);
    if (onSetArchivedEvaluations) {
      onSetArchivedEvaluations(nextArchived);
    } else {
      saveArchivedEvaluations(nextArchived);
    }
  };

  // Excel Integration Modal State
  const [isExcelIntegrationOpen, setIsExcelIntegrationOpen] = useState(false);

  // --- 1. USER PASSWORDS & LOCKOUT STATE ---
  // Password values exist in memory only long enough to show a newly generated value once.
  // Cloudflare stores only PBKDF2 hashes through /api/auth/password.
  const [customCredentialUsers, setCustomCredentialUsers] = useState<Set<string>>(new Set());

  const [lockedUsers, setLockedUsers] = useState<string[]>(() => {
    const saved = localStorage.getItem('pe_locked_users');
    if (saved) return JSON.parse(saved);
    return [];
  });

  
  const [userToDelete, setUserToDelete] = useState<Employee | null>(null);
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteEmpModalOpen, setIsBulkDeleteEmpModalOpen] = useState(false);

  const handleToggleSelectEmp = (id: string) => {
    const next = new Set(selectedEmpIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedEmpIds(next);
  };
  const handleToggleSelectAllEmps = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedEmpIds(new Set(employees.map(e => e.id)));
    } else {
      setSelectedEmpIds(new Set());
    }
  };
  const handleConfirmBulkDeleteEmps = async () => {
    if (selectedEmpIds.size === 0) return;
    const deletionPlan = planEmployeeBulkDeletion(
      Array.from(selectedEmpIds), employees, evaluations, archivedEvaluations || db.getArchivedEvaluations(),
    );
    const targets = employees.filter(employee => deletionPlan.deletableIds.has(employee.id));
    const blockedCount = selectedEmpIds.size - targets.length;
    if (targets.length === 0) {
      setCredentialsFeedback({ type: 'warning', message: 'کارکنان انتخاب‌شده سابقه، پرونده باز، رابطه سازمانی یا حساب محافظت‌شده دارند و حذف نشدند.' });
      setSelectedEmpIds(new Set());
      setIsBulkDeleteEmpModalOpen(false);
      return;
    }
    try {
      // P0 fix: single POST request with all usernames — NOT one DELETE per employee
      await callPasswordApi('/api/auth/password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_delete', usernames: targets.map(t => t.username) }),
      });
    } catch (error) {
      setCredentialsFeedback({ type: 'error', message: error instanceof Error ? error.message : 'حذف امن حساب‌ها ناموفق بود.' });
      return;
    }
    const targetIds = new Set(targets.map(employee => employee.id));
    const remaining = employees.filter(employee => !targetIds.has(employee.id));
    onSetEmployees(remaining);
    db.saveMiscData('pe_audit_logs', [
      { id: Date.now().toString(), date: new Date().toISOString(), user: currentUser.name, action: 'bulk_delete_users', details: `حذف گروهی ${targets.length} کاربر${blockedCount ? `؛ ${blockedCount} مورد به‌دلیل وابستگی حذف نشد` : ''}` },
      ...(db.getMiscData<any[]>('pe_audit_logs', []))
    ]);
    setSelectedEmpIds(new Set());
    setIsBulkDeleteEmpModalOpen(false);
    setCredentialsFeedback({
      type: blockedCount ? 'warning' : 'success',
      message: blockedCount ? `${targets.length} حساب حذف شد؛ ${blockedCount} مورد به‌دلیل سابقه یا وابستگی حفظ شد.` : `${targets.length} حساب کاربری حذف شد.`,
    });
  };


  useEffect(() => {
    db.saveMiscData('pe_locked_users', lockedUsers);
  }, [lockedUsers]);

  // Employee Password Management Search & Filters
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | UserRole>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'custom_pass' | 'default_pass' | 'locked'>('all');
  
  // Custom Password Edit Modal/Inline State
  const [editingPasswordEmp, setEditingPasswordEmp] = useState<Employee | null>(null);
  const [customPasswordInput, setCustomPasswordInput] = useState('');
  const [showCustomPassInput, setShowCustomPassInput] = useState(true);
  const [credentialsFeedback, setCredentialsFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // --- 2. ADMIN PASSWORD MANAGEMENT ---
  const [currentAdminPasswordInput, setCurrentAdminPasswordInput] = useState('');
  const [newAdminPasswordInput, setNewAdminPasswordInput] = useState('');
  const [confirmAdminPasswordInput, setConfirmAdminPasswordInput] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedMasterKey, setCopiedMasterKey] = useState(false);

  const passwordEditorVersion = useRef(0);
  const clearAdminPasswordInputs = () => {
    setCurrentAdminPasswordInput('');
    setNewAdminPasswordInput('');
    setConfirmAdminPasswordInput('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
  };
  const handleClosePasswordEditor = () => {
    passwordEditorVersion.current += 1;
    setCustomPasswordInput('');
    setShowCustomPassInput(false);
    setEditingPasswordEmp(null);
  };

  useEffect(() => {
    clearLegacyPasswordPersistence();
    clearAdminPasswordInputs();
    handleClosePasswordEditor();
    return () => {
      // Invalidate pending handoffs before a late response can restore a secret.
      handleClosePasswordEditor();
      clearAdminPasswordInputs();
    };
  }, [activeSectionTab, currentUser.id]);

  // --- 3. STATE FOR RBAC PERMISSIONS ---
  interface RolePermissions {
    role: UserRole;
    canEditCriteria: boolean;
    canEditProfiles: boolean;
    canEditEmployees: boolean;
    canStartEvaluations: boolean;
    canLockScores: boolean;
    canViewSalaries: boolean;
    canDefineTargets: boolean;
    canRestoreBackup: boolean;
  }

  const [permissions, setPermissions] = useState<RolePermissions[]>(() => {
    const saved = localStorage.getItem('pe_role_permissions');
    if (saved) return JSON.parse(saved);
    return [
      {
        role: 'admin',
        canEditCriteria: true,
        canEditProfiles: true,
        canEditEmployees: true,
        canStartEvaluations: true,
        canLockScores: true,
        canViewSalaries: true,
        canDefineTargets: true,
        canRestoreBackup: true
      },
      {
        role: 'supervisor',
        canEditCriteria: false,
        canEditProfiles: false,
        canEditEmployees: true,
        canStartEvaluations: true,
        canLockScores: false,
        canViewSalaries: false,
        canDefineTargets: true,
        canRestoreBackup: false
      },
      {
        role: 'employee',
        canEditCriteria: false,
        canEditProfiles: false,
        canEditEmployees: false,
        canStartEvaluations: false,
        canLockScores: false,
        canViewSalaries: false,
        canDefineTargets: false,
        canRestoreBackup: false
      }
    ];
  });

  useEffect(() => {
    db.saveMiscData('pe_role_permissions', permissions);
  }, [permissions]);

  // --- 4. STATE FOR INDIVIDUAL USER CUSTOM PERMISSIONS ---
  const [customUserPermissions, setCustomUserPermissions] = useState<Record<string, UserCustomPermission>>(() => {
    const saved = localStorage.getItem('pe_user_custom_permissions');
    if (saved) return JSON.parse(saved);
    return {};
  });

  useEffect(() => {
    db.saveMiscData('pe_user_custom_permissions', customUserPermissions);
  }, [customUserPermissions]);

  const [selectedIndividualId, setSelectedIndividualId] = useState<string>(() => {
    return employees[0]?.id || '';
  });

  const selectedIndividual = employees.find(e => e.id === selectedIndividualId) || employees[0];

  const [individualPermDraft, setIndividualPermDraft] = useState<UserCustomPermission>({
    userId: selectedIndividual?.id || '',
    canEditCriteria: false,
    canEditProfiles: false,
    canEditEmployees: false,
    canStartEvaluations: false,
    canLockScores: false,
    canDefineTargets: false,
    canViewReports: false,
    canRestoreBackup: false
  });

  const [individualRoleDraft, setIndividualRoleDraft] = useState<UserRole>(selectedIndividual?.role || 'employee');
  const [individualSaveFeedback, setIndividualSaveFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedIndividual) return;
    setIndividualRoleDraft(selectedIndividual.role);
    
    const custom = customUserPermissions[selectedIndividual.id];
    if (custom) {
      setIndividualPermDraft(custom);
    } else {
      const roleBase = permissions.find(p => p.role === selectedIndividual.role);
      setIndividualPermDraft({
        userId: selectedIndividual.id,
        canEditCriteria: roleBase?.canEditCriteria || false,
        canEditProfiles: roleBase?.canEditProfiles || false,
        canEditEmployees: roleBase?.canEditEmployees || false,
        canStartEvaluations: roleBase?.canStartEvaluations || false,
        canLockScores: roleBase?.canLockScores || false,
        canDefineTargets: roleBase?.canDefineTargets || false,
        canViewReports: selectedIndividual.role !== 'employee',
        canRestoreBackup: roleBase?.canRestoreBackup || false
      });
    }
  }, [selectedIndividualId, employees, customUserPermissions, permissions]);

  // --- 5. STATE FOR DATA MANAGEMENT, IMPORT/EXPORT & AUDIT LOGS ---
  type DataEntityKey = 'full_system' | 'employees' | 'criteria' | 'profiles' | 'evaluations';
  const [targetImportEntity, setTargetImportEntity] = useState<DataEntityKey>('full_system');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [rawImportText, setRawImportText] = useState('');
  const [importFeedback, setImportFeedback] = useState<{
    success: boolean;
    title: string;
    message: string;
    errors?: string[];
    stats?: { count: number; updated: number; created: number };
  } | null>(null);
  const [isProcessingImport, setIsProcessingImport] = useState(false);
  const [dataHubActiveView, setDataHubActiveView] = useState<'hub' | 'import' | 'export' | 'tools' | 'calc'>('hub');
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'warning' | 'success' | 'danger'>('all');

  const [logs, setLogs] = useState<SystemLog[]>(() => {
    const saved = localStorage.getItem('pe_system_logs');
    if (saved) return JSON.parse(saved);
    return [
      {
        id: 'log-1',
        timestamp: new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date()),
        operator: 'مدیریت منابع انسانی',
        action: 'راه‌اندازی سامانه',
        details: 'پایگاه داده و پروتکل‌های امنیتی با موفقیت آماده به کار شدند.',
        type: 'success'
      }
    ];
  });

  useEffect(() => {
    db.saveMiscData('pe_system_logs', logs);
  }, [logs]);

  const addLog = (action: string, details: string, type: SystemLog['type'] = 'info') => {
    const newLog: SystemLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date()),
      operator: currentUser.name,
      action,
      details,
      type
    };
    setLogs(prev => [newLog, ...prev.slice(0, 199)]);
  };

  // --- 5. STATE & HANDLERS FOR MANUAL ACCESS & DOWNLOAD POLICY ---
  const [manualPolicy, setManualPolicy] = useState<ManualAccessPolicy>(getManualAccessPolicy);
  const [manualPolicyFeedback, setManualPolicyFeedback] = useState<string | null>(null);
  const [manualSimulatorUserId, setManualSimulatorUserId] = useState<string>(() => employees[0]?.id || '');

  const distinctUnits = useMemo(() => {
    return Array.from(new Set(employees.map(e => e.unit).filter(Boolean)));
  }, [employees]);

  const simulatedEmployee = useMemo(() => {
    return employees.find(e => e.id === manualSimulatorUserId) || employees[0] || null;
  }, [employees, manualSimulatorUserId]);

  const simulatedCanView = useMemo(() => {
    return canUserViewManual(simulatedEmployee, manualPolicy);
  }, [simulatedEmployee, manualPolicy]);

  const simulatedCanDownload = useMemo(() => {
    return canUserDownloadManual(simulatedEmployee, manualPolicy);
  }, [simulatedEmployee, manualPolicy]);

  const triggerManualFeedback = (msg: string) => {
    setManualPolicyFeedback(msg);
    setTimeout(() => setManualPolicyFeedback(null), 3500);
  };

  const handleToggleManualViewRole = (role: UserRole) => {
    if (role === 'admin') return;
    const isCurrentlyAllowed = manualPolicy.allowedRolesToView.includes(role);
    const newViewRoles = isCurrentlyAllowed
      ? manualPolicy.allowedRolesToView.filter(r => r !== role)
      : [...manualPolicy.allowedRolesToView, role];

    const newDownloadRoles = isCurrentlyAllowed
      ? manualPolicy.allowedRolesToDownload.filter(r => r !== role)
      : manualPolicy.allowedRolesToDownload;

    const updated: ManualAccessPolicy = {
      ...manualPolicy,
      allowedRolesToView: newViewRoles,
      allowedRolesToDownload: newDownloadRoles
    };
    setManualPolicy(updated);
    saveManualAccessPolicy(updated, currentUser.name);
    addLog('تغییر دسترسی مشاهده کتابچه راهنما', `نقش ${role} ${!isCurrentlyAllowed ? 'مجاز شد' : 'محدود شد'}`, 'warning');
    triggerManualFeedback('تنظیمات مشاهده کتابچه راهنما ذخیره شد.');
  };

  const handleToggleManualDownloadRole = (role: UserRole) => {
    if (role === 'admin') return;
    const isCurrentlyAllowed = manualPolicy.allowedRolesToDownload.includes(role);
    const newDownloadRoles = isCurrentlyAllowed
      ? manualPolicy.allowedRolesToDownload.filter(r => r !== role)
      : [...manualPolicy.allowedRolesToDownload, role];

    const newViewRoles = !isCurrentlyAllowed && !manualPolicy.allowedRolesToView.includes(role)
      ? [...manualPolicy.allowedRolesToView, role]
      : manualPolicy.allowedRolesToView;

    const updated: ManualAccessPolicy = {
      ...manualPolicy,
      allowedRolesToView: newViewRoles,
      allowedRolesToDownload: newDownloadRoles
    };
    setManualPolicy(updated);
    saveManualAccessPolicy(updated, currentUser.name);
    addLog('تغییر مجوز دانلود کتابچه راهنما', `مجوز دانلود و چاپ PDF برای نقش ${role} ${!isCurrentlyAllowed ? 'فعال گردید' : 'غیرفعال شد'}`, 'warning');
    triggerManualFeedback('مجوز دانلود و چاپ فایل PDF ذخیره شد.');
  };

  const handleToggleManualUnit = (unit: string) => {
    const isCurrentlyAllowed = manualPolicy.allowedUnits.includes(unit);
    const newUnits = isCurrentlyAllowed
      ? manualPolicy.allowedUnits.filter(u => u !== unit)
      : [...manualPolicy.allowedUnits, unit];

    const updated: ManualAccessPolicy = {
      ...manualPolicy,
      allowedUnits: newUnits
    };
    setManualPolicy(updated);
    saveManualAccessPolicy(updated, currentUser.name);
    addLog('تغییر فیلتر واحدهای مجاز کتابچه', `واحد ${unit} ${!isCurrentlyAllowed ? 'به فهرست مجاز افزوده شد' : 'از فهرست مجاز حذف شد'}`, 'info');
    triggerManualFeedback('فیلتر واحدهای سازمانی ذخیره شد.');
  };

  const handleClearManualUnits = () => {
    const updated: ManualAccessPolicy = {
      ...manualPolicy,
      allowedUnits: []
    };
    setManualPolicy(updated);
    saveManualAccessPolicy(updated, currentUser.name);
    addLog('حذف محدودیت واحدها برای کتابچه', 'کتابچه برای تمامی واحدهای سازمان آزاد شد', 'info');
    triggerManualFeedback('محدودیت واحدها برداشته شد (آزاد برای تمام واحدها).');
  };

  const handleToggleManualWatermark = (val: boolean) => {
    const updated: ManualAccessPolicy = {
      ...manualPolicy,
      showWatermark: val
    };
    setManualPolicy(updated);
    saveManualAccessPolicy(updated, currentUser.name);
    addLog('تغییر وضعیت واترمارک کتابچه', `واترمارک امنیتی ${val ? 'فعال' : 'غیرفعال'} شد`, 'info');
    triggerManualFeedback(`واترمارک امنیتی هوشمند ${val ? 'فعال' : 'غیرفعال'} شد.`);
  };

  const handleApplyManualPreset = (preset: 'all' | 'standard' | 'supervisors' | 'admin_only') => {
    let updated: ManualAccessPolicy;
    if (preset === 'all') {
      updated = {
        ...manualPolicy,
        allowedRolesToView: ['admin', 'supervisor', 'employee'],
        allowedRolesToDownload: ['admin', 'supervisor', 'employee'],
        allowedUnits: []
      };
    } else if (preset === 'standard') {
      updated = {
        ...manualPolicy,
        allowedRolesToView: ['admin', 'supervisor', 'employee'],
        allowedRolesToDownload: ['admin', 'supervisor'],
        allowedUnits: []
      };
    } else if (preset === 'supervisors') {
      updated = {
        ...manualPolicy,
        allowedRolesToView: ['admin', 'supervisor'],
        allowedRolesToDownload: ['admin', 'supervisor'],
        allowedUnits: []
      };
    } else {
      updated = {
        ...manualPolicy,
        allowedRolesToView: ['admin'],
        allowedRolesToDownload: ['admin'],
        allowedUnits: []
      };
    }
    setManualPolicy(updated);
    saveManualAccessPolicy(updated, currentUser.name);
    addLog('اعمال الگوی دسترسی به کتابچه راهنما', `الگوی دسترسی به حالت ${preset} تغییر یافت`, 'success');
    triggerManualFeedback('الگوی امنیتی جدید اعمال گردید.');
  };

  // --- USER CREDENTIAL HANDLERS ---
  const updateCloudCredential = async (payload: Record<string, unknown>, method: 'POST' | 'DELETE' = 'POST') => {
    try {
      return await callPasswordApi('/api/auth/password', {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (error instanceof Error && (error.message === 'HTTP error' || error.message === 'Network error')) {
        throw new Error('سرویس امن کلمه عبور در دسترس نیست. برنامه باید با محیط Cloudflare Pages اجرا شود (دستور npm run cf:dev)؛ در حالت Vite-only ثبت رمز ممکن نیست.');
      }
      throw error;
    }
  };

  useEffect(() => {
    let active = true;
    fetch('/api/auth/password', { credentials: 'same-origin' })
      .then(async response => {
        if (!(response.headers.get('Content-Type') || '').includes('application/json')) return null;
        const result = await response.json() as { customUsernames?: string[] };
        return response.ok ? result : null;
      })
      .then(result => {
        if (active && result?.customUsernames) setCustomCredentialUsers(new Set(result.customUsernames));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const handleOpenEditPassword = (emp: Employee) => {
    handleClosePasswordEditor();
    setEditingPasswordEmp(emp);
    setCustomPasswordInput('');
  };

  const handleSaveCustomPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPass = customPasswordInput.trim();
    setCustomPasswordInput('');
    if (!editingPasswordEmp) return;
    const editorVersion = ++passwordEditorVersion.current;
    if (!cleanPass) {
      // If empty, remove custom pass (reset to default)
      const resetSucceeded = await handleResetUserPasswordToDefault(editingPasswordEmp.username);
      if (resetSucceeded) handleClosePasswordEditor();
      return;
    }

    if (cleanPass.length < 8) {
      setCredentialsFeedback({ type: 'error', message: 'کلمه عبور باید حداقل ۸ کاراکتر باشد.' });
      return;
    }

    try {
      await updateCloudCredential({ username: editingPasswordEmp.username, password: cleanPass });
    } catch (error) {
      setCredentialsFeedback({ type: 'error', message: error instanceof Error ? error.message : 'ثبت امن کلمه عبور ناموفق بود.' });
      return;
    }

    setCustomCredentialUsers(previous => new Set(previous).add(editingPasswordEmp.username.toLowerCase()));
    addLog(
      'تغییر کلمه عبور کاربر',
      `کلمه عبور کاربر «${editingPasswordEmp.name}» (${editingPasswordEmp.username}) توسط مدیریت با موفقیت تغییر یافت.`,
      'success'
    );
    setCredentialsFeedback({ type: 'success', message: `کلمه عبور همکار «${editingPasswordEmp.name}» با موفقیت ثبت گردید.` });
    if (editorVersion === passwordEditorVersion.current) handleClosePasswordEditor();
    setTimeout(() => setCredentialsFeedback(null), 4000);
  };

  const handleGenerateRandomPassword = async (emp: Employee) => {
    handleOpenEditPassword(emp);
    const editorVersion = passwordEditorVersion.current;
    const generated = generateSecurePassword();
    try {
      await updateCloudCredential({ username: emp.username, password: generated });
    } catch (error) {
      setCredentialsFeedback({ type: 'error', message: error instanceof Error ? error.message : 'ساخت کلمه عبور ناموفق بود.' });
      return;
    }
    
    setCustomCredentialUsers(previous => new Set(previous).add(emp.username.toLowerCase()));
    addLog(
      'تولید رمز تصادفی کاربر',
      `کلمه عبور تصادفی امن برای کاربر «${emp.name}» ایجاد و ثبت شد.`,
      'info'
    );
    if (editorVersion !== passwordEditorVersion.current) return;
    setCustomPasswordInput(generated);
    setShowCustomPassInput(true);
    setCredentialsFeedback({ type: 'success', message: `کلمه عبور امن برای ${emp.name} ثبت شد؛ مقدار نمایش‌داده‌شده را اکنون تحویل یا کپی کنید.` });
    setTimeout(() => setCredentialsFeedback(null), 5000);
  };

  const handleResetUserPasswordToDefault = async (username: string) => {
    handleClosePasswordEditor();
    try {
      await updateCloudCredential({ username }, 'DELETE');
    } catch (error) {
      setCredentialsFeedback({ type: 'error', message: error instanceof Error ? error.message : 'بازنشانی کلمه عبور ناموفق بود.' });
      return false;
    }
    setCustomCredentialUsers(previous => {
      const next = new Set(previous);
      next.delete(username.toLowerCase());
      return next;
    });
    addLog(
      'بازنشانی رمز کاربر به پیش‌فرض',
      `کلمه عبور کاربر «${username}» به کد پرسنلی او بازنشانی شد.`,
      'warning'
    );
    setCredentialsFeedback({ 
      type: 'success', 
      message: `کلمه عبور کاربر «${username}» به مقدار پیش‌فرض بازنشانی گردید.` 
    });
    setTimeout(() => setCredentialsFeedback(null), 4000);
    return true;
  };

  const handleToggleLockUser = (emp: Employee) => {
    const isLocked = lockedUsers.includes(emp.id) || lockedUsers.includes(emp.username.toLowerCase());
    let updated: string[];
    if (isLocked) {
      updated = lockedUsers.filter(id => id !== emp.id && id !== emp.username.toLowerCase());
      addLog('رفع مسدودی حساب کاربری', `حساب کاربری همکار «${emp.name}» (${emp.code}) فعال و رفع انسداد شد.`, 'success');
      setCredentialsFeedback({ type: 'success', message: `حساب کاربری ${emp.name} فعال گردید.` });
    } else {
      updated = [...lockedUsers, emp.id, emp.username.toLowerCase()];
      addLog('مسدودسازی حساب کاربری', `حساب کاربری همکار «${emp.name}» (${emp.code}) توسط مدیریت موقتاً مسدود شد.`, 'danger');
      setCredentialsFeedback({ type: 'error', message: `حساب کاربری ${emp.name} مسدود شد.` });
    }
    setLockedUsers(updated);
    setTimeout(() => setCredentialsFeedback(null), 4000);
  };

  const handleBulkResetAllPasswords = async () => {
    handleClosePasswordEditor();
    if (window.confirm('آیا از بازنشانی کلمه عبور تمام پرسنل به مقدار پیش‌فرض اطمینان دارید؟ تمامی رمزهای اختصاصی پاک خواهند شد.')) {
      try {
        await updateCloudCredential({ action: 'reset_all' });
      } catch (error) {
        setCredentialsFeedback({ type: 'error', message: error instanceof Error ? error.message : 'بازنشانی گروهی ناموفق بود.' });
        return;
      }
      setCustomCredentialUsers(new Set());
      addLog('بازنشانی گروهی کلمات عبور', 'کلمه عبور تمامی پرسنل و کاربران به مقدار پیش‌فرض بازنشانی گردید.', 'warning');
      setCredentialsFeedback({ type: 'success', message: 'کلمه عبور کلیه کاربران با موفقیت به پیش‌فرض بازنشانی شد.' });
      setTimeout(() => setCredentialsFeedback(null), 4000);
    }
  };

  const handleBulkUnlockAll = () => {
    setLockedUsers([]);
    addLog('رفع مسدودی همگانی', 'تمامی حساب‌های کاربری مسدودشده در کارخانه رفع انسداد شدند.', 'success');
    setCredentialsFeedback({ type: 'success', message: 'تمامی حساب‌های کاربری فعال شدند.' });
    setTimeout(() => setCredentialsFeedback(null), 4000);
  };

  // Filtered Employees List for Credentials Table
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const q = userSearchTerm.toLowerCase();
      const matchSearch = emp.name.toLowerCase().includes(q) || 
                          emp.code.toLowerCase().includes(q) || 
                          emp.username.toLowerCase().includes(q) || 
                          emp.unit.toLowerCase().includes(q);
      if (!matchSearch) return false;

      if (userRoleFilter !== 'all' && emp.role !== userRoleFilter) return false;

      const hasCustom = customCredentialUsers.has(emp.username.toLowerCase());
      const isLocked = lockedUsers.includes(emp.id) || lockedUsers.includes(emp.username.toLowerCase());

      if (userStatusFilter === 'custom_pass' && !hasCustom) return false;
      if (userStatusFilter === 'default_pass' && hasCustom) return false;
      if (userStatusFilter === 'locked' && !isLocked) return false;

      return true;
    });
  }, [employees, userSearchTerm, userRoleFilter, userStatusFilter, customCredentialUsers, lockedUsers]);

  // --- ADMIN PASSWORD HANDLERS ---
  const handleChangeAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);
    clearAdminPasswordInputs();

    const validation = validateAdminPasswordChange({
      currentPassword: currentAdminPasswordInput,
      newPassword: newAdminPasswordInput,
      confirmPassword: confirmAdminPasswordInput
    });

    if (!validation.success) {
      setPasswordFeedback({ type: 'error', message: validation.error });
      return;
    }

    const cleanNewPass = validation.newPassword;
    const nowIso = new Date().toISOString();

    try {
      await updateCloudCredential({
        username: 'admin',
        currentPassword: currentAdminPasswordInput,
        password: cleanNewPass,
      });
    } catch (error) {
      setPasswordFeedback({ type: 'error', message: error instanceof Error ? error.message : 'تغییر کلمه عبور مدیریت ناموفق بود.' });
      return;
    }

    // Clear legacy 'admin' local session keys and invalidate old session immediately
    clearLegacyAdminSessions();
    localStorage.setItem('pe_admin_password_updated_at', nowIso);

    // Notify other components & tabs of password change
    window.dispatchEvent(new CustomEvent('pe_admin_password_changed', { detail: { timestamp: nowIso } }));
    window.dispatchEvent(new Event('storage'));

    addLog('تغییر کلمه عبور مدیریت', 'کلمه عبور ورود مدیریت ارشد با موفقیت بروزرسانی شد و نشست‌های قبلی ابطال گردید.', 'success');
    setPasswordFeedback({ 
      type: 'success', 
      message: 'کلمه عبور مدیریت با موفقیت تغییر یافت. جهت تضمین امنیت، نشست قبلی ابطال گردید و به صفحه ورود منتقل می‌شوید...' 
    });
    setCurrentAdminPasswordInput('');
    setNewAdminPasswordInput('');
    setConfirmAdminPasswordInput('');

    // Force persistent session to re-authenticate after brief confirmation
    setTimeout(() => {
      if (onForceReauth) {
        onForceReauth();
      } else {
        clearLegacyAdminSessions();
        window.location.reload();
      }
    }, 1600);
  };

  // --- RBAC & INDIVIDUAL PERMISSION HANDLERS ---
  const handleToggleIndividualPerm = (key: keyof Omit<UserCustomPermission, 'userId'>) => {
    setIndividualPermDraft(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSaveIndividualPermissions = () => {
    if (!selectedIndividual) return;

    if (selectedIndividual.role !== individualRoleDraft) {
      const updatedEmployees = employees.map(e => 
        e.id === selectedIndividual.id ? { ...e, role: individualRoleDraft } : e
      );
      onSetEmployees(updatedEmployees);
    }

    const updatedCustom = {
      ...customUserPermissions,
      [selectedIndividual.id]: {
        ...individualPermDraft,
        userId: selectedIndividual.id
      }
    };
    setCustomUserPermissions(updatedCustom);

    addLog(
      'بروزرسانی دسترسی فردی', 
      `دسترسی‌های اختصاصی برای همکار «${selectedIndividual.name}» (${selectedIndividual.code}) با موفقیت ذخیره و اعمال شد.`, 
      'success'
    );

    setIndividualSaveFeedback('دسترسی‌ها و نقش این همکار با موفقیت ذخیره و اعمال گردید.');
    setTimeout(() => setIndividualSaveFeedback(null), 4000);
  };

  const handleResetIndividualToRole = () => {
    if (!selectedIndividual) return;
    const roleBase = permissions.find(p => p.role === individualRoleDraft);
    setIndividualPermDraft({
      userId: selectedIndividual.id,
      canEditCriteria: roleBase?.canEditCriteria || false,
      canEditProfiles: roleBase?.canEditProfiles || false,
      canEditEmployees: roleBase?.canEditEmployees || false,
      canStartEvaluations: roleBase?.canStartEvaluations || false,
      canLockScores: roleBase?.canLockScores || false,
      canDefineTargets: roleBase?.canDefineTargets || false,
      canViewReports: individualRoleDraft !== 'employee',
      canRestoreBackup: roleBase?.canRestoreBackup || false
    });

    const updated = { ...customUserPermissions };
    delete updated[selectedIndividual.id];
    setCustomUserPermissions(updated);

    addLog('بازنشانی دسترسی فردی', `دسترسی‌های همکار «${selectedIndividual.name}» به مقادیر پیش‌فرض نقش بازگردانده شد.`, 'info');
    setIndividualSaveFeedback('دسترسی‌های این همکار به تنظیمات پیش‌فرض نقش بازنشانی شد.');
    setTimeout(() => setIndividualSaveFeedback(null), 3000);
  };

  const handleGrantAllIndividual = () => {
    setIndividualPermDraft(prev => ({
      ...prev,
      canEditCriteria: true,
      canEditProfiles: true,
      canEditEmployees: true,
      canStartEvaluations: true,
      canLockScores: true,
      canDefineTargets: true,
      canViewReports: true,
      canRestoreBackup: true
    }));
  };

  const handleTogglePermission = (role: UserRole, key: keyof RolePermissions) => {
    if (role === 'admin' && key === 'canRestoreBackup') {
      alert('دسترسی پشتیبان‌گیری ادمین اصلی غیرقابل حذف است.');
      return;
    }
    setPermissions(prev => prev.map(p => {
      if (p.role === role) {
        const nextVal = !p[key];
        addLog('تغییر سطح دسترسی', `دسترسی ${key} برای نقش ${role} به ${nextVal ? 'فعال' : 'غیرفعال'} تغییر یافت.`, 'warning');
        return { ...p, [key]: nextVal } as RolePermissions;
      }
      return p;
    }));
  };

  // =========================================================================
  // UNIVERSAL DATA MANAGEMENT, IMPORT, EXPORT & MIGRATION ENGINE
  // =========================================================================

  // Helper to trigger browser download
  const triggerBrowserDownload = (content: string, filename: string, mimeType = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Helper to sanitize CSV field
  const formatCSVField = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val).trim();
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // 1. FULL SYSTEM BACKUP (JSON)
  const handleExportFullBackupJSON = () => {
    const fullBackup = {
      meta: {
        app: 'اصفهان چالاک - سامانه جامع مدیریت عملکرد، ارزیابی و شایستگی سازمانی',
        version: '4.0.0-Enterprise',
        exportDate: new Date().toISOString(),
        schemaVersion: 1,
        exportedBy: currentUser.name,
        totalEmployees: employees.length,
        totalCriteria: criteria.length,
        totalProfiles: profiles.length,
        totalEvaluations: evaluations.length,
        recordCounts: {
          employees: employees.length,
          criteria: criteria.length,
          profiles: profiles.length,
          evaluations: evaluations.length,
          archivedEvaluations: db.getArchivedEvaluations().length,
          delegations: db.getDelegations().length,
        },
      },
      employees,
      profiles,
      criteria,
      evaluations,
      archivedEvaluations: db.getArchivedEvaluations(),
      delegations: db.getDelegations(),
      permissions,
      customUserPermissions,
      lockedUsers,
      logs
    };

    const jsonString = JSON.stringify(fullBackup, null, 2);
    const filename = `chalak_full_backup_${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`;
    triggerBrowserDownload(jsonString, filename, 'application/json;charset=utf-8');
    
    addLog(
      'پشتیبان‌گیری کامل سامانه',
      `پشتیبان‌گیری جامع شامل ${employees.length} کارمند، ${criteria.length} شاخص، ${profiles.length} پروفایل و ${evaluations.length} ارزیابی با موفقیت صادر شد.`,
      'success'
    );

    setImportFeedback({
      success: true,
      title: 'پشتیبان‌گیری کامل انجام شد',
      message: `فایل کامل پایگاه داده (${filename}) با موفقیت تولید و بارگیری شد.`
    });
  };

  // 2. EXPORT SPECIFIC ENTITY TO JSON
  const handleExportEntityJSON = (entity: DataEntityKey) => {
    let data: any = null;
    let filenamePrefix = 'export';
    let entityTitle = '';

    switch (entity) {
      case 'employees':
        data = employees;
        filenamePrefix = 'employees_dataset';
        entityTitle = 'لیست کامل پرسنل';
        break;
      case 'criteria':
        data = criteria;
        filenamePrefix = 'criteria_bank';
        entityTitle = 'بانک شاخص‌های شایستگی';
        break;
      case 'profiles':
        data = profiles;
        filenamePrefix = 'job_profiles';
        entityTitle = 'پروفایل‌های شغلی';
        break;
      case 'evaluations':
        data = evaluations;
        filenamePrefix = 'evaluations_records';
        entityTitle = 'سوابق و نمرات ارزیابی';
        break;
      default:
        handleExportFullBackupJSON();
        return;
    }

    const payload = {
      meta: {
        entity,
        entityTitle,
        count: Array.isArray(data) ? data.length : 0,
        exportDate: new Date().toISOString(),
        exportedBy: currentUser.name
      },
      data
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const filename = `chalak_${filenamePrefix}_${Date.now()}.json`;
    triggerBrowserDownload(jsonString, filename, 'application/json;charset=utf-8');
    
    addLog('خروجی JSON اختصاصی', `خروجی داده‌های بخش «${entityTitle}» در قالب JSON دریافت شد.`, 'info');
  };

  // 3. EXPORT SPECIFIC ENTITY TO CSV (WITH UTF-8 BOM FOR EXCEL)
  const handleExportEntityCSV = (entity: DataEntityKey) => {
    let csvRows: string[] = [];
    let filename = `chalak_${entity}_${Date.now()}.csv`;
    let title = '';

    if (entity === 'employees') {
      title = 'لیست پرسنل و پرونده‌های همکاران';
      csvRows.push([
        'نام و نام خانوادگی',
        'کد پرسنلی',
        'واحد سازمانی',
        'عنوان رده شغلی',
        'نقش کاربری',
        'نام کاربری',
        'کد پرسنلی سرپرست مستقیم',
        'کد پرسنلی ارزیاب همتا',
        'کد پرسنلی تصویب‌کننده'
      ].join(','));

      employees.forEach(emp => {
        const prof = profiles.find(p => p.id === emp.profileId);
        const sup = employees.find(e => e.id === emp.supervisorId);
        const peer = employees.find(e => e.id === emp.peerReviewerId);
        const appr = employees.find(e => e.id === emp.approverId);
        const roleLabel = emp.role === 'admin' ? 'مدیر ارشد' : emp.role === 'supervisor' ? 'سرپرست' : 'کارمند';

        csvRows.push([
          formatCSVField(emp.name),
          formatCSVField(emp.code),
          formatCSVField(emp.unit),
          formatCSVField(prof?.title || prof?.code || emp.profileId),
          formatCSVField(roleLabel),
          formatCSVField(emp.username),
          formatCSVField(sup?.code || ''),
          formatCSVField(peer?.code || ''),
          formatCSVField(appr?.code || '')
        ].join(','));
      });
    } else if (entity === 'criteria') {
      title = 'بانک شاخص‌ها و سنجه‌های شایستگی';
      csvRows.push([
        'کد شاخص',
        'عنوان شاخص',
        'دسته‌بندی (K/B/Q/S/L)',
        'تعریف عملیاتی و سنجه',
        'منبع داده و استخراج',
        'روش و فرمول سنجش',
        'جهت مطلوبیت (more/less)'
      ].join(','));

      criteria.forEach(crit => {
        csvRows.push([
          formatCSVField(crit.code),
          formatCSVField(crit.name),
          formatCSVField(crit.cat),
          formatCSVField(crit.def),
          formatCSVField(crit.source || ''),
          formatCSVField(crit.method || ''),
          formatCSVField(crit.dir || 'more')
        ].join(','));
      });
    } else if (entity === 'profiles') {
      title = 'پروفایل‌ها و ماتریس‌های شایستگی شغلی';
      csvRows.push([
        'عنوان رده شغلی',
        'کد شغل',
        'خانواده شغلی',
        'شاخص‌ها و اوزان شایستگی',
        'وضعیت تصویب'
      ].join(','));

      profiles.forEach(prof => {
        const summary = prof.items.map(item => {
          const crit = criteria.find(c => c.id === item.cid);
          return `${crit?.code || item.cid}(${item.weight}%)`;
        }).join(' | ');

        csvRows.push([
          formatCSVField(prof.title),
          formatCSVField(prof.code),
          formatCSVField(prof.family),
          formatCSVField(summary),
          formatCSVField(prof.locked ? 'تصویب شده' : 'پیش‌نویس')
        ].join(','));
      });
    } else if (entity === 'evaluations') {
      title = 'سوابق و احکام ارزیابی عملکرد';
      csvRows.push([
        'کد پرسنلی همکار',
        'نام همکار',
        'دوره ارزیابی',
        'عنوان پروفایل شغلی',
        'وضعیت پرونده',
        'میانگین نمره نهایی',
        'یادداشت‌های توسعه و مربیگری'
      ].join(','));

      evaluations.forEach(ev => {
        const emp = employees.find(e => e.id === ev.empId);
        const prof = profiles.find(p => p.id === ev.profileId);
        const totalWeight = ev.scores.reduce((sum, s) => sum + s.weight, 0);
        const weightedScore = totalWeight > 0 
          ? (ev.scores.reduce((sum, s) => sum + s.value * s.weight, 0) / totalWeight).toFixed(2)
          : '0.00';
        
        const statusLabel = 
          ev.status === 'locked' ? 'قفل شده' :
          ev.status === 'calibrated' ? 'کالیبره شده' : 'پیش‌نویس';

        csvRows.push([
          formatCSVField(emp?.code || ev.empId),
          formatCSVField(emp?.name || ''),
          formatCSVField(ev.period),
          formatCSVField(prof?.title || ev.profileId),
          formatCSVField(statusLabel),
          formatCSVField(weightedScore),
          formatCSVField(ev.note || '')
        ].join(','));
      });
    } else {
      handleExportFullBackupJSON();
      return;
    }

    // Include UTF-8 BOM so Excel opens Persian text without distortion
    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    triggerBrowserDownload(csvContent, filename, 'text/csv;charset=utf-8');
    addLog('خروجی اکسل CSV', `خروجی داده‌های «${title}» با فرمت استاندارد CSV دانلود شد.`, 'info');
  };

  // 4. DOWNLOAD BLANK / SAMPLE CSV TEMPLATES
  const handleDownloadEntityTemplate = (entity: DataEntityKey) => {
    let templateRows: string[] = [];
    let filename = `chalak_${entity}_template.csv`;

    if (entity === 'employees') {
      templateRows.push('نام و نام خانوادگی,کد پرسنلی,واحد سازمانی,عنوان رده شغلی,نقش کاربری,نام کاربری,کد پرسنلی سرپرست مستقیم,کد پرسنلی ارزیاب همتا,کد پرسنلی تصویب‌کننده');
      templateRows.push('کارمند نمونه,EMP-1001,سالن ماشین‌کاری ۱,اپراتور ارشد تراشکاری CNC,کارمند,emp_demo,EMP-1008,EMP-1002,EMP-1008');
      templateRows.push('مهندس کامران صباغی,EMP-1008,سالن ماشین‌کاری ۱,سرپرست تولید و ماشین‌کاری,سرپرست,kamran,,,');
      templateRows.push('مهندس سارا عباسی,EMP-1002,واحد کنترل کیفیت QC,کارشناس ارشد کنترل کیفیت,کارمند,sara_abbasi,EMP-1008,,EMP-1008');
    } else if (entity === 'criteria') {
      templateRows.push('کد شاخص,عنوان شاخص,دسته‌بندی (K/B/Q/S/L),تعریف عملیاتی و سنجه,منبع داده و استخراج,روش و فرمول سنجش,جهت مطلوبیت (more/less)');
      templateRows.push('K-PRD-01,درصد تحقق برنامه تولید ماهانه,K,نسبت قطعات سالم مونتاژ شده به برنامه مصوب ماهانه,سیستم MES و کارت تولید,فرمول درصدی (تولید واقعی تقسیم بر هدف),more');
      templateRows.push('B-HSE-01,رعایت ضوابط ایمنی و ۵اس کارگاه,B,استفاده از تجهیزات حفاظت فردی PPE و تفکیک زباله و نظم ۵اس,گزارشات ممیزی HSE و چک‌لیست سرپرست,مقیاس ۵ سطحی کیفی,more');
      templateRows.push('K-SCR-02,نرخ ضایعات و قطعات معیوب,K,درصد قطعات اسقاطی نسبت به کل خروجی خط,کنترل کیفیت آماری SQC,درصد ضایعات خط,less');
    } else if (entity === 'profiles') {
      templateRows.push('عنوان رده شغلی,کد شغل,خانواده شغلی,شاخص‌ها و اوزان شایستگی,وضعیت تصویب');
      templateRows.push('اپراتور ارشد تراشکاری CNC,OP-CNC-01,فنی و مهندسی,K-PRD-01(25%) | B-HSE-01(20%) | K-QC-01(20%) | B-TEAM-01(20%) | B-5S-01(15%),تصویب شده');
      templateRows.push('سرپرست مونتاژ و بسته‌بندی,SUP-MN-01,تولید و عملیات,K-PRD-01(30%) | B-HSE-01(25%) | B-LEAD-01(25%) | K-EFF-01(20%),تصویب شده');
    } else if (entity === 'evaluations') {
      templateRows.push('کد پرسنلی همکار,نام همکار,دوره ارزیابی,عنوان پروفایل شغلی,وضعیت پرونده,میانگین نمره نهایی,یادداشت‌های توسعه و مربیگری');
      templateRows.push('EMP-1001,کارمند نمونه,ارزیابی عملکرد تابستان ۱۴۰۳,اپراتور ارشد تراشکاری CNC,approved,4.40,دقت و انضباط فنی بسیار بالا در شیفت شب');
    } else {
      handleExportFullBackupJSON();
      return;
    }

    const csvContent = '\uFEFF' + templateRows.join('\r\n');
    triggerBrowserDownload(csvContent, filename, 'text/csv;charset=utf-8');
  };

  // 5. UNIVERSAL IMPORT PROCESSOR
  const handleProcessImport = (contentToImport: string, entityTarget: DataEntityKey, mode: 'merge' | 'replace') => {
    const text = contentToImport.trim();
    if (!text) {
      setImportFeedback({
        success: false,
        title: 'داده‌ای یافت نشد',
        message: 'لطفاً فایل مورد نظر را انتخاب کرده یا متن داده‌ها را در کادر وارد نمایید.'
      });
      return;
    }

    setIsProcessingImport(true);
    const errors: string[] = [];
    let successCount = 0;
    let createdCount = 0;
    let updatedCount = 0;

    try {
      // CHECK IF INPUT IS A FULL SYSTEM BACKUP JSON
      if (text.startsWith('{') && text.endsWith('}')) {
        const parsed = JSON.parse(text);

        // Check if it is a full backup object
        if ('employees' in parsed || 'profiles' in parsed || 'criteria' in parsed || 'evaluations' in parsed) {
          // Recognize only this application's historical UI backup envelope.
          // Its export preceded schemaVersion but already contained six arrays.
          const legacyUiBackup = parsed.meta?.version === '4.0.0-Enterprise' && parsed.meta?.schemaVersion === undefined;
          const normalizedBackup = legacyUiBackup
            ? { ...parsed, meta: { ...parsed.meta, schemaVersion: 1 } }
            : parsed;
          let incoming: Record<string, any>;
          try {
            incoming = validateBackupJSON(JSON.stringify(normalizedBackup));
          } catch (validationError) {
            const reason = validationError instanceof Error ? validationError.message : 'ساختار نامعتبر';
            throw new Error(`ساختار فایل پشتیبان معتبر نیست؛ ${reason}`);
          }
          const candidate = mode === 'merge'
            ? mergeBackupCollections(incoming, {
                employees, criteria, profiles, evaluations,
                archivedEvaluations: db.getArchivedEvaluations(),
                delegations: db.getDelegations(),
              })
            : incoming;
          const result = db.importBackupJSON(JSON.stringify(candidate));
          if (!result.success) throw new Error(result.message);

          if (parsed.permissions) setPermissions(parsed.permissions);
          if (parsed.customUserPermissions) setCustomUserPermissions(parsed.customUserPermissions);
          if (parsed.lockedUsers) setLockedUsers(parsed.lockedUsers);
          if (parsed.logs) setLogs(parsed.logs);

          addLog(
            'بازیابی پایگاه داده جامع',
            `بازیابی سیستم از فایل پشتیبان با حالت «${mode === 'replace' ? 'جایگزینی کامل' : 'ادغام هوشمند'}» انجام شد.`,
            'danger'
          );

          setImportFeedback({
            success: true,
            title: 'بازیابی جامع سیستم با موفقیت کامل انجام شد',
            message: `داده‌های ${parsed.employees.length} کارمند، ${parsed.criteria.length} شاخص، ${parsed.profiles.length} رده شغلی و ${parsed.evaluations.length} ارزیابی در پایگاه داده بازنشانی شدند.`,
            stats: { count: parsed.employees.length + parsed.criteria.length + parsed.profiles.length, updated: 0, created: 0 }
          });
          setRawImportText('');
          setIsProcessingImport(false);
          return;
        }

        // If JSON has a "data" array
        if (Array.isArray(parsed.data)) {
          // delegate to array processing below
        }
      }

      // PARSE JSON ARRAY OR CSV ROWS
      let rawItems: any[] = [];

      if (text.startsWith('[') && text.endsWith(']')) {
        rawItems = JSON.parse(text);
      } else if (text.startsWith('{') && text.endsWith('}')) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed.data)) {
          rawItems = parsed.data;
        } else {
          rawItems = [parsed];
        }
      } else {
        // Parse CSV Lines
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 2) {
          throw new Error('فایل CSV باید حداقل شامل یک سطر عنوان (Header) و یک سطر داده باشد.');
        }

        // Parse Header line
        const headerCols = lines[0].split(/[,;\t]/).map(c => c.trim().replace(/^["']|["']$/g, ''));

        for (let i = 1; i < lines.length; i++) {
          const rawLine = lines[i];
          if (!rawLine) continue;

          // Simple CSV line splitter respecting quotes
          const cols: string[] = [];
          let insideQuotes = false;
          let currentField = '';

          for (let charIdx = 0; charIdx < rawLine.length; charIdx++) {
            const char = rawLine[charIdx];
            if (char === '"' || char === "'") {
              insideQuotes = !insideQuotes;
            } else if ((char === ',' || char === ';' || char === '\t') && !insideQuotes) {
              cols.push(currentField.trim().replace(/^["']|["']$/g, ''));
              currentField = '';
            } else {
              currentField += char;
            }
          }
          cols.push(currentField.trim().replace(/^["']|["']$/g, ''));

          const itemObj: Record<string, string> = {};
          headerCols.forEach((header, colIdx) => {
            itemObj[header] = cols[colIdx] || '';
          });
          rawItems.push(itemObj);
        }
      }

      if (rawItems.length === 0) {
        throw new Error('هیچ رکوردی برای پردازش در فایل ورودی یافت نشد.');
      }

      // ENTITY-SPECIFIC PROCESSORS
      if (entityTarget === 'employees') {
        const newEmployeesList = mode === 'replace' ? [] : [...employees];
        const defaultProfId = profiles[0]?.id || 'prof-1';

        rawItems.forEach((raw, idx) => {
          const rowNum = idx + 1;
          const name = (raw.name || raw['نام و نام خانوادگی'] || '').trim();
          const code = (raw.code || raw['کد پرسنلی'] || '').trim().toUpperCase();
          const unit = (raw.unit || raw['واحد سازمانی'] || 'واحد تولید').trim();

          const rawProf = (raw.profile || raw.profileId || raw['عنوان رده شغلی'] || raw['پروفایل شغلی'] || '').trim();
          let profileId = defaultProfId;
          if (rawProf) {
            const matchedProf = profiles.find(p => 
              p.id === rawProf || 
              p.code.toLowerCase() === rawProf.toLowerCase() || 
              p.title.toLowerCase() === rawProf.toLowerCase()
            );
            if (matchedProf) profileId = matchedProf.id;
          }

          const rawRole = (raw.role || raw['نقش کاربری'] || raw['نقش'] || 'employee').trim().toLowerCase();
          let role: UserRole = 'employee';
          if (rawRole.includes('admin') || rawRole.includes('مدیر')) role = 'admin';
          else if (rawRole.includes('supervisor') || rawRole.includes('سرپرست')) role = 'supervisor';

          let username = (raw.username || raw['نام کاربری'] || '').trim().toLowerCase();
          if (!username && code) {
            username = `user_${code.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
          }

          const rawSupCode = (raw.supervisor || raw.supervisorId || raw['کد پرسنلی سرپرست مستقیم'] || '').trim().toUpperCase();
          const supervisor = rawSupCode ? employees.find(e => e.code.toUpperCase() === rawSupCode || e.id === rawSupCode) : undefined;

          const rawPeerCode = (raw.peer || raw.peerReviewerId || raw['کد پرسنلی ارزیاب همتا'] || '').trim().toUpperCase();
          const peer = rawPeerCode ? employees.find(e => e.code.toUpperCase() === rawPeerCode || e.id === rawPeerCode) : undefined;

          const rawApprCode = (raw.approver || raw.approverId || raw['کد پرسنلی تصویب‌کننده'] || '').trim().toUpperCase();
          const approver = rawApprCode ? employees.find(e => e.code.toUpperCase() === rawApprCode || e.id === rawApprCode) : undefined;

          const candidate = {
            name,
            code,
            unit,
            profileId,
            role,
            username,
            supervisorId: supervisor?.id,
            peerReviewerId: peer?.id,
            approverId: approver?.id
          };

          const validation = validateEmployeeInput(candidate);
          if (!validation.success) {
            errors.push(`سطر ${rowNum} (${name || code || 'ناشناس'}): ${validation.errors.join('، ')}`);
            return;
          }

          const validEmp = validation.data;
          const existingIdx = newEmployeesList.findIndex(e => 
            e.code.toUpperCase() === validEmp.code.toUpperCase() || 
            e.username.toLowerCase() === validEmp.username.toLowerCase()
          );

          if (existingIdx >= 0) {
            newEmployeesList[existingIdx] = { ...newEmployeesList[existingIdx], ...validEmp };
            updatedCount++;
          } else {
            newEmployeesList.push({
              id: `emp-${Math.random().toString(36).substring(2, 9)}`,
              ...validEmp
            });
            createdCount++;
          }
          successCount++;
        });

        onSetEmployees(newEmployeesList);
        addLog('ایمپورت پرسنل', `تعداد ${successCount} پرونده پرسنلی بارگذاری شد (${createdCount} جدید، ${updatedCount} به‌روزرسانی).`, 'success');
      } else if (entityTarget === 'criteria') {
        const newCriteriaList = mode === 'replace' ? [] : [...criteria];

        rawItems.forEach((raw, idx) => {
          const rowNum = idx + 1;
          const rawCode = (raw.code || raw['کد شاخص'] || `C-${Math.floor(Math.random() * 1000)}`).trim().toUpperCase();
          const rawName = (raw.name || raw['عنوان شاخص'] || 'شاخص شایستگی جدید').trim();
          const rawCatStr = (raw.cat || raw['دسته‌بندی (K/B/Q/S/L)'] || raw['دسته‌بندی'] || 'K').toString().toUpperCase();
          let rawCat: CategoryKey = 'K';
          if (rawCatStr.startsWith('B')) rawCat = 'B';
          else if (rawCatStr.startsWith('Q')) rawCat = 'Q';
          else if (rawCatStr.startsWith('S')) rawCat = 'S';
          else if (rawCatStr.startsWith('L')) rawCat = 'L';

          const rawDef = (raw.def || raw['تعریف عملیاتی و سنجه'] || raw['تعریف عملیاتی'] || `تعریف عملیاتی شاخص ${rawName}`).trim();
          const rawSource = (raw.source || raw['منبع داده و استخراج'] || raw['منبع داده'] || 'سیستم کارخانه').trim();
          const rawMethod = (raw.method || raw['روش و فرمول سنجش'] || raw['روش سنجش'] || 'سنجش دوره‌ای').trim();
          const rawDir = ((raw.dir || raw['جهت مطلوبیت (more/less)'] || raw['جهت مطلوبیت'] || 'more') === 'less' ? 'less' : 'more') as 'more' | 'less';

          const candidate = {
            code: rawCode,
            name: rawName,
            cat: rawCat,
            def: rawDef,
            source: rawSource,
            method: rawMethod,
            dir: rawDir
          };

          const validation = validateCriterionInput(candidate);
          if (!validation.success) {
            errors.push(`سطر ${rowNum} (${rawCode}): ${validation.errors.join('، ')}`);
            return;
          }

          const validCrit = validation.data;
          const existingIdx = newCriteriaList.findIndex(c => c.code.toUpperCase() === validCrit.code.toUpperCase());

          if (existingIdx >= 0) {
            newCriteriaList[existingIdx] = { ...newCriteriaList[existingIdx], ...validCrit };
            updatedCount++;
          } else {
            newCriteriaList.push({
              id: `crit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              ...validCrit
            });
            createdCount++;
          }
          successCount++;
        });

        onSetCriteria(newCriteriaList);
        addLog('ایمپورت شاخص‌ها', `تعداد ${successCount} شاخص شایستگی ثبت گردید (${createdCount} جدید، ${updatedCount} به‌روزرسانی).`, 'success');
      } else if (entityTarget === 'profiles') {
        const newProfilesList = mode === 'replace' ? [] : [...profiles];

        rawItems.forEach((raw, idx) => {
          const rowNum = idx + 1;
          const title = (raw.title || raw['عنوان رده شغلی'] || 'شغل جدید').trim();
          const code = (raw.code || raw['کد شغل'] || `P-${Math.floor(Math.random() * 1000)}`).trim().toUpperCase();
          const family = (raw.family || raw['خانواده شغلی'] || 'تولید و عملیات').trim();

          let items: { cid: string; weight: number }[] = [];
          if (Array.isArray(raw.items)) {
            items = raw.items;
          } else {
            const summaryStr = (raw.itemsSummary || raw['شاخص‌ها و اوزان شایستگی'] || raw['شاخص‌ها و اوزان'] || '').toString();
            if (summaryStr) {
              const segments = summaryStr.split(/[|,;]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
              segments.forEach((seg: string) => {
                const match = seg.match(/^([A-Za-z0-9\-_]+)\s*\(?\s*(\d+)\s*%?\)?/);
                if (match) {
                  const critCode = match[1].trim();
                  const weight = parseInt(match[2], 10);
                  const matchedCrit = criteria.find(c => c.code.toLowerCase() === critCode.toLowerCase() || c.id === critCode);
                  if (matchedCrit) {
                    items.push({ cid: matchedCrit.id, weight });
                  }
                }
              });
            }

            if (items.length === 0) {
              const safetyCrit = criteria.find(c => c.code === 'B-HSE-01' || c.cat === 'B') || criteria[0];
              if (safetyCrit) items = [{ cid: safetyCrit.id, weight: 100 }];
            }
          }

          const candidate = {
            title,
            code,
            family,
            items,
            locked: Boolean(raw.locked || (raw['وضعیت تصویب'] && raw['وضعیت تصویب'].includes('تصویب')))
          };

          const validation = validateJobProfileInput(candidate);
          if (!validation.success) {
            errors.push(`سطر ${rowNum} (${title} - ${code}): ${validation.errors.join('، ')}`);
            return;
          }

          const validProf = validation.data;
          const existingIdx = newProfilesList.findIndex(p => p.code.toUpperCase() === validProf.code.toUpperCase());

          if (existingIdx >= 0) {
            newProfilesList[existingIdx] = { ...newProfilesList[existingIdx], ...validProf };
            updatedCount++;
          } else {
            newProfilesList.push({
              id: `prof-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              ...validProf
            });
            createdCount++;
          }
          successCount++;
        });

        onSetProfiles(newProfilesList);
        addLog('ایمپورت پروفایل‌های شغلی', `تعداد ${successCount} الگوی شغلی ثبت شد (${createdCount} جدید، ${updatedCount} به‌روزرسانی).`, 'success');
      } else if (entityTarget === 'evaluations') {
        const newEvaluationsList = mode === 'replace' ? [] : [...evaluations];

        rawItems.forEach((raw, idx) => {
          const rowNum = idx + 1;
          const empCode = (raw.empCode || raw['کد پرسنلی همکار'] || raw.empId || '').toString().trim().toUpperCase();
          const matchedEmp = employees.find(e => e.code.toUpperCase() === empCode || e.id === empCode);
          if (!matchedEmp) {
            errors.push(`سطر ${rowNum}: کد پرسنلی «${empCode}» در سامانه یافت نشد.`);
            return;
          }

          const period = (raw.period || raw['دوره ارزیابی'] || 'ارزیابی دوره جاری').trim();
          const profId = matchedEmp.profileId || profiles[0]?.id || 'prof-1';
          const prof = profiles.find(p => p.id === profId);
          const initialWorkflow = resolveInitialEvaluationWorkflow(matchedEmp, employees, db.getMiscData('pe_route_rules', DEFAULT_ROUTE_RULES), profId);

          const scores = prof ? prof.items.map(item => ({
            cid: item.cid,
            weight: item.weight,
            value: 4,
            self: initialWorkflow.requiresSelfReview ? 4 : 0,
            doc: ''
          })) : [];

          const newEval: Evaluation = {
            id: `eval-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            empId: matchedEmp.id,
            profileId: profId,
            period,
            status: 'draft',
            ...initialWorkflow,
            scores,
            note: raw.note || raw.growthNotes || raw['یادداشت‌های توسعه و مربیگری'] || '',
            created: Date.now()
          };

          newEvaluationsList.push(newEval);
          createdCount++;
          successCount++;
        });

        onSetEvaluations(newEvaluationsList);
        addLog('ایمپورت ارزیابی‌ها', `تعداد ${successCount} رکورد ارزیابی جدید ثبت گردید.`, 'success');
      }

      setImportFeedback({
        success: true,
        title: 'عملیات با موفقیت انجام شد',
        message: `تعداد ${successCount} رکورد با موفقیت پردازش شد (${createdCount} مورد جدید ایجاد شد و ${updatedCount} مورد به‌روزرسانی گردید).`,
        errors: errors.length > 0 ? errors : undefined,
        stats: { count: successCount, created: createdCount, updated: updatedCount }
      });
      setRawImportText('');
    } catch (err: any) {
      setImportFeedback({
        success: false,
        title: 'خطا در پردازش فایل یا متن ارسالی',
        message: err.message || 'فرمت داده‌های ورودی نامعتبر است. لطفاً ساختار داده‌ها را بر اساس نمونه الگو بررسی فرمایید.'
      });
    } finally {
      setIsProcessingImport(false);
    }
  };

  // 6. INDUSTRIAL DEMO DATASET LOADER (RICH WORKSHOP ROSTER)
  const handleLoadIndustrialDemoDataset = () => {
    if (!window.confirm('آیا از بارگذاری بسته داده‌های استاندارد کارخانه اطمینان دارید؟ داده‌های نمونه غنی به سامانه افزوده خواهند شد.')) {
      return;
    }

    const demoCriteria: Criterion[] = [
      { id: 'crit-demo-1', code: 'K-PRD-01', cat: 'K', name: 'درصد تحقق برنامه تولید خط مونتاژ', def: 'نسبت تیراژ قطعات سالم تولیدشده به برنامه مصوب شیفت', source: 'سیستم MES و کارت تولید', method: 'فرمول درصدی تولید واقعی به برنامه', dir: 'more' },
      { id: 'crit-demo-2', code: 'K-QC-01', cat: 'K', name: 'شاخص کیفیت قطعه و PPM ضایعات', def: 'تعداد قطعات معیوب در هر یک میلیون قطعه تولیدی', source: 'ایستگاه کنترل کیفیت QC', method: 'شاخص آماری PPM', dir: 'less' },
      { id: 'crit-demo-3', code: 'K-OEE-01', cat: 'K', name: 'اثربخشی کلی تجهیزات (OEE)', def: 'محاسبه همزمان در دسترس بودن ماشین‌آلات، عملکرد و کیفیت', source: 'سیستم نگهداری و تعمیرات PM', method: 'فرمول استاندارد OEE', dir: 'more' },
      { id: 'crit-demo-4', code: 'B-HSE-01', cat: 'B', name: 'رعایت پروتکل‌های ایمنی، PPE و ۵اس', def: 'استفاده مستمر از کلاه، دستکش، عینک ایمنی و رعایت تفکیک ضایعات', source: 'ممیزی‌های تصادفی افسر ایمنی HSE', method: 'مقیاس ۵ سطحی کیفی', dir: 'more' },
      { id: 'crit-demo-5', code: 'B-TEAM-01', cat: 'B', name: 'همکاری بین‌فردی و کار تیمی کارگاهی', def: 'مشارکت موثر در تحویل شیفت، حل مسئله خط و کمک به همکاران', source: 'نظرسنجی همتایان و تایید سرپرست', method: 'مقیاس ۵ سطحی شایستگی', dir: 'more' },
      { id: 'crit-demo-6', code: 'B-5S-01', cat: 'B', name: 'نظم و آراستگی محیط کارگاهی (5S)', def: 'ساماندهی، پاکیزه‌سازی، استانداردسازی و حفظ انضباط ابزارآلات', source: 'چک‌لیست هفتگی ۵اس', method: 'نمره ۱ تا ۵ چک‌لیست', dir: 'more' }
    ];

    const demoProfiles: JobProfile[] = [
      {
        id: 'prof-demo-1',
        title: 'اپراتور ارشد تراشکاری و فرز CNC',
        code: 'OP-CNC-01',
        family: 'فنی و مهندسی',
        locked: true,
        items: [
          { cid: 'crit-demo-1', weight: 25 },
          { cid: 'crit-demo-2', weight: 25 },
          { cid: 'crit-demo-3', weight: 15 },
          { cid: 'crit-demo-4', weight: 20 },
          { cid: 'crit-demo-5', weight: 15 }
        ]
      },
      {
        id: 'prof-demo-2',
        title: 'سرپرست تولید و ماشین‌کاری خطوط صنعتی',
        code: 'SUP-PRD-01',
        family: 'تولید و عملیات',
        locked: true,
        items: [
          { cid: 'crit-demo-1', weight: 30 },
          { cid: 'crit-demo-3', weight: 25 },
          { cid: 'crit-demo-4', weight: 25 },
          { cid: 'crit-demo-5', weight: 20 }
        ]
      },
      {
        id: 'prof-demo-3',
        title: 'کارشناس ارشد تضمین و کنترل کیفیت (QA/QC)',
        code: 'ENG-QC-01',
        family: 'کیفیت و آزمایشگاه',
        locked: true,
        items: [
          { cid: 'crit-demo-2', weight: 35 },
          { cid: 'crit-demo-4', weight: 25 },
          { cid: 'crit-demo-5', weight: 20 },
          { cid: 'crit-demo-6', weight: 20 }
        ]
      }
    ];

    const demoEmployees: Employee[] = [
      { id: 'emp-demo-1', name: 'مهندس کامران صباغی', code: 'EMP-1000', unit: 'سالن ماشین‌کاری ۱', profileId: 'prof-demo-2', role: 'supervisor', username: 'kamran' },
      { id: 'emp-demo-2', name: 'کارمند نمونه', code: 'EMP-1001', unit: 'سالن ماشین‌کاری ۱', profileId: 'prof-demo-1', role: 'employee', username: 'emp_demo', supervisorId: 'emp-demo-1' },
      { id: 'emp-demo-3', name: 'مهندس سارا عباسی', code: 'EMP-1002', unit: 'واحد کنترل کیفیت QC', profileId: 'prof-demo-3', role: 'employee', username: 'sara_abbasi', supervisorId: 'emp-demo-1' },
      { id: 'emp-demo-4', name: 'کارمند تستی', code: 'EMP-1003', unit: 'سالن ماشین‌کاری ۱', profileId: 'prof-demo-1', role: 'employee', username: 'emp_test', supervisorId: 'emp-demo-1' },
      { id: 'emp-demo-5', name: 'مهندس نیلوفر شفیعی', code: 'EMP-1004', unit: 'واحد کنترل کیفیت QC', profileId: 'prof-demo-3', role: 'employee', username: 'shafiei', supervisorId: 'emp-demo-1' }
    ];

    onSetCriteria(demoCriteria);
    onSetProfiles(demoProfiles);
    onSetEmployees(demoEmployees);

    addLog('بارگذاری دیتای استاندارد صنعتی', 'بسته داده‌های غنی کارخانه‌ای (شاخص‌ها، پروفایل‌ها و پرسنل) با موفقیت در سامانه بارگذاری شد.', 'success');
    setImportFeedback({
      success: true,
      title: 'بسته داده‌های نمونه کارخانه با موفقیت بارگذاری شد',
      message: 'تعداد ۶ شاخص شایستگی پیشرفته، ۳ پروفایل استاندارد و ۵ پرسنل خطوط تولید با موفقیت در دیتابیس ثبت شدند.'
    });
  };

  // 7. GENERATE HIGH-LOAD BENCHMARK RECORDS (>500 RECORDS)
  const handleGenerateScaleBenchmark = (count: number) => {
    if (!window.confirm(`آیا تمایل به تولید ${count} پرونده پرسنلی برای سنجش سرعت، جدول مجازی‌سازی و پایداری سامانه دارید؟`)) {
      return;
    }

    const firstProfId = profiles[0]?.id || 'prof-1';
    const benchmarkEmps: Employee[] = [];
    const units = ['سالن ماشین‌کاری ۱', 'سالن ماشین‌کاری ۲', 'سالن مونتاژ و بسته‌بندی', 'واحد کنترل کیفیت', 'تعمیرات و نگهداری PM', 'مهندسی فرآیند'];
    const firstNames = ['علی', 'محمد', 'رضا', 'حسین', 'امیر', 'مهدی', 'علیرضا', 'فرشید', 'کامران', 'پوریا', 'زهرا', 'مریم', 'فاطمه', 'سارا', 'نرگس'];
    const lastNames = ['رضایی', 'کریمی', 'حسینی', 'احمدی', 'محمدی', 'قاسمی', 'صباغی', 'نجفی', 'موسوی', 'اکبری', 'تقوی', 'مرادی', 'شریفی'];

    for (let i = 1; i <= count; i++) {
      const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
      const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
      const unit = units[Math.floor(Math.random() * units.length)];
      const empNum = (2000 + i).toString();
      benchmarkEmps.push({
        id: `bench-${Date.now()}-${i}`,
        name: `${fn} ${ln}`,
        code: `BENCH-${empNum}`,
        unit,
        profileId: profiles[i % profiles.length]?.id || firstProfId,
        role: i % 15 === 0 ? 'supervisor' : 'employee',
        username: `bench_${empNum}`
      });
    }

    onSetEmployees([...employees, ...benchmarkEmps]);
    addLog('تولید داده‌های کلان بنچمارک', `تعداد ${count} پرسنل برای سنجش توان پردازش کلان سامانه اضافه شدند.`, 'warning');
    setImportFeedback({
      success: true,
      title: 'داده‌های کلان بنچمارک با موفقیت تزریق شدند',
      message: `تعداد ${count} رکورد به لیست پرسنل اضافه شد. اکنون می‌توانید کارایی جداول مجازی‌سازی و خروجی‌های اکسل را پایش فرمایید.`
    });
  };

  return (
    <div className="space-y-7 text-right" dir="rtl">
      
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm shadow-slate-950/[0.04] flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center text-rose-700 dark:text-rose-300 font-black">
              <ShieldCheck className="w-6 h-6 text-white stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex flex-wrap items-center gap-2">
                مرکز مدیریت و امنیت ارشد سامانه (SuperAdmin Console)
                <span className="text-[10px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/20 px-2.5 py-0.5 rounded-full">
                  سطح دسترسی تام
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                کنترل کامل کلمات عبور پرسنل، بازیابی اضطراری کلید طلایی، ماتریس دسترسی‌های سازمانی (RBAC) و پشتیبان‌گیری
              </p>
            </div>
          </div>
        </div>

        {/* Security Health Quick Meter */}
          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black text-xs">
            ۹۸٪
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400 block">امتیاز سلامت امنیت سیستم</span>
            <span className="text-xs font-black text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> وضعیت عالی و رمزنگاری‌شده
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs Switcher */}
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveSectionTab('security')}
          className={`py-2.5 px-4 rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeSectionTab === 'security'
              ? 'bg-rose-500 text-slate-50 shadow-lg shadow-rose-500/20'
              : 'bg-slate-900/50 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <LockKeyhole className="w-4 h-4" />
          <span>مدیریت کلمه عبور و امنیت کاربران</span>
          <span className="text-[10px] bg-black/20 px-2 py-0.5 rounded-full">{employees.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSectionTab('rbac')}
          className={`py-2.5 px-4 rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeSectionTab === 'rbac'
              ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20'
              : 'bg-slate-900/50 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <FolderLock className="w-4 h-4" />
          <span>دسترسی‌ها و ماتریس سازمانی (RBAC)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSectionTab('backup')}
          className={`py-2.5 px-4 rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeSectionTab === 'backup'
              ? 'bg-indigo-500 text-slate-50 shadow-lg shadow-indigo-500/20'
              : 'bg-slate-900/50 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>پشتیبان‌گیری، خروجی اکسل و داده‌ها</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSectionTab('history')}
          className={`py-2.5 px-4 rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeSectionTab === 'history'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
              : 'bg-slate-900/50 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>تاریخچه عملکرد و آرشیو دوره‌ها</span>
          <span className="text-[10px] bg-black/20 px-2 py-0.5 rounded-full font-mono">{effectiveArchived.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSectionTab('logs')}
          className={`py-2.5 px-4 rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeSectionTab === 'logs'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'bg-slate-900/50 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>گزارش لاگ‌ها و رویدادهای امنیتی</span>
          <span className="text-[10px] bg-black/20 px-2 py-0.5 rounded-full">{logs.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSectionTab('all')}
          className={`py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ml-auto ${
            activeSectionTab === 'all'
              ? 'bg-slate-700 text-slate-100'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>نمایش یکپارچه همه بخش‌ها</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: USER PASSWORDS, ADMIN SECURITY & MASTER BREAK-GLASS PROTOCOL  */}
      {/* ========================================================================= */}
      {(activeSectionTab === 'security' || activeSectionTab === 'all') && (
        <div className="space-y-6">
          
          {/* Top Security Grid: 1. Admin Password | 2. Master Break-Glass Recovery */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* 1. ADMIN PASSWORD MANAGEMENT CARD */}
            <div className="lg:col-span-6 bg-slate-800/40 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                    <Key className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-200">تغییر کلمه عبور مدیر سیستم (Admin)</h2>
                    <p className="text-[10px] text-slate-400">تنظیم رمز اختصاصی ورود به پرتال مدیریت ارشد</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/20">
                  <ShieldCheck className="w-3 h-3" />
                  <span>تأیید هویت الزامی</span>
                </div>
              </div>

              {passwordFeedback && (
                <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  passwordFeedback.type === 'success' 
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' 
                    : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                }`}>
                  {passwordFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{passwordFeedback.message}</span>
                </div>
              )}

              <form onSubmit={handleChangeAdminPassword} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">کلمه عبور فعلی مدیریت</label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      required
                      placeholder="کلمه عبور فعلی..."
                      value={currentAdminPasswordInput}
                      onChange={(e) => setCurrentAdminPasswordInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 pl-10 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="text-slate-500 hover:text-slate-300 absolute left-3 top-1/2 -translate-y-1/2 p-1 cursor-pointer"
                    >
                      {showCurrentPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">کلمه عبور جدید</label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        required
                        placeholder="کلمه عبور جدید..."
                        value={newAdminPasswordInput}
                        onChange={(e) => setNewAdminPasswordInput(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 pl-10 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="text-slate-500 hover:text-slate-300 absolute left-3 top-1/2 -translate-y-1/2 p-1 cursor-pointer"
                      >
                        {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">تکرار کلمه عبور جدید</label>
                    <input
                      type={showNewPassword ? "text" : "password"}
                      required
                      placeholder="تکرار کلمه عبور جدید..."
                      value={confirmAdminPasswordInput}
                      onChange={(e) => setConfirmAdminPasswordInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>حداقل ۸ کاراکتر</span>
                  </div>
                  <button
                    type="submit"
                    className="bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md shadow-rose-600/20 cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>بروزرسانی کلمه عبور مدیریت</span>
                  </button>
                </div>
              </form>
            </div>

            {/* 2. SECURITY HARDENING, AUDIT & ACCESS POLICY STATUS CARD */}
            <div className="lg:col-span-6 bg-slate-900 border border-emerald-500/30 rounded-3xl p-5 space-y-4 shadow-lg flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-emerald-300">وضعیت ایمنی و ممیزی دسترسی مدیریت</h2>
                      <p className="text-[10px] text-slate-400">حفاظت چندلایه‌ای از حساب‌ها و نشست‌های ادمین</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    فعال و ایمن‌سازی شده
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  تمامی تدابیر امنیتی جهت ممانعت از نفوذ غیرمجاز به پرتال مدیریت فعال گردیده‌اند:
                </p>

                {/* Security Metrics and Audit Features */}
                <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                    <span className="text-slate-400 text-[11px] flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-emerald-400" />
                      وضعیت احراز هویت مدیریت:
                    </span>
                    <span className="text-emerald-400 font-bold text-[11px]">منحصراً با کلمه عبور معتبر</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                    <span className="text-slate-400 text-[11px] flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-400" />
                      سیستم ضد نفوذ Brute-Force:
                    </span>
                    <span className="text-indigo-300 font-bold text-[11px]">قفل خودکار ۶۰ ثانیه‌ای پس از ۵ تلاش ناموفق</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400 text-[11px] flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-teal-400" />
                      ثبت لاگ ممیزی رخدادها (Audit Trail):
                    </span>
                    <span className="text-teal-300 font-bold text-[11px] font-mono">{logs.length} رویداد ثبت‌شده</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-emerald-400/90 pt-1">
                <span>کلیدهای دسترسی منحصراً در اختیار مدیریت مجاز سازمان قرار دارد.</span>
              </div>
            </div>

          </div>

          {/* ========================================================================= */}
          {/* USER PASSWORDS & CREDENTIALS DIRECTORY (RESET/CHANGE FOR ALL EMPLOYEES)   */}
          {/* ========================================================================= */}
          <div className="bg-slate-800/40 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl">
            
            {/* Header and Quick Stats */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <LockKeyhole className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-black text-slate-100">مدیریت کلمه عبور و امنیت دسترسی تک‌تک پرسنل</h2>
                    <span className="text-[10px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/20 px-2.5 py-0.5 rounded-full">
                      تغییر و بازنشانی رمز همه افراد
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    تعریف یا تولید رمز امن، قفل حساب و بازنشانی به کد پرسنلی؛ مقدار رمز در فایل پشتیبان ذخیره نمی‌شود
                  </p>
                </div>
              </div>

              {/* Mass Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleBulkResetAllPasswords}
                  className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold py-2 px-3.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                  <span>بازنشانی رمز همه به پیش‌فرض</span>
                </button>
                {lockedUsers.length > 0 && (
                  <button
                    type="button"
                    onClick={handleBulkUnlockAll}
                    className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold py-2 px-3.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>رفع مسدودی همه حساب‌ها ({lockedUsers.length})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Feedback Message */}
            {credentialsFeedback && (
              <div className={`p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in ${
                credentialsFeedback.type === 'success' 
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' 
                  : credentialsFeedback.type === 'warning'
                    ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
                    : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
              }`}>
                {credentialsFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : credentialsFeedback.type === 'warning' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{credentialsFeedback.message}</span>
              </div>
            )}

            {/* Search and Filters Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
              <div className="sm:col-span-5 relative">
                <input
                  type="text"
                  placeholder="جستجو بر اساس نام همکار، کد پرسنلی، نام کاربری یا واحد..."
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pr-9 pl-4 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
                />
                <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>

              <div className="sm:col-span-3">
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-xs text-slate-200 focus:outline-none focus:border-rose-500 cursor-pointer"
                >
                  <option value="all">تمام نقش‌های سازمانی</option>
                  <option value="admin">مدیران سیستم (Admin)</option>
                  <option value="supervisor">سرپرستان خط (Supervisor)</option>
                  <option value="employee">اپراتورهای کارگاه (Employee)</option>
                </select>
              </div>

              <div className="sm:col-span-4">
                <select
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-xs text-slate-200 focus:outline-none focus:border-rose-500 cursor-pointer"
                >
                  <option value="all">تمام وضعیت‌های کلمه عبور</option>
                  <option value="custom_pass">دارای کلمه عبور اختصاصی</option>
                  <option value="default_pass">دارای کلمه عبور پیش‌فرض</option>
                  <option value="locked">حساب‌های مسدودشده</option>
                </select>
              </div>
            </div>

            {/* Inline Password Edit Form when an Employee is Selected */}
            {editingPasswordEmp && (
              <div className="bg-rose-500/5 border-2 border-rose-500/30 rounded-2xl p-4 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-rose-400" />
                    <span className="text-xs font-black text-slate-100">
                      تعیین کلمه عبور جدید برای «{editingPasswordEmp.name}» (نام کاربری: {editingPasswordEmp.username})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClosePasswordEditor}
                    className="text-xs text-slate-400 hover:text-slate-200"
                  >
                    <X className="h-4 w-4" aria-hidden="true" /> انصراف
                  </button>
                </div>

                <form onSubmit={handleSaveCustomPassword} className="flex flex-col sm:flex-row items-center gap-3">
                  <div className="relative flex-1 w-full">
                    <input
                      type={showCustomPassInput ? "text" : "password"}
                      required
                      placeholder="کلمه عبور جدید همکار را وارد کنید..."
                      value={customPasswordInput}
                      onChange={(e) => setCustomPasswordInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 pl-10 text-xs text-slate-100 font-mono focus:outline-none focus:border-rose-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCustomPassInput(!showCustomPassInput)}
                      className="text-slate-500 hover:text-slate-300 absolute left-3 top-1/2 -translate-y-1/2 p-1 cursor-pointer"
                    >
                      {showCustomPassInput ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="w-full sm:w-auto bg-rose-500 hover:bg-rose-600 text-slate-50 font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-rose-500/20 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>ثبت و فعال‌سازی کلمه عبور</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleGenerateRandomPassword(editingPasswordEmp)}
                    className="w-full sm:w-auto bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold px-3 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    title="تولید خودکار رمز امن"
                  >
                    <Dices className="w-4 h-4 text-amber-400" />
                    <span>تولید رمز تصادفی</span>
                  </button>
                  {customPasswordInput && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(customPasswordInput);
                          handleClosePasswordEditor();
                          setCredentialsFeedback({ type: 'success', message: 'کلمه عبور در کلیپ‌بورد کپی شد.' });
                        } catch {
                          setCredentialsFeedback({ type: 'error', message: 'کپی خودکار ممکن نبود؛ مقدار را به‌صورت دستی کپی کنید.' });
                        }
                      }}
                      className="w-full sm:w-auto bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 font-bold px-3 py-2 rounded-xl text-xs"
                    >
                      کپی
                    </button>
                  )}
                </form>
              </div>
            )}

            {/* Employees Credential Table */}
            <div className="overflow-x-auto">
              <UiTable className="text-right text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="pb-3 pr-3">نام و مشخصات همکار</th>
                    <th className="pb-3 text-center">کد پرسنلی</th>
                    <th className="pb-3 text-center">نام کاربری</th>
                    <th className="pb-3 text-center">نقش</th>
                    <th className="pb-3 text-center">وضعیت کلمه عبور</th>
                    <th className="pb-3 text-center">وضعیت حساب</th>
                    <th className="pb-3 text-center">عملیات مدیریت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 text-slate-300">
                  {filteredEmployees.map(emp => {
                    const customPass = customCredentialUsers.has(emp.username.toLowerCase());
                    const isLocked = lockedUsers.includes(emp.id) || lockedUsers.includes(emp.username.toLowerCase());

                    return (
                      <tr key={emp.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 pr-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black ${
                              emp.role === 'admin' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                              emp.role === 'supervisor' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                              'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                            }`}>
                              {emp.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-slate-100">{emp.name}</p>
                              <p className="text-[10px] text-slate-500">{emp.unit}</p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 text-center font-mono font-bold text-teal-400">
                          {emp.code}
                        </td>

                        <td className="py-3.5 text-center font-mono text-slate-300 font-bold">
                          {emp.username}
                        </td>

                        <td className="py-3.5 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            emp.role === 'admin' ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20' :
                            emp.role === 'supervisor' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' :
                            'bg-teal-500/10 text-teal-300 border border-teal-500/20'
                          }`}>
                            {emp.role === 'admin' ? 'مدیر سیستم' : emp.role === 'supervisor' ? 'سرپرست خط' : 'اپراتور کارگاه'}
                          </span>
                        </td>

                        <td className="py-3.5 text-center">
                          {customPass ? (
                            <div className="inline-flex items-center gap-1 bg-rose-500/10 text-rose-300 border border-rose-500/20 px-2 py-0.5 rounded-lg font-mono text-[11px] font-bold">
                              <span>•••••••• (تنظیم‌شده)</span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-500 bg-slate-900/80 px-2 py-0.5 rounded-lg border border-slate-800">
                              کد پرسنلی (اولیه)
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 text-center">
                          {isLocked ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/30">
                              <Lock className="w-3 h-3" /> مسدودشده
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" /> فعال
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Edit Password Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenEditPassword(emp)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                              title="تغییر کلمه عبور این کاربر"
                            >
                              <Key className="w-3.5 h-3.5 text-rose-400" />
                            </button>

                            {/* Random Password Generator Button */}
                            <button
                              type="button"
                              onClick={() => handleGenerateRandomPassword(emp)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 transition-all cursor-pointer"
                              title="تولید رمز تصادفی و اختصاص به این کاربر"
                            >
                              <Dices className="w-3.5 h-3.5 text-amber-400" />
                            </button>

                            {/* Reset to Default Button */}
                            {customPass && (
                              <button
                                type="button"
                                onClick={() => handleResetUserPasswordToDefault(emp.username)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-teal-300 transition-all cursor-pointer"
                                title="بازنشانی به کد پرسنلی"
                              >
                                <RotateCcw className="w-3.5 h-3.5 text-teal-400" />
                              </button>
                            )}

                            {/* Lock / Unlock Toggle Button */}
                            <button
                              type="button"
                              onClick={() => handleToggleLockUser(emp)}
                              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                isLocked 
                                  ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30' 
                                  : 'bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300'
                              }`}
                              title={isLocked ? "رفع مسدودی حساب کاربری" : "مسدودسازی موقت حساب کاربری"}
                            >
                              {isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                            </button>

                            {/* Delete User Button - Only non-admin */}
                            {emp.role === 'admin' || emp.username === 'admin' || emp.code === 'ADMIN-001' ? (
                              <div
                                className="p-1.5 rounded-lg bg-slate-800/40 text-slate-500 opacity-50 cursor-not-allowed flex items-center justify-center"
                                title="حساب مدیر ارشد سیستم غیرقابل حذف است"
                              >
                                <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setUserToDelete(emp)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-all cursor-pointer"
                                title="حذف حساب و پرونده پرسنلی"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </UiTable>

              {filteredEmployees.length === 0 && (
                <div className="text-center py-8 text-slate-500 text-xs">
                  هیچ همکاری با فیلترهای مشخص‌شده یافت نشد.
                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {/* User Delete Confirmation Modal for Management Center */}
      
      {/* Bulk Delete Emps Confirmation Modal */}
      {isBulkDeleteEmpModalOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-right" dir="rtl">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-100">حذف گروهی پرسنل ({selectedEmpIds.size} نفر)</h3>
                <p className="text-[11px] text-slate-400">اطلاعات این پرسنل از سیستم حذف خواهد شد.</p>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setIsBulkDeleteEmpModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition-all cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDeleteEmps}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all cursor-pointer shadow-lg shadow-rose-600/20 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تایید و حذف گروهی</span>
              </button>
            </div>
          </div>
        </div>
      )}
{userToDelete && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-right">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-100">حذف دائم حساب کاربری و پرونده</h3>
                <p className="text-[11px] text-slate-400">اطلاعات از سامانه و دیتابیس پاکسازی می‌شوند</p>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>نام همکار:</span>
                <span className="font-bold text-slate-100">{userToDelete.name}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>نام کاربری:</span>
                <span className="font-mono text-teal-400">{userToDelete.username}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>واحد سازمانی:</span>
                <span className="text-slate-300">{userToDelete.unit}</span>
              </div>
            </div>

            <p className="text-xs text-rose-300/90 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl leading-relaxed">
              تمامی سوابق ارزیابی، نمرات دوره‌ها و دسترسی‌های این کاربر از سامانه حذف خواهند شد.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition-all cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await updateCloudCredential({ username: userToDelete.username }, 'DELETE');
                  } catch (error) {
                    setCredentialsFeedback({ type: 'error', message: error instanceof Error ? error.message : 'حذف اطلاعات ورود ناموفق بود.' });
                    return;
                  }
                  const newEmps = employees.filter(e => e.id !== userToDelete.id);
                  const newEvals = evaluations.filter(ev => ev.empId !== userToDelete.id);
                  onSetEmployees(newEmps);
                  onSetEvaluations(newEvals);

                  setUserToDelete(null);
                }}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all cursor-pointer shadow-lg shadow-rose-600/20 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تایید و حذف حساب</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: RBAC MATRIX & INDIVIDUAL USER PERMISSION OVERRIDES             */}
      {/* ========================================================================= */}
      {(activeSectionTab === 'rbac' || activeSectionTab === 'all') && (
        <div className="space-y-6">
          <GranularPermissionEditor employees={employees} />
          
          {/* 1. INDIVIDUAL USER ACCESS & PERMISSION OVERRIDES */}
          <div className="bg-slate-800/40 border border-teal-500/30 rounded-3xl p-6 space-y-6 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                  <UserCog className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-black text-slate-100">مدیریت تخصیص دسترسی‌های اختصاصی و موردی همکاران</h2>
                    <span className="text-[10px] font-bold bg-teal-500/10 text-teal-300 border border-teal-500/20 px-2.5 py-0.5 rounded-full">
                      انتخاب فردی پرسنل
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    انتخاب هر یک از همکاران کارگاه، تعیین نقش کاربری و اعطای مستقیم یا محدودسازی مجوزهای دسترسی به بخش‌های سیستم
                  </p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleGrantAllIndividual}
                  className="bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold py-2 px-3.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>اعطای دسترسی کامل</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetIndividualToRole}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2 px-3.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                  <span>بازنشانی به پیش‌فرض نقش</span>
                </button>
              </div>
            </div>

            {/* Feedback Banner */}
            {individualSaveFeedback && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{individualSaveFeedback}</span>
              </div>
            )}

            {/* Employee Selection & Details Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300 flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-teal-400" />
                  انتخاب همکار جهت تنظیم دسترسی:
                </label>
                <select
                  value={selectedIndividualId}
                  onChange={(e) => setSelectedIndividualId(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border bg-slate-950 border-slate-700 text-slate-100 font-bold focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} — {emp.code} ({emp.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">نقش پایه کاربری:</label>
                <select
                  value={individualRoleDraft}
                  onChange={(e) => setIndividualRoleDraft(e.target.value as UserRole)}
                  className="w-full text-xs p-2.5 rounded-xl border bg-slate-950 border-slate-700 text-teal-300 font-bold focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
                >
                  <option value="admin">مدیر سیستم (Admin - دسترسی تام ارشد)</option>
                  <option value="supervisor">سرپرست خط (Supervisor - ارزیابی و مربیگری)</option>
                  <option value="employee">اپراتور کارگاه (Employee - خودارزیابی و کارنامه)</option>
                </select>
              </div>

              <div className="flex flex-col justify-end space-y-1.5">
                <button
                  type="button"
                  onClick={handleSaveIndividualPermissions}
                  className="w-full bg-teal-500 hover:bg-teal-600 text-slate-950 font-black py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-teal-500/20 cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>ذخیره و اعمال دسترسی‌های این همکار</span>
                </button>
              </div>
            </div>

            {/* Granular Permission Toggles Matrix for this Individual */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-slate-300 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-teal-400" />
                ماتریس مجوزهای فعال برای «{selectedIndividual?.name}»:
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {/* Perm 1 */}
                <label className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                  individualPermDraft.canEditCriteria ? 'bg-teal-500/10 border-teal-500/40 text-slate-200' : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}>
                  <input type="checkbox" checked={individualPermDraft.canEditCriteria} onChange={() => handleToggleIndividualPerm('canEditCriteria')} className="mt-0.5 w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer shrink-0" />
                  <div>
                    <span className="font-bold block text-slate-200">تعریف و تغییر معیارهای کیفی</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">افزودن و ویرایش سنجه‌های بازرسی و کدهای SOP</span>
                  </div>
                </label>

                {/* Perm 2 */}
                <label className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                  individualPermDraft.canEditProfiles ? 'bg-teal-500/10 border-teal-500/40 text-slate-200' : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}>
                  <input type="checkbox" checked={individualPermDraft.canEditProfiles} onChange={() => handleToggleIndividualPerm('canEditProfiles')} className="mt-0.5 w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer shrink-0" />
                  <div>
                    <span className="font-bold block text-slate-200">مدیریت پروفایل‌های شغلی</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">تنظیم اوزان و ضرایب اهمیت ایستگاه‌ها</span>
                  </div>
                </label>

                {/* Perm 3 */}
                <label className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                  individualPermDraft.canEditEmployees ? 'bg-teal-500/10 border-teal-500/40 text-slate-200' : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}>
                  <input type="checkbox" checked={individualPermDraft.canEditEmployees} onChange={() => handleToggleIndividualPerm('canEditEmployees')} className="mt-0.5 w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer shrink-0" />
                  <div>
                    <span className="font-bold block text-slate-200">ثبت و ویرایش اطلاعات پرسنل</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">افزودن همکار جدید، تغییر شغل، انتساب ایستگاه</span>
                  </div>
                </label>

                {/* Perm 4 */}
                <label className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                  individualPermDraft.canStartEvaluations ? 'bg-teal-500/10 border-teal-500/40 text-slate-200' : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}>
                  <input type="checkbox" checked={individualPermDraft.canStartEvaluations} onChange={() => handleToggleIndividualPerm('canStartEvaluations')} className="mt-0.5 w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer shrink-0" />
                  <div>
                    <span className="font-bold block text-slate-200">ثبت دوره‌های ارزیابی عملکرد</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">آغاز ارزیابی جدید، امتیازدهی معیارها</span>
                  </div>
                </label>

                {/* Perm 5 */}
                <label className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                  individualPermDraft.canLockScores ? 'bg-teal-500/10 border-teal-500/40 text-slate-200' : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}>
                  <input type="checkbox" checked={individualPermDraft.canLockScores} onChange={() => handleToggleIndividualPerm('canLockScores')} className="mt-0.5 w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer shrink-0" />
                  <div>
                    <span className="font-bold block text-slate-200">تایید، قفل نمرات و کالیبراسیون</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">نهایی‌سازی امتیازات و کالیبراسیون زنگوله‌ای</span>
                  </div>
                </label>

                {/* Perm 6 */}
                <label className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                  individualPermDraft.canDefineTargets ? 'bg-teal-500/10 border-teal-500/40 text-slate-200' : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}>
                  <input type="checkbox" checked={individualPermDraft.canDefineTargets} onChange={() => handleToggleIndividualPerm('canDefineTargets')} className="mt-0.5 w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer shrink-0" />
                  <div>
                    <span className="font-bold block text-slate-200">ثبت اهداف مربیگری و KPIs</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">تعریف تارگت‌های عملیاتی و یادداشت‌های توسعه‌ای</span>
                  </div>
                </label>

                {/* Perm 7 */}
                <label className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                  individualPermDraft.canViewReports ? 'bg-teal-500/10 border-teal-500/40 text-slate-200' : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}>
                  <input type="checkbox" checked={individualPermDraft.canViewReports} onChange={() => handleToggleIndividualPerm('canViewReports')} className="mt-0.5 w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer shrink-0" />
                  <div>
                    <span className="font-bold block text-slate-200">مشاهده تحلیل‌ها و گزارشات کلان</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">ماتریس ۹-Box، مقایسه واحدهای تولیدی و اکسل</span>
                  </div>
                </label>

                {/* Perm 8 */}
                <label className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                  individualPermDraft.canRestoreBackup ? 'bg-teal-500/10 border-teal-500/40 text-slate-200' : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}>
                  <input type="checkbox" checked={individualPermDraft.canRestoreBackup} onChange={() => handleToggleIndividualPerm('canRestoreBackup')} className="mt-0.5 w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer shrink-0" />
                  <div>
                    <span className="font-bold block text-slate-200">پشتیبان‌گیری و بازیابی دیتابیس</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">خروجی JSON، ایمپورت اکسل و بازنشانی اطلاعات</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* 2. RBAC PERMISSIONS MATRIX */}
          <div className="bg-slate-800/30 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-lg">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <FolderLock className="w-5 h-5 text-teal-400" />
              <div>
                <h2 className="text-sm font-bold text-slate-200">ماتریس پیشرفته دسترسی‌های سازمانی (RBAC)</h2>
                <p className="text-[10px] text-slate-400">بروزرسانی زنده و پیکربندی حقوق و عملکرد سیستم بر اساس نقش کاربری همکاران</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <UiTable className="text-right text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="pb-3 pr-2">عنوان مجوز سیستم</th>
                    <th className="pb-3 text-center">مدیر سیستم (Admin)</th>
                    <th className="pb-3 text-center">سرپرست خط (Supervisor)</th>
                    <th className="pb-3 text-center">اپراتور کارگاه (Employee)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 text-slate-300">
                  <tr>
                    <td className="py-3 pr-2">
                      <p className="font-bold">تعریف و تغییر معیارهای کیفی کارخانه</p>
                      <p className="text-[9px] text-slate-500">ایجاد سنجه‌های بازرسی، ویرایش کدهای SOP</p>
                    </td>
                    <td className="py-3 text-center">
                      <input type="checkbox" checked={permissions.find(p => p.role === 'admin')?.canEditCriteria} onChange={() => handleTogglePermission('admin', 'canEditCriteria')} className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer" />
                    </td>
                    <td className="py-3 text-center">
                      <input type="checkbox" checked={permissions.find(p => p.role === 'supervisor')?.canEditCriteria} onChange={() => handleTogglePermission('supervisor', 'canEditCriteria')} className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer" />
                    </td>
                    <td className="py-3 text-center">
                      <input type="checkbox" checked={permissions.find(p => p.role === 'employee')?.canEditCriteria} onChange={() => handleTogglePermission('employee', 'canEditCriteria')} className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer" />
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 pr-2">
                      <p className="font-bold">مدیریت و قفل پروفایل‌های شغلی</p>
                      <p className="text-[9px] text-slate-500">تنظیم وزن و ضرایب اهمیت شایستگی هر ایستگاه</p>
                    </td>
                    <td className="py-3 text-center">
                      <input type="checkbox" checked={permissions.find(p => p.role === 'admin')?.canEditProfiles} onChange={() => handleTogglePermission('admin', 'canEditProfiles')} className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer" />
                    </td>
                    <td className="py-3 text-center">
                      <input type="checkbox" checked={permissions.find(p => p.role === 'supervisor')?.canEditProfiles} onChange={() => handleTogglePermission('supervisor', 'canEditProfiles')} className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer" />
                    </td>
                    <td className="py-3 text-center">
                      <input type="checkbox" checked={permissions.find(p => p.role === 'employee')?.canEditProfiles} onChange={() => handleTogglePermission('employee', 'canEditProfiles')} className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer" />
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 pr-2">
                      <p className="font-bold">تعریف و ویرایش اطلاعات پرسنل</p>
                      <p className="text-[9px] text-slate-500">ثبت همکار جدید، تغییر شغل، انتساب ایستگاه</p>
                    </td>
                    <td className="py-3 text-center">
                      <input type="checkbox" checked={permissions.find(p => p.role === 'admin')?.canEditEmployees} onChange={() => handleTogglePermission('admin', 'canEditEmployees')} className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer" />
                    </td>
                    <td className="py-3 text-center">
                      <input type="checkbox" checked={permissions.find(p => p.role === 'supervisor')?.canEditEmployees} onChange={() => handleTogglePermission('supervisor', 'canEditEmployees')} className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer" />
                    </td>
                    <td className="py-3 text-center">
                      <input type="checkbox" checked={permissions.find(p => p.role === 'employee')?.canEditEmployees} onChange={() => handleTogglePermission('employee', 'canEditEmployees')} className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer" />
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 pr-2">
                      <p className="font-bold">شروع و ثبت دوره‌های ارزیابی عملکرد</p>
                      <p className="text-[9px] text-slate-500">آغاز ارزیابی جدید، امتیازدهی معیارها</p>
                    </td>
                    <td className="py-3 text-center">
                      <input type="checkbox" checked={permissions.find(p => p.role === 'admin')?.canStartEvaluations} onChange={() => handleTogglePermission('admin', 'canStartEvaluations')} className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer" />
                    </td>
                    <td className="py-3 text-center">
                      <input type="checkbox" checked={permissions.find(p => p.role === 'supervisor')?.canStartEvaluations} onChange={() => handleTogglePermission('supervisor', 'canStartEvaluations')} className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer" />
                    </td>
                    <td className="py-3 text-center">
                      <input type="checkbox" checked={permissions.find(p => p.role === 'employee')?.canStartEvaluations} onChange={() => handleTogglePermission('employee', 'canStartEvaluations')} className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer" />
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 pr-2">
                      <p className="font-bold">قفل نهایی، کالیبراسیون و بایگانی</p>
                      <p className="text-[9px] text-slate-500">نهایی‌سازی نمرات، توزیع اجباری زنگوله‌ای</p>
                    </td>
                    <td className="py-3 text-center">
                      <input type="checkbox" checked={permissions.find(p => p.role === 'admin')?.canLockScores} onChange={() => handleTogglePermission('admin', 'canLockScores')} className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer" />
                    </td>
                    <td className="py-3 text-center">
                      <input type="checkbox" checked={permissions.find(p => p.role === 'supervisor')?.canLockScores} onChange={() => handleTogglePermission('supervisor', 'canLockScores')} className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer" />
                    </td>
                    <td className="py-3 text-center">
                      <input type="checkbox" checked={permissions.find(p => p.role === 'employee')?.canLockScores} onChange={() => handleTogglePermission('employee', 'canLockScores')} className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer" />
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 pr-2">
                      <p className="font-bold">ثبت اهداف مربیگری و پایش کارگاه</p>
                      <p className="text-[9px] text-slate-500">تعریف تارگت‌های KPIs و ثبت اهداف عملیاتی</p>
                    </td>
                    <td className="py-3 text-center">
                      <input type="checkbox" checked={permissions.find(p => p.role === 'admin')?.canDefineTargets} onChange={() => handleTogglePermission('admin', 'canDefineTargets')} className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer" />
                    </td>
                    <td className="py-3 text-center">
                      <input type="checkbox" checked={permissions.find(p => p.role === 'supervisor')?.canDefineTargets} onChange={() => handleTogglePermission('supervisor', 'canDefineTargets')} className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer" />
                    </td>
                    <td className="py-3 text-center">
                      <input type="checkbox" checked={permissions.find(p => p.role === 'employee')?.canDefineTargets} onChange={() => handleTogglePermission('employee', 'canDefineTargets')} className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer" />
                    </td>
                  </tr>
                </tbody>
              </UiTable>
            </div>
          </div>

          {/* 3. POLICY AND SECURITY SETTINGS FOR COMPREHENSIVE MANUAL */}
          <div className="bg-slate-800/40 border border-teal-500/30 rounded-3xl p-6 space-y-6 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-black text-slate-100">سیاست دسترسی و دانلود کتابچه راهنمای جامع (Manual Access & Download Policy)</h2>
                    <span className="text-[10px] font-bold bg-teal-500/10 text-teal-300 border border-teal-500/20 px-2.5 py-0.5 rounded-full">
                      امنیت و حریم اسناد سازمانی
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    تعیین دقیق اینکه چه کسانی (بر اساس نقش کاربری یا واحد سازمانی) مجاز به مشاهده کتابچه هستند و چه کسانی اجازه دانلود PDF و چاپ آن را دارند
                  </p>
                </div>
              </div>

              {/* Quick Policy Presets */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-400 font-bold">الگوهای آماده:</span>
                <button
                  type="button"
                  onClick={() => handleApplyManualPreset('all')}
                  className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold py-1.5 px-3 rounded-xl transition-all cursor-pointer"
                  title="همه افراد مجاز به مشاهده و دانلود هستند"
                >
                  عمومی (همه افراد)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyManualPreset('standard')}
                  className="bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-300 text-xs font-bold py-1.5 px-3 rounded-xl transition-all cursor-pointer"
                  title="پرسنل فقط مشاهده آنلاین، سرپرستان و ادمین مشاهده + دانلود"
                >
                  استاندارد سازمانی
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyManualPreset('supervisors')}
                  className="bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold py-1.5 px-3 rounded-xl transition-all cursor-pointer"
                  title="فقط سرپرستان و ادمین مجازند"
                >
                  فقط سرپرستان
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyManualPreset('admin_only')}
                  className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold py-1.5 px-3 rounded-xl transition-all cursor-pointer"
                  title="فقط ادمین سیستم مجاز است"
                >
                  محرمانه (فقط ادمین)
                </button>
              </div>
            </div>

            {/* Feedback notification */}
            {manualPolicyFeedback && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{manualPolicyFeedback}</span>
              </div>
            )}

            {/* Main Policy Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left/Middle Column: Roles Matrix & Watermark (7 Cols) */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* Roles Matrix Table */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl overflow-hidden p-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-teal-400" />
                      <h3 className="text-xs font-black text-slate-200">ماتریس تفکیکی سطوح دسترسی بر اساس نقش سازمانی</h3>
                    </div>
                    <span className="text-[10px] text-slate-400">تغییرات بلافاصله اعمال می‌شوند</span>
                  </div>

                  <UiTable className="text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="pb-2 font-bold pr-2">نقش سازمانی</th>
                        <th className="pb-2 font-bold text-center">مجوز مشاهده و مطالعه</th>
                        <th className="pb-2 font-bold text-center">مجوز دانلود PDF و چاپ</th>
                        <th className="pb-2 font-bold text-left pl-2">وضعیت دسترسی</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      
                      {/* Admin Row */}
                      <tr className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-3 pr-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-400" />
                            <div>
                              <span className="font-black text-slate-100">مدیر ارشد سیستم (Admin)</span>
                              <p className="text-[10px] text-slate-400">راهبر کل سامانه و حراست</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-center">
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
                            <Check className="w-3 h-3" />
                            <span>دائمی</span>
                          </div>
                        </td>
                        <td className="py-3 text-center">
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
                            <Check className="w-3 h-3" />
                            <span>دائمی</span>
                          </div>
                        </td>
                        <td className="py-3 text-left pl-2">
                          <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                            دسترسی کامل و نامحدود
                          </span>
                        </td>
                      </tr>

                      {/* Supervisor Row */}
                      <tr className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-3 pr-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-teal-400" />
                            <div>
                              <span className="font-black text-slate-100">سرپرستان خط و واحدها (Supervisor)</span>
                              <p className="text-[10px] text-slate-400">سرپرستان خطوط تولید و سرپرستان میانی</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-center">
                          <label className="inline-flex items-center justify-center p-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={manualPolicy.allowedRolesToView.includes('supervisor')}
                              onChange={() => handleToggleManualViewRole('supervisor')}
                              className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer"
                            />
                          </label>
                        </td>
                        <td className="py-3 text-center">
                          <label className="inline-flex items-center justify-center p-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={manualPolicy.allowedRolesToDownload.includes('supervisor')}
                              onChange={() => handleToggleManualDownloadRole('supervisor')}
                              className="w-4 h-4 text-amber-500 rounded border-slate-700 bg-slate-900 focus:ring-amber-500 cursor-pointer"
                            />
                          </label>
                        </td>
                        <td className="py-3 text-left pl-2">
                          {manualPolicy.allowedRolesToDownload.includes('supervisor') ? (
                            <span className="text-[10px] font-bold text-teal-300 bg-teal-500/15 px-2 py-0.5 rounded-full border border-teal-500/30">
                              مشاهده + دانلود PDF
                            </span>
                          ) : manualPolicy.allowedRolesToView.includes('supervisor') ? (
                            <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/30">
                              فقط مطالعه آنلاین
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-rose-300 bg-rose-500/15 px-2 py-0.5 rounded-full border border-rose-500/30">
                              مسدود شده
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* Employee Row */}
                      <tr className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-3 pr-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-indigo-400" />
                            <div>
                              <span className="font-black text-slate-100">کارمندان، اپراتورها و تکنسین‌ها (Employee)</span>
                              <p className="text-[10px] text-slate-400">پرسنل اجرایی و اپراتورهای ایستگاه‌های کاری</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-center">
                          <label className="inline-flex items-center justify-center p-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={manualPolicy.allowedRolesToView.includes('employee')}
                              onChange={() => handleToggleManualViewRole('employee')}
                              className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-900 focus:ring-teal-500 cursor-pointer"
                            />
                          </label>
                        </td>
                        <td className="py-3 text-center">
                          <label className="inline-flex items-center justify-center p-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={manualPolicy.allowedRolesToDownload.includes('employee')}
                              onChange={() => handleToggleManualDownloadRole('employee')}
                              className="w-4 h-4 text-amber-500 rounded border-slate-700 bg-slate-900 focus:ring-amber-500 cursor-pointer"
                            />
                          </label>
                        </td>
                        <td className="py-3 text-left pl-2">
                          {manualPolicy.allowedRolesToDownload.includes('employee') ? (
                            <span className="text-[10px] font-bold text-teal-300 bg-teal-500/15 px-2 py-0.5 rounded-full border border-teal-500/30">
                              مشاهده + دانلود PDF
                            </span>
                          ) : manualPolicy.allowedRolesToView.includes('employee') ? (
                            <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/30">
                              فقط مطالعه آنلاین
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-rose-300 bg-rose-500/15 px-2 py-0.5 rounded-full border border-rose-500/30">
                              مسدود شده
                            </span>
                          )}
                        </td>
                      </tr>

                    </tbody>
                  </UiTable>
                </div>

                {/* Organizational Unit Filtering */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-teal-400" />
                      <h4 className="text-xs font-black text-slate-200">محدودسازی به واحدهای سازمانی خاص (اختیاری)</h4>
                    </div>
                    {manualPolicy.allowedUnits.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearManualUnits}
                        className="text-[10px] text-teal-400 hover:text-teal-300 underline cursor-pointer"
                      >
                        آزادسازی برای تمامی واحدها
                      </button>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    اگر مایلید کتابچه فقط برای پرسنل شاغل در برخی واحدهای مشخص در دسترس باشد، واحدهای مجاز را تیک بزنید. در صورت خالی بودن، کتابچه به همه واحدهای سازمان تعلق دارد.
                  </p>

                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    {distinctUnits.map(unit => {
                      const isAllowed = manualPolicy.allowedUnits.includes(unit);
                      return (
                        <button
                          key={unit}
                          type="button"
                          onClick={() => handleToggleManualUnit(unit)}
                          className={`text-xs font-bold py-1.5 px-3 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 ${
                            isAllowed
                              ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 shadow-sm'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {isAllowed ? <Check className="w-3 h-3 text-teal-400" /> : <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />}
                          <span>{unit}</span>
                        </button>
                      );
                    })}
                  </div>
                  {manualPolicy.allowedUnits.length > 0 && (
                    <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>فقط همکاران شاغل در {manualPolicy.allowedUnits.length} واحد انتخاب‌شده مجاز به دسترسی خواهند بود.</span>
                    </div>
                  )}
                </div>

                {/* Smart Watermark Switch */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-teal-400" />
                      <span className="text-xs font-bold text-slate-200">واترمارک امنیتی هوشمند در نسخه چاپی PDF</span>
                      <span className="text-[10px] bg-teal-500/10 text-teal-400 px-2 py-0.5 rounded border border-teal-500/20">ردیابی اسناد</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      درج نام کاربر، کد پرسنلی و تاریخ استخراج در حاشیه اسناد خروجی جهت جلوگیری از نشر غیرمجاز اسناد کارخانه
                    </p>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={manualPolicy.showWatermark}
                      onChange={(e) => handleToggleManualWatermark(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                  </label>
                </div>

              </div>

              {/* Right Column: Live Permission Inspector & Simulator (5 Cols) */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-gradient-to-b from-slate-950 to-slate-900 border border-teal-500/30 rounded-2xl p-5 space-y-4 shadow-lg">
                  <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
                    <div className="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400">
                      <UserCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-100">شبیه‌ساز و استعلام زنده دسترسی پرسنل</h4>
                      <p className="text-[10px] text-slate-400">آزمایش دسترسی هر همکار طبق سیاست‌های تعیین‌شده</p>
                    </div>
                  </div>

                  {/* Employee Select */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-300">انتخاب همکار جهت استعلام:</label>
                    <select
                      value={manualSimulatorUserId}
                      onChange={(e) => setManualSimulatorUserId(e.target.value)}
                      className="w-full bg-slate-900 text-slate-200 border border-slate-700 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-teal-500 cursor-pointer"
                    >
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.code}) - {emp.unit} [{emp.role === 'admin' ? 'مدیر' : emp.role === 'supervisor' ? 'سرپرست' : 'اپراتور'}]
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Simulation Result Card */}
                  {simulatedEmployee && (
                    <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3.5">
                      
                      {/* User Info Bar */}
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                        <div>
                          <span className="text-xs font-black text-slate-100">{simulatedEmployee.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono mr-2">کد: {simulatedEmployee.code}</span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                          {simulatedEmployee.role === 'admin' ? 'مدیر ارشد' : simulatedEmployee.role === 'supervisor' ? 'سرپرست خط' : 'اپراتور کارگاه'}
                        </span>
                      </div>

                      {/* View Permission Status */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5 text-teal-400" />
                          <span>امکان مشاهده و باز کردن کتابچه:</span>
                        </span>
                        {simulatedCanView ? (
                          <span className="font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>مجاز به مطالعه</span>
                          </span>
                        ) : (
                          <span className="font-bold text-rose-400 flex items-center gap-1 bg-rose-500/10 px-2 py-0.5 rounded-lg border border-rose-500/20">
                            <Lock className="w-3 h-3" />
                            <span>دسترسی مسدود</span>
                          </span>
                        )}
                      </div>

                      {/* Download Permission Status */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Download className="w-3.5 h-3.5 text-amber-400" />
                          <span>امکان دانلود PDF و چاپ فایل:</span>
                        </span>
                        {simulatedCanDownload ? (
                          <span className="font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>دانلود و پرینت فعال</span>
                          </span>
                        ) : (
                          <span className="font-bold text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                            <Lock className="w-3 h-3" />
                            <span>دانلود قفل است</span>
                          </span>
                        )}
                      </div>

                      {/* Unit Filter Check */}
                      <div className="flex items-center justify-between text-[11px] border-t border-slate-800/80 pt-2 text-slate-400">
                        <span>واحد سازمانی ثبت‌شده:</span>
                        <span className="font-bold text-slate-300">{simulatedEmployee.unit}</span>
                      </div>

                      {/* Live Explanation Note */}
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                        {simulatedCanDownload ? (
                          <p className="inline-flex items-start gap-1.5 text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>این همکار دارای دسترسی دوگانه (مشاهده آنلاین و خروجی چاپی PDF) در سربرگ سامانه و منوی کناری است.</span>
                          </p>
                        ) : simulatedCanView ? (
                          <p className="text-amber-300">
                            این همکار مجاز به مطالعه کتابچه به صورت آنلاین در سامانه است، اما دکمه‌های پرینت و دریافت PDF برای او غیرفعال خواهد بود.
                          </p>
                        ) : (
                          <p className="text-rose-300">
                            کتابچه راهنما در منوی کاربری این همکار پنهان بوده و در صورت تلاش برای باز کردن، پیام امنیتی «دسترسی محدود» نمایش داده خواهد شد.
                          </p>
                        )}
                      </div>

                    </div>
                  )}

                  <div className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>سیاست‌ها بلافاصله در تمام بخش‌های سامانه و سشن‌های کاربری اعمال می‌گردند.</span>
                  </div>
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: ENTERPRISE DATA MANAGEMENT, BULK IMPORT/EXPORT & BACKUP HUB    */}
      {/* ========================================================================= */}
      {(activeSectionTab === 'backup' || activeSectionTab === 'all') && (
        <div className="space-y-6">

          {/* 1. TOP HEADER & METRIC SUMMARY CARDS */}
          <div className="bg-gradient-to-r from-slate-900 via-teal-950/40 to-slate-900 border border-teal-500/30 rounded-3xl p-6 shadow-xl">
            <div className="data-hub-header flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-black text-slate-100">مرکز جامع تبادل و انتقال کلان داده‌های سازمانی (Data Hub)</h2>
                    <span className="text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2.5 py-0.5 rounded-full font-mono">
                      v4.0 Enterprise
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    پشتیبان‌گیری کامل، ورود و خروجی گروهی اکسل (CSV با کدگذاری UTF-8 BOM) و مهاجرت داده‌های کلان پرسنل، شاخص‌ها و پروفایل‌ها
                  </p>
                </div>
              </div>

              {/* Top Quick Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleExportFullBackupJSON}
                  className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-black py-2.5 px-4 rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg shadow-teal-500/20 cursor-pointer shrink-0"
                >
                  <Download className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                  <span>دانلود پشتیبان کامل (JSON)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsExcelIntegrationOpen(true)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-2 transition-all border border-slate-700 cursor-pointer shrink-0"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span>اکسل سامانه کسری / MIS</span>
                </button>
              </div>
            </div>

            {/* LIVE ENTITY REGISTRY TILES */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6">
              {/* Tile 1: Employees */}
              <div className="bg-slate-950/60 border border-slate-800 hover:border-teal-500/40 rounded-2xl p-4 transition-all">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1.5 font-bold">
                    <Users className="w-3.5 h-3.5 text-indigo-400" />
                    پرسنل و همکاران
                  </span>
                  <span className="font-mono text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">Employees</span>
                </div>
                <div className="text-xl font-black text-slate-100 mt-2 font-mono">{employees.length}</div>
                <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-800/80">
                  <button
                    onClick={() => handleExportEntityCSV('employees')}
                    className="text-[11px] text-teal-400 hover:text-teal-300 font-bold flex items-center gap-1 cursor-pointer"
                    title="دانلود فایل اکسل CSV پرسنل"
                  >
                    <Download className="w-3 h-3" />
                    <span>CSV</span>
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    onClick={() => handleExportEntityJSON('employees')}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
                    title="دانلود فایل JSON پرسنل"
                  >
                    <FileJson className="w-3 h-3" />
                    <span>JSON</span>
                  </button>
                </div>
              </div>

              {/* Tile 2: Criteria */}
              <div className="bg-slate-950/60 border border-slate-800 hover:border-teal-500/40 rounded-2xl p-4 transition-all">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1.5 font-bold">
                    <Sliders className="w-3.5 h-3.5 text-teal-400" />
                    بانک شاخص‌ها
                  </span>
                  <span className="font-mono text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">Criteria</span>
                </div>
                <div className="text-xl font-black text-slate-100 mt-2 font-mono">{criteria.length}</div>
                <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-800/80">
                  <button
                    onClick={() => handleExportEntityCSV('criteria')}
                    className="text-[11px] text-teal-400 hover:text-teal-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>CSV</span>
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    onClick={() => handleExportEntityJSON('criteria')}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <FileJson className="w-3 h-3" />
                    <span>JSON</span>
                  </button>
                </div>
              </div>

              {/* Tile 3: Profiles */}
              <div className="bg-slate-950/60 border border-slate-800 hover:border-teal-500/40 rounded-2xl p-4 transition-all">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1.5 font-bold">
                    <Boxes className="w-3.5 h-3.5 text-amber-400" />
                    پروفایل‌های شغلی
                  </span>
                  <span className="font-mono text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">Profiles</span>
                </div>
                <div className="text-xl font-black text-slate-100 mt-2 font-mono">{profiles.length}</div>
                <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-800/80">
                  <button
                    onClick={() => handleExportEntityCSV('profiles')}
                    className="text-[11px] text-teal-400 hover:text-teal-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>CSV</span>
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    onClick={() => handleExportEntityJSON('profiles')}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <FileJson className="w-3 h-3" />
                    <span>JSON</span>
                  </button>
                </div>
              </div>

              {/* Tile 4: Evaluations */}
              <div className="bg-slate-950/60 border border-slate-800 hover:border-teal-500/40 rounded-2xl p-4 transition-all">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1.5 font-bold">
                    <Award className="w-3.5 h-3.5 text-rose-400" />
                    سوابق ارزیابی
                  </span>
                  <span className="font-mono text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">Evaluations</span>
                </div>
                <div className="text-xl font-black text-slate-100 mt-2 font-mono">{evaluations.length}</div>
                <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-800/80">
                  <button
                    onClick={() => handleExportEntityCSV('evaluations')}
                    className="text-[11px] text-teal-400 hover:text-teal-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>CSV</span>
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    onClick={() => handleExportEntityJSON('evaluations')}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <FileJson className="w-3 h-3" />
                    <span>JSON</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 2. SUB-NAVIGATION FOR DATA HUB */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
            <button
              type="button"
              onClick={() => setDataHubActiveView('hub')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                dataHubActiveView === 'hub'
                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>کنسول ورود و ایمپورت داده‌ها (Import Engine)</span>
            </button>

            <button
              type="button"
              onClick={() => setDataHubActiveView('export')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                dataHubActiveView === 'export'
                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>کنسول خروجی و فایل‌های الگو (Export & Templates)</span>
            </button>

            <button
              type="button"
              onClick={() => setDataHubActiveView('tools')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                dataHubActiveView === 'tools'
                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>داده‌های استاندارد کارخانه و تست مقیاس (Data Sandbox)</span>
            </button>

            <button
              type="button"
              onClick={() => setDataHubActiveView('calc')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                dataHubActiveView === 'calc'
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/20'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Gauge className="w-3.5 h-3.5 text-emerald-400" />
              <span>ورود آسان و محاسبات خودکار تولید و سایکل‌تایم</span>
            </button>
          </div>

          {/* 3. FEEDBACK NOTIFICATION BANNER */}
          {importFeedback && (
            <div className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-2 animate-in fade-in ${
              importFeedback.success 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-black text-sm">
                  {importFeedback.success ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> : <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />}
                  <span>{importFeedback.title}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setImportFeedback(null)}
                  className="text-slate-400 hover:text-slate-200 text-xs px-2 py-0.5 rounded cursor-pointer"
                >
                  بستن
                </button>
              </div>
              <p className="pr-7">{importFeedback.message}</p>

              {importFeedback.errors && importFeedback.errors.length > 0 && (
                <div className="mt-2 pr-7 pt-2 border-t border-rose-500/20 space-y-1">
                  <span className="font-bold block text-rose-400">لیست خطاهای یافت‌شده در ردیف‌ها:</span>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-300/90 font-mono">
                    {importFeedback.errors.slice(0, 10).map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                    {importFeedback.errors.length > 10 && (
                      <li>و {importFeedback.errors.length - 10} خطای دیگر...</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* VIEW A: UNIVERSAL IMPORT CONSOLE */}
          {(dataHubActiveView === 'hub' || dataHubActiveView === 'import') && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left/Main Column: Import Form */}
              <div className="lg:col-span-8 bg-slate-800/30 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-lg">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Upload className="w-5 h-5 text-teal-400" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-100">ورود و مهاجرت کلان اطلاعات به سامانه</h3>
                      <p className="text-[10px] text-slate-400">پشتیبانی از قالب‌های اکسل CSV (با هدرهای فارسی/انگلیسی) و فایل‌های JSON</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDownloadEntityTemplate(targetImportEntity)}
                    className="text-xs text-teal-400 hover:text-teal-300 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>دانلود الگوی نمونه CSV</span>
                  </button>
                </div>

                {/* Target Entity Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-300">موجودیت مقصد بارگذاری:</label>
                    <select
                      value={targetImportEntity}
                      onChange={(e) => setTargetImportEntity(e.target.value as DataEntityKey)}
                      className="w-full text-xs p-2.5 rounded-xl border bg-slate-950 border-slate-700 text-teal-300 font-bold focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
                    >
                      <option value="full_system">بازیابی کامل کل سیستم (Full System JSON Restore)</option>
                      <option value="employees">لیست پرسنل و پرونده‌های همکاران (Employees)</option>
                      <option value="criteria">بانک شاخص‌ها و سنجه‌های شایستگی (Criteria & KPIs)</option>
                      <option value="profiles">پروفایل‌ها و ماتریس‌های شغلی (Job Profiles)</option>
                      <option value="evaluations">سوابق و احکام ارزیابی عملکرد (Evaluations)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-300">استراتژی اعمال داده‌ها:</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setImportMode('merge')}
                        className={`p-2.5 rounded-xl text-xs font-bold transition-all border text-center cursor-pointer ${
                          importMode === 'merge'
                            ? 'bg-teal-500/10 border-teal-500 text-teal-300 shadow-sm'
                            : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        ادغام هوشمند (Merge)
                      </button>
                      <button
                        type="button"
                        onClick={() => setImportMode('replace')}
                        className={`p-2.5 rounded-xl text-xs font-bold transition-all border text-center cursor-pointer ${
                          importMode === 'replace'
                            ? 'bg-rose-500/10 border-rose-500 text-rose-300 shadow-sm'
                            : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        جایگزینی کامل (Replace)
                      </button>
                    </div>
                  </div>
                </div>

                {/* File Dropzone or Selection */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="font-bold flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-teal-400" />
                      محتوای داده‌ها (انتخاب فایل یا کپی مستقیم از اکسل):
                    </span>
                    <label className="text-teal-400 hover:text-teal-300 text-xs font-bold flex items-center gap-1 cursor-pointer bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-lg">
                      <Upload className="w-3 h-3" />
                      <span>انتخاب فایل از کامپیوتر (.csv, .json, .txt)</span>
                      <input
                        type="file"
                        accept=".csv,.json,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const content = ev.target?.result as string;
                              if (content) {
                                setRawImportText(content);
                              }
                            };
                            reader.readAsText(file, 'UTF-8');
                          }
                        }}
                      />
                    </label>
                  </div>

                  <textarea
                    rows={7}
                    value={rawImportText}
                    onChange={(e) => setRawImportText(e.target.value)}
                    placeholder={`متن فایل CSV یا کدهای JSON را اینجا جای‌گذاری کنید یا فایل را آپلود نمایید...\nنمونه پرسنل: نام و نام خانوادگی,کد پرسنلی,واحد سازمانی,عنوان رده شغلی,نقش کاربری,نام کاربری\nکارمند نمونه,EMP-1001,ماشین‌کاری ۱,اپراتور CNC,کارمند,emp_demo`}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-slate-200 font-mono focus:outline-none focus:border-teal-500 leading-relaxed"
                  />
                </div>

                {/* Submit Action */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setRawImportText('')}
                    className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>پاکسازی کادر متن</span>
                  </button>

                  <button
                    type="button"
                    disabled={isProcessingImport || !rawImportText.trim()}
                    onClick={() => handleProcessImport(rawImportText, targetImportEntity, importMode)}
                    className="bg-teal-500 hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black px-6 py-3 rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg shadow-teal-500/20 cursor-pointer"
                  >
                    {isProcessingImport ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>در حال پردازش و اعتبارسنجی...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                        <span>پردازش، اعتبارسنجی و ثبت در دیتابیس</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Right Column: Import Guidance & Column Reference */}
              <div className="lg:col-span-4 space-y-4">
                
                {/* Guidelines Box */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-3">
                  <h4 className="text-xs font-black text-slate-200 flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-teal-400" />
                    راهنمای ستون‌ها و ورود بی‌نقص
                  </h4>

                  <div className="text-xs text-slate-400 space-y-2 leading-relaxed">
                    <p>
                      سامانه هوشمند اصفهان چالاک به طور خودکار هم هدرهای فارسی اکسل و هم کلیدهای استاندارد انگلیسی را شناسایی و نگاشت می‌کند.
                    </p>
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5 text-[11px]">
                      <div className="font-bold text-teal-300">نکات حیاتی:</div>
                      <ul className="list-disc list-inside space-y-1 text-slate-400">
                        <li>کد پرسنلی و کد شاخص‌ها کلید یکتا (Unique Key) هستند.</li>
                        <li>در حالت ادغام هوشمند (Merge)، رکوردهای هم‌کد به‌روزرسانی شده و سایرین افزوده می‌شوند.</li>
                        <li>فرمت CSV با جداکننده کاما (,) یا تب (\t) پشتیبانی می‌شود.</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Direct JSON Restore Quickbox */}
                <div className="bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-3xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <FolderLock className="w-4 h-4 text-indigo-400" />
                    <h4 className="text-xs font-black text-slate-200">بازیابی مستقیم از فایل پشتیبان</h4>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    اگر قبلاً فایل کامل پشتیبان سامانه (<span className="font-mono text-indigo-300">chalak_full_backup.json</span>) را دانلود نموده‌اید، می‌توانید مستقیماً فایل را انتخاب نمایید:
                  </p>

                  <label className="w-full bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>انتخاب و بارگذاری سریع فایل JSON پشتیبان</span>
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const content = ev.target?.result as string;
                            if (content) {
                              handleProcessImport(content, 'full_system', 'merge');
                            }
                          };
                          reader.readAsText(file, 'UTF-8');
                        }
                      }}
                    />
                  </label>
                </div>

              </div>

            </div>
          )}

          {/* VIEW B: EXPORT & TEMPLATES CONSOLE */}
          {dataHubActiveView === 'export' && (
            <div className="bg-slate-800/30 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-lg">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <Download className="w-5 h-5 text-teal-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100">صادرات و دانلود فایل‌های خروجی و الگوهای رسمی</h3>
                  <p className="text-[10px] text-slate-400">تمام خروجی‌های CSV شامل کدگذاری UTF-8 BOM بوده و به صورت ۱۰۰٪ استاندارد و بدون به‌هم‌ریختگی در مایکروسافت اکسل باز می‌شوند.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Export Card 1: Employees */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-400" />
                      <h4 className="text-xs font-bold text-slate-100">لیست پرسنل و پرونده‌ها</h4>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      شامل نام، کد، واحد، رده شغلی، نقش، نام کاربری و کدهای سرپرست/همتا ({employees.length} نفر)
                    </p>
                  </div>
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <button
                      onClick={() => handleExportEntityCSV('employees')}
                      className="w-full bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-300 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>دانلود اکسل کامل پرسنل (CSV)</span>
                    </button>
                    <button
                      onClick={() => handleDownloadEntityTemplate('employees')}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                      <span>دانلود فایل الگوی خام</span>
                    </button>
                  </div>
                </div>

                {/* Export Card 2: Criteria */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-teal-400" />
                      <h4 className="text-xs font-bold text-slate-100">بانک شاخص‌ها و سنجه‌ها</h4>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      کدهای K/B/Q/S/L، تعاریف عملیاتی، منابع استخراج داده، روش‌های سنجش و جهت مطلوبیت ({criteria.length} شاخص)
                    </p>
                  </div>
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <button
                      onClick={() => handleExportEntityCSV('criteria')}
                      className="w-full bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-300 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>دانلود بانک شاخص‌ها (CSV)</span>
                    </button>
                    <button
                      onClick={() => handleDownloadEntityTemplate('criteria')}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                      <span>دانلود فایل الگوی خام</span>
                    </button>
                  </div>
                </div>

                {/* Export Card 3: Profiles */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Boxes className="w-4 h-4 text-amber-400" />
                      <h4 className="text-xs font-bold text-slate-100">پروفایل‌ها و اوزان شغلی</h4>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      الگوهای شایستگی، ترکیب اوزان شاخص‌ها، خانواده شغلی و وضعیت تصویب ({profiles.length} رده)
                    </p>
                  </div>
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <button
                      onClick={() => handleExportEntityCSV('profiles')}
                      className="w-full bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-300 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>دانلود پروفایل‌های شغلی (CSV)</span>
                    </button>
                    <button
                      onClick={() => handleDownloadEntityTemplate('profiles')}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                      <span>دانلود فایل الگوی خام</span>
                    </button>
                  </div>
                </div>

                {/* Export Card 4: Evaluations */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-rose-400" />
                      <h4 className="text-xs font-bold text-slate-100">سوابق ارزیابی عملکرد</h4>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      کارنامه‌های نهایی دوره‌ها، میانگین موزون امتیازات، یادداشت‌های مربیگری ({evaluations.length} پرونده)
                    </p>
                  </div>
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <button
                      onClick={() => handleExportEntityCSV('evaluations')}
                      className="w-full bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-300 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>دانلود کارنامه‌ها و نمرات (CSV)</span>
                    </button>
                    <button
                      onClick={() => handleDownloadEntityTemplate('evaluations')}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                      <span>دانلود فایل الگوی خام</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW C: INDUSTRIAL SANDBOX & SCALE BENCHMARK */}
          {dataHubActiveView === 'tools' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Box 1: Factory Standard Dataset */}
              <div className="bg-slate-800/30 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-lg flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-100">بارگذاری بسته داده‌های استاندارد کارخانه</h4>
                      <p className="text-[10px] text-slate-400">مجموعه داده‌های صنعتی کامل، شاخص‌های کیفی و پروفایل‌های ایستگاهی</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    با کلیک روی این دکمه، داده‌های واقعی خطوط ماشین‌کاری و مونتاژ اصفهان چالاک (شامل شاخص‌های PPM، OEE، ۵اس، پروتکل‌های HSE، نقش‌های سرپرستی و کارشناسی QC) بارگذاری می‌شوند.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleLoadIndustrialDemoDataset}
                  className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-black py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-teal-500/20 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                  <span>تزریق داده‌های نمونه استاندارد صنعتی</span>
                </button>
              </div>

              {/* Box 2: Scale Benchmark Generator */}
              <div className="bg-slate-800/30 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-lg flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-100">تولید داده‌های کلان بنچمارک و استرس‌تست</h4>
                      <p className="text-[10px] text-slate-400">سنجش سرعت، رندرینگ بهینه و پایداری جداول با ۵۰۰+ رکورد</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    جهت اطمینان از عملکرد پرسرعت موتور سامانه و اعتبارسنجی قابلیت‌های ایمپورت/اکسپورت با حجم‌های بزرگ، می‌توانید رکوردهای پرسنلی مصنوعی تولید نمایید:
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleGenerateScaleBenchmark(100)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 rounded-xl text-xs font-bold transition-all border border-slate-700 cursor-pointer"
                  >
                    + ۱۰۰ رکورد
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateScaleBenchmark(500)}
                    className="bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/40 text-indigo-300 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    + ۵۰۰ رکورد
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateScaleBenchmark(1000)}
                    className="bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/40 text-teal-300 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    + ۱,۰۰۰ رکورد
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* VIEW D: PRODUCTION & CYCLE TIME ENGINE */}
          {dataHubActiveView === 'calc' && (
            <ProductionCycleTimeCalculator
              employees={employees}
              criteria={criteria}
              profiles={profiles}
              evaluations={evaluations}
              onUpdateEvaluations={(nextEvals) => {
                onSetEvaluations(nextEvals);
                addLog('ثبت محاسبات خودکار تولید و سایکل‌تایم', 'محاسبه لحظه‌ای شاخص‌های تولید و درج مستقیم در کارنامه ارزیابی پرسنل', 'success');
              }}
              currentUser={currentUser}
            />
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION: PERFORMANCE HISTORY & COLD STORAGE ARCHIVE VAULT                 */}
      {/* ========================================================================= */}
      {(activeSectionTab === 'history' || activeSectionTab === 'all') && (
        <PerformanceArchiveVault
          activeEvaluations={evaluations}
          archivedEvaluations={effectiveArchived}
          onSetEvaluations={onSetEvaluations}
          onSetArchivedEvaluations={handleSetArchived}
          employees={employees}
          profiles={profiles}
          criteria={criteria}
          currentUser={currentUser}
          theme={theme}
          onAddLog={addLog}
        />
      )}

      {/* ========================================================================= */}
      {/* SECTION 4: AUDIT TRAIL & SYSTEM SECURITY EVENT LOGS                       */}
      {/* ========================================================================= */}
      {(activeSectionTab === 'logs' || activeSectionTab === 'all') && (
        <div className="bg-slate-800/30 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-amber-400" />
              <div>
                <h2 className="text-sm font-bold text-slate-200">ردپای امنیتی و ثبت رویدادهای سیستم (Audit Trail)</h2>
                <p className="text-[10px] text-slate-400">ثبت خودکار کلیه ورودها، تغییر کلمات عبور، بازنشانی‌ها و تخصیص دسترسی‌ها</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 text-slate-300 text-xs px-2.5 py-1.5 rounded-xl cursor-pointer focus:outline-none"
              >
                <option value="all">تمام رویدادها</option>
                <option value="success">موفقیت‌آمیز (Success)</option>
                <option value="warning">هشدارهای امنیتی (Warning)</option>
                <option value="danger">رویدادهای حساس (Danger)</option>
                <option value="info">اطلاعات عمومی (Info)</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  if (window.confirm('آیا از پاکسازی تاریخچه لاگ‌ها اطمینان دارید؟')) {
                    setLogs([]);
                  }
                }}
                className="text-rose-400 hover:text-rose-300 text-xs px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>پاکسازی لاگ‌ها</span>
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {logs
              .filter(l => logFilter === 'all' || l.type === logFilter)
              .map(log => {
                const getBadge = () => {
                  switch (log.type) {
                    case 'success': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                    case 'warning': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                    case 'danger': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                    default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
                  }
                };

                return (
                  <div key={log.id} className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getBadge()}`}>
                        {log.action}
                      </span>
                      <span className="text-slate-300">{log.details}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-500 shrink-0 font-mono">
                      <span>مجری: {log.operator}</span>
                      <span>•</span>
                      <span>{log.timestamp}</span>
                    </div>
                  </div>
                );
              })}

            {logs.length === 0 && (
              <div className="text-center py-6 text-slate-500 text-xs">
                هیچ رویدادی در تاریخچه ثبت نگردیده است.
              </div>
            )}
          </div>
        </div>
      )}

      {/* EXCEL INTEGRATION MODAL */}
      <ExcelIntegrationCenter
        isOpen={isExcelIntegrationOpen}
        onClose={() => setIsExcelIntegrationOpen(false)}
        employees={employees}
        profiles={profiles}
        criteria={criteria}
        evaluations={evaluations}
        currentUser={currentUser}
        onUpdateEvaluations={onSetEvaluations}
        onAddEvaluation={(empId, period) => {
          const emp = employees.find(e => e.id === empId);
          if (!emp || !emp.profileId) return;
          const prof = profiles.find(p => p.id === emp.profileId);
          if (!prof) return;

          const scores = prof.items.map(item => ({
            cid: item.cid,
            weight: item.weight,
            value: 0,
            self: 0,
            doc: ''
          }));

          const newEval: Evaluation = {
            id: `eval-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            empId,
            period,
            profileId: prof.id,
            status: 'draft',
            ...resolveInitialEvaluationWorkflow(emp, employees, db.getMiscData('pe_route_rules', DEFAULT_ROUTE_RULES), prof.id),
            scores,
            note: '',
            created: Date.now()
          };
          onSetEvaluations([...evaluations, newEval]);
        }}
      />
    </div>
  );
}

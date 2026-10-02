import SearchInput from './ui/SearchInput';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { validateEmployeeInput } from '../utils/validation';
import { buildEmployeeBulkEditPreview, type EmployeeBulkPreviewRow } from '../utils/employeeBulkEdit';
import { db, CURRENT_ACTIVE_PERIOD } from '../utils/db';
import { 
  Users, 
  Plus, 
  Edit3, 
  Trash2, 
  Search, 
  ClipboardPlus, 
  Building2, 
  UserCheck, 
  UploadCloud, 
  Sparkles, 
  CheckCircle2,
  Table as TableIcon,
  LayoutGrid,
  Zap,
  Layers,
  FileSpreadsheet,
  Download,
  ShieldCheck,
  AlertTriangle
  ,Lock, X
} from 'lucide-react';
import { Employee, JobProfile, UserRole, Evaluation } from '../types';
import { VirtualizedTable } from './VirtualizedTable';
import { HighlightText } from './HighlightText';
import UniversalDataExchange, { DataExchangeConfig } from './UniversalDataExchange';
import { prepareEmployeeImport } from '../utils/employeeImport';
import { employeeSearchScore, matchesEmployeeSearch, normalizePersonnelCode } from '../utils/personnelSearch';
import { canImport } from '../utils/authorization';
import type { MasterDataSourceImportContext } from '../utils/sourceImports';

interface EmployeesProps {
  employees: Employee[];
  profiles: JobProfile[];
  currentUser: Employee | null;
  evaluations?: Evaluation[];
  onAddEmployee: (emp: Omit<Employee, 'id'>) => void;
  onUpdateEmployee: (id: string, emp: Omit<Employee, 'id'>) => void;
  onBulkUpdateEmployees?: (employees: Employee[], operationId?: string) => boolean | Promise<boolean>;
  onImportEmployees?: (employees: Employee[], sourceImport: MasterDataSourceImportContext) => Promise<boolean>;
  onDeleteEmployee: (id: string) => boolean | Promise<boolean>;
  onBulkDeleteEmployees?: (ids: string[]) => boolean | Promise<boolean>;
  onStartEvaluation: (empId: string) => void;
  theme?: 'dark' | 'light';
}

// Predefined workshop rosters for fast 1-click batch team importing
const PRESET_ROSTERS = [
  {
    title: 'تیم تکمیلی سالن ماشین‌کاری و CNC',
    unit: 'سالن ماشین‌کاری ۱',
    description: 'شامل ۳ اپراتور ارشد تراشکاری، فرزکاری و ستاپ دستگاه‌های چندمحوره',
    members: [
      { code: 'EMP-1006', name: 'کارمند نمونه', unit: 'سالن ماشین‌کاری ۱', role: 'employee' as UserRole, username: 'saeed' },
      { code: 'EMP-1007', name: 'جناب آقای مجید نوری', unit: 'سالن ماشین‌کاری ۱', role: 'employee' as UserRole, username: 'majid' },
      { code: 'EMP-1008', name: 'مهندس کامران صباغی', unit: 'سالن ماشین‌کاری ۱', role: 'supervisor' as UserRole, username: 'kamran' }
    ]
  },
  {
    title: 'تیم ایستگاه‌های مونتاژ و بسته‌بندی نهایی',
    unit: 'سالن مونتاژ و بسته‌بندی',
    description: 'اپراتورهای خطوط مکانیزه مونتاژ، پرچ‌کاری و تست پایانی',
    members: [
      { code: 'EMP-1009', name: 'سرکار خانم زهرا موسوی', unit: 'سالن مونتاژ و بسته‌بندی', role: 'employee' as UserRole, username: 'zahra' },
      { code: 'EMP-1010', name: 'جناب آقای حسین توکلی', unit: 'سالن مونتاژ و بسته‌بندی', role: 'employee' as UserRole, username: 'hossein' }
    ]
  },
  {
    title: 'تیم آزمایشگاه کالیبراسیون و کنترل کیفی (QC)',
    unit: 'واحد کنترل کیفیت و آزمایشگاه',
    description: 'کارشناسان تست‌های ابعادی، متالوژی و تضمین کیفیت فرآیند',
    members: [
      { code: 'EMP-1011', name: 'سرکار خانم الناز بهرامی', unit: 'واحد کنترل کیفیت و آزمایشگاه', role: 'employee' as UserRole, username: 'elnaz' },
      { code: 'EMP-1012', name: 'مهندس پیمان رستمی', unit: 'واحد کنترل کیفیت و آزمایشگاه', role: 'supervisor' as UserRole, username: 'peyman' }
    ]
  }
];

export default function Employees({
  employees,
  evaluations = [],
  profiles,
  currentUser,
  onAddEmployee,
  onUpdateEmployee,
  onBulkUpdateEmployees,
  onImportEmployees,
  onDeleteEmployee,
  onBulkDeleteEmployees,
  onStartEvaluation,
  theme = 'light'
}: EmployeesProps) {
  const employeeImportAllowed = Boolean(currentUser && canImport(currentUser, 'employee').allowed);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isExchangeModalOpen, setIsExchangeModalOpen] = useState(false);
  const [externalImportRequest, setExternalImportRequest] = useState<{ id: string; items: any[] } | null>(null);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [deleteToast, setDeleteToast] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const bulkDeletingRef = useRef(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Bulk Selection State for Batch Actions
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set());
  const [selectionCodes, setSelectionCodes] = useState('');
  const [selectionFeedback, setSelectionFeedback] = useState<{ matched: string[]; unknown: string[]; duplicates: string[] } | null>(null);
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const [bulkAssignUnit, setBulkAssignUnit] = useState('');
  const [bulkAssignSupervisor, setBulkAssignSupervisor] = useState('');
  const [bulkAssignProfile, setBulkAssignProfile] = useState('');
  const [bulkAssignError, setBulkAssignError] = useState('');
  const [bulkAssignPreview, setBulkAssignPreview] = useState<Employee[] | null>(null);
  const [bulkAssignPreviewRows, setBulkAssignPreviewRows] = useState<EmployeeBulkPreviewRow[] | null>(null);
  const [presence, setPresence] = useState<Record<string, number>>(() => db.getMiscData('pe_presence', {}));
  const [isBatchCreateModalOpen, setIsBatchCreateModalOpen] = useState(false);
  const [batchText, setBatchText] = useState('');

  useEffect(() => {
    const unsub = db.subscribe((key, data) => {
      if (key === 'pe_presence' && data) {
        setPresence(data);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (employees.length > 200 && viewMode === 'grid') setViewMode('table');
  }, [employees.length, viewMode]);

  const employeeNameById = useMemo(() => new Map(employees.map(employee => [employee.id, employee.name])), [employees]);
  const profileTitleById = useMemo(() => new Map(profiles.map(profile => [profile.id, profile.title])), [profiles]);

  const isOnline = (empId: string) => {
    const lastSeen = presence[empId];
    if (!lastSeen) return false;
    return (Date.now() - lastSeen) < 30000; // Online if active in last 30s
  };


  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  const isProtectedAdmin = (emp: Employee) => {
    return emp.username?.toLowerCase() === 'admin' && emp.code === 'ADMIN-001';
  };

  const handleBatchCreateSubmit = () => {
    if (!batchText.trim()) return;
    const lines = batchText.split('\n');
    let addedCount = 0;
    lines.forEach(line => {
      const parts = line.split(',');
      if (parts.length >= 3) {
        const [name, code, unit, roleStr] = parts.map(p => p.trim());
        if (name && code && unit) {
          const emp = {
            name,
            code,
            unit,
            role: (roleStr === 'admin' || roleStr === 'supervisor' || roleStr === 'employee') ? roleStr : 'employee',
            username: code.toLowerCase(),
            profileId: profiles.length > 0 ? profiles[0].id : '',
            permissions: []
          };
          onAddEmployee(emp as any);
          addedCount++;
        }
      }
    });
    setIsBatchCreateModalOpen(false);
    setBatchText('');
    alert(`${addedCount} کاربر جدید اضافه شد.`);
  };

  const handleToggleSelectAll = () => {
    // Only select non-root-admin employees to protect root admin account
    const selectable = filteredEmployees.filter(e => !isProtectedAdmin(e));
    if (selectedEmpIds.size === selectable.length) {
      setSelectedEmpIds(new Set());
    } else {
      setSelectedEmpIds(new Set(selectable.map(e => e.id)));
    }
  };

  const handleToggleSelect = (emp: Employee, e?: React.MouseEvent | React.ChangeEvent) => {
    if (e) e.stopPropagation();
    if (isProtectedAdmin(emp)) {
      return;
    }
    const next = new Set(selectedEmpIds);
    if (next.has(emp.id)) {
      next.delete(emp.id);
    } else {
      next.add(emp.id);
    }
    setSelectedEmpIds(next);
  };

  const selectByPersonnelCodes = () => {
    const codes: string[] = selectionCodes.split(/[\s,،;؛]+/).map(normalizePersonnelCode).filter(Boolean);
    if (!codes.length) { setSelectionFeedback(null); setBulkAssignError('کد پرسنلی وارد کنید.'); return; }
    const byCode = new Map<string, Employee>(employees.filter(emp => !isProtectedAdmin(emp)).map(emp => [normalizePersonnelCode(emp.code), emp]));
    const uniqueCodes: string[] = [];
    const duplicates: string[] = [];
    const seen = new Set<string>();
    for (const code of codes) {
      if (seen.has(code)) duplicates.push(code);
      else { seen.add(code); uniqueCodes.push(code); }
    }
    const matched = uniqueCodes.filter(code => byCode.has(code));
    const unknown = uniqueCodes.filter(code => !byCode.has(code));
    setSelectionFeedback({ matched, unknown, duplicates });
    if (unknown.length) {
      // Never leave a stale or partial selection actionable after invalid input.
      setSelectedEmpIds(new Set());
      setBulkAssignError(`کد نامعتبر یا غیرقابل انتخاب: ${unknown.join('، ')}`);
      return;
    }
    setSelectedEmpIds(new Set(matched.map(code => byCode.get(code)!.id)));
    setBulkAssignError('');
  };

  const applyBulkAssignment = () => {
    const targets = employees.filter(emp => selectedEmpIds.has(emp.id));
    if (!onBulkUpdateEmployees || !targets.length || (!bulkAssignUnit.trim() && !bulkAssignSupervisor && !bulkAssignProfile)) {
      setBulkAssignError('حداقل یک مقدار معتبر برای تغییر انتخاب کنید.');
      return;
    }
    if (bulkAssignSupervisor && targets.some(emp => emp.id === bulkAssignSupervisor)) {
      setBulkAssignError('سرپرست نمی‌تواند یکی از پرونده‌های انتخاب‌شده باشد.');
      return;
    }
    const preview = buildEmployeeBulkEditPreview(employees, selectedEmpIds, {
      ...(bulkAssignUnit.trim() ? { unit: bulkAssignUnit } : {}),
      ...(bulkAssignSupervisor ? { supervisorId: bulkAssignSupervisor } : {}),
      ...(bulkAssignProfile ? { profileId: bulkAssignProfile } : {}),
    });
    assignmentOperationId.current = crypto.randomUUID();
    setBulkAssignPreview(preview.employees);
    setBulkAssignPreviewRows(preview.rows);
    setBulkAssignError('پیش‌نمایش آماده است؛ نتیجه را بررسی و سپس تأیید نهایی کنید.');
  };

  const assignmentOperationId = useRef(crypto.randomUUID());
  const confirmBulkAssignment = async () => {
    if (!onBulkUpdateEmployees || !bulkAssignPreview) return;
    const fresh = buildEmployeeBulkEditPreview(employees, selectedEmpIds, {
      ...(bulkAssignUnit.trim() ? { unit: bulkAssignUnit } : {}),
      ...(bulkAssignSupervisor ? { supervisorId: bulkAssignSupervisor } : {}),
      ...(bulkAssignProfile ? { profileId: bulkAssignProfile } : {}),
    });
    if (JSON.stringify(fresh.rows) !== JSON.stringify(bulkAssignPreviewRows)) {
      setBulkAssignPreview(fresh.employees);
      setBulkAssignPreviewRows(fresh.rows);
      setBulkAssignError('اطلاعات کارکنان هنگام پیش‌نمایش تغییر کرده است؛ تغییرهای تازه را دوباره بررسی کنید.');
      return;
    }
    if ((await onBulkUpdateEmployees(fresh.employees, assignmentOperationId.current)) !== true) { setBulkAssignError('سرور انتساب گروهی را تأیید نکرد؛ پیش‌نمایش حفظ شد.'); return; }
    const changed = fresh.rows.filter(row => JSON.stringify(row.before) !== JSON.stringify(row.after)).length;
    setDeleteToast(`تعداد ${changed} پرونده پرسنلی به‌روزرسانی شد.`);
    setIsBulkAssignOpen(false);
    setBulkAssignPreview(null);
    setBulkAssignPreviewRows(null);
    setSelectedEmpIds(new Set());
    setBulkAssignError('');
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedEmpIds.size === 0 || bulkDeletingRef.current) return;
    bulkDeletingRef.current = true;
    const count = selectedEmpIds.size;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const succeeded = onBulkDeleteEmployees
        ? await onBulkDeleteEmployees(Array.from(selectedEmpIds))
        : (await Promise.all(Array.from(selectedEmpIds).map((id: string) => onDeleteEmployee(id)))).every(Boolean);
      if (!succeeded) throw new Error('حذف گروهی کامل نشد. لطفاً اتصال و دسترسی خود را بررسی کنید.');
      const remainingIds = new Set(db.getEmployees().map(person => person.id));
      const retained = (Array.from(selectedEmpIds) as string[]).filter(id => remainingIds.has(id));
      const deletedCount = count - retained.length;
      setSelectedEmpIds(new Set(retained));
      setIsBulkDeleteModalOpen(false);
      setDeleteToast(`تعداد ${deletedCount} پرونده پرسنلی حذف شدند.${retained.length ? ` ${retained.length} پرونده محافظت‌شده باقی ماندند.` : ''}`);
      setTimeout(() => setDeleteToast(null), 4000);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'حذف گروهی با خطا روبه‌رو شد.');
    } finally {
      bulkDeletingRef.current = false;
      setIsDeleting(false);
    }
  };

  // Bulk Import State (Legacy quick modal)
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkStatusMsg, setBulkStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isBulkImporting, setIsBulkImporting] = useState(false);

  const beginEmployeeImportPreview = (items: any[]) => {
    if (!employeeImportAllowed) {
      setBulkStatusMsg({ text: 'مجوز درون‌ریزی اطلاعات پرسنلی برای این کاربر فعال نیست.', type: 'error' });
      return;
    }
    setIsBulkModalOpen(false);
    setBulkText('');
    setBulkStatusMsg(null);
    setExternalImportRequest({ id: `employee-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, items });
    setIsExchangeModalOpen(true);
  };

  // Form values
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formUnit, setFormUnit] = useState('');
  const [formProfileId, setFormProfileId] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('employee');
  const [formUsername, setFormUsername] = useState('');
  const [formSupervisorId, setFormSupervisorId] = useState('');
  const [formPeerReviewerId, setFormPeerReviewerId] = useState('');
  const [formCalibrationLeadId, setFormCalibrationLeadId] = useState('');
  const [formApproverId, setFormApproverId] = useState('');
  const [formHseReviewerId, setFormHseReviewerId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const applyEmployeeImportPlan = async (plan: ReturnType<typeof prepareEmployeeImport>) => {
    const createdCount = plan.counts.NEW;
    const updatedCount = plan.counts.UPDATE;
    const totalSuccess = plan.changedCount;
    if (totalSuccess > 0) {
      const sourceImport: MasterDataSourceImportContext = {
        importType: 'EMPLOYEE',
        operationId: `employee:${crypto.randomUUID()}`,
      };
      if (onImportEmployees) {
        const accepted = await onImportEmployees(plan.employees, sourceImport);
        if (!accepted) return {
          count: 0,
          message: 'درون‌ریزی از سوی سرور پذیرفته نشد؛ داده‌های محلی بازگردانده شدند.',
          errors: ['employee_import_not_authorized_or_invalid'],
        };
      } else if (onBulkUpdateEmployees) {
        onBulkUpdateEmployees(plan.employees);
      } else {
        db.saveEmployees(plan.employees);
        plan.employees.forEach(emp => {
          const orig = employees.find(existing => existing.id === emp.id);
          if (orig) onUpdateEmployee(emp.id, emp);
          else onAddEmployee(emp);
        });
      }
    }

    return {
      count: totalSuccess,
      message: `Applied ${totalSuccess} employee changes (${createdCount} new, ${updatedCount} updated, ${plan.counts.UNCHANGED} unchanged, ${plan.counts.INVALID} invalid, ${plan.counts.DUPLICATE} duplicate, ${plan.counts['UNKNOWN / UNMAPPED']} unmapped).`,
      errors: plan.errors,
    };
  };

  // Universal Data Exchange Configuration for Employees
  const employeesExchangeConfig: DataExchangeConfig<Employee> = {
    entityName: 'مدیریت پرسنل و پرونده‌های همکاران',
    entityKey: 'employees',
    items: employees,
    canImport: employeeImportAllowed,
    importUnavailableMessage: 'برای درون‌ریزی اطلاعات پرسنلی باید مجوز EMPLOYEE_IMPORT برای حساب شما فعال باشد.',
    csvHeaders: [
      { key: 'name', label: 'نام و نام خانوادگی' },
      { key: 'code', label: 'کد پرسنلی' },
      { key: 'unit', label: 'واحد سازمانی' },
      { 
        key: 'profile', 
        label: 'عنوان رده شغلی', 
        accessor: (emp) => profiles.find(p => p.id === emp.profileId)?.title || profiles.find(p => p.id === emp.profileId)?.code || emp.profileId 
      },
      { 
        key: 'role', 
        label: 'نقش کاربری', 
        accessor: (emp) => emp.role === 'admin' ? 'مدیر ارشد' : emp.role === 'supervisor' ? 'سرپرست' : 'کارمند' 
      },
      { key: 'username', label: 'نام کاربری' },
      { 
        key: 'supervisor', 
        label: 'کد پرسنلی سرپرست مستقیم', 
        accessor: (emp) => employees.find(s => s.id === emp.supervisorId)?.code || '' 
      },
      { 
        key: 'peer', 
        label: 'کد پرسنلی ارزیاب همتا', 
        accessor: (emp) => employees.find(s => s.id === emp.peerReviewerId)?.code || '' 
      },
      {
        key: 'approver', 
        label: 'کد پرسنلی تصویب‌کننده', 
        accessor: (emp) => employees.find(s => s.id === emp.approverId)?.code || '' 
      },
      {
        key: 'hseReviewer',
        label: 'کد پرسنلی بازبین HSE',
        accessor: (emp) => employees.find(s => s.id === emp.hseReviewerId)?.code || ''
      }
    ],
    templateSampleRows: [
      {
        'نام و نام خانوادگی': 'کارمند نمونه',
        'کد پرسنلی': 'EMP-1001',
        'واحد سازمانی': 'سالن ماشین‌کاری ۱',
        'عنوان رده شغلی': 'اپراتور ارشد تراشکاری CNC',
        'نقش کاربری': 'کارمند',
        'نام کاربری': 'ali_rezaei',
        'کد پرسنلی سرپرست مستقیم': 'EMP-1008',
        'کد پرسنلی ارزیاب همتا': 'EMP-1002',
        'کد پرسنلی تصویب‌کننده': 'EMP-1008'
      },
      {
        'نام و نام خانوادگی': 'مهندس کامران صباغی',
        'کد پرسنلی': 'EMP-1008',
        'واحد سازمانی': 'سالن ماشین‌کاری ۱',
        'عنوان رده شغلی': 'سرپرست تولید و ماشین‌کاری',
        'نقش کاربری': 'سرپرست',
        'نام کاربری': 'kamran',
        'کد پرسنلی سرپرست مستقیم': '',
        'کد پرسنلی ارزیاب همتا': '',
        'کد پرسنلی تصویب‌کننده': ''
      }
    ],
    onImport: async (importedItems, mode) => applyEmployeeImportPlan(prepareEmployeeImport(importedItems, employees, profiles, mode)),
    prepareImport: (importedItems, mode) => {
      const plan = prepareEmployeeImport(importedItems, employees, profiles, mode);
      return {
        preview: {
          rows: plan.rows,
          counts: plan.counts,
          changedCount: plan.changedCount,
          removedCount: mode === 'replace' ? plan.counts.removed : undefined,
        },
        commit: () => applyEmployeeImportPlan(plan),
      };
    },
  };

  // Bulk benchmark generator (for testing >1,000 employees performance)
  const handleGenerateScaleEmployees = (count: number) => {
    const units = ['سالن ماشین‌کاری ۱', 'سالن ماشین‌کاری ۲', 'سالن مونتاژ و بسته‌بندی', 'واحد کنترل کیفیت', 'تعمیرات و نگهداری PM', 'مهندسی فرآیند و تولید', 'انبار قطعات و تدارکات'];
    const firstNames = ['محمدرضا', 'امیرحسین', 'علیرضا', 'مهدی', 'حسین', 'سعید', 'مصطفی', 'حسن', 'فرشید', 'کاوه', 'نیما', 'پیمان', 'مجید', 'سامان', 'زهرا', 'مریم', 'فاطمه', 'سمیرا', 'الهام', 'نرگس', 'سحر'];
    const lastNames = ['موسوی', 'صادقی', 'حیدری', 'طباطبایی', 'رحیمی', 'قاسمی', 'کاظمی', 'فرهادی', 'جعفری', 'مرادی', 'طاهری', 'اسدی', 'کریمی', 'محققی', 'دهقان', 'نظری', 'میرزایی', 'افشار', 'سلیمانی'];

    let added = 0;
    const startCodeIndex = employees.length + 1000;
    const defaultProfId = profiles[0]?.id || 'prof-1';

    for (let i = 0; i < count; i++) {
      const f = firstNames[Math.floor(Math.random() * firstNames.length)];
      const l = lastNames[Math.floor(Math.random() * lastNames.length)];
      const unit = units[Math.floor(Math.random() * units.length)];
      const codeNum = startCodeIndex + i;
      const code = `EMP-${codeNum}`;
      const username = `emp_${codeNum}`;
      const role: UserRole = i % 15 === 0 ? 'supervisor' : 'employee';
      const prof = profiles[i % profiles.length]?.id || defaultProfId;

      onAddEmployee({
        name: `${f} ${l}`,
        code,
        unit,
        profileId: prof,
        role,
        username
      });
      added++;
    }

    setBulkStatusMsg({
      text: `تعداد ${added} رکورد پرسنلی جدید برای تست مقیاس‌پذیری و مجازی‌سازی (Virtualization) به پایگاه افزوده شد. عملکرد رندر بررسی شود.`,
      type: 'success'
    });
  };

  const openForm = (emp?: Employee) => {
    if (emp) {
      setEditingId(emp.id);
      setFormName(emp.name);
      setFormCode(emp.code);
      setFormUnit(emp.unit);
      setFormProfileId(emp.profileId);
      setFormRole(emp.role || 'employee');
      setFormUsername(emp.username || '');
      setFormSupervisorId(emp.supervisorId || '');
      setFormPeerReviewerId(emp.peerReviewerId || '');
      setFormCalibrationLeadId(emp.calibrationLeadId || '');
      setFormApproverId(emp.approverId || '');
      setFormHseReviewerId(emp.hseReviewerId || '');
    } else {
      // Auto-suggest next employee code
      const highestNum = employees.reduce((max, e) => {
        const match = e.code.match(/\d+/);
        if (match) {
          const num = parseInt(match[0], 10);
          return num > max ? num : max;
        }
        return max;
      }, 1000);
      const nextCode = `EMP-${highestNum + 1}`;
      const defaultUnit = employees[0]?.unit || 'واحد تولید';

      setEditingId(null);
      setFormName('');
      setFormCode(nextCode);
      setFormUnit(defaultUnit);
      setFormProfileId(profiles[0]?.id || '');
      setFormRole('employee');
      setFormUsername(`user_${highestNum + 1}`);
      setFormSupervisorId('');
      setFormPeerReviewerId('');
      setFormCalibrationLeadId('');
      setFormApproverId('');
      setFormHseReviewerId('');
    }
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const codeClean = formCode.trim().toUpperCase();
    let userClean = formUsername.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
    if (!userClean) {
      userClean = `user_${codeClean.toLowerCase().replace(/[^a-z0-9]/g, '') || Math.random().toString(36).substring(2, 7)}`;
    }

    const rawData = {
      name: formName.trim(),
      code: codeClean,
      unit: formUnit.trim(),
      profileId: formProfileId,
      role: formRole,
      username: userClean,
      supervisorId: formSupervisorId || undefined,
      peerReviewerId: formPeerReviewerId || undefined,
      calibrationLeadId: formCalibrationLeadId || undefined,
      approverId: formApproverId || undefined,
      hseReviewerId: formHseReviewerId || undefined
    };

    const validation = validateEmployeeInput(rawData);
    if (!validation.success) {
      setErrorMsg(validation.errors.join(' | '));
      return;
    }

    const payload = validation.data;

    // Check duplicate username (except current editing user)
    const isDuplicateUser = employees.some(
      emp => emp.username.toLowerCase() === payload.username.toLowerCase() && emp.id !== editingId
    );

    if (isDuplicateUser) {
      setErrorMsg('این نام کاربری قبلاً توسط همکار دیگری ثبت شده است. لطفاً نام کاربری دیگری انتخاب کنید.');
      return;
    }

    // Check duplicate code (except current editing user)
    const isDuplicateCode = employees.some(
      emp => emp.code.toUpperCase() === payload.code.toUpperCase() && emp.id !== editingId
    );

    if (isDuplicateCode) {
      setErrorMsg('این کد پرسنلی قبلاً برای همکار دیگری ثبت شده است. لطفاً کد پرسنلی را تغییر دهید.');
      return;
    }

    if (editingId) {
      onUpdateEmployee(editingId, payload);
    } else {
      onAddEmployee(payload);
    }

    setIsModalOpen(false);
  };

  // Bulk Import Handlers
  const handleLoadRoster = (members: typeof PRESET_ROSTERS[0]['members'], defaultUnit: string) => {
    beginEmployeeImportPreview(members.map(member => ({
      name: member.name,
      code: member.code,
      unit: member.unit || defaultUnit,
      role: member.role,
      username: member.username,
    })));
  };

  // Bulk Import from real XLSX file using ExcelJS cell-based parsing
  const handleBulkXlsxImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setBulkStatusMsg({ text: 'لطفاً فایل Excel (XLSX) انتخاب کنید.', type: 'error' });
      return;
    }
    setIsBulkImporting(true);
    setBulkStatusMsg({ text: 'در حال پردازش فایل Excel...', type: 'info' });
    try {
      const { readWorkbookRows } = await import('../utils/excelWorkbook');
      const workbook = await readWorkbookRows(file);
      const importRows: Record<string, unknown>[] = [];
      let matchedSheets = 0;
      const latinDigits = (value: string) => value.replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06F0))
        .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660));

      for (const sheetName of workbook.sheets) {
        const rows = workbook.rowsBySheet[sheetName] || [];
        if (rows.length < 2) continue;
        // A workbook may contain a cover/guide tab. Import every sheet with
        // identifiable personnel columns and keep cell boundaries intact.
        const headers = (rows[0] || []).map(h => String(h ?? '').trim().toLowerCase());
        const codeIdx = headers.findIndex(h => h.includes('کد') || h === 'code' || h === 'personnel');
        const nameIdx = headers.findIndex(h => h.includes('نام') || h === 'name');
        if (codeIdx < 0 || nameIdx < 0) continue;
        matchedSheets++;
        const unitIdx = headers.findIndex(h => h.includes('واحد') || h === 'unit' || h.includes('بخش'));
        const roleIdx = headers.findIndex(h => h.includes('نقش') || h === 'role' || h.includes('سمت'));
        const usernameIdx = headers.findIndex(h => h.includes('کاربری') || h === 'username' || h.includes('login'));
        const profileIdx = headers.findIndex(h => h.includes('پروفایل') || h.includes('رده شغلی') || h === 'profile' || h === 'profileid' || h === 'job profile');
        const supervisorIdx = headers.findIndex(h => h.includes('سرپرست') || h === 'supervisor' || h === 'supervisorid');
        const peerIdx = headers.findIndex(h => h.includes('همتا') || h === 'peer' || h === 'peerreviewerid');
        const approverIdx = headers.findIndex(h => h.includes('تصویب') || h === 'approver' || h === 'approverid');
        const mappedIndexes = new Set([codeIdx, nameIdx, unitIdx, roleIdx, usernameIdx, profileIdx, supervisorIdx, peerIdx, approverIdx].filter(index => index >= 0));
        for (let i = 1; i < rows.length; i++) {
          const parts = (rows[i] || []).map(cell => String(cell ?? '').trim());
          if (parts.every(part => !part)) continue;
          const code = latinDigits(parts[codeIdx] || '').toUpperCase();
          const name = parts[nameIdx] || '';
          const candidate: Record<string, unknown> = {
            name, code,
            unit: unitIdx >= 0 ? (parts[unitIdx] || 'سالن تولید') : 'سالن تولید',
            role: roleIdx >= 0 ? (parts[roleIdx] || 'employee') : 'employee',
            username: usernameIdx >= 0 ? (parts[usernameIdx] || '') : '',
          };
          if (profileIdx >= 0) candidate.profile = parts[profileIdx] || '';
          if (supervisorIdx >= 0) candidate.supervisor = parts[supervisorIdx] || '';
          if (peerIdx >= 0) candidate.peer = parts[peerIdx] || '';
          if (approverIdx >= 0) candidate.approver = parts[approverIdx] || '';
          headers.forEach((header, index) => {
            if (!mappedIndexes.has(index) && parts[index]) candidate[header] = parts[index];
          });
          importRows.push(candidate);
        }
      }
      if (matchedSheets === 0) {
        setBulkStatusMsg({ text: 'هیچ برگه‌ای با ستون‌های کد پرسنلی و نام یافت نشد.', type: 'error' });
        return;
      }

      beginEmployeeImportPreview(importRows);
    } catch (err: any) {
      setBulkStatusMsg({ text: `خطا در پردازش فایل Excel: ${err.message || 'فرمت نامعتبر'}`, type: 'error' });
    } finally {
      setIsBulkImporting(false);
      e.target.value = '';
    }
  };

  const handleProcessBulkEmployees = () => {
    if (!bulkText.trim()) {
      setBulkStatusMsg({ text: 'لطفاً اطلاعات پرسنل را در کادر متنی وارد فرمایید.', type: 'error' });
      return;
    }

    const lines = bulkText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const importRows = lines.flatMap(line => {
      const parts = line.includes('\t') ? line.split('\t') : line.split(',');
      if (parts.length < 2) return [{ code: '', name: '' }];
      return [{
        code: parts[0]?.trim().toUpperCase() || '',
        name: parts[1]?.trim() || '',
        unit: parts[2]?.trim() || 'سالن تولید',
        role: parts[3]?.trim() || 'employee',
        username: parts[4]?.trim().toLowerCase() || '',
      }];
    });
    beginEmployeeImportPreview(importRows);
  };

  const filteredEmployees = useMemo(() => {
    const profilesById = new Map(profiles.map(profile => [profile.id, profile]));
    const statusByEmployeeId = new Map(evaluations.filter(item => item.period === CURRENT_ACTIVE_PERIOD).map(item => [item.empId, item.stage || item.status]));
    const filtered = employees.filter(emp => {
      const profile = profilesById.get(emp.profileId);
      const evalStatus = String(statusByEmployeeId.get(emp.id) || 'not_started');
      
      const roleFa = emp.role === 'admin' ? 'ادمین' : emp.role === 'supervisor' ? 'سرپرست' : 'کارمند';
      const statusFa = evalStatus === 'not_started' ? 'ارزیابی نشده' :
                       evalStatus === 'draft' ? 'پیش‌نویس' :
                       evalStatus === 'self_review' ? 'خودارزیابی' :
                       evalStatus === 'supervisor_review' ? 'ارزیابی سرپرست' :
                       evalStatus === 'hr_approval' ? 'تایید منابع انسانی' :
                       evalStatus === 'peer_review' ? 'ارزیابی همتا' :
                       evalStatus === 'locked' ? 'بسته شده' :
                       evalStatus === 'calibrated' ? 'کالیبره شده' :
                       evalStatus === 'calibration_review' ? 'کالیبراسیون' :
                       evalStatus === 'finalized' ? 'نهایی شده' : evalStatus;

      return matchesEmployeeSearch(emp, searchTerm, [profile?.title || '', roleFa, statusFa]);
    });
    if (!searchTerm.trim()) return filtered;
    return filtered.sort((left, right) => employeeSearchScore(right, searchTerm) - employeeSearchScore(left, searchTerm));
  }, [employees, profiles, searchTerm, evaluations]);

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      case 'supervisor': return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'employee': return 'bg-teal-500/10 text-teal-400 border border-teal-500/20';
    }
  };

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'مدیر منابع انسانی';
      case 'supervisor': return 'سرپرست خط';
      case 'employee': return 'کارمند کارگاه';
    }
  };

  return (
    <div className="space-y-7 text-right" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-end flex-wrap gap-5 border-b border-slate-200/80 pb-5 dark:border-slate-800/80">
        <div className="max-w-2xl">
          <p className="mb-1.5 text-xs font-bold text-teal-700 dark:text-teal-300">ساختار و دسترسی‌های سازمان</p>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">مدیریت پرسنل</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-7">
            ثبت اطلاعات همکاران، تعریف و تغییر نقش‌های دسترسی (RBAC) و تخصیص پروفایل‌های شایستگی اصفهان چالاک
          </p>
        </div>
        <div className="flex w-full items-center gap-2.5 flex-wrap lg:w-auto lg:justify-end">
          <button
            type="button"
            onClick={() => setIsExchangeModalOpen(true)}
            className="min-h-11 bg-white hover:bg-slate-50 text-slate-700 dark:bg-slate-900/70 dark:hover:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>مرکز تبادل داده (Import / Export)</span>
          </button>

          <button
            onClick={() => {
              setBulkStatusMsg(null);
              setIsBulkModalOpen(true);
            }}
            className="min-h-11 bg-white hover:bg-slate-50 text-slate-700 dark:bg-slate-900/70 dark:hover:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
          >
            <UploadCloud className="w-4 h-4" />
            <span>ورود سریع و دسته‌جمعی پرسنل</span>
          </button>
          
          <button
            onClick={() => openForm()}
            className="min-h-11 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>افزودن همکار جدید</span>
          </button>
        </div>
      </div>

      {/* Toolbar Search & View Mode Switcher */}
      <div className="bg-white dark:bg-slate-900/70 border border-slate-200/90 dark:border-slate-800 p-3.5 sm:p-4 rounded-2xl flex flex-col md:flex-row gap-3.5 items-stretch md:items-center justify-between shadow-sm shadow-slate-950/[0.025]">
        <div className="relative w-full md:w-[min(100%,24rem)]">
          <SearchInput resultCount={filteredEmployees.length}
            type="text"
            placeholder="جستجو در نام، کد پرسنلی، واحد، شایستگی یا نقش..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
           
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            تعداد کارکنان <span className="ms-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-teal-700 dark:text-teal-300 font-bold font-mono">{filteredEmployees.length} نفر</span>
          </div>

          <div className="flex items-center bg-slate-100 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-700 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                viewMode === 'table' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="نمای جدول مجازی‌سازی شده (مناسب بیش از ۱۰۰۰ پرسنل)"
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>جدول مجازی (Virtual)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              disabled={employees.length > 200}
              className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                viewMode === 'grid' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              } disabled:cursor-not-allowed disabled:opacity-40`}
              title={employees.length > 200 ? 'برای فهرست‌های بالای ۲۰۰ نفر، جدول مجازی فعال می‌ماند.' : 'نمای کارت‌های شبکه'}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>کارت‌ها</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Selection Actions Bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3.5" dir="rtl">
        <label className="flex min-w-48 flex-1 flex-col gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
          انتخاب با کد پرسنلی (چند کد با ویرگول یا فاصله)
          <input aria-label="کدهای پرسنلی" value={selectionCodes} onChange={event => setSelectionCodes(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:placeholder:text-slate-500" placeholder="EMP-1001، EMP-1002" />
        </label>
        <button type="button" onClick={selectByPersonnelCodes} className="min-h-11 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-teal-700">انتخاب کدها</button>
        {selectionFeedback && <div data-testid="selection-feedback" role="status" className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-xs leading-6 text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-200" aria-live="polite">
          <p className="text-emerald-700 dark:text-emerald-300">مطابقت‌یافته ({selectionFeedback.matched.length}): {selectionFeedback.matched.length ? selectionFeedback.matched.join('، ') : 'هیچ‌کدام'}</p>
          <p className="text-amber-700 dark:text-amber-300">تکراری ({selectionFeedback.duplicates.length}): {selectionFeedback.duplicates.length ? selectionFeedback.duplicates.join('، ') : 'هیچ‌کدام'}</p>
          <p className="text-rose-700 dark:text-rose-300">ناشناخته ({selectionFeedback.unknown.length}): {selectionFeedback.unknown.length ? selectionFeedback.unknown.join('، ') : 'هیچ‌کدام'}</p>
        </div>}
        {bulkAssignError && !isBulkAssignOpen && <span role="alert" className="w-full text-xs text-rose-700 dark:text-rose-300">{bulkAssignError}</span>}
      </div>
      {selectedEmpIds.size > 0 && (
        <div className="bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-500/30 p-3.5 sm:p-4 rounded-2xl flex items-center justify-between animate-in fade-in flex-wrap gap-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-teal-900 dark:text-teal-200 font-bold">
            <CheckCircle2 className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <span>{selectedEmpIds.size} نفر از پرسنل برای عملیات دسته‌ای انتخاب شده‌اند</span>
          </div>
          <div className="flex items-center gap-2">
            {onBulkUpdateEmployees && <button type="button" onClick={() => { setBulkAssignError(''); setIsBulkAssignOpen(true); }} className="rounded-xl bg-teal-600 px-3.5 py-1.5 text-xs font-bold text-white">انتساب گروهی</button>}
            <button
              type="button"
              onClick={() => setIsBulkDeleteModalOpen(true)}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف گروهی ({selectedEmpIds.size} نفر)</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedEmpIds(new Set())}
              className="min-h-10 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-700"
            >
              لغو انتخاب‌ها
            </button>
          </div>
        </div>
      )}

      {/* Employees Render Mode: Virtualized Table or Card Grid */}
      {viewMode === 'table' ? (
        <VirtualizedTable<Employee>
          items={filteredEmployees}
          rowHeight={68}
          containerHeight={580}
          keyExtractor={(emp) => emp.id}
          columns={[
            { 
              header: (
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={filteredEmployees.filter(e => !isProtectedAdmin(e)).length > 0 && selectedEmpIds.size === filteredEmployees.filter(e => !isProtectedAdmin(e)).length}
                    onChange={handleToggleSelectAll}
                    className="rounded border-slate-700 bg-slate-900 text-teal-500 focus:ring-0 cursor-pointer"
                    title="انتخاب همه پرسنل"
                  />
                </div>
              ), 
              className: 'w-10 text-center' 
            },
            { header: 'اطلاعات پرسنلی و نام', className: 'w-64' },
            { header: 'کد و نام کاربری', className: 'w-44' },
            { header: 'واحد سازمانی', className: 'w-44' },
            { header: 'الگوی شایستگی متناظر', className: 'flex-1' },
            { header: 'نقش دسترسی', className: 'w-32' },
            { header: 'عملیات', className: 'w-48 text-left' },
          ]}
          renderRow={(emp) => {
            const profile = profiles.find(p => p.id === emp.profileId);
            const isProtected = isProtectedAdmin(emp);
            return (
              <div className="flex items-center w-full justify-between text-xs py-1">
                {/* Selection Checkbox */}
                <div className="w-10 text-center flex items-center justify-center shrink-0">
                  {isProtected ? (
                    <Lock className="h-3.5 w-3.5 text-amber-400" title="مدیر سیستم محافظت شده" />
                  ) : (
                    <input
                      type="checkbox"
                      checked={selectedEmpIds.has(emp.id)}
                      onChange={(e) => handleToggleSelect(emp, e)}
                      className="rounded border-slate-700 bg-slate-900 text-teal-500 focus:ring-0 cursor-pointer"
                    />
                  )}
                </div>

                {/* Name & Avatar */}
                <div className="w-64 flex items-center gap-2.5 shrink-0">
                  <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center text-xs font-bold text-teal-400 shrink-0 shadow-inner">
                    {emp.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                    {isOnline(emp.id) && (
                      <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full" title="آنلاین" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-100 truncate"><HighlightText text={emp.name} highlight={searchTerm} /></h4>
                    <span className="text-[10px] text-slate-400 truncate block"><HighlightText text={emp.unit} highlight={searchTerm} /></span>
                  </div>
                </div>

                {/* Code & Username */}
                <div className="w-44 shrink-0 font-mono text-[11px] text-slate-300">
                  <div><HighlightText text={emp.code} highlight={searchTerm} /></div>
                  <div className="text-[10px] text-teal-400 font-sans">user: {emp.username}</div>
                </div>

                {/* Unit */}
                <div className="w-44 shrink-0 text-slate-300 truncate font-medium">
                  {emp.unit}
                </div>

                {/* Profile */}
                <div className="flex-1 min-w-0 px-2">
                  <span className="text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded-lg text-[11px] font-bold truncate inline-block max-w-full">
                    {profile ? `${profile.title} (${profile.code})` : 'بدون انتساب'}
                  </span>
                </div>

                {/* Role */}
                <div className="w-32 shrink-0">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${getRoleBadgeColor(emp.role)}`}>
                    {getRoleLabel(emp.role)}
                  </span>
                </div>

                {/* Actions */}
                <div className="w-48 shrink-0 flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => onStartEvaluation(emp.id)}
                    className="bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border border-teal-500/30 px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                    title="شروع ارزیابی عملکرد"
                  >
                    <ClipboardPlus className="w-3.5 h-3.5" />
                    <span>ارزیابی</span>
                  </button>
                  <button
                    onClick={() => openForm(emp)}
                    className="p-1.5 text-slate-400 hover:text-teal-400 hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
                    title="ویرایش پرونده"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  {isProtected ? (
                    <div 
                      className="p-1.5 text-slate-500 bg-slate-800/40 rounded-lg cursor-not-allowed opacity-50 flex items-center justify-center"
                      title="حساب مدیر ارشد سیستم (Admin) محافظت‌شده و غیرقابل حذف است"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEmployeeToDelete(emp)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
                      title="حذف پرونده پرسنل"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          }}
        />
      ) : (
        /* Employees Grid List */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredEmployees.map((emp) => {
            const profile = profiles.find(p => p.id === emp.profileId);
            const isProtectedGridEmp = isProtectedAdmin(emp);
            return (
              <div 
                key={emp.id} 
                className="bg-slate-800/20 border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {/* Employee Header */}
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex items-center gap-3">
                      {!isProtectedGridEmp ? (
                        <input
                          type="checkbox"
                          checked={selectedEmpIds.has(emp.id)}
                          onChange={(e) => handleToggleSelect(emp, e)}
                          className="rounded border-slate-700 bg-slate-900 text-teal-500 focus:ring-0 cursor-pointer w-4 h-4"
                        />
                      ) : (
                        <Lock className="h-3.5 w-3.5 text-amber-400" title="مدیر سیستم محافظت شده" />
                      )}
                      <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-semibold text-teal-400">
                        {emp.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                        {isOnline(emp.id) && (
                          <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 rounded-full animate-pulse" title="آنلاین" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-100"><HighlightText text={emp.name} highlight={searchTerm} /></h3>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${getRoleBadgeColor(emp.role)}`}>
                            {getRoleLabel(emp.role)}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5"><HighlightText text={emp.code} highlight={searchTerm} /> • username: <span className="text-teal-400">{emp.username}</span></p>
                      </div>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => openForm(emp)}
                        className="p-1.5 text-slate-400 hover:text-teal-400 hover:bg-slate-800/50 rounded-lg transition-colors cursor-pointer"
                        title="ویرایش پرونده"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {isProtectedGridEmp ? (
                        <div 
                          className="p-1.5 text-slate-500 bg-slate-800/40 rounded-lg cursor-not-allowed opacity-50 flex items-center justify-center"
                          title="حساب مدیر ارشد سیستم (Admin) محافظت‌شده و غیرقابل حذف است"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEmployeeToDelete(emp)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800/50 rounded-lg transition-colors cursor-pointer"
                          title="حذف پرونده پرسنل"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <hr className="border-slate-800/60" />

                  {/* Details list */}
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
                      <span>واحد سازمانی:</span>
                      <span className="text-slate-200 font-semibold">{emp.unit}</span>
                    </div>

                    <div className="flex items-center gap-2 text-slate-400">
                      <UserCheck className="w-4 h-4 text-slate-500 shrink-0" />
                      <span>الگوی شایستگی متناظر:</span>
                      <span className="text-teal-400 font-bold">
                        {profile ? `${profile.title} (${profile.code})` : 'بدون انتساب'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Start Eval Action */}
                <div className="mt-5 pt-3 border-t border-slate-800/60">
                  <button
                    onClick={() => onStartEvaluation(emp.id)}
                    className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-300 font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <ClipboardPlus className="w-4 h-4 text-teal-400" />
                    <span>راه‌اندازی ارزیابی دوره جدید</span>
                  </button>
                </div>
              </div>
            );
          })}

          {filteredEmployees.length === 0 && (
            <div className="col-span-full py-16 text-center text-slate-500 bg-slate-800/10 rounded-2xl border border-dashed border-slate-800">
              <Users className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-base font-bold">همکاری با این مشخصات یافت نشد</p>
              <p className="text-xs mt-1">پرونده پرسنل را اضافه کنید یا فیلترهای جستجو را بازبینی کنید.</p>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
         BULK IMPORT EMPLOYEES MODAL
         ========================================================================= */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-bold text-slate-100">ورود سریع و دسته‌جمعی پرسنل به سازمان</h2>
              </div>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {bulkStatusMsg && (
              <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                bulkStatusMsg.type === 'success' 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : bulkStatusMsg.type === 'error'
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
              }`}>
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{bulkStatusMsg.text}</span>
              </div>
            )}

            {/* 1-Click Preset Roster Batches */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <Sparkles className="w-4 h-4 text-teal-400" />
                <span>درج دسته‌جمعی تیم‌های کارگاهی و ستادی پیش‌فرض (با ۱ کلیک):</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {PRESET_ROSTERS.map((roster, idx) => (
                  <div 
                    key={idx}
                    className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-teal-500/30 flex flex-col justify-between transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-200 line-clamp-1">{roster.title}</span>
                      </div>
                      <span className="text-[9px] font-mono text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded inline-block mb-1">
                        {roster.unit}
                      </span>
                      <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
                        {roster.description}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleLoadRoster(roster.members, roster.unit)}
                      className="mt-3 w-full bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/20 font-bold py-1.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>ثبت اعضای این تیم</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* XLSX File Upload */}
            <div className="space-y-2 pt-3 border-t border-slate-800">
              <label className="block text-xs font-bold text-slate-300">
                یا بارگذاری فایل Excel (XLSX) با ستون‌های جداگانه:
              </label>
              <label className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-2xl cursor-pointer transition-all text-center">
                <FileSpreadsheet className="w-5 h-5 text-cyan-400" />
                <span className="text-xs font-bold text-slate-300">انتخاب فایل Excel (.xlsx)</span>
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={handleBulkXlsxImport}
                  disabled={isBulkImporting}
                  className="hidden"
                />
              </label>
              <p className="text-[10px] text-slate-500">
                هدرهای Excel باید شامر: کد پرسنلی، نام و نام خانوادگی، واحد سازمانی، نقش، نام‌کاربری باشند
              </p>
            </div>

            {/* Custom Multi-Line Paste Box */}
            <div className="space-y-2 pt-3 border-t border-slate-800">
              <label className="block text-xs font-bold text-slate-300">
                یا چسباندن (Paste) سطرهای اکسل یا داده‌های متنی پرسنل:
              </label>
              <p className="text-[11px] text-slate-500">
                فرمت خطوط (با کاما یا تب جدا شود): <code className="text-teal-400 font-mono">کد پرسنلی, نام و نام خانوادگی, واحد سازمانی, نقش(employee/supervisor), نام‌کاربری</code>
              </p>
              <textarea
                rows={4}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="EMP-1020, مهندس آرش صادقی, سالن تراشکاری CNC, supervisor, arash&#10;EMP-1021, جناب آقای بهنام کاظمی, سالن مونتاژ ۲, employee, behnam"
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
              />
              
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleProcessBulkEmployees}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-600/20"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>ثبت پرسنل از متن</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dialog Form */}
      {isModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-edit-dialog-title"
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl text-right"
            dir="rtl"
          >
            <div className="p-5 border-b border-slate-800 flex justify-between items-center">
              <h2 id="employee-edit-dialog-title" className="text-sm font-bold text-slate-200">
                {editingId ? 'ویرایش پرونده همکار' : 'ایجاد پرونده پرسنلی جدید'}
              </h2>
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label="بستن"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">
              {errorMsg && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-300 p-3 rounded-xl text-xs">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">نام و نام خانوادگی</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: کارمند نمونه"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">کد پرسنلی</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: EMP-1011"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">واحد سازمانی / بخش کارگاه</label>
                  <input
                    type="text"
                    required
                    placeholder="مثل: سالن پرس یا کنترل ابزار"
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">الگوی شایستگی متناظر شغلی</label>
                  <select
                    value={formProfileId}
                    onChange={(e) => setFormProfileId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none focus:border-teal-500 text-right"
                  >
                    <option value="">بدون انتساب</option>
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.title} ({p.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* NEW FIELDS: Username & Role */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800/60">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">نام کاربری ورود (انگلیسی)</label>
                  <input
                    type="text"
                    placeholder="مثال: amiri یا خالی (تولید خودکار)"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">نقش و سطح دسترسی سازمانی</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none focus:border-teal-500 text-right"
                  >
                    <option value="admin">مدیر منابع انسانی (دسترسی کل)</option>
                    <option value="supervisor">سرپرست خط (ارزیابی پرسنل خط)</option>
                    <option value="employee">اپراتور کارگاه (مشاهده کارنامه و خودارزیابی)</option>
                  </select>
                </div>
              </div>

              {/* Hierarchy: Multi-stage routing */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800/60">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">سرپرست مستقیم ارزیاب (مرحله ۲)</label>
                  <select
                    value={formSupervisorId}
                    onChange={(e) => setFormSupervisorId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none focus:border-teal-500 text-right"
                  >
                    <option value="">-- بدون سرپرست مستقیم / خودکار --</option>
                    {employees.filter(e => e.id !== editingId && (e.role === 'supervisor' || e.role === 'admin')).map(sup => (
                      <option key={sup.id} value={sup.id}>{sup.name} ({sup.unit})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">ارزیاب همتا / ۳۶۰ درجه (مرحله ۳)</label>
                  <select
                    value={formPeerReviewerId}
                    onChange={(e) => setFormPeerReviewerId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none focus:border-teal-500 text-right"
                  >
                    <option value="">-- خودکار / همکار هم‌واحد --</option>
                    {employees.filter(e => e.id !== editingId).map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">نماینده کمیته کالیبراسیون (مرحله ۴)</label>
                  <select
                    value={formCalibrationLeadId}
                    onChange={(e) => setFormCalibrationLeadId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none focus:border-teal-500 text-right"
                  >
                    <option value="">-- کمیته کالیبراسیون عمومی (پیش‌فرض) --</option>
                    {employees.filter(e => e.role === 'admin' || e.role === 'supervisor').map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">تاییدکننده نهایی / مدیر ارشد HR (مرحله ۵)</label>
                  <select
                    value={formApproverId}
                    onChange={(e) => setFormApproverId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none focus:border-teal-500 text-right"
                  >
                    <option value="">-- مدیر کل منابع انسانی (پیش‌فرض) --</option>
                    {employees.filter(e => e.id !== editingId && e.role === 'admin').map(adm => (
                      <option key={adm.id} value={adm.id}>{adm.name} ({adm.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">بازبین تعیین‌شده واحد HSE (اختیاری)</label>
                  <select
                    value={formHseReviewerId}
                    onChange={(e) => setFormHseReviewerId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none focus:border-teal-500 text-right"
                  >
                    <option value="">-- بازبین HSE تعیین نشده --</option>
                    {employees.filter(e => e.id !== editingId).map(reviewer => (
                      <option key={reviewer.id} value={reviewer.id}>{reviewer.name} ({reviewer.unit} · {reviewer.role})</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] text-slate-500">بازبین می‌تواند حساب موجود با هر نقش سازمانی باشد و فقط پرونده ارجاع‌شده را می‌بیند.</p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-slate-900 rounded-xl text-xs font-bold cursor-pointer"
                >
                  ذخیره پرونده
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Universal Import / Export Modal */}
      <UniversalDataExchange<Employee>
        config={employeesExchangeConfig}
        isOpen={isExchangeModalOpen}
        onClose={() => { setIsExchangeModalOpen(false); setExternalImportRequest(null); }}
        externalImportRequest={externalImportRequest}
        theme={theme}
      />

      {/* In-App Delete Confirmation Modal (Using createPortal to ensure visibility above all containers) */}
      {employeeToDelete && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-right animate-in fade-in">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-100">تایید نهایی حذف پرونده پرسنلی</h3>
                <p className="text-[11px] text-slate-400">این عملیات بلافاصله اعمال شده و دائمی است</p>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>نام و نام خانوادگی:</span>
                <span className="font-bold text-slate-100">{employeeToDelete.name}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>کد پرسنلی:</span>
                <span className="font-mono text-teal-400">{employeeToDelete.code}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>واحد سازمانی:</span>
                <span className="text-slate-300">{employeeToDelete.unit}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>نقش کاربری:</span>
                <span className="font-bold">{getRoleLabel(employeeToDelete.role)}</span>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-300 leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>
                توجه: با حذف پرونده همکار، ارزیابی‌ها و خودارزیابی‌های وابسته به همان پرونده نیز حذف می‌شوند. سایر سوابق سازمانی بدون اقدام جداگانه حذف نخواهند شد.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setEmployeeToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition-all cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  const empName = employeeToDelete.name;
                  setIsDeleting(true);
                  setDeleteError(null);
                  try {
                    const succeeded = await onDeleteEmployee(employeeToDelete.id);
                    if (!succeeded) throw new Error('حذف پرونده انجام نشد. لطفاً اتصال و سطح دسترسی را بررسی کنید.');
                    setEmployeeToDelete(null);
                    setDeleteToast(`پرونده پرسنلی «${empName}» با موفقیت از سیستم حذف شد.`);
                    setTimeout(() => setDeleteToast(null), 3500);
                  } catch (error) {
                    setDeleteError(error instanceof Error ? error.message : 'حذف پرونده با خطا روبه‌رو شد.');
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60 transition-all cursor-pointer shadow-lg shadow-rose-600/20 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'در حال حذف…' : 'بله، حذف پرونده'}</span>
              </button>
            </div>
            {deleteError && <div role="alert" className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">{deleteError}</div>}
          </div>
        </div>,
        document.body
      )}

      {isBulkAssignOpen && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/85 p-4" dir="rtl">
          <div role="dialog" aria-modal="true" aria-label="انتساب گروهی پرسنل" className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl border border-teal-500/40 bg-slate-900 p-6 text-right shadow-2xl">
            <h3 className="text-lg font-black text-slate-100">پیش‌نمایش انتساب گروهی</h3>
            <p className="text-xs text-slate-300">{selectedEmpIds.size} پرونده انتخاب‌شده؛ فیلدهای خالی بدون تغییر می‌مانند.</p>
            <div data-testid="bulk-selection-summary" className="rounded-xl bg-slate-950 p-3 text-xs text-slate-300">
              {selectedEmpIds.size} پرونده انتخاب‌شده؛ پیش‌نمایش تغییرها، نام و کد هر پرونده را نشان می‌دهد.
            </div>
            <label className="block text-xs text-slate-300">واحد جدید<input aria-label="واحد جدید" value={bulkAssignUnit} onChange={event => setBulkAssignUnit(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-950 p-2 text-slate-100" /></label>
            <label className="block text-xs text-slate-300">سرپرست جدید<select aria-label="سرپرست جدید" value={bulkAssignSupervisor} onChange={event => setBulkAssignSupervisor(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-950 p-2 text-slate-100"><option value="">بدون تغییر</option>{employees.filter(emp => (emp.role === 'admin' || emp.role === 'supervisor') && !selectedEmpIds.has(emp.id)).map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.code})</option>)}</select></label>
            <label className="block text-xs text-slate-300">الگوی شایستگی جدید<select aria-label="الگوی شایستگی جدید" value={bulkAssignProfile} onChange={event => setBulkAssignProfile(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-950 p-2 text-slate-100"><option value="">بدون تغییر</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.title}</option>)}</select></label>
            {bulkAssignPreview && <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-100">
              <strong>پیش‌نمایش قدیم ← جدید ({bulkAssignPreviewRows?.filter(row => JSON.stringify(row.before) !== JSON.stringify(row.after)).length || 0} پرونده تغییر می‌کند)</strong>
              <VirtualizedTable<EmployeeBulkPreviewRow>
                items={bulkAssignPreviewRows || []}
                rowHeight={48}
                containerHeight={220}
                keyExtractor={row => row.id}
                columns={[{ header: 'کارمند', width: 'w-48' }, { header: 'واحد', width: 'w-32' }, { header: 'سرپرست', width: 'w-40' }, { header: 'پروفایل', width: 'w-40' }]}
                renderRow={row => <>
                  <div className="w-48 truncate text-[10px]">{row.name} · {row.code}</div>
                  <div className="w-32 truncate text-[10px]"><span className="text-slate-500">{row.before.unit || '—'}</span> ← <strong>{row.after.unit || '—'}</strong></div>
                  <div className="w-40 truncate text-[10px]"><span className="text-slate-500">{employeeNameById.get(row.before.supervisorId || '') || '—'}</span> ← <strong>{employeeNameById.get(row.after.supervisorId || '') || '—'}</strong></div>
                  <div className="w-40 truncate text-[10px]"><span className="text-slate-500">{profileTitleById.get(row.before.profileId || '') || '—'}</span> ← <strong>{profileTitleById.get(row.after.profileId || '') || '—'}</strong></div>
                </>}
              />
            </div>}
            {bulkAssignError && <p role="alert" className="text-xs text-rose-300">{bulkAssignError}</p>}
            <div className="flex justify-end gap-2"><button type="button" onClick={() => { setIsBulkAssignOpen(false); setBulkAssignPreview(null); setBulkAssignPreviewRows(null); }} className="rounded-xl bg-slate-700 px-4 py-2 text-xs text-white">انصراف</button><button type="button" onClick={bulkAssignPreview ? confirmBulkAssignment : applyBulkAssignment} className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white">{bulkAssignPreview ? 'تأیید نهایی و اعمال' : 'ساخت پیش‌نمایش'}</button></div>
          </div>
        </div>, document.body
      )}

      {/* In-App Bulk Delete Confirmation Modal (Using createPortal) */}
      {isBulkDeleteModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-right animate-in fade-in">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-100">تایید حذف گروهی پرسنل</h3>
                <p className="text-[11px] text-slate-400">حذف همزمان {selectedEmpIds.size} پرونده پرسنلی</p>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 space-y-2 text-xs max-h-48 overflow-y-auto">
              <div className="text-slate-400 font-medium mb-1">پرسنل انتخاب‌شده برای حذف:</div>
              {Array.from(selectedEmpIds).map(id => {
                const emp = employees.find(e => e.id === id);
                return (
                  <div key={id} className="flex justify-between items-center py-1 border-b border-slate-900 text-slate-200 text-xs">
                    <span>{emp?.name || id}</span>
                    <span className="font-mono text-teal-400 text-[11px]">{emp?.code}</span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-300 leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>
                فقط پرونده‌های پرسنلی مجاز حذف می‌شوند؛ کارکنان دارای سابقه ارزیابی، پرونده باز یا رابطه سازمانی محافظت می‌شوند. حذف پرونده پرسنلی غیرقابل بازگشت است.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition-all cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDelete}
                disabled={isDeleting}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all cursor-pointer shadow-lg shadow-rose-600/20 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تایید و حذف گروهی ({selectedEmpIds.size} نفر)</span>
              </button>
            </div>
            {deleteError && <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">{deleteError}</div>}
          </div>
        </div>,
        document.body
      )}

      {/* Floating Success Toast */}
      {deleteToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-teal-500 text-slate-950 font-bold px-4 py-2.5 rounded-2xl shadow-xl border border-teal-400 flex items-center gap-2 animate-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-4 h-4 text-slate-950" />
          <span className="text-xs">{deleteToast}</span>
        </div>
      )}
    </div>
  );
}



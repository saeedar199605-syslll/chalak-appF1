import SearchInput from './ui/SearchInput';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  RefreshCw,
  Layers,
  Database,
  Users,
  ShieldCheck,
  ArrowLeft,
  Sparkles,
  Info,
  Check,
  X,
  Plus,
  Trash2,
  Edit3,
  SlidersHorizontal,
  Search,
  Filter,
  Lock,
  Unlock,
  Eye,
  Settings2,
  Save,
  RotateCcw,
  Gauge
} from 'lucide-react';
import {
  Employee,
  Evaluation,
  Criterion,
  JobProfile,
  KasraAttendanceRecord,
  MISProductionRecord,
  DynamicColumnMapping,
  DynamicExcelRowRecord
  ,DEFAULT_ROUTE_RULES
} from '../types';
import { resolveInitialEvaluationWorkflow } from '../utils/evaluationStart';
import ProductionCycleTimeCalculator from './ProductionCycleTimeCalculator';
import {
  downloadKasraExcelTemplate,
  downloadMISExcelTemplate,
  downloadDynamicCriteriaExcelTemplate,
  parseKasraExcelFile,
  parseMISExcelFile,
  parseUniversalExcelFile,
  recalculateDynamicRows,
  calculateKasraScore,
  calculateMISScore,
  type MISImportIssue
} from '../utils/excelImportExport';
import { db, CURRENT_ACTIVE_PERIOD } from '../utils/db';
import type { ProtectedSourceImportContext } from '../utils/sourceImports';
import { canonicalEvaluationPeriodId, getEvaluationPeriodId } from '../utils/evaluationPeriod';
import { canImport, readGranularPermissionPolicy } from '../utils/authorization';
import { buildKasraPreviewRows, countKasraPreview, type KasraPreviewRow } from '../utils/kasraImport';
import { matchesPersonnelCode, normalizePersonnelCode, normalizeSearchText } from '../utils/personnelSearch';

interface ExcelIntegrationCenterProps {
  isOpen: boolean;
  embedded?: boolean;
  onClose: () => void;
  employees: Employee[];
  profiles: JobProfile[];
  criteria: Criterion[];
  evaluations: Evaluation[];
  onUpdateEvaluations: (evals: Evaluation[], sourceImport?: ProtectedSourceImportContext) => boolean | Promise<boolean> | void;
  onAddEvaluation: (empId: string, period: string) => void;
  currentUser?: Employee | null;
}

export default function ExcelIntegrationCenter({
  isOpen,
  embedded = false,
  onClose,
  employees,
  profiles,
  criteria,
  evaluations,
  onUpdateEvaluations,
  onAddEvaluation,
  currentUser
}: ExcelIntegrationCenterProps) {
  const [activeTab, setActiveTab] = useState<'dynamic' | 'kasra' | 'mis' | 'production_calc' | 'builder'>('dynamic');
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Admin status
  const isAdmin = currentUser?.role === 'admin' || currentUser?.username === 'admin' || currentUser?.name?.includes('مدیریت');
  const [isManualEditEnabled, setIsManualEditEnabled] = useState(false);
  const [selectedKasraPeriodId, setSelectedKasraPeriodId] = useState(() => canonicalEvaluationPeriodId(db.getMiscData<string>('pe_active_period', '')));
  const [isKasraConfirmOpen, setIsKasraConfirmOpen] = useState(false);
  const [isKasraApplying, setIsKasraApplying] = useState(false);
  const [kasraApplySummary, setKasraApplySummary] = useState<{ rowsRead: number; employeesMatched: number; evaluationsUpdated: number; scoresUpdated: number; skipped: number; invalid: number; failed: number } | null>(null);

  // Dynamic Import State
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[][]>([]);
  const [columnMappings, setColumnMappings] = useState<DynamicColumnMapping[]>([]);
  const [dynamicRecords, setDynamicRecords] = useState<DynamicExcelRowRecord[]>([]);
  const [dynamicWarnings, setDynamicWarnings] = useState<string[]>([]);
  const [dynamicMatchedCount, setDynamicMatchedCount] = useState<number>(0);
  const [showMappingConfig, setShowMappingConfig] = useState(false);

  // Validation Report State
  const [validationSummary, setValidationSummary] = useState<{
    source: string;
    totalProcessed: number;
    newEvaluations: number;
    updatedEvaluations: number;
    slotsPopulated: number;
    warnings: string[];
  } | null>(null);
  const [showValidationWarnings, setShowValidationWarnings] = useState(false);

  // Kasra & MIS Direct State (Legacy support)
  const [kasraRecords, setKasraRecords] = useState<KasraAttendanceRecord[]>([]);
  const [misRecords, setMisRecords] = useState<MISProductionRecord[]>([]);
  const [kasraErrors, setKasraErrors] = useState<string[]>([]);
  const [misErrors, setMisErrors] = useState<string[]>([]);
  const [misIssues, setMisIssues] = useState<MISImportIssue[]>([]);
  const [misCounts, setMisCounts] = useState({ valid: 0, invalid: 0, duplicate: 0, unknown: 0, missingMapping: 0, warning: 0 });
  const [misExpectedPeriod, setMisExpectedPeriod] = useState(() => db.getMiscData<string>('pe_active_period', '').trim());
  const [isMisConfirmOpen, setIsMisConfirmOpen] = useState(false);
  const activePeriodLabel = db.getMiscData<string>('pe_active_period', '').trim();
  const periodOptions = useMemo(() => {
    const byId = new Map<string, string>();
    evaluations.forEach(evaluation => {
      const id = getEvaluationPeriodId(evaluation);
      if (id && !byId.has(id)) byId.set(id, evaluation.period);
    });
    if (activePeriodLabel) {
      const id = canonicalEvaluationPeriodId(activePeriodLabel);
      if (!byId.has(id)) byId.set(id, activePeriodLabel);
    }
    return Array.from(byId, ([id, label]) => ({ id, label }));
  }, [evaluations, activePeriodLabel]);
  const selectedKasraPeriod = periodOptions.find(period => period.id === selectedKasraPeriodId);
  const kasraImportAllowed = Boolean(currentUser && canImport(currentUser, 'kasra', undefined, readGranularPermissionPolicy()).allowed);
  const misImportAllowed = Boolean(currentUser && canImport(currentUser, 'mis', undefined, readGranularPermissionPolicy()).allowed);
  const kasraPreviewRows: KasraPreviewRow[] = useMemo(() => buildKasraPreviewRows({
    records: kasraRecords,
    selectedPeriodId: selectedKasraPeriodId,
    employees,
    profiles,
    criteria,
    evaluations,
    actor: currentUser,
    policy: readGranularPermissionPolicy(),
  }), [kasraRecords, selectedKasraPeriodId, employees, profiles, criteria, evaluations, currentUser]);
  const kasraCounts = useMemo(() => countKasraPreview(kasraPreviewRows), [kasraPreviewRows]);
  const filteredKasraPreviewRows = useMemo(() => {
    const query = normalizeSearchText(searchTerm);
    if (!query) return kasraPreviewRows;
    return kasraPreviewRows.filter(row => matchesPersonnelCode(row.record.empCode, query) ||
      normalizeSearchText(row.employee?.name || row.record.empName || '').includes(query));
  }, [kasraPreviewRows, searchTerm]);
  const filteredMisRecords = useMemo(() => {
    const query = normalizeSearchText(searchTerm);
    if (!query) return misRecords;
    return misRecords.filter(record => matchesPersonnelCode(record.empCode, query) || normalizeSearchText(record.empName).includes(query));
  }, [misRecords, searchTerm]);

  // Template Builder State
  const [builderPeriod, setBuilderPeriod] = useState('نیمه اول ۱۴۰۵');
  const [builderProfileId, setBuilderProfileId] = useState('all');
  const [builderUnit, setBuilderUnit] = useState('all');
  const [builderIncludeDocs, setBuilderIncludeDocs] = useState(true);
  const [builderSelectedCriteria, setBuilderSelectedCriteria] = useState<string[]>(() => criteria.map(c => c.id));
  const [builderCategoryFilter, setBuilderCategoryFilter] = useState<'ALL' | 'K' | 'Q' | 'B' | 'S' | 'L'>('ALL');

  // File Inputs
  const dynamicFileInputRef = useRef<HTMLInputElement>(null);
  const kasraFileInputRef = useRef<HTMLInputElement>(null);
  const misFileInputRef = useRef<HTMLInputElement>(null);

  // Sync criteria when criteria prop changes
  useEffect(() => {
    if (builderSelectedCriteria.length === 0 && criteria.length > 0) {
      setBuilderSelectedCriteria(criteria.map(c => c.id));
    }
  }, [criteria]);

  useEffect(() => {
    if (selectedKasraPeriodId && periodOptions.some(period => period.id === selectedKasraPeriodId)) return;
    const activeId = canonicalEvaluationPeriodId(activePeriodLabel);
    setSelectedKasraPeriodId(periodOptions.some(period => period.id === activeId) ? activeId : periodOptions[0]?.id || '');
  }, [periodOptions, selectedKasraPeriodId, activePeriodLabel]);

  // Log audit helper
  const logAudit = (action: string, details: string, type: 'info' | 'warning' | 'success' | 'danger' = 'info') => {
    try {
      const logs = JSON.parse(localStorage.getItem('pe_system_logs') || '[]');
      const newLog = {
        id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        timestamp: new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date()),
        operator: currentUser ? `${currentUser.name} (${currentUser.role})` : 'مدیر سیستم',
        action,
        details,
        type
      };
      db.saveMiscData('pe_system_logs', [newLog, ...logs.slice(0, 199)]);
    } catch {
      // Ignore
    }
  };

  // --- 1. DYNAMIC UNIVERSAL EXCEL UPLOAD ---
  const handleDynamicFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setErrorMessage('');
    setSuccessMessage('');
    setDynamicWarnings([]);

    try {
      const result = await parseUniversalExcelFile(file, employees, criteria);
      setRawHeaders(result.headers);
      setRawRows(result.rawRows);
      setColumnMappings(result.suggestedMappings);

      // Immediately calculate rows in real-time
      const calculated = recalculateDynamicRows({
        rawRows: result.rawRows,
        headers: result.headers,
        mappings: result.suggestedMappings,
        employees,
        criteria,
        profiles
      });

      setDynamicRecords(calculated.records);
      setDynamicMatchedCount(calculated.matchedEmployeesCount);
      setDynamicWarnings(calculated.warnings);
      setSuccessMessage(`فایل اکسل با موفقیت بارگذاری شد: ${calculated.records.length} ردیف داده تحلیل گردید (${calculated.matchedEmployeesCount} پرسنل تطبیق یافت).`);
      setShowMappingConfig(false);

      logAudit('بارگذاری فایل اکسل داینامیک', `تحلیل فایل «${file.name}» با ${result.rawRows.length} ردیف`, 'info');
    } catch (err: any) {
      setErrorMessage(err.message || 'خطا در تحلیل فایل اکسل داینامیک');
    } finally {
      setIsProcessing(false);
      if (dynamicFileInputRef.current) dynamicFileInputRef.current.value = '';
    }
  };

  // --- 2. COLUMN MAPPING CHANGE (REAL-TIME RECALCULATION) ---
  const handleUpdateColumnMapping = (colName: string, updated: Partial<DynamicColumnMapping>) => {
    const nextMappings = columnMappings.map(m => {
      if (m.excelColumn === colName) {
        return { ...m, ...updated };
      }
      return m;
    });

    setColumnMappings(nextMappings);

    // Instant real-time recalculation of rows
    const calculated = recalculateDynamicRows({
      rawRows,
      headers: rawHeaders,
      mappings: nextMappings,
      employees,
      criteria,
      profiles
    });

    setDynamicRecords(calculated.records);
    setDynamicMatchedCount(calculated.matchedEmployeesCount);
    setDynamicWarnings(calculated.warnings);
  };

  // --- 3. MANUAL EDIT HANDLERS (ADMIN ONLY) ---
  const handleAdminScoreEdit = (recordId: string, criterionId: string, newScore: number) => {
    if (!isAdmin) {
      alert('فقط مدیر ارشد سیستم مجاز به ویرایش دستی مقادیر است.');
      return;
    }

    const boundScore = Math.max(1, Math.min(5, Number(newScore) || 1));

    setDynamicRecords(prev => prev.map(rec => {
      if (rec.id === recordId) {
        return {
          ...rec,
          scores: { ...rec.scores, [criterionId]: boundScore },
          isModifiedManually: true
        };
      }
      return rec;
    }));

    logAudit('ویرایش دستی نمره شاخص توسط ادمین', `تغییر نمره شاخص ${criterionId} برای رکورد ${recordId} به ${boundScore}`, 'warning');
  };

  const handleAdminDocEdit = (recordId: string, criterionId: string, newDoc: string) => {
    if (!isAdmin) return;

    setDynamicRecords(prev => prev.map(rec => {
      if (rec.id === recordId) {
        return {
          ...rec,
          docs: { ...rec.docs, [criterionId]: newDoc },
          isModifiedManually: true
        };
      }
      return rec;
    }));
  };

  const handleAdminNoteEdit = (recordId: string, newNote: string) => {
    if (!isAdmin) return;

    setDynamicRecords(prev => prev.map(rec => {
      if (rec.id === recordId) {
        return {
          ...rec,
          overallNote: newNote,
          isModifiedManually: true
        };
      }
      return rec;
    }));
  };

  const handleAdminDeleteRow = (recordId: string) => {
    if (!isAdmin) return;
    setDynamicRecords(prev => prev.filter(r => r.id !== recordId));
    logAudit('حذف ردیف اکسل توسط ادمین', `حذف رکورد ${recordId} از جدول ورود داده اکسل`, 'warning');
  };

  const handleAdminResetToOriginal = () => {
    if (!isAdmin) return;
    const calculated = recalculateDynamicRows({
      rawRows,
      headers: rawHeaders,
      mappings: columnMappings,
      employees,
      criteria,
      profiles
    });
    setDynamicRecords(calculated.records);
    setSuccessMessage('تمام ویرایش‌های دستی لغو و مقادیر به داده‌های اولیه فایل اکسل بازگردانی شدند.');
  };

  // --- 4. APPLY DYNAMIC RECORDS TO EVALUATIONS (LIVE SYNC & VALIDATION LAYER) ---
  const handleApplyDynamicRecords = () => {
    if (dynamicRecords.length === 0) {
      alert('هیچ داده‌ای برای ثبت موجود نیست.');
      return;
    }

    let updatedEvaluations = [...evaluations];
    let updatedEvalsCount = 0;
    let newEvalsCount = 0;
    let slotsPopulated = 0;
    const warnings: string[] = [];

    dynamicRecords.forEach((rec, idx) => {
      const rowNum = idx + 1;
      // 1. Resolve Employee by code, username, or name
      const emp = employees.find(
        e => (rec.empCode && e.code.toUpperCase() === rec.empCode.toUpperCase()) ||
             (rec.empCode && e.username.toLowerCase() === rec.empCode.toLowerCase()) ||
             (rec.empName && e.name.trim() === rec.empName.trim()) ||
             (rec.empName && e.name.includes(rec.empName.trim()))
      );

      if (!emp) {
        warnings.push(`ردیف ${rowNum}: پرسنل با کد «${rec.empCode || 'نامشخص'}» و نام «${rec.empName || 'نامشخص'}» در فهرست پرسنل یافت نشد و نادیده گرفته شد.`);
        return;
      }

      // 2. Resolve Job Profile
      let prof = profiles.find(p => p.id === emp.profileId);
      if (!prof) {
        prof = profiles[0];
        if (prof) {
          warnings.push(`ردیف ${rowNum} (${emp.name}): فاقد رده شغلی مشخص بود؛ الگوی پیش‌فرض «${prof.title}» اعمال شد.`);
        }
      }

      if (!prof || !prof.items || prof.items.length === 0) {
        warnings.push(`ردیف ${rowNum} (${emp.name}): هیچ شاخصی برای رده شغلی این پرسنل تعریف نشده است.`);
        return;
      }

      const evalPeriod = rec.period || CURRENT_ACTIVE_PERIOD;
      let targetIndex = updatedEvaluations.findIndex(
        ev => ev.empId === emp.id && ev.period === evalPeriod
      );

      if (targetIndex === -1) {
        // Create new evaluation shell with full schema mapping
        const initialScores = prof.items.map(item => {
          const critItem = criteria.find(c => c.id === item.cid || c.code === item.cid);
          
          let importedScore = rec.scores[item.cid];
          if (importedScore === undefined && critItem) {
            importedScore = rec.scores[critItem.id] ?? rec.scores[critItem.code];
          }
          let importedDoc = rec.docs[item.cid];
          if (!importedDoc && critItem) {
            importedDoc = rec.docs[critItem.id] || rec.docs[critItem.code] || '';
          }

          let scoreVal = 0;
          if (importedScore !== undefined) {
            const num = Number(importedScore);
            if (!isNaN(num)) {
              scoreVal = Math.max(0, Math.min(5, Math.round(num * 10) / 10));
              slotsPopulated++;
            } else {
              warnings.push(`ردیف ${rowNum} (${emp.name}): مقدار نمره برای شاخص «${critItem?.name || item.cid}» غیرعددی است.`);
            }
          }

          return {
            cid: item.cid,
            weight: item.weight,
            value: scoreVal,
            self: 0,
            doc: importedDoc || ''
          };
        });

        const initialWorkflow = resolveInitialEvaluationWorkflow(emp, employees, db.getMiscData('pe_route_rules', DEFAULT_ROUTE_RULES), prof.id);
        const newEval: Evaluation = {
          id: `eval-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          empId: emp.id,
          profileId: prof.id,
          period: evalPeriod,
          status: 'draft',
          ...initialWorkflow,
          scores: initialScores,
          note: rec.overallNote || '',
          created: Date.now()
        };

        updatedEvaluations.push(newEval);
        newEvalsCount++;
      } else {
        // Update existing evaluation while validating and completing schema
        const currentEval = updatedEvaluations[targetIndex];
        const existingScoreMap = new Map(currentEval.scores.map(s => [s.cid, s]));

        // Ensure all profile items are present
        const validatedScores = prof.items.map(item => {
          const critItem = criteria.find(c => c.id === item.cid || c.code === item.cid);
          const existingScore = existingScoreMap.get(item.cid);

          let importedScore = rec.scores[item.cid];
          if (importedScore === undefined && critItem) {
            importedScore = rec.scores[critItem.id] ?? rec.scores[critItem.code];
          }
          let importedDoc = rec.docs[item.cid];
          if (!importedDoc && critItem) {
            importedDoc = rec.docs[critItem.id] || rec.docs[critItem.code] || '';
          }

          if (importedScore !== undefined) {
            const num = Number(importedScore);
            if (!isNaN(num)) {
              const scoreVal = Math.max(0, Math.min(5, Math.round(num * 10) / 10));
              slotsPopulated++;
              return {
                cid: item.cid,
                weight: item.weight,
                value: scoreVal,
                self: existingScore ? existingScore.self : 0,
                doc: importedDoc || existingScore?.doc || ''
              };
            } else {
              warnings.push(`ردیف ${rowNum} (${emp.name}): نمره «${importedScore}» غیرعددی است و تغییر نیافت.`);
            }
          }

          return existingScore ? { ...existingScore, weight: item.weight } : {
            cid: item.cid,
            weight: item.weight,
            value: 0,
            self: 0,
            doc: ''
          };
        });

        updatedEvaluations[targetIndex] = {
          ...currentEval,
          profileId: prof.id,
          scores: validatedScores,
          note: rec.overallNote 
            ? (currentEval.note ? `${currentEval.note}\n${rec.overallNote}` : rec.overallNote)
            : currentEval.note
        };
        updatedEvalsCount++;
      }
    });

    // Multi-layer immediate persistence
    db.saveEvaluations(updatedEvaluations);
    onUpdateEvaluations(updatedEvaluations);

    // Validation Report
    const totalProcessed = newEvalsCount + updatedEvalsCount;
    setValidationSummary({
      source: 'ماتریس شاخص‌های داینامیک اکسل',
      totalProcessed,
      newEvaluations: newEvalsCount,
      updatedEvaluations: updatedEvalsCount,
      slotsPopulated,
      warnings
    });

    setSuccessMessage(`داده‌ها با موفقیت و به صورت در لحظه اعتبارسنجی و ذخیره شدند (${newEvalsCount} ارزیابی جدید، ${updatedEvalsCount} ارزیابی به‌روزرسانی‌شده، ${slotsPopulated} اسلات نمره تکمیل گردید).`);

    logAudit(
      'اعمال نمرات اکسل داینامیک بر ارزیابی‌ها',
      `ثبت موفق ${slotsPopulated} اسلات نمره برای ${totalProcessed} پرسنل در دوره`,
      'success'
    );
  };

  // --- 5. KASRA FILE UPLOAD ---

  const handleKasraFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!kasraImportAllowed) {
      setErrorMessage('برای درون‌ریزی کسری مجوز جداگانه ندارید.');
      return;
    }
    if (!selectedKasraPeriodId) {
      setErrorMessage('ابتدا دوره ارزیابی را انتخاب کنید.');
      return;
    }
    setIsProcessing(true);
    setErrorMessage('');
    setSuccessMessage('');
    setKasraErrors([]);
    setKasraApplySummary(null);
    try {
      const result = await parseKasraExcelFile(file, employees);
      setKasraRecords(result.records);
      setKasraErrors(result.errors);
      setSuccessMessage(`فایل کسری خوانده شد: ${result.records.length} ردیف؛ دوره انتخاب‌شده: ${selectedKasraPeriod?.label || selectedKasraPeriodId}. هنوز تغییری ذخیره نشده است.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'خطا در پردازش فایل کسری');
    } finally {
      setIsProcessing(false);
      if (kasraFileInputRef.current) kasraFileInputRef.current.value = '';
    }
  };

  const handleApplyKasraRecords = async () => {
    if (isKasraApplying || !selectedKasraPeriodId) return;
    const validRows = kasraPreviewRows.filter(row => row.status === 'valid' && row.updatedEvaluation);
    if (!validRows.length) return;
    const updates = new Map(validRows.map(row => [row.updatedEvaluation!.id, row.updatedEvaluation!]));
    const updatedEvaluations = evaluations.map(evaluation => updates.get(evaluation.id) || evaluation);
    const sourceImport: ProtectedSourceImportContext = {
      importType: 'KASRA',
      operationId: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `kasra-${Date.now()}`,
      evaluationPeriodId: selectedKasraPeriodId,
    };
    setIsKasraApplying(true);
    setErrorMessage('');
    try {
      const accepted = await onUpdateEvaluations(updatedEvaluations, sourceImport);
      if (accepted !== true) {
        setErrorMessage('سرور ذخیره کسری را تأیید نکرد؛ تغییر در ارزیابی‌ها ثبت نشد. بررسی کنید مجوز و اتصال برقرار باشد.');
        return;
      }
      const scoresUpdated = validRows.reduce((total, row) => total + row.changedScores.length, 0);
      setKasraApplySummary({
        rowsRead: kasraPreviewRows.length,
        employeesMatched: new Set(validRows.map(row => row.employee?.id).filter(Boolean)).size,
        evaluationsUpdated: updates.size,
        scoresUpdated,
        skipped: kasraCounts.invalid,
        invalid: kasraCounts.invalid,
        failed: 0,
      });
      setValidationSummary({
        source: 'سامانه حضور و غیاب کسری',
        totalProcessed: updates.size,
        newEvaluations: 0,
        updatedEvaluations: updates.size,
        slotsPopulated: scoresUpdated,
        warnings: kasraPreviewRows.filter(row => row.status !== 'valid').map(row => `ردیف ${row.rowNumber}: ${row.issue || row.status}`),
      });
      setIsKasraConfirmOpen(false);
      setSuccessMessage(`درون‌ریزی کسری ذخیره شد: ${kasraPreviewRows.length} ردیف خوانده‌شده، ${updates.size} ارزیابی موجود به‌روزرسانی‌شده، ${scoresUpdated} نمره و یک ذخیره ابری.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'ذخیره درون‌ریزی کسری ناموفق بود.');
    } finally {
      setIsKasraApplying(false);
    }
  };

  // --- 6. MIS FILE UPLOAD (LEGACY DIRECT) ---
  const handleMISFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setErrorMessage('');
    setSuccessMessage('');
    setMisErrors([]);

    try {
      const selectedPeriod = db.getMiscData<string>('pe_active_period', '').trim();
      setMisExpectedPeriod(selectedPeriod);
      if (!selectedPeriod) {
        setErrorMessage('دوره ارزیابی فعالی وجود ندارد. ابتدا از بخش دوره‌ها یک دوره را فعال کنید.');
        setMisRecords([]);
        setMisIssues([]);
        setMisCounts({ valid: 0, invalid: 0, duplicate: 0, unknown: 0, missingMapping: 0, warning: 0 });
        return;
      }
      const result = await parseMISExcelFile(file, employees, selectedPeriod);
      setMisRecords(result.records);
      setMisErrors(result.errors);
      setMisIssues(result.issues);
      setMisCounts({ valid: result.validCount, invalid: result.invalidCount, duplicate: result.duplicateCount, unknown: result.unknownEmployeeCount, missingMapping: result.missingMappingCount, warning: 0 });
      setSuccessMessage(`دوره: ${selectedPeriod} · معتبر: ${result.validCount} · نامعتبر: ${result.invalidCount} · تکراری: ${result.duplicateCount} · کد ناشناخته: ${result.unknownEmployeeCount} · نگاشت ناقص: ${result.missingMappingCount}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'خطا در پردازش فایل MIS');
    } finally {
      setIsProcessing(false);
      if (misFileInputRef.current) misFileInputRef.current.value = '';
    }
  };

  const handleApplyMISRecords = async () => {
    if (misRecords.length === 0 || !currentUser || !misImportAllowed) return;
    const currentlyActivePeriod = db.getMiscData<string>('pe_active_period', '').trim();
    if (!currentlyActivePeriod || misRecords.some(record => record.period !== currentlyActivePeriod)) {
      setErrorMessage('دوره فعال پس از پیش‌نمایش تغییر کرده است. فایل را با دوره فعال تازه دوباره اعتبارسنجی کنید.');
      setIsMisConfirmOpen(false);
      setMisRecords([]);
      return;
    }
    const selectedPeriodId = canonicalEvaluationPeriodId(currentlyActivePeriod);

    let updatedEvaluations = [...evaluations];
    let updatedEvalsCount = 0;
    let newEvalsCount = 0;
    let slotsPopulated = 0;
    const warnings: string[] = [];

    misRecords.forEach((rec, idx) => {
      const rowNum = idx + 1;
      const emp = employees.find(e => rec.empCode && normalizePersonnelCode(e.code) === normalizePersonnelCode(rec.empCode));

      if (!emp) {
        warnings.push(`ردیف ${rowNum}: پرسنل با کد «${rec.empCode || 'نامشخص'}» و نام «${rec.empName || 'نامشخص'}» یافت نشد.`);
        return;
      }

      if (!canImport(currentUser, 'mis', emp, readGranularPermissionPolicy()).allowed) {
        warnings.push(`ردیف ${rowNum}: مجوز MIS برای محدوده این کارمند وجود ندارد.`);
        return;
      }

      const evalPeriod = rec.period;
      let targetIndex = updatedEvaluations.findIndex(
        ev => ev.empId === emp.id && getEvaluationPeriodId(ev) === selectedPeriodId
      );
      if (targetIndex === -1) {
        warnings.push(`ردیف ${rowNum} (${emp.name}): ارزیابی دوره ${evalPeriod} شروع نشده است؛ ابتدا از عملیات شروع دوره، پرونده واجد شرایط را ایجاد کنید.`);
        return;
      }
      const targetEval = updatedEvaluations[targetIndex];
      const prof = profiles.find(p => p.id === targetEval.profileId);
      if (!prof?.items?.length) {
        warnings.push(`ردیف ${rowNum} (${emp.name}): پروفایل ارزیابی موجود شاخصی ندارد یا پیدا نشد.`);
        return;
      }

      // Helper function to calculate precise score from MIS record based on misMetricKey
      const computeScoreForMisCriterion = (crit: Criterion) => {
        let scoreVal = 0;
        let docVal = '';
        let rawVal: number = 0;

        if (crit.misMetricKey === 'efficiency') {
          rawVal = Number(rec.efficiencyRate) || 0;
          if (rawVal >= 104) scoreVal = 5;
          else if (rawVal >= 99) scoreVal = 4;
          else if (rawVal >= 92) scoreVal = 3;
          else if (rawVal >= 80) scoreVal = 2;
          else scoreVal = 1;
          docVal = `داده خودکار MIS: درصد راندمان خط ${rawVal}٪ (هدف: ۱۰۰٪)`;
        } else if (crit.misMetricKey === 'scrap_rate') {
          rawVal = Number(rec.scrapRate) || 0;
          if (rawVal <= 1.1) scoreVal = 5;
          else if (rawVal <= 2.0) scoreVal = 4;
          else if (rawVal <= 3.2) scoreVal = 3;
          else if (rawVal <= 5.0) scoreVal = 2;
          else scoreVal = 1;
          docVal = `داده خودکار MIS: نرخ ضایعات ${rawVal}٪ (سقف مجاز: ۲٪)`;
        } else if (crit.misMetricKey === 'quality_score') {
          rawVal = Number(rec.qualityScore) || 0;
          if (rawVal >= 98) scoreVal = 5;
          else if (rawVal >= 95) scoreVal = 4;
          else if (rawVal >= 90) scoreVal = 3;
          else if (rawVal >= 85) scoreVal = 2;
          else scoreVal = 1;
          docVal = `داده خودکار MIS: آزمون کیفی QC به میزان ${rawVal}٪`;
        } else if (crit.misMetricKey === 'output_qty') {
          const produced = Number(rec.producedUnits);
          const target = Number(rec.targetUnits);
          const ratio = target > 0 ? (produced / target) : 1;
          if (ratio >= 1.04) scoreVal = 5;
          else if (ratio >= 0.98) scoreVal = 4;
          else if (ratio >= 0.90) scoreVal = 3;
          else if (ratio >= 0.80) scoreVal = 2;
          else scoreVal = 1;
          rawVal = ratio;
          docVal = `داده خودکار MIS: تیراژ تولید واقعی ${produced} قطعه (برنامه مصوب: ${target})`;
        } else if (crit.misMetricKey === 'downtime') {
          rawVal = Number(rec.downtimeHours) || 0;
          if (rawVal <= 2) scoreVal = 5;
          else if (rawVal <= 4) scoreVal = 4;
          else if (rawVal <= 6) scoreVal = 3;
          else if (rawVal <= 9) scoreVal = 2;
          else scoreVal = 1;
          docVal = `داده خودکار MIS: توقفات فنی دستگاه ${rawVal} ساعت`;
        } else {
          scoreVal = Math.max(0, Math.min(5, Math.round(Number(rec.calculatedKpiScore) * 10) / 10));
          rawVal = Number(rec.calculatedKpiScore);
          docVal = `داده خودکار MIS: راندمان ${rec.efficiencyRate}٪ | ضایعات ${rec.scrapRate}٪ | کیفیت ${rec.qualityScore}٪`;
        }

        return { scoreVal, docVal, rawVal };
      };

      {
        const profileCriterionIds = new Set(prof.items.map(item => item.cid));
        const updatedScores = targetEval.scores.map(existingScore => {
          const criterion = criteria.find(item => item.id === existingScore.cid || item.code === existingScore.cid);
          if (!profileCriterionIds.has(existingScore.cid) || criterion?.scoringSource !== 'mis' || criterion.autoPopulate === false) return existingScore;
          const computed = computeScoreForMisCriterion(criterion);
          slotsPopulated++;
          return {
            ...existingScore,
            value: computed.scoreVal,
            doc: computed.docVal,
            sourceType: 'mis' as const,
            autoPopulated: true,
            rawMetricValue: computed.rawVal,
            rawMetricLabel: criterion.misMetricKey === 'output_qty' ? 'output_qty_ratio' :
              ['efficiency', 'scrap_rate', 'quality_score', 'downtime'].includes(criterion.misMetricKey || '') ? criterion.misMetricKey! : 'mis_composite_score',
          };
        });

        updatedEvaluations[targetIndex] = {
          ...targetEval,
          scores: updatedScores
        };
        updatedEvalsCount++;
      }
    });

    const totalProcessed = newEvalsCount + updatedEvalsCount;
    if (!totalProcessed || !slotsPopulated) {
      setErrorMessage('هیچ معیار MIS معتبر در ارزیابی‌های موجود برای این فایل پیدا نشد.');
      return;
    }
    setIsProcessing(true);
    const sourceImport: ProtectedSourceImportContext = {
      importType: 'MIS',
      operationId: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `mis-${Date.now()}`,
      evaluationPeriodId: selectedPeriodId,
    };
    const accepted = await onUpdateEvaluations(updatedEvaluations, sourceImport);
    setIsProcessing(false);
    if (accepted !== true) {
      setErrorMessage('سرور ذخیره MIS را تأیید نکرد؛ تغییر در ارزیابی‌ها ثبت نشد. بررسی کنید مجوز و اتصال برقرار باشد.');
      return;
    }
    setValidationSummary({
      source: 'سامانه تولید و کیفیت MIS',
      totalProcessed,
      newEvaluations: newEvalsCount,
      updatedEvaluations: updatedEvalsCount,
      slotsPopulated,
      warnings
    });

    setSuccessMessage(`داده‌های تولید و کیفیت MIS با موفقیت در شاخص‌های تولیدی ${totalProcessed} پرونده ارزیابی نشست و پایدار شد (${slotsPopulated} اسلات نمره). معیارهای دستی سرپرست بدون تغییر محافظت شدند.`);
    setIsMisConfirmOpen(false);
  };

  // Filtered Dynamic Records for table
  const filteredDynamicRecords = useMemo(() => {
    if (!searchTerm.trim()) return dynamicRecords;
    const term = normalizeSearchText(searchTerm);
    return dynamicRecords.filter(r =>
      matchesPersonnelCode(r.empCode, term) ||
      (r.empName && normalizeSearchText(r.empName).includes(term)) ||
      (r.jobTitle && normalizeSearchText(r.jobTitle).includes(term)) ||
      (r.unit && normalizeSearchText(r.unit).includes(term))
    );
  }, [dynamicRecords, searchTerm]);

  // Dynamic columns list for display
  const dynamicCriterionColumns = useMemo(() => {
    const critIds = new Set<string>();
    columnMappings.forEach(m => {
      if (m.targetType === 'criterion' && m.targetCriterionId) {
        critIds.add(m.targetCriterionId);
      }
    });
    return criteria.filter(c => critIds.has(c.id));
  }, [columnMappings, criteria]);

  // Unique units for builder
  const availableUnits = useMemo(() => {
    const set = new Set<string>();
    employees.forEach(e => { if (e.unit) set.add(e.unit); });
    return Array.from(set);
  }, [employees]);

  if (!isOpen) return null;

  return (
    <div className={embedded ? "w-full" : "fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in"} dir="rtl">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-6xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        
        {/* MODAL HEADER */}
        <div className="px-6 py-4.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black text-slate-100">مرکز هوشمند یکپارچه‌سازی و ورود داده از اکسل (Excel Sync Engine)</h1>
                <span className="text-[10px] bg-teal-500/20 text-teal-300 font-mono font-bold px-2.5 py-0.5 rounded-full border border-teal-500/30">
                  Dynamic Real-Time Sync
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                ورود داینامیک بر اساس بانک شاخص‌ها، نگاشت خودکار ستون‌ها، آپدیت در لحظه و کنترل دسترسی ویرایش ادمین
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Admin Badge */}
            {isAdmin ? (
              <div className="hidden sm:flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 px-3 py-1 rounded-xl text-xs font-bold">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>دسترسی مدیر ارشد (امکان ویرایش دستی فعال)</span>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-1.5 bg-slate-800 text-slate-400 px-3 py-1 rounded-xl text-xs">
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span>مشاهده داده‌ها (ویرایش دستی مخصوص ادمین)</span>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="px-6 pt-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between shrink-0 overflow-x-auto">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('dynamic')}
              className={`py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'dynamic'
                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>ورود داینامیک شاخص‌ها (ماتریس هوشمند)</span>
            </button>

            <button
              onClick={() => setActiveTab('builder')}
              className={`py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'builder'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>سازنده قالب اکسل سفارشی (Excel Builder)</span>
            </button>

            <button
              onClick={() => setActiveTab('kasra')}
              className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'kasra'
                  ? 'bg-slate-800 text-teal-400 border border-teal-500/40 font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>سامانه کسری (حضور/غیاب)</span>
            </button>

            <button
              onClick={() => setActiveTab('mis')}
              className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'mis'
                  ? 'bg-slate-800 text-emerald-400 border border-emerald-500/40 font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>سامانه MIS (تولید و کیفیت)</span>
            </button>

            <button
              onClick={() => setActiveTab('production_calc')}
              className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'production_calc'
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Gauge className="w-4 h-4" />
              <span>محاسبه‌گر تولید و سایکل‌تایم</span>
            </button>
          </div>

          {/* Quick Action Button */}
          {activeTab === 'dynamic' && dynamicRecords.length > 0 && (
            <div className="flex items-center gap-2 py-1">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setIsManualEditEnabled(!isManualEditEnabled)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer ${
                    isManualEditEnabled
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isManualEditEnabled ? 'حالت ویرایش دستی فعال است' : 'فعال‌سازی ویرایش دستی (ادمین)'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleApplyDynamicRecords}
                className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs px-4 py-1.5 rounded-xl shadow-lg shadow-teal-500/20 flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Save className="w-3.5 h-3.5" />
                <span>اعمال آنی بر پرونده‌ها ({dynamicRecords.length} رکورد)</span>
              </button>
            </div>
          )}
        </div>

        {/* FEEDBACK MESSAGES */}
        {successMessage && (
          <div className="mx-6 mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 shrink-0 animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage('')} className="text-emerald-400 hover:text-emerald-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 shrink-0 animate-fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage('')} className="text-rose-400 hover:text-rose-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* VALIDATION & INJECTION AUDIT REPORT */}
        {validationSummary && (
          <div className="mx-6 mt-4 p-4 bg-slate-900/90 border border-teal-500/30 rounded-2xl text-xs space-y-3 shrink-0 animate-fade-in shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-teal-400" />
                <span className="font-black text-slate-100 text-sm">
                  گزارش اعتبارسنجی و تزریق به اسلات‌ها ({validationSummary.source})
                </span>
              </div>
              <button 
                type="button"
                onClick={() => setValidationSummary(null)} 
                className="text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
                <span className="text-[11px] text-slate-400 block mb-1">کل پرسنل پردازش‌شده</span>
                <span className="text-base font-black text-slate-100">{validationSummary.totalProcessed} نفر</span>
              </div>
              <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                <span className="text-[11px] text-emerald-400 block mb-1">ارزیابی‌های جدید</span>
                <span className="text-base font-black text-emerald-300">{validationSummary.newEvaluations} پرونده</span>
              </div>
              <div className="bg-teal-500/10 p-3 rounded-xl border border-teal-500/20">
                <span className="text-[11px] text-teal-400 block mb-1">ارزیابی‌های به‌روزرسانی‌شده</span>
                <span className="text-base font-black text-teal-300">{validationSummary.updatedEvaluations} پرونده</span>
              </div>
              <div className="bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/20">
                <span className="text-[11px] text-indigo-400 block mb-1">اسلات‌های نمره تکمیل‌شده</span>
                <span className="text-base font-black text-indigo-300">{validationSummary.slotsPopulated} اسلات</span>
              </div>
            </div>

            {validationSummary.warnings.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowValidationWarnings(!showValidationWarnings)}
                  className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 font-bold text-xs cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>مشاهده هشدارهای اعتبارسنجی اسلات‌ها ({validationSummary.warnings.length} مورد)</span>
                  <span className="text-[10px] underline">{showValidationWarnings ? 'بستن' : 'نمایش'}</span>
                </button>
                {showValidationWarnings && (
                  <ul className="mt-2 space-y-1.5 max-h-36 overflow-y-auto pr-2 bg-slate-950/60 p-3 rounded-xl border border-amber-500/20 text-slate-300 text-[11px]">
                    {validationSummary.warnings.map((warn, wIdx) => (
                      <li key={wIdx} className="flex items-start gap-1.5 text-amber-300/90">
                        <span className="text-amber-400 font-black">•</span>
                        <span>{warn}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* MAIN BODY AREA */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ======================================================== */}
          {/* TAB 1: DYNAMIC CRITERIA MATRIX (UNIVERSAL) */}
          {/* ======================================================== */}
          {activeTab === 'dynamic' && (
            <div className="space-y-6">
              
              {/* Upload & Action Bar */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-950/60 border border-slate-800 rounded-3xl p-5 items-center">
                <div className="md:col-span-7 space-y-1.5">
                  <h3 className="text-xs font-black text-teal-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-teal-400" />
                    <span>بارگذاری فایل اکسل ماتریس ارزیابی شاخص‌ها</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    فایل اکسل ارزیابی یا خروجی اختصاصی را انتخاب فرمایید. سیستم تمام ستون‌ها و کدهای شاخص (C-BEH-01, S-01, ...) را به صورت خودکار شناسایی و نمرات را در لحظه محاسبه می‌نماید.
                  </p>
                </div>

                <div className="md:col-span-5 flex flex-wrap items-center justify-end gap-2.5">
                  <input
                    type="file"
                    ref={dynamicFileInputRef}
                    onChange={handleDynamicFileUpload}
                    accept=".xlsx, .csv"
                    className="hidden"
                  />

                  <button
                    onClick={() => dynamicFileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs py-2.5 px-4 rounded-xl shadow-lg shadow-teal-500/20 flex items-center gap-2 cursor-pointer transition-all"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{isProcessing ? 'در حال پردازش...' : 'انتخاب و آپلود اکسل شاخص‌ها'}</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('builder')}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs py-2.5 px-3.5 rounded-xl border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-400" />
                    <span>دانلود قالب با شاخص‌های دلخواه</span>
                  </button>

                  {rawHeaders.length > 0 && (
                    <button
                      onClick={() => setShowMappingConfig(!showMappingConfig)}
                      className={`text-xs font-bold py-2.5 px-3 rounded-xl border flex items-center gap-1.5 cursor-pointer transition-all ${
                        showMappingConfig
                          ? 'bg-teal-500/20 border-teal-500 text-teal-300'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                      <span>نگاشت ستون‌ها ({columnMappings.length})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Column Mapping Configurator Panel */}
              {showMappingConfig && rawHeaders.length > 0 && (
                <div className="bg-slate-900 border border-teal-500/30 rounded-3xl p-5 space-y-4 animate-fade-in shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-teal-400" />
                      <h4 className="text-xs font-black text-slate-100">تنظیم و اصلاح نحوه نگاشت ستون‌های فایل اکسل به شاخص‌ها</h4>
                    </div>
                    <span className="text-[11px] text-teal-300 font-mono">تغییرات در لحظه در جدول زیر اعمال می‌شوند</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-1">
                    {columnMappings.map((mapping, idx) => (
                      <div key={idx} className="bg-slate-950/80 border border-slate-800 p-3 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-200 truncate max-w-[180px]" title={mapping.excelColumn}>
                            {mapping.excelColumn}
                          </span>
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                            ستون {idx + 1}
                          </span>
                        </div>

                        <select
                          value={
                            mapping.targetType === 'criterion' && mapping.targetCriterionId
                              ? `crit:${mapping.targetCriterionId}`
                              : mapping.targetType === 'attendance_metric' && mapping.targetMetricKey
                              ? `att:${mapping.targetMetricKey}`
                              : mapping.targetType === 'mis_metric' && mapping.targetMetricKey
                              ? `mis:${mapping.targetMetricKey}`
                              : mapping.targetType
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val.startsWith('crit:')) {
                              handleUpdateColumnMapping(mapping.excelColumn, {
                                targetType: 'criterion',
                                targetCriterionId: val.replace('crit:', '')
                              });
                            } else if (val.startsWith('att:')) {
                              handleUpdateColumnMapping(mapping.excelColumn, {
                                targetType: 'attendance_metric',
                                targetMetricKey: val.replace('att:', '') as any
                              });
                            } else if (val.startsWith('mis:')) {
                              handleUpdateColumnMapping(mapping.excelColumn, {
                                targetType: 'mis_metric',
                                targetMetricKey: val.replace('mis:', '') as any
                              });
                            } else {
                              handleUpdateColumnMapping(mapping.excelColumn, {
                                targetType: val as any,
                                targetCriterionId: undefined,
                                targetMetricKey: undefined
                              });
                            }
                          }}
                          className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl p-2 focus:outline-none focus:border-teal-500"
                        >
                          <optgroup label="مشخصات پرسنلی">
                            <option value="staffCode">کد پرسنلی (Staff Code)</option>
                            <option value="staffName">نام و نام خانوادگی</option>
                            <option value="period">دوره ارزیابی (Period)</option>
                            <option value="note">توضیحات و بازخورد کلی</option>
                          </optgroup>

                          <optgroup label="شاخص‌های عملکردی و رفتاری">
                            {criteria.map(c => (
                              <option key={c.id} value={`crit:${c.id}`}>
                                شاخص: [{c.code}] {c.name}
                              </option>
                            ))}
                          </optgroup>

                          <optgroup label="متریک‌های حضور و انضباط (کسری)">
                            <option value="att:delayMinutes">دقایق تاخیر و تعجیل</option>
                            <option value="att:absenceDays">روزهای غیبت غیرموجه</option>
                            <option value="att:disciplineInfractions">تعداد تذکرات انضباطی</option>
                            <option value="att:totalWorkHours">ساعات کارکرد موظفی</option>
                            <option value="att:overtimeHours">ساعات اضافه‌کاری</option>
                          </optgroup>

                          <optgroup label="متریک‌های تولید و کیفیت (MIS)">
                            <option value="mis:efficiencyRate">درصد راندمان تولید (٪)</option>
                            <option value="mis:scrapRate">نرخ ضایعات (٪)</option>
                            <option value="mis:qualityScore">امتیاز کنترل کیفیت QC (٪)</option>
                            <option value="mis:producedUnits">تعداد تولید واقعی</option>
                            <option value="mis:downtimeHours">ساعات توقف خط</option>
                          </optgroup>

                          <optgroup label="سایر">
                            <option value="ignore">نادیده گرفتن این ستون</option>
                          </optgroup>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dynamic Live Table Preview */}
              {dynamicRecords.length > 0 ? (
                <div className="bg-slate-950/70 border border-slate-800 rounded-3xl overflow-hidden shadow-xl space-y-4">
                  {/* Table Control Bar */}
                  <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3 w-full md:w-auto">
                      <div className="relative w-full md:w-64">
                        <SearchInput resultCount={filteredDynamicRecords.length}
                          type="text"
                          placeholder="جستجو در پرسنل یا کد..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                         
                        />
                        <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                      </div>

                      <div className="text-xs text-slate-400 whitespace-nowrap">
                        نمایش <span className="font-bold text-teal-400">{filteredDynamicRecords.length}</span> از {dynamicRecords.length} رکورد
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isAdmin && isManualEditEnabled && (
                        <button
                          type="button"
                          onClick={handleAdminResetToOriginal}
                          className="text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 py-2 px-3 rounded-xl border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-all"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>بازگردانی به اکسل اولیه</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handleApplyDynamicRecords}
                        className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs py-2 px-4 rounded-xl shadow-lg shadow-teal-500/20 flex items-center gap-1.5 cursor-pointer transition-all"
                      >
                        <Save className="w-4 h-4" />
                        <span>ثبت در فرم‌های ارزیابی</span>
                      </button>
                    </div>
                  </div>

                  {/* Table Scrollable Container */}
                  <div className="overflow-x-auto max-h-[500px]">
                    <table className="w-full text-right text-xs border-collapse">
                      <thead className="bg-slate-900/90 text-slate-300 sticky top-0 z-10 border-b border-slate-800">
                        <tr>
                          <th className="p-3 font-bold text-center w-12">#</th>
                          <th className="p-3 font-bold">کد پرسنلی</th>
                          <th className="p-3 font-bold">نام و نام خانوادگی</th>
                          <th className="p-3 font-bold">پست و واحد</th>
                          <th className="p-3 font-bold text-center">دوره</th>
                          
                          {/* Criterion Columns */}
                          {dynamicCriterionColumns.map(crit => (
                            <th key={crit.id} className="p-3 font-bold text-center border-r border-slate-800/60 min-w-[130px]">
                              <div className="text-[10px] text-teal-400 font-mono">[{crit.code}]</div>
                              <div className="truncate max-w-[140px]" title={crit.name}>{crit.name}</div>
                            </th>
                          ))}

                          <th className="p-3 font-bold min-w-[200px]">توضیحات و مستندات</th>
                          {isAdmin && isManualEditEnabled && <th className="p-3 font-bold text-center w-16">عملیات</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50 text-slate-300">
                        {filteredDynamicRecords.map((rec, rIdx) => {
                          const isInvalid = !rec.isValid;

                          return (
                            <tr
                              key={rec.id}
                              className={`hover:bg-slate-900/50 transition-colors ${
                                isInvalid ? 'bg-rose-500/5' : rec.isModifiedManually ? 'bg-amber-500/5' : ''
                              }`}
                            >
                              <td className="p-3 text-center text-slate-500 font-mono text-[11px]">
                                {rIdx + 1}
                              </td>

                              <td className="p-3 font-mono font-bold text-slate-100">
                                <div className="flex items-center gap-1.5">
                                  <span>{rec.empCode}</span>
                                  {isInvalid && (
                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" title={rec.validationError} />
                                  )}
                                  {rec.isModifiedManually && (
                                    <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 py-0.5 rounded font-mono" title="ویرایش دستی ادمین">
                                      ادمین
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="p-3 font-bold text-slate-200">
                                {rec.empName || <span className="text-rose-400">نامشخص</span>}
                              </td>

                              <td className="p-3 text-slate-400">
                                <div className="truncate max-w-[140px]">{rec.jobTitle}</div>
                                <div className="text-[10px] text-slate-500">{rec.unit}</div>
                              </td>

                              <td className="p-3 text-center text-slate-400 font-mono">
                                {rec.period}
                              </td>

                              {/* Scores for Each Criterion */}
                              {dynamicCriterionColumns.map(crit => {
                                const currentScore = rec.scores[crit.id] || 0;
                                const doc = rec.docs[crit.id] || '';

                                return (
                                  <td key={crit.id} className="p-3 text-center border-r border-slate-800/40">
                                    {isAdmin && isManualEditEnabled ? (
                                      <div className="flex flex-col items-center gap-1">
                                        <select
                                          value={currentScore}
                                          onChange={(e) => handleAdminScoreEdit(rec.id, crit.id, Number(e.target.value))}
                                          className="bg-slate-900 border border-amber-500/50 text-amber-300 font-bold text-xs rounded-lg py-1 px-2 focus:outline-none"
                                        >
                                          <option value={0}>ثبت نشده (۰)</option>
                                          <option value={1}>۱ (غیرقابل قبول)</option>
                                          <option value={2}>۲ (نیازمند بهبود)</option>
                                          <option value={3}>۳ (مطابق انتظار)</option>
                                          <option value={4}>۴ (بالاتر از انتظار)</option>
                                          <option value={5}>۵ (فراتر از انتظار)</option>
                                        </select>

                                        {doc && (
                                          <span className="text-[10px] text-slate-400 truncate max-w-[100px]" title={doc}>
                                            {doc}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span className={`inline-block font-mono font-bold px-2 py-0.5 rounded text-xs ${
                                          currentScore >= 4
                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                            : currentScore === 3
                                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                            : currentScore > 0
                                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                            : 'bg-slate-800 text-slate-500'
                                        }`}>
                                          {currentScore > 0 ? `${currentScore} از ۵` : '-'}
                                        </span>
                                        {doc && (
                                          <span className="text-[9px] text-slate-400 truncate max-w-[110px]" title={doc}>
                                            {doc}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}

                              <td className="p-3">
                                {isAdmin && isManualEditEnabled ? (
                                  <input
                                    type="text"
                                    value={rec.overallNote || ''}
                                    placeholder="ملاحظات سرپرست..."
                                    onChange={(e) => handleAdminNoteEdit(rec.id, e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 text-xs rounded-lg p-1.5 text-slate-200 focus:outline-none"
                                  />
                                ) : (
                                  <div className="text-slate-400 truncate max-w-[200px]" title={rec.overallNote}>
                                    {rec.overallNote || '-'}
                                  </div>
                                )}
                              </td>

                              {isAdmin && isManualEditEnabled && (
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleAdminDeleteRow(rec.id)}
                                    className="text-rose-400 hover:text-rose-200 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
                                    title="حذف این ردیف"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-950/40 border border-dashed border-slate-800 rounded-3xl p-12 text-center space-y-3">
                  <div className="w-14 h-14 rounded-3xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mx-auto">
                    <Upload className="w-7 h-7" />
                  </div>
                  <h4 className="text-sm font-black text-slate-200">هنوز فایلی بارگذاری نشده است</h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                    فایل اکسل ارزیابی واحد یا پرسنل را آپلود کنید تا تمام شاخص‌ها و نمرات به صورت خودکار تحلیل و نگاشت شوند.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: CUSTOM EXCEL BUILDER */}
          {/* ======================================================== */}
          {activeTab === 'builder' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-slate-900 to-indigo-950/40 border border-indigo-500/30 rounded-3xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-100">سازنده قالب اکسل اختصاصی بر اساس بانک شاخص‌ها</h3>
                    <p className="text-xs text-indigo-300 mt-0.5">شاخص‌های مدنظرتان را انتخاب کنید و قالب استاندارد متناسب با دوره و واحد سازمانی را بسازید</p>
                  </div>
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-300">دوره ارزیابی (Period)</label>
                    <select
                      value={builderPeriod}
                      onChange={(e) => setBuilderPeriod(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl p-2.5 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="نیمه اول ۱۴۰۵">نیمه اول ۱۴۰۵</option>
                      <option value="نیمه دوم ۱۴۰۵">نیمه دوم ۱۴۰۵</option>
                      <option value="بهار ۱۴۰۵">بهار ۱۴۰۵</option>
                      <option value="تابستان ۱۴۰۵">تابستان ۱۴۰۵</option>
                      <option value="پاییز ۱۴۰۵">پاییز ۱۴۰۵</option>
                      <option value="زمستان ۱۴۰۵">زمستان ۱۴۰۵</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-300">فیلتر بر اساس عنوان شغلی</label>
                    <select
                      value={builderProfileId}
                      onChange={(e) => setBuilderProfileId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl p-2.5 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="all">همه عنوان‌های شغلی ({employees.length} پرسنل)</option>
                      {profiles.map(p => (
                        <option key={p.id} value={p.id}>{p.title} ({p.code} - {p.family === 'B' ? 'عملیاتی' : 'ستادی'})</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-300">فیلتر بر اساس واحد سازمانی</label>
                    <select
                      value={builderUnit}
                      onChange={(e) => setBuilderUnit(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl p-2.5 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="all">همه واحدهای سازمانی</option>
                      {availableUnits.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Criteria Selection Checklist */}
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-200">انتخاب شاخص‌های مدنظر برای ستون‌های اکسل:</span>
                      <span className="text-xs text-indigo-400 font-mono font-bold">({builderSelectedCriteria.length} از {criteria.length} شاخص انتخاب شده)</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setBuilderSelectedCriteria(criteria.map(c => c.id))}
                        className="text-[11px] font-bold text-teal-400 hover:text-teal-300 bg-teal-500/10 px-2.5 py-1 rounded-lg border border-teal-500/30"
                      >
                        انتخاب همه شاخص‌ها
                      </button>
                      <button
                        type="button"
                        onClick={() => setBuilderSelectedCriteria([])}
                        className="text-[11px] font-bold text-slate-400 hover:text-slate-200 bg-slate-800 px-2.5 py-1 rounded-lg"
                      >
                        لغو انتخاب همه
                      </button>
                    </div>
                  </div>

                  {/* Category Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {[
                      { key: 'ALL', label: 'همه دسته‌ها' },
                      { key: 'K', label: 'نتایج کمی (KPI)' },
                      { key: 'Q', label: 'کیفیت و انطباق' },
                      { key: 'B', label: 'رفتارهای شایستگی' },
                      { key: 'S', label: 'ایمنی و بهداشت HSE' },
                      { key: 'L', label: 'رهبری و مدیریت' }
                    ].map(tab => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setBuilderCategoryFilter(tab.key as any)}
                        className={`text-xs font-bold px-3 py-1 rounded-xl transition-all cursor-pointer ${
                          builderCategoryFilter === tab.key
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Criteria Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
                    {criteria
                      .filter(c => builderCategoryFilter === 'ALL' || c.cat === builderCategoryFilter)
                      .map(crit => {
                        const isSelected = builderSelectedCriteria.includes(crit.id);
                        return (
                          <label
                            key={crit.id}
                            className={`flex items-start gap-2.5 p-3 rounded-2xl border transition-all cursor-pointer select-none ${
                              isSelected
                                ? 'bg-indigo-950/40 border-indigo-500/50 text-slate-100'
                                : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:bg-slate-900'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                if (isSelected) {
                                  setBuilderSelectedCriteria(builderSelectedCriteria.filter(id => id !== crit.id));
                                } else {
                                  setBuilderSelectedCriteria([...builderSelectedCriteria, crit.id]);
                                }
                              }}
                              className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <div className="space-y-0.5 overflow-hidden">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-mono font-bold text-teal-400 bg-slate-900 px-1.5 py-0.5 rounded">
                                  {crit.code}
                                </span>
                                <span className="text-xs font-bold truncate">{crit.name}</span>
                              </div>
                              <p className="text-[10px] text-slate-400 truncate">{crit.def}</p>
                            </div>
                          </label>
                        );
                      })}
                  </div>
                </div>

                {/* Options & Download */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={builderIncludeDocs}
                      onChange={(e) => setBuilderIncludeDocs(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>شامل ستون شواهد و مستندات برای هر شاخص در اکسل</span>
                  </label>

                  <button
                    type="button"
                    disabled={builderSelectedCriteria.length === 0}
                    onClick={() => {
                      downloadDynamicCriteriaExcelTemplate({
                        employees,
                        criteria,
                        profiles,
                        selectedCriteriaIds: builderSelectedCriteria,
                        selectedProfileId: builderProfileId,
                        selectedUnit: builderUnit,
                        period: builderPeriod,
                        includeDocColumns: builderIncludeDocs,
                        existingEvaluations: evaluations
                      });
                      setSuccessMessage('قالب اختصاصی اکسل با شاخص‌های انتخابی شما با موفقیت دانلود شد.');
                    }}
                    className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 text-white font-black text-xs py-3 px-6 rounded-2xl shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <Download className="w-4 h-4" />
                    <span>دانلود قالب اکسل داینامیک (.xlsx)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: KASRA ATTENDANCE SYSTEM */}
          {/* ======================================================== */}
          {activeTab === 'kasra' && (
            <div className="space-y-6">
              <div className="bg-slate-950/60 border border-slate-800 rounded-3xl p-6 space-y-4">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-black text-slate-100">دریافت و پردازش فایل حضور و غیاب سامانه کسری</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      دوره را انتخاب کنید، فایل را اعتبارسنجی و پیش‌نمایش کنید، سپس فقط اسلات‌های کسری در ارزیابی‌های موجود ذخیره می‌شوند.
                    </p>
                    <p className="text-[11px] text-teal-200">دوره انتخاب‌شده: <strong>{selectedKasraPeriod?.label || 'انتخاب نشده'}</strong> · شناسه: <span className="font-mono">{selectedKasraPeriodId || '—'}</span></p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <label className="text-[10px] text-slate-400">دوره ارزیابی
                      <select aria-label="دوره ارزیابی کسری" value={selectedKasraPeriodId} onChange={event => { setSelectedKasraPeriodId(event.target.value); setKasraApplySummary(null); }} className="mt-1 block rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-slate-100">
                        <option value="">انتخاب دوره</option>
                        {periodOptions.map(period => <option key={period.id} value={period.id}>{period.label}</option>)}
                      </select>
                    </label>
                    <input
                      type="file"
                      ref={kasraFileInputRef}
                      onChange={handleKasraFileChange}
                      accept=".xlsx, .csv"
                      className="hidden"
                    />

                    <button
                      onClick={() => downloadKasraExcelTemplate(employees)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs py-2.5 px-4 rounded-xl border border-slate-700 flex items-center gap-2 cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-teal-400" />
                      <span>دانلود قالب اکسل کسری</span>
                    </button>

                    <button
                      onClick={() => kasraFileInputRef.current?.click()}
                      disabled={isProcessing || !kasraImportAllowed || !selectedKasraPeriodId}
                      className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs py-2.5 px-4 rounded-xl shadow-lg shadow-teal-500/20 flex items-center gap-2 cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>{kasraImportAllowed ? 'بارگذاری اکسل کسری' : 'مجوز کسری لازم است'}</span>
                    </button>
                  </div>
                </div>

                {kasraErrors.length > 0 && <div className="max-h-32 overflow-auto rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-[10px] leading-5 text-amber-200" role="status">{kasraErrors.slice(0, 12).map((error, index) => <p key={`${index}:${error}`}>{error}</p>)}</div>}

                {kasraRecords.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8" aria-label="خلاصه اعتبارسنجی کسری">
                  {[
                    ['کل ردیف‌ها', kasraCounts.total], ['معتبر', kasraCounts.valid], ['نامعتبر', kasraCounts.invalid], ['تکراری', kasraCounts.duplicate],
                    ['کارمند ناشناخته', kasraCounts.unknownEmployee], ['ارزیابی موجود نیست', kasraCounts.missingEvaluation], ['معیار کسری نیست', kasraCounts.missingCriterion], ['ناسازگاری دوره', kasraCounts.periodMismatch],
                  ].map(([label, count]) => <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900/70 p-2.5 text-[10px] text-slate-400">{label}<strong className="mt-1 block text-sm text-slate-100">{count}</strong></div>)}
                </div>}

                {kasraApplySummary && <div role="status" className="grid grid-cols-2 gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-[10px] text-emerald-100 sm:grid-cols-4 lg:grid-cols-7">
                  {Object.entries({ 'ردیف خوانده‌شده': kasraApplySummary.rowsRead, 'کارمند منطبق': kasraApplySummary.employeesMatched, 'ارزیابی به‌روز': kasraApplySummary.evaluationsUpdated, 'نمره به‌روز': kasraApplySummary.scoresUpdated, 'ردیف ردشده': kasraApplySummary.skipped, 'نامعتبر': kasraApplySummary.invalid, 'ناموفق': kasraApplySummary.failed }).map(([label, count]) => <div key={label}>{label}<strong className="mt-1 block text-sm">{count}</strong></div>)}
                </div>}

                {/* Kasra Records Table */}
                {kasraRecords.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">اعتبارسنجی و پیش‌نمایش کسری ({kasraCounts.valid} ردیف آماده از {kasraRecords.length})</span>
                      <button
                        onClick={() => setIsKasraConfirmOpen(true)}
                        disabled={kasraCounts.valid === 0 || isKasraApplying}
                        className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs py-1.5 px-4 rounded-xl shadow cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>بازبینی و تأیید</span>
                      </button>
                    </div>

                    <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs"><SearchInput resultCount={filteredKasraPreviewRows.length} aria-label="جستجوی پیش‌نمایش کسری با کد پرسنلی" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="جستجو با نام یا کد پرسنلی" /></label>
                    <div className="overflow-x-auto max-h-80 rounded-2xl border border-slate-800">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-900 text-slate-300">
                          <tr>
                            <th className="p-2.5">کد</th>
                            <th className="p-2.5">نام</th>
                            <th className="p-2.5 text-center">دوره انتخاب‌شده</th>
                            <th className="p-2.5 text-center">معیار کسری</th>
                            <th className="p-2.5 text-center">خام</th>
                            <th className="p-2.5 text-center">نمره قبل ← بعد</th>
                            <th className="p-2.5 text-center">اعتبارسنجی</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {filteredKasraPreviewRows.map(row => (
                            <tr key={row.record.id} className={row.status === 'valid' ? 'hover:bg-slate-900/40' : 'bg-rose-500/5'}>
                              <td className="p-2.5 font-mono font-bold text-teal-400">{row.record.empCode}</td>
                              <td className="p-2.5 font-bold text-slate-200">{row.employee?.name || row.record.empName || '—'}</td>
                              <td className="p-2.5 text-center text-slate-400">{selectedKasraPeriod?.label || '—'}</td>
                              <td className="p-2.5 text-center text-slate-300">{row.changedScores.map(score => score.criterion.name).join('، ') || '—'}</td>
                              <td className="p-2.5 text-center text-slate-300">{row.changedScores.map(score => score.rawMetricValue).join('، ') || '—'}</td>
                              <td className="p-2.5 text-center font-bold text-emerald-400">{row.changedScores.map(score => `${score.previousValue} ← ${score.nextValue}`).join('، ') || '—'}</td>
                              <td className={`p-2.5 text-center ${row.status === 'valid' ? 'text-emerald-300' : 'text-rose-300'}`}>{row.status === 'valid' ? 'معتبر' : row.issue}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {isKasraConfirmOpen && <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby="kasra-confirm-title">
                  <div className="w-full max-w-lg space-y-4 rounded-2xl border border-teal-500/30 bg-slate-900 p-5 text-right shadow-2xl">
                    <h3 id="kasra-confirm-title" className="text-sm font-black text-slate-100">تأیید درون‌ریزی کسری</h3>
                    <p className="text-xs leading-6 text-slate-300">دوره: <strong>{selectedKasraPeriod?.label}</strong> · شناسه دوره: <code>{selectedKasraPeriodId}</code>. پس از تأیید، {kasraCounts.valid} ردیف معتبر در ارزیابی‌های موجود به‌روزرسانی می‌شود؛ {kasraCounts.invalid} ردیف رد می‌شود. پیش از این دکمه هیچ ارزیابی ذخیره نشده است.</p>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setIsKasraConfirmOpen(false)} disabled={isKasraApplying} className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-bold text-white">لغو؛ بدون ذخیره</button>
                      <button type="button" onClick={handleApplyKasraRecords} disabled={isKasraApplying || kasraCounts.valid === 0} className="rounded-xl bg-teal-500 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-50">{isKasraApplying ? 'در حال ذخیره…' : `تأیید ${kasraCounts.valid} ردیف`}</button>
                    </div>
                  </div>
                </div>}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 4: MIS PRODUCTION SYSTEM */}
          {/* ======================================================== */}
          {activeTab === 'mis' && (
            <div className="space-y-6">
              <div className="bg-slate-950/60 border border-slate-800 rounded-3xl p-6 space-y-4">
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs text-slate-300">
                  <strong className="text-sky-200">دوره ارزیابی فعال:</strong> {db.getMiscData<string>('pe_active_period', '').trim() || 'هیچ دوره‌ای فعال نیست'}
                  <span className="block mt-1 text-slate-400">شناسه تطبیق، کد پرسنلی است. پس از ثبت، مقادیر MIS به عنوان داده سامانه‌ای ذخیره و در فرم ارزیابی فقط‌خواندنی می‌شوند؛ این مقادیر در محاسبه امتیاز معیارهای MIS مشارکت دارند.</span>
                </div>
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-black text-slate-100">دریافت و پردازش فایل تولید و کیفیت سامانه MIS</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      محاسبه نمرات شاخص‌های کمی و کیفی بر اساس راندمان خط، نرخ ضایعات، تیراژ تولید و نمره QC
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <input
                      type="file"
                      ref={misFileInputRef}
                      onChange={handleMISFileChange}
                      accept=".xlsx, .csv"
                      className="hidden"
                    />

                    <button
                      onClick={() => downloadMISExcelTemplate(employees, db.getMiscData<string>('pe_active_period', '').trim())}
                      disabled={!db.getMiscData<string>('pe_active_period', '').trim()}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs py-2.5 px-4 rounded-xl border border-slate-700 flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Download className="w-4 h-4 text-emerald-400" />
                      <span>دانلود قالب اکسل MIS</span>
                    </button>

                    <button
                      onClick={() => misFileInputRef.current?.click()}
                      disabled={isProcessing || !misImportAllowed || !db.getMiscData<string>('pe_active_period', '').trim()}
                      className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs py-2.5 px-4 rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>{misImportAllowed ? 'بارگذاری اکسل MIS' : 'مجوز MIS لازم است'}</span>
                    </button>
                  </div>
                </div>

                {(misExpectedPeriod || misCounts.invalid > 0) && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" aria-label="خلاصه اعتبارسنجی MIS">
                  {[
                    ['معتبر', misCounts.valid], ['نامعتبر', misCounts.invalid], ['تکراری', misCounts.duplicate],
                    ['کارمند ناشناخته', misCounts.unknown], ['نگاشت ناقص', misCounts.missingMapping], ['هشدار', misCounts.warning],
                  ].map(([label, count]) => <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-[11px] text-slate-400">{label}<strong className="mt-1 block text-sm text-slate-100">{count}</strong></div>)}
                </div>}

                {misIssues.length > 0 && <div className="max-h-52 overflow-auto rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                  <h4 className="mb-2 text-xs font-bold text-amber-200">خطاهای قابل اصلاح در فایل</h4>
                  <div className="space-y-2">{misIssues.map((issue, index) => <div key={`${issue.row}:${issue.column}:${index}`} className="rounded-lg bg-slate-950/70 p-2 text-[10px] leading-5 text-slate-300"><strong>ردیف {issue.row} · ستون {issue.column}</strong>{issue.employee && <span> · پرسنل {issue.employee}</span>}<span className="block">{issue.issue} — اصلاح: {issue.correction}</span></div>)}</div>
                </div>}

                {/* MIS Records Table */}
                {misRecords.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">پیش‌نمایش داده‌های تولید MIS ({misRecords.length} پرسنل)</span>
                      <button
                        onClick={() => setIsMisConfirmOpen(true)}
                        className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs py-1.5 px-4 rounded-xl shadow cursor-pointer flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>بازبینی و تأیید اعمال</span>
                      </button>
                    </div>

                    <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs"><SearchInput resultCount={filteredMisRecords.length} aria-label="جستجوی پیش‌نمایش MIS با کد پرسنلی" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="جستجو با نام یا کد پرسنلی" /></label>
                    <div className="overflow-x-auto max-h-80 rounded-2xl border border-slate-800">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-900 text-slate-300">
                          <tr>
                            <th className="p-2.5">کد</th>
                            <th className="p-2.5">نام</th>
                            <th className="p-2.5 text-center">دوره</th>
                            <th className="p-2.5 text-center">راندمان</th>
                            <th className="p-2.5 text-center">ضایعات</th>
                            <th className="p-2.5 text-center">کیفیت QC</th>
                            <th className="p-2.5 text-center">نمره KPI (۱-۵)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {filteredMisRecords.map(r => (
                            <tr key={r.id} className="hover:bg-slate-900/40">
                              <td className="p-2.5 font-mono font-bold text-emerald-400">{r.empCode}</td>
                              <td className="p-2.5 font-bold text-slate-200">{r.empName}</td>
                              <td className="p-2.5 text-center text-slate-400">{r.period}</td>
                              <td className="p-2.5 text-center text-slate-300">{r.efficiencyRate}٪</td>
                              <td className="p-2.5 text-center text-slate-300">{r.scrapRate}٪</td>
                              <td className="p-2.5 text-center text-slate-300">{r.qualityScore}٪</td>
                              <td className="p-2.5 text-center font-bold text-emerald-400">{r.calculatedKpiScore} از ۵</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {isMisConfirmOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby="mis-confirm-title">
                  <div className="w-full max-w-lg space-y-4 rounded-2xl border border-emerald-500/30 bg-slate-900 p-5 text-right shadow-2xl">
                    <h3 id="mis-confirm-title" className="text-sm font-black text-slate-100">تأیید درون‌ریزی داده‌های MIS</h3>
                    <p className="text-xs leading-6 text-slate-300">دوره: <strong>{misExpectedPeriod}</strong> · رکوردهای معتبر: <strong>{misRecords.length}</strong>. فقط مقادیر MIS با کد پرسنلی منطبق در ارزیابی‌های همین دوره ثبت می‌شوند؛ امتیازهای دستی سرپرست حفظ و مقادیر MIS پس از ثبت فقط‌خواندنی خواهند بود.</p>
                    <div className="flex justify-end gap-2"><button type="button" onClick={() => setIsMisConfirmOpen(false)} className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-bold text-white">بازگشت به پیش‌نمایش</button><button type="button" onClick={handleApplyMISRecords} className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-slate-950">تأیید و اعمال {misRecords.length} رکورد</button></div>
                  </div>
                </div>}
              </div>
            </div>
          )}

          {/* TAB 5: PRODUCTION & CYCLE TIME ENGINE */}
          {activeTab === 'production_calc' && (
            <div className="p-2">
              <ProductionCycleTimeCalculator
                employees={employees}
                criteria={criteria}
                profiles={profiles}
                evaluations={evaluations}
                onUpdateEvaluations={(nextEvals) => {
                  onUpdateEvaluations(nextEvals);
                  setSuccessMessage('محاسبات خودکار تولید و سایکل‌تایم با موفقیت انجام و در کارنامه‌ها ثبت شد.');
                }}
                currentUser={currentUser}
                onClose={onClose}
              />
            </div>
          )}

        </div>

        {/* FOOTER */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-teal-400 shrink-0" />
            <span>تغییرات ستون‌ها و نمرات به صورت اتوماتیک و در لحظه (Real-time) محاسبه و همگام‌سازی می‌شوند.</span>
          </div>

          <button
            onClick={onClose}
            className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-5 py-2 rounded-xl border border-slate-700 cursor-pointer transition-colors"
          >
            بستن پنجره
          </button>
        </div>

      </div>
    </div>
  );
}

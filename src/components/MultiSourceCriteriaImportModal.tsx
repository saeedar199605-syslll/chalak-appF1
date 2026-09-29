/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Multi-Source Criteria Bulk Import & Department Merging Engine
 * Allows importing criteria from multiple files (JSON/CSV) across different departments
 * and combining them into the centralized Criteria Bank with intelligent conflict resolution.
 */

import React, { useState, useMemo } from 'react';
import { 
  X, 
  Upload, 
  FileText, 
  FileSpreadsheet, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Plus, 
  Sparkles, 
  ArrowRight, 
  Filter, 
  Search, 
  RefreshCw,
  Building2,
  Check,
  Info
} from 'lucide-react';
import { Criterion, CategoryKey, CriterionScoringSource } from '../types';

export interface MultiSourceInputFile {
  id: string;
  department: string;
  filename: string;
  format: 'json' | 'csv' | 'xlsx';
  rawContent: string;
  parsedCount: number;
  criteria: Array<Omit<Criterion, 'id'> & { department: string; sourceFile: string }>;
  error?: string;
}

export type MergeStrategy = 'merge' | 'prefix_dept' | 'skip_existing' | 'replace';

interface MultiSourceCriteriaImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingCriteria: Criterion[];
  onCommitMerge: (
    mergedCriteria: Array<Omit<Criterion, 'id'> & { id?: string }>,
    strategy: MergeStrategy,
    stats: { total: number; added: number; updated: number; departments: string[] }
  ) => void;
  theme?: 'dark' | 'light';
}

const DEPARTMENT_PRESETS = [
  'سالن تولید و مونتاژ (Production)',
  'کنترل کیفیت و آزمایشگاه (QC/QA)',
  'ایمنی، بهداشت و ۵اس (HSE & 5S)',
  'نگهداری و تعمیرات (PM/TPM)',
  'مهندسی صنایع و برنامه‌ریزی تولید',
  'لجستیک و انبارداری قطعات',
  'منابع انسانی و شایستگی‌های رفتاری'
];

export default function MultiSourceCriteriaImportModal({
  isOpen,
  onClose,
  existingCriteria,
  onCommitMerge,
  theme = 'dark'
}: MultiSourceCriteriaImportModalProps) {
  const [sources, setSources] = useState<MultiSourceInputFile[]>([]);
  const [activeStep, setActiveStep] = useState<'sources' | 'preview'>('sources');
  const [selectedDeptInput, setSelectedDeptInput] = useState<string>(DEPARTMENT_PRESETS[0]);
  const [customDeptInput, setCustomDeptInput] = useState<string>('');
  const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>('merge');
  
  // Preview filters and selection
  const [previewFilterDept, setPreviewFilterDept] = useState<string>('ALL');
  const [previewSearch, setPreviewSearch] = useState<string>('');
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(new Set());
  const [previewStatusFilter, setPreviewStatusFilter] = useState<'all' | 'new' | 'update'>('all');

  // Note: isOpen check must come AFTER all useMemo hooks to comply with Rules of Hooks

  // Department name resolver
  const currentDeptName = customDeptInput.trim() || selectedDeptInput;

  // --- PARSERS ---
  const parseCSVContent = (content: string, dept: string, filename: string) => {
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    const headers = lines[0].split(/[,;\t]/).map(h => h.replace(/^["']|["']$/g, '').trim().toLowerCase());
    
    // Header index mapping
    const codeIdx = headers.findIndex(h => h.includes('کد') || h === 'code');
    const nameIdx = headers.findIndex(h => h.includes('عنوان') || h.includes('نام') || h === 'name');
    const catIdx = headers.findIndex(h => h.includes('دسته') || h.includes('نوع') || h === 'cat' || h === 'category');
    const defIdx = headers.findIndex(h => h.includes('تعریف') || h.includes('شرح') || h === 'def' || h === 'definition');
    const srcIdx = headers.findIndex(h => h.includes('منبع') || h === 'source');
    const methodIdx = headers.findIndex(h => h.includes('روش') || h.includes('فرمول') || h === 'method');
    const dirIdx = headers.findIndex(h => h.includes('جهت') || h === 'dir' || h === 'direction');
    const scoringSrcIdx = headers.findIndex(h => h.includes('سامانه') || h.includes('نمره') || h === 'scoringsource');

    const result: Array<Omit<Criterion, 'id'> & { department: string; sourceFile: string }> = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(/[,;\t]/).map(p => p.replace(/^["']|["']$/g, '').trim());
      const rawCode = codeIdx >= 0 ? parts[codeIdx] : parts[0];
      const rawName = nameIdx >= 0 ? parts[nameIdx] : parts[1];

      if (!rawCode || !rawName) continue;

      let cat: CategoryKey = 'K';
      if (catIdx >= 0 && parts[catIdx]) {
        const c = parts[catIdx].toUpperCase();
        if (['K', 'Q', 'B', 'S', 'L'].includes(c)) {
          cat = c as CategoryKey;
        } else if (c.includes('رفتار') || c.includes('B')) cat = 'B';
        else if (c.includes('کیف') || c.includes('Q')) cat = 'Q';
        else if (c.includes('ایمن') || c.includes('S')) cat = 'S';
        else if (c.includes('رهبر') || c.includes('L')) cat = 'L';
      } else {
        if (rawCode.toUpperCase().startsWith('B-')) cat = 'B';
        else if (rawCode.toUpperCase().startsWith('Q-')) cat = 'Q';
        else if (rawCode.toUpperCase().startsWith('S-')) cat = 'S';
        else if (rawCode.toUpperCase().startsWith('L-')) cat = 'L';
      }

      let dir: 'more' | 'less' = 'more';
      if (dirIdx >= 0 && parts[dirIdx]) {
        const d = parts[dirIdx].toLowerCase();
        if (d.includes('کم') || d === 'less' || d === 'کاهش') dir = 'less';
      }

      let scoringSource: CriterionScoringSource = 'supervisor';
      if (scoringSrcIdx >= 0 && parts[scoringSrcIdx]) {
        const s = parts[scoringSrcIdx].toLowerCase();
        if (s.includes('mis') || s.includes('mes') || s.includes('تولید')) scoringSource = 'mis';
        else if (s.includes('کسری') || s.includes('تردد') || s.includes('kasra')) scoringSource = 'kasra';
        else if (s.includes('سیستم') || s.includes('فرمول')) scoringSource = 'system';
        else if (s.includes('چند') || s.includes('ترکیب')) scoringSource = 'multi_source';
      }

      result.push({
        code: rawCode.toUpperCase(),
        name: rawName,
        cat,
        def: defIdx >= 0 && parts[defIdx] ? parts[defIdx] : `سنجه ارزیابی ${rawName} تایید شده توسط ${dept}`,
        source: srcIdx >= 0 && parts[srcIdx] ? parts[srcIdx] : dept,
        method: methodIdx >= 0 && parts[methodIdx] ? parts[methodIdx] : 'سنجش دوره‌ای کارگاهی',
        dir,
        scoringSource,
        department: dept,
        sourceFile: filename
      });
    }

    return result;
  };

  const parseJSONContent = (content: string, dept: string, filename: string) => {
    const parsed = JSON.parse(content);
    let items: any[] = [];
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.criteria)) items = parsed.criteria;
      else if (Array.isArray(parsed.items)) items = parsed.items;
      else if (Array.isArray(parsed.data)) items = parsed.data;
      else items = [parsed];
    }

    const result: Array<Omit<Criterion, 'id'> & { department: string; sourceFile: string }> = [];

    items.forEach((it, idx) => {
      const code = (it.code || it.codeCriterion || `CRIT-${idx + 1}`).toString().trim().toUpperCase();
      const name = (it.name || it.title || it.label || '').toString().trim();
      if (!code || !name) return;

      const cat: CategoryKey = (['K', 'Q', 'B', 'S', 'L'].includes((it.cat || '').toUpperCase())) 
        ? it.cat.toUpperCase() 
        : (code.startsWith('B-') ? 'B' : code.startsWith('Q-') ? 'Q' : code.startsWith('S-') ? 'S' : 'K');

      result.push({
        code,
        name,
        cat,
        def: it.def || it.description || `تعریف شاخص ${name} بر اساس موازین بخش ${dept}`,
        source: it.source || it.dataOrigin || dept,
        method: it.method || it.calculationMethod || 'محاسبه کارگاهی',
        dir: it.dir === 'less' ? 'less' : 'more',
        scoringSource: it.scoringSource || 'supervisor',
        department: it.department || dept,
        unit: it.unit || it.metricUnit || '',
        targetValue: it.targetValue ? Number(it.targetValue) : undefined,
        sourceFile: filename
      });
    });

    return result;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files) as File[]) {
      try {
        // SECURITY/CORRECTNESS: XLSX must use real workbook cell parsing (ExcelJS)
        if (file.name.toLowerCase().endsWith('.xlsx')) {
          await handleXlsxFile(file, currentDeptName);
        } else {
          const reader = new FileReader();
          let resolve: any;
          const promise = new Promise<void>(r => { resolve = r; });
          reader.onload = (event) => {
            const rawContent = event.target?.result as string;
            if (!rawContent) { resolve(); return; }
            const isJson = file.name.endsWith('.json') || rawContent.trim().startsWith('{') || rawContent.trim().startsWith('[');
            const format = isJson ? 'json' : 'csv';
            try {
              let criteriaList: Array<Omit<Criterion, 'id'> & { department: string; sourceFile: string }> = [];
              if (format === 'json') {
                criteriaList = parseJSONContent(rawContent, currentDeptName, file.name);
              } else {
                criteriaList = parseCSVContent(rawContent, currentDeptName, file.name);
              }
              const newSource: MultiSourceInputFile = {
                id: `src-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                department: currentDeptName,
                filename: file.name,
                format,
                rawContent,
                parsedCount: criteriaList.length,
                criteria: criteriaList
              };
              setSources(prev => [...prev, newSource]);
            } catch (err: any) {
              alert(`خطا در پردازش فایل ${file.name}: ${err.message || 'فرمت نامعتبر'}`);
            }
            resolve();
          };
          reader.onerror = () => { alert(`خطا در خواندن فایل ${file.name}`); resolve(); };
          reader.readAsText(file, 'UTF-8');
          await promise;
        }
      } catch (err: any) {
        alert(`خطا در پردازش فایل ${file.name}: ${err.message || 'فرمت نامعتبر'}`);
      }
    }

    e.target.value = '';
  };

  // Parse real XLSX workbook and extract criteria rows from cells
  const handleXlsxFile = async (file: File, dept: string) => {
    const { readWorkbookRows } = await import('../utils/excelWorkbook');
    const workbook = await readWorkbookRows(file);
    const criteriaList: Array<Omit<Criterion, 'id'> & { department: string; sourceFile: string }> = [];
    let matchedSheets = 0;
    for (const sheetName of workbook.sheets) {
    const rows = workbook.rowsBySheet[sheetName] || [];
    if (rows.length < 2) continue;
    // Headers from row 1, data from row 2+ — use real cell values
    const headers = (rows[0] || []).map(h => String(h || '').trim().toLowerCase());
    const codeIdx = headers.findIndex(h => h.includes('کد') || h === 'code');
    const nameIdx = headers.findIndex(h => h.includes('نام') || h.includes('عنوان') || h === 'name');
    if (codeIdx < 0 || nameIdx < 0) continue;
    matchedSheets++;
    const catIdx = headers.findIndex(h => h.includes('دسته') || h.includes('نوع') || h === 'cat' || h === 'category');
    const defIdx = headers.findIndex(h => h.includes('تعریف') || h.includes('شرح') || h === 'def');
    const srcIdx = headers.findIndex(h => h.includes('منبع') || h === 'source');
    const methodIdx = headers.findIndex(h => h.includes('روش') || h.includes('فرمول') || h === 'method');
    const dirIdx = headers.findIndex(h => h.includes('جهت') || h === 'dir');
    const scoringSrcIdx = headers.findIndex(h => h.includes('سامانه') || h.includes('نمره') || h === 'scoringsource' || h.includes('scoring'));

    for (let i = 1; i < rows.length; i++) {
      const parts = (rows[i] || []).map(c => String(c ?? '').trim());
      const rawCode = codeIdx >= 0 ? parts[codeIdx] : parts[0];
      const rawName = nameIdx >= 0 ? parts[nameIdx] : parts[1];
      if (!rawCode || !rawName) continue;

      let cat: CategoryKey = 'K';
      if (catIdx >= 0 && parts[catIdx]) {
        const c = parts[catIdx].toUpperCase();
        if (['K', 'Q', 'B', 'S', 'L'].includes(c)) cat = c as CategoryKey;
        else if (c.includes('رفتار') || c.includes('B')) cat = 'B';
        else if (c.includes('کیف') || c.includes('Q')) cat = 'Q';
        else if (c.includes('ایمن') || c.includes('S')) cat = 'S';
        else if (c.includes('رهبر') || c.includes('L')) cat = 'L';
      } else {
        if (rawCode.toUpperCase().startsWith('B-')) cat = 'B';
        else if (rawCode.toUpperCase().startsWith('Q-')) cat = 'Q';
        else if (rawCode.toUpperCase().startsWith('S-')) cat = 'S';
        else if (rawCode.toUpperCase().startsWith('L-')) cat = 'L';
      }

      let dir: 'more' | 'less' = 'more';
      if (dirIdx >= 0 && parts[dirIdx]) {
        const d = parts[dirIdx].toLowerCase();
        if (d.includes('کم') || d === 'less' || d === 'کاهش') dir = 'less';
      }

      let scoringSource: CriterionScoringSource = 'supervisor';
      if (scoringSrcIdx >= 0 && parts[scoringSrcIdx]) {
        const s = parts[scoringSrcIdx].toLowerCase();
        if (s.includes('mis') || s.includes('mes') || s.includes('تولید')) scoringSource = 'mis';
        else if (s.includes('کسری') || s.includes('تردد') || s.includes('kasra')) scoringSource = 'kasra';
        else if (s.includes('سیستم') || s.includes('فرمول')) scoringSource = 'system';
        else if (s.includes('چند') || s.includes('ترکیب')) scoringSource = 'multi_source';
      }

      criteriaList.push({
        code: rawCode.toUpperCase(),
        name: rawName,
        cat,
        def: defIdx >= 0 && parts[defIdx] ? parts[defIdx] : `سنجه ارزیابی ${rawName} تایید شده توسط ${dept}`,
        source: srcIdx >= 0 && parts[srcIdx] ? parts[srcIdx] : dept,
        method: methodIdx >= 0 && parts[methodIdx] ? parts[methodIdx] : 'سنجش دوره‌ای کارگاهی',
        dir,
        scoringSource,
        department: dept,
        sourceFile: file.name
      });
    }
    }
    if (matchedSheets === 0) throw new Error('هیچ برگه‌ای با ستون‌های کد شاخص و نام یافت نشد.');

    const newSource: MultiSourceInputFile = {
      id: `src-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      department: dept,
      filename: file.name,
      format: 'xlsx',
      rawContent: '(XLSX - parsed via cells)',
      parsedCount: criteriaList.length,
      criteria: criteriaList
    };
    setSources(prev => [...prev, newSource]);
  };

  // Quick Multi-Department Industrial Scenario Loader
  const handleLoadSampleScenario = () => {
    const sampleQC: MultiSourceInputFile = {
      id: 'src-sample-qc',
      department: 'کنترل کیفیت و آزمایشگاه (QC/QA)',
      filename: 'QC_Criteria_Export_1405.json',
      format: 'json',
      rawContent: '{}',
      parsedCount: 4,
      criteria: [
        {
          code: 'K-QC-01',
          name: 'نرخ انطباق کیفی قطعات در اولین عبور (FTT)',
          cat: 'K',
          def: 'درصد قطعاتی که بدون دوباره‌کاری در بازرسی اولیه تایید می‌شوند',
          source: 'کارتابل بازرسی کیفیت',
          method: 'First Time Through %',
          dir: 'more',
          scoringSource: 'mis',
          department: 'کنترل کیفیت و آزمایشگاه (QC/QA)',
          sourceFile: 'QC_Criteria_Export_1405.json'
        },
        {
          code: 'K-QC-05',
          name: 'تعداد قطعات بازکاری‌شده در ایستگاه (Rework Rate)',
          cat: 'K',
          def: 'تعداد کل قطعاتی که نیازمند سنگ‌زنی یا پلیسه‌گیری مجدد شده‌اند',
          source: 'فرم لاگ بازکاری سالن',
          method: 'تعداد در شیفت (کمتر بهتر)',
          dir: 'less',
          scoringSource: 'supervisor',
          department: 'کنترل کیفیت و آزمایشگاه (QC/QA)',
          sourceFile: 'QC_Criteria_Export_1405.json'
        },
        {
          code: 'Q-LAB-01',
          name: 'دقت در آزمون‌های تست هیدرواستاتیک و ابعادی',
          cat: 'Q',
          def: 'انطباق ۱۰۰ درصدی نمونه‌ها با تولرانس نقشه فنی و ثبت نتایج در سامانه',
          source: 'لاگ آزمایشگاه متالورژی',
          method: 'نرخ خطای آزمایش (کمتر بهتر)',
          dir: 'less',
          scoringSource: 'supervisor',
          department: 'کنترل کیفیت و آزمایشگاه (QC/QA)',
          sourceFile: 'QC_Criteria_Export_1405.json'
        },
        {
          code: 'B-QC-02',
          name: 'پاسخگویی سریع به هشدارهای خط و توقف ضایعات',
          cat: 'B',
          def: 'حضور فوری در ایستگاه تولید به محض گزارش نقص فنی جهت جلوگیری از انباشت ضایعات',
          source: 'مشاهده سرپرست سالن',
          method: 'مقیاس ۱ تا ۵ رفتاری',
          dir: 'more',
          scoringSource: 'supervisor',
          department: 'کنترل کیفیت و آزمایشگاه (QC/QA)',
          sourceFile: 'QC_Criteria_Export_1405.json'
        }
      ]
    };

    const sampleProduction: MultiSourceInputFile = {
      id: 'src-sample-prd',
      department: 'سالن تولید و مونتاژ (Production)',
      filename: 'Production_MES_Kpi_1405.csv',
      format: 'csv',
      rawContent: '',
      parsedCount: 4,
      criteria: [
        {
          code: 'K-PRD-01',
          name: 'درصد تحقق برنامه زمان‌بندی تولید شیفت',
          cat: 'K',
          def: 'تعداد قطعات تولید سالم به تفکیک برنامه زمان‌بندی مصوب شیفت',
          source: 'سامانه مانیتورینگ MES',
          method: 'درصد کمی (تحقق / برنامه)',
          dir: 'more',
          scoringSource: 'mis',
          department: 'سالن تولید و مونتاژ (Production)',
          sourceFile: 'Production_MES_Kpi_1405.csv'
        },
        {
          code: 'K-PRD-06',
          name: 'بهره‌وری موثر تجهیزات خط مونتاژ (OEE)',
          cat: 'K',
          def: 'شاخص اثربخشی کلی تجهیزات حاصلضرب در دسترس بودن، عملکرد و کیفیت',
          source: 'سیستم ثبت خودکار خط',
          method: 'درصد OEE (بالای ۸۵ مطلوب)',
          dir: 'more',
          scoringSource: 'mis',
          department: 'سالن تولید و مونتاژ (Production)',
          sourceFile: 'Production_MES_Kpi_1405.csv'
        },
        {
          code: 'K-SET-03',
          name: 'زمان تنظیم و تعویض فیکسچرهای تراشکاری',
          cat: 'K',
          def: 'مدت زمان دقیق مورد نیاز برای راه‌اندازی و تنظیم فیکسچرهای ابزار دقیق',
          source: 'چک‌لیست راه‌اندازی دستگاه',
          method: 'دقیقه (کمتر بهتر)',
          dir: 'less',
          scoringSource: 'supervisor',
          department: 'سالن تولید و مونتاژ (Production)',
          sourceFile: 'Production_MES_Kpi_1405.csv'
        },
        {
          code: 'B-TEAM-02',
          name: 'تسهیم دانش فنی و حل مسئله در جلسات آغاز شیفت',
          cat: 'B',
          def: 'مشارکت فعال در طوفان فکری ۵ دقیقه‌ای شروع کار و ارائه راهکارهای بهبود کایزن',
          source: 'ثبت سرپرست شیفت',
          method: 'مقیاس ۱ تا ۵ شایستگی',
          dir: 'more',
          scoringSource: 'supervisor',
          department: 'سالن تولید و مونتاژ (Production)',
          sourceFile: 'Production_MES_Kpi_1405.csv'
        }
      ]
    };

    const sampleHse: MultiSourceInputFile = {
      id: 'src-sample-hse',
      department: 'ایمنی، بهداشت و ۵اس (HSE & 5S)',
      filename: 'HSE_5S_Department_Matrix.json',
      format: 'json',
      rawContent: '{}',
      parsedCount: 3,
      criteria: [
        {
          code: 'S-HSE-01',
          name: 'رعایت پروتکل‌های حفاظت فردی و ایمنی کارگاهی',
          cat: 'S',
          def: 'استفاده مستمر از تجهیزات حفاظت فردی PPE و رعایت علائم هشدار دهنده سالن',
          source: 'چک‌لیست هفتگی ممیزی HSE',
          method: 'امتیاز ممیزی ایمنی ۱ تا ۵',
          dir: 'more',
          scoringSource: 'supervisor',
          department: 'ایمنی، بهداشت و ۵اس (HSE & 5S)',
          sourceFile: 'HSE_5S_Department_Matrix.json'
        },
        {
          code: 'S-5S-02',
          name: 'پاکیزگی ابزار و ساماندهی ارگونومیک ایستگاه کاری (Seiri/Seiton)',
          cat: 'S',
          def: 'استقرار استاندارد ابزارآلات بر روی تخته‌ابزار سایه‌دار و عدم تجمع ضایعات کف کارگاه',
          source: 'فرم ارزیابی ۵اس کارگاه',
          method: 'نمره چک‌لیست ۵اس',
          dir: 'more',
          scoringSource: 'supervisor',
          department: 'ایمنی، بهداشت و ۵اس (HSE & 5S)',
          sourceFile: 'HSE_5S_Department_Matrix.json'
        },
        {
          code: 'S-NEAR-01',
          name: 'گزارش‌دهی پیشگیرانه رویدادهای شبه‌حادثه (Near-Miss)',
          cat: 'S',
          def: 'شناسایی و ثبت شرایط ناایمن قبل از وقوع هرگونه آسیب جانی یا خسارت به ماشین‌آلات',
          source: 'کارتابل ثبت وقایع ایمنی HSE',
          method: 'تعداد گزارش معتبر ثبت‌شده',
          dir: 'more',
          scoringSource: 'supervisor',
          department: 'ایمنی، بهداشت و ۵اس (HSE & 5S)',
          sourceFile: 'HSE_5S_Department_Matrix.json'
        }
      ]
    };

    setSources([sampleQC, sampleProduction, sampleHse]);
  };

  const handleRemoveSource = (id: string) => {
    setSources(prev => prev.filter(s => s.id !== id));
  };

  // Compile combined criteria list based on strategy
  const combinedRawCriteria = useMemo(() => {
    const list: Array<Omit<Criterion, 'id'> & { 
      originalCode: string; 
      department: string; 
      sourceFile: string;
      mergeKey: string;
      isDuplicateInBank: boolean;
      existingItemInBank?: Criterion;
    }> = [];

    const existingCodeMap = new Map<string, Criterion>();
    (existingCriteria || []).forEach(c => {
      existingCodeMap.set(c.code.trim().toUpperCase(), c);
    });

    sources.forEach(src => {
      src.criteria.forEach((crit, idx) => {
        let finalCode = crit.code.trim().toUpperCase();

        if (mergeStrategy === 'prefix_dept') {
          // Generate a clean department prefix e.g. QC-, PRD-, HSE-
          const cleanDept = src.department.includes('QC') ? 'QC' :
                            src.department.includes('تولید') ? 'PRD' :
                            src.department.includes('HSE') ? 'HSE' :
                            src.department.includes('تعمیر') ? 'PM' :
                            src.department.substring(0, 3).toUpperCase();
          if (!finalCode.includes(cleanDept)) {
            finalCode = `${cleanDept}-${finalCode}`;
          }
        }

        const existingItem = existingCodeMap.get(finalCode);
        const isDuplicateInBank = Boolean(existingItem);

        list.push({
          ...crit,
          code: finalCode,
          originalCode: crit.code,
          department: crit.department || src.department,
          sourceFile: src.filename,
          mergeKey: `${finalCode}_${src.id}_${idx}`,
          isDuplicateInBank,
          existingItemInBank: existingItem
        });
      });
    });

    return list;
  }, [sources, existingCriteria, mergeStrategy]);

  // Available departments in the uploaded sources
  const departmentsInSources = useMemo(() => {
    const depts = new Set<string>();
    sources.forEach(s => depts.add(s.department));
    return Array.from(depts);
  }, [sources]);

  // Filtered view items
  const filteredPreviewList = useMemo(() => {
    return combinedRawCriteria.filter(item => {
      // Dept filter
      if (previewFilterDept !== 'ALL' && item.department !== previewFilterDept) return false;

      // Status filter
      if (previewStatusFilter === 'new' && item.isDuplicateInBank) return false;
      if (previewStatusFilter === 'update' && !item.isDuplicateInBank) return false;

      // Search term
      if (previewSearch.trim()) {
        const q = previewSearch.toLowerCase();
        const matches = 
          item.code.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          item.def.toLowerCase().includes(q) ||
          item.department.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [combinedRawCriteria, previewFilterDept, previewStatusFilter, previewSearch]);

  if (!isOpen) return null;

  // Toggle selection
  const handleToggleSelectAll = () => {
    if (selectedItemKeys.size === filteredPreviewList.length && filteredPreviewList.length > 0) {
      setSelectedItemKeys(new Set());
    } else {
      setSelectedItemKeys(new Set(filteredPreviewList.map(it => it.mergeKey)));
    }
  };

  const handleToggleItemSelect = (key: string) => {
    const next = new Set(selectedItemKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedItemKeys(next);
  };

  // Initialize selection when entering preview
  const handleProceedToPreview = () => {
    if (sources.length === 0) {
      alert('لطفاً حداقل یک منبع یا فایل ورودی اضافه کنید.');
      return;
    }
    const allKeys = new Set(combinedRawCriteria.map(it => it.mergeKey));
    setSelectedItemKeys(allKeys);
    setActiveStep('preview');
  };

  // Final Commit
  const handleExecuteCommit = () => {
    const itemsToCommit = combinedRawCriteria.filter(it => selectedItemKeys.has(it.mergeKey));
    if (itemsToCommit.length === 0) {
      alert('هیچ شاخصی جهت ثبت انتخاب نشده است.');
      return;
    }

    const uniqueCodes = new Set<string>();
    const deduplicated: Array<Omit<Criterion, 'id'> & { id?: string; department: string }> = [];

    let newCount = 0;
    let updateCount = 0;

    itemsToCommit.forEach(it => {
      if (uniqueCodes.has(it.code)) return; // prevent collision within this same batch
      uniqueCodes.add(it.code);

      if (it.isDuplicateInBank) {
        updateCount++;
      } else {
        newCount++;
      }

      deduplicated.push({
        code: it.code,
        name: it.name,
        cat: it.cat,
        def: it.def,
        source: it.source,
        method: it.method,
        dir: it.dir,
        scoringSource: it.scoringSource,
        unit: it.unit,
        targetValue: it.targetValue,
        department: it.department,
        id: it.existingItemInBank?.id
      });
    });

    onCommitMerge(deduplicated, mergeStrategy, {
      total: deduplicated.length,
      added: newCount,
      updated: updateCount,
      departments: departmentsInSources
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
      <div className={`relative w-full max-w-5xl rounded-3xl border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden ${
        theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        
        {/* MODAL HEADER */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-2xl">
              <Layers className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight">ورود دسته‌ای و تلفیق شاخص‌ها از چندین بخش و منبع</h2>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded-full font-extrabold">
                  Multi-Source Consolidation
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                تأمین شاخص‌ها از فایل‌های JSON و CSV بخش‌های مختلف سازمان، حل تداخل کدها و ثبت یکپارچه در بانک مرکزی
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Step indicators */}
            <div className="flex items-center bg-slate-950/60 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveStep('sources')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  activeStep === 'sources'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ۱. مدیریت منابع و فایل‌ها ({sources.length})
              </button>
              <button
                type="button"
                onClick={() => handleProceedToPreview()}
                disabled={sources.length === 0}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer disabled:opacity-40 ${
                  activeStep === 'preview'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ۲. پیش‌نمایش و ترکیب نهایی ({combinedRawCriteria.length})
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {activeStep === 'sources' ? (
            /* =========================================================================
               STEP 1: SOURCES & MULTI-FILE UPLOADER
               ========================================================================= */
            <div className="space-y-6">
              {/* Instructions banner */}
              <div className="bg-cyan-950/30 border border-cyan-500/20 p-4 rounded-2xl flex items-start gap-3 text-xs leading-relaxed text-cyan-200">
                <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">نحوه عملکرد تأمین چندبخشی:</p>
                  <p className="text-slate-300">
                    می‌توانید برای هر واحد سازمانی (مانند کیفیت، سالن تولید، HSE و...) یک یا چند فایل CSV یا JSON وارد کنید. سیستم شاخص‌های همه بخش‌ها را تجمیع نموده و پیش از ثبت، موارد مشابه یا تکراری را تفکیک و کالیبره می‌کند.
                  </p>
                </div>
              </div>

              {/* Upload Card */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Source Department selector & File Input */}
                <div className="md:col-span-2 bg-slate-950/60 border border-slate-800 p-5 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-cyan-400" />
                      <span>مشخصات بخش و انتخاب فایل ورودی:</span>
                    </h3>
                    <span className="text-[11px] text-slate-400">پشتیبانی کامل از UTF-8 فارسی</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-300">بخش / واحد سازمانی تأمین‌کننده:</label>
                    <select
                      value={selectedDeptInput}
                      onChange={(e) => setSelectedDeptInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                    >
                      {DEPARTMENT_PRESETS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                      <option value="custom">-- واحد سفارشی جدید... --</option>
                    </select>
                  </div>

                  {selectedDeptInput === 'custom' && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-300">عنوان واحد سفارشی:</label>
                      <input
                        type="text"
                        placeholder="مثال: امور بازرگانی و قراردادهای قطعه‌سازی"
                        value={customDeptInput}
                        onChange={(e) => setCustomDeptInput(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  )}

                  {/* Dropzone */}
                  <div className="border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-2xl p-6 text-center transition-all bg-slate-900/30 hover:bg-slate-900/60 relative cursor-pointer">
                    <input
                      type="file"
                      accept=".json,.csv,.txt,.xlsx"
                      multiple
                      onChange={handleFileUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <div className="flex flex-col items-center gap-2 pointer-events-none">
                      <div className="p-3 bg-cyan-500/10 rounded-full text-cyan-400">
                        <Upload className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-bold text-slate-200">
                        کلیک کنید یا فایل‌های Excel (XLSX)، CSV / JSON این بخش را به اینجا بکشید
                      </p>
                      <p className="text-[11px] text-slate-500">
                        امکان انتخاب همزمان چند فایل و استخراج خودکار شاخص‌ها
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quick Demo & Merge Strategy Setting */}
                <div className="space-y-4">
                  {/* Ready Sample Scenario */}
                  <div className="bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-500/30 p-5 rounded-2xl space-y-3">
                    <div className="flex items-center gap-2 text-indigo-300">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <h4 className="text-xs font-bold">تست سریع با سناریوی چندبخشی</h4>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      با یک کلیک، ۳ بسته شاخص واقعی از بخش‌های <strong className="text-slate-200">کنترل کیفیت</strong>، <strong className="text-slate-200">سالن تولید (MES)</strong> و <strong className="text-slate-200">ایمنی HSE</strong> بارگذاری کنید.
                    </p>
                    <button
                      type="button"
                      onClick={handleLoadSampleScenario}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>بارگذاری نمونه سناریوی آماده (داده‌های نمایشی)</span>
                    </button>
                  </div>

                  {/* Conflict Strategy Preset */}
                  <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-3">
                    <h4 className="text-xs font-bold text-slate-300">استراتژی تلفیق شاخص‌ها:</h4>
                    
                    <div className="space-y-2 text-xs">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="strategy"
                          checked={mergeStrategy === 'merge'}
                          onChange={() => setMergeStrategy('merge')}
                          className="mt-0.5 text-cyan-500"
                        />
                        <div>
                          <div className="font-bold text-slate-200">ترکیب و به‌روزرسانی هوشمند (Upsert)</div>
                          <div className="text-[10px] text-slate-400">شاخص‌های جدید اضافه و شاخص‌های با کد یکسان به‌روز می‌شوند.</div>
                        </div>
                      </label>

                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="strategy"
                          checked={mergeStrategy === 'prefix_dept'}
                          onChange={() => setMergeStrategy('prefix_dept')}
                          className="mt-0.5 text-cyan-500"
                        />
                        <div>
                          <div className="font-bold text-slate-200">افزودن پیشوند نام بخش (بدون تداخل)</div>
                          <div className="text-[10px] text-slate-400">به کدهای شاخص پیشوند بخش (مثلاً QC- یا PRD-) الصاق می‌شود.</div>
                        </div>
                      </label>

                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="strategy"
                          checked={mergeStrategy === 'skip_existing'}
                          onChange={() => setMergeStrategy('skip_existing')}
                          className="mt-0.5 text-cyan-500"
                        />
                        <div>
                          <div className="font-bold text-slate-200">صرف‌نظر از تکراری‌ها (فقط جدیدها)</div>
                          <div className="text-[10px] text-slate-400">کدهایی که در بانک موجودند دست‌نخورده باقی می‌مانند.</div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

              </div>

              {/* LIST OF LOADED SOURCES */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-cyan-400" />
                    <span>منابع و فایل‌های بارگذاری‌شده ({sources.length} منبع):</span>
                  </h3>
                  {sources.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSources([])}
                      className="text-xs text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> پاکسازی همه منابع
                    </button>
                  )}
                </div>

                {sources.length === 0 ? (
                  <div className="p-8 border border-dashed border-slate-800 rounded-2xl text-center text-slate-500 text-xs">
                    هنوز هیچ منبعی اضافه نشده است. فایلی را آپلود کنید یا دکمه «بارگذاری سناریوی چندبخشی» را بزنید.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sources.map(src => (
                      <div
                        key={src.id}
                        className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col justify-between gap-3 relative group"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold uppercase">
                              {src.format}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveSource(src.id)}
                              className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                              title="حذف منبع"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          
                          <div className="text-xs font-bold text-slate-200 truncate" title={src.filename}>
                            {src.filename}
                          </div>
                          
                          <div className="text-[11px] text-cyan-300 font-medium">
                            واحد: {src.department}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                          <span className="text-slate-400 text-[11px]">شاخص‌های استخراج‌شده:</span>
                          <span className="font-mono font-bold text-emerald-400">{src.parsedCount} مورد</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* =========================================================================
               STEP 2: CONSOLIDATED PREVIEW & SELECTION
               ========================================================================= */
            <div className="space-y-4">
              {/* Summary Stats Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400">کل شاخص‌های تجمیعی</div>
                  <div className="text-lg font-black text-white font-mono mt-0.5">{combinedRawCriteria.length}</div>
                </div>
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400">بخش‌های مبدأ</div>
                  <div className="text-lg font-black text-cyan-400 font-mono mt-0.5">{departmentsInSources.length}</div>
                </div>
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400">موارد جدید</div>
                  <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
                    {combinedRawCriteria.filter(c => !c.isDuplicateInBank).length}
                  </div>
                </div>
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400">موارد دارای تطابق / به‌روزرسانی</div>
                  <div className="text-lg font-black text-amber-400 font-mono mt-0.5">
                    {combinedRawCriteria.filter(c => c.isDuplicateInBank).length}
                  </div>
                </div>
              </div>

              {/* Filtering Toolbar */}
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                
                {/* Department filter chips */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400 font-bold ml-1">بخش:</span>
                  <button
                    type="button"
                    onClick={() => setPreviewFilterDept('ALL')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      previewFilterDept === 'ALL'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    همه ({combinedRawCriteria.length})
                  </button>
                  {departmentsInSources.map(d => {
                    const count = combinedRawCriteria.filter(c => c.department === d).length;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setPreviewFilterDept(d)}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          previewFilterDept === d
                            ? 'bg-cyan-600 text-white'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {d} ({count})
                      </button>
                    );
                  })}
                </div>

                {/* Status chips and search */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setPreviewStatusFilter('all')}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        previewStatusFilter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400'
                      }`}
                    >
                      همه
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewStatusFilter('new')}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        previewStatusFilter === 'new' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                      }`}
                    >
                      فقط جدید
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewStatusFilter('update')}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        previewStatusFilter === 'update' ? 'bg-amber-600 text-white' : 'text-slate-400'
                      }`}
                    >
                      به‌روزرسانی
                    </button>
                  </div>

                  <div className="relative w-48">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="جستجوی کد، عنوان..."
                      value={previewSearch}
                      onChange={e => setPreviewSearch(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg pr-8 pl-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

              </div>

              {/* STAGED TABLE */}
              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/70">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-bold">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={filteredPreviewList.length > 0 && selectedItemKeys.size === filteredPreviewList.length}
                          onChange={handleToggleSelectAll}
                          className="rounded text-cyan-500 cursor-pointer"
                        />
                      </th>
                      <th className="p-3 w-28">کد شاخص</th>
                      <th className="p-3">عنوان شاخص</th>
                      <th className="p-3 w-28">دسته‌بندی</th>
                      <th className="p-3 w-44">بخش تأمین‌کننده</th>
                      <th className="p-3 w-28">منبع نمره</th>
                      <th className="p-3 w-28 text-center">وضعیت ثبت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredPreviewList.map(item => {
                      const isSelected = selectedItemKeys.has(item.mergeKey);
                      return (
                        <tr
                          key={item.mergeKey}
                          onClick={() => handleToggleItemSelect(item.mergeKey)}
                          className={`hover:bg-slate-800/40 cursor-pointer transition-colors ${
                            isSelected ? 'bg-cyan-950/15' : ''
                          }`}
                        >
                          <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleItemSelect(item.mergeKey)}
                              className="rounded text-cyan-500 cursor-pointer"
                            />
                          </td>
                          <td className="p-3 font-mono font-bold text-cyan-300">
                            {item.code}
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-200">{item.name}</div>
                            <div className="text-[11px] text-slate-400 line-clamp-1">{item.def}</div>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                              {item.cat === 'K' ? 'کمی (K)' : item.cat === 'Q' ? 'کیفی (Q)' : item.cat === 'B' ? 'رفتاری (B)' : item.cat === 'S' ? 'ایمنی (S)' : 'شایستگی (L)'}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="text-slate-300 truncate max-w-[170px]" title={item.department}>
                              {item.department}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono truncate">{item.sourceFile}</div>
                          </td>
                          <td className="p-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              item.scoringSource === 'mis' ? 'bg-blue-500/10 text-blue-400' :
                              item.scoringSource === 'kasra' ? 'bg-amber-500/10 text-amber-400' :
                              item.scoringSource === 'multi_source' ? 'bg-purple-500/10 text-purple-400' :
                              'bg-emerald-500/10 text-emerald-400'
                            }`}>
                              {item.scoringSource === 'mis' ? 'سامانه MIS' :
                               item.scoringSource === 'kasra' ? 'کسری' :
                               item.scoringSource === 'multi_source' ? 'چندمنبعی' : 'سرپرست مستقیم'}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {item.isDuplicateInBank ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                                <AlertTriangle className="w-3 h-3" />
                                <span>به‌روزرسانی کد</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>شاخص جدید</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            {activeStep === 'preview' ? (
              <button
                type="button"
                onClick={() => setActiveStep('sources')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition flex items-center gap-1.5"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>بازگشت به منابع و فایل‌ها</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition"
              >
                انصراف
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {activeStep === 'sources' ? (
              <button
                type="button"
                onClick={handleProceedToPreview}
                disabled={sources.length === 0}
                className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-cyan-600/20 cursor-pointer transition"
              >
                <span>مرحله بعد: پیش‌نمایش و ترکیب شاخص‌ها</span>
                <ArrowRight className="w-4 h-4 rotate-180" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleExecuteCommit}
                disabled={selectedItemKeys.size === 0}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-40 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 shadow-xl shadow-emerald-500/20 cursor-pointer transition"
              >
                <Check className="w-4 h-4" />
                <span>ترکیب و ثبت نهایی در بانک شاخص‌ها ({selectedItemKeys.size} شاخص)</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

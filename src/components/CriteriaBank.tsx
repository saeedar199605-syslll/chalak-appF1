/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { validateCriterionInput } from '../utils/validation';
import { criterionScoringClearableKeys, mergeCriterionEdit } from '../utils/criterionScoring';
import { 
  FileSpreadsheet, 
  Plus, 
  Search, 
  Filter, 
  Info, 
  Edit3, 
  Trash2, 
  ArrowUpRight, 
  ArrowDownLeft, 
  ArrowUp,
  ArrowDown,
  CheckCircle2, 
  AlertCircle, 
  UploadCloud, 
  Layers, 
  Sparkles, 
  Download,
  Calculator,
  Zap,
  Building2,
  Clock,
  UserCheck,
  Cpu,
  Database,
  GitFork,
  X
} from 'lucide-react';
import { Criterion, CategoryKey, CATEGORIES, Employee, JobProfile, Evaluation, CriterionScoringSource, MisMetricKey } from '../types';
import UniversalDataExchange, { DataExchangeConfig } from './UniversalDataExchange';
import KpiFormulaEngineModal from './KpiFormulaEngineModal';
import MultiSourceCriteriaImportModal, { MergeStrategy } from './MultiSourceCriteriaImportModal';
import { db } from '../utils/db';

interface CriteriaBankProps {
  criteria: Criterion[];
  onAddCriterion: (crit: Omit<Criterion, 'id'>) => boolean;
  onUpdateCriterion: (id: string, crit: Omit<Criterion, 'id'>) => boolean;
  onDeleteCriterion: (id: string) => void;
  onBulkDeleteCriteria?: (ids: string[]) => void;
  onBatchAddCriteria?: (
    newOrUpdatedList: Array<Omit<Criterion, 'id'> & { id?: string }>,
    mode?: MergeStrategy
  ) => void;
  employees?: Employee[];
  profiles?: JobProfile[];
  evaluations?: Evaluation[];
  onUpdateEvaluations?: (nextEvals: Evaluation[]) => void;
  theme?: 'dark' | 'light';
}

// Predefined industrial competency presets for fast 1-click library loading
const PRESET_LIBRARIES = [
  {
    title: 'بسته شاخص‌های کمی سالن‌های تولید و ماشین‌کاری (KPI)',
    category: 'K' as CategoryKey,
    description: 'شاخص‌های کلیدی OEE، نرخ ضایعات، راندمان شیفت، تحقق برنامه تولید و توقفات خط',
    items: [
      { code: 'K-PRD-01', cat: 'K' as CategoryKey, name: 'درصد تحقق برنامه زمان‌بندی تولید', def: 'نسبت قطعات سالم خروجی از خط به برنامه مصوب شیفت در سامانه MES', source: 'سامانه MES کارخانه', method: 'درصد کمی (بیشتر بهتر)', dir: 'more' as const },
      { code: 'K-PRD-02', cat: 'K' as CategoryKey, name: 'اثربخشی کلی تجهیزات (OEE)', def: 'محاسبه حاصلضرب در دسترس بودن، نرخ کارایی و نرخ کیفیت ایستگاه', source: 'سیستم مانیتورینگ PLC', method: 'شاخص درصدی OEE', dir: 'more' as const },
      { code: 'K-PRD-03', cat: 'K' as CategoryKey, name: 'نرخ ضایعات قطعات حین تولید', def: 'تعداد قطعات اسقاطی نسبت به کل ورودی مواد اولیه خط', source: 'گزارش شیفت ضایعات', method: 'درصد وزنی (کمتر بهتر)', dir: 'less' as const },
      { code: 'K-PRD-04', cat: 'K' as CategoryKey, name: 'میانگین زمان توقفات اضطراری خط (MTTR)', def: 'مجموع دقایق توقف ناخواسته به علت نقص فنی یا عدم تغذیه خط', source: 'لاگ نگهداری تعمیرات', method: 'دقیقه بر شیفت (کمتر بهتر)', dir: 'less' as const }
    ]
  },
  {
    title: 'بسته شاخص‌های کنترل کیفیت و آزمایشگاه (QC / QA)',
    category: 'K' as CategoryKey,
    description: 'شامل نرخ عدم انطباق، دقت تست‌های آزمایشگاهی، کالیبراسیون ابزار و برگشتی مشتری',
    items: [
      { code: 'K-QC-01', cat: 'K' as CategoryKey, name: 'نرخ بازرسی بدون نقص فرآیندی (FTT)', def: 'درصد عبور قطعات در اولین مرحله تست کنترل کیفی بدون نیاز به دوباره‌کاری', source: 'کارتابل بازرسی کیفیت', method: 'First Time Through %', dir: 'more' as const },
      { code: 'K-QC-02', cat: 'K' as CategoryKey, name: 'شکایات کیفی مشتری یا ادعای گارانتی (PPM)', def: 'تعداد گزارش‌های عدم انطباق ارسالی از طرف مشتریان یا نمایندگی‌ها', source: 'سیستم CRM و خدمات پس از فروش', method: 'تعداد بر میلیون (کمتر بهتر)', dir: 'less' as const },
      { code: 'B-QC-01', cat: 'B' as CategoryKey, name: 'دقت در مستندسازی نتایج تست و نمونه‌برداری', def: 'رعایت کامل دستورالعمل‌های بازرسی و ثبت بی‌درنگ داده‌ها در فرمت استاندارد', source: 'ممیزی ادواری تضمین کیفیت', method: 'مقیاس ۱ تا ۵ رفتاری' }
    ]
  },
  {
    title: 'بسته شایستگی‌های ایمنی، بهداشت و ۵اس (HSE & 5S)',
    category: 'B' as CategoryKey,
    description: 'الگوهای رفتار ایمن، استفاده از PPE، ساماندهی محیط کار و اصول آراستگی صنعتی',
    items: [
      { code: 'B-HSE-01', cat: 'B' as CategoryKey, name: 'رعایت پروتکل‌های ایمنی و استفاده از لوازم حفاظت فردی', def: 'استفاده مستمر از کلاه، کفش ایمنی، دستکش عایق و عینک در محدوده کارگاه', source: 'چک‌لیست ممیزی HSE', method: 'ممیزی ۱ تا ۵ سرپرست' },
      { code: 'B-5S-01', cat: 'B' as CategoryKey, name: 'اجرای استانداردهای آراستگی محیط کار (5S)', def: 'پاکیزگی دائمی ماشین‌آلات، مرتب‌سازی ابزارآلات در محل استاندارد و تفکیک زوائد', source: 'ممیزی هفتگی ۵اس', method: 'امتیاز چک‌لیست ۵اس' },
      { code: 'B-TEAM-01', cat: 'B' as CategoryKey, name: 'روحیه کار تیمی، انتقال تجربه و آموزش همکاران جدید', def: 'مشارکت فعال در حل مسائل گروهی و آموزش تجارب فنی به نیروهای تازه جذب شده', source: 'مشاهده سرپرست و بازخورد ۳۶۰', method: 'مقیاس ۱ تا ۵ شایستگی' }
    ]
  },
  {
    title: 'بسته شایستگی‌های راه‌اندازی سریع و تنظیمات قالب (SMED)',
    category: 'K' as CategoryKey,
    description: 'زمان تعویض خط و قالب، تنظیم پارامترهای پرس و ماشین‌کاری CNC',
    items: [
      { code: 'K-SET-01', cat: 'K' as CategoryKey, name: 'زمان تعویض قالب و ستاپ خط (Setup Time)', def: 'مدت زمان از آخرین قطعه سالم تیراژ قبل تا اولین قطعه سالم تیراژ بعد', source: 'زمان‌سنجی تولید', method: 'دقیقه (کمتر بهتر)', dir: 'less' as const },
      { code: 'K-SET-02', cat: 'K' as CategoryKey, name: 'صحت تنظیم پارامترهای حرارتی و فشار هیدرولیک', def: 'تنظیم دقیق دستگاه‌ها بدون ایجاد تابیدگی یا تنش در قطعه اولیه', source: 'چک‌لیست راه‌اندازی دستگاه', method: 'نرخ انطباق پارامترها', dir: 'more' as const }
    ]
  }
];

export default function CriteriaBank({ 
  criteria, 
  onAddCriterion, 
  onUpdateCriterion, 
  onDeleteCriterion,
  onBulkDeleteCriteria,
  onBatchAddCriteria,
  employees = [],
  profiles = [],
  evaluations = [],
  onUpdateEvaluations,
  theme = 'dark'
}: CriteriaBankProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCat, setSelectedCat] = useState<CategoryKey | 'ALL'>('ALL');

  // Bulk selection state for criteria
  const [selectedCritIds, setSelectedCritIds] = useState<Set<string>>(new Set());
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [criterionToDelete, setCriterionToDelete] = useState<Criterion | null>(null);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  // Multi-Source Bulk Import Modal State
  const [isMultiSourceModalOpen, setIsMultiSourceModalOpen] = useState(false);
  const [multiSourceNotice, setMultiSourceNotice] = useState<string | null>(null);

  // Bulk Import Modal State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isExchangeModalOpen, setIsExchangeModalOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkStatusMsg, setBulkStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const handleCommitMultiSource = (
    mergedCriteria: Array<Omit<Criterion, 'id'> & { id?: string }>,
    strategy: MergeStrategy,
    stats: { total: number; added: number; updated: number; departments: string[] }
  ) => {
    if (onBatchAddCriteria) {
      onBatchAddCriteria(mergedCriteria, strategy);
    } else {
      const mode = strategy === 'replace' ? 'replace' : strategy === 'skip_existing' ? 'skip_existing' : 'merge';
      db.saveCriteriaBatch(mergedCriteria, mode);
    }

    setMultiSourceNotice(
      `تلفیق موفقیت‌آمیز: تعداد ${stats.total} شاخص از ${stats.departments.length} بخش سازمانی با موفقیت در بانک شاخص‌ها ثبت شد (${stats.added} شاخص جدید، ${stats.updated} به‌روزرسانی).`
    );
    setTimeout(() => setMultiSourceNotice(null), 8000);
  };

  const criteriaExchangeConfig: DataExchangeConfig<Criterion> = {
    entityName: 'بانک مرکزی شاخص‌ها و سنجه‌ها',
    entityKey: 'criteria',
    items: criteria,
    csvHeaders: [
      { key: 'code', label: 'کد شاخص' },
      { key: 'name', label: 'عنوان شاخص' },
      { key: 'cat', label: 'دسته‌بندی (K/B)', accessor: (c) => c.cat },
      { key: 'def', label: 'تعریف عملیاتی و سنجه' },
      { key: 'source', label: 'منبع داده و استخراج', accessor: (c) => c.source || '' },
      { key: 'method', label: 'روش و فرمول سنجش', accessor: (c) => c.method || '' },
      { key: 'dir', label: 'جهت مطلوبیت (more/less)', accessor: (c) => c.dir || 'more' },
      { key: 'targetValue', label: 'مقدار هدف', accessor: c => c.targetValue ?? '' },
      { key: 'score5', label: 'آستانه نمره ۵', accessor: c => c.scoreThresholds?.score5 ?? '' },
      { key: 'score4', label: 'آستانه نمره ۴', accessor: c => c.scoreThresholds?.score4 ?? '' },
      { key: 'score3', label: 'آستانه نمره ۳', accessor: c => c.scoreThresholds?.score3 ?? '' },
      { key: 'score2', label: 'آستانه نمره ۲', accessor: c => c.scoreThresholds?.score2 ?? '' },
      { key: 'allowedScoreMin', label: 'حداقل نمره مجاز', accessor: c => c.allowedScoreMin ?? '' },
      { key: 'allowedScoreMax', label: 'حداکثر نمره مجاز', accessor: c => c.allowedScoreMax ?? '' }
    ],
    templateSampleRows: [
      { 'کد شاخص': 'K-PRD-10', 'عنوان شاخص': 'درصد تحقق برنامه خط مونتاژ', 'دسته‌بندی (K/B)': 'K', 'تعریف عملیاتی و سنجه': 'تولید واقعی تقسیم بر برنامه مصوب', 'منبع داده و استخراج': 'سیستم MES', 'روش و فرمول سنجش': 'درصد کمی', 'جهت مطلوبیت (more/less)': 'more' },
      { 'کد شاخص': 'B-HSE-02', 'عنوان شاخص': 'رعایت نظم و ایمنی صنعتی', 'دسته‌بندی (K/B)': 'B', 'تعریف عملیاتی و سنجه': 'رعایت کلیه موارد ایمنی و ۵اس', 'منبع داده و استخراج': 'ممیزی HSE', 'روش و فرمول سنجش': 'مقیاس ۱ تا ۵', 'جهت مطلوبیت (more/less)': 'more' }
    ],
    onImport: (importedItems, mode) => {
      let count = 0;
      const errors: string[] = [];

      importedItems.forEach((item: any, index: number) => {
        const rowNum = index + 1;
        const rawCode = (item.code || item['کد شاخص'] || `C-${Math.floor(Math.random() * 1000)}`).trim();
        const rawName = (item.name || item['عنوان شاخص'] || 'شاخص جدید').trim();
        const rawCat = ((item.cat || item['دسته‌بندی (K/B)'] || item['دسته‌بندی'] || 'K').toString().toUpperCase().startsWith('B') ? 'B' : 'K') as CategoryKey;
        const rawDef = (item.def || item['تعریف عملیاتی و سنجه'] || item['تعریف عملیاتی'] || `تعریف عملیاتی شاخص ${rawName}`).trim();
        const rawSource = (item.source || item['منبع داده و استخراج'] || item['منبع داده'] || 'سیستم کارخانه').trim();
        const rawMethod = (item.method || item['روش و فرمول سنجش'] || item['روش سنجش'] || 'سنجش دوره‌ای').trim();
        const rawDir = ((item.dir || item['جهت مطلوبیت (more/less)'] || item['جهت مطلوبیت'] || 'more') === 'less' ? 'less' : 'more') as 'more' | 'less';

        const candidate = {
          code: rawCode,
          name: rawName,
          cat: rawCat,
          def: rawDef,
          source: rawSource,
          method: rawMethod,
          dir: rawDir,
          targetValue: item.targetValue ?? item['مقدار هدف'] ?? undefined,
          scoreThresholds: ['score5', 'score4', 'score3', 'score2'].some(key => item[key] !== undefined && item[key] !== '')
            ? { score5: Number(item.score5), score4: Number(item.score4), score3: Number(item.score3), score2: Number(item.score2) }
            : item.scoreThresholds,
          allowedScoreMin: item.allowedScoreMin ?? item['حداقل نمره مجاز'] ?? undefined,
          allowedScoreMax: item.allowedScoreMax ?? item['حداکثر نمره مجاز'] ?? undefined,
          scoringSource: item.scoringSource,
          formulaExpression: item.formulaExpression,
          calculationType: item.calculationType,
          variables: item.variables,
          unit: item.unit,
          multiSourceConfig: item.multiSourceConfig,
          misMetricKey: item.misMetricKey,
          customMetricField: item.customMetricField,
          autoPopulate: item.autoPopulate,
          misTargetValue: item.misTargetValue,
        };

        const validation = validateCriterionInput(candidate);
        if (!validation.success) {
          errors.push(`سطر ${rowNum} (${rawCode}): ${validation.errors.join('، ')}`);
          return;
        }

        const validCrit = validation.data;
        const existing = criteria.find(c => c.code.toLowerCase() === validCrit.code.toLowerCase());

        if (existing) {
          if (mode === 'replace' || mode === 'merge') {
            const ok = onUpdateCriterion(existing.id, mergeCriterionEdit(existing, validCrit));
            if (ok) count++;
          }
        } else {
          const ok = onAddCriterion(validCrit);
          if (ok) count++;
        }
      });

      return {
        count,
        message: `تعداد ${count} شاخص شایستگی با موفقیت در بانک شاخص‌ها ثبت و به‌روزرسانی شد.`,
        errors
      };
    }
  };
  
  // Form values
  const [formCode, setFormCode] = useState('');
  const [formCat, setFormCat] = useState<CategoryKey>('K');
  const [formName, setFormName] = useState('');
  const [formDef, setFormDef] = useState('');
  const [formSource, setFormSource] = useState('');
  const [formMethod, setFormMethod] = useState('');
  const [formDir, setFormDir] = useState<'more' | 'less'>('more');
  const [formScoringSource, setFormScoringSource] = useState<CriterionScoringSource>('supervisor');
  const [formMisMetricKey, setFormMisMetricKey] = useState<MisMetricKey>('efficiency');
  const [formCustomMetricField, setFormCustomMetricField] = useState('');
  const [formAutoPopulate, setFormAutoPopulate] = useState(true);
  const [formMisTargetValue, setFormMisTargetValue] = useState<string>('');
  const [formAllowedScoreMin, setFormAllowedScoreMin] = useState('');
  const [formAllowedScoreMax, setFormAllowedScoreMax] = useState('');
  const [formTargetValue, setFormTargetValue] = useState('');
  const [formThresholds, setFormThresholds] = useState({ score5: '', score4: '', score3: '', score2: '' });
  const [selectedSource, setSelectedSource] = useState<string>('ALL');
  const [errorMsg, setErrorMsg] = useState('');
  const [isFormulaModalOpen, setIsFormulaModalOpen] = useState(false);

  const openForm = (crit?: Criterion) => {
    if (crit) {
      setEditingId(crit.id);
      setFormCode(crit.code);
      setFormCat(crit.cat);
      setFormName(crit.name);
      setFormDef(crit.def);
      setFormSource(crit.source || '');
      setFormMethod(crit.method || '');
      setFormDir(crit.dir || 'more');
      setFormScoringSource(crit.scoringSource || (crit.cat === 'K' ? 'mis' : crit.code.startsWith('B-01') ? 'kasra' : 'supervisor'));
      setFormMisMetricKey(crit.misMetricKey || (crit.code === 'K-04' ? 'scrap_rate' : 'efficiency'));
      setFormCustomMetricField(crit.customMetricField || '');
      setFormAutoPopulate(crit.autoPopulate !== undefined ? crit.autoPopulate : true);
      setFormMisTargetValue(crit.misTargetValue !== undefined ? String(crit.misTargetValue) : '');
      setFormAllowedScoreMin(crit.allowedScoreMin !== undefined ? String(crit.allowedScoreMin) : '');
      setFormAllowedScoreMax(crit.allowedScoreMax !== undefined ? String(crit.allowedScoreMax) : '');
      setFormTargetValue(crit.targetValue !== undefined ? String(crit.targetValue) : '');
      setFormThresholds({
        score5: crit.scoreThresholds ? String(crit.scoreThresholds.score5) : '',
        score4: crit.scoreThresholds ? String(crit.scoreThresholds.score4) : '',
        score3: crit.scoreThresholds ? String(crit.scoreThresholds.score3) : '',
        score2: crit.scoreThresholds ? String(crit.scoreThresholds.score2) : '',
      });
    } else {
      setEditingId(null);
      setFormCode('');
      setFormCat('K');
      setFormName('');
      setFormDef('');
      setFormSource('');
      setFormMethod('');
      setFormDir('more');
      setFormScoringSource('supervisor');
      setFormMisMetricKey('efficiency');
      setFormCustomMetricField('');
      setFormAutoPopulate(true);
      setFormMisTargetValue('');
      setFormAllowedScoreMin('');
      setFormAllowedScoreMax('');
      setFormTargetValue('');
      setFormThresholds({ score5: '', score4: '', score3: '', score2: '' });
    }
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const rawData = {
      code: formCode,
      cat: formCat,
      name: formName,
      def: formDef,
      source: formSource || (formScoringSource === 'mis' ? 'سامانه تولید و کیفیت MIS/MES' : formScoringSource === 'kasra' ? 'سامانه حضور و غیاب کسری' : 'ارزیابی سرپرست مستقیم'),
      method: formMethod || undefined,
      dir: formCat === 'K' ? formDir : undefined,
      scoringSource: formScoringSource,
      misMetricKey: (formScoringSource === 'mis' || formScoringSource === 'kasra') ? formMisMetricKey : undefined,
      customMetricField: formCustomMetricField.trim() ? formCustomMetricField.trim() : undefined,
      autoPopulate: formAutoPopulate,
      misTargetValue: formMisTargetValue ? Number(formMisTargetValue) : undefined,
      allowedScoreMin: formScoringSource === 'supervisor' && formAllowedScoreMin !== '' ? Number(formAllowedScoreMin) : undefined,
      allowedScoreMax: formScoringSource === 'supervisor' && formAllowedScoreMax !== '' ? Number(formAllowedScoreMax) : undefined,
      targetValue: formTargetValue !== '' ? Number(formTargetValue) : undefined,
      scoreThresholds: Object.values(formThresholds).every(value => value !== '')
        ? Object.fromEntries(Object.entries(formThresholds).map(([key, value]) => [key, Number(value)]))
        : undefined,
    };

    const thresholdCount = Object.values(formThresholds).filter(value => value !== '').length;
    if (thresholdCount > 0 && thresholdCount < 4) {
      setErrorMsg('برای ثبت آستانه KPI، هر چهار مقدار نمره ۵ تا ۲ را کامل کنید.');
      return;
    }

    const validation = validateCriterionInput(rawData);
    if (!validation.success) {
      setErrorMsg(validation.errors.join(' | '));
      return;
    }

    const existingCriterion = editingId ? criteria.find(criterion => criterion.id === editingId) : undefined;
    const payload = existingCriterion
      ? mergeCriterionEdit(existingCriterion, validation.data, criterionScoringClearableKeys({ cat: formCat, scoringSource: formScoringSource }))
      : validation.data;

    let success = false;
    if (editingId) {
      success = onUpdateCriterion(editingId, payload);
    } else {
      success = onAddCriterion(payload);
    }

    if (success) {
      setIsModalOpen(false);
    } else {
      setErrorMsg('کد معیار تکراری است یا مشکلی در ذخیره‌سازی وجود دارد.');
    }
  };

  // Bulk Import Handlers
  const handleLoadPreset = (presetItems: typeof PRESET_LIBRARIES[0]['items']) => {
    let addedCount = 0;
    presetItems.forEach(item => {
      const exists = criteria.some(c => c.code.toLowerCase() === item.code.toLowerCase());
      if (!exists) {
        const ok = onAddCriterion(item);
        if (ok) addedCount++;
      }
    });

    if (addedCount > 0) {
      setBulkStatusMsg({ text: `تعداد ${addedCount} معیار استاندارد با موفقیت به بانک شاخص‌ها افزوده شد.`, type: 'success' });
    } else {
      setBulkStatusMsg({ text: 'تمامی معیارهای این بسته از قبل در بانک شاخص‌ها وجود دارند.', type: 'info' });
    }
  };

  const handleProcessBulkText = () => {
    if (!bulkText.trim()) {
      setBulkStatusMsg({ text: 'لطفاً خطوط اطلاعات معیارها را در کادر متنی وارد کنید.', type: 'error' });
      return;
    }

    const lines = bulkText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let addedCount = 0;

    lines.forEach(line => {
      const parts = line.includes('\t') ? line.split('\t') : line.split(',');
      if (parts.length >= 3) {
        const code = parts[0]?.trim();
        const cat = (parts[1]?.trim().toUpperCase() === 'B' ? 'B' : 'K') as CategoryKey;
        const name = parts[2]?.trim();
        const def = parts[3]?.trim() || `تعریف عملیاتی سنجه ${name}`;
        const source = parts[4]?.trim() || 'سیستم اطلاعاتی کارخانه';
        const method = parts[5]?.trim() || 'سنجش دوره‌ای';
        const dir = (parts[6]?.trim() === 'less' ? 'less' : 'more') as 'more' | 'less';

        if (code && name) {
          const exists = criteria.some(c => c.code.toLowerCase() === code.toLowerCase());
          if (!exists) {
            const ok = onAddCriterion({
              code,
              cat,
              name,
              def,
              source,
              method,
              dir: cat === 'K' ? dir : undefined
            });
            if (ok) addedCount++;
          }
        }
      }
    });

    if (addedCount > 0) {
      setBulkStatusMsg({ text: `تعداد ${addedCount} معیار جدید با موفقیت به بانک اضافه شدند.`, type: 'success' });
      setBulkText('');
    } else {
      setBulkStatusMsg({ text: 'هیچ معیار جدیدی اضافه نشد. لطفاً ساختار داده‌ها را بررسی فرمایید.', type: 'error' });
    }
  };

  // Filter criteria
  const filteredCriteria = criteria.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.def.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCat === 'ALL' || c.cat === selectedCat;
    
    // Effective scoring source
    const effectiveSource = c.scoringSource || (c.cat === 'K' ? 'mis' : c.code.startsWith('B-01') ? 'kasra' : 'supervisor');
    const matchesSource = selectedSource === 'ALL' || effectiveSource === selectedSource;

    return matchesSearch && matchesCat && matchesSource;
  });

  const handleToggleSelectAll = () => {
    if (selectedCritIds.size === filteredCriteria.length) {
      setSelectedCritIds(new Set());
    } else {
      setSelectedCritIds(new Set(filteredCriteria.map(c => c.id)));
    }
  };

  const handleToggleSelect = (id: string, e?: React.MouseEvent | React.ChangeEvent) => {
    if (e) e.stopPropagation();
    const next = new Set(selectedCritIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedCritIds(next);
  };

  const handleExecuteBulkDelete = () => {
    if (selectedCritIds.size === 0) return;
    setIsBulkDeleteModalOpen(true);
  };

  const handleConfirmBulkDelete = () => {
    if (selectedCritIds.size === 0) return;
    if (onBulkDeleteCriteria) {
      onBulkDeleteCriteria(Array.from(selectedCritIds));
    } else {
      selectedCritIds.forEach(id => onDeleteCriterion(id));
    }
    setSelectedCritIds(new Set());
    setIsBulkDeleteModalOpen(false);
  };

  return (
<div className="app-page space-y-7 text-right" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-end flex-wrap gap-5 border-b border-slate-200/80 pb-5 dark:border-slate-800/80">
        <div>
          <p className="mb-1.5 text-xs font-bold text-teal-700 dark:text-teal-300">معیارهای مصوب و محاسبات عملکرد</p>
          <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>بانک مرکزی معیارها</h1>
          <p className={`text-sm mt-2 leading-7 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
            اصل طلایی ارزیابی: <span className="text-teal-600 font-semibold">«انتخاب، نه ابداع»</span>. هر معیار با تایید کمیته ارزیابی وارد این بانک می‌شود.
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setIsMultiSourceModalOpen(true)}
            className="min-h-11 bg-white hover:bg-slate-50 text-slate-700 dark:bg-slate-900/70 dark:hover:bg-slate-800 dark:text-slate-200 font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            <Layers className="w-4 h-4" />
            <span>ورود چندبخشی و تلفیق شاخص‌ها (XLSX/CSV/JSON)</span>
          </button>

          <button
            type="button"
            onClick={() => setIsFormulaModalOpen(true)}
            className="min-h-11 bg-white hover:bg-slate-50 text-slate-700 dark:bg-slate-900/70 dark:hover:bg-slate-800 dark:text-slate-200 font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            <Calculator className="w-4 h-4" />
            <span>موتور فرمول‌ساز و محاسبات خودکار KPI</span>
          </button>

          <button
            onClick={() => setIsExchangeModalOpen(true)}
            className="min-h-11 bg-white hover:bg-slate-50 text-slate-700 dark:bg-slate-900/70 dark:hover:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>ورود و خروجی کامل (اکسل/JSON)</span>
          </button>

          <button
            onClick={() => {
              setBulkStatusMsg(null);
              setIsBulkModalOpen(true);
            }}
            className="min-h-11 bg-white hover:bg-slate-50 text-slate-700 dark:bg-slate-900/70 dark:hover:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-colors cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            <span>بسته‌های استاندارد آماده</span>
          </button>
          
          <button
            onClick={() => openForm()}
            className="min-h-11 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>افزودن معیار تکی</span>
          </button>
        </div>
      </div>

      {/* Multi-Source Import Notice Alert */}
      {multiSourceNotice && (
        <div className={`border p-4 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-lg animate-fade-in ${
          theme === 'dark' 
            ? 'bg-gradient-to-r from-cyan-950/60 to-emerald-950/40 border-cyan-500/40 text-cyan-200' 
            : 'bg-gradient-to-r from-cyan-100 to-emerald-50 border-cyan-300 text-cyan-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className={`w-5 h-5 shrink-0 ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`} />
            <span className="font-bold">{multiSourceNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setMultiSourceNotice(null)}
            className={`p-1 rounded-lg cursor-pointer ${theme === 'dark' ? 'text-cyan-400 hover:text-white' : 'text-cyan-600 hover:text-cyan-800'}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Info Warning */}
      <div className={`border p-4 rounded-2xl flex gap-3 text-xs leading-relaxed ${
        theme === 'dark' ? 'bg-amber-500/10 border-amber-500/20 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-800'
      }`}>
        <Info className={`w-5 h-5 shrink-0 mt-0.5 ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`} />
        <div>
          <p className="font-bold">مقررات کمیته مدیریت منابع انسانی:</p>
          <p className={`mt-1 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
            اپراتورها و سرپرستان مجاز به تعریف شاخص‌های سلیقه‌ای یا جدید نیستند. تنوع بالای سنجه‌ها منجر به انحراف ارزیابی می‌شود. معیارهای جدید حتماً باید دارای تعریف دقیق عملیاتی، فرمول اندازه‌گیری شفاف و محل ردیابی در سیستم‌های اطلاعاتی سازمان (MES/WMS/HSE) باشند.
          </p>
        </div>
      </div>

      {/* Filters and Search Bar (Sticky Action Bar) */}
      <div className={`sticky top-0 z-30 border p-4 rounded-2xl flex flex-wrap gap-4 items-start shadow-sm ${
        theme === 'dark' 
          ? 'bg-slate-900/95 backdrop-blur-xl border-slate-800/80' 
          : 'bg-slate-100 border-slate-300'
      }`}>
        {/* Search */}
        <div className="relative w-full min-w-0 sm:w-80">
          <Search className={`w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 ${
            theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
          }`} />
          <input
            type="text"
            placeholder="جستجو در نام، کد یا تعریف عملیاتی..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full border rounded-xl py-2.5 pr-10 pl-3 text-xs focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 ${
              theme === 'dark' 
                ? 'bg-slate-900/60 border-slate-700/50 text-slate-200 placeholder-slate-500' 
                : 'bg-white border-slate-300 text-slate-800 placeholder-slate-500'
            }`}
          />
        </div>

        {/* Categories Pills */}
        <div className="flex w-full min-w-0 flex-wrap gap-1.5 xl:w-auto">
          <button
            onClick={() => setSelectedCat('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedCat === 'ALL'
                ? (theme === 'dark' ? 'bg-slate-700 text-slate-100' : 'bg-slate-700 text-white')
                : (theme === 'dark' ? 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200' : 'text-slate-600 hover:bg-slate-200/80 hover:text-slate-800')
            }`}
          >
            همه معیارها ({criteria.length})
          </button>
          {(Object.keys(CATEGORIES) as CategoryKey[]).map((cat) => {
            const count = criteria.filter(c => c.cat === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCat(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedCat === cat
                    ? (theme === 'dark' ? 'bg-teal-500/10 text-teal-300 border border-teal-500/20' : 'bg-teal-100 text-teal-700 border border-teal-200')
                    : (theme === 'dark' ? 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200' : 'text-slate-600 hover:bg-slate-200/80 hover:text-slate-800')
                }`}>
                {CATEGORIES[cat]} ({count})
              </button>
            );
          })}
        </div>

        {/* Scoring Source Pills */}
        <div className={`flex w-full min-w-0 flex-wrap items-center gap-1.5 border-t pt-2 xl:w-auto xl:border-r xl:border-t-0 xl:pr-4 xl:pt-0 ${
          theme === 'dark' ? 'border-slate-800' : 'border-slate-300'
        }`}>
          <span className={`text-[11px] font-bold shrink-0 ml-1 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>منبع نمره:</span>
          <button
            onClick={() => setSelectedSource('ALL')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
              selectedSource === 'ALL'
                ? 'bg-indigo-600 text-white'
                : (theme === 'dark' ? 'bg-slate-950 text-slate-400 hover:text-slate-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800')
            }`}
          >
            همه
          </button>
          <button
            onClick={() => setSelectedSource('mis')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
              selectedSource === 'mis'
                ? 'bg-blue-600 text-white shadow-md'
                : (theme === 'dark' ? 'bg-slate-950 text-blue-400 hover:bg-blue-500/10 border border-blue-500/20' : 'bg-slate-100 text-blue-600 hover:bg-blue-100 border border-blue-200')
            }`}
          >
            <Building2 className="w-3 h-3" />
            <span>سامانه MIS</span>
          </button>
          <button
            onClick={() => setSelectedSource('supervisor')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
              selectedSource === 'supervisor'
                ? 'bg-emerald-600 text-white shadow-md'
                : (theme === 'dark' ? 'bg-slate-950 text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20' : 'bg-slate-100 text-emerald-600 hover:bg-emerald-100 border border-emerald-200')
            }`}
          >
            <UserCheck className="w-3 h-3" />
            <span>سرپرست مستقیم</span>
          </button>
          <button
            onClick={() => setSelectedSource('kasra')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
              selectedSource === 'kasra'
                ? 'bg-amber-600 text-white shadow-md'
                : (theme === 'dark' ? 'bg-slate-950 text-amber-400 hover:bg-amber-500/10 border border-amber-500/20' : 'bg-slate-100 text-amber-600 hover:bg-amber-100 border border-amber-200')
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>کسری (حضور/غیاب)</span>
          </button>
          <button
            onClick={() => setSelectedSource('multi_source')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
              selectedSource === 'multi_source'
                ? 'bg-teal-600 text-white shadow-md'
                : (theme === 'dark' ? 'bg-slate-950 text-teal-400 hover:bg-teal-500/10 border border-teal-500/20' : 'bg-slate-100 text-teal-600 hover:bg-teal-100 border border-teal-200')
            }`}
          >
            <GitFork className="w-3 h-3" />
            <span>چندمنبعی (ترکیبی)</span>
          </button>
        </div>
      </div>

      {/* Bulk Selection Actions Bar */}
      {selectedCritIds.size > 0 && (
        <div className="bg-teal-950/40 border border-teal-500/30 p-3.5 rounded-2xl flex items-center justify-between animate-in fade-in flex-wrap gap-2 shadow-lg">
          <div className={`flex items-center gap-2 text-xs font-bold ${theme === 'dark' ? 'text-teal-300' : 'text-teal-700'}`}>
            <CheckCircle2 className={`w-4 h-4 ${theme === 'dark' ? 'text-teal-400' : 'text-teal-600'}`} />
            <span>{selectedCritIds.size} معیار برای عملیات دسته‌ای انتخاب شده‌اند</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExecuteBulkDelete}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف گروهی ({selectedCritIds.size} معیار)</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedCritIds(new Set())}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
            >
              لغو انتخاب‌ها
            </button>
          </div>
        </div>
      )}

      {/* Table List */}
      <div className={`border rounded-2xl overflow-hidden ${
        theme === 'dark' ? 'bg-slate-800/20 border-slate-800/80' : 'bg-slate-50 border-slate-300'
      }`}>
        {filteredCriteria.length > 0 ? (
          <div className="overflow-x-auto">
            <table className={`w-full text-xs ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
              <thead>
                <tr className={`sticky top-16 z-20 border-b font-bold shadow-sm ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-300 text-slate-600'
                }`}
              >
                  <th className="p-4 text-center w-10">
                    <input
                      type="checkbox"
                      checked={filteredCriteria.length > 0 && selectedCritIds.size === filteredCriteria.length}
                      onChange={handleToggleSelectAll}
                      className={`rounded border focus:ring-0 cursor-pointer ${theme === 'dark' ? 'border-slate-700 bg-slate-900 text-teal-500' : 'border-slate-400 bg-white text-teal-600'}`}
                      title="انتخاب همه معیارهای فیلترشده"
                    />
                  </th>
                  <th className="p-4 text-right w-20">کد</th>
                  <th className="p-4 text-right w-36">دسته معیار</th>
                  <th className="p-4 text-right">عنوان شاخص و تعریف عملیاتی</th>
                  <th className="p-4 text-center w-36">منبع امتیازدهی</th>
                  <th className="p-4 text-center w-36">محل استخراج / نحوه سنجش</th>
                  <th className="p-4 text-left w-24">عملیات</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${theme === 'dark' ? 'divide-slate-800/50' : 'divide-slate-300'}`}>
                {filteredCriteria.map((c) => {
                  const effectiveSource = c.scoringSource || (c.cat === 'K' ? 'mis' : c.code.startsWith('B-01') ? 'kasra' : 'supervisor');
                  return (
                    <tr key={c.id} className={`transition-colors ${theme === 'dark' ? 'hover:bg-slate-800/10' : 'hover:bg-slate-200'}`}>
                      <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedCritIds.has(c.id)}
                          onChange={(e) => handleToggleSelect(c.id, e)}
                          className={`rounded border focus:ring-0 cursor-pointer ${theme === 'dark' ? 'border-slate-700 bg-slate-900 text-teal-500' : 'border-slate-400 bg-white text-teal-600'}`}
                        />
                      </td>
                      <td className={`p-4 font-mono font-bold text-sm ${theme === 'dark' ? 'text-teal-400' : 'text-teal-600'}`}>{c.code}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded text-[10px] font-bold border ${
                          c.cat === 'K' ? (theme === 'dark' ? 'bg-blue-500/10 text-blue-300 border-blue-500/10' : 'bg-blue-100 text-blue-800 border-blue-200') :
                          c.cat === 'Q' ? (theme === 'dark' ? 'bg-amber-500/10 text-amber-300 border-amber-500/10' : 'bg-amber-100 text-amber-800 border-amber-200') :
                          c.cat === 'B' ? (theme === 'dark' ? 'bg-purple-500/10 text-purple-300 border-purple-500/10' : 'bg-purple-100 text-purple-800 border-purple-200') :
                          c.cat === 'S' ? (theme === 'dark' ? 'bg-red-500/10 text-red-300 border-red-500/10' : 'bg-red-100 text-red-800 border-red-200') :
                          (theme === 'dark' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/10' : 'bg-emerald-100 text-emerald-800 border-emerald-200')
                        }`}>
                          {CATEGORIES[c.cat]}
                        </span>
                      </td>
                      <td className={`p-4 space-y-1 ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                        <div className="font-bold flex items-center gap-2 flex-wrap">
                          <span>{c.name}</span>
                          {c.cat === 'K' && (
                            <span className={`text-[9px] font-semibold flex items-center gap-0.5 px-1.5 py-0.5 rounded ${
                              c.dir === 'more' 
                                ? (theme === 'dark' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-800') 
                                : (theme === 'dark' ? 'bg-orange-500/10 text-orange-400' : 'bg-orange-100 text-orange-800')
                            }`}>
                              {c.dir === 'more' ? (
                                <>
                                  <ArrowUpRight className="w-3 h-3" />
                                  <span>مستقیم (بیشتر بهتر)</span>
                                </>
                              ) : (
                                <>
                                  <ArrowDownLeft className="w-3 h-3" />
                                  <span>معکوس (کمتر بهتر)</span>
                                </>
                              )}
                            </span>
                          )}
                          {c.formulaExpression && (
                            <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-md flex items-center gap-1 border ${theme === 'dark' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-100 text-emerald-800 border-emerald-300'}`}>
                              <Calculator className={`w-3 h-3 ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`} />
                              <span>{c.formulaExpression}</span>
                            </span>
                          )}
                        </div>
                        <div className={`text-[11px] leading-relaxed max-w-xl ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>{c.def}</div>
                      </td>
                      <td className="p-4 text-center">
                        {effectiveSource === 'mis' ? (
                          <div className="inline-flex flex-col items-center gap-1">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border flex items-center gap-1 ${theme === 'dark' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'bg-blue-100 text-blue-800 border-blue-300'}`}>
                              <Building2 className={`w-3 h-3 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
                              <span>سامانه MIS (خودکار)</span>
                            </span>
                            {c.misMetricKey && (
                              <span className={`text-[9px] font-mono ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                                {c.misMetricKey === 'efficiency' ? 'راندمان خط' :
                                 c.misMetricKey === 'scrap_rate' ? 'نرخ ضایعات' :
                                 c.misMetricKey === 'quality_score' ? 'کیفیت قطعات' :
                                 c.misMetricKey === 'downtime' ? 'توقفات خط' :
                                 c.misMetricKey === 'output_qty' ? 'تیراژ تولید' : c.misMetricKey}
                              </span>
                            )}
                          </div>
                        ) : effectiveSource === 'kasra' ? (
                          <div className="inline-flex flex-col items-center gap-1">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border flex items-center gap-1 ${theme === 'dark' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>
                              <Clock className={`w-3 h-3 ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`} />
                              <span>سامانه کسری (خودکار)</span>
                            </span>
                            <span className={`text-[9px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>حضور و غیاب</span>
                          </div>
                        ) : effectiveSource === 'multi_source' ? (
                          <div className="inline-flex flex-col items-center gap-1">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border flex items-center gap-1 ${theme === 'dark' ? 'bg-teal-500/20 text-teal-300 border-teal-500/30' : 'bg-teal-100 text-teal-800 border-teal-300'}`}>
                              <GitFork className={`w-3 h-3 ${theme === 'dark' ? 'text-teal-400' : 'text-teal-600'}`} />
                              <span>چندمنبعی (ترکیبی)</span>
                            </span>
                            <span className={`text-[9px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>MIS + کسری + سرپرست</span>
                          </div>
                        ) : effectiveSource === 'system' ? (
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border flex items-center gap-1 ${theme === 'dark' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' : 'bg-purple-100 text-purple-800 border-purple-300'}`}>
                            <Cpu className={`w-3 h-3 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`} />
                            <span>سیستمی (فرمول)</span>
                          </span>
                        ) : (
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border flex items-center gap-1 ${theme === 'dark' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-emerald-100 text-emerald-800 border-emerald-300'}`}>
                            <UserCheck className={`w-3 h-3 ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`} />
                            <span>سرپرست مستقیم</span>
                          </span>
                        )}
                      </td>
                      <td className={`p-4 text-center max-w-[150px] truncate ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`} title={c.method || c.source}>
                        {c.source || c.method || 'ممیزی سرپرست'}
                      </td>
                      <td className="p-4 text-left">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => openForm(c)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${theme === 'dark' ? 'text-slate-400 hover:text-teal-400 hover:bg-slate-800/80' : 'text-slate-600 hover:text-teal-600 hover:bg-slate-200/80'}`}
                            title="ویرایش معیار"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setCriterionToDelete(c)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${theme === 'dark' ? 'text-slate-400 hover:text-red-400 hover:bg-slate-800/80' : 'text-slate-600 hover:text-red-600 hover:bg-slate-200/80'}`}
                            title="حذف معیار"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={`py-12 text-center space-y-2 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-600'}`}>
            <p className="text-base font-bold">معیاری متناسب با فیلتر یافت نشد.</p>
            <p className="text-xs">شما می‌توانید معیار جدیدی تعریف کرده یا فیلترها را ریست کنید.</p>
          </div>
        )}
      </div>

      {/* =========================================================================
         BULK IMPORT MODAL
         ========================================================================= */}
      {isBulkModalOpen && typeof document !== 'undefined' && createPortal(
        <div className={`fixed inset-0 z-[99999] flex items-center justify-center p-4 overflow-y-auto ${theme === 'dark' ? 'bg-slate-950/80 backdrop-blur-sm' : 'bg-black/40 backdrop-blur-sm'}`} dir="rtl">
          <div className={`border rounded-3xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl my-auto ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'
          }`}>
            <div className={`flex justify-between items-center border-b pb-4 ${theme === 'dark' ? 'border-slate-800' : 'border-slate-300'}`}>
              <div className="flex items-center gap-2">
                <UploadCloud className={`w-5 h-5 ${theme === 'dark' ? 'text-indigo-400' : 'text-indigo-600'}`} />
                <h2 className={`text-base font-bold ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>ورود سریع و دسته‌جمعی شاخص‌ها به بانک</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                aria-label="بستن"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            {bulkStatusMsg && (
              <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                bulkStatusMsg.type === 'success' 
                  ? (theme === 'dark' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-emerald-50 border-emerald-300 text-emerald-800 border border-emerald-300')
                  : bulkStatusMsg.type === 'error'
                    ? (theme === 'dark' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-rose-50 border-rose-300 text-rose-800 border border-rose-300')
                    : (theme === 'dark' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-indigo-50 border-indigo-300 text-indigo-800 border border-indigo-300')
              }`}>
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{bulkStatusMsg.text}</span>
              </div>
            )}

            {/* 1-Click Preset Libraries */}
            <div className="space-y-3">
              <div className={`flex items-center gap-2 text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                <Sparkles className={`w-4 h-4 ${theme === 'dark' ? 'text-teal-400' : 'text-teal-600'}`} />
                <span>بارگذاری سریع بسته‌های استاندارد صنعتی (با یک کلیک):</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {PRESET_LIBRARIES.map((preset, idx) => (
                  <div 
                    key={idx}
                    className={`p-3.5 rounded-2xl border flex flex-col justify-between transition-all ${
                      theme === 'dark' ? 'bg-slate-950/70 border-slate-800 hover:border-teal-500/30' : 'bg-slate-50 border-slate-300 hover:border-teal-500/50'
                    }`}>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>{preset.title}</span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600'}`}>
                          {preset.items.length} سنجه
                        </span>
                      </div>
                      <p className={`text-[10px] line-clamp-2 leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                        {preset.description}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleLoadPreset(preset.items)}
                      className={`mt-3 w-full font-bold py-1.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        theme === 'dark' ? 'bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/20' : 'bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>افزودن این بسته به بانک</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Multi-Line Paste Box */}
            <div className={`space-y-2 pt-3 border-t ${theme === 'dark' ? 'border-slate-800' : 'border-slate-300'}`}>
              <label className={`block text-xs font-bold mb-1 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                یا چسباندن (Paste) سطرهای اکسل یا داده‌های متنی:
              </label>
              <p className={`text-[11px] ${theme === 'dark' ? 'text-slate-500' : 'text-slate-600'}`}>
                فرمت خطوط (با کاما یا تب جدا شود): <code className={`font-mono ${theme === 'dark' ? 'text-teal-400' : 'text-teal-600'}`}>کد, دسته(K/B), نام معیار, شرح عملیاتی, منبع داده, سنجه, جهت(more/less)</code>
              </p>
              <textarea
                rows={4}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="K-PRD-05, K, نرخ توقف فیلترها, بررسی زمان تعویض فیلترهای هیدرولیک, واحد نگهداری تعمیرات, دقیقه در شیفت, less&#10;B-LEAD-01, B, مهارت‌های رهبری و حل مسئله, هدایت بهینه اعضای شیفت در شرایط بحرانی, مشاهده سرپرست, مقیاس ۱ تا ۵"
                className={`w-full border rounded-2xl p-3 text-xs font-mono focus:outline-none focus:border-indigo-500 ${theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`}
              />
              
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleProcessBulkText}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-600/20"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>پردازش و ثبت خطوط</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Dialog Form */}
      {isModalOpen && typeof document !== 'undefined' && createPortal(
        <div className={`fixed inset-0 z-[99999] flex items-center justify-center p-4 overflow-y-auto ${theme === 'dark' ? 'bg-slate-950/80 backdrop-blur-sm' : 'bg-black/40 backdrop-blur-sm'}`} dir="rtl">
          <div className={`border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl my-auto ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'
          }`}>
            <div className={`p-5 border-b flex justify-between items-center ${theme === 'dark' ? 'border-slate-800' : 'border-slate-300'}`}>
              <h2 className={`text-sm font-bold ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                {editingId ? 'ویرایش اطلاعات معیار بانک' : 'ثبت معیار شایستگی مصوب جدید'}
              </h2>
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label="بستن"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {errorMsg && (
                <div className={`p-3 rounded-xl text-xs flex gap-2 items-center ${theme === 'dark' ? 'bg-red-500/10 border-red-500/20 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  <AlertCircle className={`w-4 h-4 shrink-0 ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>کد شاخص (پیشوند منطبق)</label>
                  <input
                    type="text"
                    required
                    placeholder="مثلاً K-02 یا Q-03"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    className={`w-full border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-teal-500 ${theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>دسته طبقه‌بندی</label>
                  <select
                    value={formCat}
                    onChange={(e) => {
                      const val = e.target.value as CategoryKey;
                      setFormCat(val);
                      if (formCode.includes('-')) {
                        const parts = formCode.split('-');
                        setFormCode(`${val}-${parts[1]}`);
                      } else {
                        setFormCode(`${val}-`);
                      }
                    }}
                    className={`w-full border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-teal-500 ${theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`}
                  >
                    {(Object.keys(CATEGORIES) as CategoryKey[]).map(cat => (
                      <option key={cat} value={cat}>{CATEGORIES[cat]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>نام و عنوان معیار</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: نرخ ضایعات خط تولید"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className={`w-full border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-teal-500 ${theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>تعریف عملیاتی (فرم اجرایی و جزئیات دقیق سنجش)</label>
                <textarea
                  required
                  placeholder="توضیح دهید اپراتور دقیقاً چه رفتاری باید نشان دهد یا چه فرمولی بابت KPI محاسبه می‌شود..."
                  value={formDef}
                  onChange={(e) => setFormDef(e.target.value)}
                  className={`w-full h-20 border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-teal-500 resize-none ${theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>منبع استخراج داده</label>
                  <input
                    type="text"
                    placeholder="مانند: سیستم MES / تبلت QC"
                    value={formSource}
                    onChange={(e) => setFormSource(e.target.value)}
                    className={`w-full border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-teal-500 ${theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>فرمول محاسباتی / سنجه</label>
                  <input
                    type="text"
                    placeholder="مانند: درصد وزنی / ممیزی رفتاری ۵ تایی"
                    value={formMethod}
                    onChange={(e) => setFormMethod(e.target.value)}
                    className={`w-full border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-teal-500 ${theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`}
                  />
                </div>
              </div>

              {/* Scoring Source & Origin Configuration */}
              <div className={`p-4 rounded-2xl border space-y-3 ${
                theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
              }`}>
                <div className="flex items-center justify-between">
                  <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-teal-300' : 'text-teal-700'}`}>منبع نمره‌دهی و نحوه ورود اطلاعات (Scoring Source)</label>
                  <span className={`text-[10px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>تعیین تکلیف: خودکار MIS یا دستی سرپرست</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setFormScoringSource('mis');
                      if (!formSource) setFormSource('سامانه تولید و کیفیت MIS/MES');
                    }}
                    className={`p-3 rounded-xl border text-right transition-all flex items-start gap-2.5 cursor-pointer ${
                      formScoringSource === 'mis'
                        ? (theme === 'dark' ? 'bg-blue-500/10 border-blue-500 text-blue-200 ring-2 ring-blue-500/20' : 'bg-blue-50 border-blue-300 text-blue-800 ring-2 ring-blue-200')
                        : (theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700' : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400')
                    }`}
                  >
                    <Building2 className={`w-5 h-5 shrink-0 mt-0.5 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
                    <div>
                      <div className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>سامانه MIS / MES (خودکار)</div>
                      <div className={`text-[10px] mt-0.5 leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                        استخراج و نشستن خودکار از فایل اکسل راندمان، ضایعات یا کیفیت تولید
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormScoringSource('supervisor');
                      if (!formSource) setFormSource('ارزیابی سرپرست مستقیم');
                    }}
                    className={`p-3 rounded-xl border text-right transition-all flex items-start gap-2.5 cursor-pointer ${
                      formScoringSource === 'supervisor'
                        ? (theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700' : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400')
                        : (theme === 'dark' ? 'bg-slate-800/30 border-slate-700 text-slate-300' : 'bg-slate-200 border-slate-400 text-slate-700')
                    }`}
                  >
                    <UserCheck className={`w-5 h-5 shrink-0 mt-0.5 ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`} />
                    <div>
                      <div className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>سرپرست مستقیم (دستی)</div>
                      <div className={`text-[10px] mt-0.5 leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                        امتیازدهی مستقیم سرپرست در فرم ارزیابی (مصون از تغییرات اکسل MIS)
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormScoringSource('kasra');
                      if (!formSource) setFormSource('سامانه حضور و غیاب کسری');
                    }}
                    className={`p-3 rounded-xl border text-right transition-all flex items-start gap-2.5 cursor-pointer ${
                      formScoringSource === 'kasra'
                        ? (theme === 'dark' ? 'bg-amber-500/10 border-amber-500 text-amber-200 ring-2 ring-amber-500/20' : 'bg-amber-50 border-amber-300 text-amber-800 ring-2 ring-amber-200')
                        : (theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700' : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400')
                    }`}
                  >
                    <Clock className={`w-5 h-5 shrink-0 mt-0.5 ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`} />
                    <div>
                      <div className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>سامانه کسری (حضور و غیاب)</div>
                      <div className={`text-[10px] mt-0.5 leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                        استخراج و ثبت خودکار از فایل اکسل تردد، تاخیر ورود و غیبت پرسنل
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormScoringSource('system');
                      if (!formSource) setFormSource('فرمول سیستمی KPI');
                    }}
                    className={`p-3 rounded-xl border text-right transition-all flex items-start gap-2.5 cursor-pointer ${
                      formScoringSource === 'system'
                        ? (theme === 'dark' ? 'bg-purple-500/10 border-purple-500 text-purple-200 ring-2 ring-purple-500/20' : 'bg-purple-50 border-purple-300 text-purple-800 ring-2 ring-purple-200')
                        : (theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700' : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400')
                    }`}
                  >
                    <Cpu className={`w-5 h-5 shrink-0 mt-0.5 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`} />
                    <div>
                      <div className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>محاسباتی و فرمولی سیستمی</div>
                      <div className={`text-[10px] mt-0.5 leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                        محاسبه خودکار نمره با موتور فرمول‌ساز KPI بر اساس متغیرهای ثبت‌شده
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormScoringSource('multi_source');
                      if (!formSource) setFormSource('تلفیقی چندمنبعی (MIS + کسری + سرپرست)');
                    }}
                    className={`p-3 rounded-xl border text-right transition-all flex items-start gap-2.5 cursor-pointer ${
                      formScoringSource === 'multi_source'
                        ? (theme === 'dark' ? 'bg-teal-500/10 border-teal-500 text-teal-200 ring-2 ring-teal-500/20' : 'bg-teal-50 border-teal-300 text-teal-800 ring-2 ring-teal-200')
                        : (theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700' : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400')
                    }`}
                  >
                    <GitFork className={`w-5 h-5 shrink-0 mt-0.5 ${theme === 'dark' ? 'text-teal-400' : 'text-teal-600'}`} />
                    <div>
                      <div className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>تلفیقی چندمنبعی (Multi-Source)</div>
                      <div className={`text-[10px] mt-0.5 leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                        تامین نمره از چند مرجع (مثلاً ۵۰٪ فایل MIS تولید + ۲۵٪ فایل کسری + ۲۵٪ سرپرست)
                      </div>
                    </div>
                  </button>
                </div>

                {/* Sub-parameters for Multi-Source */}
                {formScoringSource === 'multi_source' && (
                  <div className={`p-3 rounded-xl border space-y-2 mt-2 ${
                    theme === 'dark' ? 'bg-teal-950/30 border-teal-800/40' : 'bg-teal-50 border-teal-300'
                  }`}>
                    <div className={`flex items-center gap-2 text-[11px] font-bold ${theme === 'dark' ? 'text-teal-300' : 'text-teal-700'}`}>
                      <GitFork className={`w-4 h-4 ${theme === 'dark' ? 'text-teal-400' : 'text-teal-600'}`} />
                      <span>پیکربندی سهم منابع تامین داده</span>
                    </div>
                    <p className={`text-[10px] leading-relaxed ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                      در هنگام ورود داده‌ها از فایل‌های اکسل MIS، فایل‌های حضور و غیاب کسری و ثبت امتیاز سرپرست، نمره نهایی شاخص به صورت خودکار و وزنی از ترکیب ورودی‌های این مراجع محاسبه و تجمیع می‌شود.
                    </p>
                  </div>
                )}

                {/* Sub-parameters for MIS */}
                {formScoringSource === 'mis' && (
                  <div className={`p-3 rounded-xl border space-y-3 mt-2 ${
                    theme === 'dark' ? 'bg-blue-950/30 border-blue-800/40' : 'bg-blue-50 border-blue-300'
                  }`}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className={`block text-[11px] font-bold mb-1 ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>متریک متناظر در فایل اکسل سامانه MIS</label>
                        <select
                          value={formMisMetricKey}
                          onChange={(e) => setFormMisMetricKey(e.target.value as MisMetricKey)}
                          className={`w-full border rounded-lg py-1.5 px-2.5 text-xs focus:outline-none ${theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200 focus:border-blue-500' : 'bg-white border-slate-300 text-slate-800 focus:border-blue-500'}`}>
                          <option value="efficiency">راندمان تولید و تحقق برنامه (Efficiency %)</option>
                          <option value="scrap_rate">نرخ ضایعات و قطعات اسقاطی (Scrap Rate %)</option>
                          <option value="quality_score">نرخ انطباق کیفی و تست قطعات (QC Score %)</option>
                          <option value="output_qty">تیراژ تولید واقعی (Actual Production Qty)</option>
                          <option value="downtime">دقایق توقفات و خرابی ماشین‌آلات (Downtime Min)</option>
                          <option value="custom">ستون سفارشی در فایل اکسل (Custom Column)</option>
                        </select>
                      </div>

                      {formMisMetricKey === 'custom' ? (
                        <div>
                          <label className={`block text-[11px] font-bold mb-1 ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>نام ستون در اکسل</label>
                          <input
                            type="text"
                            placeholder="مثال: custom_kpi_value"
                            value={formCustomMetricField}
                            onChange={(e) => setFormCustomMetricField(e.target.value)}
                            className={`w-full border rounded-lg py-1.5 px-2.5 text-xs focus:outline-none ${theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200 focus:border-blue-500' : 'bg-white border-slate-300 text-slate-800 focus:border-blue-500'}`}
                          />
                        </div>
                      ) : (
                        <div>
                          <label className={`block text-[11px] font-bold mb-1 ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>مقدار هدف ماهانه شاخص (Target)</label>
                          <input
                            type="number"
                            placeholder="مثال: 95"
                            value={formMisTargetValue}
                            onChange={(e) => setFormMisTargetValue(e.target.value)}
                            className={`w-full border rounded-lg py-1.5 px-2.5 text-xs font-mono focus:outline-none ${theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200 focus:border-blue-500' : 'bg-white border-slate-300 text-slate-800 focus:border-blue-500'}`}
                          />
                        </div>
                      )}
                    </div>

                    <label className={`flex items-center gap-2 cursor-pointer pt-1 ${theme === 'dark' ? 'text-blue-200' : 'text-blue-800'}`}>
                      <input
                        type="checkbox"
                        checked={formAutoPopulate}
                        onChange={(e) => setFormAutoPopulate(e.target.checked)}
                        className={`rounded focus:ring-blue-500 ${theme === 'dark' ? 'bg-slate-900 border-slate-700 text-blue-500' : 'bg-white border-slate-400 text-blue-600'}`}
                      />
                      درج و نشستن خودکار نمره در ارزیابی پرسنل بلافاصله پس از آپلود اکسل MIS
                    </label>
                  </div>
                )}

                {/* Sub-parameters for Kasra */}
                {formScoringSource === 'kasra' && (
                  <div className={`p-3 rounded-xl border space-y-3 mt-2 ${theme === 'dark' ? 'bg-amber-950/30 border-amber-800/40' : 'bg-amber-50 border-amber-300'}`}>
                    <div>
                      <label className={`block text-[11px] font-bold mb-1 ${theme === 'dark' ? 'text-amber-300' : 'text-amber-700'}`}>نوع داده استخراجی از سامانه کسری</label>
                      <select
                        value={formMisMetricKey}
                        onChange={(e) => setFormMisMetricKey(e.target.value as MisMetricKey)}
                        className={`w-full border rounded-lg py-1.5 px-2.5 text-xs focus:outline-none ${theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200 focus:border-amber-500' : 'bg-white border-slate-300 text-slate-800 focus:border-amber-500'}`}>
                        <option value="attendance_delay">دقایق تاخیر ورود در ماه (Attendance Delay)</option>
                        <option value="attendance_absence">روزهای غیبت غیرموجه (Unexcused Absence)</option>
                        <option value="discipline">سوابق انضباطی و تخلفات حضور (Disciplinary Log)</option>
                      </select>
                    </div>

                    <label className={`flex items-center gap-2 cursor-pointer pt-1 ${theme === 'dark' ? 'text-amber-200' : 'text-amber-800'}`}>
                      <input
                        type="checkbox"
                        checked={formAutoPopulate}
                        onChange={(e) => setFormAutoPopulate(e.target.checked)}
                        className={`rounded focus:ring-amber-500 ${theme === 'dark' ? 'bg-slate-900 border-slate-700 text-amber-500' : 'bg-white border-slate-400 text-amber-600'}`}
                      />
                      درج خودکار نمره انضباط با فرمول کسر نمره به ازای دقیقات تاخیر هنگام آپلود فایل کسری
                    </label>
                  </div>
                )}

                {/* Supervisor Note */}
                {formScoringSource === 'supervisor' && (
                  <div className={`p-3 rounded-xl border flex items-center gap-2 text-xs mt-2 ${
                    theme === 'dark' ? 'bg-emerald-950/20 border-emerald-800/30 text-emerald-300' : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  }`}>
                    <UserCheck className={`w-4 h-4 shrink-0 ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`} />
                    <span>
                      این معیار منحصراً با قضاوت و نمره‌دهی مستقیم سرپرست کارگاه در فرم ارزیابی تکمیل می‌شود و فایل‌های آپلودی اکسل تاثیری بر آن نخواهند داشت.
                    </span>
                  </div>
                )}
              </div>

              {formCat === 'K' && (
                <div className={`p-3 rounded-xl border ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'}`}>
                  <label className={`block text-xs font-semibold mb-2 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>جهت مطلوب شاخص کمی</label>
                  <div className="flex gap-4">
                    <label className={`flex items-center gap-2 text-xs cursor-pointer ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                      <input
                        type="radio"
                        name="kpiDir"
                        checked={formDir === 'more'}
                        onChange={() => setFormDir('more')}
                        className="text-teal-500 focus:ring-teal-500 focus:ring-offset-slate-900"
                      />
                      <span className="inline-flex items-center gap-1.5"><ArrowUp aria-hidden="true" className="h-4 w-4 shrink-0" /> صعودی (هر چه بیشتر بهتر - مانند تولید)</span>
                    </label>
                    <label className={`flex items-center gap-2 text-xs cursor-pointer ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                      <input
                        type="radio"
                        name="kpiDir"
                        checked={formDir === 'less'}
                        onChange={() => setFormDir('less')}
                        className="text-teal-500 focus:ring-teal-500 focus:ring-offset-slate-900"
                      />
                      <span className="inline-flex items-center gap-1.5"><ArrowDown aria-hidden="true" className="h-4 w-4 shrink-0" /> نزولی (هر چه کمتر بهتر - مانند ضایعات/توقف)</span>
                    </label>
                  </div>
                </div>
              )}

              {formScoringSource === 'supervisor' && (
                <div className={`p-3 rounded-xl border space-y-2 ${theme === 'dark' ? 'bg-emerald-950/20 border-emerald-800/40' : 'bg-emerald-50 border-emerald-300'}`}>
                  <div className={`text-xs font-bold ${theme === 'dark' ? 'text-emerald-300' : 'text-emerald-800'}`}>بازه نمره مجاز سرپرست</div>
                  <p className={`text-[10px] leading-5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>نمره دستی همچنان در مقیاس ۱ تا ۵ ثبت می‌شود. نمره ۰ فقط به معنی «ثبت‌نشده» است.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-[10px] font-semibold">حداقل نمره مجاز
                      <input type="number" min={1} max={5} step={1} value={formAllowedScoreMin} onChange={event => setFormAllowedScoreMin(event.target.value)} className={`mt-1 w-full border rounded-lg py-1.5 px-2 text-xs ${theme === 'dark' ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`} />
                    </label>
                    <label className="text-[10px] font-semibold">حداکثر نمره مجاز
                      <input type="number" min={1} max={5} step={1} value={formAllowedScoreMax} onChange={event => setFormAllowedScoreMax(event.target.value)} className={`mt-1 w-full border rounded-lg py-1.5 px-2 text-xs ${theme === 'dark' ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`} />
                    </label>
                  </div>
                </div>
              )}

              {formCat === 'K' && formScoringSource !== 'supervisor' && (
                <div className={`p-3 rounded-xl border space-y-2 ${theme === 'dark' ? 'bg-indigo-950/20 border-indigo-800/40' : 'bg-indigo-50 border-indigo-300'}`}>
                  <div className={`text-xs font-bold ${theme === 'dark' ? 'text-indigo-300' : 'text-indigo-800'}`}>هدف و آستانه‌های امتیاز KPI</div>
                  <p className={`text-[10px] leading-5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>این آستانه‌ها روی مقدار خام KPI و جهت مطلوبیت اعمال می‌شوند؛ نمره دستی سرپرست را محدود نمی‌کنند.</p>
                  <label className="block text-[10px] font-semibold">Target / مقدار هدف
                    <input type="number" value={formTargetValue} onChange={event => setFormTargetValue(event.target.value)} className={`mt-1 w-full border rounded-lg py-1.5 px-2 text-xs ${theme === 'dark' ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`} />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {(['score5', 'score4', 'score3', 'score2'] as const).map((key, index) => (
                      <label key={key} className="text-[10px] font-semibold">آستانه نمره {5 - index}
                        <input type="number" value={formThresholds[key]} onChange={event => setFormThresholds(current => ({ ...current, [key]: event.target.value }))} className={`mt-1 w-full border rounded-lg py-1.5 px-2 text-xs ${theme === 'dark' ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`} />
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500">جهت «بیشتر بهتر» باید آستانه‌ها از نمره ۵ به ۲ نزولی باشند؛ جهت «کمتر بهتر» برعکس است.</p>
                </div>
              )}

              <div className={`flex justify-end gap-2 pt-3 border-t ${theme === 'dark' ? 'border-slate-800' : 'border-slate-300'}`}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-slate-900 rounded-xl text-xs font-bold cursor-pointer"
                >
                  ذخیره تغییرات
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      {/* Universal Data Exchange Modal (Import / Export) */}
      <UniversalDataExchange
        config={criteriaExchangeConfig}
        isOpen={isExchangeModalOpen}
        onClose={() => setIsExchangeModalOpen(false)}
        theme={theme}
      />

      {/* Delete Confirmation Modal */}
      {criterionToDelete && typeof document !== 'undefined' && createPortal(
        <div className={`fixed inset-0 z-[99999] flex items-center justify-center p-4 overflow-y-auto ${theme === 'dark' ? 'bg-slate-950/80 backdrop-blur-sm' : 'bg-black/40 backdrop-blur-sm'}`}>
          <div className={`border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 text-right my-auto ${theme === 'dark' ? 'bg-slate-900 border-red-500/30' : 'bg-white border-red-300'}`} dir="rtl">
            <div className={`flex items-center gap-3 ${theme === 'dark' ? 'text-red-400' : 'text-red-700'}`}>
              <div className={`p-2.5 rounded-xl ${theme === 'dark' ? 'bg-red-500/10' : 'bg-red-100'}`}>
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className={`text-base font-bold ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>حذف شاخص ارزیابی</h3>
                <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>کد شاخص: {criterionToDelete.code}</p>
              </div>
            </div>

            <p className={`text-sm leading-relaxed ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
              آیا از حذف شاخص <span className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>«{criterionToDelete.name}»</span> اطمینان دارید؟
            </p>
            <div className={`border rounded-xl p-3 text-xs space-y-1 ${theme === 'dark' ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-amber-100 border-amber-300 text-amber-800'}`}>
              <p className="font-semibold">توجه سیستمی:</p>
              <p>این شاخص به‌صورت خودکار و امن از تمامی رده‌های شغلی و فرم‌های ارزیابی متصل نیز پاکسازی خواهد شد.</p>
            </div>

            <div className={`flex justify-end gap-2 pt-2 border-t ${theme === 'dark' ? 'border-slate-800' : 'border-slate-300'}`}>
              <button
                type="button"
                onClick={() => setCriterionToDelete(null)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteCriterion(criterionToDelete.id);
                  setCriterionToDelete(null);
                }}
                className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-500/20 cursor-pointer"
              >
                تایید و حذف قطعی
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Bulk Delete Criteria Confirmation Modal */}
      {isBulkDeleteModalOpen && typeof document !== 'undefined' && createPortal(
        <div className={`fixed inset-0 z-[99999] flex items-center justify-center p-4 overflow-y-auto ${theme === 'dark' ? 'bg-slate-950/85 backdrop-blur-sm' : 'bg-black/40 backdrop-blur-sm'}`}>
          <div className={`border rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-right animate-in fade-in my-auto ${theme === 'dark' ? 'bg-slate-900 border-rose-500/40' : 'bg-white border-rose-300'}`} dir="rtl">
            <div className={`flex items-center gap-3 border-b pb-3 ${theme === 'dark' ? 'border-slate-800' : 'border-slate-300'}`}>
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${theme === 'dark' ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400' : 'bg-rose-100 border border-rose-300 text-rose-700'}`}>
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-sm font-black ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>تایید حذف گروهی شاخص‌ها</h3>
                <p className={`text-[11px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>حذف همزمان {selectedCritIds.size} شاخص انتخاب‌شده</p>
              </div>
            </div>

            <div className={`p-3.5 rounded-2xl border space-y-2 text-xs max-h-48 overflow-y-auto ${theme === 'dark' ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-300'}`}>
              <div className={`font-medium mb-1 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>شاخص‌های انتخاب‌شده برای حذف:</div>
              {Array.from(selectedCritIds).map(id => {
                const c = criteria.find(item => item.id === id);
                return (
                  <div key={id} className={`flex justify-between items-center py-1 border-b ${theme === 'dark' ? 'border-slate-900 text-slate-200' : 'border-slate-200 text-slate-800'} text-xs`}>
                    <span>{c?.name || 'شاخص'}</span>
                    <span className={`font-mono text-[11px] ${theme === 'dark' ? 'text-teal-400' : 'text-teal-600'}`}>{c?.code}</span>
                  </div>
                );
              })}
            </div>

            <div className={`border p-3 rounded-xl text-xs leading-relaxed ${theme === 'dark' ? 'bg-rose-500/10 border-rose-500/20 text-rose-300' : 'bg-rose-50 border-rose-300 text-rose-800'}`}>
              <p className="font-bold mb-0.5">هشدار یکپارچگی داده‌ها:</p>
              <p>این شاخص‌ها به طور کامل از بانک شاخص‌ها حذف شده و رفرنس آن‌ها در پروفایل‌های شغلی و فرم‌های ارزیابی مرتبط نیز پاکسازی خواهد شد.</p>
            </div>

            <div className={`flex items-center justify-end gap-2 pt-2 border-t ${theme === 'dark' ? 'border-slate-800/80' : 'border-slate-300'}`}>
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${theme === 'dark' ? 'text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700' : 'text-slate-600 hover:text-slate-800 bg-slate-200 hover:bg-slate-300'}`}
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDelete}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all cursor-pointer shadow-lg shadow-rose-600/20 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تایید و حذف گروهی ({selectedCritIds.size} مورد)</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* KPI Formula Engine Modal */}
      <KpiFormulaEngineModal
        isOpen={isFormulaModalOpen}
        onClose={() => setIsFormulaModalOpen(false)}
        criteria={criteria}
        onAddCriterion={onAddCriterion}
        onUpdateCriterion={onUpdateCriterion}
        employees={employees || []}
        profiles={profiles || []}
        evaluations={evaluations || []}
        onUpdateEvaluations={onUpdateEvaluations || (() => {})}
        theme={theme}
      />

      {/* Multi-Source Criteria Bulk Import Modal */}
      <MultiSourceCriteriaImportModal
        isOpen={isMultiSourceModalOpen}
        onClose={() => setIsMultiSourceModalOpen(false)}
        existingCriteria={criteria}
        onCommitMerge={handleCommitMultiSource}
        theme={theme}
      />
    </div>
  );
}

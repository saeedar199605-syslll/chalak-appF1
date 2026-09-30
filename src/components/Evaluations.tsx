import SearchInput from './ui/SearchInput';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { calculateFinalScore, evaluateNumericFormula } from '../utils/formulaEngine';
import { createPortal } from 'react-dom';
import { 
  ClipboardCheck, 
  Plus, 
  ChevronLeft, 
  Sparkles, 
  ShieldCheck, 
  FileText, 
  AlertTriangle, 
  Lock, 
  Trash2,
  Brain,
  Award,
  BookOpen,
  Send,
  Loader2,
  CheckCircle2,
  Search,
  Zap,
  ShieldAlert,
  Edit2,
  ThumbsUp,
  MessageSquareQuote,
  Check,
  Table as TableIcon,
  FileSpreadsheet,
  Save,
  Calculator,
  Clock,
  GitFork
  ,Scale, Pencil, X
} from 'lucide-react';
import ExcelIntegrationCenter from './ExcelIntegrationCenter';
import AIFeedbackAssistant from './AIFeedbackAssistant';
import { downloadWorkbook, recordsToRows } from '../utils/excelWorkbook';
import { calculateKpiScore, calculateMultiSourceCompositeScore } from '../utils/formulaEngine';
import { 
  Evaluation, 
  Employee, 
  JobProfile, 
  Criterion, 
  BiasAnalysisResult,
  BiasWarning,
  PERFORMANCE_SCALE, 
  NEED_DOCUMENT_SCORES, 
  SCALE_FACTOR, 
  getGrade, 
  GRADE_DETAILS,
  CYCLE_STEPS
, RewardConfig } from '../types';
import { db } from '../utils/db';
import { VirtualizedTable } from './VirtualizedTable';
import { previewEvaluationStart } from '../utils/evaluationStart';
import { authorize, canAccessWorkflowStage, isWithinWorkflowCeiling } from '../utils/authorization';
import { canPerformWorkflowAction } from '../utils/workflowAuthorization';
import { isManualScoreInRange } from '../utils/criterionScoring';
import { employeeSearchScore, matchesEmployeeSearch, normalizeSearchText } from '../utils/personnelSearch';
import BulkScoringModal from './BulkScoringModal';

const generateLocalCoachingFeedback = (
  employeeName: string,
  jobTitle: string,
  period: string,
  scores: any[],
  note: string,
  criteria: Criterion[]
): {
  strengths: string[];
  developmentAreas: string[];
  actionItems: string[];
  summary: string;
} => {
  const strengthsScores = scores.filter(s => s.value >= 4);
  const improvementsScores = scores.filter(s => s.value > 0 && s.value <= 3);

  const strengthsList: string[] = [];
  strengthsScores.forEach(s => {
    const crit = criteria.find(c => c.id === s.cid);
    if (crit) {
      strengthsList.push(`شاخص ${crit.name} (امتیاز ${s.value}): تخصص بالا و دقت فوق‌العاده همکار در این بخش مورد تقدیر است.`);
    }
  });
  if (strengthsList.length === 0) {
    strengthsList.push('موردی با رتبه برتر متمایز یافت نشد. تلاش در جهت ارتقای خروجی توصیه می‌شود.');
  }

  const improvementsList: string[] = [];
  improvementsScores.forEach(s => {
    const crit = criteria.find(c => c.id === s.cid);
    if (crit) {
      improvementsList.push(`شاخص ${crit.name} (امتیاز ${s.value}): نیازمند مانیتورینگ دقیق‌تر فرآیند، بازآموزی چک‌لیست SOP و تمرکز روی کاهش خطا.`);
    }
  });
  if (improvementsList.length === 0) {
    improvementsList.push('کل شاخص‌ها در حد استاندارد و بالاتر هستند. توصیه بر پایداری عملکرد است.');
  }

  const actionItemsList = [
    'شرکت در کلاس فشرده بازآموزی استانداردهای کیفی اصفهان چالاک.',
    'تنظیم چک‌لیست پایش روزانه با همکار سرپرست ایستگاه کاری.',
    'ثبت و انتقال داده‌های دقیق توقفات دستگاه در سامانه MES کارخانه.'
  ];

  const summary = `بر اساس ارزیابی عملکرد همکار ارجمند، ${employeeName} در جایگاه شغلی ${jobTitle} برای دوره ${period}، به طور کلی شایستگی و انضباط فرآیندی ایشان مطلوب ارزیابی گردید. تمرکز بر فرصت‌های بهبود می‌تواند مسیر پیشرفت شغلی و رشد شایستگی را به طور کامل هموار سازد. ${note ? `توضیح مربی خط: "${note}"` : ''}`;

  return {
    strengths: strengthsList,
    developmentAreas: improvementsList,
    actionItems: actionItemsList,
    summary
  };
};

interface EvaluationsProps {
  evaluations: Evaluation[];
  employees: Employee[];
  profiles: JobProfile[];
  criteria: Criterion[];
  onAddEvaluation: (empId: string, period: string) => void;
  onBulkStartEvaluations?: (employeeIds: string[], period: string) => boolean;
  onActivateEvaluationPeriod?: (period: string) => boolean;
  onUpdateEvaluation: (id: string, ev: Evaluation) => void;
  onBulkUpdateEvaluations?: (evals: Evaluation[], sourceImport?: import('../utils/sourceImports').ProtectedSourceImportContext) => boolean | Promise<boolean> | void;
  onDeleteEvaluation: (id: string) => void;
  onBulkDeleteEvaluations?: (ids: string[]) => void;
  onNavigateToWorkflow?: () => void;
  activeEvalId: string | null;
  onSetActiveEval: (id: string | null) => void;
  currentUser?: Employee | null;
}

export default function Evaluations({
  evaluations,
  employees,
  profiles,
  criteria,
  onAddEvaluation,
  onBulkStartEvaluations,
  onActivateEvaluationPeriod,
  onUpdateEvaluation,
  onBulkUpdateEvaluations,
  onDeleteEvaluation,
  onBulkDeleteEvaluations,
  onNavigateToWorkflow,
  activeEvalId,
  onSetActiveEval,
  currentUser
}: EvaluationsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newEmpId, setNewEmpId] = useState('');
  const [newPeriod, setNewPeriod] = useState('نیمه اول ۱۴۰۵');
  const [activePeriod, setActivePeriod] = useState(() => db.getMiscData<string>('pe_active_period', ''));
  useEffect(() => db.subscribe((key, value) => { if (key === 'pe_active_period') setActivePeriod(typeof value === 'string' ? value : ''); }), []);
  const [startSelection, setStartSelection] = useState<Set<string>>(new Set<string>());
  const [startSearch, setStartSearch] = useState('');
  const [startUnit, setStartUnit] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Bulk selection state
  const [selectedEvalIds, setSelectedEvalIds] = useState<Set<string>>(new Set());
  const [isBulkScoringOpen, setIsBulkScoringOpen] = useState(false);

  // Determine admin privileges
  const isAdmin = currentUser?.role === 'admin' || currentUser?.username === 'admin' || currentUser?.code === 'ADMIN-001';
  const filteredStartEmployees = useMemo(() => {
    const filtered = employees.filter(employee => (!startUnit || employee.unit === startUnit) && matchesEmployeeSearch(employee, startSearch));
    return startSearch.trim() ? filtered.sort((left, right) => employeeSearchScore(right, startSearch) - employeeSearchScore(left, startSearch)) : filtered;
  }, [employees, startSearch, startUnit]);

  const handleActivatePeriod = () => {
    const period = newPeriod.trim();
    if (!isAdmin || !period) return;
    if (onActivateEvaluationPeriod && !onActivateEvaluationPeriod(period)) return;
    if (!onActivateEvaluationPeriod) db.saveMiscData('pe_active_period', period);
    setActivePeriod(period);
  };

  const handleToggleSelectAll = () => {
    if (selectedEvalIds.size === filteredEvaluations.length) {
      setSelectedEvalIds(new Set());
    } else {
      setSelectedEvalIds(new Set(filteredEvaluations.map(e => e.id)));
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedEvalIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedEvalIds(next);
  };

  const [evalToDelete, setEvalToDelete] = useState<Evaluation | null>(null);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);

  const handleConfirmBulkDelete = () => {
    if (selectedEvalIds.size === 0) return;
    if (onBulkDeleteEvaluations) {
      onBulkDeleteEvaluations(Array.from(selectedEvalIds));
    } else {
      selectedEvalIds.forEach(id => onDeleteEvaluation(id));
    }
    setSelectedEvalIds(new Set());
    setIsBulkDeleteConfirmOpen(false);
  };

  // Bias and Tone Audit States
  const [isBiasModalOpen, setIsBiasModalOpen] = useState(false);
  const [biasLoading, setBiasLoading] = useState(false);
  const [biasResult, setBiasResult] = useState<BiasAnalysisResult | null>(null);

  // Excel Integration State
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);

  // Quick KPI Data Calculator modal for individual criteria inside evaluation
  const [quickCalcState, setQuickCalcState] = useState<{ scoreIndex: number; criterion: Criterion } | null>(null);
  const [quickCalcInputs, setQuickCalcInputs] = useState<Record<string, number>>({});
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, Evaluation>>({});
  const [scoreDraftError, setScoreDraftError] = useState('');

  const handleExportToExcel = () => {
    if (evaluations.length === 0) {
      alert('هیچ ارزیابی برای خروجی وجود ندارد.');
      return;
    }
    const exportRows = evaluations.map(ev => {
      const emp = employees.find(e => e.id === ev.empId);
      const prof = profiles.find(p => p.id === ev.profileId);
      const score = calculateFinalScore(ev, profiles);
      return {
        'کد پرسنلی': emp?.code || '---',
        'نام و نام خانوادگی': emp?.name || '---',
        'سمت شغلی': prof?.title || '---',
        'دوره ارزیابی': ev.period,
        'وضعیت پرونده': ev.status === 'locked' ? 'نهایی و بسته شده' : ev.status === 'calibrated' ? 'کالیبره شده' : 'پیش‌نویس / در جریان',
        'نمره نهایی عملکرد (۱ تا ۱۰۰)': score,
      };
    });

    void downloadWorkbook(`Evaluations_Export_${Date.now()}.xlsx`, [
      { name: 'ارزیابی‌ها', rows: recordsToRows(exportRows) }
    ]);
  };


  // Active evaluation form states
  const persistedActiveEval = evaluations.find(e => e.id === activeEvalId);
  const activeEval = persistedActiveEval ? scoreDrafts[persistedActiveEval.id] || persistedActiveEval : undefined;
  const isActiveDraftDirty = Boolean(activeEval && persistedActiveEval && JSON.stringify(activeEval) !== JSON.stringify(persistedActiveEval));
  const updateActiveDraft = (update: (evaluation: Evaluation) => Evaluation) => {
    if (!persistedActiveEval) return;
    setScoreDrafts(current => ({
      ...current,
      [persistedActiveEval.id]: update(current[persistedActiveEval.id] || persistedActiveEval),
    }));
    setScoreDraftError('');
  };
  const saveActiveDraft = () => {
    if (!activeEval || !persistedActiveEval || !isActiveDraftDirty) return;
    const updated = evaluations.map(evaluation => evaluation.id === activeEval.id ? activeEval : evaluation);
    if (onBulkUpdateEvaluations) onBulkUpdateEvaluations(updated);
    else onUpdateEvaluation(activeEval.id, activeEval);
    setScoreDrafts(current => {
      const next = { ...current };
      delete next[activeEval.id];
      return next;
    });
  };
  const activeEmployee = employees.find(emp => emp?.id === activeEval?.empId);
  const activeProfile = profiles.find(p => p?.id === activeEval?.profileId);
  const canSupervisorEditActiveEvaluation = Boolean(currentUser?.role === 'supervisor' && activeEval && activeEmployee &&
    activeEval.stage === 'supervisor_review' && isWithinWorkflowCeiling(currentUser, 'supervisor_review') &&
    canAccessWorkflowStage(currentUser, 'supervisor_review', 'edit') &&
    authorize(currentUser, 'evaluations', 'edit', activeEmployee).allowed &&
    canPerformWorkflowAction(currentUser, activeEval, 'approve', { employees, delegations: db.getDelegations() }).authorized);

  const isProtectedScoreSource = (score: Evaluation['scores'][number], criterion?: Criterion) =>
    Boolean(score.autoPopulated || ['mis', 'kasra', 'system', 'auto'].includes(score.sourceType || '') ||
      ['mis', 'kasra', 'system'].includes(criterion?.scoringSource || '') ||
      ((score.sourceType === 'multi_source' || criterion?.scoringSource === 'multi_source') && !criterion?.multiSourceConfig?.items.some(item => item.source === 'supervisor')));

  const canEditManualScoreAt = (index: number) => {
    if (!activeEval || !currentUser || activeEval.status === 'locked') return false;
    const score = activeEval.scores[index];
    const criterion = criteria.find(item => item.id === score?.cid);
    if (!score || isProtectedScoreSource(score, criterion)) return false;
    return currentUser.role === 'admin' || canSupervisorEditActiveEvaluation;
  };

  const canEditSelfScore = () => Boolean(activeEval && currentUser && activeEval.status !== 'locked' && (
    currentUser.role === 'admin' || (currentUser.role === 'employee' && currentUser.id === activeEval.empId && ['self_review', 'rejected'].includes(activeEval.stage || 'self_review'))
  ));

  const canEditScoreDocumentAt = (index: number) => {
    if (!activeEval || !currentUser || activeEval.status === 'locked') return false;
    const score = activeEval.scores[index];
    const criterion = criteria.find(item => item.id === score?.cid);
    if (isProtectedScoreSource(score, criterion)) return false;
    return currentUser.role === 'admin' || canSupervisorEditActiveEvaluation || (currentUser.role === 'employee' && currentUser.id === activeEval.empId && ['self_review', 'rejected'].includes(activeEval.stage || 'self_review'));
  };

  const handleOpenQuickCalc = (scoreIndex: number, criterion: Criterion) => {
    const initial: Record<string, number> = {};
    if (criterion.variables && criterion.variables.length > 0) {
      criterion.variables.forEach(v => {
        initial[v.key] = v.defaultValue ?? 100;
      });
    } else {
      initial['actual'] = 95;
      initial['target'] = criterion.targetValue || 100;
      initial['standard'] = 60;
      initial['scrap'] = 2;
      initial['total'] = 100;
    }
    setQuickCalcInputs(initial);
    setQuickCalcState({ scoreIndex, criterion });
  };

  const handleApplyQuickCalc = () => {
    if (!quickCalcState || !activeEval) return;
    const { scoreIndex, criterion } = quickCalcState;
    const result = calculateKpiScore(criterion, quickCalcInputs);
    const hasDirectManualScore = !criterion.scoringSource || criterion.scoringSource === 'supervisor';
    if (hasDirectManualScore && !isManualScoreInRange(criterion, result.score)) {
      setScoreDraftError(`نمره محاسبه‌شده ${result.score} خارج از بازه مجاز این معیار است.`);
      return;
    }
    updateActiveDraft(current => {
      const updatedScores = [...current.scores];
      updatedScores[scoreIndex] = {
        ...updatedScores[scoreIndex],
        value: result.score,
        doc: `${updatedScores[scoreIndex].doc ? updatedScores[scoreIndex].doc + ' | ' : ''}${result.summaryText}`
      };
      return { ...current, scores: updatedScores };
    });
    setQuickCalcState(null);
  };

  // Triggering the add modal
  const handleOpenNewModal = () => {
    if (employees.length === 0) {
      alert('لطفاً ابتدا از زبانه مدیریت پرسنل، اقدام به تعریف پرونده‌های همکاران کنید.');
      return;
    }
    setNewEmpId(employees[0].id);
    setNewPeriod(db.getMiscData('pe_active_period', 'نیمه اول ۱۴۰۵'));
    setStartSelection(new Set([employees[0].id]));
    setIsNewModalOpen(true);
  };

  const handleCreateEvaluation = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedIds: string[] = [...startSelection];
    if (!selectedIds.length || !newPeriod.trim() || !isAdmin || activePeriod.trim() !== newPeriod.trim()) return;

    const preview = previewEvaluationStart(selectedIds, newPeriod, employees, profiles, evaluations);
    if (!preview.eligible) return;
    if (onBulkStartEvaluations) {
      if (!onBulkStartEvaluations(selectedIds, newPeriod.trim())) return;
    } else {
      preview.rows.filter(row => row.reason === 'eligible').forEach(row => onAddEvaluation(row.employeeId, newPeriod.trim()));
    }
    setIsNewModalOpen(false);
    setStartSelection(new Set<string>());
  };

  const handleScoreChange = (scoreIndex: number, val: number) => {
    if (!activeEval || !canEditManualScoreAt(scoreIndex)) return;
    const score = activeEval.scores[scoreIndex];
    const criterion = criteria.find(item => item.id === score?.cid);
    if (!criterion || !isManualScoreInRange(criterion, val)) {
      setScoreDraftError('نمره خارج از بازه مجاز این معیار است.');
      return;
    }
    updateActiveDraft(current => {
      const updatedScores = [...current.scores];
      const currentScoreItem = { ...updatedScores[scoreIndex] };
      const crit = criteria.find(item => item.id === currentScoreItem.cid);
      if (crit?.scoringSource === 'multi_source') {
        const updatedBreakdown = { ...(currentScoreItem.sourceBreakdown || {}), supervisorScore: val };
        const comp = calculateMultiSourceCompositeScore(crit, updatedBreakdown);
        currentScoreItem.sourceBreakdown = updatedBreakdown;
        currentScoreItem.value = comp.score;
        if (!currentScoreItem.doc || currentScoreItem.doc.startsWith('میانگین') || currentScoreItem.doc.startsWith('سامانه') || currentScoreItem.doc.startsWith('در انتظار')) currentScoreItem.doc = comp.docText;
      } else currentScoreItem.value = val;
      updatedScores[scoreIndex] = currentScoreItem;
      return { ...current, scores: updatedScores };
    });
  };

  const handleSelfScoreChange = (scoreIndex: number, val: number) => {
    if (!activeEval || !canEditSelfScore()) return;
    updateActiveDraft(current => ({ ...current, scores: current.scores.map((score, index) => index === scoreIndex ? { ...score, self: val } : score) }));
  };

  const handleDocChange = (scoreIndex: number, docVal: string) => {
    if (!activeEval || !canEditScoreDocumentAt(scoreIndex)) return;
    updateActiveDraft(current => ({ ...current, scores: current.scores.map((score, index) => index === scoreIndex ? { ...score, doc: docVal } : score) }));
  };

  const handleNoteChange = (noteVal: string) => {
    if (!activeEval || activeEval.status === 'locked') return;
    updateActiveDraft(current => ({ ...current, note: noteVal }));
  };

  // Run Gemini Bias & Tone Pre-Audit
  const runBiasAudit = async (autoLockOnPass: boolean = false) => {
    if (!activeEval) return;
    setBiasLoading(true);

    const formattedScores = activeEval.scores.map(s => {
      const crit = criteria.find(c => c.id === s.cid);
      return {
        code: crit?.code || '',
        name: crit?.name || '',
        category: crit ? crit.cat : '',
        value: s.value,
        self: s.self,
        doc: s.doc || ''
      };
    });

    try {
      const response = await fetch('/api/gemini/bias-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeName: activeEmployee?.name || 'همکار',
          jobTitle: activeProfile?.title || 'شاغل',
          period: activeEval.period,
          note: activeEval.note || '',
          scores: formattedScores
        })
      });

      if (!response.ok) {
        throw new Error('خطا در تحلیل سوگیری هوش مصنوعی');
      }

      const resData = await response.json();
      const auditResult: BiasAnalysisResult = {
        integrityScore: resData.integrityScore ?? 85,
        hasWarnings: resData.hasWarnings ?? false,
        biasesDetected: resData.biasesDetected ?? [],
        suggestedRevision: resData.suggestedRevision || '',
        coachingAdvice: resData.coachingAdvice || '',
        analyzedAt: new Date().toLocaleDateString('fa-IR')
      };

      setBiasResult(auditResult);
      onUpdateEvaluation(activeEval.id, { ...activeEval, biasAnalysis: auditResult });

      setIsBiasModalOpen(true);
    } catch (err) {
      console.warn('Fallback local bias analysis...', err);
      const fallbackResult: BiasAnalysisResult = {
        integrityScore: 88,
        hasWarnings: activeEval.scores.every(s => s.value === 5),
        biasesDetected: activeEval.scores.every(s => s.value === 5) ? [{
          type: 'halo_horns',
          title: 'احتمال خطای هاله (Halo Effect)',
          severity: 'medium',
          description: 'تمام شاخص‌ها حداکثر نمره (۵) را دریافت کرده‌اند. توزیع نرمال نمرات را مدنظر قرار دهید.',
          highlightSnippet: 'نمرات یکنواخت ۵ از ۵'
        }] : [],
        suggestedRevision: activeEval.note || 'عملکرد همکار در طول دوره مورد تایید است و بر تقویت کار تیمی و ارتقای کیفیت تاکید می‌شود.',
        coachingAdvice: 'در جلسه بازخورد، بر موارد عینی تمرکز داشته و از تعمیم‌های غیرمستند بپرهیزید.',
        analyzedAt: new Date().toLocaleDateString('fa-IR')
      };
      setBiasResult(fallbackResult);
      setIsBiasModalOpen(true);
    } finally {
      setBiasLoading(false);
    }
  };

  const handleApplySuggestedRevision = () => {
    if (!activeEval || !biasResult?.suggestedRevision) return;
    onUpdateEvaluation(activeEval.id, { ...activeEval, note: biasResult.suggestedRevision });
    alert('متن پیشنهادی هوش مصنوعی با موفقیت جایگزین یادداشت ارزیاب گردید.');
    setIsBiasModalOpen(false);
  };

  // Generate AI Coaching Feedback using Gemini API
  const handleGenerateAIFeedback = async () => {
    if (!activeEval) return;

    onUpdateEvaluation(activeEval.id, { ...activeEval, aiLoading: true });

    try {
      const formattedScores = activeEval.scores.map(s => {
        const crit = criteria.find(c => c.id === s.cid);
        return {
          code: crit?.code || '',
          name: crit?.name || '',
          category: crit ? crit.cat : '',
          weight: s.weight,
          value: s.value,
          self: s.self,
          doc: s.doc || ''
        };
      });

      const response = await fetch('/api/gemini/coaching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeName: activeEmployee?.name || '',
          jobTitle: activeProfile?.title || '',
          period: activeEval.period,
          scores: formattedScores,
          note: activeEval.note || ''
        })
      });

      if (!response.ok) {
        throw new Error('اختلال در برقراری ارتباط با موتور هوش مصنوعی.');
      }

      const data = await response.json();
      onUpdateEvaluation(activeEval.id, { 
        ...activeEval, 
        aiFeedback: data.feedback,
        aiLoading: false 
      });
    } catch (err) {
      console.warn('Backend API connection failed. Generating clean local coaching feedback...', err);
      const fallbackFeedback = generateLocalCoachingFeedback(
        activeEmployee?.name || 'همکار گرامی',
        activeProfile?.title || 'شاغل تخصصی',
        activeEval.period,
        activeEval.scores,
        activeEval.note || '',
        criteria
      );
      
      onUpdateEvaluation(activeEval.id, { 
        ...activeEval, 
        aiFeedback: fallbackFeedback,
        aiLoading: false 
      });
    }
  };

  // Calculations for current evaluation
  
  const finalScore = activeEval ? calculateFinalScore(activeEval, profiles) : 0;

  const [rewardConfig, setRewardConfig] = React.useState<RewardConfig | null>(null);
  React.useEffect(() => {
    const fetchConfig = () => {
      const cfg = db.getMiscData<RewardConfig>('pe_reward_config', { coefficients: [], multipliers: [] });
      setRewardConfig(cfg);
    };
    fetchConfig();
    window.addEventListener('pe_reward_config_updated', fetchConfig);
    return () => window.removeEventListener('pe_reward_config_updated', fetchConfig);
  }, []);

  
  const projectedReward = React.useMemo(() => {
    if (!rewardConfig || !activeEval || finalScore === 0) return 0;
    const emp = employees.find(e => e.id === activeEval.empId);
    const prof = profiles.find(p => p.id === activeEval.profileId);
    if (!emp || !prof) return 0;
    
    const m = rewardConfig.multipliers.find(m => finalScore >= m.minScore && finalScore <= (m.maxScore === 100 ? 100 : m.maxScore));
    const mult = m ? m.multiplier : 0;
    
    let baseAmount = prof.baseRewardAmount;
    if (!baseAmount || baseAmount === 0) {
      const specific = rewardConfig.coefficients.find(c => c.jobFamily === prof.family);
      baseAmount = specific ? specific.baseAmount : (rewardConfig.coefficients.find(c => c.jobFamily === 'all')?.baseAmount || 0);
    }
    return evaluateNumericFormula(rewardConfig.formula || 'baseAmount * multiplier', { score: finalScore, baseAmount, multiplier: mult });
  }, [finalScore, rewardConfig, activeEval, employees, profiles]);
  
  const grade = finalScore > 0 ? getGrade(finalScore) : null;
  const gradeConfig = grade ? GRADE_DETAILS[grade] : null;

  const isFormComplete = activeEval?.scores.every(s => s.value > 0);
  const isDocSatisfied = activeEval?.scores.every(s => {
    if (NEED_DOCUMENT_SCORES.includes(s.value)) {
      return s.doc && s.doc.trim().length > 5;
    }
    return true;
  });

  const handleFinalizeAndLock = () => {
    if (!activeEval) return;
    if (isActiveDraftDirty) {
      setScoreDraftError('پیش از نهایی‌سازی، نمرات و شواهد را ذخیره کنید.');
      return;
    }
    if (!isFormComplete) {
      alert('خطا: ثبت نمره برای تمامی معیارهای شایستگی ارزیابی الزامی است.');
      return;
    }
    if (!isDocSatisfied) {
      alert('خطا: طبق مقررات، جهت جلوگیری از سوگیری، برای نمرات رتبه خاص (۱، ۲ و ۵) ثبت حداقل ۵ کاراکتر مستند و توضیح توجیهی الزامی است.');
      return;
    }

    // Trigger Gemini Pre-Lock Bias & Tone check
    runBiasAudit(true);
  };

  // Filtered evaluations for virtualized table
  const employeeById = useMemo(() => new Map(employees.map(employee => [employee.id, employee])), [employees]);
  const profileById = useMemo(() => new Map(profiles.map(profile => [profile.id, profile])), [profiles]);
  const filteredEvaluations = useMemo(() => {
    const filtered = evaluations.filter(evaluation => {
      const employee = employeeById.get(evaluation.empId);
      if (!employee) return normalizeSearchText(`${evaluation.period} ${evaluation.status}`).includes(normalizeSearchText(searchTerm));
      const profile = profileById.get(evaluation.profileId);
      return matchesEmployeeSearch(employee, searchTerm, [profile?.title || '', evaluation.period, evaluation.status]);
    });
    if (!searchTerm.trim()) return filtered;
    return filtered.sort((left, right) => {
      const leftEmployee = employeeById.get(left.empId);
      const rightEmployee = employeeById.get(right.empId);
      return (rightEmployee ? employeeSearchScore(rightEmployee, searchTerm) : 0) - (leftEmployee ? employeeSearchScore(leftEmployee, searchTerm) : 0);
    });
  }, [evaluations, employeeById, profileById, searchTerm]);

  return (
    <div className="space-y-7 text-right" dir="rtl">
      {/* 1. MAIN LIST VIEW */}
      {!activeEvalId ? (
        <>
          <div className="flex justify-between items-end flex-wrap gap-5 border-b border-slate-200/80 pb-5 dark:border-slate-800/80">
            <div className="max-w-2xl">
              <p className="mb-1.5 text-xs font-bold text-teal-700 dark:text-teal-300">فرم‌ها و نتایج دوره‌ای</p>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">سنجش و ارزیابی عملکرد</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-7">
                تکمیل فرم‌های خودارزیابی و ارزیابی سرپرست • مجهز به سیستم مربیگری اختصاصی و هوشمند هوش مصنوعی
              </p>
            </div>
            <div className="flex w-full items-center gap-2.5 flex-wrap lg:w-auto lg:justify-end">
              
              <button
                type="button"
                onClick={handleExportToExcel}
                className="min-h-11 bg-white hover:bg-slate-50 text-slate-700 dark:bg-slate-900/70 dark:hover:bg-slate-800 dark:text-slate-200 font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>خروجی اکسل نمرات</span>
              </button>
              <button
                type="button"
                onClick={() => setIsExcelModalOpen(true)}

                className="min-h-11 bg-white hover:bg-slate-50 text-slate-700 dark:bg-slate-900/70 dark:hover:bg-slate-800 dark:text-slate-200 font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 border border-slate-200 dark:border-slate-700 hover:border-teal-500/40 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>ورود داده از اکسل (کسری / MIS)</span>
              </button>

              {isAdmin && <button
                onClick={handleOpenNewModal}
                className="min-h-11 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>شروع ارزیابی جدید</span>
              </button>}
            </div>
          </div>

          {/* Guidelines on bias and justifications */}
          <div className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 p-4 rounded-2xl text-xs leading-relaxed">
            <h3 className="font-bold flex items-center gap-2 text-indigo-300">
              <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>مقررات ضدسوگیری و کنترل کیفیت ارزیابی (Anti-Bias Rules)</span>
            </h3>
            <p className="text-slate-300 mt-1.5">
              جهت ارتقای کیفیت ارزیابی‌ها و جلوگیری از پدیده تورم نمره‌ای، ثبت ارزیابی برای هر شاخص در مقیاس ۱ تا ۵ انجام می‌شود. نمرات <span className="text-red-400 font-bold">۱ (غیرقابل قبول)</span>، <span className="text-orange-400 font-bold">۲ (نیازمند بهبود)</span> و <span className="text-emerald-400 font-bold">۵ (فراتر از انتظار)</span> امتیازات خاص تلقی شده و ثبت لینک یا توصیف مستندات توجیهی برای نهایی‌سازی الزامی است. بدون مستند توجیهی، ارزیابی در حالت پیش‌نویس قفل خواهد ماند.
            </p>
          </div>

          {/* Search and Filters for Evaluations */}
          <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900/70 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex-wrap shadow-sm shadow-slate-950/[0.025]">
            <div className="relative flex-1 min-w-[240px]">
              <SearchInput resultCount={filteredEvaluations.length}
                type="text"
                placeholder="جستجو در ارزیابی‌ها (نام، کد پرسنلی، واحد یا دوره)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
               
              />
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="bg-slate-100 dark:bg-slate-800/70 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono">
                مجموع: {filteredEvaluations.length} پرونده
              </span>
            </div>
          </div>

          {/* Bulk Selection Actions Bar */}
          {selectedEvalIds.size > 0 && (
            <div className="bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-500/30 p-3.5 rounded-2xl flex items-center justify-between animate-in fade-in flex-wrap gap-3 shadow-sm">
              <div className="flex items-center gap-2 text-xs text-teal-300 font-bold">
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                <span>{selectedEvalIds.size} پرونده ارزیابی برای عملیات دسته‌ای انتخاب شده است</span>
              </div>
              <div className="flex items-center gap-2">
                {(currentUser?.role === 'admin' || currentUser?.role === 'supervisor') && <button
                  type="button"
                  disabled={!onBulkUpdateEvaluations}
                  onClick={() => setIsBulkScoringOpen(true)}
                  className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-40"
                >
                  <ClipboardCheck className="h-3.5 w-3.5" /><span>امتیازدهی گروهی</span>
                </button>}
                <button
                  type="button"
                  onClick={() => setIsBulkDeleteConfirmOpen(true)}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف دسته‌ای ({selectedEvalIds.size} مورد)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEvalIds(new Set())}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  لغو انتخاب‌ها
                </button>
              </div>
            </div>
          )}

          {/* Evaluations Virtualized Table */}
          {filteredEvaluations.length > 0 ? (
            <VirtualizedTable<Evaluation>
              items={filteredEvaluations}
              rowHeight={64}
              containerHeight={520}
              keyExtractor={(ev) => ev.id}
              columns={[
                { 
                  header: (
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={filteredEvaluations.length > 0 && selectedEvalIds.size === filteredEvaluations.length}
                        onChange={handleToggleSelectAll}
                        className="rounded border-slate-700 bg-slate-900 text-teal-500 focus:ring-0 cursor-pointer"
                        title="انتخاب همه ارزیابی‌ها"
                      />
                    </div>
                  ), 
                  className: 'w-12 text-center' 
                },
                { header: 'پرسنل', className: 'w-1/4 text-right' },
                { header: 'عنوان شغلی و واحد', className: 'w-1/4 text-right' },
                { header: 'دوره ارزیابی', className: 'w-1/6 text-center' },
                { header: 'نمره (۱۰۰)', className: 'w-1/12 text-center' },
                { header: 'رتبه عملکرد', className: 'w-1/8 text-center' },
                { header: 'وضعیت', className: 'w-1/8 text-center' },
                { header: 'عملیات', className: 'w-1/8 text-left' },
              ]}
              renderRow={(ev) => {
                const emp = employees.find(e => e.id === ev.empId);
                const prof = profiles.find(p => p.id === ev.profileId);
                const scoreVal = calculateFinalScore(ev, profiles);
                const evGrade = scoreVal > 0 ? getGrade(scoreVal) : null;
                const gradeDetails = evGrade ? GRADE_DETAILS[evGrade] : null;

                return (
                  <div
                    key={ev.id}
                    className="flex items-center text-xs w-full py-1 text-slate-200"
                  >
                    <div className="w-12 text-center flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selectedEvalIds.has(ev.id)}
                        onChange={(e) => handleToggleSelect(ev.id, e)}
                        className="rounded border-slate-700 bg-slate-900 text-teal-500 focus:ring-0 cursor-pointer"
                      />
                    </div>
                    <div className="w-1/4 font-semibold text-slate-200 truncate">
                      {emp?.name || 'نامشخص'}
                      <span className="text-[10px] text-slate-500 font-mono block">{emp?.code}</span>
                    </div>
                    <div className="w-1/4 truncate">
                      <div className="font-medium text-slate-300 truncate">{prof?.title || 'نامشخص'}</div>
                      <div className="text-[10px] text-slate-500 truncate">واحد: {emp?.unit || 'نامشخص'}</div>
                    </div>
                    <div className="w-1/6 text-center text-slate-400 font-mono text-[11px]">{ev.period}</div>
                    <div className="w-1/12 text-center font-bold text-slate-100 text-sm">
                      {scoreVal > 0 ? `${scoreVal}٪` : '—'}
                    </div>
                    <div className="w-1/8 text-center">
                      {evGrade && gradeDetails ? (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold bg-${gradeDetails.color}-500/10 text-${gradeDetails.color}-300 border border-${gradeDetails.color}-500/10`}>
                          {evGrade} — {gradeDetails.label}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </div>
                    <div className="w-1/8 text-center">
                      {ev.status === 'locked' ? (
                        <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded text-[10px]">
                          <Lock className="inline h-3.5 w-3.5" /> نهایی شده
                        </span>
                      ) : ev.status === 'calibrated' ? (
                        <span className="text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded text-[10px]">
                          <Scale className="inline h-3.5 w-3.5" /> کالیبره
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium bg-slate-800 px-2 py-0.5 rounded text-[10px]">
                          <Pencil className="inline h-3.5 w-3.5" /> پیش‌نویس
                        </span>
                      )}
                    </div>
                    <div className="w-1/8 text-left">
                      <div className="flex gap-1.5 justify-end items-center">
                        <button
                          onClick={() => onSetActiveEval(ev.id)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg text-[11px] transition-all cursor-pointer"
                        >
                          {ev.status === 'locked' ? 'مشاهده' : 'تکمیل'}
                        </button>
                        {(isAdmin || ev.status !== 'locked') && (
                          <button
                            onClick={() => setEvalToDelete(ev)}
                            className="p-1 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                            title={ev.status === 'locked' ? 'حذف ارزیابی نهایی شده (اختیار مدیر ارشد سیستم)' : 'حذف ارزیابی'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }}
            />
          ) : (
            <div className="py-16 text-center text-slate-500 bg-slate-850/5 rounded-2xl border border-dashed border-slate-800">
              <ClipboardCheck className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-base font-bold">هیچ فرآیند ارزیابی یافت نشد</p>
              <p className="text-xs mt-1">با کلیک روی دکمه شروع ارزیابی جدید، اولین گام ثبت ارزیابی را بردارید.</p>
            </div>
          )}
        </>
      ) : (
        /* 2. ACTIVE EVALUATION INTERACTIVE FORM */
        <div className="space-y-6">
          {/* Header Action bar */}
          <div className="flex justify-between items-center bg-slate-800/20 border border-slate-800/60 p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-teal-400 text-sm">
                {activeEmployee?.name[0]}
              </div>
              <div>
                <h2 className="text-base font-black text-slate-100">{activeEmployee?.name}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{activeProfile?.title} • دوره: {activeEval.period}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setEvalToDelete(activeEval)}
                  className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-all"
                  title="حذف این کارنامه ارزیابی"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف کارنامه</span>
                </button>
              )}
              <button
                onClick={() => onSetActiveEval(null)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                بازگشت به ارزیابی‌ها
              </button>
            </div>
          </div>

          {/* Step Progress Visual */}
          <div className="bg-slate-800/30 border border-slate-800 rounded-2xl p-4">
            <div className="flex justify-between text-[11px] mb-2 font-bold text-slate-400">
              <span>گام جاری فرآیند ارزیابی کارکنان:</span>
              <span className="text-teal-400">
                {activeEval.status === 'locked' ? 'گام ۶: ابلاغ و گفت‌وگو' : activeEval.status === 'calibrated' ? 'گام ۵: کالیبراسیون' : 'گام ۴: ارزیابی نهایی سرپرست'}
              </span>
            </div>
            
            <div className="grid grid-cols-6 gap-1 text-[10px] text-center font-medium">
              {CYCLE_STEPS.map((step) => {
                const isDone = activeEval.status === 'locked' || 
                             (activeEval.status === 'calibrated' && step.step <= 5) ||
                             (activeEval.status === 'draft' && step.step <= 4);
                return (
                  <div 
                    key={step.step}
                    className={`py-2 px-1 rounded-md border ${
                      isDone 
                        ? 'bg-teal-500/10 border-teal-500/20 text-teal-400 font-bold' 
                        : 'bg-slate-900/40 border-slate-800 text-slate-600'
                    }`}
                  >
                    <div>{step.step}</div>
                    <div className="truncate text-[8px] md:text-[10px] mt-0.5">{step.title.split(' ')[0]}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Form Matrix Table */}
          <div className="bg-slate-800/20 border border-slate-800 rounded-2xl overflow-hidden p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-200">ماتریس ارزش‌دهی سنجه‌ها</h3>

            <div className="space-y-4">
              {activeEval.scores.map((score, idx) => {
                const crit = criteria.find(c => c.id === score.cid);
                if (!crit) return null;
                const sourceProtected = isProtectedScoreSource(score, crit);
                const canEditValue = canEditManualScoreAt(idx);

                
                
                const isSpecial = NEED_DOCUMENT_SCORES.includes(score.value);
                const hasDoc = score.doc && score.doc.trim().length > 5;
                const docRequiredButEmpty = isSpecial && !hasDoc;
                
                const weightedSum = activeEval.scores.reduce((acc, curr) => acc + (curr.value * curr.weight), 0);
                const itemShare = weightedSum > 0 ? ((score.value * score.weight) / weightedSum) * projectedReward : 0;


                return (
                  <div key={score.cid} className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 space-y-3.5 hover:border-slate-700/50 transition-all">
                    {/* Index header */}
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex gap-2 items-start">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono shrink-0 mt-0.5 ${
                          crit.cat === 'K' ? 'bg-blue-500/10 text-blue-300' :
                          crit.cat === 'Q' ? 'bg-amber-500/10 text-amber-300' :
                          crit.cat === 'B' ? 'bg-purple-500/10 text-purple-300' :
                          crit.cat === 'S' ? 'bg-red-500/10 text-red-300' :
                          'bg-emerald-500/10 text-emerald-300'
                        }`}>
                          {crit.code}
                        </span>
                        <div>
                          <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 flex-wrap">
                            <span>{crit.name}</span>
                            <span className="text-[10px] text-slate-400 bg-slate-850 px-1.5 py-0.5 rounded">وزن شاخص: {score.weight}٪</span>
                            {sourceProtected && <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-300">{crit.scoringSource === 'mis' || score.sourceType === 'mis' || score.autoPopulated ? 'MIS · فقط‌خواندنی' : crit.scoringSource === 'kasra' || score.sourceType === 'kasra' ? 'کسری · فقط‌خواندنی' : crit.scoringSource === 'system' || score.sourceType === 'system' ? 'محاسبه سیستمی · فقط‌خواندنی' : 'منابع خارجی · فقط‌خواندنی'}</span>}
                            {!sourceProtected && crit.scoringSource === 'multi_source' && <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-300">داده‌های MIS/کسری فقط‌خواندنی · سهم ارزیابی سرپرست مجاز</span>}
                            {!sourceProtected && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">امتیاز دستی</span>}
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed max-w-3xl">{crit.def}</p>
                          {crit.source && (
                            <p className="text-[9px] text-slate-500 mt-0.5 font-mono">منبع داده رسمی: {crit.source} • سنجه: {crit.method}</p>
                          )}

                          {crit.scoringSource === 'multi_source' && (
                            <div className="mt-2.5 bg-slate-950/80 border border-teal-500/30 rounded-xl p-3 space-y-2">
                              <div className="flex items-center justify-between text-[11px] font-bold text-teal-300 flex-wrap gap-1">
                                <span className="flex items-center gap-1.5">
                                  <GitFork className="w-3.5 h-3.5 text-teal-400" />
                                  <span>شاخص چندمنبعی (تغذیه ترکیبی از چند سامانه و ارزیابی سرپرست)</span>
                                </span>
                                <span className="font-mono text-[10px] bg-teal-500/15 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded-md">
                                  امتیاز ترکیبی نهایی: {score.value > 0 ? `${score.value} از ۵` : 'در انتظار تجمیع داده‌ها'}
                                </span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[10px]">
                                <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                                  <div className="flex justify-between items-center">
                                    <span className="inline-flex items-center gap-1.5 text-slate-400"><Calculator aria-hidden="true" className="h-3.5 w-3.5" /> داده MIS (تولید/کیفیت):</span>
                                    <span className="font-mono font-bold text-cyan-400">{score.sourceBreakdown?.misScore ? `${score.sourceBreakdown.misScore} از ۵` : 'در انتظار ایمپورت'}</span>
                                  </div>
                                  <div className="text-[9px] text-slate-500 mt-1">سهم وزنی در شاخص: {crit.multiSourceConfig?.items?.find(i => i.source === 'mis')?.weightPercent ?? 50}٪</div>
                                </div>
                                <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                                  <div className="flex justify-between items-center">
                                    <span className="inline-flex items-center gap-1.5 text-slate-400"><Clock aria-hidden="true" className="h-3.5 w-3.5" /> حضور و غیاب کسری:</span>
                                    <span className="font-mono font-bold text-indigo-400">{score.sourceBreakdown?.kasraScore ? `${score.sourceBreakdown.kasraScore} از ۵` : 'در انتظار ایمپورت'}</span>
                                  </div>
                                  <div className="text-[9px] text-slate-500 mt-1">سهم وزنی در شاخص: {crit.multiSourceConfig?.items?.find(i => i.source === 'kasra')?.weightPercent ?? 25}٪</div>
                                </div>
                                <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                                  <div className="flex justify-between items-center">
                                    <span className="inline-flex items-center gap-1.5 text-slate-400"><ClipboardCheck aria-hidden="true" className="h-3.5 w-3.5" /> نظر کیفی سرپرست:</span>
                                    <span className="font-mono font-bold text-emerald-400">{score.sourceBreakdown?.supervisorScore ? `${score.sourceBreakdown.supervisorScore} از ۵` : 'ثبت با دکمه‌های زیر'}</span>
                                  </div>
                                  <div className="text-[9px] text-slate-500 mt-1">سهم وزنی در شاخص: {crit.multiSourceConfig?.items?.find(i => i.source === 'supervisor')?.weightPercent ?? 25}٪</div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Self Score Selector */}
                      <div className="text-right shrink-0">
                        <label className="block text-[10px] text-slate-400 mb-1">خودارزیابی</label>
                        <select
                          disabled={!canEditSelfScore()}
                          value={score.self}
                          onChange={(e) => handleSelfScoreChange(idx, parseInt(e.target.value) || 0)}
                          className="bg-slate-950 border border-slate-800 rounded-lg py-1 px-2 text-[10px] text-slate-200 focus:outline-none focus:border-teal-500"
                        >
                          <option value="0">ثبت نشده</option>
                          {[1, 2, 3, 4, 5].map(v => (
                            <option key={v} value={v}>{v} - {PERFORMANCE_SCALE[v]}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <hr className="border-slate-800/40" />

                    {/* Interactive Supervisor Rating Slider/Selector */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="block text-[10px] text-slate-400 font-semibold">ارزیابی نهایی سرپرست خط (۱ تا ۵):</label>
                          <button
                            type="button"
                            disabled={!canEditValue}
                            onClick={() => handleOpenQuickCalc(idx, crit)}
                            className="text-[10px] text-teal-400 hover:text-teal-300 font-bold flex items-center gap-1 bg-teal-500/10 hover:bg-teal-500/20 px-2 py-0.5 rounded-lg border border-teal-500/20 cursor-pointer transition-all"
                            title="ورود داده‌های عملکردی مانند تولید، سایکل‌تایم، ضایعات و محاسبه خودکار نمره با فرمول"
                          >
                            <Calculator className="w-3 h-3 text-teal-400" />
                            <span>محاسبه با فرمول داده‌ها</span>
                          </button>
                        </div>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((val) => {
                            const isSelected = score.value === val;
                            let btnStyle = 'bg-slate-800 text-slate-400 border-slate-750 hover:bg-slate-750 hover:text-slate-200';
                            
                            if (isSelected) {
                              if (val === 1) btnStyle = 'bg-red-500 text-slate-950 border-red-400 font-bold';
                              else if (val === 2) btnStyle = 'bg-orange-500 text-slate-950 border-orange-400 font-bold';
                              else if (val === 3) btnStyle = 'bg-amber-400 text-slate-950 border-amber-300 font-bold';
                              else if (val === 4) btnStyle = 'bg-blue-400 text-slate-950 border-blue-300 font-bold';
                              else btnStyle = 'bg-emerald-400 text-slate-950 border-emerald-300 font-bold';
                            }

                            return (
                              <button
                                key={val}
                                type="button"
                                disabled={!canEditValue || !isManualScoreInRange(crit, val)}
                                onClick={() => handleScoreChange(idx, val)}
                                className={`flex-1 py-1.5 px-2 rounded-lg text-xs border text-center transition-all ${btnStyle} ${
                                  !canEditValue || !isManualScoreInRange(crit, val) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                }`}
                                title={PERFORMANCE_SCALE[val]}
                              >
                                <span className="block font-black text-xs">{val}</span>
                                <span className="text-[7px] leading-none block truncate mt-0.5">{PERFORMANCE_SCALE[val]}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Supporting Justification File Input */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="block text-[10px] text-slate-400 font-semibold">شواهد و مستند پشتیبان:</label>
                          {docRequiredButEmpty && (
                            <span className="text-[9px] bg-red-500/10 text-red-400 font-bold px-1.5 py-0.5 rounded animate-pulse">
                              الزامی برای رتبه‌های خاص (۱، ۲ یا ۵)
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          disabled={!canEditScoreDocumentAt(idx)}
                          placeholder={isSpecial ? "توصیف سند/لینک گزارش MES (حداقل ۵ کاراکتر)..." : "لینک سند پشتیبان یا شماره لاگ سیستم (اختیاری)..."}
                          value={score.doc || ''}
                          onChange={(e) => handleDocChange(idx, e.target.value)}
                          className={`w-full bg-slate-950 border rounded-xl py-2 px-3 text-[11px] text-slate-200 focus:outline-none focus:border-teal-500 ${
                            docRequiredButEmpty ? 'border-red-500/40 focus:border-red-500' : 'border-slate-800'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <hr className="border-slate-800" />

            {/* Conversation/Coaching summary note */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">خلاصه مربیگری و تفاهم توسعه فردی (مذاکره حضوری سرپرست و کارمند)</label>
              <textarea
                disabled={activeEval.status === 'locked'}
                placeholder="تفاهمات انجام شده جهت اقدامات اصلاحی، رفع نقاط ضعف و بهره‌گیری از پتانسیل‌های همکار را خلاصه بنویسید..."
                value={activeEval.note || ''}
                onChange={(e) => handleNoteChange(e.target.value)}
                className="w-full h-24 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-teal-500 resize-none"
              />

              {/* AI Feedback Assistant for Supervisor text refinement & coaching suggestions */}
              {activeEval.status !== 'locked' && (
                <div className="pt-2">
                  <AIFeedbackAssistant
                    supervisorComment={activeEval.note || ''}
                    employeeName={activeEmployee?.name || 'همکار گرامی'}
                    jobTitle={activeProfile?.title || 'عنوان شغلی'}
                    competencyScores={{
                      K: activeEval.scores.find(s => criteria.find(c => c.id === s.cid)?.cat === 'K')?.value || 3.5,
                      Q: activeEval.scores.find(s => criteria.find(c => c.id === s.cid)?.cat === 'Q')?.value || 4.0,
                      B: activeEval.scores.find(s => criteria.find(c => c.id === s.cid)?.cat === 'B')?.value || 3.8,
                      S: activeEval.scores.find(s => criteria.find(c => c.id === s.cid)?.cat === 'S')?.value || 4.5,
                      L: activeEval.scores.find(s => criteria.find(c => c.id === s.cid)?.cat === 'L')?.value || 3.5
                    }}
                    onApplyFeedback={(refinedText) => {
                      handleNoteChange(refinedText);
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 3. GEMINI AI smart mentoring and feedback generator */}
          <div className="bg-slate-800/30 border border-purple-500/20 rounded-2xl p-5 space-y-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-32 h-32 bg-purple-500/5 rounded-br-full blur-2xl pointer-events-none" />
            
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <Brain className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                    <span>برنامه مربیگری و توسعه هوشمند (AI Co-Pilot)</span>
                    <span className="text-[9px] bg-purple-500/20 text-purple-300 font-semibold px-2 py-0.5 rounded-full">Gemini 3.5</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">تجزیه و تحلیل نقاط قوت و ضعف بر اساس نمرات و تولید خودکار برنامه توسعه فردی (IDP) ارزنده</p>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => runBiasAudit(false)}
                  disabled={biasLoading || activeEval.status === 'locked'}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-indigo-500/50 font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {biasLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                      <span>پایش سوگیری با هوش مصنوعی...</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="w-4 h-4 text-indigo-400" />
                      <span>آنالیز سوگیری و لحن توضیحات (Gemini)</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleGenerateAIFeedback}
                  disabled={activeEval.aiLoading || activeEval.status === 'locked' || activeEval.scores.every(s => s.value === 0)}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-slate-100 font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-purple-500/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {activeEval.aiLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-purple-200" />
                      <span>در حال ارزیابی با هوش مصنوعی...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-purple-300" />
                      <span>تولید برنامه توسعه و بازخورد هوشمند (AI)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* AI Output Result panel */}
            {activeEval.aiFeedback ? (
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 text-xs space-y-4 divide-y divide-slate-800/40">
                {/* AI Summary */}
                <div className="space-y-1">
                  <div className="font-bold text-purple-300 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-purple-400" />
                    <span>خلاصه ارزیابی و جهت مربیگری هوشمند</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed font-sans">{activeEval.aiFeedback.summary}</p>
                </div>

                {/* Strengths */}
                <div className="pt-3 space-y-2">
                  <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>نقاط قوت و مزیت‌های عملکردی (شایستگی‌های کلیدی)</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-400 pl-2">
                    {activeEval.aiFeedback.strengths.map((str, i) => (
                      <li key={i} className="leading-relaxed">{str}</li>
                    ))}
                  </ul>
                </div>

                {/* Development areas */}
                <div className="pt-3 space-y-2">
                  <div className="font-bold text-orange-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                    <span>نقاط قابل بهبود و فرصت‌های رشد فنی رفتاری</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-400 pl-2">
                    {activeEval.aiFeedback.developmentAreas.map((dev, i) => (
                      <li key={i} className="leading-relaxed">{dev}</li>
                    ))}
                  </ul>
                </div>

                {/* IDP Action Items */}
                <div className="pt-3 space-y-2">
                  <div className="font-bold text-teal-400 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-teal-500" />
                    <span>برنامه اقدام و اهداف پیشنهادی توسعه فردی (Individual Development Plan)</span>
                  </div>
                  <ul className="list-decimal list-inside space-y-1 text-slate-400 pl-2">
                    {activeEval.aiFeedback.actionItems.map((item, i) => (
                      <li key={i} className="leading-relaxed">{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              !activeEval.aiLoading && (
                <div className="bg-slate-900/40 p-4 text-center rounded-xl border border-slate-800 text-xs text-slate-500">
                  <Brain className="w-7 h-7 text-slate-600 mx-auto mb-2" />
                  <p>برنامه توسعه هوش مصنوعی ایجاد نشده است. پس از امتیازدهی به تمام شاخص‌ها، دکمه بالا را فشرده و برنامه رشد هوشمند را تحویل بگیرید.</p>
                </div>
              )
            )}
          </div>

          {scoreDraftError && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{scoreDraftError}</div>}

          {/* Save/Submit bar */}
          <div className="flex justify-between items-center bg-slate-950/40 border border-slate-800 p-4 rounded-2xl">
            <div className="flex items-center gap-4">
              {grade && gradeConfig ? (
                <div className="flex items-center gap-3 bg-slate-900 px-4 py-2 rounded-xl border border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-500 text-[10px] block">نمره نهایی محاسبه شده (۱۰۰):</span>
                    <span className="text-sm font-black text-slate-200 mt-0.5 block">{finalScore}٪</span>
                  </div>
                  <div className="w-px h-8 bg-slate-800" />
                  <div>
                    <span className="text-slate-500 text-[10px] block">رتبه فرضی سازمان:</span>
                    <span className={`text-xs font-bold text-${gradeConfig.color}-400 mt-0.5 block`}>{grade} — {gradeConfig.label}</span>
                  </div>
                </div>
              ) : (
                <span className="text-xs text-slate-500">پس از ارزیابی حداقل یک شاخص، نمره نهایی پدیدار می‌شود.</span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {isActiveDraftDirty && <span className="text-[10px] font-bold text-amber-300">تغییرات نمره و شواهد ذخیره‌نشده</span>}
              <button
                type="button"
                onClick={saveActiveDraft}
                disabled={!isActiveDraftDirty}
                className="px-3.5 py-2 bg-teal-600 hover:bg-teal-500 text-white border border-teal-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" /><span>ذخیره نمرات</span>
              </button>
              {/* ADMIN OR UNLOCKED SUPERVISOR DELETE ACTION IN BOTTOM BAR */}
              {(isAdmin || activeEval.status !== 'locked') && (
                <button
                  type="button"
                  onClick={() => setEvalToDelete(activeEval)}
                  className="px-3.5 py-2 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="حذف کامل این پرونده ارزیابی (اختیار مدیر سیستم)"
                >
                  <Trash2 className="w-4 h-4 text-rose-500" />
                  <span>حذف این ارزیابی</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onSetActiveEval(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                ذخیره به عنوان پیش‌نویس
              </button>

              
              {activeEval.status !== 'locked' ? (
                <button
                  type="button"
                  onClick={handleFinalizeAndLock}
                  className={`px-4 py-2 font-bold rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer ${
                    isFormComplete && isDocSatisfied
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-slate-950'
                      : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-850'
                  }`}
                  disabled={!isFormComplete || !isDocSatisfied}
                >
                  <Lock className="w-4 h-4" />
                  <span>بازبینی کیفیت و ادامه گردش کار</span>
                </button>
              ) : (
                <span className="text-xs bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20 px-4 py-2 rounded-xl flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> این سند نهایی و آرشیو شده است</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. DIALOG MODAL FOR NEW EVALUATION */}
      {isNewModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-sm font-bold text-slate-200">شروع چرخه ارزیابی عملکرد جدید</h2>
              <button 
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                aria-label="بستن"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateEvaluation} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">انتخاب یک یا چند همکار</label>
                <SearchInput resultCount={filteredStartEmployees.length} value={startSearch} onChange={event => setStartSearch(event.target.value)} placeholder="جستجو با نام یا کد پرسنلی" />
                <select value={startUnit} onChange={event => setStartUnit(event.target.value)} aria-label="فیلتر واحد سازمانی" className="mt-2 w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-200">
                  <option value="">همه واحدها</option>
                  {Array.from(new Set(employees.map(employee => employee.unit).filter(Boolean))).sort().map(unit => <option key={unit} value={unit}>{unit}</option>)}
                </select>
                <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800">
                  {filteredStartEmployees.slice(0, 100).map(emp => {
                    const checked = startSelection.has(emp.id);
                    return <label key={emp.id} className="flex items-center gap-2 px-3 py-2 text-xs text-slate-300 cursor-pointer hover:bg-slate-800/50">
                      <input type="checkbox" checked={checked} onChange={() => setStartSelection(current => { const next = new Set(current); checked ? next.delete(emp.id) : next.add(emp.id); return next; })} />
                      <span>{emp.name} — {emp.code}</span>
                      {!emp.profileId && <span className="text-rose-400">پروفایل ندارد</span>}
                    </label>;
                  })}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-slate-500">{filteredStartEmployees.length} نفر مطابق فیلتر · {startSelection.size} انتخاب‌شده</span>
                  <button type="button" onClick={() => setStartSelection(current => new Set([...current, ...filteredStartEmployees.map(employee => employee.id)]))} className="text-teal-400 font-bold">انتخاب همه نتایج فیلتر</button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">دوره زمانی ارزیابی</label>
                <input
                  type="text"
                  required
                  placeholder="مانند: نیمه اول ۱۴۰۵"
                  value={newPeriod}
                  onChange={(e) => setNewPeriod(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className={`rounded-xl border p-3 text-xs ${activePeriod.trim() === newPeriod.trim() ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                <div className="font-bold text-slate-200">وضعیت دوره: {activePeriod.trim() === newPeriod.trim() ? `فعال — ${activePeriod}` : `غیرفعال${activePeriod ? ` · دوره فعال فعلی: ${activePeriod}` : ''}`}</div>
                {activePeriod.trim() !== newPeriod.trim() && <button type="button" onClick={handleActivatePeriod} disabled={!isAdmin || !newPeriod.trim()} className="mt-2 rounded-lg bg-amber-400 px-3 py-2 font-bold text-slate-950 disabled:opacity-50">فعال‌سازی دوره به‌تنهایی</button>}
              </div>

              {(() => {
                const preview = previewEvaluationStart(Array.from(startSelection), newPeriod, employees, profiles, evaluations);
                return <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs space-y-1">
                  <div className="font-bold text-slate-200">پیش‌نمایش شروع دوره «{newPeriod || '—'}»</div>
                  <div className="text-slate-400">انتخاب‌شده: {preview.selected} · واجد شرایط: {preview.eligible} · موجود: {preview.alreadyExists} · نیازمند اصلاح: {preview.ineligible}</div>
                  {preview.rows.filter(row => row.reason !== 'eligible').slice(0, 5).map(row => <div key={row.employeeId} className="text-amber-300">{row.code || row.name}: {row.reason === 'already_exists' ? 'ارزیابی تکراری است' : row.reason === 'missing_profile' ? 'پروفایل شغلی تعریف نشده' : 'پروفایل فاقد معیار است'}</div>)}
                </div>;
              })()}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={!isAdmin || activePeriod.trim() !== newPeriod.trim() || previewEvaluationStart(Array.from(startSelection), newPeriod, employees, profiles, evaluations).eligible === 0}
                  className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-slate-900 rounded-xl text-xs font-bold cursor-pointer"
                >
                  {activePeriod.trim() === newPeriod.trim() ? 'شروع ارزیابی واجد شرایط' : 'ابتدا دوره را فعال کنید'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* 5. GEMINI BIAS & TONE AUDIT MODAL */}
      {isBiasModalOpen && biasResult && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-750 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl space-y-0 my-8">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border font-mono font-bold text-base ${
                  biasResult.integrityScore >= 85
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : biasResult.integrityScore >= 70
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                }`}>
                  {biasResult.integrityScore}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-400" />
                    <span>تحلیل هوشمند بی‌طرفی، سوگیری و لحن ارزیابی (Gemini)</span>
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    پایش سیستماتیک جهت جلوگیری از خطای هاله، سوگیری زمانی، ارفاق/سخت‌گیری و لحن نامناسب
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsBiasModalOpen(false)}
                aria-label="بستن"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto text-xs leading-relaxed">
              {/* Warnings List */}
              {biasResult.biasesDetected.length > 0 ? (
                <div className="space-y-2.5">
                  <h3 className="font-bold text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>هشدارهای شناسایی شده در ارزیابی و یادداشت سرپرست ({biasResult.biasesDetected.length} مورد):</span>
                  </h3>
                  {biasResult.biasesDetected.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2 text-right"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200">{item.title}</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          item.severity === 'high'
                            ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                            : item.severity === 'medium'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}>
                          شدت: {item.severity === 'high' ? 'بالا' : item.severity === 'medium' ? 'متوسط' : 'خفیف'}
                        </span>
                      </div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">{item.description}</p>
                      {item.highlightSnippet && (
                        <div className="bg-slate-900/90 border-r-2 border-amber-500 p-2 text-[10px] text-amber-200/90 rounded-l">
                          عبارت یا شاخص مورد توجه: <span className="font-mono font-bold">"{item.highlightSnippet}"</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-emerald-300 flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                  <div>
                    <h4 className="font-bold text-xs">ارزیابی عادلانه و فاقد سوگیری بحرانی</h4>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      توزیع نمرات و متن توضیحات ارزیاب از سلامت زبانی و بی‌طرفی حرفه‌ای برخوردار است.
                    </p>
                  </div>
                </div>
              )}

              {/* Gemini Suggested Constructive Rewrite */}
              {biasResult.suggestedRevision && (
                <div className="bg-purple-950/20 border border-purple-500/30 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span>پیشنهاد نگارش حرفه‌ای، سازنده و بدون سوگیری هوش مصنوعی:</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleApplySuggestedRevision}
                      className="bg-purple-600 hover:bg-purple-500 text-slate-100 font-bold px-3 py-1.5 rounded-lg text-[10px] flex items-center gap-1.5 transition-all cursor-pointer shadow"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>جایگزینی در یادداشت سرپرست</span>
                    </button>
                  </div>
                  <div className="bg-slate-950/70 p-3 rounded-lg border border-purple-500/20 text-slate-200 text-[11px] leading-relaxed">
                    {biasResult.suggestedRevision}
                  </div>
                </div>
              )}

              {/* Coaching advice for evaluator */}
              {biasResult.coachingAdvice && (
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 text-slate-300 space-y-1">
                  <div className="font-bold text-slate-300 flex items-center gap-1.5 text-[11px]">
                    <MessageSquareQuote className="w-4 h-4 text-teal-400" />
                    <span>توصیه به مدیر ارزیاب برای جلسه بازخورد و مذاکره شایستگی:</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{biasResult.coachingAdvice}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex justify-between items-center flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsBiasModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                بستن و ویرایش یادداشت
              </button>

              <div className="flex gap-2">
                {biasResult.suggestedRevision && (
                  <button
                    type="button"
                    onClick={handleApplySuggestedRevision}
                    className="px-4 py-2 bg-purple-600/80 hover:bg-purple-600 text-slate-100 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>اعمال متن پیشنهادی AI</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsBiasModalOpen(false);
                    onNavigateToWorkflow?.();
                  }}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <GitFork className="w-4 h-4" />
                  <span>ادامه در گردش کار</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 6. EXCEL INTEGRATION MODAL (KASRA & MIS & DYNAMIC) */}
      <ExcelIntegrationCenter
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        employees={employees}
        profiles={profiles}
        criteria={criteria}
        evaluations={evaluations}
        currentUser={currentUser}
        onUpdateEvaluations={(updatedEvals, sourceImport) => {
          if (onBulkUpdateEvaluations) return onBulkUpdateEvaluations(updatedEvals, sourceImport);
          if (sourceImport) return db.saveEvaluationsWithSourceImport(updatedEvals, sourceImport);
          db.saveEvaluations(updatedEvals);
          return true;
        }}
        onAddEvaluation={onAddEvaluation}
      />

      {/* 7. QUICK KPI DATA CALCULATOR MODAL */}
      {quickCalcState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in" dir="rtl">
          <div className="relative w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-100">
                    محاسبه خودکار نمره: {quickCalcState.criterion.name}
                  </h3>
                  <span className="text-[10px] font-mono text-teal-400">
                    {quickCalcState.criterion.code} • فرمول: {quickCalcState.criterion.formulaExpression || '(actual / target) * 100'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickCalcState(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Input Variables */}
            <div className="space-y-3">
              {(quickCalcState.criterion.variables && quickCalcState.criterion.variables.length > 0) ? (
                quickCalcState.criterion.variables.map(v => (
                  <div key={v.key} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div>
                      <span className="text-xs font-bold text-slate-300">{v.label}</span>
                      <span className="text-[10px] font-mono text-slate-500 block">{v.key}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        value={quickCalcInputs[v.key] ?? v.defaultValue ?? 0}
                        onChange={(e) => setQuickCalcInputs({ ...quickCalcInputs, [v.key]: Number(e.target.value) })}
                        className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-left focus:outline-none focus:border-teal-500"
                        dir="ltr"
                      />
                      <span className="text-[10px] text-slate-400 w-10">{v.unit}</span>
                    </div>
                  </div>
                ))
              ) : (
                <>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-xs font-bold text-slate-300">عملکرد / تولید واقعی (Actual)</span>
                    <input
                      type="number"
                      value={quickCalcInputs['actual'] ?? 95}
                      onChange={(e) => setQuickCalcInputs({ ...quickCalcInputs, actual: Number(e.target.value) })}
                      className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-left"
                      dir="ltr"
                    />
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-xs font-bold text-slate-300">تارگت / برنامه مصوب (Target)</span>
                    <input
                      type="number"
                      value={quickCalcInputs['target'] ?? 100}
                      onChange={(e) => setQuickCalcInputs({ ...quickCalcInputs, target: Number(e.target.value) })}
                      className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-left"
                      dir="ltr"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Live Calculation Preview */}
            {(() => {
              const res = calculateKpiScore(quickCalcState.criterion, quickCalcInputs);
              return (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-teal-500/30 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block">مقدار محاسبه شده:</span>
                    <span className="text-sm font-black font-mono text-teal-400">
                      {res.computedValue} {quickCalcState.criterion.unit || '%'}
                    </span>
                    <p className="text-[9px] text-slate-500 mt-0.5">{res.statusLabel}</p>
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] text-slate-400 block">نمره کارنامه (۱ تا ۵):</span>
                    <span className="text-2xl font-black font-mono text-emerald-400 px-3 py-0.5 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
                      {res.score}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuickCalcState(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleApplyQuickCalc}
                className="flex-1 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-black cursor-pointer shadow-lg shadow-teal-500/20"
              >
                اعمال مستقیم در کارنامه
              </button>
            </div>
          </div>
        </div>
      )}

      {isBulkScoringOpen && currentUser && onBulkUpdateEvaluations && <BulkScoringModal
        evaluationIds={Array.from(selectedEvalIds)}
        evaluations={evaluations}
        employees={employees}
        profiles={profiles}
        criteria={criteria}
        currentUser={currentUser}
        onSave={onBulkUpdateEvaluations}
        onClose={() => setIsBulkScoringOpen(false)}
      />}

      {/* Delete Single Evaluation Confirmation Modal */}
      {evalToDelete && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-right animate-in fade-in">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-100">تایید حذف کارنامه ارزیابی</h3>
                <p className="text-[11px] text-slate-400">
                  {evalToDelete.status === 'locked' ? 'کارنامه نهایی شده (اختیار مدیر ارشد)' : 'کارنامه در جریان ارزیابی'}
                </p>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>نام همکار:</span>
                <span className="font-bold text-slate-100">
                  {employees.find(e => e.id === evalToDelete.empId)?.name || 'نامشخص'}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>دوره ارزیابی:</span>
                <span className="text-teal-400 font-mono">{evalToDelete.period}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>نمره کل عملکرد:</span>
                <span className="font-bold font-mono">{evalToDelete.overallScore.toFixed(1)} / ۱۰۰</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>وضعیت:</span>
                <span className="font-bold">{evalToDelete.status === 'locked' ? 'قفل شده' : 'پیش‌نویس'}</span>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-300 leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>
                توجه: این ارزیابی و تمام ریزنمرات، بازخوردها و مصوبات کالیبراسیون آن به صورت دائمی از سامانه حذف خواهد شد.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setEvalToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition-all cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteEvaluation(evalToDelete.id);
                  if (activeEvalId === evalToDelete.id) {
                    onSetActiveEval(null);
                  }
                  setEvalToDelete(null);
                }}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all cursor-pointer shadow-lg shadow-rose-600/20 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>بله، حذف کارنامه</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Bulk Delete Evaluations Confirmation Modal */}
      {isBulkDeleteConfirmOpen && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-right animate-in fade-in">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-100">تایید حذف گروهی ارزیابی‌ها</h3>
                <p className="text-[11px] text-slate-400">حذف همزمان {selectedEvalIds.size} پرونده ارزیابی</p>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 space-y-2 text-xs max-h-48 overflow-y-auto">
              <div className="text-slate-400 font-medium mb-1">کارنامه‌های انتخاب‌شده برای حذف:</div>
              {Array.from(selectedEvalIds).map(id => {
                const ev = evaluations.find(e => e.id === id);
                const emp = employees.find(e => e.id === ev?.empId);
                const sc = ev ? calculateFinalScore(ev, profiles) : 0;
                return (
                  <div key={id} className="flex justify-between items-center py-1 border-b border-slate-900 text-slate-200 text-xs">
                    <span>{emp?.name || 'همکار'} ({ev?.period})</span>
                    <span className="font-mono text-teal-400 text-[11px]">{sc.toFixed(1)} / ۱۰۰</span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-300 leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>
                هشدار: این عملیات دائمی بوده و تمامی کارنامه‌ها و داده‌های نمره‌دهی انتخاب‌شده پاک خواهند شد.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setIsBulkDeleteConfirmOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition-all cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDelete}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all cursor-pointer shadow-lg shadow-rose-600/20 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تایید و حذف گروهی ({selectedEvalIds.size} مورد)</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

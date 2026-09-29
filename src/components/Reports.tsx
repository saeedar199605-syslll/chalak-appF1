/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { calculateFinalScore, evaluateNumericFormula } from '../utils/formulaEngine';
import { createPortal } from 'react-dom';
import { downloadWorkbook, recordsToRows } from '../utils/excelWorkbook';
import { 
  TrendingUp, 
  Download, 
  Award, 
  BarChart3, 
  Activity, 
  Building2,
  FileCheck2,
  CheckCircle2,
  Calendar,
  Sparkles,
  Trash2,
  AlertTriangle,
  LockKeyhole,
  Scale,
  Pencil
} from 'lucide-react';
import { Evaluation, Employee, JobProfile, Criterion, CATEGORIES, getGrade, GRADE_DETAILS } from '../types';
import RadarChartD3, { CompetencyDimensionData } from './RadarChartD3';
import NineBoxAIAnalysis from './NineBoxAIAnalysis';
import { downloadWorkflowCalendarICS, DEFAULT_WORKFLOW_DEADLINES } from '../utils/calendarExport';
import { db } from '../utils/db';

const GRADE_PILL_TEXT: Record<string, string> = {
  emerald: 'text-emerald-700 dark:text-emerald-300',
  blue: 'text-blue-700 dark:text-blue-300',
  amber: 'text-amber-800 dark:text-amber-300',
  orange: 'text-orange-700 dark:text-orange-300',
  red: 'text-red-700 dark:text-red-300',
};

interface ReportsProps {
  evaluations: Evaluation[];
  employees: Employee[];
  profiles: JobProfile[];
  criteria: Criterion[];
  currentUserRole?: 'admin' | 'supervisor' | 'employee';
  onDeleteEvaluation?: (id: string) => void;
  onBulkDeleteEvaluations?: (ids: string[]) => void;
  onSelectEvaluation?: (id: string) => void;
  onNavigate?: (tab: any) => void;
  currentUser?: Employee | null;
  theme?: 'dark' | 'light';
}

export default function Reports({
  evaluations,
  employees,
  profiles,
  criteria,
  currentUserRole = 'admin',
  onDeleteEvaluation,
  onBulkDeleteEvaluations,
  onSelectEvaluation,
  onNavigate,
  currentUser,
  theme = 'light'
}: ReportsProps) {
  const isAdmin = currentUserRole === 'admin';
  // Only report evaluations that have actual scores
  const ratedEvals = evaluations.filter(ev => ev.scores.some(s => s.value > 0));

  const [selectedReportEvalIds, setSelectedReportEvalIds] = useState<Set<string>>(new Set());
  const [reportEvalToDelete, setReportEvalToDelete] = useState<Evaluation | null>(null);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  const handleToggleSelectAll = () => {
    if (selectedReportEvalIds.size === ratedEvals.length) {
      setSelectedReportEvalIds(new Set());
    } else {
      setSelectedReportEvalIds(new Set(ratedEvals.map(e => e.id)));
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedReportEvalIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedReportEvalIds(next);
  };

  const handleConfirmBulkDelete = () => {
    if (selectedReportEvalIds.size === 0) return;
    if (onBulkDeleteEvaluations) {
      onBulkDeleteEvaluations(Array.from(selectedReportEvalIds));
    } else if (onDeleteEvaluation) {
      selectedReportEvalIds.forEach(id => onDeleteEvaluation(id));
    }
    setSelectedReportEvalIds(new Set());
    setIsBulkDeleteModalOpen(false);
  };

  
  // 1. Average score per department/unit
  const unitScores: Record<string, number[]> = {};
  ratedEvals.forEach(ev => {
    const emp = employees.find(e => e.id === ev.empId);
    if (!emp) return;
    const unitName = emp.unit || 'عمومی/نامشخص';
    if (!unitScores[unitName]) unitScores[unitName] = [];
    unitScores[unitName].push(calculateFinalScore(ev, profiles));
  });

  const unitAverages = Object.keys(unitScores).map(unit => {
    const scores = unitScores[unit];
    const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    return {
      unit,
      avg: Math.round(avg * 10) / 10,
      count: scores.length
    };
  });

  // 2. Average score per competency/criterion category
  const categoryScores: Record<string, { sum: number; count: number }> = {
    K: { sum: 0, count: 0 },
    Q: { sum: 0, count: 0 },
    B: { sum: 0, count: 0 },
    S: { sum: 0, count: 0 },
    L: { sum: 0, count: 0 }
  };

  ratedEvals.forEach(ev => {
    ev.scores.forEach(s => {
      if (s.value === 0) return;
      const crit = criteria.find(c => c.id === s.cid);
      if (!crit) return;
      categoryScores[crit.cat].sum += s.value;
      categoryScores[crit.cat].count += 1;
    });
  });

  const categoryAverages = Object.keys(categoryScores).map(cat => {
    const data = categoryScores[cat];
    const avg5 = data.count > 0 ? data.sum / data.count : 0;
    // Scale 1-5 to percentage (100)
    const pct = Math.round(avg5 * 20 * 10) / 10;
    return {
      cat,
      avg: pct,
      count: data.count,
      label: CATEGORIES[cat as keyof typeof CATEGORIES]
    };
  }).filter(c => c.count > 0);

  const [selectedEmpForRadar, setSelectedEmpForRadar] = useState<string>('all');

  const getRadarData = (): CompetencyDimensionData[] => {
    const targetEvals = selectedEmpForRadar === 'all'
      ? ratedEvals
      : ratedEvals.filter(e => e.empId === selectedEmpForRadar);

    const dims: {
      key: 'K' | 'Q' | 'B' | 'S' | 'L';
      label: string;
      shortLabel: string;
      sum: number;
      count: number;
      selfSum: number;
      selfCount: number;
      target: number;
    }[] = [
      { key: 'K', label: 'اهداف کمی (K)', shortLabel: 'K - کمی', sum: 0, count: 0, selfSum: 0, selfCount: 0, target: 4.2 },
      { key: 'Q', label: 'کیفیت و دقت فنی (Q)', shortLabel: 'Q - کیفی', sum: 0, count: 0, selfSum: 0, selfCount: 0, target: 4.5 },
      { key: 'B', label: 'رفتارهای سازمانی (B)', shortLabel: 'B - رفتاری', sum: 0, count: 0, selfSum: 0, selfCount: 0, target: 4.0 },
      { key: 'S', label: 'ایمنی و ۵S (S)', shortLabel: 'S - ایمنی', sum: 0, count: 0, selfSum: 0, selfCount: 0, target: 4.8 },
      { key: 'L', label: 'کار تیمی و انضباط (L)', shortLabel: 'L - رهبری', sum: 0, count: 0, selfSum: 0, selfCount: 0, target: 4.1 },
    ];

    targetEvals.forEach(ev => {
      ev.scores.forEach(s => {
        const crit = criteria.find(c => c.id === s.cid);
        if (crit) {
          const cat = crit.cat || 'K';
          const dim = dims.find(d => d.key === cat) || dims[0];
          if (s.value > 0) {
            dim.sum += s.value;
            dim.count += 1;
          }
          if (s.self && s.self > 0) {
            dim.selfSum += s.self;
            dim.selfCount += 1;
          }
        }
      });
    });

    return dims.map(d => ({
      key: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      actual: d.count > 0 ? Math.round((d.sum / d.count) * 10) / 10 : 3.8,
      target: d.target,
      self: d.selfCount > 0 ? Math.round((d.selfSum / d.selfCount) * 10) / 10 : undefined,
      description: d.label
    }));
  };

  // 3. Trigger CSV Download
  
  
  const rewardConfig = db.getMiscData('pe_reward_config', {
    formula: 'baseAmount * multiplier',
    coefficients: [{ jobFamily: 'all', baseAmount: 10000000 }],
    multipliers: [{ minScore: 0, maxScore: 100, multiplier: 1 }]
  });

  const getReward = (score: number, jobFamily: string, baseRewardAmount?: number) => {
    let baseAmount = baseRewardAmount;
    if (!baseAmount) {
      const specific = rewardConfig.coefficients.find(c => c.jobFamily === jobFamily);
      baseAmount = specific ? specific.baseAmount : (rewardConfig.coefficients.find(c => c.jobFamily === 'all')?.baseAmount || 0);
    }
    const m = rewardConfig.multipliers.find(m => score >= m.minScore && score <= (m.maxScore === 100 ? 100 : m.maxScore));
    const multiplier = m ? m.multiplier : 0;
    return evaluateNumericFormula(rewardConfig.formula || 'baseAmount * multiplier', { score, baseAmount, multiplier });
  };

  const handleExportAggregatedExcel = () => {
    if (evaluations.length === 0) {
      alert('داده‌ای برای خروجی وجود ندارد.');
      return;
    }

    const exportRows = evaluations.map(ev => {
      const emp = employees.find(e => e.id === ev.empId);
      const prof = profiles.find(p => p.id === ev.profileId);
      const score = calculateFinalScore(ev, profiles);
      // Determine unit and supervisor based on emp data or defaults
      const unit = emp ? emp.unit : 'نامشخص';
      const superName = emp?.supervisorId ? employees.find(e => e.id === emp.supervisorId)?.name : 'نامشخص';
      
      return {
        'کد پرسنلی': emp?.code || '---',
        'نام پرسنل': emp?.name || '---',
        'واحد سازمانی': unit,
        'نام سرپرست/مدیر': superName,
        'سمت سازمانی': prof?.title || '---',
        'دوره ارزیابی': ev.period,
        'نمره نهایی': score,
        'مبلغ پاداش (ریال)': getReward(score, prof?.family || emp?.unit || 'all', prof?.baseRewardAmount),
        'وضعیت پرونده': ev.status === 'locked' ? 'بسته شده' : ev.status === 'calibrated' ? 'کالیبره شده' : 'پیش‌نویس/جاری'
      };
    });

    // Sort by unit then supervisor
    exportRows.sort((a, b) => {
      if (a['واحد سازمانی'] < b['واحد سازمانی']) return -1;
      if (a['واحد سازمانی'] > b['واحد سازمانی']) return 1;
      if (a['نام سرپرست/مدیر'] < b['نام سرپرست/مدیر']) return -1;
      if (a['نام سرپرست/مدیر'] > b['نام سرپرست/مدیر']) return 1;
      return 0;
    });

    void downloadWorkbook(`Aggregated_Report_AllPeriods_${Date.now()}.xlsx`, [
      { name: 'گزارش تجمیعی', rows: recordsToRows(exportRows) }
    ]);
  };
  
  const handleExportCSV = () => {
    if (ratedEvals.length === 0) {
      alert('داده‌ای برای خروجی گرفتن موجود نیست.');
      return;
    }

    const headers = ['کارمند', 'کد پرسنلی', 'واحد سازمانی', 'پروفایل شغلی', 'دوره', 'نمره نهایی (۱۰۰)', 'رتبه عملکرد', 'وضعیت سند'];
    const rows = ratedEvals.map(ev => {
      const emp = employees.find(e => e.id === ev.empId);
      const prof = profiles.find(p => p.id === ev.profileId);
      const score = calculateFinalScore(ev, profiles);
      const gr = getGrade(score);
      const grDetails = GRADE_DETAILS[gr];
      
      return [
        emp?.name || 'نامشخص',
        emp?.code || '',
        emp?.unit || '',
        prof?.title || '',
        ev.period,
        score.toString(),
        `${gr} (${grDetails?.label || ''})`,
        ev.status === 'locked' ? 'نهایی' : ev.status === 'calibrated' ? 'کالیبره شده' : 'پیش‌نویس'
      ];
    });

    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `گزارش_ارزیابی_عملکرد_${new Date().toLocaleDateString('fa-IR')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
<div className="app-page space-y-7 text-right" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-end flex-wrap gap-5 border-b border-slate-200/80 pb-5 dark:border-slate-800/80">
        <div className="max-w-2xl">
          <p className="mb-1.5 text-xs font-bold text-teal-700 dark:text-teal-300">بینش و تصمیم‌سازی منابع انسانی</p>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">تحلیل‌ها و گزارشات سازمانی</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-7">
            تجزیه و تحلیل نقاط قوت و ضعف دپارتمان‌ها بر مبنای طبقات شایستگی، مربیگری و موازین مصوب
          </p>
        </div>
        
        <div className="flex w-full items-center gap-2.5 flex-wrap lg:w-auto lg:justify-end">
          <button
            onClick={() => downloadWorkflowCalendarICS(DEFAULT_WORKFLOW_DEADLINES)}
            className="min-h-11 bg-white hover:bg-slate-50 text-slate-700 dark:bg-slate-900/70 dark:hover:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-colors cursor-pointer"
            title="دانلود فایل iCalendar (.ics) جهت افزودن تقویم مهلت‌ها به Google Calendar و Outlook"
          >
            <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>خروجی تقویم مهلت‌ها (.ics)</span>
          </button>

          <button
            onClick={handleExportAggregatedExcel}
            className="min-h-11 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>خروجی اکسل / CSV کامل داده‌ها</span>
          </button>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Department Averages Gauge */}
        <div className="bg-white/80 border border-slate-200 dark:bg-slate-900/70 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">میانگین امتیاز عملکرد به تفکیک دپارتمان</h3>
          </div>

          {unitAverages.length > 0 ? (
            <div className="space-y-4 pt-2">
              {unitAverages.map((item, idx) => {
                const gr = getGrade(item.avg);
                const conf = GRADE_DETAILS[gr];
                return (
                  <div key={idx} className="text-xs">
                    <div className="flex justify-between items-center mb-1.5 text-slate-500 dark:text-slate-400">
                      <span>{item.unit} <span className="text-[10px] text-slate-500">({item.count} ارزیابی)</span></span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{item.avg}٪ (رتبه {gr})</span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 dark:bg-slate-950/60 rounded-full overflow-hidden flex">
                      <div 
                        className={`h-full bg-${conf.color}-500 transition-all duration-500 rounded-full`}
                        style={{ width: `${item.avg}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500 text-xs">
              داده‌ای جهت تحلیل دپارتمان‌ها موجود نیست. ارزیابی‌ها باید ابتدا انجام و امتیازدهی شوند.
            </div>
          )}
        </div>

        {/* Competency Categories Gauge */}
        <div className="bg-white/80 border border-slate-200 dark:bg-slate-900/70 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">میانگین امتیاز به تفکیک ابعاد شایستگی (۱۰۰)</h3>
          </div>

          {categoryAverages.length > 0 ? (
            <div className="space-y-4 pt-2">
              {categoryAverages.map((item, idx) => {
                const score1to5 = (item.avg / 20).toFixed(1);
                return (
                  <div key={idx} className="text-xs">
                    <div className="flex justify-between items-center mb-1.5 text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono ${
                          item.cat === 'K' ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300' :
                          item.cat === 'Q' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' :
                          item.cat === 'B' ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300' :
                          item.cat === 'S' ? 'bg-red-500/10 text-red-700 dark:text-red-300' :
                          'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        }`}>
                          {item.cat}
                        </span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{item.label}</span>
                      </div>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{item.avg}٪ (امتیاز {score1to5} از ۵)</span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 dark:bg-slate-950/60 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-indigo-500 to-teal-400 transition-all duration-500 rounded-full"
                        style={{ width: `${item.avg}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500 text-xs">
              داده‌ای جهت تحلیل ابعاد شایستگی موجود نیست.
            </div>
          )}
        </div>

      </div>

      {/* Radar Chart 5-Dimension Competency Overview Card */}
      <div className="bg-white/80 border border-slate-200 dark:bg-slate-900/70 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm">
        <div className="flex justify-between items-center flex-wrap gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">نمودار عنکبوتی تعادل ۵ گانه شایستگی (D3 Radar)</h3>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">تحلیل شکاف شایستگی میان عملکرد محقق‌شده و تارگت استاندارد تعالی</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600 dark:text-slate-400">فیلتر پرسنل:</span>
            <select
              value={selectedEmpForRadar}
              onChange={(e) => setSelectedEmpForRadar(e.target.value)}
              className="text-xs font-bold bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-700 text-teal-800 dark:text-teal-300 px-3 py-1.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="all">میانگین کل سازمان (اصفهان چالاک)</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name} ({emp.unit})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-around gap-6 pt-2">
          <div className="flex justify-center">
            <RadarChartD3 
              data={getRadarData()}
              width={360}
              height={320}
              theme={theme}
            />
          </div>

          <div className="space-y-3 max-w-md text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-teal-700 dark:text-teal-400 font-bold">
                <div className="w-3 h-3 rounded-full bg-teal-500" />
                <span>عملکرد واقعی ثبت‌شده</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                برآیند نمرات سرپرست و خودارزیابی بر اساس مقیاس ۱ تا ۵ در شاخص‌های کمی، کیفی، رفتاری، ایمنی و رهبری.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-bold">
                <div className="w-3 h-3 rounded-full bg-indigo-500" />
                <span>حد آستانه و استاندارد سازمانی</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                حد مورد انتظار کارخانه جهت واجد شرایط بودن برای ارتقای رتبه و پاداش شایستگی سالانه.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* AI-Powered 9-Box Talent Matrix Strategic Analysis */}
      <NineBoxAIAnalysis
        evaluations={evaluations}
        employees={employees}
        profiles={profiles}
        criteria={criteria}
      />

      {/* Full Detail Results Table */}
      <div className="bg-white/80 border border-slate-200 dark:bg-slate-900/70 dark:border-slate-800 rounded-2xl overflow-hidden p-5 space-y-4 shadow-sm">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">کارنامه جامع ارزیابی و مربیگری سازمان</h3>
          <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">
            {ratedEvals.length} کارنامه ثبت‌شده
          </span>
        </div>

        {/* Bulk Actions Bar for Reports */}
        {selectedReportEvalIds.size > 0 && (
          <div className="bg-teal-50 border border-teal-200 p-3 rounded-2xl flex items-center justify-between animate-in fade-in flex-wrap gap-2 dark:bg-teal-950/40 dark:border-teal-500/30">
            <div className="flex items-center gap-2 text-xs text-teal-800 dark:text-teal-300 font-bold">
              <CheckCircle2 className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>{selectedReportEvalIds.size} کارنامه ارزیابی برای عملیات انتخاب شده است</span>
            </div>
            <div className="flex items-center gap-2">
              {(isAdmin || onDeleteEvaluation) && (
                <button
                  type="button"
                  onClick={() => setIsBulkDeleteModalOpen(true)}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف گروهی ({selectedReportEvalIds.size} مورد)</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedReportEvalIds(new Set())}
                className="min-h-9 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                لغو انتخاب‌ها
              </button>
            </div>
          </div>
        )}

        {ratedEvals.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-700 dark:text-slate-300">
              <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                  {(isAdmin || onDeleteEvaluation) && (
                    <th className="pb-3 text-center w-10">
                      <input
                        type="checkbox"
                        checked={ratedEvals.length > 0 && selectedReportEvalIds.size === ratedEvals.length}
                        onChange={handleToggleSelectAll}
                        className="rounded border-slate-300 bg-white text-teal-600 focus:ring-0 cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-teal-400"
                        title="انتخاب همه کارنامه‌ها"
                      />
                    </th>
                  )}
                  <th className="pb-3 text-right">نام همکار</th>
                  <th className="pb-3 text-right">کد پرسنلی</th>
                  <th className="pb-3 text-right">واحد سازمانی</th>
                  <th className="pb-3 text-right">الگوی شایستگی</th>
                  <th className="pb-3 text-center">دوره زمان</th>
                  <th className="pb-3 text-center">نمره کل</th>
                  <th className="pb-3 text-center">طبقه</th>
                  <th className="pb-3 text-center">وضعیت سند</th>
                  {(isAdmin || onDeleteEvaluation) && (
                    <th className="pb-3 text-center w-20">عملیات</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {ratedEvals.map((ev) => {
                  const emp = employees.find(e => e.id === ev.empId);
                  const prof = profiles.find(p => p.id === ev.profileId);
                  const score = calculateFinalScore(ev, profiles);
                  const gr = getGrade(score);
                  const grConf = GRADE_DETAILS[gr];

                  return (
                    <tr key={ev.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      {(isAdmin || onDeleteEvaluation) && (
                        <td className="py-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedReportEvalIds.has(ev.id)}
                            onChange={(e) => handleToggleSelect(ev.id, e as unknown as React.MouseEvent)}
                            className="rounded border-slate-300 bg-white text-teal-600 focus:ring-0 cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-teal-400"
                          />
                        </td>
                      )}
                      <td className="py-3 font-semibold text-slate-900 dark:text-slate-200">{emp?.name || 'نامشخص'}</td>
                      <td className="py-3 text-slate-600 dark:text-slate-400 font-mono">{emp?.code}</td>
                      <td className="py-3 text-slate-600 dark:text-slate-400">{emp?.unit}</td>
                      <td className="py-3 text-slate-600 dark:text-slate-400">{prof?.title}</td>
                      <td className="py-3 text-center font-mono text-slate-600 dark:text-slate-400">{ev.period}</td>
                      <td className="py-3 text-center font-bold text-slate-900 dark:text-slate-100 text-sm">{score}٪</td>
                      <td className="py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold bg-${grConf.color}-500/10 ${GRADE_PILL_TEXT[grConf.color] || 'text-slate-700 dark:text-slate-300'}`}>
                          {gr} — {grConf.label}
                        </span>
                      </td>
                      <td className="py-3 text-center text-slate-600 dark:text-slate-400">
                        {ev.status === 'locked' ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold"><LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" /> نهایی‌شده</span>
                        ) : ev.status === 'calibrated' ? (
                          <span className="inline-flex items-center gap-1.5 text-indigo-700 dark:text-indigo-400 font-bold"><Scale className="h-3.5 w-3.5" aria-hidden="true" /> کالیبره</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /> پیش‌نویس</span>
                        )}
                      </td>
                      {(isAdmin || onDeleteEvaluation) && (
                        <td className="py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setReportEvalToDelete(ev)}
                            className="min-h-9 min-w-9 p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="حذف این کارنامه ارزیابی"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-500">
            هیچ کارنامه‌ای برای نمایش موجود نیست. ابتدا ارزیابی‌های پرسنل را نمره‌دهی کنید.
          </div>
        )}
      </div>

      {/* Delete Single Evaluation in Reports Modal */}
      {reportEvalToDelete && createPortal(
        <div className="fixed inset-0 bg-slate-950/60 dark:bg-slate-950/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-right animate-in fade-in">
                <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">تایید حذف کارنامه از سامانه</h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">این عملیات بلافاصله انجام شده و غیرقابل بازگشت است</p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800/80 space-y-2 text-xs">
              <div className="flex justify-between text-slate-700 dark:text-slate-300">
                <span>همکار:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {employees.find(e => e.id === reportEvalToDelete.empId)?.name || 'نامشخص'}
                </span>
              </div>
              <div className="flex justify-between text-slate-700 dark:text-slate-300">
                <span>دوره:</span>
                <span className="text-teal-700 dark:text-teal-400 font-mono">{reportEvalToDelete.period}</span>
              </div>
              <div className="flex justify-between text-slate-700 dark:text-slate-300">
                <span>وضعیت پرونده:</span>
                <span className="font-bold">{reportEvalToDelete.status === 'locked' ? 'قفل شده' : 'پیش‌نویس'}</span>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>
                توجه: این کارنامه از بخش ارزیابی‌ها، گزارشات مدیریتی و ماتریس ۹گانه استعداد پاک خواهد شد.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800/80">
              <button
                type="button"
                onClick={() => setReportEvalToDelete(null)}
                className="min-h-10 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 dark:text-slate-300 dark:hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 transition-all cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteEvaluation) {
                    onDeleteEvaluation(reportEvalToDelete.id);
                  }
                  setReportEvalToDelete(null);
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

      {/* Bulk Delete in Reports Modal */}
      {isBulkDeleteModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-950/60 dark:bg-slate-950/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-right animate-in fade-in">
            <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">تایید حذف گروهی کارنامه‌ها</h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">حذف همزمان {selectedReportEvalIds.size} کارنامه انتخاب‌شده</p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800/80 space-y-2 text-xs max-h-48 overflow-y-auto">
              <div className="text-slate-600 dark:text-slate-400 font-medium mb-1">کارنامه‌های انتخاب‌شده:</div>
              {Array.from(selectedReportEvalIds).map(id => {
                const ev = evaluations.find(e => e.id === id);
                const emp = employees.find(e => e.id === ev?.empId);
                const sc = ev ? calculateFinalScore(ev, profiles) : 0;
                return (
                  <div key={id} className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-900 text-slate-800 dark:text-slate-200 text-xs">
                    <span>{emp?.name || 'همکار'} ({ev?.period})</span>
                    <span className="font-mono text-teal-700 dark:text-teal-400 text-[11px]">{sc.toFixed(1)} / ۱۰۰</span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>
                هشدار: با تایید، تمامی پرونده‌های انتخاب‌شده به طور کامل از سامانه حذف خواهند شد.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800/80">
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                className="min-h-10 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 dark:text-slate-300 dark:hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 transition-all cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDelete}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all cursor-pointer shadow-lg shadow-rose-600/20 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تایید و حذف گروهی ({selectedReportEvalIds.size} مورد)</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

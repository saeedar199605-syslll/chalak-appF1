/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Archive,
  RotateCcw,
  Download,
  Trash2,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertTriangle,
  HardDrive,
  Zap,
  Eye,
  FileSpreadsheet,
  FileJson,
  Layers,
  Calendar,
  User,
  Award,
  ChevronLeft,
  X,
  ShieldCheck,
  ArrowUpDown,
  History,
  Info
} from 'lucide-react';
import { Evaluation, Employee, JobProfile, Criterion } from '../types';
import {
  calculateArchiveStats,
  archivePeriod,
  archiveEvaluationById,
  restoreArchivedPeriod,
  restoreArchivedEvaluationById,
  autoArchiveOldCycles,
  exportArchivedEvaluationsToCSV,
  detectPeriodsSummary,
  getAutoArchiveSettings,
  saveAutoArchiveSettings,
  AutoArchiveSettings
} from '../utils/archiveManager';

interface PerformanceArchiveVaultProps {
  activeEvaluations: Evaluation[];
  archivedEvaluations: Evaluation[];
  onSetEvaluations: (evals: Evaluation[]) => void;
  onSetArchivedEvaluations: (archived: Evaluation[]) => void;
  employees: Employee[];
  profiles: JobProfile[];
  criteria: Criterion[];
  currentUser?: Employee | null;
  theme?: 'dark' | 'light';
  onAddLog?: (action: string, details: string, type: 'info' | 'warning' | 'success' | 'danger') => void;
}

export default function PerformanceArchiveVault({
  activeEvaluations,
  archivedEvaluations,
  onSetEvaluations,
  onSetArchivedEvaluations,
  employees,
  profiles,
  criteria,
  currentUser,
  theme = 'dark',
  onAddLog
}: PerformanceArchiveVaultProps) {
  // Search and Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<string>('all');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState<string>('all');
  const [inspectedEvaluation, setInspectedEvaluation] = useState<Evaluation | null>(null);

  // Auto Archive Settings
  const [autoSettings, setAutoSettings] = useState<AutoArchiveSettings>(() => getAutoArchiveSettings());
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Feedback Notification
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
    details?: string;
  } | null>(null);

  // Calculate high-level archive statistics
  const stats = useMemo(() => {
    return calculateArchiveStats(activeEvaluations, archivedEvaluations);
  }, [activeEvaluations, archivedEvaluations]);

  // Distinct active periods for manual archive dropdown
  const activePeriodsSummary = useMemo(() => {
    return detectPeriodsSummary(activeEvaluations);
  }, [activeEvaluations]);

  // List of all units
  const availableUnits = useMemo(() => {
    const set = new Set<string>();
    employees.forEach(e => { if (e.unit) set.add(e.unit); });
    return Array.from(set);
  }, [employees]);

  // List of archived periods
  const archivedPeriodsList = useMemo(() => {
    const set = new Set<string>();
    archivedEvaluations.forEach(e => { if (e.period) set.add(e.period); });
    return Array.from(set);
  }, [archivedEvaluations]);

  // Filtered Archived Records
  const filteredArchivedRecords = useMemo(() => {
    return archivedEvaluations.filter(ev => {
      const emp = employees.find(e => e.id === ev.empId);
      const prof = profiles.find(p => p.id === ev.profileId);

      // Period filter
      if (selectedPeriodFilter !== 'all' && ev.period !== selectedPeriodFilter) {
        return false;
      }

      // Unit filter
      if (selectedUnitFilter !== 'all' && emp?.unit !== selectedUnitFilter) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matchesName = emp?.name?.toLowerCase().includes(term);
        const matchesCode = emp?.code?.toLowerCase().includes(term);
        const matchesTitle = prof?.title?.toLowerCase().includes(term);
        const matchesPeriod = ev.period?.toLowerCase().includes(term);
        const matchesUnit = emp?.unit?.toLowerCase().includes(term);

        if (!matchesName && !matchesCode && !matchesTitle && !matchesPeriod && !matchesUnit) {
          return false;
        }
      }

      return true;
    });
  }, [archivedEvaluations, employees, profiles, selectedPeriodFilter, selectedUnitFilter, searchTerm]);

  // --- ACTIONS ---

  // 1. One-Click Auto Archive Old Cycles
  const handleAutoArchive = () => {
    const result = autoArchiveOldCycles(activeEvaluations, archivedEvaluations, 'نیمه اول ۱۴۰۵');
    
    if (result.movedCount === 0) {
      setFeedback({
        type: 'warning',
        message: 'هیچ دوره قدیمی خاتمه‌یافته‌ای برای آرشیو در دیتابیس فعال یافت نشد.',
        details: 'کلیه پرونده‌های جاری مربوط به دوره فعال فعلی می‌باشند.'
      });
      return;
    }

    onSetEvaluations(result.nextActive);
    onSetArchivedEvaluations(result.nextArchived);

    const msg = `آرشیو خودکار تکمیل شد: تعداد ${result.movedCount} پرونده از دوره‌های (${result.archivedPeriodsList.join('، ')}) به تاریخچه عملکرد انتقال یافتند.`;
    setFeedback({
      type: 'success',
      message: msg,
      details: `حجم دیتابیس فعال سبک شد و سرعت بارگذاری سامانه به میزان چشمگیری بهبود یافت.`
    });

    if (onAddLog) {
      onAddLog('آرشیو خودکار دوره‌های گذشته', msg, 'success');
    }
  };

  // 2. Archive Single Period
  const handleArchiveSpecificPeriod = (periodName: string) => {
    if (!periodName) return;
    if (!window.confirm(`آیا از انتقال کلیه ارزیابی‌های دوره «${periodName}» به بخش تاریخچه عملکرد اطمینان دارید؟`)) {
      return;
    }

    const result = archivePeriod(periodName, activeEvaluations, archivedEvaluations);
    onSetEvaluations(result.nextActive);
    onSetArchivedEvaluations(result.nextArchived);

    const msg = `دوره «${periodName}» با ${result.movedCount} پرونده به تاریخچه عملکرد منتقل گردید.`;
    setFeedback({ type: 'success', message: msg });
    if (onAddLog) onAddLog('انتقال دوره به آرشیو', msg, 'info');
  };

  // 3. Restore Specific Period
  const handleRestoreSpecificPeriod = (periodName: string) => {
    if (!periodName) return;
    if (!window.confirm(`آیا می‌خواهید کلیه ارزیابی‌های دوره «${periodName}» مجدداً به دیتابیس فعال ارزیابی بازگردانده شوند؟`)) {
      return;
    }

    const result = restoreArchivedPeriod(periodName, activeEvaluations, archivedEvaluations);
    onSetEvaluations(result.nextActive);
    onSetArchivedEvaluations(result.nextArchived);

    const msg = `دوره «${periodName}» با ${result.restoredCount} پرونده با موفقیت به دیتابیس فعال بازگردانی شد.`;
    setFeedback({ type: 'success', message: msg });
    if (onAddLog) onAddLog('بازیابی دوره از آرشیو', msg, 'info');
  };

  // 4. Restore Single Evaluation
  const handleRestoreEvaluation = (evalId: string) => {
    const target = archivedEvaluations.find(e => e.id === evalId);
    const emp = employees.find(e => e.id === target?.empId);

    const result = restoreArchivedEvaluationById(evalId, activeEvaluations, archivedEvaluations);
    onSetEvaluations(result.nextActive);
    onSetArchivedEvaluations(result.nextArchived);

    if (inspectedEvaluation?.id === evalId) {
      setInspectedEvaluation(null);
    }

    const msg = `پرونده همکار «${emp?.name || evalId}» در دوره «${target?.period}» به دیتابیس فعال بازگردانده شد.`;
    setFeedback({ type: 'success', message: msg });
    if (onAddLog) onAddLog('بازیابی پرونده از آرشیو', msg, 'info');
  };

  // 5. Export to Excel CSV
  const handleExportCSV = () => {
    exportArchivedEvaluationsToCSV(filteredArchivedRecords, employees, profiles);
    if (onAddLog) {
      onAddLog('صادرات اکسل تاریخچه عملکرد', `دانلود خروجی CSV برای ${filteredArchivedRecords.length} سابقه آرشیو شده`, 'info');
    }
  };

  // 6. Export to JSON
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(archivedEvaluations, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute('href', dataStr);
    dl.setAttribute('download', `پشتیبان_کامل_آرشیو_عملکرد_${new Date().toISOString().slice(0, 10)}.json`);
    dl.click();
    dl.remove();
  };

  return (
    <div className="space-y-6 text-slate-100 text-right" dir="rtl">
      
      {/* 1. TOP HERO & METRICS CARDS */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-indigo-950/40 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-500/10">
              <History className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-100">
                  مرکز تاریخچه عملکرد و بایگانی دوره‌های گذشته (Performance History Vault)
                </h2>
                <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 rounded-full font-mono">
                  Isolated Cold Storage
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                آرشیو خودکار پرونده‌های خاتمه‌یافته جهت کاهش حجم دیتابیس فعال، افزایش سرعت لود صفحات و دسترسی دائمی به سوابق
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAutoArchive}
              className="bg-gradient-to-r from-indigo-500 to-teal-500 hover:from-indigo-400 hover:to-teal-400 text-slate-950 font-black px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 stroke-[2.5]" />
              <span>آرشیو خودکار دوره‌های گذشته</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              disabled={archivedEvaluations.length === 0}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>خروجی اکسل</span>
            </button>

            <button
              type="button"
              onClick={handleExportJSON}
              disabled={archivedEvaluations.length === 0}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer"
            >
              <FileJson className="w-3.5 h-3.5 text-amber-400" />
              <span>بکاپ JSON</span>
            </button>
          </div>
        </div>

        {/* 4 Performance Indicators */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          
          <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-2xl space-y-1">
            <span className="text-[10px] text-slate-400 font-bold block">پرونده‌های فعال سازمان:</span>
            <div className="flex items-baseline justify-between">
              <span className="text-xl font-black text-teal-400 font-mono">
                {stats.activeCount}
              </span>
              <span className="text-[10px] text-slate-500">رکورد در حافظه</span>
            </div>
            <span className="text-[10px] text-slate-400 block truncate">دیتابیس سریع و روان</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-2xl space-y-1">
            <span className="text-[10px] text-slate-400 font-bold block">سوابق بایگانی‌شده در تاریخچه:</span>
            <div className="flex items-baseline justify-between">
              <span className="text-xl font-black text-indigo-400 font-mono">
                {stats.archivedCount}
              </span>
              <span className="text-[10px] text-slate-500">{stats.archivedPeriods.length} دوره</span>
            </div>
            <span className="text-[10px] text-slate-400 block truncate">نگهداری در فضای ایزوله</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-2xl space-y-1">
            <span className="text-[10px] text-slate-400 font-bold block">حجم حافظه آزاد شده:</span>
            <div className="flex items-baseline justify-between">
              <span className="text-xl font-black text-emerald-400 font-mono">
                {stats.estimatedBytesSaved} <span className="text-xs">KB</span>
              </span>
              <span className="text-[10px] text-emerald-500">کاهش بار مرورگر</span>
            </div>
            <span className="text-[10px] text-slate-400 block truncate">بهینه‌سازی فضای ذخیره</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-2xl space-y-1">
            <span className="text-[10px] text-slate-400 font-bold block">بهبود سرعت بارگذاری:</span>
            <div className="flex items-baseline justify-between">
              <span className="text-xl font-black text-amber-400 font-mono">
                {stats.performanceBoostEstimate}
              </span>
              <span className="text-[10px] text-amber-500">افزایش FPS</span>
            </div>
            <span className="text-[10px] text-slate-400 block truncate">پاسخ‌دهی آنی جداول</span>
          </div>

        </div>
      </div>

      {/* FEEDBACK TOAST */}
      {feedback && (
        <div className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-1 animate-in fade-in flex items-center justify-between ${
          feedback.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
          feedback.type === 'warning' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' :
          'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 font-bold text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{feedback.message}</span>
            </div>
            {feedback.details && (
              <p className="text-[11px] text-slate-300 pr-6">{feedback.details}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. PERIOD-LEVEL ARCHIVE & RESTORE CONTROL BAR */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-400" />
            مدیریت دوره‌ای آرشیو و بازیابی دسته‌ای
          </span>
          <span className="text-[10px] text-slate-400">انتقال سریع یک دوره کامل بدون حذف اطلاعات</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Box A: Move active period to archive */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300">انتقال دوره‌های فعال به آرشیو:</span>
              <span className="text-[10px] text-teal-400 font-mono">{activePeriodsSummary.length} دوره در سیستم</span>
            </div>

            <div className="space-y-2">
              {activePeriodsSummary.map(item => (
                <div key={item.period} className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-xs">
                  <div>
                    <span className="font-bold text-slate-200">{item.period}</span>
                    <span className="text-[10px] text-slate-400 mr-2 font-mono">
                      ({item.count} پرونده {item.isCurrent ? '- دوره جاری' : ''})
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleArchiveSpecificPeriod(item.period)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>انتقال به آرشیو</span>
                  </button>
                </div>
              ))}
              {activePeriodsSummary.length === 0 && (
                <div className="text-center py-3 text-xs text-slate-500">هیچ پرونده فعالی در دیتابیس موجود نیست.</div>
              )}
            </div>
          </div>

          {/* Box B: Restore archived period to active */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300">دوره‌های موجود در بایگانی تاریخچه:</span>
              <span className="text-[10px] text-indigo-400 font-mono">{archivedPeriodsList.length} دوره آرشیو شده</span>
            </div>

            <div className="space-y-2">
              {archivedPeriodsList.map(periodName => {
                const countInPeriod = archivedEvaluations.filter(e => e.period === periodName).length;
                return (
                  <div key={periodName} className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-xs">
                    <div>
                      <span className="font-bold text-slate-200">{periodName}</span>
                      <span className="text-[10px] text-slate-400 mr-2 font-mono">({countInPeriod} سابقه)</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRestoreSpecificPeriod(periodName)}
                      className="bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>بازیابی به فعال</span>
                    </button>
                  </div>
                );
              })}
              {archivedPeriodsList.length === 0 && (
                <div className="text-center py-6 text-xs text-slate-500">
                  هنوز هیچ دوره‌ای آرشیو نشده است. برای افزایش سرعت سیستم می‌توانید دوره‌های قدیمی را با کلیک روی دکمه «آرشیو خودکار» انتقال دهید.
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* 3. ARCHIVED RECORDS BROWSER & SEARCH FILTER */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
        
        {/* Filters Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-500 absolute right-3 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="جستجو در آرشیو بر اساس نام، کد پرسنلی، واحد یا عنوان شغل..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-4 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Period Filter */}
            <select
              value={selectedPeriodFilter}
              onChange={(e) => setSelectedPeriodFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">همه دوره‌های آرشیو شده ({archivedEvaluations.length})</option>
              {archivedPeriodsList.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            {/* Unit Filter */}
            <select
              value={selectedUnitFilter}
              onChange={(e) => setSelectedUnitFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">همه واحدها</option>
              {availableUnits.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table of Archived Evaluations */}
        <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/60">
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-800 sticky top-0 z-10">
                <tr>
                  <th className="p-3">پرسنل</th>
                  <th className="p-3">واحد سازمانی</th>
                  <th className="p-3">دوره آرشیو</th>
                  <th className="p-3">امتیاز نهایی</th>
                  <th className="p-3">سطح شایستگی</th>
                  <th className="p-3">وضعیت</th>
                  <th className="p-3 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredArchivedRecords.map(ev => {
                  const emp = employees.find(e => e.id === ev.empId);
                  const prof = profiles.find(p => p.id === ev.profileId);
                  
                  // Calculate weighted score
                  const totalWeight = ev.scores.reduce((s, item) => s + item.weight, 0);
                  const weightedSum = ev.scores.reduce((s, item) => s + ((item.value || 0) * item.weight), 0);
                  const scoreVal = totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(2)) : 0;

                  return (
                    <tr key={ev.id} className="hover:bg-slate-900/50 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-slate-100">{emp?.name || 'پرسنل تعریف‌نشده'}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{emp?.code || ev.empId} | {prof?.title || '-'}</div>
                      </td>
                      <td className="p-3 text-slate-300">{emp?.unit || '-'}</td>
                      <td className="p-3 font-mono font-bold text-indigo-300">{ev.period}</td>
                      <td className="p-3">
                        <span className="font-mono font-black text-sm text-teal-400">{scoreVal}</span>
                        <span className="text-[10px] text-slate-500"> / ۵</span>
                      </td>
                      <td className="p-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          scoreVal >= 4.5 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          scoreVal >= 3.75 ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' :
                          scoreVal >= 2.75 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {scoreVal >= 4.5 ? 'عالی' : scoreVal >= 3.75 ? 'خوب' : scoreVal >= 2.75 ? 'متوسط' : 'نیازمند رشد'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                          {ev.status === 'locked' ? 'قفل نهایی' : ev.status === 'calibrated' ? 'کالیبره' : 'پیش‌نویس'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setInspectedEvaluation(ev)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-all cursor-pointer"
                            title="مشاهده جزئیات کارنامه آرشیو شده"
                          >
                            <Eye className="w-3.5 h-3.5 text-indigo-400" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRestoreEvaluation(ev.id)}
                            className="px-2.5 py-1 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/30 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
                            title="بازگردانی به دیتابیس فعال"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>بازیابی</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredArchivedRecords.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 text-xs">
                      {archivedEvaluations.length === 0
                        ? 'هنوز هیچ رکوردی در تاریخچه عملکرد آرشیو نشده است.'
                        : 'هیچ رکوردی منطبق بر فیلتر یا عبارت جستجوی وارد شده یافت نشد.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Summary */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
          <span>نمایش {filteredArchivedRecords.length} از مجموع {archivedEvaluations.length} پرونده تاریخچه</span>
          <span className="font-mono text-[11px] text-indigo-400">آرشیو ایزوله امنیتی - استاندارد عدم تحریف سوابق پرسنلی</span>
        </div>

      </div>

      {/* 4. MODAL: DETAILED ARCHIVED EVALUATION INSPECTOR */}
      {inspectedEvaluation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Archive className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-100">
                      کارنامه عملکرد آرشیو شده (دوره {inspectedEvaluation.period})
                    </h3>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded-full">
                      بایگانی تاریخی
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {employees.find(e => e.id === inspectedEvaluation.empId)?.name} ({employees.find(e => e.id === inspectedEvaluation.empId)?.code})
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectedEvaluation(null)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              
              {/* Profile & Employee Info */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block">عنوان شغلی:</span>
                  <span className="font-bold text-slate-200">{profiles.find(p => p.id === inspectedEvaluation.profileId)?.title || '-'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">واحد سازمانی:</span>
                  <span className="font-bold text-slate-200">{employees.find(e => e.id === inspectedEvaluation.empId)?.unit || '-'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">وضعیت در زمان آرشیو:</span>
                  <span className="font-bold text-indigo-400">{inspectedEvaluation.status}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">تعداد شاخص‌ها:</span>
                  <span className="font-bold text-slate-200 font-mono">{inspectedEvaluation.scores.length}</span>
                </div>
              </div>

              {/* Scores List */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-300 block">نمرات تفکیکی شاخص‌های ارزیابی:</span>
                <div className="space-y-1.5 max-h-52 overflow-y-auto border border-slate-800 rounded-xl p-2 bg-slate-950/50">
                  {inspectedEvaluation.scores.map(s => {
                    const crit = criteria.find(c => c.id === s.cid);
                    return (
                      <div key={s.cid} className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800/80 text-xs">
                        <div>
                          <span className="font-bold text-slate-200">{crit?.name || s.cid}</span>
                          <span className="text-[10px] text-slate-400 mr-2 font-mono">(وزن: {s.weight}٪)</span>
                          {s.doc && <div className="text-[10px] text-slate-400 mt-0.5">{s.doc}</div>}
                        </div>
                        <div className="text-left font-mono">
                          <span className="text-sm font-black text-teal-400">{s.value || 0}</span>
                          <span className="text-[10px] text-slate-500"> / ۵</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Note / Feedback */}
              {inspectedEvaluation.note && (
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-1">
                  <span className="text-[11px] font-bold text-slate-300">یادداشت ارزیاب و مستندات تولید:</span>
                  <p className="text-xs text-slate-400 leading-relaxed font-mono whitespace-pre-line">
                    {inspectedEvaluation.note}
                  </p>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-800 bg-slate-900 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => handleRestoreEvaluation(inspectedEvaluation.id)}
                className="bg-teal-600 hover:bg-teal-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>بازیابی این پرونده به دیتابیس فعال</span>
              </button>

              <button
                type="button"
                onClick={() => setInspectedEvaluation(null)}
                className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 cursor-pointer"
              >
                بستن
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

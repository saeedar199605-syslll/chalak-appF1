/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { calculateFinalScore } from '../utils/formulaEngine';
import { 
  Scale, 
  Users, 
  Award, 
  TrendingUp, 
  ShieldAlert, 
  CheckCircle2, 
  SlidersHorizontal,
  FileCheck2
} from 'lucide-react';
import { Evaluation, Employee, JobProfile, getGrade, GRADE_DETAILS } from '../types';

interface CalibrationProps {
  evaluations: Evaluation[];
  employees: Employee[];
  profiles: JobProfile[];
  onUpdateEvaluation: (id: string, ev: Evaluation) => void;
  onSelectEvaluation: (id: string) => void;
}

export default function Calibration({
  evaluations,
  employees,
  profiles,
  onUpdateEvaluation,
  onSelectEvaluation
}: CalibrationProps) {
  // We calibrate active evaluations that have some scores but are not finalized/locked yet
  const scoredEvals = evaluations.filter(ev => {
    const hasScores = ev.scores.some(s => s.value > 0);
    return hasScores;
  });

  const readyForCalibration = evaluations.filter(ev => {
    return ev.status === 'draft' && ev.scores.every(s => s.value > 0);
  });

  const calibratedCount = evaluations.filter(ev => ev.status === 'calibrated').length;
  const lockedCount = evaluations.filter(ev => ev.status === 'locked').length;

  
  // Grade Distribution
  const dist = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  scoredEvals.forEach(ev => {
    const score = calculateFinalScore(ev, profiles);
    dist[getGrade(score)]++;
  });

  const totalScored = scoredEvals.length || 1;
  const aPercentage = Math.round((dist.A / totalScored) * 100);

  // Guidelines recommendation: A should be around 10-15%, B around 20-30%, C around 40-50%...
  const isInflated = aPercentage > 25;

  const handleApproveCalibration = (ev: Evaluation) => {
    onUpdateEvaluation(ev.id, { ...ev, status: 'calibrated' });
  };

  return (
<div className="app-page space-y-7 text-right" dir="rtl">
      {/* Header */}
      <div className="border-b border-slate-200/80 pb-5 dark:border-slate-800/80">
        <p className="mb-1.5 text-xs font-bold text-teal-700 dark:text-teal-300">یکپارچگی و کنترل کیفیت نمرات</p>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">پنل کالیبراسیون سازمانی</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-7">
          هم‌راستاسازی معیارها و توزیع عادلانه نمرات بین واحدهای مختلف جهت تضمین کیفیت کارنامه نهایی
        </p>
      </div>

      {/* Top statistics indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center shrink-0">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400">آماده کالیبراسیون کمیته</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">{readyForCalibration.length} مورد</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400">کالیبره‌شده (تایید اولیه)</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">{calibratedCount} مورد</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center shrink-0">
            <FileCheck2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400">ابلاغ نهایی و آرشیو قفل‌شده</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">{lockedCount} مورد</p>
          </div>
        </div>
      </div>

      {/* Visual Alignment Graph */}
      <div className="bg-white/80 border border-slate-200 dark:bg-slate-900/70 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">مقایسه توزیع سازمان با هدف‌گذاری استانداردهای ارزیابی</h3>
          {isInflated ? (
                  <span className="bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20 text-[10px] px-2.5 py-1 rounded font-bold flex items-center gap-1.5 shrink-0">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>هشدار: بروز پدیده «تورم نمره» (سهم رتبه A بیش از ۲۵٪ است)</span>
            </span>
          ) : (
            <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[10px] px-2.5 py-1 rounded font-bold flex items-center gap-1.5 shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>توزیع نمرات و پراکندگی طبقات بهینه و عادلانه است</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {(Object.keys(dist) as Array<keyof typeof dist>).map((grade) => {
            const count = dist[grade];
            const pct = Math.round((count / totalScored) * 100);
            const conf = GRADE_DETAILS[grade];

            // Standard recommendations for a healthy bell curve in production/HR:
            // A: 10%, B: 25%, C: 50%, D: 10%, E: 5%
            const target = grade === 'A' ? 15 : grade === 'B' ? 25 : grade === 'C' ? 45 : grade === 'D' ? 10 : 5;

            return (
              <div key={grade} className="bg-slate-50 border border-slate-200 dark:bg-slate-950/30 dark:border-slate-800/80 p-4 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <span className={`w-7 h-7 rounded-lg font-bold text-slate-900 bg-${conf.color}-400 flex items-center justify-center text-xs`}>
                    {grade}
                  </span>
                  <span className="text-slate-600 dark:text-slate-400 text-[11px]">{conf.label.split(' ')[0]}</span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-600 dark:text-slate-400">سهم فعلی:</span>
                    <span className="text-slate-900 dark:text-slate-200 font-bold">{pct}٪</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full bg-${conf.color}-500/80`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[9px] text-slate-500 text-left" dir="ltr">
                    Target: ~{target}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Table calibration pending */}
      <div className="bg-white/80 border border-slate-200 dark:bg-slate-900/70 dark:border-slate-800 rounded-2xl overflow-hidden p-5 space-y-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">ارزیابی‌های نیازمند هم‌ترازسازی و تایید کالیبراسیون</h3>

        {readyForCalibration.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-700 dark:text-slate-300">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold dark:border-slate-800">
                  <th className="pb-3 text-right">پرسنل</th>
                  <th className="pb-3 text-right">واحد</th>
                  <th className="pb-3 text-right">پروفایل و شایستگی</th>
                  <th className="pb-3 text-center">نمره اولیه</th>
                  <th className="pb-3 text-center">رتبه موقت</th>
                  <th className="pb-3 text-left">عملیات کالیبراسیون</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {readyForCalibration.map((ev) => {
                  const emp = employees.find(e => e.id === ev.empId);
                  const prof = profiles.find(p => p.id === ev.profileId);
                  const score = calculateFinalScore(ev, profiles);
                  const gr = getGrade(score);
                  const grConf = GRADE_DETAILS[gr];

                  return (
                    <tr key={ev.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 font-semibold text-slate-900 dark:text-slate-200">{emp?.name || 'نامشخص'}</td>
                      <td className="py-3 text-slate-600 dark:text-slate-400">{emp?.unit || 'نامشخص'}</td>
                      <td className="py-3 text-slate-600 dark:text-slate-400">{prof?.title || 'نامشخص'}</td>
                      <td className="py-3 text-center font-bold text-slate-900 dark:text-slate-200">{score}٪</td>
                      <td className="py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold bg-${grConf.color}-500/10 text-${grConf.color}-300`}>
                          {gr} — {grConf.label}
                        </span>
                      </td>
                      <td className="py-3 text-left">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => onSelectEvaluation(ev.id)}
                            className="min-h-9 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-700"
                          >
                            بررسی و تغییر نمرات
                          </button>
                          
                          <button
                            onClick={() => handleApproveCalibration(ev)}
                            className="min-h-9 px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-[10px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Scale className="w-3 h-3" />
                            <span>تأیید کالیبراسیون</span>
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
          <div className="py-12 text-center text-slate-500">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="font-bold">هیچ ارزیابی منتظر کالیبراسیونی وجود ندارد.</p>
            <p className="text-[11px] mt-1">تمام پرونده‌های دارای نمره در گام جاری تایید شده یا هنوز کامل امتیازدهی نشده‌اند.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Sparkles, 
  Users, 
  TrendingUp, 
  ShieldAlert, 
  Award, 
  Lightbulb, 
  RefreshCw, 
  CheckCircle2, 
  ChevronRight,
  Target,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  AlertTriangle,
  UserCheck
} from 'lucide-react';
import { Evaluation, Employee, JobProfile, Criterion, getGrade } from '../types';

interface NineBoxAIAnalysisProps {
  evaluations: Evaluation[];
  employees: Employee[];
  profiles: JobProfile[];
  criteria: Criterion[];
}

export interface NineBoxResult {
  executiveSummary: string;
  talentHealthScore: number;
  boxRecommendations: {
    boxId: string;
    boxTitle: string;
    headcount: number;
    strategicGuidance: string;
    individualCoachingTips: string[];
    recommendedActions: string[];
  }[];
  successionAndRetention: string[];
  riskInterventions: string[];
  isFallback?: boolean;
}

export const NineBoxAIAnalysis: React.FC<NineBoxAIAnalysisProps> = ({
  evaluations,
  employees,
  profiles,
  criteria
}) => {
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<NineBoxResult | null>(null);
  const [activeBoxTab, setActiveBoxTab] = useState<string>('star');

  // Compute 9-Box mapping for employees
  const ratedEvals = evaluations.filter(e => e.scores.some(s => s.value > 0));

  // Box definitions
  const BOX_CONFIGS = [
    // Row 1: High Potential
    { 
      id: 'enigma', 
      row: 0, 
      col: 0, 
      title: 'معما / پتانسیل کشف‌نشده', 
      subtitle: 'Enigma / High Potential', 
      perfLabel: 'پایین (< ۶۵٪)', 
      potLabel: 'بالا (≥ ۸۲٪)', 
      color: 'amber', 
      bg: 'bg-amber-950/20 border-amber-500/40 hover:border-amber-400',
      badgeBg: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
      strategy: 'عارضه‌یابی و بررسی انطباق شغل و شاغل، رفع موانع عملکردی، مربیگری فشرده ۳ ماهه'
    },
    { 
      id: 'high_potential', 
      row: 0, 
      col: 1, 
      title: 'ستاره در حال رشد', 
      subtitle: 'Growth Star', 
      perfLabel: 'متوسط (۶۵-۸۲٪)', 
      potLabel: 'بالا (≥ ۸۲٪)', 
      color: 'teal', 
      bg: 'bg-teal-950/20 border-teal-500/40 hover:border-teal-400',
      badgeBg: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
      strategy: 'آموزش مهارت‌های رهبری، سپردن پروژه‌های چالشی‌تر، آماده‌سازی برای تصدی نقش‌های مدیریتی'
    },
    { 
      id: 'star', 
      row: 0, 
      col: 2, 
      title: 'ستارگان برتر سازمان', 
      subtitle: 'Super Star', 
      perfLabel: 'عالی (≥ ۸۳٪)', 
      potLabel: 'بالا (≥ ۸۲٪)', 
      color: 'emerald', 
      bg: 'bg-emerald-950/30 border-emerald-500/50 hover:border-emerald-400',
      badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      strategy: 'جانشین‌پروری برای پست‌های کلیدی، پاداش عملکردی ویژه، حفظ انگیزه و جلوگیری از خروج نخبگان'
    },
    
    // Row 2: Medium Potential
    { 
      id: 'dilemma', 
      row: 1, 
      col: 0, 
      title: 'نیروی پرریسک / مشروط', 
      subtitle: 'Dilemma / Inconsistent', 
      perfLabel: 'پایین (< ۶۵٪)', 
      potLabel: 'متوسط (۶۵-۸۱٪)', 
      color: 'rose', 
      bg: 'bg-rose-950/20 border-rose-500/40 hover:border-rose-400',
      badgeBg: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
      strategy: 'تنظیم برنامه بهبود عملکرد (PIP) با مهلت معین، بررسی مسائل انگیزشی یا مهارتی'
    },
    { 
      id: 'core', 
      row: 1, 
      col: 1, 
      title: 'ستون‌های اصلی سازمان', 
      subtitle: 'Core Player', 
      perfLabel: 'متوسط (۶۵-۸۲٪)', 
      potLabel: 'متوسط (۶۵-۸۱٪)', 
      color: 'blue', 
      bg: 'bg-blue-950/20 border-blue-500/40 hover:border-blue-400',
      badgeBg: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
      strategy: 'توسعه مهارت‌های مستمر، ایجاد انگیزه‌های پایدار، حفظ ثبات در فرآیندهای حیاتی کارخانه'
    },
    { 
      id: 'high_performer', 
      row: 1, 
      col: 2, 
      title: 'متخصصین با عملکرد عالی', 
      subtitle: 'High Performer', 
      perfLabel: 'عالی (≥ ۸۳٪)', 
      potLabel: 'متوسط (۶۵-۸۱٪)', 
      color: 'cyan', 
      bg: 'bg-cyan-950/20 border-cyan-500/40 hover:border-cyan-400',
      badgeBg: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
      strategy: 'تشویق و پاداش مادی، ارتقای افقی و فنی، توانمندسازی برای انتقال دانش به دیگران'
    },
    
    // Row 3: Low Potential
    { 
      id: 'underperformer', 
      row: 2, 
      col: 0, 
      title: 'نیازمند بهبود فوری / خطر', 
      subtitle: 'Underperformer / Risk', 
      perfLabel: 'پایین (< ۶۵٪)', 
      potLabel: 'پایین (< ۶۵٪)', 
      color: 'red', 
      bg: 'bg-red-950/30 border-red-500/50 hover:border-red-400',
      badgeBg: 'bg-red-500/20 text-red-300 border-red-500/40',
      strategy: 'اخطار کتبی، برنامه مداخله فوری ۶۰ روزه، ارزیابی مجدد و تصمیم‌گیری در صورت عدم تغییر'
    },
    { 
      id: 'effective_worker', 
      row: 2, 
      col: 1, 
      title: 'مجری باثبات / وظیفه‌شناس', 
      subtitle: 'Effective Worker', 
      perfLabel: 'متوسط (۶۵-۸۲٪)', 
      potLabel: 'پایین (< ۶۵٪)', 
      color: 'slate', 
      bg: 'bg-slate-900 border-slate-700/60 hover:border-slate-500',
      badgeBg: 'bg-slate-800 text-slate-300 border-slate-700',
      strategy: 'حفظ در جایگاه فعلی، آموزش‌های ضمن خدمت متناسب، بهبود بهره‌وری روزمره'
    },
    { 
      id: 'trusted_expert', 
      row: 2, 
      col: 2, 
      title: 'استادکار / کارشناس خبره', 
      subtitle: 'Trusted Master', 
      perfLabel: 'عالی (≥ ۸۳٪)', 
      potLabel: 'پایین (< ۶۵٪)', 
      color: 'indigo', 
      bg: 'bg-indigo-950/20 border-indigo-500/40 hover:border-indigo-400',
      badgeBg: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
      strategy: 'مستندسازی تجارب و دانش ضمنی، استفاده به عنوان مربی کارگاهی، قدردانی از سوابق فنی'
    },
  ];

  // Map each employee to a box
  const getEmployeeBoxData = () => {
    const boxMap: Record<string, { emp: Employee; eval: Evaluation; score: number; potentialScore: number; jobTitle: string }[]> = {};
    BOX_CONFIGS.forEach(b => {
      boxMap[b.id] = [];
    });

    ratedEvals.forEach(ev => {
      const emp = employees.find(e => e.id === ev.empId);
      if (!emp) return;
      const prof = profiles.find(p => p.id === emp.profileId);

      // Calculate performance score (0 - 100)
      const validScores = ev.scores.filter(s => s.value > 0);
      const avgScore = validScores.length > 0
        ? (validScores.reduce((sum, s) => sum + s.value, 0) / validScores.length) * 20
        : 60;

      // Calculate potential score based on behavioral (B) and leadership/team (L)
      const potentialScores = ev.scores.filter(s => {
        const c = criteria.find(cr => cr.id === s.cid);
        return c && (c.cat === 'B' || c.cat === 'L' || (c.code || '').startsWith('B') || (c.code || '').startsWith('L'));
      });
      const potentialAvg = potentialScores.length > 0
        ? (potentialScores.reduce((sum, s) => sum + s.value, 0) / potentialScores.length) * 20
        : (avgScore * 0.95);

      // Determine Performance Bucket (Low < 65, Medium 65-82, High >= 83)
      let perfBucket: 'low' | 'med' | 'high' = 'med';
      if (avgScore >= 83) perfBucket = 'high';
      else if (avgScore < 65) perfBucket = 'low';

      // Determine Potential Bucket (Low < 65, Medium 65-82, High >= 83)
      let potBucket: 'low' | 'med' | 'high' = 'med';
      if (potentialAvg >= 82) potBucket = 'high';
      else if (potentialAvg < 65) potBucket = 'low';

      // Map to box ID
      let assignedBox = 'core';
      if (potBucket === 'high' && perfBucket === 'high') assignedBox = 'star';
      else if (potBucket === 'high' && perfBucket === 'med') assignedBox = 'high_potential';
      else if (potBucket === 'high' && perfBucket === 'low') assignedBox = 'enigma';
      else if (potBucket === 'med' && perfBucket === 'high') assignedBox = 'high_performer';
      else if (potBucket === 'med' && perfBucket === 'med') assignedBox = 'core';
      else if (potBucket === 'med' && perfBucket === 'low') assignedBox = 'dilemma';
      else if (potBucket === 'low' && perfBucket === 'high') assignedBox = 'trusted_expert';
      else if (potBucket === 'low' && perfBucket === 'med') assignedBox = 'effective_worker';
      else if (potBucket === 'low' && perfBucket === 'low') assignedBox = 'underperformer';

      boxMap[assignedBox].push({
        emp,
        eval: ev,
        score: Math.round(avgScore),
        potentialScore: Math.round(potentialAvg),
        jobTitle: prof?.title || 'عنوان شغلی'
      });
    });

    return boxMap;
  };

  const boxMapping = getEmployeeBoxData();

  const handleRunAIAnalysis = async () => {
    setLoading(true);
    try {
      const summaryPayload = BOX_CONFIGS.map(b => ({
        boxId: b.id,
        boxTitle: b.title,
        performanceLevel: b.perfLabel,
        potentialLevel: b.potLabel,
        headcount: boxMapping[b.id].length,
        employees: boxMapping[b.id].map(item => ({
          name: item.emp.name,
          unit: item.emp.unit,
          jobTitle: item.jobTitle,
          performanceScore: item.score,
          potentialScore: item.potentialScore
        }))
      }));

      const res = await fetch('/api/gemini/nine-box-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boxesSummary: summaryPayload,
          totalHeadcount: ratedEvals.length,
          period: 'سال ۱۴۰۵'
        })
      });

      if (!res.ok) throw new Error('API request failed');
      const data = await res.json();
      setAnalysisResult(data);
    } catch (err) {
      console.error('9-Box AI analysis error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner and AI Action */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-100">ماتریس ۹ خانه‌ای استعداد و تحلیل هوشمند (9-Box Grid)</h2>
              <p className="text-xs text-indigo-300 mt-0.5">ترسیم همزمان عملکرد فعلی در برابر پتانسیل رشد سازمانی همراه با مربیگری Gemini AI</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            این ماتریس استاندارد بین‌المللی، پرسنل را در ۹ بخش استراتژیک موقعیت‌یابی کرده و با اتکا به مدل زبانی، برنامه‌های ارتقا، مربیگری و جانشین‌پروری تفکیکی ارائه می‌دهد.
          </p>
        </div>

        <button
          onClick={handleRunAIAnalysis}
          disabled={loading}
          className="bg-gradient-to-r from-indigo-500 to-teal-500 hover:from-indigo-600 hover:to-teal-600 text-slate-100 font-black py-3 px-5 rounded-2xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-indigo-500/20 shrink-0 disabled:opacity-50"
        >
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-teal-200" />
              <span>در حال پردازش هوشمند ماتریس با هوش مصنوعی...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>تحلیل ماتریس ۹ خانه با Gemini AI</span>
            </>
          )}
        </button>
      </div>

      {/* 9-BOX VISUAL GRID */}
      <div className="bg-slate-800/30 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xl">
        <div className="flex justify-between items-center flex-wrap gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
            <Target className="w-4 h-4 text-teal-400" />
            <span>جانمایی زنده پرسنل در ماتریس ۹ تایی کارخانه ({ratedEvals.length} پرونده ارزیابی فعال)</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> ستاره‌ها و رشد</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> ستون‌های باثبات</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> نیازمند مربیگری و PIP</span>
          </div>
        </div>

        {/* Mobile Swipe Hint */}
        <div className="md:hidden flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1.5"><Lightbulb aria-hidden="true" className="h-4 w-4 shrink-0" /> جدول تعاملی ماتریس: جهت دیدن تمام ستون‌ها به طرفین اسکرول کنید</span>
        </div>

        {/* The 3x3 Grid with Dedicated Structured Axes Rails (Zero Overlap) */}
        <div className="overflow-x-auto pb-3 pt-1">
          <div className="min-w-[720px] space-y-2 select-none">

            {/* Column Headers (X-Axis: Performance Levels from Right to Left) */}
            <div className="flex items-center gap-3 pr-14 pl-1">
              <div className="flex-1 py-1.5 px-3 rounded-xl bg-rose-950/20 border border-rose-500/20 text-center">
                <span className="text-[11px] font-bold text-rose-300">عملکرد پایین (کمتر از ۶۵٪)</span>
                <span className="block text-[9px] text-slate-400">نیازمند مداخله و اصلاح</span>
              </div>
              <div className="flex-1 py-1.5 px-3 rounded-xl bg-blue-950/20 border border-blue-500/20 text-center">
                <span className="text-[11px] font-bold text-blue-300">عملکرد متوسط (۶۵٪ تا ۸۲٪)</span>
                <span className="block text-[9px] text-slate-400">ستون‌های مستمر اجرایی</span>
              </div>
              <div className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-center">
                <span className="text-[11px] font-bold text-emerald-300">عملکرد عالی (۸۳٪ به بالا)</span>
                <span className="block text-[9px] text-slate-400">فراتر از اهداف و شاخص‌ها</span>
              </div>
            </div>

            {/* Main Area: Y-Axis Rail + 3x3 Grid */}
            <div className="flex items-stretch gap-3">
              
              {/* Dedicated Y-Axis Rail (Right side in RTL) */}
              <div className="w-11 shrink-0 flex flex-col justify-between py-2 px-1 rounded-2xl bg-slate-900/70 border border-slate-800/80 text-center text-indigo-400">
                <div className="flex flex-col items-center gap-1">
                  <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-black leading-tight [writing-mode:vertical-rl] rotate-180 text-indigo-300">
                    پتانسیل بالا
                  </span>
                </div>
                
                <div className="py-2 border-y border-slate-800/60 flex items-center justify-center">
                  <span className="text-[10px] font-bold leading-tight [writing-mode:vertical-rl] rotate-180 text-slate-400">
                    پتانسیل متوسط
                  </span>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-black leading-tight [writing-mode:vertical-rl] rotate-180 text-slate-500">
                    پتانسیل پایین
                  </span>
                  <ArrowDown aria-hidden="true" className="h-3.5 w-3.5 text-slate-500" />
                </div>
              </div>

              {/* 3x3 Grid Box Containers */}
              <div className="grid grid-cols-3 gap-3 flex-1">
                {BOX_CONFIGS.map(box => {
                  const empsInBox = boxMapping[box.id] || [];
                  const isSelected = activeBoxTab === box.id;

                  return (
                    <div
                      key={box.id}
                      onClick={() => setActiveBoxTab(box.id)}
                      className={`min-h-[160px] p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        box.bg
                      } ${isSelected ? 'ring-2 ring-teal-400 shadow-xl scale-[1.01]' : 'hover:border-slate-600'}`}
                    >
                      <div className="flex justify-between items-start gap-1">
                        <div>
                          <h4 className="text-xs font-bold text-slate-100">{box.title}</h4>
                          <span className="text-[9px] font-mono text-slate-400 block">{box.subtitle}</span>
                          <p className="text-[10px] text-slate-400 mt-1">
                            کارایی: <span className="font-semibold text-slate-200">{box.perfLabel}</span> • پتانسیل: <span className="font-semibold text-slate-200">{box.potLabel}</span>
                          </p>
                        </div>
                        <span className={`text-[11px] font-mono font-black px-2 py-0.5 rounded-lg border shrink-0 ${box.badgeBg}`}>
                          {empsInBox.length} نفر
                        </span>
                      </div>

                      {/* Employees inside this Box */}
                      <div className="mt-3 space-y-1.5 max-h-[100px] overflow-y-auto pr-1">
                        {empsInBox.length > 0 ? (
                          empsInBox.slice(0, 3).map((item, i) => (
                            <div
                              key={i}
                              className="px-2.5 py-1 bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-lg text-[11px] text-slate-200 flex items-center justify-between gap-1.5"
                              title={`${item.emp.name} (${item.jobTitle} - ${item.emp.unit}) | عملکرد: ${item.score}٪`}
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                                <span className="font-medium truncate">{item.emp.name}</span>
                              </div>
                              <span className="font-mono text-[10px] text-teal-300 font-bold shrink-0">{item.score}٪</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-[11px] text-slate-500 italic py-3 text-center">
                            موردی ثبت نشده
                          </div>
                        )}
                        {empsInBox.length > 3 && (
                          <div className="text-[10px] font-bold text-teal-400 text-center pt-0.5">
                            + {empsInBox.length - 3} نفر دیگر (کلیک جهت مشاهده)
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

            {/* Bottom X-Axis Footer Label */}
            <div className="flex items-center justify-center gap-2 pt-2 text-xs font-bold text-teal-400 pr-14">
              <ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>افزایش کارایی و تحقق اهداف عملکردی شغلی (از راست به چپ: پایین به عالی)</span>
            </div>

          </div>
        </div>

        {/* Selected Box Interactive Detail Card */}
        {(() => {
          const selectedBox = BOX_CONFIGS.find(b => b.id === activeBoxTab) || BOX_CONFIGS[0];
          const selectedEmps = boxMapping[selectedBox.id] || [];

          return (
            <div className="mt-4 p-4 md:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4 animate-fade-in">
              <div className="flex justify-between items-start flex-wrap gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full bg-${selectedBox.color}-400`} />
                  <div>
                    <h4 className="text-xs md:text-sm font-black text-slate-100 flex items-center gap-2">
                      <span>خانه منتخب: {selectedBox.title}</span>
                      <span className="text-[10px] font-mono text-slate-400 font-normal">({selectedBox.subtitle})</span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      سطح عملکرد: {selectedBox.perfLabel} • سطح پتانسیل: {selectedBox.potLabel}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold font-mono px-3 py-1 rounded-xl border ${selectedBox.badgeBg}`}>
                    تعداد: {selectedEmps.length} نفر
                  </span>
                </div>
              </div>

              {/* Strategy & Action Guidance */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 space-y-1">
                <span className="font-bold text-teal-400">راهبرد توسعه و مربیگری این دسته:</span>
                <p className="text-[11px] text-slate-300 leading-relaxed">{selectedBox.strategy}</p>
              </div>

              {/* Personnel in this category */}
              <div className="space-y-2">
                <h5 className="text-xs font-bold text-slate-300">لیست همکاران حاضر در این گروه:</h5>
                {selectedEmps.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {selectedEmps.map((item, idx) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-slate-100">{item.emp.name}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {item.jobTitle} • {item.emp.unit} ({item.emp.code})
                          </div>
                        </div>
                        <div className="text-left">
                          <div className="font-mono font-bold text-teal-300">{item.score}٪</div>
                          <div className="text-[9px] text-slate-500 font-mono">پتانسیل: {item.potentialScore}٪</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">هیچ نیرویی در حال حاضر در این طبقه قرار ندارد.</p>
                )}
              </div>
            </div>
          );
        })()}

      </div>

      {/* GEMINI AI DEEP STRATEGIC REPORT */}
      {analysisResult && (
        <div className="bg-slate-800/40 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-2xl animate-fade-in">
          <div className="flex justify-between items-center flex-wrap gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-100">گزارش راهبردی و مربیگری هوشمند ماتریس استعداد (Gemini AI)</h3>
                <p className="text-[11px] text-slate-400">تحلیل عمیق سبد انسانی و توصیه‌های مربیگری به تفکیک دسته‌های شغلی</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-slate-900/80 border border-slate-700 px-3.5 py-1.5 rounded-xl flex items-center gap-2 text-xs">
                <span className="text-slate-400">شاخص سلامت سبد استعداد:</span>
                <span className="font-mono font-black text-teal-400 text-sm">{analysisResult.talentHealthScore} از ۱۰۰</span>
              </div>
            </div>
          </div>

          {/* Executive Summary Quote */}
          <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 text-xs text-indigo-200 leading-relaxed space-y-1.5">
            <p className="font-bold text-indigo-300 flex items-center gap-1.5">
              <Lightbulb className="w-4 h-4 text-amber-300" />
              <span>خلاصه مدیریتی مشاور ارشد منابع انسانی:</span>
            </p>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              {analysisResult.executiveSummary}
            </p>
          </div>

          {/* Detailed Box-by-Box Recommendations */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-teal-400" />
              <span>توصیه‌های مربیگری و برنامه توسعه به تفکیک دسته‌های ماتریس ۹ تایی:</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analysisResult.boxRecommendations.map((rec, idx) => (
                <div key={idx} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <h5 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-teal-400" />
                      {rec.boxTitle}
                    </h5>
                    <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                      {rec.headcount} پرسنل
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    <strong className="text-teal-400">راهبرد مدیریتی: </strong>
                    {rec.strategicGuidance}
                  </p>

                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold text-slate-400">توصیه‌های مربیگری فردی (Coaching Tips):</span>
                    <ul className="text-[10px] text-slate-300 space-y-1 pr-3 list-disc list-inside">
                      {rec.individualCoachingTips.map((tip, tIdx) => (
                        <li key={tIdx}>{tip}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
                    <span className="text-[10px] font-bold text-indigo-400">اقدامات سازمانی پیشنهادی:</span>
                    <ul className="text-[10px] text-slate-300 space-y-1 pr-3 list-disc list-inside">
                      {rec.recommendedActions.map((act, aIdx) => (
                        <li key={aIdx}>{act}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Succession and Risk Interventions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/20 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <Award className="w-4 h-4" />
                <span>برنامه جانشین‌پروری و حفظ نخبگان (Retention & Succession)</span>
              </div>
              <ul className="text-[11px] text-slate-300 space-y-1.5 pr-3 list-disc list-inside">
                {analysisResult.successionAndRetention.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/20 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-rose-400">
                <ShieldAlert className="w-4 h-4" />
                <span>برنامه بهبود عملکرد و مدیریت ریسک افت (Risk Mitigation & PIP)</span>
              </div>
              <ul className="text-[11px] text-slate-300 space-y-1.5 pr-3 list-disc list-inside">
                {analysisResult.riskInterventions.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NineBoxAIAnalysis;

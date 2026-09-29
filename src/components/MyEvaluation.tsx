/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { calculateFinalScore, evaluateNumericFormula } from '../utils/formulaEngine';
import { 
  ShieldCheck, 
  Sparkles, 
  UserCheck, 
  HelpCircle, 
  CheckCircle2, 
  Award, 
  TrendingUp, 
  Info, 
  Save, 
  ClipboardCopy,
  Send,
  GitFork,
  Check
} from 'lucide-react';
import { Employee, Evaluation, JobProfile, Criterion, getGrade, GRADE_DETAILS, WORKFLOW_STAGES, WorkflowTransitionLog, WorkflowStageKey , RewardConfig } from '../types';
import { db } from '../utils/db';

interface MyEvaluationProps {
  currentUser: Employee;
  activePeriod: string;
  evaluations: Evaluation[];
  profiles: JobProfile[];
  criteria: Criterion[];
  onUpdateEvaluation: (id: string, updatedEv: Evaluation) => void;
  theme: 'dark' | 'light';
}

export default function MyEvaluation({
  currentUser,
  activePeriod,
  evaluations,
  profiles,
  criteria,
  onUpdateEvaluation,
  theme
}: MyEvaluationProps) {
  const period = activePeriod.trim();
  const [saveSuccess, setSaveSuccess] = useState(false);

  // The Admin starts evaluations for an active period; employees only edit their assigned record.
  const storedUserEval = evaluations.find(e => e.empId === currentUser.id && e.period === period);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, Evaluation>>({});
  const userEval = storedUserEval ? scoreDrafts[storedUserEval.id] || storedUserEval : undefined;
  useEffect(() => {
    if (!storedUserEval) return;
    setScoreDrafts(current => {
      if (!current[storedUserEval.id]) return current;
      const next = { ...current };
      delete next[storedUserEval.id];
      return next;
    });
  }, [storedUserEval]);
  const canEditSelfAssessment = Boolean(period && userEval && ['self_review', 'rejected'].includes(userEval.stage || 'self_review'));
  const userProfile = profiles.find(p => p.id === currentUser.profileId);
  const [rewardConfig, setRewardConfig] = useState<RewardConfig | null>(null);
  useEffect(() => {
    const fetchConfig = () => {
      const cfg = db.getMiscData<RewardConfig>('pe_reward_config', { coefficients: [], multipliers: [] });
      setRewardConfig(cfg);
    };
    fetchConfig();
    window.addEventListener('pe_reward_config_updated', fetchConfig);
    return () => window.removeEventListener('pe_reward_config_updated', fetchConfig);
  }, []);

  
  const currentScore = userEval ? calculateFinalScore(userEval) : 0;
  
  
  const projectedReward = useMemo(() => {
    if (!rewardConfig || !userProfile || currentScore === 0) return 0;
    const m = rewardConfig.multipliers.find(m => currentScore >= m.minScore && currentScore <= (m.maxScore === 100 ? 100 : m.maxScore));
    const mult = m ? m.multiplier : 0;
    let baseAmount = userProfile.baseRewardAmount;
    if (!baseAmount || baseAmount === 0) {
      const specific = rewardConfig.coefficients.find(c => c.jobFamily === userProfile.family);
      baseAmount = specific ? specific.baseAmount : (rewardConfig.coefficients.find(c => c.jobFamily === 'all')?.baseAmount || 0);
    }
    return evaluateNumericFormula(rewardConfig.formula || 'baseAmount * multiplier', { score: currentScore, baseAmount, multiplier: mult });
  }, [currentScore, rewardConfig, userProfile]);
  

  const handleSelfScoreChange = (criterionId: string, scoreValue: number) => {
    if (!userEval || !canEditSelfAssessment) return;
    const updatedScores = userEval.scores.map(s => s.cid === criterionId ? { ...s, self: scoreValue } : s);
    setScoreDrafts(current => ({ ...current, [userEval.id]: { ...userEval, scores: updatedScores } }));
  };

  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null);

  const handleSubmitToSupervisor = () => {
    if (!userEval || !canEditSelfAssessment) return;
    
    // Ensure all criteria are given a self-score
    const unrated = userProfile?.items.some(it => {
      const score = userEval?.scores.find(s => s.cid === it.cid);
      return !score || score.self === 0;
    });

    if (unrated) {
      if (!confirm('برخی از شاخص‌ها هنوز خودارزیابی نشده‌اند. آیا مایلید پرونده با نمرات فعلی به سرپرست مستقیم ارسال شود؟')) {
        return;
      }
    }

    const newLog: WorkflowTransitionLog = {
      id: `trans-${Date.now()}`,
      fromStage: userEval.stage || 'self_review',
      toStage: 'supervisor_review',
      actorId: currentUser.id,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      action: userEval.stage === 'rejected' ? 'submit_supervisor' : 'submit_self',
      comment: 'ثبت نهایی خودارزیابی و ارسال به کارتابل سرپرست مستقیم جهت ارزیابی',
      timestamp: new Intl.DateTimeFormat('fa-IR', {
        dateStyle: 'short',
        timeStyle: 'medium'
      }).format(new Date())
    };

    const updatedHistory = [newLog, ...(userEval.history || [])];

    onUpdateEvaluation(userEval.id, {
      ...userEval,
      stage: 'supervisor_review',
      history: updatedHistory
    });
    setScoreDrafts(current => { const next = { ...current }; delete next[userEval.id]; return next; });

    setSubmitFeedback('خودارزیابی شما با موفقیت ثبت و به کارتابل سرپرست مستقیم ارسال گردید.');
    setTimeout(() => setSubmitFeedback(null), 5000);
  };

  const handleSaveSelfAssessment = () => {
    if (!userEval || !canEditSelfAssessment || !scoreDrafts[userEval.id]) return;
    onUpdateEvaluation(userEval.id, scoreDrafts[userEval.id]);
    setScoreDrafts(current => { const next = { ...current }; delete next[userEval.id]; return next; });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const calculateOverallScore = (ev: Evaluation) => {
    const scoredItems = ev.scores.filter(s => s.value > 0);
    if (!scoredItems.length) return 0;
    const totalWeight = scoredItems.reduce((acc, curr) => acc + curr.weight, 0);
    if (totalWeight === 0) return 0;
    const weightedSum = scoredItems.reduce((acc, curr) => acc + (curr.value * curr.weight), 0);
    const avg5 = weightedSum / totalWeight;
    return Math.round(avg5 * 20 * 10) / 10; // Out of 100
  };

  const calculateSelfScoreAvg = (ev: Evaluation) => {
    const scoredItems = ev.scores.filter(s => s.self > 0);
    if (!scoredItems.length) return 0;
    const totalWeight = scoredItems.reduce((acc, curr) => acc + curr.weight, 0);
    if (totalWeight === 0) return 0;
    const weightedSum = scoredItems.reduce((acc, curr) => acc + (curr.self * curr.weight), 0);
    const avg5 = weightedSum / totalWeight;
    return Math.round(avg5 * 20 * 10) / 10;
  };

  if (!userProfile) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-red-400 font-bold">هیچ پروفایل شغلی فعالی برای شناسه پرسنلی شما تعریف نشده است.</p>
        <p className="text-xs text-slate-500">لطفاً جهت تخصیص پروفایل با واحد منابع انسانی تماس بگیرید.</p>
      </div>
    );
  }

  const finalScore = userEval ? calculateOverallScore(userEval) : 0;
  const selfScoreAvg = userEval ? calculateSelfScoreAvg(userEval) : 0;
  const grade = getGrade(finalScore);
  const gradeDetail = GRADE_DETAILS[grade];
  const currentStage = userEval?.stage || 'self_review';
  const stageInfo = WORKFLOW_STAGES[currentStage] || WORKFLOW_STAGES.self_review;

  return (
    <div className="space-y-6 text-right" dir="rtl">
      {/* Welcome & Info */}
      <div className={`p-5 rounded-3xl border flex justify-between items-center flex-wrap gap-4 ${
        theme === 'dark' ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200 shadow'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-100">پنل خودارزیابی و کارنامه توسعه فردی</h1>
            <p className="text-xs text-slate-400 mt-1">
              همکار گرامی: <span className="text-teal-400 font-bold">{currentUser.name}</span> • سمت شغلی: <span className="font-bold">{userProfile.title}</span> • واحد: {currentUser.unit}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-slate-950/60 px-4 py-2 rounded-xl text-xs border border-slate-800 font-bold text-teal-400">
            دوره ارزیابی: {period || 'هیچ دوره‌ای فعال نیست'}
          </div>
        </div>
      </div>

      {/* Live Workflow Status Banner for Employee */}
      <div className={`p-5 rounded-3xl border ${
        theme === 'dark' ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <GitFork className="w-5 h-5 text-teal-400" />
            <span className="text-xs font-bold text-slate-200">وضعیت گردش کار پرونده شما:</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-teal-500/20 text-teal-300 border border-teal-500/30">
              {stageInfo.label}
            </span>
          </div>

          <div className="text-xs text-slate-400">
            مسئول کنونی اقدام: <strong className="text-slate-200">{stageInfo.responsibleLabel}</strong>
          </div>
        </div>

        {/* Stepper Dots */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2">
          {(userEval?.requiresSelfReview === true || currentStage === 'self_review' || userEval?.history?.some(log => log.action === 'submit_self')
            ? ['self_review', 'supervisor_review', 'calibration_review', 'hr_approval', 'feedback_meeting', 'completed'] as WorkflowStageKey[]
            : ['supervisor_review', 'calibration_review', 'hr_approval', 'feedback_meeting', 'completed'] as WorkflowStageKey[]).map((stKey) => {
            const st = WORKFLOW_STAGES[stKey];
            const isCurrent = currentStage === stKey;
            const isPassed = st.stepNumber < stageInfo.stepNumber;

            return (
              <div
                key={stKey}
                className={`p-2.5 rounded-2xl text-center border transition-all ${
                  isCurrent
                    ? 'bg-teal-500/20 border-teal-500 text-teal-300 font-bold shadow-md'
                    : isPassed
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-slate-950/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="text-[10px] font-bold">{st.label}</div>
                <div className="mt-1 text-[10px] font-medium opacity-90">{isPassed ? 'انجام شد' : isCurrent ? 'در جریان' : 'در انتظار'}</div>
              </div>
            );
          })}
        </div>
        {userEval?.stage === 'hse_review' && userEval.hseReviewContext && (
          <div className="mt-3 rounded-2xl border border-orange-500/30 bg-orange-500/5 p-3 text-xs text-orange-200">
            پرونده شما برای بررسی واحد HSE در جریان است و پس از تکمیل به «{WORKFLOW_STAGES[userEval.hseReviewContext.returnStage]?.label}» بازمی‌گردد.
          </div>
        )}
        {currentStage === 'rejected' && userEval && (
          <div role="status" className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            <strong>گام بعدی: خودارزیابی و شواهد را اصلاح و دوباره به سرپرست ارسال کنید.</strong>
            {userEval.rejectionReason && <p className="mt-1">علت بازگشت: {userEval.rejectionReason}</p>}
          </div>
        )}
      </div>

      {/* Grid: Self-assessment input & Score indicator */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: 2/3 - Self-Assessment Scoring Form */}
        {canEditSelfAssessment ? (
        <div className="lg:col-span-2 space-y-6">
          <div className={`p-6 rounded-3xl border ${
            theme === 'dark' ? 'bg-slate-900/30 border-slate-800/80' : 'bg-white border-slate-200'
          }`}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
              <div>
                <h3 className="text-sm font-bold text-slate-200">ثبت و ویرایش خودارزیابی</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">دیدگاه خود را نسبت به عملکرد فردی در هر یک از شاخص‌ها ثبت کنید.</p>
                {!period && <p className="mt-2 text-xs font-semibold text-amber-400">برای این دوره هنوز فعال نشده است.</p>}
                {period && !userEval && <p className="mt-2 text-xs font-semibold text-amber-400">ارزیابی این دوره هنوز برای شما آغاز نشده است؛ از سرپرست بخواهید ارزیابی را شروع کند.</p>}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveSelfAssessment}
                  disabled={!scoreDrafts[userEval.id]}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{scoreDrafts[userEval.id] ? 'ذخیره پیش‌نویس تغییرات' : 'بدون تغییر ذخیره‌نشده'}</span>
                </button>

                <button
                  onClick={handleSubmitToSupervisor}
                  disabled={!canEditSelfAssessment}
                  className="px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-teal-500/20"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>ارسال نهایی به سرپرست</span>
                </button>
              </div>
            </div>

            {submitFeedback && (
              <div className="mb-4 bg-teal-500/10 border border-teal-500/30 text-teal-300 p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                <span>{submitFeedback}</span>
              </div>
            )}

            {saveSuccess && (
              <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>خودارزیابی شما با موفقیت در پایگاه داده اصفهان چالاک ذخیره شد. این نمرات مبنای گفتگو با سرپرست خواهد بود.</span>
              </div>
            )}

            <div className="space-y-4">
              {userProfile.items.map((item, idx) => {
                const crit = criteria.find(c => c.id === item.cid);
                if (!crit) return null;

                const currentSelfScore = userEval?.scores.find(s => s.cid === item.cid)?.self || 0;

                return (
                  <div 
                    key={item.cid}
                    className={`p-4 rounded-2xl border transition-all ${
                      theme === 'dark' 
                        ? 'bg-slate-950/40 border-slate-800/60 hover:border-slate-700' 
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[9px] font-black font-mono bg-slate-800/80 px-2 py-0.5 rounded text-slate-400">
                            {crit.code}
                          </span>
                          <h4 className="text-xs font-bold text-slate-200">{crit.name}</h4>
                          <span className="text-[10px] text-slate-500">(ضریب: {item.weight}٪)</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">{crit.def}</p>
                        {crit.source && (
                          <p className="text-[9px] text-slate-500 font-mono mt-1">منبع داده: {crit.source}</p>
                        )}
                      </div>

                      {/* Score Selector (1-5) */}
                      <div className="flex flex-col items-center gap-1.5 shrink-0">
                        <span className="text-[9px] text-slate-400">خودارزیابی شما</span>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => handleSelfScoreChange(item.cid, val)}
                              disabled={!canEditSelfAssessment}
                              className={`w-7 h-7 rounded-lg text-xs font-bold transition-all score-btn cursor-pointer ${
                                currentSelfScore === val
                                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/10 font-black'
                                  : 'bg-slate-800 text-slate-400 hover:bg-slate-750'
                              }`}
                            >
                              {val}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        ) : (
          <div className="lg:col-span-2 rounded-3xl border border-slate-800 bg-slate-900/50 p-6" role="status">
            <h3 className="text-sm font-black text-slate-100">وضعیت خودارزیابی</h3>
            <p className="mt-2 text-xs leading-6 text-slate-300">
              {!userEval ? 'ارزیابی این دوره هنوز آغاز نشده است.' : userEval.stage === 'hse_review'
                ? 'پرونده شما در حال بررسی واحد HSE است.'
                : userEval.requiresSelfReview === false && userEval.stage === 'supervisor_review'
                  ? 'پرونده شما مستقیماً برای ارزیابی سرپرست ارسال شده است.'
                  : `پرونده شما در مرحله «${stageInfo.label}» قرار دارد. در این مرحله فرم خودارزیابی ویرایش‌پذیر نیست.`}
            </p>
          </div>
        )}

        {/* Right Col: 1/3 - Official Scorecard & AI IDP */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Card 1: Official Performance Result */}
          <div className={`p-6 rounded-3xl border space-y-5 ${
            theme === 'dark' ? 'bg-slate-900/30 border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <h3 className="text-sm font-bold text-slate-200">کارنامه نهایی رسمی</h3>
            
            {userEval && (userEval.status === 'locked' || userEval.status === 'calibrated') ? (
              <div className="space-y-4">
                <div className="text-center py-5 bg-teal-500/10 border border-teal-500/20 rounded-2xl relative overflow-hidden">
                  <span className="text-[10px] text-teal-400 block font-bold">امتیاز نهایی رسمی (مورد تایید کالیبراسیون)</span>
                  <div className="text-4xl font-black text-slate-100 mt-2 font-mono">{finalScore}٪</div>
                  
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${gradeDetail?.color}`}>
                      رتبه {grade} ({gradeDetail?.label})
                    </span>
                  </div>
                </div>

                <div className="text-xs space-y-2 text-slate-400">
                  <div className="flex justify-between">
                    <span>میانگین ارزیابی شما:</span>
                    <span className="font-bold text-slate-200">{selfScoreAvg}٪</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ثبت مستندات و تفاهم:</span>
                    <span className="text-emerald-400 font-bold">نهایی و قفل‌شده</span>
                  </div>
                </div>

                {userEval.note && (
                  <div className="p-3 bg-slate-900/60 border border-slate-850 rounded-xl space-y-1.5">
                    <span className="text-[10px] text-slate-500 font-bold">یادداشت توسعه‌ای سرپرست:</span>
                    <p className="text-[10px] text-slate-300 leading-relaxed">{userEval.note}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 space-y-3">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto">
                  <Info className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-slate-200 text-xs">ارزیابی شما هنوز تایید نهایی نشده است</h4>
                <p className="text-[10px] text-slate-400 max-w-xs mx-auto">
                  پس از تکمیل نمرات توسط سرپرست و تایید در کمیته کالیبراسیون، کارنامه رسمی شما در این قسمت قفل و نمایش داده می‌شود.
                </p>
                {userEval && (
                  <div className="p-3 bg-slate-900/30 rounded-xl inline-block text-[10px] text-amber-300">
                    وضعیت پرونده: {userEval.status === 'draft' ? 'پیش‌نویس / در انتظار ارزیابی سرپرست' : 'کالیبره شده / در انتظار قفل نهایی'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card 2: AI Smart Coaching & Action Items */}
          {userEval?.aiFeedback ? (
            <div className={`p-6 rounded-3xl border space-y-5 relative overflow-hidden ${
              theme === 'dark' ? 'bg-gradient-to-br from-indigo-500/5 to-teal-500/5 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-200">مربیگری هوشمند هوش مصنوعی (IDP)</h3>
                  <p className="text-[9px] text-slate-500">برنامه رشد اختصاصی بر اساس نقاط قوت و ضعف عملکرد شما</p>
                </div>
              </div>

              <div className="space-y-4 text-xs">
                {/* Strengths */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-emerald-400 font-bold block"> نقاط قوت عملکردی شما:</span>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 text-[10px]">
                    {userEval.aiFeedback.strengths.map((str, i) => (
                      <li key={i}>{str}</li>
                    ))}
                  </ul>
                </div>

                {/* Development areas */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-amber-400 font-bold block"> زمینه‌های نیاز به توسعه:</span>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 text-[10px]">
                    {userEval.aiFeedback.developmentAreas.map((dev, i) => (
                      <li key={i}>{dev}</li>
                    ))}
                  </ul>
                </div>

                {/* Action Items */}
                <div className="space-y-2 pt-2 border-t border-slate-800/40">
                  <span className="text-[10px] text-indigo-400 font-bold block"> اقدامات عملی پیشنهادی (برنامه رشد):</span>
                  <div className="space-y-1.5">
                    {userEval.aiFeedback.actionItems.map((act, i) => (
                      <div key={i} className="flex gap-2 items-start bg-slate-900/40 p-2 rounded-lg border border-slate-850">
                        <span className="w-4 h-4 bg-teal-500/20 text-teal-300 text-[9px] font-black rounded flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <p className="text-[9px] text-slate-300 leading-relaxed">{act}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                <div className="p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/10 text-[9px] text-slate-400 leading-relaxed">
                  <span className="font-bold text-indigo-300 block mb-1">خلاصه مربیگری:</span>
                  {userEval.aiFeedback.summary}
                </div>
              </div>
            </div>
          ) : (
            <div className={`p-6 rounded-3xl border text-center space-y-3 ${
              theme === 'dark' ? 'bg-slate-900/30 border-slate-800/80' : 'bg-white border-slate-200'
            }`}>
              <Sparkles className="w-8 h-8 text-indigo-400 mx-auto animate-pulse" />
              <h4 className="font-bold text-slate-200 text-xs">در انتظار تحلیل هوشمند برنامه توسعه فردی</h4>
              <p className="text-[10px] text-slate-400 max-w-xs mx-auto">
                پس از ثبت و نهایی‌سازی نمرات توسط سرپرست شما، هوش مصنوعی به صورت خودکار نمرات را بررسی کرده و برنامه مربیگری و رشد اختصاصی شما را فوراً تولید می‌کند.
              </p>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}

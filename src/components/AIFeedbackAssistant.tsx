/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Sparkles, 
  BrainCircuit, 
  CheckCircle2, 
  Copy, 
  Send, 
  AlertCircle, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp,
  Layers,
  Award,
  ShieldCheck,
  Zap
} from 'lucide-react';

interface CompetencyScoresMap {
  K?: number;
  Q?: number;
  B?: number;
  S?: number;
  L?: number;
}

interface AIFeedbackAssistantProps {
  employeeName: string;
  jobTitle: string;
  supervisorComment: string;
  competencyScores?: CompetencyScoresMap;
  onApplyFeedback?: (refinedComment: string, actionPlan?: string[]) => void;
  theme?: 'dark' | 'light';
  className?: string;
}

interface GeneratedFeedback {
  refinedComment: string;
  competencyFeedback: {
    quantitative: string;
    quality: string;
    behavioral: string;
    safetyHse: string;
    leadershipTeam: string;
  };
  strengths: string[];
  actionPlan: string[];
}

export default function AIFeedbackAssistant({
  employeeName,
  jobTitle,
  supervisorComment,
  competencyScores = { K: 3.5, Q: 4.0, B: 3.8, S: 4.5, L: 3.2 },
  onApplyFeedback,
  theme = 'dark',
  className = ''
}: AIFeedbackAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<GeneratedFeedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    setApplied(false);

    try {
      const response = await fetch('/api/gemini/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeName,
          jobTitle,
          supervisorComment,
          competencyScores
        })
      });

      if (!response.ok) {
        throw new Error('عدم دریافت پاسخ معتبر از سرویس هوش مصنوعی');
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      console.error('AI Feedback Generation failed:', err);
      setError(err.message || 'خطایی در تولید بازخورد رخ داد.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = () => {
    if (!result || !onApplyFeedback) return;
    onApplyFeedback(result.refinedComment, result.actionPlan);
    setApplied(true);
    setTimeout(() => setApplied(false), 3000);
  };

  const isDark = theme === 'dark';

  return (
    <div className={`rounded-2xl border transition-all ${
      isDark 
        ? 'bg-slate-900/80 border-teal-500/30 shadow-lg shadow-teal-500/5' 
        : 'bg-white border-teal-500/30 shadow-md'
    } ${className}`} dir="rtl">
      
      {/* Header Banner */}
      <div className="p-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-slate-950 shadow-md">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-black text-teal-400 flex items-center gap-1.5">
              <span>تحلیل هوشمند نظرات و پیشنهاد بازخورد شایستگی‌ها (AI)</span>
              <span className="px-1.5 py-0.2 bg-teal-500/20 text-teal-300 text-[9px] rounded-md border border-teal-500/30">
                Gemini 3.7
              </span>
            </h4>
            <p className="text-[10px] text-slate-400 mt-0.5">
              تبدیل یادداشت‌های سرپرست به بازخورد رشددهنده بر اساس ابعاد پنج‌گانه شایستگی
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!isOpen && !result) {
              handleGenerate();
            }
            setIsOpen(!isOpen);
          }}
          className="px-3 py-1.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer shrink-0"
        >
          <BrainCircuit className="w-3.5 h-3.5" />
          <span>{result ? (isOpen ? 'بستن پنل هوش مصنوعی' : 'نمایش تحلیل AI') : 'اجرای تحلیل هوشمند'}</span>
          {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Expanded Content Area */}
      {isOpen && (
        <div className="p-4 border-t border-slate-800/80 space-y-4">
          
          {isLoading && (
            <div className="py-8 flex flex-col items-center justify-center gap-3 text-teal-400">
              <div className="w-8 h-8 border-3 border-teal-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-bold animate-pulse">
                هوش مصنوعی در حال تحلیل متن نظر سرپرست و انطباق با ابعاد شایستگی...
              </p>
            </div>
          )}

          {error && !isLoading && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-xs text-rose-400">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                onClick={handleGenerate}
                className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 rounded-lg font-bold flex items-center gap-1 text-[11px]"
              >
                <RefreshCw className="w-3 h-3" />
                <span>تلاش مجدد</span>
              </button>
            </div>
          )}

          {result && !isLoading && (
            <div className="space-y-4 animate-in fade-in duration-300">
              
              {/* Refined Supervisor Feedback Card */}
              <div className={`p-3.5 rounded-2xl border ${
                isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <h5 className="text-xs font-black text-slate-200">
                      پیشنهاد بازنویسی حرفه‌ای نظر سرپرست:
                    </h5>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(result.refinedComment)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copied ? 'کپی شد!' : 'کپی متن'}</span>
                    </button>
                    {onApplyFeedback && (
                      <button
                        type="button"
                        onClick={handleApply}
                        className="px-2.5 py-1 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-lg text-[10px] font-black flex items-center gap-1 transition-colors shadow cursor-pointer"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{applied ? 'در فرم اعمال شد' : 'اعمال در فرم ارزیابی'}</span>
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-slate-300 font-medium">
                  {result.refinedComment}
                </p>
              </div>

              {/* 5-Dimension Competency Targeted Suggestions */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-teal-400">
                  <Layers className="w-3.5 h-3.5" />
                  <span>توصیه‌های اختصاصی بر اساس ابعاد پنج‌گانه شایستگی:</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                  
                  {/* Dimension K */}
                  <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 flex items-start gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-400 font-black text-[10px] shrink-0">
                      K: کمی
                    </span>
                    <p className="text-slate-300">{result.competencyFeedback.quantitative}</p>
                  </div>

                  {/* Dimension Q */}
                  <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 flex items-start gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-black text-[10px] shrink-0">
                      Q: کیفیت
                    </span>
                    <p className="text-slate-300">{result.competencyFeedback.quality}</p>
                  </div>

                  {/* Dimension B */}
                  <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 flex items-start gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-black text-[10px] shrink-0">
                      B: رفتار
                    </span>
                    <p className="text-slate-300">{result.competencyFeedback.behavioral}</p>
                  </div>

                  {/* Dimension S */}
                  <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 flex items-start gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-black text-[10px] shrink-0">
                      S: HSE
                    </span>
                    <p className="text-slate-300">{result.competencyFeedback.safetyHse}</p>
                  </div>

                  {/* Dimension L */}
                  <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 flex items-start gap-2 md:col-span-2">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-black text-[10px] shrink-0">
                      L: مربی‌گری و تیم
                    </span>
                    <p className="text-slate-300">{result.competencyFeedback.leadershipTeam}</p>
                  </div>

                </div>
              </div>

              {/* Action Plans / IDP */}
              {result.actionPlan && result.actionPlan.length > 0 && (
                <div className="p-3 rounded-xl bg-teal-500/5 border border-teal-500/20 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-teal-400">
                    <Award className="w-3.5 h-3.5" />
                    <span>برنامه اقدام فردی (IDP) پیشنهادی:</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-slate-300 space-y-1">
                    {result.actionPlan.map((action, i) => (
                      <li key={i}>{action}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Bottom Re-Generate Action */}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="text-[11px] text-slate-400 hover:text-teal-400 flex items-center gap-1 font-semibold transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>تولید مجدد تحلیل هوشمند</span>
                </button>
              </div>

            </div>
          )}

        </div>
      )}

    </div>
  );
}

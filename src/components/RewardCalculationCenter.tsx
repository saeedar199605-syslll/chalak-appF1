/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { calculateFinalScore, evaluateNumericFormula } from '../utils/formulaEngine';
import { 
  Calculator, 
  Download, 
  Save, 
  Plus, 
  Trash2, 
  Settings2,
  TableProperties,
  ArrowDownToLine,
  TrendingUp,
  Database,
  History
} from 'lucide-react';
import { Employee, Evaluation, JobProfile, RewardConfig, RewardCoefficient, PerformanceMultiplier } from '../types';
import { db } from '../utils/db';
import { downloadWorkbook, recordsToRows } from '../utils/excelWorkbook';

interface RewardCalculationCenterProps {
  onBulkUpdateEvaluations?: (evals: Evaluation[]) => void;
  evaluations: Evaluation[];
  employees: Employee[];
  profiles: JobProfile[];
  theme?: 'dark' | 'light';
}

const DEFAULT_CONFIG: RewardConfig = {
  formula: 'baseAmount * multiplier',
  coefficients: [
    { jobFamily: 'all', baseAmount: 10000000 }
  ],
  multipliers: [
    { minScore: 90, maxScore: 100, multiplier: 1.5 },
    { minScore: 80, maxScore: 89.99, multiplier: 1.2 },
    { minScore: 70, maxScore: 79.99, multiplier: 1.0 },
    { minScore: 50, maxScore: 69.99, multiplier: 0.5 },
    { minScore: 0, maxScore: 49.99, multiplier: 0.0 }
  ]
};

export default function RewardCalculationCenter({
  evaluations,
  employees,
  profiles,
  theme = 'dark',
  onBulkUpdateEvaluations
}: RewardCalculationCenterProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [config, setConfig] = useState<RewardConfig>(() => {
    const saved = db.getMiscData<RewardConfig>('pe_reward_config', DEFAULT_CONFIG);
    return saved?.multipliers?.length && saved?.coefficients?.length ? saved : DEFAULT_CONFIG;
  });
  const [saveIndicator, setSaveIndicator] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'settings' | 'history'>('preview');
  const [batchHistory, setBatchHistory] = useState<any[]>([]);
  useEffect(() => { setBatchHistory(db.getMiscData('pe_reward_batch_history', [])); }, []);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [manualOverrides, setManualOverrides] = useState<Record<string, number>>({});

  const isDark = theme === 'dark';

  // Sync missing Job Families
  useEffect(() => {
    if (profiles.length > 0) {
      const families = Array.from(new Set(profiles.map(p => p.family).filter(Boolean)));
      setConfig(prev => {
        let changed = false;
        const newCoefs = [...prev.coefficients];
        families.forEach(f => {
          if (!newCoefs.find(c => c.jobFamily === f)) {
            newCoefs.push({ jobFamily: f, baseAmount: newCoefs[0]?.baseAmount || 10000000 });
            changed = true;
          }
        });
        if (changed) {
          return { ...prev, coefficients: newCoefs };
        }
        return prev;
      });
    }
  }, [profiles]);

  useEffect(() => {
    db.saveMiscData('pe_reward_config', config);
    window.dispatchEvent(new Event('pe_reward_config_updated'));
  }, [config]);

  const handleSaveConfig = () => {
    setIsSaving(true);
    db.saveMiscData('pe_reward_config', config);
    window.dispatchEvent(new Event('pe_reward_config_updated'));
    setTimeout(() => setIsSaving(false), 500);
  };

  
  const getMultiplier = (score: number) => {
    const m = config.multipliers.find(m => score >= m.minScore && score <= (m.maxScore === 100 ? 100 : m.maxScore));
    return m ? m.multiplier : 0;
  };

  const getBaseAmount = (jobFamily: string, profileBaseAmount?: number) => {
    if (profileBaseAmount !== undefined && profileBaseAmount > 0) return profileBaseAmount;
    const specific = config.coefficients.find(c => c.jobFamily === jobFamily);
    return specific ? specific.baseAmount : (config.coefficients.find(c => c.jobFamily === 'all')?.baseAmount || 0);
  };

  const displayData = useMemo(() => {
    const completed = evaluations.filter(ev => ev.status === 'locked' || ev.status === 'calibrated');
    const filtered = selectedPeriod === 'all' ? completed : completed.filter(ev => ev.period === selectedPeriod);

    return filtered.map(ev => {
      const emp = employees.find(e => e.id === ev.empId);
      const prof = profiles.find(p => p.id === ev.profileId);
      const jobFamily = prof ? prof.family : (emp ? emp.unit : 'نامشخص');
      
      const score = calculateFinalScore(ev, profiles);
      const baseAmount = getBaseAmount(jobFamily, prof?.baseRewardAmount);
      const multiplier = getMultiplier(score);
      const finalReward = evaluateNumericFormula(config.formula || 'baseAmount * multiplier', { baseAmount, multiplier, score });

      return {
        evaluationId: ev.id,
        empId: ev.empId,
        empCode: emp?.code || '---',
        empName: emp?.name || '---',
        unit: emp?.unit || '---',
        jobFamily,
        period: ev.period,
        score,
        baseAmount,
        multiplier,
        finalReward
      };
    }).sort((a, b) => b.finalReward - a.finalReward);
  }, [evaluations, employees, profiles, config, selectedPeriod]);

  const totalBudget = useMemo(() => displayData.reduce((acc, curr) => acc + curr.finalReward, 0), [displayData]);

  


  const handleExportExcel = () => {
    if (displayData.length === 0) return;
    const exportRows = displayData.map(d => ({
      'کد پرسنلی': d.empCode,
      'نام پرسنل': d.empName,
      'واحد سازمانی': d.unit,
      'خانواده شغلی': d.jobFamily,
      'دوره': d.period,
      'نمره نهایی': d.score,
      'مبلغ پایه (ریال)': d.baseAmount,
      'ضریب عملکرد': d.multiplier,
      'مبلغ نهایی پاداش (ریال)': d.finalReward
    }));
    void downloadWorkbook(`Rewards_${Date.now()}.xlsx`, [
      { name: 'محاسبات پاداش', rows: recordsToRows(exportRows) }
    ]);
  };

  
  
  const handleBatchExportToDB = () => {
    if (displayData.length === 0) {
      alert('رکوردی برای استخراج یافت نشد.');
      return;
    }
    
    // 1. Update each Evaluation record in DB with its finalReward
    if (onBulkUpdateEvaluations) {
      const updatedEvals = evaluations.map(ev => {
        const found = displayData.find(d => d.evaluationId === ev.id);
        if (found) {
          return { ...ev, finalReward: found.finalReward };
        }
        return ev;
      });
      // The callback replaces the full evaluation collection; never pass a subset.
      onBulkUpdateEvaluations(updatedEvals);
    }
    
    // 2. Save Batch History to DB
    const history = db.getMiscData('pe_reward_batch_history', []);
    const batchRecord = {
      id: 'BATCH_' + Date.now(),
      date: new Date().toISOString(),
      period: selectedPeriod,
      totalBudget,
      records: displayData
    };
    db.saveMiscData('pe_reward_batch_history', [...history, batchRecord]);
    setBatchHistory([...history, batchRecord]);

    // 3. Download JSON
    const batchJson = JSON.stringify(batchRecord, null, 2);
    const blob = new Blob([batchJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Batch_Rewards_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // 4. Download Excel simultaneously
    handleExportExcel();
    
    alert('عملیات پردازش دسته‌ای با موفقیت انجام شد. فایل‌ها دانلود شدند و اطلاعات در دیتابیس ثبت گردید.');
  };



  const periods = Array.from(new Set(evaluations.map(e => e.period))).sort().reverse();

  return (
<div className={`app-page h-full flex flex-col ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
      {/* Header */}
      <div className="mb-4 flex shrink-0 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 sm:p-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Calculator className="w-6 h-6 text-teal-400" />
            محاسبات ریالی و پاداش عملکرد
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-6">
            تعریف ضرایب ریالی، محاسبه اتوماتیک پاداش‌ها بر اساس نمرات نهایی و دریافت خروجی گروهی
          </p>
        </div>
        
        
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="hidden min-h-10 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-950 lg:flex">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-400">بودجه تخمینی کل (شبیه‌ساز):</span>
            <span className="font-mono text-lg font-black text-teal-700 dark:text-teal-400">
              {new Intl.NumberFormat('fa-IR').format(totalBudget)} ریال
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">

          {saveIndicator && (
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-1 rounded-lg animate-fade-in">
              تنظیمات ذخیره شد
            </span>
          )}
          <button 
            onClick={handleSaveConfig}
            className="flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Save className="w-4 h-4" /> ذخیره تنظیمات
          </button>
          <button 
            onClick={handleExportExcel}
            className="flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-teal-500"
          >
            <Download className="w-4 h-4" /> خروجی اکسل
          </button>
          <button 
            onClick={handleBatchExportToDB}
            className="flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Database className="w-4 h-4" /> خروجی Batch (DB)
          </button>
  
        {activeTab === 'history' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
                <History className="w-6 h-6 text-emerald-400" />
                تاریخچه خروجی‌های پاداش
              </h2>
              <button 
                onClick={() => {
                  if(confirm('آیا از حذف تمام تاریخچه اطمینان دارید؟')) {
                    db.saveMiscData('pe_reward_batch_history', []);
                    setBatchHistory([]);
                  }
                }}
                className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                پاکسازی کل تاریخچه
              </button>
            </div>
            
            {batchHistory.length === 0 ? (
              <div className="text-center py-10 bg-slate-900/50 rounded-2xl border border-slate-800">
                <p className="text-slate-400">هیچ تاریخچه‌ای یافت نشد.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {batchHistory.map((batch: any, index: number) => (
                  <div key={batch.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-1 h-full bg-indigo-500" />
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-slate-200">کد پردازش: {batch.id}</h4>
                        <p className="text-xs text-slate-400 mt-1">دوره: <span className="text-indigo-400">{batch.period}</span></p>
                      </div>
                      <button
                        
                        onClick={() => {
                          if (!confirm('آیا از حذف این تاریخچه و پاکسازی مبلغ پاداش پرسنل مربوطه اطمینان دارید؟')) return;
                          // Clear finalReward for all records in this batch
                          if (onBulkUpdateEvaluations) {
                             const targetIds = new Set<string>();
                             for (const record of batch.records || []) {
                               if (record.evaluationId) {
                                 targetIds.add(record.evaluationId);
                               } else {
                                 // Legacy history lacks evaluation IDs. Only match when unambiguous.
                                 const matches = evaluations.filter(ev => ev.empId === record.empId && ev.period === record.period && ev.finalReward !== undefined);
                                 if (matches.length === 1) targetIds.add(matches[0].id);
                               }
                             }
                             if (targetIds.size > 0) onBulkUpdateEvaluations(evaluations.map(ev =>
                               targetIds.has(ev.id) ? { ...ev, finalReward: undefined } : ev));
                          }
                          const updated = batchHistory.filter(b => b.id !== batch.id);
                          db.saveMiscData('pe_reward_batch_history', updated);
                          setBatchHistory(updated);
                        }}

                        className="text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                        title="حذف این رکورد"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="pt-3 border-t border-slate-800/80 flex justify-between items-center text-sm">
                      <span className="text-slate-400">تاریخ: {new Date(batch.date).toLocaleString('fa-IR')}</span>
                      <span className="text-emerald-400 font-bold font-mono">{new Intl.NumberFormat('fa-IR').format(batch.totalBudget)} ریال</span>
                    </div>
                    
                    <div className="text-xs text-slate-500">
                      تعداد کارمندان در خروجی: {batch.records?.length || 0} نفر
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  </div>
      {/* Tabs */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-200 px-4 pt-4 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('preview')}
          className={`pb-3 text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'preview' 
              ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300' 
              : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <TableProperties className="w-4 h-4" /> پیش‌نمایش و بودجه‌بندی (شبیه‌ساز)
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`pb-3 text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'settings' 
              ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300' 
              : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Settings2 className="w-4 h-4" /> تنظیمات ضرایب و فرمول
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'history' ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300' : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >تاریخچه خروجی‌های پاداش</button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-4 md:p-6 bg-slate-900/30">
        
        {activeTab === 'preview' && (
          <div className="space-y-6 h-full flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
                >
                  <option value="all">همه دوره‌ها</option>
                  {periods.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <div className="text-xs text-slate-400">
                  فقط پرونده‌های بسته‌شده (Locked) یا کالیبره‌شده
                </div>
              </div>
              
            </div>

            {displayData.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                <Calculator className="w-16 h-16 opacity-20 mb-4" />
                <p>هیچ پرونده ارزیابی نهایی‌شده‌ای برای محاسبه یافت نشد.</p>
              </div>
            ) : (
              <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-slate-800/80 text-slate-300 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 font-bold">پرسنل</th>
                        <th className="px-4 py-3 font-bold">گروه شغلی / واحد</th>
                        <th className="px-4 py-3 font-bold">دوره</th>
                        <th className="px-4 py-3 font-bold text-center">نمره نهایی</th>
                        <th className="px-4 py-3 font-bold text-center">مبلغ پایه (ریال)</th>
                        <th className="px-4 py-3 font-bold text-center">ضریب عملکرد</th>
                        <th className="px-4 py-3 font-bold text-left text-teal-400">پاداش نهایی (ریال)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {displayData.map((d, i) => (
                        <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-200">{d.empName}</div>
                            <div className="text-xs text-slate-500">{d.empCode}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            <div className="font-bold">{d.jobFamily}</div>
                            <div className="text-xs">{d.unit}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-400">{d.period}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-bold ${
                              d.score >= 90 ? 'bg-emerald-500/10 text-emerald-400' :
                              d.score >= 70 ? 'bg-blue-500/10 text-blue-400' :
                              d.score >= 50 ? 'bg-amber-500/10 text-amber-400' :
                              'bg-rose-500/10 text-rose-400'
                            }`}>
                              {d.score}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-slate-400">
                            {new Intl.NumberFormat('fa-IR').format(d.baseAmount)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="bg-slate-800 px-2 py-1 rounded text-xs text-slate-300 font-mono">
                              {d.multiplier}x
                            </span>
                          </td>
                          
                          <td className="px-4 py-3 text-left font-black text-teal-400 font-mono text-base">
                            <input 
                              type="number" 
                              value={d.finalReward}
                              onChange={(e) => setManualOverrides({ ...manualOverrides, [`${d.empId}_${d.period}`]: Number(e.target.value) })}
                              className="bg-slate-900 border border-slate-700 text-teal-400 font-mono text-left px-2 py-1 rounded w-32 focus:border-teal-500 outline-none"
                            />
                          </td>

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="flex flex-col gap-6">
            
            {/* Dynamic Formula Builder & Simulator */}
            <div className={`p-5 rounded-2xl border ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center gap-2 mb-4">
                <Settings2 className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-black text-slate-200">فرمول‌ساز داینامیک و شبیه‌ساز</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-300">فرمول محاسباتی (JavaScript Valid)</label>
                  <p className="text-[10px] text-slate-400">متغیرهای مجاز: <code className="text-teal-300 bg-slate-900 px-1 rounded">baseAmount</code>, <code className="text-teal-300 bg-slate-900 px-1 rounded">multiplier</code>, <code className="text-teal-300 bg-slate-900 px-1 rounded">score</code></p>
                  <textarea
                    value={config.formula || 'baseAmount * multiplier'}
                    onChange={e => setConfig({ ...config, formula: e.target.value })}
                    className="w-full h-24 bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm font-mono text-emerald-400 focus:outline-none focus:border-purple-500 text-left"
                    dir="ltr"
                    placeholder="مثال: (score / 100) * baseAmount * multiplier"
                  />
                </div>
                <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <h4 className="text-sm font-bold text-slate-300 mb-2 border-b border-slate-800 pb-2">شبیه‌ساز آنی</h4>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-400">نمره فرضی (score)</label>
                      <input id="sim-score" type="number" defaultValue="85" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm text-slate-200" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-400">مبلغ پایه (baseAmount)</label>
                      <input id="sim-base" type="number" defaultValue="10000000" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm text-slate-200" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-400">ضریب (multiplier)</label>
                      <input id="sim-mult" type="number" defaultValue="1.2" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm text-slate-200" />
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400">نتیجه شبیه‌سازی:</span>
                    <button type="button" onClick={() => {
                      const score = Number((document.getElementById('sim-score') as HTMLInputElement).value) || 0;
                      const baseAmount = Number((document.getElementById('sim-base') as HTMLInputElement).value) || 0;
                      const multiplier = Number((document.getElementById('sim-mult') as HTMLInputElement).value) || 0;
                      const res = evaluateNumericFormula(config.formula || 'baseAmount * multiplier', { score, baseAmount, multiplier });
                      alert('نتیجه فرمول: ' + new Intl.NumberFormat('fa-IR').format(res) + ' ریال');
                    }} className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg transition-colors">
                      محاسبه کن
                    </button>
                  </div>
                </div>
              </div>
            </div>

            
            {/* Editable Matrix View */}
            <div className={`p-5 rounded-2xl border overflow-x-auto ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
               <div className="flex items-center justify-between mb-4">
                 <h3 className="text-lg font-black text-slate-200">ماتریس پرداختی‌ها (ویرایش سریع)</h3>
                 <button 
                   onClick={handleSaveConfig}
                   disabled={isSaving}
                   className="px-4 py-1.5 bg-teal-500 hover:bg-teal-600 text-slate-900 text-xs font-bold rounded-lg transition-colors flex items-center gap-2"
                 >
                   <Save className="w-4 h-4" /> ذخیره ماتریس
                 </button>
               </div>
               <table className="w-full text-right text-sm">
                 <thead className="bg-slate-800/80 text-slate-300">
                   <tr>
                     <th className="px-4 py-2 font-bold">خانواده شغلی / بازه عملکرد</th>
                     <th className="px-4 py-2 font-bold text-center border-l border-slate-700/50">مبلغ پایه (ریال)</th>
                     {config.multipliers.map((m, i) => (
                       <th key={i} className="px-4 py-2 text-center text-xs font-bold text-slate-400">
                         {m.minScore} تا {m.maxScore} <br />
                         <input 
                           type="number"
                           step="0.1"
                           value={m.multiplier}
                           onChange={(e) => {
                             const newMults = [...config.multipliers];
                             newMults[i].multiplier = Number(e.target.value);
                             setConfig({...config, multipliers: newMults});
                           }}
                           className="w-16 mt-1 bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-center text-emerald-400 font-mono text-sm focus:border-teal-500 outline-none"
                         />
                         <span className="text-emerald-400 ml-1">x</span>
                       </th>
                     ))}
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-800/60">
                   {config.coefficients.map((c, i) => (
                     <tr key={i} className="hover:bg-slate-800/30">
                       <td className="px-4 py-3 font-bold text-slate-200">{c.jobFamily}</td>
                       <td className="px-4 py-3 border-l border-slate-700/50 text-center">
                         <input 
                           type="number"
                           value={c.baseAmount}
                           onChange={(e) => {
                             const newCoefs = [...config.coefficients];
                             newCoefs[i].baseAmount = Number(e.target.value);
                             setConfig({...config, coefficients: newCoefs});
                           }}
                           className="w-32 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-center text-slate-200 font-mono focus:border-teal-500 outline-none"
                         />
                       </td>
                       {config.multipliers.map((m, j) => {
                         const val = evaluateNumericFormula(config.formula || 'baseAmount * multiplier', { score: (m.maxScore+m.minScore)/2, baseAmount: c.baseAmount, multiplier: m.multiplier });
                         return (
                           <td key={j} className="px-4 py-3 text-center text-slate-400 font-mono text-[13px]">
                             {new Intl.NumberFormat('fa-IR').format(val)}
                           </td>
                         )
                       })}
                     </tr>
                   ))}
                 </tbody>
               </table>
            </div>


            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Base Amounts */}
              <div className={`p-5 rounded-2xl border ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-black text-slate-200 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-400" />
                    مبالغ پایه پاداش (گروه شغلی)
                  </h3>
                  <button 
                    onClick={() => setConfig(prev => ({ ...prev, coefficients: [...prev.coefficients, { jobFamily: '', baseAmount: 0 }] }))}
                    className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded hover:bg-blue-500/20 text-xs font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> افزودن گروه
                  </button>
                </div>
                
                <div className="space-y-3">
                  {config.coefficients.map((coef, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold">خانواده شغلی / نقش (all = پیش‌فرض)</label>
                        <input 
                          type="text" 
                          value={coef.jobFamily}
                          onChange={e => {
                            const newCoefs = [...config.coefficients];
                            newCoefs[i].jobFamily = e.target.value;
                            setConfig({ ...config, coefficients: newCoefs });
                          }}
                          placeholder="all یا نام دپارتمان"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold">مبلغ پایه (ریال)</label>
                        <input 
                          type="number" 
                          value={coef.baseAmount}
                          onChange={e => {
                            const newCoefs = [...config.coefficients];
                            newCoefs[i].baseAmount = Number(e.target.value);
                            setConfig({ ...config, coefficients: newCoefs });
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none font-mono"
                        />
                      </div>
                      {config.coefficients.length > 1 && (
                        <button 
                          onClick={() => {
                            const newCoefs = config.coefficients.filter((_, idx) => idx !== i);
                            setConfig({ ...config, coefficients: newCoefs });
                          }}
                          className="p-2 mt-5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-4 leading-relaxed">
                  مبلغ پایه پاداش به ازای رده‌های شغلی مختلف تعیین می‌شود. در صورتی که کارمندی در هیچ‌یک از دسته‌ها قرار نگیرد، ضریب دارای مقدار `all` برای او در نظر گرفته خواهد شد.
                </p>
              </div>

              {/* Multipliers */}
              <div className={`p-5 rounded-2xl border ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-black text-slate-200 flex items-center gap-2">
                    <ArrowDownToLine className="w-5 h-5 text-emerald-400" />
                    ضرایب عملکردی (مبتنی بر نمره)
                  </h3>
                  <button 
                    onClick={() => setConfig(prev => ({ ...prev, multipliers: [...prev.multipliers, { minScore: 0, maxScore: 0, multiplier: 1 }] }))}
                    className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded hover:bg-emerald-500/20 text-xs font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> افزودن بازه
                  </button>
                </div>
                
                <div className="space-y-3">
                  {config.multipliers.map((mult, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                      <div className="w-1/4 space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold">از نمره</label>
                        <input 
                          type="number" 
                          value={mult.minScore}
                          onChange={e => {
                            const newMults = [...config.multipliers];
                            newMults[i].minScore = Number(e.target.value);
                            setConfig({ ...config, multipliers: newMults });
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-sm text-center text-slate-200 focus:border-emerald-500 focus:outline-none font-mono"
                        />
                      </div>
                      <div className="w-1/4 space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold">تا نمره</label>
                        <input 
                          type="number" 
                          value={mult.maxScore}
                          onChange={e => {
                            const newMults = [...config.multipliers];
                            newMults[i].maxScore = Number(e.target.value);
                            setConfig({ ...config, multipliers: newMults });
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-sm text-center text-slate-200 focus:border-emerald-500 focus:outline-none font-mono"
                        />
                      </div>
                      <div className="w-2/4 space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold">ضریب اعمالی</label>
                        <input 
                          type="number" 
                          step="0.1"
                          value={mult.multiplier}
                          onChange={e => {
                            const newMults = [...config.multipliers];
                            newMults[i].multiplier = Number(e.target.value);
                            setConfig({ ...config, multipliers: newMults });
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-sm text-center text-slate-200 focus:border-emerald-500 focus:outline-none font-mono"
                        />
                      </div>
                      {config.multipliers.length > 1 && (
                        <button 
                          onClick={() => {
                            const newMults = config.multipliers.filter((_, idx) => idx !== i);
                            setConfig({ ...config, multipliers: newMults });
                          }}
                          className="p-2 mt-5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

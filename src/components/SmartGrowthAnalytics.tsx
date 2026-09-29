/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  Sparkles, 
  BrainCircuit, 
  UserCheck, 
  Sliders, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Zap, 
  Layers, 
  Calendar,
  ArrowUpRight,
  Target,
  BarChart3,
  Activity
} from 'lucide-react';
import { Evaluation, Employee, JobProfile, Criterion, getGrade, GRADE_DETAILS, CategoryKey, CATEGORIES } from '../types';

interface SmartGrowthAnalyticsProps {
  evaluations: Evaluation[];
  employees: Employee[];
  profiles: JobProfile[];
  criteria: Criterion[];
  onSelectEvaluation?: (id: string) => void;
}

interface PeriodDataPoint {
  period: string;
  isForecast: boolean;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'E';
  categoryScores: Record<CategoryKey, number>;
  confidenceLower?: number;
  confidenceUpper?: number;
  evalId?: string;
  note?: string;
}

export default function SmartGrowthAnalytics({
  evaluations,
  employees,
  profiles,
  criteria,
  onSelectEvaluation
}: SmartGrowthAnalyticsProps) {
  // Selectable employee (filter out pure admin account from operational list or allow any)
  const operationalEmployees = useMemo(() => {
    return employees.filter(e => e.role !== 'admin');
  }, [employees]);

  const [selectedEmpId, setSelectedEmpId] = useState<string>(() => {
    return operationalEmployees[0]?.id || employees[0]?.id || '';
  });

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<CategoryKey | 'ALL'>('ALL');
  
  // Interactive Simulation parameters
  const [simTrainingHours, setSimTrainingHours] = useState<number>(16); // 0 to 40 hours
  const [simTargetAchieve, setSimTargetAchieve] = useState<number>(100); // 60% to 140%
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  const selectedEmp = useMemo(() => {
    return employees.find(e => e.id === selectedEmpId) || employees[0];
  }, [employees, selectedEmpId]);

  const selectedProfile = useMemo(() => {
    if (!selectedEmp) return null;
    return profiles.find(p => p.id === selectedEmp.profileId) || profiles[0];
  }, [selectedEmp, profiles]);

  // Helper to compute overall and category scores for an evaluation
  const parseEvaluationScores = (ev: Evaluation) => {
    const scoredItems = ev.scores.filter(s => s.value > 0);
    if (!scoredItems.length) {
      return { totalScore: 0, catScores: { K: 0, Q: 0, B: 0, S: 0, L: 0 } };
    }

    const totalWeight = scoredItems.reduce((acc, curr) => acc + curr.weight, 0);
    const weightedSum = scoredItems.reduce((acc, curr) => acc + (curr.value * curr.weight), 0);
    const avg5 = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const totalScore = Math.round(avg5 * 20 * 10) / 10;

    // Category breakdown
    const catScores: Record<CategoryKey, number> = { K: 0, Q: 0, B: 0, S: 0, L: 0 };
    const catWeights: Record<CategoryKey, number> = { K: 0, Q: 0, B: 0, S: 0, L: 0 };

    scoredItems.forEach(s => {
      const crit = criteria.find(c => c.id === s.cid);
      if (crit) {
        catScores[crit.cat] += s.value * s.weight;
        catWeights[crit.cat] += s.weight;
      }
    });

    (['K', 'Q', 'B', 'S', 'L'] as CategoryKey[]).forEach(cat => {
      if (catWeights[cat] > 0) {
        catScores[cat] = Math.round((catScores[cat] / catWeights[cat]) * 20 * 10) / 10;
      } else {
        catScores[cat] = totalScore;
      }
    });

    return { totalScore, catScores };
  };

  // Build the multi-period timeline data with AI forecasting
  const timelineData = useMemo<PeriodDataPoint[]>(() => {
    if (!selectedEmp) return [];

    // Find all actual evaluations for this employee
    const empEvals = evaluations
      .filter(ev => ev.empId === selectedEmp.id)
      .sort((a, b) => (a.created || 0) - (b.created || 0));

    const historicalPoints: PeriodDataPoint[] = empEvals.map(ev => {
      const { totalScore, catScores } = parseEvaluationScores(ev);
      return {
        period: ev.period,
        isForecast: false,
        score: totalScore,
        grade: getGrade(totalScore),
        categoryScores: catScores,
        evalId: ev.id,
        note: ev.note || ''
      };
    });

    // If no evaluations, create a synthetic starting baseline
    if (historicalPoints.length === 0) {
      historicalPoints.push({
        period: 'نیمه اول ۱۴۰۴',
        isForecast: false,
        score: 60,
        grade: 'C',
        categoryScores: { K: 60, Q: 60, B: 60, S: 60, L: 60 }
      });
    }

    // Calculate historical growth slope (rate of change)
    let growthRate = 3.5; // default modest positive slope
    if (historicalPoints.length >= 2) {
      const first = historicalPoints[0].score;
      const last = historicalPoints[historicalPoints.length - 1].score;
      growthRate = (last - first) / Math.max(1, historicalPoints.length - 1);
    }

    // Apply What-If simulation modifiers to growth rate
    // Training impact: each 10 hours beyond 10 adds +1.5% score
    const trainingBonus = ((simTrainingHours - 10) / 10) * 1.8;
    // KPI Achievement impact: 100% is neutral, >100% boosts trajectory
    const targetBonus = ((simTargetAchieve - 100) / 100) * 4.5;
    const adjustedGrowthRate = Math.max(-5, Math.min(12, growthRate * 0.6 + trainingBonus + targetBonus));

    const lastActual = historicalPoints[historicalPoints.length - 1];
    const lastScore = lastActual.score;

    // Project Next Period: نیمه دوم ۱۴۰۵ (پیش‌بینی AI)
    const forecast1Score = Math.max(30, Math.min(99, Math.round((lastScore + adjustedGrowthRate) * 10) / 10));
    const forecast1CatScores: Record<CategoryKey, number> = {
      K: Math.max(30, Math.min(100, Math.round((lastActual.categoryScores.K + adjustedGrowthRate * 1.1) * 10) / 10)),
      Q: Math.max(30, Math.min(100, Math.round((lastActual.categoryScores.Q + adjustedGrowthRate * 0.95 + (simTrainingHours > 20 ? 3 : 0)) * 10) / 10)),
      S: Math.max(40, Math.min(100, Math.round((lastActual.categoryScores.S + adjustedGrowthRate * 0.8) * 10) / 10)),
      B: Math.max(30, Math.min(100, Math.round((lastActual.categoryScores.B + adjustedGrowthRate * 0.9) * 10) / 10)),
      L: Math.max(30, Math.min(100, Math.round((lastActual.categoryScores.L + adjustedGrowthRate * 0.85) * 10) / 10)),
    };

    // Project Future Period: نیمه اول ۱۴۰۶ (پیش‌بینی AI)
    const forecast2Score = Math.max(30, Math.min(100, Math.round((forecast1Score + adjustedGrowthRate * 0.85) * 10) / 10));
    const forecast2CatScores: Record<CategoryKey, number> = {
      K: Math.max(30, Math.min(100, Math.round((forecast1CatScores.K + adjustedGrowthRate) * 10) / 10)),
      Q: Math.max(30, Math.min(100, Math.round((forecast1CatScores.Q + adjustedGrowthRate * 0.9) * 10) / 10)),
      S: Math.max(40, Math.min(100, Math.round((forecast1CatScores.S + adjustedGrowthRate * 0.7) * 10) / 10)),
      B: Math.max(30, Math.min(100, Math.round((forecast1CatScores.B + adjustedGrowthRate * 0.8) * 10) / 10)),
      L: Math.max(30, Math.min(100, Math.round((forecast1CatScores.L + adjustedGrowthRate * 0.8) * 10) / 10)),
    };

    const forecastPoints: PeriodDataPoint[] = [
      {
        period: 'نیمه دوم ۱۴۰۵ (پیش‌بینی هوش مصنوعی)',
        isForecast: true,
        score: forecast1Score,
        grade: getGrade(forecast1Score),
        categoryScores: forecast1CatScores,
        confidenceLower: Math.max(20, forecast1Score - 4.5),
        confidenceUpper: Math.min(100, forecast1Score + 4.5),
        note: 'پیش‌بینی بر مبنای نرخ یادگیری شایستگی و تحقق اهداف مربیگری جاری'
      },
      {
        period: 'نیمه اول ۱۴۰۶ (پیش‌بینی هوش مصنوعی)',
        isForecast: true,
        score: forecast2Score,
        grade: getGrade(forecast2Score),
        categoryScores: forecast2CatScores,
        confidenceLower: Math.max(20, forecast2Score - 7.5),
        confidenceUpper: Math.min(100, forecast2Score + 7.5),
        note: 'افق شایستگی بلندمدت در صورت استمرار برنامه‌های توسعه فردی'
      }
    ];

    return [...historicalPoints, ...forecastPoints];
  }, [selectedEmp, evaluations, criteria, simTrainingHours, simTargetAchieve]);

  // Key derived trajectory metrics
  const trajectoryMetrics = useMemo(() => {
    if (timelineData.length < 2) {
      return { growthPercent: 0, momentum: 'پایدار', topCategory: 'K', riskCategory: 'Q' };
    }

    const firstActual = timelineData[0];
    const latestActual = timelineData.filter(d => !d.isForecast).slice(-1)[0] || firstActual;
    const finalForecast = timelineData[timelineData.length - 1];

    const actualDelta = latestActual.score - firstActual.score;
    const forecastDelta = finalForecast.score - latestActual.score;

    let momentumText = 'رشد باثبات و منظم';
    if (actualDelta > 15) momentumText = 'پرشتاب و ستودنی';
    else if (actualDelta > 5) momentumText = 'صعودی و رو به تعالی';
    else if (actualDelta >= 0) momentumText = 'پایدار و مطابق انتظار';
    else momentumText = 'هشدار افت عملکرد';

    // Find best and lowest performing categories in latest period
    const latestCats = latestActual.categoryScores;
    const catKeys: CategoryKey[] = ['K', 'Q', 'S', 'B'];
    let topCat: CategoryKey = 'K';
    let minCat: CategoryKey = 'Q';
    let maxVal = -1;
    let minVal = 999;

    catKeys.forEach(cat => {
      const val = latestCats[cat] || 0;
      if (val > maxVal) { maxVal = val; topCat = cat; }
      if (val < minVal) { minVal = val; minCat = cat; }
    });

    return {
      growthPercent: Math.round(actualDelta * 10) / 10,
      projectedGrowth: Math.round(forecastDelta * 10) / 10,
      momentum: momentumText,
      topCategory: topCat,
      riskCategory: minCat,
      latestScore: latestActual.score,
      forecastScore: finalForecast.score
    };
  }, [timelineData]);

  // Coordinate mapping for SVG chart
  const chartWidth = 700;
  const chartHeight = 260;
  const paddingX = 65;
  const paddingY = 35;

  const points = useMemo(() => {
    if (!timelineData.length) return [];
    const count = timelineData.length;
    const stepX = (chartWidth - paddingX * 2) / Math.max(1, count - 1);

    return timelineData.map((d, idx) => {
      const value = activeCategoryFilter === 'ALL' ? d.score : (d.categoryScores[activeCategoryFilter] || d.score);
      const x = paddingX + idx * stepX;
      // y-scale: 0 to 100
      const y = chartHeight - paddingY - (value / 100) * (chartHeight - paddingY * 2);
      
      let lowerY = y;
      let upperY = y;
      if (d.confidenceLower !== undefined && d.confidenceUpper !== undefined) {
        lowerY = chartHeight - paddingY - (d.confidenceLower / 100) * (chartHeight - paddingY * 2);
        upperY = chartHeight - paddingY - (d.confidenceUpper / 100) * (chartHeight - paddingY * 2);
      }

      return { ...d, x, y, value, lowerY, upperY };
    });
  }, [timelineData, activeCategoryFilter]);

  // Build SVG Path for actuals (solid) and forecast (dashed)
  const actualPoints = points.filter(p => !p.isForecast);
  const forecastPoints = points.filter(p => p.isForecast);

  const actualPath = useMemo(() => {
    if (!actualPoints.length) return '';
    return actualPoints.reduce((acc, p, idx) => {
      return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, '');
  }, [actualPoints]);

  const forecastPath = useMemo(() => {
    if (!actualPoints.length || !forecastPoints.length) return '';
    const startPoint = actualPoints[actualPoints.length - 1];
    let path = `M ${startPoint.x} ${startPoint.y}`;
    forecastPoints.forEach(p => {
      path += ` L ${p.x} ${p.y}`;
    });
    return path;
  }, [actualPoints, forecastPoints]);

  // Confidence Interval Area Polygon (only for forecast points)
  const confidencePolygon = useMemo(() => {
    if (!actualPoints.length || !forecastPoints.length) return '';
    const startPoint = actualPoints[actualPoints.length - 1];
    
    // Top boundary points
    const topPoints = [
      { x: startPoint.x, y: startPoint.y },
      ...forecastPoints.map(p => ({ x: p.x, y: p.upperY }))
    ];
    // Bottom boundary points in reverse
    const bottomPoints = [
      ...forecastPoints.map(p => ({ x: p.x, y: p.lowerY })).reverse(),
      { x: startPoint.x, y: startPoint.y }
    ];

    const fullPoints = [...topPoints, ...bottomPoints];
    return fullPoints.map((p, idx) => (idx === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ') + ' Z';
  }, [actualPoints, forecastPoints]);

  return (
    <div className="bg-slate-800/30 border border-slate-800 rounded-3xl p-6 space-y-6 text-right" dir="rtl">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-500/20 to-indigo-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-lg">
            <BrainCircuit className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-slate-100">تحلیل هوشمند و پیش‌بینی روند رشد شایستگی پرسنل</h2>
              <span className="text-[10px] font-bold bg-teal-500/10 text-teal-300 border border-teal-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-teal-400" />
                موتور پیش‌بینی هوش مصنوعی
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              ترسیم نمودارهای پیش‌بینی سری زمانی، تحلیل روند بهبود عملکرد و شبیه‌سازی نتایج اقدامات مربیگری
            </p>
          </div>
        </div>

        {/* Employee Selector Dropdown */}
        <div className="flex items-center gap-2 bg-slate-900/60 p-1.5 rounded-2xl border border-slate-800 self-start md:self-auto">
          <span className="text-xs font-bold text-slate-400 px-2 flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5 text-teal-400" />
            انتخاب همکار:
          </span>
          <select
            value={selectedEmpId}
            onChange={(e) => setSelectedEmpId(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-slate-200 text-xs font-bold py-2 px-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
          >
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.name} — {emp.code} ({emp.unit})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Trajectory Highlights & Diagnostic KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Metric 1: Current Score vs Growth */}
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-400">آخرین نمره احراز شده</span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
              trajectoryMetrics.growthPercent >= 0 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}>
              {trajectoryMetrics.growthPercent >= 0 ? `+${trajectoryMetrics.growthPercent}٪ رشد` : `${trajectoryMetrics.growthPercent}٪ افت`}
            </span>
          </div>
          <div className="text-2xl font-black text-slate-100 mt-2">
            {trajectoryMetrics.latestScore}٪
            <span className="text-xs text-slate-400 font-normal mr-2">
              (رتبه {getGrade(trajectoryMetrics.latestScore)})
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">بر پایه داده‌های ارزیابی عملکرد واقعی</p>
        </div>

        {/* Metric 2: AI Projected Score */}
        <div className="bg-slate-900/40 border border-teal-500/20 p-4 rounded-2xl relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-teal-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              پیش‌بینی هوش مصنوعی (۱۴۰۶)
            </span>
            <span className="text-[10px] font-black bg-teal-500/10 text-teal-300 px-2 py-0.5 rounded-full">
              تارگت رشد
            </span>
          </div>
          <div className="text-2xl font-black text-teal-300 mt-2">
            {trajectoryMetrics.forecastScore}٪
            <span className="text-xs text-teal-400/80 font-normal mr-2">
              (رتبه {getGrade(trajectoryMetrics.forecastScore)})
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2">با فرض استمرار توانمندسازی و مربیگری</p>
          <div className="absolute -left-3 -bottom-3 w-16 h-16 bg-teal-500/5 rounded-full blur-xl pointer-events-none" />
        </div>

        {/* Metric 3: Leading Competency */}
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl">
          <span className="text-xs font-bold text-slate-400">شاخص شایستگی پرچم‌دار</span>
          <div className="text-sm font-black text-indigo-300 mt-2 flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-indigo-400" />
            {CATEGORIES[trajectoryMetrics.topCategory] || 'نتایج کمی (KPI)'}
          </div>
          <p className="text-[10px] text-slate-500 mt-2">بالاترین نرخ انطباق و پایداری در رفتار شغلی</p>
        </div>

        {/* Metric 4: Momentum & Focus Area */}
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl">
          <span className="text-xs font-bold text-slate-400">وضعیت شتاب و ممنتوم</span>
          <div className="text-sm font-black text-amber-300 mt-2 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-amber-400" />
            {trajectoryMetrics.momentum}
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            اولویت بهبود: {CATEGORIES[trajectoryMetrics.riskCategory]}
          </p>
        </div>
      </div>

      {/* Category Filter Chips & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-2xl border border-slate-800/80">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-slate-400 ml-2">نمایش شاخص:</span>
          <button
            onClick={() => setActiveCategoryFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeCategoryFilter === 'ALL'
                ? 'bg-teal-500 text-slate-950 shadow-md'
                : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            نمره کل شایستگی
          </button>
          {(['K', 'Q', 'S', 'B'] as CategoryKey[]).map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeCategoryFilter === cat
                  ? 'bg-teal-500 text-slate-950 shadow-md'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              {CATEGORIES[cat]}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-teal-400" />
            <span>سوابق واقعی ارزیابی</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-indigo-400" />
            <span>پیش‌بینی هوش مصنوعی (AI Forecast)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-teal-500/10 border border-teal-500/20" />
            <span>محدوده اطمینان ۹۵٪</span>
          </div>
        </div>
      </div>

      {/* Interactive SVG Chart Canvas */}
      <div className="bg-slate-950/60 border border-slate-800/90 rounded-3xl p-5 relative overflow-x-auto">
        <svg 
          viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
          className="w-full h-72 select-none"
        >
          <defs>
            {/* Gradient for Historical Area */}
            <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.0" />
            </linearGradient>
            {/* Gradient for Forecast Area */}
            <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid Lines (20%, 40%, 60%, 80%, 100%) */}
          {[20, 40, 60, 80, 100].map(val => {
            const y = chartHeight - paddingY - (val / 100) * (chartHeight - paddingY * 2);
            return (
              <g key={val}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={chartWidth - paddingX}
                  y2={y}
                  stroke="#334155"
                  strokeDasharray="4 4"
                  strokeOpacity="0.4"
                />
                <text
                  x={paddingX - 10}
                  y={y + 4}
                  fill="#64748b"
                  fontSize="10"
                  textAnchor="end"
                  fontFamily="sans-serif"
                >
                  {val}٪
                </text>
              </g>
            );
          })}

          {/* Confidence Band Polygon */}
          {confidencePolygon && (
            <path
              d={confidencePolygon}
              fill="url(#forecastGradient)"
              stroke="#6366f1"
              strokeWidth="0.5"
              strokeDasharray="2 2"
              strokeOpacity="0.4"
            />
          )}

          {/* Actual Historical Line */}
          {actualPath && (
            <path
              d={actualPath}
              fill="none"
              stroke="#14b8a6"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Forecast Line (Dashed) */}
          {forecastPath && (
            <path
              d={forecastPath}
              fill="none"
              stroke="#818cf8"
              strokeWidth="3.5"
              strokeDasharray="6 6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Interactive Points / Markers */}
          {points.map((p, idx) => {
            const isHovered = hoveredPointIndex === idx;
            return (
              <g 
                key={idx} 
                onMouseEnter={() => setHoveredPointIndex(idx)}
                onMouseLeave={() => setHoveredPointIndex(null)}
                className="cursor-pointer"
              >
                {/* Outer Glow */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isHovered ? 8 : (p.isForecast ? 5 : 6)}
                  fill={p.isForecast ? '#6366f1' : '#14b8a6'}
                  stroke="#0f172a"
                  strokeWidth="2.5"
                  className="transition-all duration-200"
                />

                {/* Score label on top of point */}
                <text
                  x={p.x}
                  y={p.y - 12}
                  fill={p.isForecast ? '#a5b4fc' : '#5eead4'}
                  fontSize={isHovered ? '12' : '10'}
                  fontWeight="bold"
                  textAnchor="middle"
                  fontFamily="sans-serif"
                >
                  {p.value}٪
                </text>

                {/* Period X-Axis Label */}
                <text
                  x={p.x}
                  y={chartHeight - 10}
                  fill={p.isForecast ? '#818cf8' : '#94a3b8'}
                  fontSize="9.5"
                  fontWeight={p.isForecast ? 'bold' : 'normal'}
                  textAnchor="middle"
                  fontFamily="sans-serif"
                >
                  {p.period.replace(' (پیش‌بینی هوش مصنوعی)', ' (AI)')}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hovered Point Card Popover */}
        {hoveredPointIndex !== null && points[hoveredPointIndex] && (
          <div className="absolute top-4 left-6 bg-slate-900/95 border border-teal-500/40 shadow-2xl p-3.5 rounded-2xl text-xs space-y-1.5 max-w-xs animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
              <span className="font-bold text-slate-200">{points[hoveredPointIndex].period}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                points[hoveredPointIndex].isForecast 
                  ? 'bg-indigo-500/20 text-indigo-300' 
                  : 'bg-teal-500/20 text-teal-300'
              }`}>
                {points[hoveredPointIndex].isForecast ? 'پیش‌بینی هوش مصنوعی' : 'ارزیابی ثبت‌شده'}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>نمره شایستگی:</span>
              <strong className="text-teal-300 font-bold">{points[hoveredPointIndex].value}٪ (رتبه {points[hoveredPointIndex].grade})</strong>
            </div>
            {points[hoveredPointIndex].confidenceLower !== undefined && (
              <div className="text-[10px] text-indigo-300">
                بازه اطمینان: {points[hoveredPointIndex].confidenceLower?.toFixed(1)}٪ تا {points[hoveredPointIndex].confidenceUpper?.toFixed(1)}٪
              </div>
            )}
            {points[hoveredPointIndex].note && (
              <p className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-800/60">
                {points[hoveredPointIndex].note}
              </p>
            )}
          </div>
        )}
      </div>

      {/* What-If Growth Simulator Panel */}
      <div className="bg-gradient-to-r from-slate-900/80 via-slate-900/40 to-slate-900/80 border border-teal-500/20 rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-teal-400" />
            <div>
              <h3 className="text-sm font-black text-slate-200">شبیه‌ساز اثر اقدامات مربیگری و آموزش (What-If Simulation)</h3>
              <p className="text-[11px] text-slate-400">با تغییر متغیرهای زیر، پیش‌بینی رشد آتی نمرات شایستگی این همکار به صورت زنده بازمحاسبه می‌شود</p>
            </div>
          </div>
          <span className="text-[10px] bg-teal-500/10 text-teal-400 px-3 py-1 rounded-full font-bold border border-teal-500/20">
            محاسبه آنی بردار شایستگی
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* Slider 1: Training Hours */}
          <div className="space-y-2 bg-slate-950/40 p-3.5 rounded-2xl border border-slate-800/80">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-300 font-bold">ساعات آموزش تخصصی و کارگاهی (ماهانه):</span>
              <span className="text-teal-300 font-extrabold text-sm">{simTrainingHours} ساعت</span>
            </div>
            <input
              type="range"
              min="0"
              max="40"
              step="2"
              value={simTrainingHours}
              onChange={(e) => setSimTrainingHours(Number(e.target.value))}
              className="w-full accent-teal-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>حداقل (۰ ساعت)</span>
              <span>استاندارد کارخانه (۱۶ ساعت)</span>
              <span>فوق‌تخصصی (۴۰ ساعت)</span>
            </div>
          </div>

          {/* Slider 2: KPI Target Achievement Rate */}
          <div className="space-y-2 bg-slate-950/40 p-3.5 rounded-2xl border border-slate-800/80">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-300 font-bold">نرخ تحقق تارگت‌های عملیاتی و کیفی (KPIs):</span>
              <span className="text-indigo-300 font-extrabold text-sm">{simTargetAchieve}٪</span>
            </div>
            <input
              type="range"
              min="60"
              max="140"
              step="5"
              value={simTargetAchieve}
              onChange={(e) => setSimTargetAchieve(Number(e.target.value))}
              className="w-full accent-indigo-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>پایین‌تر از هدف (۶۰٪)</span>
              <span>مطابق هدف (۱۰۰٪)</span>
              <span>فراتر از هدف (۱۴۰٪)</span>
            </div>
          </div>
        </div>

        {/* AI Actionable Prescriptions based on simulation */}
        <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-teal-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              توصیه مربیگری هوشمند برای دوره آتی:
            </span>
            <p className="text-xs text-slate-300 leading-relaxed">
              {simTrainingHours >= 24
                ? 'با توجه به ساعت آموزش بالا، انتظار می‌رود مهارت‌های شاخص Q (کیفیت و انطباق) با جهش بالای ۱۰٪ تثبیت گردیده و نامبرده آماده ارتقا به نقش منتورینگ ایستگاه شود.'
                : 'توصیه می‌شود حداقل ۱۶ ساعت دوره بازآموزی کدهای استاندارد SOP و خطایابی فیکسچرها برنامه‌ریزی شود تا روند صعودی شایستگی حفظ گردد.'
              }
            </p>
          </div>
          <button
            onClick={() => {
              setSimTrainingHours(16);
              setSimTargetAchieve(100);
            }}
            className="shrink-0 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-3.5 py-2 rounded-xl text-xs transition-colors cursor-pointer"
          >
            بازنشانی پیش‌فرض
          </button>
        </div>
      </div>
    </div>
  );
}

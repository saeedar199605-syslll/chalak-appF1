/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Formula Engine & KPI Auto-Calculation Module
 * Handles safe mathematical expression evaluation, variable substitutions,
 * threshold mapping to 1-5 scale, and validation.
 */

import { Criterion, KpiCalculationType, KpiScoreThresholds } from '../types';

export interface EvaluationFormulaResult {
  computedValue: number;       // Raw calculated value (e.g. 102.5%)
  score: number;               // Standard 1 to 5 rating
  status: 'excellent' | 'good' | 'acceptable' | 'warning' | 'critical';
  statusLabel: string;
  summaryText: string;
  error?: string;
}

/**
 * Default standard thresholds for KPI scoring
 */
export const DEFAULT_KPI_THRESHOLDS: KpiScoreThresholds = {
  score5: 105, // >= 105% => Score 5 (Outstanding)
  score4: 95,  // >= 95%  => Score 4 (Exceeds Target)
  score3: 85,  // >= 85%  => Score 3 (Meets Target)
  score2: 70,  // >= 70%  => Score 2 (Needs Improvement)
  // < 70% => Score 1 (Unacceptable)
};

/**
 * Reverse thresholds for metrics where lower is better (e.g. scrap percentage, cycle time delay)
 */
export const DEFAULT_INVERSE_THRESHOLDS: KpiScoreThresholds = {
  score5: 1.0,  // <= 1.0% scrap => Score 5
  score4: 2.5,  // <= 2.5% scrap => Score 4
  score3: 5.0,  // <= 5.0% scrap => Score 3
  score2: 8.0,  // <= 8.0% scrap => Score 2
  // > 8% => Score 1
};

/**
 * Safely evaluates a basic mathematical expression with variable substitution
 * Supports +, -, *, /, %, ^, (, ), numbers and variable identifiers.
 * Prevents arbitrary code execution without using eval().
 */
export function safeEvaluateMath(expression: string, variables: Record<string, number>): { result: number; error?: string } {
  try {
    if (!expression || !expression.trim()) {
      return { result: 0, error: 'فرمول خالی است.' };
    }
    const source = expression.trim();
    const normalizedVariables = new Map(
      Object.entries(variables).map(([key, value]) => [key.toLowerCase(), value])
    );
    let cursor = 0;

    const fail = (message: string): never => { throw new Error(message); };
    const skipWhitespace = () => {
      while (/\s/.test(source[cursor] || '')) cursor += 1;
    };
    const consume = (token: string) => {
      skipWhitespace();
      if (source[cursor] !== token) return false;
      cursor += 1;
      return true;
    };
    const assertFinite = (value: number) => {
      if (!Number.isFinite(value)) fail('نتیجه فرمول عدد معتبر و متناهی نیست.');
      return value;
    };

    const parsePrimary = (): number => {
      skipWhitespace();
      if (consume('(')) {
        const value = parseExpression();
        if (!consume(')')) fail('پرانتز فرمول بسته نشده است.');
        return value;
      }
      const remaining = source.slice(cursor);
      const numberMatch = remaining.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
      if (numberMatch) {
        cursor += numberMatch[0].length;
        return assertFinite(Number(numberMatch[0]));
      }
      const identifierMatch = remaining.match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (identifierMatch) {
        cursor += identifierMatch[0].length;
        const key = identifierMatch[0].toLowerCase();
        if (!normalizedVariables.has(key)) fail(`متغیر «${identifierMatch[0]}» تعریف نشده است.`);
        const value = normalizedVariables.get(key);
        if (typeof value !== 'number' || !Number.isFinite(value)) fail(`مقدار متغیر «${identifierMatch[0]}» معتبر نیست.`);
        return value;
      }
      fail('فرمول دارای نویسه یا عبارت غیرمجاز است.');
    };

    const parseUnary = (): number => {
      if (consume('+')) return parseUnary();
      if (consume('-')) return -parseUnary();
      return parsePrimary();
    };
    const parsePower = (): number => {
      const left = parseUnary();
      return consume('^') ? assertFinite(Math.pow(left, parsePower())) : left;
    };
    const parseTerm = (): number => {
      let value = parsePower();
      while (true) {
        if (consume('*')) value = assertFinite(value * parsePower());
        else if (consume('/')) {
          const divisor = parsePower();
          if (divisor === 0) fail('تقسیم بر صفر مجاز نیست.');
          value = assertFinite(value / divisor);
        } else if (consume('%')) {
          const divisor = parsePower();
          if (divisor === 0) fail('باقی‌مانده بر صفر مجاز نیست.');
          value = assertFinite(value % divisor);
        } else break;
      }
      return value;
    };
    const parseExpression = (): number => {
      let value = parseTerm();
      while (true) {
        if (consume('+')) value = assertFinite(value + parseTerm());
        else if (consume('-')) value = assertFinite(value - parseTerm());
        else break;
      }
      return value;
    };

    const result = parseExpression();
    skipWhitespace();
    if (cursor !== source.length) fail('بخش ناشناخته‌ای در انتهای فرمول وجود دارد.');
    return { result: assertFinite(result) };
  } catch (err: any) {
    return { result: 0, error: err?.message || 'خطا در ارزیابی محاسباتی فرمول' };
  }
}

export function evaluateNumericFormula(formula: string, variables: Record<string, number>): number {
  const evaluation = safeEvaluateMath(formula, variables);
  return evaluation.error ? 0 : evaluation.result;
}

/**
 * Computes the KPI value and maps it to a 1-5 performance rating
 */
export function calculateKpiScore(
  criterion: Criterion,
  inputValues: Record<string, number | undefined>
): EvaluationFormulaResult {
  const calcType: KpiCalculationType = criterion.calculationType || 'ratio';
  const dir = criterion.dir || 'more';
  const thresholds = criterion.scoreThresholds || (dir === 'less' ? DEFAULT_INVERSE_THRESHOLDS : DEFAULT_KPI_THRESHOLDS);

  // Clean numerical inputs with fallback to 0 or default
  const sanitizedInputs: Record<string, number> = {};
  if (criterion.variables && criterion.variables.length > 0) {
    criterion.variables.forEach(v => {
      const raw = inputValues[v.key];
      const num = typeof raw === 'number' && !isNaN(raw) ? raw : (Number(raw) || v.defaultValue || 0);
      sanitizedInputs[v.key] = num;
    });
  } else {
    // Standard default variables
    ['actual', 'target', 'standard', 'scrap', 'total', 'value'].forEach(k => {
      const raw = inputValues[k];
      sanitizedInputs[k] = typeof raw === 'number' && !isNaN(raw) ? raw : (Number(raw) || 0);
    });
  }

  let computedValue = 0;
  let formulaDesc = '';

  switch (calcType) {
    case 'ratio': {
      // (actual / target) * 100
      const actual = sanitizedInputs.actual ?? (sanitizedInputs.produced ?? 0);
      const target = sanitizedInputs.target ?? (criterion.targetValue || 100);
      if (target <= 0) {
        computedValue = actual > 0 ? 100 : 0;
      } else {
        computedValue = (actual / target) * 100;
      }
      formulaDesc = `تحقق برنامه: (${actual} از تارگت ${target}) = ${computedValue.toFixed(1)}%`;
      break;
    }

    case 'inverse_ratio': {
      // (standard / actual) * 100 (e.g. Cycle Time - lower actual is better)
      const actual = sanitizedInputs.actual ?? (sanitizedInputs.cycle_time ?? 0);
      const standard = sanitizedInputs.standard ?? (criterion.targetValue || 60);
      if (actual <= 0) {
        computedValue = 100;
      } else {
        computedValue = (standard / actual) * 100;
      }
      formulaDesc = `راندمان زمان چرخه: (استاندارد ${standard}s / واقعی ${actual}s) = ${computedValue.toFixed(1)}%`;
      break;
    }

    case 'defect_rate': {
      // 100 - (scrap / total) * 100
      const scrap = sanitizedInputs.scrap ?? (sanitizedInputs.defects ?? 0);
      const total = sanitizedInputs.total ?? (sanitizedInputs.actual ?? 100);
      const scrapRate = total > 0 ? (scrap / total) * 100 : 0;
      computedValue = Math.max(0, 100 - scrapRate);
      formulaDesc = `کیفیت تولید: نرخ ضایعات ${scrapRate.toFixed(2)}% (سالم: ${computedValue.toFixed(2)}%)`;
      break;
    }

    case 'custom_formula': {
      const expr = criterion.formulaExpression || '(actual / target) * 100';
      const evalRes = safeEvaluateMath(expr, sanitizedInputs);
      if (evalRes.error) {
        return {
          computedValue: 0,
          score: 1,
          status: 'critical',
          statusLabel: 'خطا در فرمول',
          summaryText: `خطا در فرمول شاخص: ${evalRes.error}`,
          error: evalRes.error
        };
      }
      computedValue = evalRes.result;
      formulaDesc = `محاسبه طبق فرمول [${expr}] = ${computedValue.toFixed(2)}`;
      break;
    }

    case 'direct_score':
    default: {
      const direct = sanitizedInputs.value ?? (sanitizedInputs.score ?? 3);
      const bounded = Math.min(5, Math.max(1, Math.round(direct)));
      return {
        computedValue: bounded,
        score: bounded,
        status: bounded >= 4 ? 'excellent' : (bounded === 3 ? 'acceptable' : 'warning'),
        statusLabel: bounded >= 4 ? 'عالی' : (bounded === 3 ? 'متوسط' : 'نیاز به بهبود'),
        summaryText: `امتیاز مستقیم ثبت‌شده: ${bounded} از ۵`
      };
    }
  }

  // Round computed value to 2 decimal places
  computedValue = Math.round(computedValue * 100) / 100;

  // Convert to 1-5 scale based on direction and thresholds
  let score = 3;
  let status: EvaluationFormulaResult['status'] = 'acceptable';
  let statusLabel = 'متوسط / منطبق بر انتظار';

  if (dir === 'less') {
    // For less is better (e.g., lower scrap rate or PPM)
    if (computedValue <= thresholds.score5) {
      score = 5;
      status = 'excellent';
      statusLabel = 'فوق‌العاده (فراتر از برنامه)';
    } else if (computedValue <= thresholds.score4) {
      score = 4;
      status = 'good';
      statusLabel = 'بسیار خوب و مطلوب';
    } else if (computedValue <= thresholds.score3) {
      score = 3;
      status = 'acceptable';
      statusLabel = 'منطبق بر هدف استاندارد';
    } else if (computedValue <= thresholds.score2) {
      score = 2;
      status = 'warning';
      statusLabel = 'نیاز به بهبود و اصلاح فرآیند';
    } else {
      score = 1;
      status = 'critical';
      statusLabel = 'غیرقابل قبول و بحرانی';
    }
  } else {
    // For more is better (standard efficiency %, volume, OEE)
    if (computedValue >= thresholds.score5) {
      score = 5;
      status = 'excellent';
      statusLabel = 'فوق‌العاده (فراتر از برنامه)';
    } else if (computedValue >= thresholds.score4) {
      score = 4;
      status = 'good';
      statusLabel = 'بسیار خوب و مطلوب';
    } else if (computedValue >= thresholds.score3) {
      score = 3;
      status = 'acceptable';
      statusLabel = 'منطبق بر هدف استاندارد';
    } else if (computedValue >= thresholds.score2) {
      score = 2;
      status = 'warning';
      statusLabel = 'نیاز به بهبود و آموزش';
    } else {
      score = 1;
      status = 'critical';
      statusLabel = 'غیرقابل قبول و بحرانی';
    }
  }

  return {
    computedValue,
    score,
    status,
    statusLabel,
    summaryText: `${formulaDesc} | نمره ارزیابی: ${score} از ۵ (${statusLabel})`
  };
}

/**
 * Calculates composite score for criteria supplied from multiple sources
 * e.g. MIS (50%) + Kasra (25%) + Supervisor (25%)
 */
export function calculateMultiSourceCompositeScore(
  criterion: Criterion,
  breakdown: {
    misScore?: number;
    kasraScore?: number;
    supervisorScore?: number;
    systemScore?: number;
  }
): { score: number; docText: string; effectivePercentage: number } {
  const config = criterion.multiSourceConfig;
  if (!config || !config.items || config.items.length === 0) {
    const available = [
      breakdown.misScore,
      breakdown.kasraScore,
      breakdown.supervisorScore,
      breakdown.systemScore
    ].filter((s): s is number => s !== undefined && s > 0);
    if (available.length === 0) return { score: 0, docText: '', effectivePercentage: 0 };
    const avg = available.reduce((a, b) => a + b, 0) / available.length;
    const rounded = Math.round(avg * 10) / 10;
    return {
      score: rounded,
      docText: `میانگین ترکیبی منابع: ${rounded}`,
      effectivePercentage: 100
    };
  }

  let totalWeightedScore = 0;
  let totalAppliedWeight = 0;
  const partsSummary: string[] = [];

  config.items.forEach(item => {
    let sourceScore: number | undefined = undefined;
    let sourceName = item.label || '';
    if (item.source === 'mis') {
      sourceScore = breakdown.misScore;
      if (!sourceName) sourceName = 'سامانه تولید MIS';
    } else if (item.source === 'kasra') {
      sourceScore = breakdown.kasraScore;
      if (!sourceName) sourceName = 'حضور و غیاب کسری';
    } else if (item.source === 'supervisor') {
      sourceScore = breakdown.supervisorScore;
      if (!sourceName) sourceName = 'ارزیابی سرپرست';
    } else if (item.source === 'system') {
      sourceScore = breakdown.systemScore;
      if (!sourceName) sourceName = 'فرمول سیستمی';
    }

    if (sourceScore !== undefined && sourceScore > 0) {
      totalWeightedScore += sourceScore * item.weightPercent;
      totalAppliedWeight += item.weightPercent;
      partsSummary.push(`${sourceName} (${item.weightPercent}٪): ${sourceScore}`);
    } else {
      partsSummary.push(`${sourceName} (${item.weightPercent}٪): در انتظار`);
    }
  });

  if (totalAppliedWeight === 0) {
    return { score: 0, docText: 'در انتظار ورود داده از منابع مربوطه', effectivePercentage: 0 };
  }

  const finalScore = Math.round((totalWeightedScore / totalAppliedWeight) * 10) / 10;
  return {
    score: Math.min(5, Math.max(1, finalScore)),
    docText: partsSummary.join(' | '),
    effectivePercentage: totalAppliedWeight
  };
}

// Single source of truth for evaluation final score
import { Evaluation, JobProfile } from '../types';

export const SCALE_FACTOR = 20;

export function calculateFinalScore(ev: Evaluation, profiles?: JobProfile[]): number {
  if (!ev || !ev.scores || !Array.isArray(ev.scores)) return 0;
  
  const scoredItems = ev.scores.filter(s => s.value > 0);
  if (!scoredItems.length) return 0;

  // If profiles are provided and the evaluation is not locked/calibrated, use the live weights from the profile.
  // Otherwise, use the snapshot weights saved inside the evaluation.
  let profile = profiles ? profiles.find(p => p.id === ev.profileId) : undefined;
  let useLiveWeights = profile && (ev.status === 'draft');

  let totalWeight = 0;
  let weightedSum = 0;

  scoredItems.forEach(s => {
    let weight = s.weight;
    if (useLiveWeights && profile) {
      const profItem = profile.items.find(pi => pi.cid === s.cid);
      if (profItem && profItem.weight) {
        weight = profItem.weight;
      }
    }
    totalWeight += weight;
    weightedSum += (s.value * weight);
  });

  if (totalWeight === 0) return 0;
  
  const avg5 = weightedSum / totalWeight;
  return Math.round(avg5 * SCALE_FACTOR * 10) / 10;
}

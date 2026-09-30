import type { Criterion, Employee, Evaluation, JobProfile, KasraAttendanceRecord } from '../types';
import { canImport, type GranularPermissionPolicy } from './authorization';
import { getEvaluationPeriodId } from './evaluationPeriod';
import { normalizePersonnelCode } from './personnelSearch';

export type KasraPreviewStatus = 'valid' | 'duplicate' | 'unknown_employee' | 'missing_evaluation' | 'missing_kasra_criterion' | 'period_mismatch' | 'invalid_metric' | 'outside_scope' | 'locked_evaluation' | 'missing_profile';

export interface KasraPreviewRow {
  rowNumber: number;
  record: KasraAttendanceRecord;
  status: KasraPreviewStatus;
  issue?: string;
  employee?: Employee;
  evaluation?: Evaluation;
  updatedEvaluation?: Evaluation;
  changedScores: Array<{ criterion: Criterion; previousValue: number; nextValue: number; rawMetricValue: number }>;
}

export function kasraScoreFromMetric(metric: string | undefined, value: number): number | null {
  switch (metric) {
    case 'attendance_delay': return value <= 15 ? 5 : value <= 45 ? 4 : value <= 120 ? 3 : value <= 240 ? 2 : 1;
    case 'attendance_absence': return value === 0 ? 5 : value <= 1 ? 3 : value <= 2 ? 2 : 1;
    case 'discipline': return value === 0 ? 5 : value === 1 ? 3 : 1;
    default: return null;
  }
}

export function buildKasraPreviewRows(input: {
  records: KasraAttendanceRecord[];
  selectedPeriodId: string;
  employees: Employee[];
  profiles: JobProfile[];
  criteria: Criterion[];
  evaluations: Evaluation[];
  actor: Employee | null | undefined;
  policy: GranularPermissionPolicy;
}): KasraPreviewRow[] {
  const { records, selectedPeriodId, employees, profiles, criteria, evaluations, actor, policy } = input;
  const rowsByCode = new Map<string, number>();
  records.forEach(record => {
    const key = normalizePersonnelCode(record.empCode);
    if (key) rowsByCode.set(key, (rowsByCode.get(key) || 0) + 1);
  });
  const employeesByCode = new Map<string, Employee[]>();
  employees.forEach(employee => {
    const key = normalizePersonnelCode(employee.code);
    if (key) employeesByCode.set(key, [...(employeesByCode.get(key) || []), employee]);
  });

  return records.map((record, index) => {
    const invalid = (status: KasraPreviewStatus, issue: string, employee?: Employee, evaluation?: Evaluation): KasraPreviewRow => ({
      rowNumber: index + 2, record, status, issue, employee, evaluation, changedScores: [],
    });
    const code = normalizePersonnelCode(record.empCode);
    if (!code || (rowsByCode.get(code) || 0) > 1 || (employeesByCode.get(code)?.length || 0) > 1) {
      return invalid('duplicate', 'کد پرسنلی خالی یا تکراری است و باید یکتا باشد.');
    }
    const employee = employeesByCode.get(code)?.[0];
    if (!employee) return invalid('unknown_employee', `کارمند با کد «${record.empCode || 'نامشخص'}» پیدا نشد.`);
    if (record.evaluationPeriodId && record.evaluationPeriodId !== selectedPeriodId) {
      return invalid('period_mismatch', 'شناسه دوره فایل با دوره انتخاب‌شده برابر نیست.', employee);
    }
    if (!selectedPeriodId) return invalid('period_mismatch', 'دوره ارزیابی انتخاب نشده است.', employee);
    const employeeEvaluations = evaluations.filter(item => item.empId === employee.id && getEvaluationPeriodId(item) === selectedPeriodId);
    if (employeeEvaluations.length > 1) return invalid('duplicate', 'برای این کارمند بیش از یک ارزیابی در دوره انتخاب‌شده وجود دارد.', employee);
    const evaluation = employeeEvaluations[0];
    if (!evaluation) return invalid('missing_evaluation', 'برای این کارمند در دوره انتخاب‌شده ارزیابی ایجاد نشده است.', employee);
    if (evaluation.status === 'locked' || evaluation.stage === 'completed') return invalid('locked_evaluation', 'پرونده نهایی یا قفل‌شده قابل به‌روزرسانی نیست.', employee, evaluation);
    if (!actor || !canImport(actor, 'kasra', employee, policy).allowed) return invalid('outside_scope', 'مجوز درون‌ریزی کسری برای این کارمند یا محدوده وجود ندارد.', employee, evaluation);
    if (![record.delayMinutes, record.absenceDays, record.disciplineInfractions, record.calculatedScore].every(value => Number.isFinite(value) && value >= 0) || record.calculatedScore > 5) {
      return invalid('invalid_metric', 'یکی از شاخص‌های حضور، غیبت، انضباط یا نمره محاسبه‌شده معتبر نیست.', employee, evaluation);
    }

    const profile = profiles.find(item => item.id === evaluation.profileId);
    if (!profile) return invalid('missing_profile', 'پروفایل ارزیابی این کارمند معتبر نیست.', employee, evaluation);
    const scoreByCid = new Map(evaluation.scores.map(score => [score.cid, score]));
    const criterionById = new Map(criteria.map(criterion => [criterion.id, criterion]));
    const kasraCriteria = profile.items.flatMap(item => {
      const criterion = criterionById.get(item.cid) || criteria.find(candidate => candidate.code === item.cid);
      return criterion?.scoringSource === 'kasra' && criterion.autoPopulate !== false ? [{ item, criterion }] : [];
    });
    if (!kasraCriteria.length) return invalid('missing_kasra_criterion', 'در پروفایل این ارزیابی معیار متعلق به کسری وجود ندارد.', employee, evaluation);
    if (kasraCriteria.some(({ item, criterion }) => !scoreByCid.has(item.cid) && !scoreByCid.has(criterion.id))) {
      return invalid('missing_kasra_criterion', 'اسلات معیار کسری در ارزیابی موجود نیست.', employee, evaluation);
    }

    const scoreUpdates = new Map<string, Evaluation['scores'][number]>();
    const changedScores: KasraPreviewRow['changedScores'] = [];
    for (const { item, criterion } of kasraCriteria) {
      const scoreKey = scoreByCid.has(item.cid) ? item.cid : criterion.id;
      const previous = scoreByCid.get(scoreKey)!;
      const metric = criterion.misMetricKey;
      const rawMetricValue = metric === 'attendance_delay' ? record.delayMinutes
        : metric === 'attendance_absence' ? record.absenceDays
          : metric === 'discipline' ? record.disciplineInfractions
            : record.calculatedScore;
      const computed = kasraScoreFromMetric(metric, rawMetricValue);
      const value = computed ?? Math.max(0, Math.min(5, Math.round(rawMetricValue * 10) / 10));
      const next = {
        ...previous,
        value,
        doc: `داده کسری: تاخیر ${record.delayMinutes} دقیقه | غیبت ${record.absenceDays} روز | تذکر انضباطی ${record.disciplineInfractions}`,
        sourceType: 'kasra' as const,
        autoPopulated: true,
        rawMetricValue,
        rawMetricLabel: computed === null ? 'kasra_composite_score' : metric,
      };
      scoreUpdates.set(scoreKey, next);
      changedScores.push({ criterion, previousValue: previous.value, nextValue: value, rawMetricValue });
    }
    const updatedEvaluation: Evaluation = {
      ...evaluation,
      scores: evaluation.scores.map(score => scoreUpdates.get(score.cid) || score),
    };
    return { rowNumber: index + 2, record, status: 'valid', employee, evaluation, updatedEvaluation, changedScores };
  });
}

export function countKasraPreview(rows: KasraPreviewRow[]) {
  return {
    total: rows.length,
    valid: rows.filter(row => row.status === 'valid').length,
    invalid: rows.filter(row => row.status !== 'valid').length,
    duplicate: rows.filter(row => row.status === 'duplicate').length,
    unknownEmployee: rows.filter(row => row.status === 'unknown_employee').length,
    missingEvaluation: rows.filter(row => row.status === 'missing_evaluation').length,
    missingCriterion: rows.filter(row => row.status === 'missing_kasra_criterion' || row.status === 'missing_profile').length,
    periodMismatch: rows.filter(row => row.status === 'period_mismatch').length,
    warning: 0,
  };
}

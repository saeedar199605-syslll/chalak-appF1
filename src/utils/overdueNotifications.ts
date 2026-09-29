/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Evaluation, Employee, WorkflowStageKey, WORKFLOW_STAGES } from '../types';

export interface OverdueEvaluationItem {
  evalId: string;
  empId: string;
  empName: string;
  empCode: string;
  unit: string;
  period: string;
  stage: WorkflowStageKey;
  stageLabel: string;
  daysPending: number;
  maxAllowedDays: number;
  daysOverdue: number;
  reason: string;
  currentAssigneeName: string;
  urgency: 'critical' | 'high' | 'medium';
}

/**
 * Stage SLA allowed days before considered overdue
 */
const STAGE_SLA_DAYS: Partial<Record<WorkflowStageKey, number>> = {
  self_review: 4,         // مهلت خودارزیابی
  supervisor_review: 3,   // مهلت ارزیابی و امتیازدهی سرپرست
  peer_review: 3,         // مهلت ارزیابی همتا
  calibration_review: 2,  // مهلت کمیته کالیبراسیون
  hr_approval: 2,         // مهلت تایید مدیر HR
  feedback_meeting: 4,    // مهلت برگزاری جلسه بازخورد و IDP
  rejected: 2,            // مهلت اصلاح مستندات
  appealed: 3,            // مهلت رسیدگی به فرجام‌خواهی
  completed: 999          // تکمیل شده
  // HSE is an optional detour; it has no configured SLA in this schema.
};

/**
 * Calculate overdue evaluations for a given user (supervisor or admin)
 */
function parseTimestamp(ts: string | undefined): Date | null {
  if (!ts) return null;
  const parsed = new Date(ts);
  if (!isNaN(parsed.getTime())) return parsed;
  return null;
}

/**
 * Calculate elapsed days since the evaluation entered its current stage.
 * Uses the most recent history log timestamp as the source of truth.
 * Falls back to the evaluation's `created` timestamp if no history exists.
 * Returns 0 when no reliable timestamp is available — never fabricates days.
 */
function calculateDaysPending(ev: Evaluation, stage: WorkflowStageKey): number {
  // Completed stages are not pending
  if (stage === 'completed' || ev.status === 'locked') return 0;

  // Prefer the most recent transition log timestamp
  const lastLog = ev.history && ev.history.length > 0 ? ev.history[0] : null;
  const refTimestamp = lastLog ? parseTimestamp(lastLog.timestamp) : null;

  // Fall back to the evaluation's creation time if no history entry exists
  let refDate: Date | null = refTimestamp;
  if (!refDate && typeof ev.created === 'number' && ev.created > 0) {
    refDate = new Date(ev.created);
  }

  if (!refDate) return 0;

  const elapsedMs = Date.now() - refDate.getTime();
  const days = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

export function getOverdueEvaluations(
  evaluations: Evaluation[],
  employees: Employee[],
  currentUser: Employee
): OverdueEvaluationItem[] {
  if (!currentUser) return [];

  const overdueItems: OverdueEvaluationItem[] = [];

  evaluations.forEach(ev => {
    // Completed or locked evaluations are never overdue
    if (ev.status === 'locked' || ev.stage === 'completed') {
      return;
    }

    const emp = employees.find(e => e.id === ev.empId);
    if (!emp) return;

    // Check if user is responsible for this evaluation:
    // 1. Admin: oversees all evaluations
    // 2. Supervisor: subordinate is assigned to this supervisor, or same unit supervisor, or currently assigned to supervisor
    const isSupervisor = currentUser.role === 'supervisor';
    const isAdmin = currentUser.role === 'admin';

    if (!isAdmin && !isSupervisor) {
      // Regular employees only care about their own overdue self_review or feedback_meeting
      if (emp.id !== currentUser.id) return;
    }

    if (isSupervisor && !isAdmin) {
      const isDirectSubordinate = emp.supervisorId === currentUser.id;
      const isUnitSubordinate = !emp.supervisorId && emp.unit === currentUser.unit;
      const isAssignedToMe = ev.currentAssigneeId === currentUser.id;

      if (!isDirectSubordinate && !isUnitSubordinate && !isAssignedToMe) {
        return;
      }
    }

    const stage: WorkflowStageKey = ev.stage || (
      ev.status === 'calibrated' ? 'hr_approval' :
      ev.scores.some(s => s.value > 0) ? 'calibration_review' :
      ev.scores.some(s => s.self > 0) ? 'supervisor_review' : 'self_review'
    );

    if (!isAdmin && !isSupervisor && !['self_review', 'rejected', 'feedback_meeting'].includes(stage)) return;

    const maxAllowedDays = STAGE_SLA_DAYS[stage];
    if (maxAllowedDays === undefined) return;

    // Calculate real elapsed days from the stage transition timestamp or creation date.
    // No fabricated or pseudo-random days — only actual time since the stage began.
    const daysPending = calculateDaysPending(ev, stage);

    const isOverdue = daysPending > maxAllowedDays;

    if (isOverdue) {
      const daysOverdue = daysPending - maxAllowedDays;
      let reason = 'تاخیر در بررسی و تعیین تکلیف پرونده در مهلت مصوب سازمانی';
      let urgency: 'critical' | 'high' | 'medium' = 'medium';

      if (stage === 'supervisor_review') {
        reason = `عدم ثبت نمرات و بازخورد اولیه سرپرست مستقیم (${daysOverdue} روز فراتر از مهلت)`;
        urgency = daysOverdue >= 3 ? 'critical' : 'high';
      } else if (stage === 'self_review') {
        reason = `عدم تکمیل خودارزیابی توسط پرسنل (${daysOverdue} روز تاخیر)`;
        urgency = 'high';
      } else if (stage === 'feedback_meeting') {
        reason = `عدم برگزاری جلسه دونفره مربیگری و ثبت برنامه توانمندسازی IDP`;
        urgency = daysOverdue >= 2 ? 'critical' : 'high';
      } else if (stage === 'calibration_review') {
        reason = `انتظار برای تایید کمیته کالیبراسیون و انطباق توزیع نمرات`;
        urgency = 'medium';
      } else if (stage === 'rejected') {
        reason = `پرونده عودت‌داده شده نیازمند بازنگری فوری مستندات است`;
        urgency = 'critical';
      } else if (stage === 'appealed') {
        reason = `اعتراض ثبت‌شده کارمند نیازمند رسیدگی کمیته فرجام‌خواهی است`;
        urgency = 'critical';
      }

      const stageInfo = WORKFLOW_STAGES[stage] || { label: 'در دست بررسی' };

      overdueItems.push({
        evalId: ev.id,
        empId: emp.id,
        empName: emp.name,
        empCode: emp.code,
        unit: emp.unit,
        period: ev.period,
        stage,
        stageLabel: stageInfo.label,
        daysPending,
        maxAllowedDays,
        daysOverdue,
        reason,
        currentAssigneeName: ev.currentAssigneeName || (isSupervisor ? currentUser.name : 'سرپرست مربوطه'),
        urgency
      });
    }
  });

  // Sort by urgency then daysOverdue descending
  return overdueItems.sort((a, b) => {
    const urgencyWeight = { critical: 3, high: 2, medium: 1 };
    if (urgencyWeight[b.urgency] !== urgencyWeight[a.urgency]) {
      return urgencyWeight[b.urgency] - urgencyWeight[a.urgency];
    }
    return b.daysOverdue - a.daysOverdue;
  });
}

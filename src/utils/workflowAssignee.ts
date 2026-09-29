import type { Employee, Evaluation, UserRole, WorkflowStageKey } from '../types';

export interface WorkflowAssignee {
  id: string;
  name: string;
  role: UserRole;
  code: string;
  unit: string;
  title: string;
}

/** Resolve the target owner from the existing evaluation stage and employee assignment fields. */
export function resolveWorkflowAssignee(stage: WorkflowStageKey, employee: Employee | undefined, employees: Employee[]): WorkflowAssignee {
  if (!employee) return { id: 'unknown', name: 'نامشخص', role: 'admin', code: '---', unit: '---', title: '---' };
  const admin = employees.find(person => person.role === 'admin');
  const supervisor = employees.find(person => person.id === employee.supervisorId) || employees.find(person => person.unit === employee.unit && person.role === 'supervisor' && person.id !== employee.id);
  const assigned = (id: string | undefined, fallback: Employee | undefined, synthetic: WorkflowAssignee): WorkflowAssignee => {
    const person = (id ? employees.find(candidate => candidate.id === id) : undefined) || fallback;
    return person ? { id: person.id, name: person.name, role: person.role, code: person.code, unit: person.unit, title: synthetic.title } : synthetic;
  };

  switch (stage) {
    case 'self_review':
      return { id: employee.id, name: employee.name, role: employee.role, code: employee.code, unit: employee.unit, title: 'شاغل (ثبت خودارزیابی)' };
    case 'supervisor_review':
      return assigned(employee.supervisorId, supervisor || admin || employees[0], { id: 'unknown', name: 'سرپرست تعیین نشده', role: 'admin', code: '---', unit: employee.unit, title: 'مسئول ارزیابی سرپرست' });
    case 'peer_review': {
      const peer = employees.find(person => person.id === employee.peerReviewerId) || employees.find(person => person.unit === employee.unit && person.id !== employee.id);
      return assigned(peer?.id, undefined, { id: 'peer-auto', name: 'ارزیاب همتا تعیین نشده', role: 'admin', code: 'PEER', unit: employee.unit, title: 'نیازمند تعیین ارزیاب همتا' });
    }
    case 'calibration_review':
      return assigned(employee.calibrationLeadId, admin, { id: 'calib-lead', name: 'مسئول کالیبراسیون تعیین نشده', role: 'admin', code: 'CAL-01', unit: 'تعالی سازمانی', title: 'نیازمند تعیین مسئول کالیبراسیون' });
    case 'hr_approval':
      return assigned(employee.approverId, admin, { id: 'hr-lead', name: 'تأییدکننده HR تعیین نشده', role: 'admin', code: 'HR-01', unit: 'سرمایه انسانی', title: 'نیازمند تعیین تأییدکننده HR' });
    case 'hse_review':
      return assigned(employee.hseReviewerId, undefined, { id: 'hse-reviewer-missing', name: 'بازبین HSE تعیین نشده', role: 'admin', code: 'HSE', unit: employee.unit, title: 'نیازمند تعیین بازبین HSE' });
    case 'feedback_meeting':
      return assigned(employee.supervisorId, supervisor, { id: employee.id, name: employee.name, role: employee.role, code: employee.code, unit: employee.unit, title: 'جلسه بازخورد' });
    case 'rejected':
      return { id: employee.id, name: employee.name, role: employee.role, code: employee.code, unit: employee.unit, title: 'نیازمند اصلاح مستندات' };
    case 'appealed':
      return assigned(undefined, admin || employees[0], { id: 'appeal-committee', name: 'کمیته تجدیدنظر تعیین نشده', role: 'admin', code: 'APPEAL', unit: 'مدیریت ارشد', title: 'نیازمند تعیین کمیته تجدیدنظر' });
    case 'completed':
      return { id: 'completed', name: 'فرآیند تکمیل و بایگانی شده', role: 'admin', code: 'DONE', unit: 'سوابق پرسنلی', title: 'مختومه' };
  }
}

export function expectedWorkflowAssigneeId(evaluation: Evaluation, employee: Employee | undefined, employees: Employee[]): string {
  return resolveWorkflowAssignee(evaluation.stage || 'self_review', employee, employees).id;
}

import type { Employee, Evaluation } from '../types';

export type EmployeeDeletionBlockReason =
  | 'not_found'
  | 'protected_admin'
  | 'evaluation_history'
  | 'open_workflow_task'
  | 'employee_relationship';

const employeeRelationshipFields = [
  'supervisorId', 'peerReviewerId', 'calibrationLeadId', 'approverId', 'hrPartnerId',
] as const;

export function getEmployeeDeletionBlockReason(
  target: Employee,
  remainingEmployees: readonly Employee[],
  evaluations: readonly Evaluation[],
  archivedEvaluations: readonly Evaluation[],
): EmployeeDeletionBlockReason | null {
  if (target.role === 'admin' || (target.username?.toLowerCase() === 'admin' && target.code === 'ADMIN-001')) return 'protected_admin';
  if (evaluations.some(item => item.empId === target.id) || archivedEvaluations.some(item => item.empId === target.id)) return 'evaluation_history';
  if (evaluations.some(item => item.currentAssigneeId === target.id && item.stage !== 'completed' && item.status !== 'locked')) return 'open_workflow_task';
  if (remainingEmployees.some(employee => employee.id !== target.id && employeeRelationshipFields.some(field => employee[field] === target.id))) return 'employee_relationship';
  return null;
}

export function planEmployeeBulkDeletion(
  ids: readonly string[],
  employees: readonly Employee[],
  evaluations: readonly Evaluation[],
  archivedEvaluations: readonly Evaluation[],
): { deletableIds: Set<string>; blockedReasons: Map<string, EmployeeDeletionBlockReason> } {
  const requestedIds = new Set(ids);
  const deletableIds = new Set<string>();
  const blockedReasons = new Map<string, EmployeeDeletionBlockReason>();
  const employeesById = new Map(employees.map(employee => [employee.id, employee]));

  for (const id of requestedIds) {
    const target = employeesById.get(id);
    if (!target) {
      blockedReasons.set(id, 'not_found');
      continue;
    }
    const reason = getEmployeeDeletionBlockReason(target, [], evaluations, archivedEvaluations);
    if (reason) blockedReasons.set(id, reason);
    else deletableIds.add(id);
  }

  // Keep every selected account needed by employees who will remain. Recompute
  // until a newly blocked account no longer leaves another selected dependency behind.
  let changed = true;
  while (changed) {
    changed = false;
    const remainingEmployees = employees.filter(employee => !deletableIds.has(employee.id));
    for (const id of [...deletableIds]) {
      const target = employeesById.get(id)!;
      const reason = getEmployeeDeletionBlockReason(target, remainingEmployees, evaluations, archivedEvaluations);
      if (reason) {
        deletableIds.delete(id);
        blockedReasons.set(id, reason);
        changed = true;
      }
    }
  }

  return { deletableIds, blockedReasons };
}

export function employeeDeletionBlockMessage(reason: EmployeeDeletionBlockReason): string {
  switch (reason) {
    case 'not_found': return 'کارمند انتخاب‌شده پیدا نشد.';
    case 'protected_admin': return 'حساب مدیر سیستم قابل حذف نیست.';
    case 'evaluation_history': return 'این کارمند در ارزیابی فعال یا بایگانی‌شده سابقه دارد؛ برای حفظ تاریخچه حذف نمی‌شود.';
    case 'open_workflow_task': return 'این کارمند مسئول یک پرونده باز است؛ ابتدا پرونده را به مسئول دیگری واگذار کنید.';
    case 'employee_relationship': return 'کارمند دیگری به این شخص ارجاع دارد؛ ابتدا سرپرست یا ارزیاب جایگزین تعیین کنید.';
  }
}

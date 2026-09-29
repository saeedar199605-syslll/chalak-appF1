import type { Employee } from '../types';

export interface EmployeeBulkPatch {
  unit?: string;
  supervisorId?: string;
  profileId?: string;
}

export interface EmployeeBulkPreviewRow {
  id: string;
  name: string;
  code: string;
  before: Pick<Employee, 'unit' | 'supervisorId' | 'profileId'>;
  after: Pick<Employee, 'unit' | 'supervisorId' | 'profileId'>;
}

/** Apply only explicitly selected employee fields; credentials and other metadata remain untouched. */
export function buildEmployeeBulkEditPreview(employees: Employee[], selectedIds: Iterable<string>, patch: EmployeeBulkPatch): { employees: Employee[]; rows: EmployeeBulkPreviewRow[] } {
  const selected = new Set(selectedIds);
  const beforeById = new Map(employees.map(employee => [employee.id, employee]));
  const nextEmployees = employees.map(employee => {
    if (!selected.has(employee.id)) return employee;
    return {
      ...employee,
      ...(patch.unit?.trim() ? { unit: patch.unit.trim() } : {}),
      ...(patch.supervisorId ? { supervisorId: patch.supervisorId } : {}),
      ...(patch.profileId ? { profileId: patch.profileId } : {}),
    };
  });
  const rows = nextEmployees.flatMap(employee => {
    if (!selected.has(employee.id)) return [];
    const before = beforeById.get(employee.id)!;
    return [{
      id: employee.id,
      name: employee.name,
      code: employee.code,
      before: { unit: before.unit, supervisorId: before.supervisorId, profileId: before.profileId },
      after: { unit: employee.unit, supervisorId: employee.supervisorId, profileId: employee.profileId },
    }];
  });
  return { employees: nextEmployees, rows };
}

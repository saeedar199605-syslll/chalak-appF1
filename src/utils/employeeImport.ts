import type { Employee, JobProfile, UserRole } from '../types';
import { validateEmployeeInput } from './validation';

export type EmployeeImportStatus = 'NEW' | 'UPDATE' | 'UNCHANGED' | 'INVALID' | 'DUPLICATE' | 'UNKNOWN / UNMAPPED';

export interface EmployeeImportChange {
  field: string;
  before: string;
  after: string;
}

export interface EmployeeImportPreviewRow {
  rowNumber: number;
  status: EmployeeImportStatus;
  name: string;
  code: string;
  changes: EmployeeImportChange[];
  issues: string[];
}

export interface EmployeeImportPlan {
  employees: Employee[];
  rows: EmployeeImportPreviewRow[];
  counts: Record<EmployeeImportStatus, number> & { removed: number };
  errors: string[];
  changedCount: number;
}

const KNOWN_FIELDS = new Set([
  'name', 'نام و نام خانوادگی', 'code', 'کد پرسنلی', 'unit', 'واحد سازمانی',
  'profile', 'profileId', 'عنوان رده شغلی', 'پروفایل شغلی',
  'role', 'نقش کاربری', 'نقش', 'username', 'نام کاربری',
  'supervisor', 'supervisorId', 'کد پرسنلی سرپرست مستقیم',
  'peer', 'peerReviewerId', 'کد پرسنلی ارزیاب همتا',
  'approver', 'approverId', 'کد پرسنلی تصویب‌کننده',
  'calibrationLeadId', 'hrPartnerId', 'id',
]);

const readValue = (row: Record<string, unknown>, keys: string[], fallback = ''): string => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return fallback;
};

const roleFromValue = (value: string): UserRole | null => {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'employee' || normalized === 'کارمند' || normalized === 'اپراتور کارگاه') return 'employee';
  if (normalized === 'admin' || normalized.includes('مدیر ارشد') || normalized === 'مدیر') return 'admin';
  if (normalized === 'supervisor' || normalized.includes('سرپرست')) return 'supervisor';
  return null;
};

const comparableFields: Array<[keyof Employee, string]> = [
  ['name', 'Name'], ['code', 'Employee code'], ['unit', 'Unit'], ['profileId', 'Job profile'],
  ['role', 'Role'], ['username', 'Username'], ['supervisorId', 'Supervisor'],
  ['peerReviewerId', 'Peer reviewer'], ['calibrationLeadId', 'Calibration lead'],
  ['approverId', 'Approver'], ['hrPartnerId', 'HR partner'],
];

const display = (value: unknown, employees: Employee[], profiles: JobProfile[], field: keyof Employee): string => {
  if (field === 'profileId') return profiles.find(profile => profile.id === value)?.title || String(value || '—');
  if (['supervisorId', 'peerReviewerId', 'calibrationLeadId', 'approverId', 'hrPartnerId'].includes(String(field))) {
    const person = employees.find(employee => employee.id === value);
    return person ? `${person.name} (${person.code})` : String(value || '—');
  }
  return String(value ?? '—');
};

function sameImportedValues(existing: Employee, candidate: Omit<Employee, 'id'>): boolean {
  return comparableFields.every(([field]) => (existing[field] ?? '') === (candidate[field] ?? ''));
}

function makeChanges(existing: Employee | undefined, candidate: Omit<Employee, 'id'>, employees: Employee[], profiles: JobProfile[]): EmployeeImportChange[] {
  return comparableFields.flatMap(([field, label]) => {
    const before = existing ? display(existing[field], employees, profiles, field) : '—';
    const after = display(candidate[field], employees, profiles, field);
    return before === after ? [] : [{ field: label, before, after }];
  });
}

function newEmployeeId(code: string): string {
  const safeCode = code.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `emp-import-${safeCode}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Build the exact employee set that a confirmation will apply, without writing it. */
export function prepareEmployeeImport(
  importedItems: unknown[],
  employees: Employee[],
  profiles: JobProfile[],
  mode: 'merge' | 'replace' = 'merge',
): EmployeeImportPlan {
  const errors: string[] = [];
  const rows: EmployeeImportPreviewRow[] = [];
  const seenCodes = new Set<string>();
  const seenUsernames = new Set<string>();
  const protectedAdmins = employees.filter(employee => employee.role === 'admin' || employee.username === 'admin' || employee.code === 'ADMIN-001');
  let workingEmployees: Employee[] = mode === 'replace' ? [...protectedAdmins] : [...employees];
  const counts: EmployeeImportPlan['counts'] = {
    NEW: 0, UPDATE: 0, UNCHANGED: 0, INVALID: 0, DUPLICATE: 0, 'UNKNOWN / UNMAPPED': 0, removed: 0,
  };
  const defaultProfile = profiles[0];

  importedItems.forEach((rawValue, index) => {
    const rowNumber = index + 1;
    const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
      ? rawValue as Record<string, unknown>
      : {};
    const name = readValue(raw, ['name', 'نام و نام خانوادگی']);
    const code = readValue(raw, ['code', 'کد پرسنلی']).toUpperCase();
    const issues: string[] = [];
    const unmappedFields = Object.keys(raw).filter(key => !KNOWN_FIELDS.has(key) && String(raw[key] ?? '').trim() !== '');

    const addRow = (status: EmployeeImportStatus, changes: EmployeeImportChange[] = []) => {
      counts[status] += 1;
      rows.push({ rowNumber, status, name: name || '—', code: code || '—', changes, issues: [...issues] });
      errors.push(...issues.map(issue => `Row ${rowNumber}${code ? ` (${code})` : ''}: ${issue}`));
    };

    if (!name && !code) {
      issues.push('Name and employee code are both required.');
      addRow('INVALID');
      return;
    }
    if (!name || !code) {
      issues.push(!code ? 'Employee code is required.' : 'Employee name is required.');
      addRow('INVALID');
      return;
    }
    if (seenCodes.has(code)) {
      issues.push(`Employee code ${code} appears more than once in this file.`);
      addRow('DUPLICATE');
      return;
    }
    seenCodes.add(code);

    if (unmappedFields.length) {
      issues.push(`Unrecognized fields: ${unmappedFields.join(', ')}.`);
      addRow('UNKNOWN / UNMAPPED');
      return;
    }

    const rawProfile = readValue(raw, ['profile', 'profileId', 'عنوان رده شغلی', 'پروفایل شغلی']);
    const matchedProfile = rawProfile
      ? profiles.find(profile => profile.id === rawProfile || profile.code.toLowerCase() === rawProfile.toLowerCase() || profile.title.toLowerCase() === rawProfile.toLowerCase())
      : defaultProfile;
    if (!matchedProfile) {
      issues.push(rawProfile ? `Job profile “${rawProfile}” was not found.` : 'No job profile is available for this employee.');
      addRow('UNKNOWN / UNMAPPED');
      return;
    }

    const rawRole = readValue(raw, ['role', 'نقش کاربری', 'نقش'], 'employee');
    const role = roleFromValue(rawRole);
    if (!role) {
      issues.push(`Role “${rawRole}” is not mapped.`);
      addRow('UNKNOWN / UNMAPPED');
      return;
    }

    const existing = workingEmployees.find(employee => employee.code.toUpperCase() === code ||
      employee.username.toLowerCase() === readValue(raw, ['username', 'نام کاربری']).toLowerCase());
    const usernameInput = readValue(raw, ['username', 'نام کاربری']);
    const cleanUsername = usernameInput.toLowerCase().replace(/[^a-z0-9_.-]/g, '') || `user_${code.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    let username = cleanUsername;
    let suffix = 1;
    while (seenUsernames.has(username) || workingEmployees.some(employee => employee.username.toLowerCase() === username.toLowerCase() && employee.id !== existing?.id)) {
      username = `${cleanUsername}_${suffix++}`;
    }
    seenUsernames.add(username);

    const resolvePerson = (value: string) => value ? workingEmployees.find(employee => employee.code.toUpperCase() === value.toUpperCase() || employee.id === value)
      || employees.find(employee => employee.code.toUpperCase() === value.toUpperCase() || employee.id === value) : undefined;
    const relationshipValues = [
      ['supervisorId', readValue(raw, ['supervisor', 'supervisorId', 'کد پرسنلی سرپرست مستقیم'])],
      ['peerReviewerId', readValue(raw, ['peer', 'peerReviewerId', 'کد پرسنلی ارزیاب همتا'])],
      ['calibrationLeadId', readValue(raw, ['calibrationLeadId'])],
      ['approverId', readValue(raw, ['approver', 'approverId', 'کد پرسنلی تصویب‌کننده'])],
      ['hrPartnerId', readValue(raw, ['hrPartnerId'])],
    ] as const;
    const relationships: Record<string, string | undefined> = {};
    for (const [field, value] of relationshipValues) {
      if (!value) {
        relationships[field] = undefined;
        continue;
      }
      const person = resolvePerson(value);
      if (!person) issues.push(`${field} reference “${value}” was not found.`);
      else relationships[field] = person.id;
    }
    if (issues.length) {
      addRow('UNKNOWN / UNMAPPED');
      return;
    }

    const candidate = {
      name, code, unit: readValue(raw, ['unit', 'واحد سازمانی'], 'سالن تولید'),
      profileId: matchedProfile.id, role, username,
      supervisorId: relationships.supervisorId,
      peerReviewerId: relationships.peerReviewerId,
      calibrationLeadId: relationships.calibrationLeadId,
      approverId: relationships.approverId,
      hrPartnerId: relationships.hrPartnerId,
    };
    const validation = validateEmployeeInput(candidate);
    if (!validation.success) {
      issues.push(...validation.errors);
      addRow('INVALID');
      return;
    }

    const validEmployee = validation.data;
    const matchingIndex = workingEmployees.findIndex(employee => employee.code.toUpperCase() === validEmployee.code.toUpperCase() ||
      employee.username.toLowerCase() === validEmployee.username.toLowerCase());
    const matchingEmployee = matchingIndex >= 0 ? workingEmployees[matchingIndex] : undefined;
    const changes = makeChanges(matchingEmployee, validEmployee, workingEmployees, profiles);
    if (matchingEmployee && sameImportedValues(matchingEmployee, validEmployee)) {
      counts.UNCHANGED += 1;
      rows.push({ rowNumber, status: 'UNCHANGED', name, code, changes: [], issues: [] });
      return;
    }
    if (matchingEmployee) {
      workingEmployees[matchingIndex] = { ...validEmployee, id: matchingEmployee.id };
      counts.UPDATE += 1;
      rows.push({ rowNumber, status: 'UPDATE', name, code, changes, issues: [] });
      return;
    }
    const newEmployee: Employee = { ...validEmployee, id: newEmployeeId(code) };
    workingEmployees.push(newEmployee);
    counts.NEW += 1;
    rows.push({ rowNumber, status: 'NEW', name, code, changes: makeChanges(undefined, validEmployee, workingEmployees, profiles), issues: [] });
  });

  if (mode === 'replace') {
    const importedIds = new Set(rows.filter(row => row.status === 'NEW' || row.status === 'UPDATE' || row.status === 'UNCHANGED')
      .map(row => workingEmployees.find(employee => employee.code.toUpperCase() === row.code.toUpperCase())?.id)
      .filter((id): id is string => Boolean(id)));
    counts.removed = employees.filter(employee => !protectedAdmins.some(admin => admin.id === employee.id) && !importedIds.has(employee.id)).length;
  }

  const changedCount = counts.NEW + counts.UPDATE;
  return { employees: workingEmployees, rows, counts, errors, changedCount };
}

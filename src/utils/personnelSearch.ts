import type { Employee } from '../types';

const DIGIT_MAP: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

export function normalizeDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, digit => DIGIT_MAP[digit] || digit);
}

export function normalizePersonnelCode(value: string): string {
  return normalizeDigits(String(value || '').normalize('NFKC'))
    .trim()
    .toLocaleUpperCase()
    .replace(/[\s\u200c\u200f\-‐‑‒–—_./\\]+/g, '');
}

export function matchesPersonnelCode(code: string, query: string): boolean {
  const normalizedQuery = normalizePersonnelCode(query);
  return Boolean(normalizedQuery && normalizePersonnelCode(code).includes(normalizedQuery));
}

export function normalizeSearchText(value: string): string {
  return normalizeDigits(String(value || '').normalize('NFKC'))
    .toLocaleLowerCase()
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[\u200c\u200f]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function employeeSearchScore(employee: Employee, query: string, extraText: string[] = []): number {
  const normalizedQuery = normalizeSearchText(query);
  return scoreNormalizedEmployee(employee, normalizedQuery, normalizePersonnelCode(query), extraText);
}

function scoreNormalizedEmployee(employee: Employee, normalizedQuery: string, codeQuery: string, extraText: string[] = []): number {
  if (!normalizedQuery) return 1;
  const code = normalizePersonnelCode(employee.code);
  if (codeQuery && code === codeQuery) return 100;
  if (codeQuery && code.includes(codeQuery)) return 80;
  const text = [employee.name, employee.username, employee.unit, ...extraText]
    .map(normalizeSearchText)
    .join(' ');
  return text.includes(normalizedQuery) ? 40 : 0;
}

export function matchesEmployeeSearch(employee: Employee, query: string, extraText: string[] = []): boolean {
  return employeeSearchScore(employee, query, extraText) > 0;
}

/** Stable ordering puts exact personnel-code matches ahead of text matches. */
export function rankEmployeesBySearch<T extends Employee>(employees: T[], query: string, extraText?: (employee: T) => string[]): T[] {
  if (!query.trim()) return employees;
  const textQuery = normalizeSearchText(query), codeQuery = normalizePersonnelCode(query);
  return employees
    .map((employee, index) => ({ employee, index, score: scoreNormalizedEmployee(employee, textQuery, codeQuery, extraText?.(employee)) }))
    .filter(result => result.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(result => result.employee);
}

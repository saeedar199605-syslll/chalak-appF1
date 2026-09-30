import type { Criterion, Evaluation } from '../types';

export type ProtectedImportType = 'MIS' | 'KASRA';
export type MasterDataImportType = 'EMPLOYEE' | 'CRITERIA';
export type SourceImportContext =
  | { importType: ProtectedImportType; operationId: string; evaluationPeriodId: string }
  | { importType: MasterDataImportType; operationId: string };
export type ProtectedSourceImportContext = Extract<SourceImportContext, { evaluationPeriodId: string }>;
export type MasterDataSourceImportContext = Extract<SourceImportContext, { importType: MasterDataImportType }>;

export function isSourceImportContext(value: unknown): value is SourceImportContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const context = value as Partial<SourceImportContext>;
  if (typeof context.operationId !== 'string' || !/^[a-zA-Z0-9:_-]{8,100}$/.test(context.operationId)) return false;
  if (context.importType === 'EMPLOYEE' || context.importType === 'CRITERIA') return !('evaluationPeriodId' in context);
  return (context.importType === 'MIS' || context.importType === 'KASRA') &&
    typeof context.evaluationPeriodId === 'string' && context.evaluationPeriodId.length > 0 && context.evaluationPeriodId.length <= 200;
}

export function isProtectedSourceImportContext(value: SourceImportContext): value is ProtectedSourceImportContext {
  return value.importType === 'MIS' || value.importType === 'KASRA';
}

export function isMasterDataSourceImportContext(value: SourceImportContext): value is MasterDataSourceImportContext {
  return value.importType === 'EMPLOYEE' || value.importType === 'CRITERIA';
}

function withoutKeys(value: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

function equalExcept(previous: Record<string, unknown>, next: Record<string, unknown>, allowed: string[]): boolean {
  return JSON.stringify(withoutKeys(previous, allowed)) === JSON.stringify(withoutKeys(next, allowed));
}

function kasraScore(criterion: Criterion, raw: number, label?: string): number | null {
  switch (criterion.misMetricKey) {
    case 'attendance_delay': return raw <= 15 ? 5 : raw <= 45 ? 4 : raw <= 120 ? 3 : raw <= 240 ? 2 : 1;
    case 'attendance_absence': return raw === 0 ? 5 : raw <= 1 ? 3 : raw <= 2 ? 2 : 1;
    case 'discipline': return raw === 0 ? 5 : raw === 1 ? 3 : 1;
    default:
      if (label !== 'kasra_composite_score') return null;
      return Math.max(0, Math.min(5, Math.round(raw * 10) / 10));
  }
}

function misScore(criterion: Criterion, raw: number, label?: string): number | null {
  switch (criterion.misMetricKey) {
    case 'efficiency': return raw >= 104 ? 5 : raw >= 99 ? 4 : raw >= 92 ? 3 : raw >= 80 ? 2 : 1;
    case 'scrap_rate': return raw <= 1.1 ? 5 : raw <= 2 ? 4 : raw <= 3.2 ? 3 : raw <= 5 ? 2 : 1;
    case 'quality_score': return raw >= 98 ? 5 : raw >= 95 ? 4 : raw >= 90 ? 3 : raw >= 85 ? 2 : 1;
    case 'output_qty':
      if (label !== 'output_qty_ratio') return null;
      return raw >= 1.04 ? 5 : raw >= 0.98 ? 4 : raw >= 0.9 ? 3 : raw >= 0.8 ? 2 : 1;
    case 'downtime': return raw <= 2 ? 5 : raw <= 4 ? 4 : raw <= 6 ? 3 : raw <= 9 ? 2 : 1;
    default:
      if (label !== 'mis_composite_score') return null;
      return raw >= 0 && raw <= 5 ? Math.round(raw * 10) / 10 : null;
  }
}

/** Server and browser share this strict source-owned score shape check. */
export function validImportedScoreChange(
  previous: Evaluation['scores'][number],
  next: Evaluation['scores'][number],
  criterion: Criterion | undefined,
  importType: ProtectedImportType,
): boolean {
  const source = importType.toLowerCase();
  const docPrefix = importType === 'KASRA' ? 'داده کسری:' : 'داده خودکار MIS:';
  if (!criterion || criterion.scoringSource !== source || criterion.autoPopulate === false ||
      next.sourceType !== source || next.autoPopulated !== true ||
      typeof next.value !== 'number' || !Number.isFinite(next.value) || next.value < 0 || next.value > 5 ||
      typeof next.rawMetricValue !== 'number' || !Number.isFinite(next.rawMetricValue) || next.rawMetricValue < 0 ||
      typeof next.doc !== 'string' || !next.doc.startsWith(docPrefix)) return false;

  if (!equalExcept(
    previous as unknown as Record<string, unknown>,
    next as unknown as Record<string, unknown>,
    ['value', 'doc', 'sourceType', 'autoPopulated', 'rawMetricValue', 'rawMetricLabel']
  )) return false;

  if (importType === 'KASRA') {
    const expected = kasraScore(criterion, next.rawMetricValue, next.rawMetricLabel);
    return expected !== null && next.value === expected;
  }
  const expected = importType === 'MIS'
    ? misScore(criterion, next.rawMetricValue, next.rawMetricLabel)
    : null;
  return importType === 'MIS' && expected !== null && next.value === expected;
}

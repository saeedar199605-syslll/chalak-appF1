/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Custom Excel Template Builder
 *
 * Allows users to define custom Excel templates with typed fields:
 * - text    (string)
 * - numeric (number)
 * - date    (Date / Persian date string)
 * - dropdown (constrained to options)
 *
 * Templates are persisted via the AppDatabase misc storage so they survive reloads.
 */
import { Employee, Criterion, JobProfile } from '../types';
import { downloadWorkbook } from './excelWorkbook';
import { db } from './db';

export type TemplateFieldType = 'text' | 'numeric' | 'date' | 'dropdown';

export interface TemplateField {
  id: string;         // stable field id
  key: string;         // column header (user-facing)
  type: TemplateFieldType;
  label: string;       // display label
  required: boolean;
  options?: string[];  // for dropdown type only
  width?: number;      // column width
}

export interface ExcelTemplate {
  id: string;
  name: string;
  code: string;             // unique, uppercase
  description?: string;
  fields: TemplateField[];
  period?: string;
  createdAt: number;        // epoch ms
  updatedAt: number;        // epoch ms
  createdBy?: string;       // username
}

export const FIELD_TYPE_LABELS: Record<TemplateFieldType, string> = {
  text: 'متنی',
  numeric: 'عددی',
  date: 'تاریخ',
  dropdown: 'لیست کشویی (Dropdown)',
};

export const FIELD_TYPE_VALIDATORS: Record<TemplateFieldType, (val: string) => boolean> = {
  text: (val: string) => true, // any string accepted
  numeric: (val: string) => val === '' || /^-?\d+(\.\d+)?$/.test(val.trim()),
  date: (val: string) => val === '' || !isNaN(Date.parse(val)) || /^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/.test(val.trim()) || /^\d{4}\/\d{2}\/\d{2}$/.test(val.trim()),
  dropdown: (val: string) => true, // validated against options separately
};

export const TEMPLATE_STORAGE_KEY = 'chalak_excel_templates';
const MAX_FIELD_NAME_LENGTH = 100;

export class TemplateBuilderService {
  private storageKey = TEMPLATE_STORAGE_KEY;

  /** Load all saved templates */
  getAll(): ExcelTemplate[] {
    return db.getMiscData<ExcelTemplate[]>(this.storageKey, []);
  }

  /** Load a single template by id */
  getById(id: string): ExcelTemplate | null {
    return this.getAll().find(t => t.id === id) || null;
  }

  /** Load a single template by code */
  getByCode(code: string): ExcelTemplate | null {
    return this.getAll().find(t => t.code.toLowerCase() === code.toLowerCase()) || null;
  }

  /**
   * Validate a template definition before saving.
   * Returns { valid: true } or { valid: false, errors: [...] }
   */
  validate(template: Omit<ExcelTemplate, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!template.name || template.name.trim().length === 0) {
      errors.push('نام قالب نمی‌تواند خالی باشد.');
    }
    if (!template.code || template.code.trim().length === 0) {
      errors.push('کد قالب نمی‌تواند خالی باشد.');
    }

    // Duplicate code check (exclude self on update)
    const all = this.getAll();
    const codeExists = all.some(t => t.code.toLowerCase() === template.code!.toLowerCase() && t.id !== (template.id || undefined));
    if (codeExists) {
      errors.push(`کد قالب «${template.code}» تکراری است.`);
    }

    if (!template.fields || template.fields.length === 0) {
      errors.push('حداقل یک فیلد در قالب باید تعریف شود.');
    }

    const seenKeys = new Set<string>();
    const seenIds = new Set<string>();
    template.fields?.forEach((f, idx) => {
      const fieldErrors = this.validateField(f, idx + 1);
      errors.push(...fieldErrors);

      if (f.key && seenKeys.has(f.key.toLowerCase())) {
        errors.push(`فیلد شماره ${idx + 1}: کلید/نام ستون «${f.key}» تکراری است.`);
      }
      if (f.key) seenKeys.add(f.key.toLowerCase());

      if (f.id && seenIds.has(f.id)) {
        errors.push(`فیلد شماره ${idx + 1}: شناسه داخلی تکراری است.`);
      }
      if (f.id) seenIds.add(f.id);
    });

    return { valid: errors.length === 0, errors };
  }

  private validateField(f: TemplateField, index: number): string[] {
    const errors: string[] = [];
    if (!f.label && !f.key) {
      errors.push(`فیلد شماره ${index}: نام یا کلید نمی‌تواند خالی باشد.`);
    }
    if (!f.key || f.key.trim().length === 0) {
      errors.push(`فیلد شماره ${index}: کلید ستون نمی‌تواند خالی باشد.`);
    }
    if (f.key && f.key.length > MAX_FIELD_NAME_LENGTH) {
      errors.push(`فیلد شماره ${index}: نام ستون بیش از ${MAX_FIELD_NAME_LENGTH} کاراکتر است.`);
    }
    if (!['text', 'numeric', 'date', 'dropdown'].includes(f.type)) {
      errors.push(`فیلد شماره ${index}: نوع «${f.type}» پشتیبانی نمی‌شود.`);
    }
    if (f.type === 'dropdown') {
      if (!f.options || f.options.length === 0) {
        errors.push(`فیلد شماره ${index} (لیست کشویی): حداقل یک گزینه لازم است.`);
      }
      if (f.options) {
        const uniqueOpts = new Set(f.options.map(o => o.trim()));
        if (uniqueOpts.size !== f.options.length) {
          errors.push(`فیلد شماره ${index} (لیست کشویی): گزینه‌های تکراری وجود دارد.`);
        }
      }
    }
    return errors;
  }

  /**
   * Save (create or update) a template. Validates first.
   */
  save(template: Omit<ExcelTemplate, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): { success: boolean; errors?: string[]; template?: ExcelTemplate } {
    const validation = this.validate(template);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    const all = this.getAll();
    const now = Date.now();
    const normalizedFields = this.normalizeFields(template.fields);

    if (template.id && all.some(t => t.id === template.id)) {
      // Update
      const updated: ExcelTemplate = {
        ...all.find(t => t.id === template.id)!,
        id: template.id,
        name: template.name.trim(),
        code: template.code.trim().toUpperCase(),
        description: template.description?.trim(),
        fields: normalizedFields,
        period: template.period,
        updatedAt: now,
        createdBy: template.createdBy,
      };
      const idx = all.findIndex(t => t.id === template.id);
      all[idx] = updated;
      db.saveMiscData(this.storageKey, all);
      return { success: true, template: updated };
    }

    // Create
    const code = template.code.trim().toUpperCase();
    if (all.some(t => t.code.toLowerCase() === code.toLowerCase())) {
      return { success: false, errors: [`کد قالب «${code}» تکراری است.`] };
    }

    const newTemplate: ExcelTemplate = {
      id: `tmpl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: template.name.trim(),
      code,
      description: template.description?.trim(),
      fields: normalizedFields,
      period: template.period,
      createdAt: now,
      updatedAt: now,
      createdBy: template.createdBy,
    };
    db.saveMiscData(this.storageKey, [...all, newTemplate]);
    return { success: true, template: newTemplate };
  }

  /**
   * Patch field definitions to ensure required defaults.
   */
  private normalizeFields(fields: TemplateField[]): TemplateField[] {
    return fields.map((f, idx) => ({
      id: f.id || `field-${idx + 1}`,
      key: f.key || f.label || `فیلد_${idx + 1}`,
      type: f.type || 'text',
      label: f.label || f.key || `فیلد ${idx + 1}`,
      required: f.required ?? false,
      options: f.type === 'dropdown' && f.options ? [...f.options] : undefined,
      width: f.width ?? 25,
    }));
  }

  /**
   * Delete a template by id
   */
  delete(id: string): { success: boolean; deleted: boolean } {
    const all = this.getAll();
    const filtered = all.filter(t => t.id !== id);
    if (filtered.length === all.length) return { success: false, deleted: false };
    db.saveMiscData(this.storageKey, filtered);
    return { success: true, deleted: true };
  }
}

/**
 * Generate and download an XLSX template file from a template definition.
 * The first row is headers; a hint row is NOT added (so import round-trip is clean).
 */
export function downloadTemplateXlsx(template: ExcelTemplate): void {
  const headers = template.fields.map(f => f.key);
  void downloadWorkbook(
    `قالب_${template.code}_${template.name.replace(/[\s]/g, '_')}.xlsx`,
    [{
      name: 'Template',
      rows: [headers],
      widths: template.fields.map(f => f.width ?? 25),
    }]
  );
}

/**
 * Validate a data row against a template definition.
 * Returns { valid, rowErrors: [{field, value, reason}] }
 */
export interface RowValidationError {
  field: string;
  value: string | number | undefined;
  reason: string;
}

export interface RowValidationResult {
  valid: boolean;
  rowErrors: RowValidationError[];
}

export function validateRow(row: Record<string, unknown>, template: ExcelTemplate): RowValidationResult {
  const errors: RowValidationError[] = [];

  for (const field of template.fields) {
    const val = row[field.key];
    const raw = val === undefined || val === null ? '' : String(val);

    if (field.required && (raw.trim() === '')) {
      errors.push({ field: field.key, value: raw, reason: `فیلد «${field.label}» اجباری است.` });
      continue;
    }

    if (raw.trim() === '') continue;

    // Type validation
    const validator = FIELD_TYPE_VALIDATORS[field.type];
    if (!validator(raw)) {
      errors.push({ field: field.key, value: raw, reason: `فرمت ${FIELD_TYPE_LABELS[field.type]} نامعتبر است.` });
      continue;
    }

    if (field.type === 'numeric') {
      const num = Number(raw);
      if (isNaN(num)) {
        errors.push({ field: field.key, value: raw, reason: `مقدار عددی نامعتبر است.` });
      }
    }

    if (field.type === 'dropdown' && field.options) {
      const normalized = raw.trim();
      if (!field.options.some(o => o.trim().toLowerCase() === normalized.toLowerCase())) {
        errors.push({ field: field.key, value: raw, reason: `مقدار انتخاب شده معتبر نیست. گزینه‌ها: ${field.options.join(', ')}` });
      }
    }

    if (field.type === 'date') {
      const parsed = Date.parse(raw);
      if (isNaN(parsed)) {
        errors.push({ field: field.key, value: raw, reason: `تاریخ نامعتبر است.` });
      }
    }
  }

  return { valid: errors.length === 0, rowErrors: errors };
}

/**
 * Parse a generic Excel sheet (from readWorkbookRows output) against a template,
 * producing validated records and an error report.
 */
export interface TemplateImportResult {
  records: Array<Record<string, unknown>>;
  errors: Array<{ rowNumber: number; field: string; value: string; reason: string }>;
  totalRows: number;
  validRows: number;
  invalidRows: number;
}

export function parseTemplateData(
  headers: string[],
  rawRows: unknown[][],
  template: ExcelTemplate
): TemplateImportResult {
  const records: Array<Record<string, unknown>> = [];
  const errors: TemplateImportResult['errors'] = [];

  // Validate that template fields exist in the sheet headers
  const headerSet = new Set(headers.map(h => String(h || '').trim()));
  for (const field of template.fields) {
    if (!headerSet.has(field.key.trim())) {
      errors.push({
        rowNumber: 0,
        field: field.key,
        value: '',
        reason: `ستون «${field.key}» در قالب تعریف نشده در فایل اکسل یافت نشد.`,
      });
    }
  }

  const fieldMap = new Map(template.fields.map(f => [f.key.trim(), f]));

  rawRows.forEach((row, idx) => {
    const rowNum = idx + 2; // +1 for header, +1 for 1-indexing
    const record: Record<string, unknown> = {};
    let rowValid = true;

    // Skip completely blank rows
    const nonBlankCount = row.filter(v => v !== undefined && v !== null && String(v).trim() !== '').length;
    if (nonBlankCount === 0) {
      errors.push({ rowNumber: rowNum, field: '__row__', value: '', reason: 'ردیف خالی است.' });
      return;
    }

    headers.forEach((header, colIdx) => {
      const cleanHeader = String(header || '').trim();
      const field = fieldMap.get(cleanHeader);
      const cellValue = row[colIdx];
      const raw = cellValue === undefined || cellValue === null ? '' : String(cellValue);

      if (field) {
        // Type coercion
        if (field.type === 'numeric') {
          record[field.key] = raw === '' ? undefined : Number(raw);
        } else if (field.type === 'date') {
          record[field.key] = raw;
        } else {
          record[field.key] = raw;
        }
      }
    });

    // Validate required + types
    for (const field of template.fields) {
      const val = record[field.key];
      const raw = val === undefined || val === null ? '' : String(val);

      if (field.required && raw.trim() === '') {
        errors.push({ rowNumber: rowNum, field: field.key, value: raw, reason: `فیلد «${field.label}» اجباری است.` });
        rowValid = false;
      }

      if (raw.trim() !== '') {
        const validator = FIELD_TYPE_VALIDATORS[field.type];
        if (!validator(raw)) {
          errors.push({ rowNumber: rowNum, field: field.key, value: raw, reason: `فرمت ${FIELD_TYPE_LABELS[field.type]} نامعتبر است.` });
          rowValid = false;
        }

        if (field.type === 'dropdown' && field.options) {
          if (!field.options.some(o => o.trim().toLowerCase() === raw.trim().toLowerCase())) {
            errors.push({ rowNumber: rowNum, field: field.key, value: raw, reason: `مقدار خارج از لیست گزینه‌ها.` });
            rowValid = false;
          }
        }

        if (field.type === 'date') {
          if (isNaN(Date.parse(raw))) {
            errors.push({ rowNumber: rowNum, field: field.key, value: raw, reason: `تاریخ نامعتبر است.` });
            rowValid = false;
          }
        }
      }
    }

    if (rowValid) records.push(record);
    else errors.push({ rowNumber: rowNum, field: '__row__', value: '', reason: `ردیف ${rowNum} حاوی خطا است و صادرات نشد.` });
  });

  return {
    records,
    errors,
    totalRows: rawRows.length,
    validRows: records.length,
    invalidRows: rawRows.length - records.length,
  };
}

import type ExcelJS from 'exceljs';

export type ExcelCell = string | number | boolean | Date | null | undefined;

export interface ExcelSheetSpec {
  name: string;
  rows: ExcelCell[][];
  widths?: number[];
}

export interface ParsedWorkbook {
  sheets: string[];
  rowsBySheet: Record<string, ExcelCell[][]>;
}

export function recordsToRows(records: Array<Record<string, ExcelCell>>): ExcelCell[][] {
  if (records.length === 0) return [];
  const headers = Object.keys(records[0]);
  return [headers, ...records.map(record => headers.map(header => record[header]))];
}

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadWorkbook(fileName: string, sheets: ExcelSheetSpec[]): Promise<void> {
  try {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'سامانه اصفهان چالاک';
    workbook.created = new Date();

    for (const sheet of sheets) {
      const worksheet = workbook.addWorksheet(sheet.name, {
        views: [{ rightToLeft: true }]
      });
      worksheet.addRows(sheet.rows);

      sheet.widths?.forEach((width, index) => {
        worksheet.getColumn(index + 1).width = width;
      });

      const header = worksheet.getRow(1);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A5F' }
      };
      header.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      header.height = 28;
      worksheet.views = [{ state: 'frozen', ySplit: 1, rightToLeft: true }];
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(buffer);
    downloadBlob(new Blob([bytes.slice().buffer], { type: MIME_XLSX }), fileName);
  } catch (error) {
    console.error('Excel export failed', error);
    window.alert('ساخت فایل اکسل با خطا مواجه شد. لطفاً دوباره تلاش کنید.');
  }
}

function normalizeCell(value: ExcelJS.CellValue): ExcelCell {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;
  if ('result' in value && value.result !== undefined) {
    return normalizeCell(value.result);
  }
  if ('richText' in value) {
    return value.richText.map(part => part.text).join('');
  }
  if ('text' in value) return value.text;
  if ('error' in value) return value.error;
  return String(value);
}

function trimTrailingEmptyCells(row: ExcelCell[]): ExcelCell[] {
  while (row.length > 0 && (row[row.length - 1] === '' || row[row.length - 1] == null)) {
    row.pop();
  }
  return row;
}

function parseCsv(text: string): ExcelCell[][] {
  const rows: ExcelCell[][] = [];
  let row: ExcelCell[] = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(value);
      rows.push(trimTrailingEmptyCells(row));
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  if (value !== '' || row.length > 0) {
    row.push(value);
    rows.push(trimTrailingEmptyCells(row));
  }
  if (rows[0]?.[0] && typeof rows[0][0] === 'string') {
    rows[0][0] = rows[0][0].replace(/^\uFEFF/, '');
  }
  return rows;
}

export async function readWorkbookRows(file: File): Promise<ParsedWorkbook> {
  if (file.name.toLowerCase().endsWith('.csv')) {
    const name = 'CSV';
    return { sheets: [name], rowsBySheet: { [name]: parseCsv(await file.text()) } };
  }

  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new Error('فرمت فایل پشتیبانی نمی‌شود؛ فایل را با پسوند XLSX یا CSV انتخاب کنید.');
  }

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(await file.arrayBuffer()) as unknown as ExcelJS.Buffer);
  const rowsBySheet: Record<string, ExcelCell[][]> = {};

  workbook.eachSheet(worksheet => {
    const rows: ExcelCell[][] = [];
    worksheet.eachRow({ includeEmpty: true }, row => {
      const values = row.values as ExcelJS.CellValue[];
      rows.push(trimTrailingEmptyCells(values.slice(1).map(normalizeCell)));
    });
    rowsBySheet[worksheet.name] = rows;
  });

  const sheets = Object.keys(rowsBySheet);
  return { sheets, rowsBySheet };
}

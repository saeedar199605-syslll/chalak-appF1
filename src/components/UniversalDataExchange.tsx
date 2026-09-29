/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { VirtualizedTable } from './VirtualizedTable';
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  FileText, 
  FileJson, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Layers, 
  RefreshCw,
  Info
} from 'lucide-react';

export interface ImportPreviewRow {
  rowNumber: number;
  status: string;
  name: string;
  code: string;
  changes?: Array<{ field: string; before: string; after: string }>;
  issues?: string[];
}

export interface PreparedImport {
  preview: {
    rows: ImportPreviewRow[];
    counts: Record<string, number>;
    changedCount: number;
    removedCount?: number;
  };
  commit: () => { count: number; message?: string; errors?: string[] };
}

export interface DataExchangeConfig<T> {
  entityName: string; // e.g. 'بانک شاخص‌های شایستگی', 'پروفایل‌های شغلی', 'مدیریت پرسنل', 'ارزیابی‌ها'
  entityKey: string; // e.g. 'criteria', 'job_profiles', 'employees', 'evaluations'
  items: T[];
  onImport: (importedItems: any[], mode: 'merge' | 'replace') => { count: number; message?: string; errors?: string[] };
  prepareImport?: (importedItems: any[], mode: 'merge' | 'replace') => PreparedImport;
  csvHeaders: { key: keyof T | string; label: string; accessor?: (item: T) => any }[];
  templateSampleRows?: Record<string, string>[];
}

interface UniversalDataExchangeProps<T> {
  config: DataExchangeConfig<T>;
  isOpen: boolean;
  onClose: () => void;
  externalImportRequest?: { id: string; items: any[]; mode?: 'merge' | 'replace' } | null;
  theme?: 'dark' | 'light';
}

export default function UniversalDataExchange<T>({
  config,
  isOpen,
  onClose,
  externalImportRequest = null,
  theme = 'dark'
}: UniversalDataExchangeProps<T>) {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [rawTextInput, setRawTextInput] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string; errors?: string[] } | null>(null);
  const [pendingImport, setPendingImport] = useState<PreparedImport | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importCommitStartedRef = useRef(false);
  const lastExternalImportIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen || !externalImportRequest || !config.prepareImport || lastExternalImportIdRef.current === externalImportRequest.id) return;
    lastExternalImportIdRef.current = externalImportRequest.id;
    const mode = externalImportRequest.mode || 'merge';
    setActiveTab('import');
    setImportMode(mode);
    setStatusMessage(null);
    setRawTextInput('');
    try {
      const prepared = config.prepareImport(externalImportRequest.items, mode);
      setPendingImport(prepared);
      setStatusMessage({ type: 'info', text: 'Preview ready. Employee data has not been changed.' });
      importCommitStartedRef.current = false;
    } catch (error) {
      setPendingImport(null);
      setStatusMessage({ type: 'error', text: `Import preview could not be prepared: ${error instanceof Error ? error.message : String(error)}` });
    }
  }, [config, externalImportRequest, isOpen]);

  if (!isOpen) return null;

  const isDark = theme === 'dark';

  // Helper: Sanitize string against CSV Formula Injection & DDE attacks
  const sanitizeCSVCell = (raw: any): string => {
    if (raw === undefined || raw === null) return '""';
    let str = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
    // If text starts with risky formula triggers, neutralize with single quote prefix
    if (/^[=+\-@\t\r]/.test(str)) {
      str = "'" + str;
    }
    return `"${str.replace(/"/g, '""')}"`;
  };

  // Helper: Sanitize imported string data to prevent XSS / malicious payloads
  const sanitizeImportString = (val: any): string => {
    if (typeof val !== 'string') return val;
    return val.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').trim();
  };

  // Robust CSV Line parser respecting RFC 4180 quotes
  const parseCSVLine = (line: string, delimiter: string = ','): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        if (inQuotes && line[i + 1] === char) {
          current += char;
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result.map(s => s.replace(/^["']|["']$/g, ''));
  };

  // 1. EXPORT TO CSV (Excel UTF-8 BOM compatible)
  const handleExportCSV = () => {
    try {
      const headersRow = config.csvHeaders.map(h => `"${h.label.replace(/"/g, '""')}"`).join(',');
      const rows = config.items.map(item => {
        return config.csvHeaders.map(h => {
          const val = h.accessor ? h.accessor(item) : (item as any)[h.key];
          return sanitizeCSVCell(val);
        }).join(',');
      });

      const csvContent = [headersRow, ...rows].join('\n');
      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `chalak_${config.entityKey}_${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setStatusMessage({ type: 'success', text: `فایل استاندارد CSV (اکسل) شامل ${config.items.length} رکورد با موفقیت ایجاد و دانلود شد.` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `خطا در صدور فایل CSV: ${err.message}` });
    }
  };

  const handleExportXLSX = async () => {
    try {
      setStatusMessage({ type: 'info', text: 'در حال ساخت فایل اکسل واقعی...' });
      const { downloadWorkbook } = await import('../utils/excelWorkbook');
      const headers = config.csvHeaders.map(header => header.label);
      const dataRows = config.items.map(item => config.csvHeaders.map(header => {
        const value = header.accessor ? header.accessor(item) : (item as any)[header.key];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) return value;
        return JSON.stringify(value);
      }));
      const sheetName = config.entityKey.replace(/[\\/?*:[\]]/g, '_').slice(0, 31) || 'Data';
      const widths = config.csvHeaders.map(() => 20);

      // Keep status neutral after this resolves: downloadWorkbook handles its
      // own browser download errors, so resolution does not prove a file saved.
      await downloadWorkbook(`chalak_${config.entityKey}_${Date.now()}.xlsx`, [{
        name: sheetName,
        rows: [headers, ...dataRows],
        widths,
      }]);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `خطا در صدور فایل اکسل: ${err.message || 'خطای نامشخص'}` });
    }
  };

  // 2. EXPORT TO JSON (Clean Structured Backup)
  const handleExportJSON = () => {
    try {
      const jsonStr = JSON.stringify(config.items, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `chalak_${config.entityKey}_${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setStatusMessage({ type: 'success', text: `پشتیبان کامل ساختاریافته JSON شامل ${config.items.length} رکورد با موفقیت دانلود شد.` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `خطا در صدور فایل JSON: ${err.message}` });
    }
  };

  // 3. DOWNLOAD TEMPLATE SAMPLE
  const handleDownloadTemplate = () => {
    try {
      const headersRow = config.csvHeaders.map(h => `"${h.label}"`).join(',');
      let sampleRows = '';
      if (config.templateSampleRows && config.templateSampleRows.length > 0) {
        sampleRows = '\n' + config.templateSampleRows.map(row => {
          return config.csvHeaders.map(h => `"${row[h.label] || row[h.key as string] || ''}"`).join(',');
        }).join('\n');
      }

      const templateContent = headersRow + sampleRows;
      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), templateContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `template_${config.entityKey}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `خطا در دانلود قالب اکسل: ${err.message}` });
    }
  };

  // 4. PARSE AND PROCESS IMPORT
  const processImportString = (content: string) => {
    try {
      let parsedItems: any[] = [];
      const trimmed = content.trim();

      // Check if JSON
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed);
        parsedItems = Array.isArray(parsed) ? parsed : [parsed];
      } else {
        // Parse CSV or TSV
        const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 2) {
          throw new Error('فایل یا متن ورودی باید حداقل شامل یک سطر عنوان (Header) و یک سطر داده باشد.');
        }

        const delimiter = lines[0].includes('\t') ? '\t' : ',';
        const headers = parseCSVLine(lines[0], delimiter).map(h => sanitizeImportString(h));

        for (let i = 1; i < lines.length; i++) {
          const rawLine = lines[i];
          const cols = parseCSVLine(rawLine, delimiter).map(c => sanitizeImportString(c));
          const obj: any = {};
          
          headers.forEach((h, colIdx) => {
            const cleanHeader = h.trim();
            const matchedHeader = config.csvHeaders.find(ch => 
              ch.label.toLowerCase() === cleanHeader.toLowerCase() || 
              String(ch.key).toLowerCase() === cleanHeader.toLowerCase()
            );
            const keyToUse = matchedHeader ? matchedHeader.key : cleanHeader;
            obj[keyToUse] = cols[colIdx] !== undefined ? cols[colIdx] : '';
            // Also keep Persian key in case custom mapper uses it
            obj[cleanHeader] = cols[colIdx] !== undefined ? cols[colIdx] : '';
          });

          parsedItems.push(obj);
        }
      }

      if (parsedItems.length === 0) {
        throw new Error('هیچ داده معتبری برای درون‌ریزی شناسایی نشد.');
      }

      if (config.prepareImport) {
        const prepared = config.prepareImport(parsedItems, importMode);
        setPendingImport(prepared);
        importCommitStartedRef.current = false;
        setStatusMessage({ type: 'info', text: 'Preview ready. Employee data has not been changed.' });
        setRawTextInput('');
        return;
      }

      const result = config.onImport(parsedItems, importMode);
      setStatusMessage({
        type: result.errors && result.errors.length > 0 && result.count === 0 ? 'error' : 'success',
        text: result.message || `تعداد ${result.count} رکورد با موفقیت پردازش و در سامانه ثبت گردید.`,
        errors: result.errors
      });
      setRawTextInput('');
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `خطا در پردازش فایل: ${err.message}` });
    }
  };

  const cancelPreparedImport = () => {
    setPendingImport(null);
    setRawTextInput('');
    setStatusMessage({ type: 'info', text: 'Import cancelled. Employee data was not changed.' });
    importCommitStartedRef.current = false;
  };

  const confirmPreparedImport = () => {
    if (!pendingImport || importCommitStartedRef.current) return;
    importCommitStartedRef.current = true;
    try {
      const result = pendingImport.commit();
      setPendingImport(null);
      setStatusMessage({
        type: result.errors?.length && result.count === 0 ? 'error' : 'success',
        text: result.message || `Imported ${result.count} employee records.`,
        errors: result.errors,
      });
    } catch (error) {
      setStatusMessage({ type: 'error', text: `Import could not be applied: ${error instanceof Error ? error.message : String(error)}` });
    }
  };

  const closeExchange = () => {
    setPendingImport(null);
    setRawTextInput('');
    setStatusMessage(null);
    importCommitStartedRef.current = false;
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // SECURITY/CORRECTNESS: XLSX files must be parsed as real workbooks (cell-based),
    // NOT as CSV text. Only route .xlsx through readWorkbookRows.
    // CSV and JSON files continue through text parsing.
    if (file.name.toLowerCase().endsWith('.xlsx')) {
      handleXlsxUpload(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        if (text) {
          processImportString(text);
        }
      };
      reader.onerror = () => {
        setStatusMessage({ type: 'error', text: 'خطا در خواندن فایل از حافظه دستگاه.' });
      };
      reader.readAsText(file, 'UTF-8');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Parse real XLSX workbook using ExcelJS for proper cell/column structure
  const handleXlsxUpload = async (file: File) => {
    try {
      setStatusMessage({ type: 'info', text: 'در حال پردازش فایل Excel...' });
      // Import readWorkbookRows dynamically to avoid circular deps
      const { readWorkbookRows } = await import('../utils/excelWorkbook');
      const workbook = await readWorkbookRows(file);
      const sheetName = workbook.sheets[0];
      const rows = workbook.rowsBySheet[sheetName] || [];
      if (rows.length < 2) {
        throw new Error('فایل اکسل خالی است یا شامر یک سطر داده نیست.');
      }
      // Convert workbook rows to CSV-like text for existing parser
      // Headers from first row, data from subsequent rows — each cell is a real Excel cell
      const headers = (rows[0] || []).map(h => String(h || ''));
      const csvLines = [headers.join('\t')];
      for (let i = 1; i < rows.length; i++) {
        const row = (rows[i] || []).map(c => String(c || ''));
        // Pad row to header length
        while (row.length < headers.length) row.push('');
        csvLines.push(row.join('\t'));
      }
      const csvText = csvLines.join('\n');
      processImportString(csvText);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `خطا در پردازش فایل Excel: ${err.message || 'فرمت نامعتبر'}` });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200" dir="rtl">
      <div className={`w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
        isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        
        {/* Modal Header */}
        <div className={`p-5 border-b flex items-center justify-between ${
          isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center text-white shadow-md">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`font-black text-sm md:text-base ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                مرکز تبادل جامع داده: {config.entityName}
              </h3>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                ورود (Import) و خروجی کامل (Export) سازگار با اکسل، CSV و JSON
              </p>
            </div>
          </div>
          <button
            onClick={closeExchange}
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className={`flex border-b p-2 gap-2 ${
          isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-100/70'
        }`}>
          <button
            disabled={Boolean(pendingImport)}
            onClick={() => { setActiveTab('export'); setStatusMessage(null); }}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'export'
                ? 'bg-red-600 text-white shadow-md font-black'
                : isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800/50' : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>خروجی گرفتن و دانلود (Export)</span>
          </button>
          <button
            disabled={Boolean(pendingImport)}
            onClick={() => { setActiveTab('import'); setStatusMessage(null); }}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'import'
                ? 'bg-red-600 text-white shadow-md font-black'
                : isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800/50' : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>ورود اطلاعات و بارگذاری (Import)</span>
          </button>
        </div>

        {/* Status Notification */}
        {statusMessage && (
          <div className={`m-4 p-3.5 rounded-2xl border text-xs font-bold flex flex-col gap-1.5 ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : statusMessage.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
              : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
          }`}>
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{statusMessage.text}</span>
            </div>
            {statusMessage.errors && statusMessage.errors.length > 0 && (
              <ul className="list-disc list-inside text-[11px] font-normal text-rose-500 dark:text-rose-300 mt-1 space-y-0.5">
                {statusMessage.errors.slice(0, 5).map((e, idx) => (
                  <li key={idx}>{e}</li>
                ))}
                {statusMessage.errors.length > 5 && (
                  <li>و {statusMessage.errors.length - 5} خطای دیگر...</li>
                )}
              </ul>
            )}
          </div>
        )}

        {/* Tab Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {pendingImport ? (
            <div className="space-y-4" aria-label="Employee import preview">
              <div className={`rounded-2xl border p-4 ${isDark ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
                <h4 className="font-black text-sm">Preview before applying</h4>
                <p className="mt-1 text-xs">No employee records have been changed. Review the row classifications and old → new values, then confirm or cancel.</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
                  {['NEW', 'UPDATE', 'UNCHANGED', 'INVALID', 'DUPLICATE', 'UNKNOWN / UNMAPPED'].map(status => (
                    <span key={status} className="rounded-lg border border-current/20 px-2 py-1">{status}: {pendingImport.preview.counts[status] || 0}</span>
                  ))}
                  {pendingImport.preview.removedCount !== undefined && <span className="rounded-lg border border-current/20 px-2 py-1">REMOVED by replace: {pendingImport.preview.removedCount}</span>}
                </div>
              </div>

              <VirtualizedTable<ImportPreviewRow>
                items={pendingImport.preview.rows}
                columns={[{ header: 'Status', width: 'w-36' }, { header: 'Employee', width: 'w-56' }, { header: 'Proposed changes / issues', className: 'flex-1' }]}
                rowHeight={64}
                containerHeight={300}
                theme={theme}
                keyExtractor={row => `${row.rowNumber}-${row.code}`}
                emptyState={<p>No input rows to preview.</p>}
                renderRow={row => (
                  <>
                    <div className="w-36 shrink-0 pr-2 text-[10px] font-black" data-testid={`import-status-${row.rowNumber}`}>{row.status}</div>
                    <div className="w-56 shrink-0 truncate pr-2 text-[10px]">
                      <div className="font-bold">{row.name}</div>
                      <div className="text-slate-500">{row.code}</div>
                    </div>
                    <div className="min-w-0 flex-1 truncate text-[10px]">
                      {row.changes?.length ? row.changes.slice(0, 3).map(change => (
                        <div key={change.field} className="truncate"><span className="font-bold">{change.field}:</span> {change.before} → {change.after}</div>
                      )) : row.issues?.join(' · ') || 'No field changes'}
                      {(row.changes?.length || 0) > 3 && <div className="text-slate-500">+{(row.changes?.length || 0) - 3} more changes</div>}
                    </div>
                  </>
                )}
              />

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={cancelPreparedImport} className={`rounded-xl border px-4 py-3 text-xs font-bold ${isDark ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}>
                  Cancel import
                </button>
                <button type="button" onClick={confirmPreparedImport} className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white hover:bg-emerald-500" aria-label="Confirm and apply import">
                  Confirm and apply import ({pendingImport.preview.changedCount})
                </button>
              </div>
            </div>
          ) : activeTab === 'export' ? (
            <div className="space-y-4">
              <div className={`p-4 rounded-2xl border space-y-2 ${
                isDark ? 'bg-slate-800/40 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>تعداد رکوردهای آماده صدور:</span>
                  <span className="text-sm font-black text-red-500 font-mono">{config.items.length.toLocaleString('fa-IR')} رکورد</span>
                </div>
                <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  فایل خروجی شامل کلیه ستون‌های استاندارد جدول بوده و با نرم‌افزارهای Microsoft Excel، Google Sheets و سامانه‌های ERP سازگار است.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="p-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/20 transition-all cursor-pointer"
                >
                  <FileSpreadsheet className="w-5 h-5 shrink-0" />
                  <div className="text-right">
                    <div className="text-xs font-black">دانلود فایل CSV (اکسل)</div>
                    <div className="text-[10px] text-emerald-100/90 font-normal">فرمت استاندارد جدول با UTF-8 BOM</div>
                  </div>
                </button>

                <button
                  type="button"
                  aria-label="دانلود فایل XLSX"
                  onClick={() => { void handleExportXLSX(); }}
                  className={`p-4 rounded-2xl border font-bold flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-sm ${
                    isDark
                      ? 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700 hover:border-slate-600'
                      : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <FileSpreadsheet className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div className="text-right">
                    <div className="text-xs font-black">دانلود فایل XLSX</div>
                    <div className={`text-[10px] font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>کاربرگ واقعی با سلول‌های جداگانه</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleExportJSON}
                  className={`p-4 rounded-2xl border font-bold flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-sm ${
                    isDark 
                      ? 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700 hover:border-slate-600' 
                      : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <FileJson className="w-5 h-5 text-indigo-500 shrink-0" />
                  <div className="text-right">
                    <div className="text-xs font-black">دانلود ساختار کامل JSON</div>
                    <div className={`text-[10px] font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>پشتیبان‌گیری ساختاریافته سیستمی</div>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              
              {/* Import Mode Selection */}
              <div className={`flex items-center justify-between p-3.5 rounded-2xl border text-xs ${
                isDark ? 'bg-slate-800/40 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className={`font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>روش اعمال داده‌های جدید:</span>
                <div className="flex items-center gap-4">
                  <label className={`flex items-center gap-1.5 cursor-pointer font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'merge'}
                      onChange={() => setImportMode('merge')}
                      className="accent-red-600"
                    />
                    <span>افزودن و ادغام (Merge)</span>
                  </label>
                  <label className={`flex items-center gap-1.5 cursor-pointer font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="accent-red-600"
                    />
                    <span>جایگزینی کامل (Replace)</span>
                  </label>
                </div>
              </div>

              {/* Template Download Prompt */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs">
                <span className="text-indigo-600 dark:text-indigo-300 font-medium">نیاز به الگوی استاندارد جهت تکمیل داده‌ها دارید؟</span>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-[11px] flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>دانلود قالب نمونه</span>
                </button>
              </div>

              {/* Drag and Drop / File Picker */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group ${
                  isDark 
                    ? 'border-slate-700 hover:border-red-500 bg-slate-950/40' 
                    : 'border-slate-300 hover:border-red-500 bg-slate-50'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-red-600/10 border border-red-600/20 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <div className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  فایل Excel (XLSX)، CSV یا JSON خود را اینجا رها کنید یا کلیک نمایید
                </div>
                <div className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  پشتیبانی از فرمت‌های Excel (XLSX)، CSV، TXT تب‌بندی‌شده و JSON
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.json,.xlsx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {/* Or Paste Raw Text */}
              <div className="space-y-1.5">
                <label className={`block text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  یا کپی مستقیم متن / جدول اکسل (Paste):
                </label>
                <textarea
                  rows={4}
                  value={rawTextInput}
                  onChange={(e) => setRawTextInput(e.target.value)}
                  placeholder="سطرهای کپی‌شده از اکسل یا فایل متنی را اینجا قرار دهید..."
                  className={`w-full rounded-2xl p-3 text-xs font-mono focus:outline-none focus:border-red-500 transition-colors border ${
                    isDark 
                      ? 'bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600' 
                      : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                  }`}
                />
              </div>

              <button
                type="button"
                disabled={!rawTextInput.trim()}
                onClick={() => processImportString(rawTextInput)}
                className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-600/20 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>پردازش و ثبت داده‌های وارد شده</span>
              </button>

            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className={`p-4 border-t flex justify-end ${
          isDark ? 'border-slate-800 bg-slate-950/30' : 'border-slate-200 bg-slate-50'
        }`}>
          <button
            type="button"
            onClick={onClose}
            className={`px-5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
              isDark 
                ? 'bg-slate-800 hover:bg-slate-750 text-slate-300' 
                : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
            }`}
          >
            بستن پنجره
          </button>
        </div>

      </div>
    </div>
  );
}

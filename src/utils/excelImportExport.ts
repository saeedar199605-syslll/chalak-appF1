/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { downloadWorkbook, readWorkbookRows } from './excelWorkbook';
import { 
  KasraAttendanceRecord, 
  MISProductionRecord, 
  Employee, 
  Evaluation, 
  Criterion, 
  JobProfile,
  DynamicColumnMapping,
  DynamicExcelRowRecord
} from '../types';

/**
 * Calculates a 1-5 Performance Rating for Attendance & Punctuality from Kasra Data
 */
export function calculateKasraScore(
  delayMinutes: number,
  absenceDays: number,
  disciplineInfractions: number
): number {
  if (disciplineInfractions >= 2 || absenceDays >= 3) return 1;
  if (absenceDays > 0 || delayMinutes > 180 || disciplineInfractions === 1) return 2;
  if (delayMinutes > 45) return 3;
  if (delayMinutes > 15) return 4;
  return 5;
}

/**
 * Calculates a 1-5 Performance Rating for MIS Production & Quality Output
 */
export function calculateMISScore(
  efficiencyRate: number,
  scrapRate: number,
  qualityScore: number
): number {
  if (efficiencyRate < 80 || scrapRate > 5.0 || qualityScore < 85) return 1;
  if (efficiencyRate < 92 || scrapRate > 3.2 || qualityScore < 90) return 2;
  if (efficiencyRate < 99 || scrapRate > 2.0 || qualityScore < 95) return 3;
  if (efficiencyRate < 105 || scrapRate > 1.2 || qualityScore < 98) return 4;
  return 5;
}

/**
 * Generates and downloads standard Excel template for Kasra Attendance System
 */
export function downloadKasraExcelTemplate(employees: Employee[], period: string = 'نیمه اول ۱۴۰۵') {
  const headers = [
    'کد پرسنلی (Staff Code)',
    'نام و نام خانوادگی',
    'دوره ارزیابی (Period)',
    'کل ساعات کارکرد موظفی',
    'مجموع تاخیر و تعجیل (دقیقه)',
    'غیبت غیرموجه (روز)',
    'مرخصی استحقاقی/استعلاجی (روز)',
    'ساعات اضافه‌کاری',
    'تعداد تذکرات انضباطی',
    'توضیحات سامانه کسری'
  ];

  const sampleRows = employees.slice(0, 15).map((emp, idx) => [
    emp.code,
    emp.name,
    period,
    960,
    idx === 0 ? 10 : idx === 1 ? 45 : 0,
    0,
    idx % 2 === 0 ? 3 : 2,
    idx === 0 ? 45 : 30,
    0,
    'تاییدیه حضور شیفت بدون انحراف'
  ]);

  if (sampleRows.length === 0) {
    sampleRows.push([
      'EMP-1001',
      'کارمند نمونه',
      period,
      960,
      15,
      0,
      3,
      40,
      0,
      'نمونه ثبت استاندارد سامانه کسری'
    ]);
  }

  void downloadWorkbook(
    `نمونه_اکسل_کسری_اصفهان_چالاک_${period.replace(/\s+/g, '_')}.xlsx`,
    [{
      name: 'داده_های_حضور_غیاب_کسری',
      rows: [headers, ...sampleRows],
      widths: [22, 25, 18, 20, 24, 18, 24, 18, 20, 30]
    }]
  );
}

/**
 * Generates and downloads standard Excel template for MIS Production & Quality System
 */
export function downloadMISExcelTemplate(employees: Employee[], period: string = 'نیمه اول ۱۴۰۵') {
  const headers = [
    'کد پرسنلی (Staff Code)',
    'نام و نام خانوادگی',
    'دوره ارزیابی (Period)',
    'تعداد/میزان تولید واقعی',
    'تارگت و برنامه مصوب تولید',
    'درصد راندمان تولید (٪)',
    'نرخ ضایعات (٪)',
    'ساعات توقف خط (ساعت)',
    'امتیاز کنترل کیفیت QC (٪)',
    'توضیحات واحد MIS'
  ];

  const sampleRows = employees.slice(0, 15).map((emp, idx) => [
    emp.code,
    emp.name,
    period,
    12500 + idx * 300,
    12000,
    idx === 0 ? 104.2 : idx === 1 ? 98.5 : 101.0,
    idx === 0 ? 1.1 : idx === 1 ? 2.4 : 1.5,
    idx === 0 ? 3.5 : 5.0,
    idx === 0 ? 99.2 : 96.5,
    'تحقق کامل برنامه شیفت خط تولید'
  ]);

  if (sampleRows.length === 0) {
    sampleRows.push([
      'EMP-1001',
      'کارمند نمونه',
      period,
      12500,
      12000,
      104.2,
      1.1,
      3.5,
      99.0,
      'نمونه ثبت خروجی سیستم تولید MIS'
    ]);
  }

  void downloadWorkbook(
    `نمونه_اکسل_MIS_تولید_اصفهان_چالاک_${period.replace(/\s+/g, '_')}.xlsx`,
    [{
      name: 'داده_های_تولید_MIS',
      rows: [headers, ...sampleRows],
      widths: [22, 25, 18, 22, 22, 20, 16, 20, 24, 30]
    }]
  );
}

/**
 * Generates and downloads a COMPLETELY DYNAMIC Excel Template
 * customized with any selected criteria from the criteria bank,
 * staff profiles, units, and custom periods.
 */
export function downloadDynamicCriteriaExcelTemplate({
  employees,
  criteria,
  profiles,
  selectedCriteriaIds,
  selectedProfileId,
  selectedUnit,
  period = 'نیمه اول ۱۴۰۵',
  includeDocColumns = true,
  existingEvaluations = []
}: {
  employees: Employee[];
  criteria: Criterion[];
  profiles: JobProfile[];
  selectedCriteriaIds: string[];
  selectedProfileId?: string;
  selectedUnit?: string;
  period?: string;
  includeDocColumns?: boolean;
  existingEvaluations?: Evaluation[];
}) {
  // Filter employees
  let filteredEmployees = [...employees];
  if (selectedProfileId && selectedProfileId !== 'all') {
    filteredEmployees = filteredEmployees.filter(e => e.profileId === selectedProfileId);
  }
  if (selectedUnit && selectedUnit !== 'all') {
    filteredEmployees = filteredEmployees.filter(e => e.unit === selectedUnit);
  }

  // Selected criteria objects
  const activeCriteria = criteria.filter(c => selectedCriteriaIds.includes(c.id));

  // Build Headers
  const headers = [
    'کد پرسنلی (Staff Code)',
    'نام و نام خانوادگی',
    'عنوان شغلی',
    'واحد سازمانی',
    'دوره ارزیابی (Period)'
  ];

  // Add each criterion column
  activeCriteria.forEach(crit => {
    headers.push(`[${crit.code}] ${crit.name} (نمره ۱-۵)`);
    if (includeDocColumns) {
      headers.push(`شواهد و مستندات [${crit.code}]`);
    }
  });

  headers.push('توضیحات و بازخورد کلی سرپرست');

  // Build Rows
  const rows: any[][] = [];

  filteredEmployees.forEach(emp => {
    const prof = profiles.find(p => p.id === emp.profileId);
    const existingEval = existingEvaluations.find(ev => ev.empId === emp.id && ev.period === period);

    const row: any[] = [
      emp.code,
      emp.name,
      prof?.title || 'نامشخص',
      emp.unit || 'ستاد',
      period
    ];

    activeCriteria.forEach(crit => {
      // Find score if exists
      const existingScore = existingEval?.scores?.find(s => s.cid === crit.id);
      row.push(existingScore?.value || 3); // Default score 3
      if (includeDocColumns) {
        row.push(existingScore?.doc || '');
      }
    });

    row.push(existingEval?.note || '');
    rows.push(row);
  });

  if (rows.length === 0) {
    const defaultRow: any[] = [
      'EMP-1001',
      'کارمند نمونه',
      'کارشناس تولید و فرآیند',
      'واحد سالن پرس و برش',
      period
    ];
    activeCriteria.forEach(() => {
      defaultRow.push(4);
      if (includeDocColumns) defaultRow.push('مستندات عملکردی استاندارد');
    });
    defaultRow.push('ارزیابی عملکرد دوره‌ای ثبت شده است');
    rows.push(defaultRow);
  }

  const matrixWidths = [22, 25, 24, 22, 18];
  activeCriteria.forEach(() => {
    matrixWidths.push(30);
    if (includeDocColumns) matrixWidths.push(32);
  });
  matrixWidths.push(35);

  // Add guide sheet
  const guideHeaders = ['کد شاخص', 'نام شاخص', 'دسته‌بندی', 'نحوه امتیازدهی (۱ تا ۵)', 'منبع داده سازمانی'];
  const guideRows = activeCriteria.map(c => [
    c.code,
    c.name,
    c.cat === 'K' ? 'نتایج کمی KPI' : c.cat === 'Q' ? 'کیفیت' : c.cat === 'B' ? 'رفتاری' : c.cat === 'S' ? 'ایمنی HSE' : 'مدیریتی',
    '۱: غیرقابل قبول | ۲: نیازمند بهبود | ۳: مطابق انتظار | ۴: بالاتر از انتظار | ۵: فراتر از انتظار',
    c.source || 'ثبت ارزیاب مستقیم'
  ]);
  const fileName = `قالب_اکسل_ارزیابی_شاخص_ها_${period.replace(/\s+/g, '_')}.xlsx`;
  void downloadWorkbook(fileName, [
    { name: 'ماتریس_شاخص_ها', rows: [headers, ...rows], widths: matrixWidths },
    { name: 'راهنمای_شاخص_ها', rows: [guideHeaders, ...guideRows], widths: [15, 25, 18, 60, 25] }
  ]);
}

/**
 * Universal Excel Reader: Parses any Excel file, detects all sheets and columns,
 * and auto-deduces intelligent mappings.
 */
export async function parseUniversalExcelFile(
  file: File,
  existingEmployees: Employee[],
  criteria: Criterion[]
): Promise<{
  sheets: string[];
  activeSheet: string;
  headers: string[];
  rawRows: any[][];
  suggestedMappings: DynamicColumnMapping[];
}> {
  try {
        const workbook = await readWorkbookRows(file);
        const sheets = workbook.sheets;
        const activeSheet = sheets[0] || 'Sheet1';
        const rawJson = workbook.rowsBySheet[activeSheet] || [];

        if (!rawJson || rawJson.length < 1) {
          return {
            sheets,
            activeSheet,
            headers: [],
            rawRows: [],
            suggestedMappings: []
          };
        }

        const headers: string[] = (rawJson[0] || []).map((h: any) => String(h || '').trim());
        const rawRows = rawJson.slice(1);

        // Deduce Column Mappings intelligently
        const suggestedMappings: DynamicColumnMapping[] = headers.map((col) => {
          const colLower = col.toLowerCase();

          // 1. Staff Code
          if (['کد پرسنلی', 'code', 'staff', 'شناسه', 'کد', 'پرسنلی', 'employee_id'].some(k => colLower.includes(k))) {
            return { excelColumn: col, targetType: 'staffCode' };
          }

          // 2. Staff Name
          if (['نام', 'name', 'نام و نام خانوادگی', 'پرسنل', 'نام کارمند'].some(k => colLower.includes(k)) && !colLower.includes('کد')) {
            return { excelColumn: col, targetType: 'staffName' };
          }

          // 3. Period
          if (['دوره', 'period', 'نیمسال', 'فصل', 'دوره ارزیابی'].some(k => colLower.includes(k))) {
            return { excelColumn: col, targetType: 'period' };
          }

          // 4. Match Criterion by Code or Name
          for (const crit of criteria) {
            if (
              colLower.includes(crit.code.toLowerCase()) ||
              colLower.includes(crit.name.toLowerCase()) ||
              colLower.includes(`[${crit.code.toLowerCase()}]`)
            ) {
              return {
                excelColumn: col,
                targetType: 'criterion',
                targetCriterionId: crit.id
              };
            }
          }

          // 5. Kasra Attendance Metrics
          if (colLower.includes('تاخیر') || colLower.includes('تعجیل') || colLower.includes('delay')) {
            return { excelColumn: col, targetType: 'attendance_metric', targetMetricKey: 'delayMinutes' };
          }
          if (colLower.includes('غیبت') || colLower.includes('absence')) {
            return { excelColumn: col, targetType: 'attendance_metric', targetMetricKey: 'absenceDays' };
          }
          if (colLower.includes('تذکر') || colLower.includes('انضباط') || colLower.includes('infraction')) {
            return { excelColumn: col, targetType: 'attendance_metric', targetMetricKey: 'disciplineInfractions' };
          }
          if (colLower.includes('کارکرد') || colLower.includes('موظفی') || colLower.includes('workhours')) {
            return { excelColumn: col, targetType: 'attendance_metric', targetMetricKey: 'totalWorkHours' };
          }
          if (colLower.includes('اضافه') || colLower.includes('overtime')) {
            return { excelColumn: col, targetType: 'attendance_metric', targetMetricKey: 'overtimeHours' };
          }
          if (colLower.includes('مرخصی') || colLower.includes('leave')) {
            return { excelColumn: col, targetType: 'attendance_metric', targetMetricKey: 'leaveDays' };
          }

          // 6. MIS Production Metrics
          if (colLower.includes('راندمان') || colLower.includes('بهره‌وری') || colLower.includes('efficiency')) {
            return { excelColumn: col, targetType: 'mis_metric', targetMetricKey: 'efficiencyRate' };
          }
          if (colLower.includes('ضایعات') || colLower.includes('scrap')) {
            return { excelColumn: col, targetType: 'mis_metric', targetMetricKey: 'scrapRate' };
          }
          if (colLower.includes('تولید واقعی') || (colLower.includes('تولید') && !colLower.includes('راندمان') && !colLower.includes('برنامه'))) {
            return { excelColumn: col, targetType: 'mis_metric', targetMetricKey: 'producedUnits' };
          }
          if (colLower.includes('تارگت') || colLower.includes('برنامه') || colLower.includes('target')) {
            return { excelColumn: col, targetType: 'mis_metric', targetMetricKey: 'targetUnits' };
          }
          if (colLower.includes('کیفیت') || colLower.includes('qc') || colLower.includes('کیفی')) {
            return { excelColumn: col, targetType: 'mis_metric', targetMetricKey: 'qualityScore' };
          }
          if (colLower.includes('توقف') || colLower.includes('downtime')) {
            return { excelColumn: col, targetType: 'mis_metric', targetMetricKey: 'downtimeHours' };
          }

          // 7. General Note
          if (colLower.includes('توضیح') || colLower.includes('ملاحظات') || colLower.includes('note') || colLower.includes('بازخورد')) {
            return { excelColumn: col, targetType: 'note' };
          }

          return { excelColumn: col, targetType: 'ignore' };
        });

        return {
          sheets,
          activeSheet,
          headers,
          rawRows,
          suggestedMappings
        };
  } catch (err: any) {
    throw new Error('خطا در بارگذاری و تحلیل فایل اکسل: ' + err.message);
  }
}

/**
 * Recalculates all scores and row records in REAL TIME whenever
 * column mappings change or a manual edit occurs.
 */
export function recalculateDynamicRows({
  rawRows,
  headers,
  mappings,
  employees,
  criteria,
  profiles
}: {
  rawRows: any[][];
  headers: string[];
  mappings: DynamicColumnMapping[];
  employees: Employee[];
  criteria: Criterion[];
  profiles: JobProfile[];
}): {
  records: DynamicExcelRowRecord[];
  matchedEmployeesCount: number;
  totalValidRecords: number;
  warnings: string[];
} {
  const records: DynamicExcelRowRecord[] = [];
  const warnings: string[] = [];
  let matchedEmployeesCount = 0;

  // Map header index to its mapping rule
  const colIndexMap = headers.map((col) => {
    return mappings.find(m => m.excelColumn === col) || { excelColumn: col, targetType: 'ignore' as const };
  });

  rawRows.forEach((row, rIdx) => {
    if (!row || row.length === 0) return;

    let empCode = '';
    let empName = '';
    let period = 'نیمه اول ۱۴۰۵';
    const scores: Record<string, number> = {};
    const docs: Record<string, string> = {};
    const metrics: DynamicExcelRowRecord['metrics'] = {};
    let overallNote = '';

    colIndexMap.forEach((rule, colIdx) => {
      const cellVal = row[colIdx];
      if (cellVal === undefined || cellVal === null) return;

      const strVal = String(cellVal).trim();

      switch (rule.targetType) {
        case 'staffCode':
          empCode = strVal.toUpperCase();
          break;
        case 'staffName':
          empName = strVal;
          break;
        case 'period':
          period = strVal || period;
          break;
        case 'criterion':
          if (rule.targetCriterionId) {
            let numVal = Number(strVal);
            // If text contains a score or description
            if (isNaN(numVal)) {
              if (strVal.length > 0) docs[rule.targetCriterionId] = strVal;
            } else {
              // Bound between 1 and 5
              if (numVal < 1) numVal = 1;
              if (numVal > 5) numVal = 5;
              scores[rule.targetCriterionId] = numVal;
            }
          }
          break;
        case 'attendance_metric':
          if (rule.targetMetricKey) {
            metrics[rule.targetMetricKey] = Number(strVal) || 0;
          }
          break;
        case 'mis_metric':
          if (rule.targetMetricKey) {
            let num = Number(strVal) || 0;
            // Scale percentages if entered as decimals (e.g. 1.05 -> 105)
            if ((rule.targetMetricKey === 'efficiencyRate' || rule.targetMetricKey === 'qualityScore') && num > 0 && num < 2) {
              num = num * 100;
            }
            metrics[rule.targetMetricKey] = num;
          }
          break;
        case 'note':
          overallNote = strVal;
          break;
      }
    });

    if (!empCode && !empName) return;

    // Match with employee database
    const matchedEmp = employees.find(
      e => (empCode && e.code.toUpperCase() === empCode) ||
           (empCode && e.username.toLowerCase() === empCode.toLowerCase()) ||
           (empName && e.name.includes(empName))
    );

    if (matchedEmp) {
      matchedEmployeesCount++;
    } else {
      warnings.push(`ردیف ${rIdx + 2}: همکار با کد «${empCode || 'نامشخص'}» در پایگاه پرسنلی یافت نشد.`);
    }

    // If attendance metrics exist, calculate automatic behavioral/attendance score
    if (metrics.delayMinutes !== undefined || metrics.absenceDays !== undefined || metrics.disciplineInfractions !== undefined) {
      const calculatedAttScore = calculateKasraScore(
        metrics.delayMinutes || 0,
        metrics.absenceDays || 0,
        metrics.disciplineInfractions || 0
      );

      // Map to behavioral or attendance criterion
      const attCriterion = criteria.find(c => c.cat === 'B' || c.cat === 'S' || c.name.includes('حضور') || c.name.includes('انضباط'));
      if (attCriterion && scores[attCriterion.id] === undefined) {
        scores[attCriterion.id] = calculatedAttScore;
        docs[attCriterion.id] = `محاسبه خودکار کسری: تاخیر ${metrics.delayMinutes || 0} دقیقه، غیبت ${metrics.absenceDays || 0} روز، تذکرات ${metrics.disciplineInfractions || 0}`;
      }
    }

    // If MIS production metrics exist, calculate automatic KPI/quality score
    if (metrics.efficiencyRate !== undefined || metrics.scrapRate !== undefined || metrics.qualityScore !== undefined) {
      const calculatedKpiScore = calculateMISScore(
        metrics.efficiencyRate || 100,
        metrics.scrapRate || 1.5,
        metrics.qualityScore || 98
      );

      const kpiCriterion = criteria.find(c => c.cat === 'K' || c.cat === 'Q' || c.name.includes('تولید') || c.name.includes('راندمان') || c.name.includes('ضایعات'));
      if (kpiCriterion && scores[kpiCriterion.id] === undefined) {
        scores[kpiCriterion.id] = calculatedKpiScore;
        docs[kpiCriterion.id] = `محاسبه خودکار MIS: راندمان ${metrics.efficiencyRate || 100}٪، ضایعات ${metrics.scrapRate || 1.5}٪، کیفیت ${metrics.qualityScore || 98}٪`;
      }
    }

    const empProfile = matchedEmp ? profiles.find(p => p.id === matchedEmp.profileId) : undefined;

    records.push({
      id: `dyn-rec-${rIdx}-${Date.now()}`,
      empCode: matchedEmp ? matchedEmp.code : empCode,
      empName: matchedEmp ? matchedEmp.name : empName,
      period,
      jobTitle: empProfile?.title || 'تعریف نشده',
      unit: matchedEmp?.unit || 'مرکزی',
      scores,
      docs,
      metrics,
      overallNote,
      isValid: !!matchedEmp,
      validationError: matchedEmp ? undefined : 'پرسنل در سیستم ثبت نشده است'
    });
  });

  return {
    records,
    matchedEmployeesCount,
    totalValidRecords: records.filter(r => r.isValid).length,
    warnings
  };
}

/**
 * Parses an Excel file uploaded by the user for Kasra Attendance (Legacy / Direct)
 */
export async function parseKasraExcelFile(
  file: File,
  existingEmployees: Employee[]
): Promise<{ records: KasraAttendanceRecord[]; errors: string[]; matchedCount: number }> {
  try {
    const workbook = await readWorkbookRows(file);
    const firstSheetName = workbook.sheets[0];
    const rows = workbook.rowsBySheet[firstSheetName] || [];

    if (!rows || rows.length < 2) {
      return { records: [], errors: ['فایل اکسل خالی است یا ساختار مناسبی ندارد.'], matchedCount: 0 };
    }

    const headers: string[] = (rows[0] || []).map((h: any) => String(h || '').trim());
    const dataRows = rows.slice(1);

        const findCol = (keywords: string[]) =>
          headers.findIndex(h => keywords.some(k => h.toLowerCase().includes(k.toLowerCase())));

        const codeIdx = findCol(['کد پرسنلی', 'code', 'staff', 'شناسه', 'کد']);
        const nameIdx = findCol(['نام', 'name', 'نام و خانوادگی', 'پرسنل']);
        const periodIdx = findCol(['دوره', 'period', 'نیمسال', 'فصل']);
        const hoursIdx = findCol(['ساعات کارکرد', 'کارکرد', 'ساعت', 'hours']);
        const delayIdx = findCol(['تاخیر', 'تعجیل', 'delay', 'کسری']);
        const absenceIdx = findCol(['غیبت', 'absence', 'غیرموجه']);
        const leaveIdx = findCol(['مرخصی', 'leave']);
        const overtimeIdx = findCol(['اضافه', 'اضافه‌کار', 'overtime']);
        const infractionIdx = findCol(['تذکر', 'انضباطی', 'infraction', 'جریمه']);
        const noteIdx = findCol(['توضیح', 'توضیحات', 'note', 'ملاحظات']);

        const records: KasraAttendanceRecord[] = [];
        const errors: string[] = [];
        let matchedCount = 0;

        dataRows.forEach((row, rIdx) => {
          if (!row || row.length === 0 || !row[codeIdx !== -1 ? codeIdx : 0]) return;

          const rawCode = String(row[codeIdx !== -1 ? codeIdx : 0] || '').trim();
          const cleanCode = rawCode.toUpperCase();
          const rawName = nameIdx !== -1 ? String(row[nameIdx] || '').trim() : '';
          const period = periodIdx !== -1 ? String(row[periodIdx] || 'نیمه اول ۱۴۰۵').trim() : 'نیمه اول ۱۴۰۵';

          const totalWorkHours = Number(row[hoursIdx]) || 960;
          const delayMinutes = Number(row[delayIdx]) || 0;
          const absenceDays = Number(row[absenceIdx]) || 0;
          const leaveDays = Number(row[leaveIdx]) || 0;
          const overtimeHours = Number(row[overtimeIdx]) || 0;
          const disciplineInfractions = Number(row[infractionIdx]) || 0;
          const notes = noteIdx !== -1 ? String(row[noteIdx] || '') : '';

          const matchedEmp = existingEmployees.find(
            emp => emp.code.toUpperCase() === cleanCode || 
                   emp.username.toLowerCase() === rawCode.toLowerCase() ||
                   (rawName && emp.name.includes(rawName))
          );

          if (matchedEmp) {
            matchedCount++;
          } else {
            errors.push(`ردیف ${rIdx + 2}: کد پرسنلی «${rawCode}» در سامانه کارکنان ثبت نشده است.`);
          }

          const calculatedScore = calculateKasraScore(delayMinutes, absenceDays, disciplineInfractions);

          records.push({
            id: 'kasra-' + Date.now() + '-' + rIdx,
            empCode: matchedEmp ? matchedEmp.code : cleanCode,
            empName: matchedEmp ? matchedEmp.name : rawName,
            period,
            totalWorkHours,
            delayMinutes,
            absenceDays,
            leaveDays,
            overtimeHours,
            disciplineInfractions,
            calculatedScore,
            notes,
            importedAt: new Date().toLocaleDateString('fa-IR')
          });
        });

    return { records, errors, matchedCount };
    } catch (err: any) {
        return { records: [], errors: ['خطا در خواندن فایل اکسل کسری: ' + err.message], matchedCount: 0 };
    }
}

/**
 * Parses an Excel file uploaded by the user for MIS Production (Legacy / Direct)
 */
async function parseMISExcelFileLegacy(
  file: File,
  existingEmployees: Employee[]
): Promise<{ records: MISProductionRecord[]; errors: string[]; matchedCount: number }> {
  try {
    const workbook = await readWorkbookRows(file);
    const firstSheetName = workbook.sheets[0];
    const rows = workbook.rowsBySheet[firstSheetName] || [];

    if (!rows || rows.length < 2) {
      return { records: [], errors: ['فایل اکسل خالی است یا ساختار مناسبی ندارد.'], matchedCount: 0 };
    }

    const headers: string[] = (rows[0] || []).map((h: any) => String(h || '').trim());
    const dataRows = rows.slice(1);

    const findCol = (keywords: string[]) =>
      headers.findIndex(h => keywords.some(k => h.toLowerCase().includes(k.toLowerCase())));

    const codeIdx = findCol(['کد پرسنلی', 'code', 'staff', 'شناسه', 'کد']);
    const nameIdx = findCol(['نام', 'name', 'نام و خانوادگی', 'پرسنل']);
    const periodIdx = findCol(['دوره', 'period', 'نیمسال', 'فصل']);
    const producedIdx = findCol(['تولید واقعی', 'تولید', 'produced', 'خروجی', 'واقعی']);
    const targetIdx = findCol(['تارگت', 'برنامه', 'target', 'هدف', 'مصوب']);
    const efficiencyIdx = findCol(['راندمان', 'بهره‌وری', 'efficiency', 'درصد تولید', 'درصد']);
    const scrapIdx = findCol(['ضایعات', 'scrap', 'دوباره‌کاری', 'پرت']);
    const downtimeIdx = findCol(['توقف', 'توقفات', 'downtime', 'خاموشی']);
    const qualityIdx = findCol(['کیفیت', 'کیفی', 'qc', 'quality', 'کنترل کیفیت']);
    const noteIdx = findCol(['توضیح', 'توضیحات', 'note', 'ملاحظات']);

    const records: MISProductionRecord[] = [];
    const errors: string[] = [];
    let matchedCount = 0;

    dataRows.forEach((row, rIdx) => {
          if (!row || row.length === 0 || !row[codeIdx !== -1 ? codeIdx : 0]) return;

          const rawCode = String(row[codeIdx !== -1 ? codeIdx : 0] || '').trim();
          const cleanCode = rawCode.toUpperCase();
          const rawName = nameIdx !== -1 ? String(row[nameIdx] || '').trim() : '';
          const period = periodIdx !== -1 ? String(row[periodIdx] || 'نیمه اول ۱۴۰۵').trim() : 'نیمه اول ۱۴۰۵';

          const producedUnits = Number(row[producedIdx]) || 12000;
          const targetUnits = Number(row[targetIdx]) || 12000;
          let efficiencyRate = Number(row[efficiencyIdx]) || 100;
          if (efficiencyRate < 2 && efficiencyRate > 0) {
            efficiencyRate = efficiencyRate * 100;
          }

          let scrapRate = Number(row[scrapIdx]) || 1.5;
          if (scrapRate < 0.2 && scrapRate > 0) {
            scrapRate = scrapRate * 100;
          }

          const downtimeHours = Number(row[downtimeIdx]) || 0;
          let qualityScore = Number(row[qualityIdx]) || 98;
          if (qualityScore < 2 && qualityScore > 0) {
            qualityScore = qualityScore * 100;
          }

          const notes = noteIdx !== -1 ? String(row[noteIdx] || '') : '';

          const matchedEmp = existingEmployees.find(
            emp => emp.code.toUpperCase() === cleanCode ||
                   emp.username.toLowerCase() === rawCode.toLowerCase() ||
                   (rawName && emp.name.includes(rawName))
          );

          if (matchedEmp) {
            matchedCount++;
          } else {
            errors.push(`ردیف ${rIdx + 2}: کد پرسنلی «${rawCode}» در پایگاه کارکنان پیدا نشد.`);
          }

          const calculatedKpiScore = calculateMISScore(efficiencyRate, scrapRate, qualityScore);

          records.push({
            id: 'mis-' + Date.now() + '-' + rIdx,
            empCode: matchedEmp ? matchedEmp.code : cleanCode,
            empName: matchedEmp ? matchedEmp.name : rawName,
            period,
            producedUnits,
            targetUnits,
            efficiencyRate,
            scrapRate,
            downtimeHours,
            qualityScore,
            calculatedKpiScore,
            notes,
            importedAt: new Date().toLocaleDateString('fa-IR')
          });
        });

    return { records, errors, matchedCount };
    } catch (err: any) {
      return { records: [], errors: ['خطا در خواندن فایل اکسل MIS: ' + err.message], matchedCount: 0 };
    }
  }

export interface MISImportIssue {
  row: number;
  column: string;
  employee: string;
  issue: string;
  correction: string;
}

export async function parseMISExcelFile(
  file: File,
  existingEmployees: Employee[],
  expectedPeriod?: string
): Promise<{ records: MISProductionRecord[]; errors: string[]; matchedCount: number; validCount: number; invalidCount: number; duplicateCount: number; unknownEmployeeCount: number; missingMappingCount: number; issues: MISImportIssue[] }> {
  const issues: MISImportIssue[] = [];
  const makeResult = (records: MISProductionRecord[], matchedCount: number) => ({
    records, errors: issues.map(item => `ردیف ${item.row} · ${item.column} · ${item.employee || '—'}: ${item.issue}؛ اصلاح: ${item.correction}`), matchedCount,
    validCount: records.length, invalidCount: issues.length,
    duplicateCount: issues.filter(item => item.issue.includes('تکراری')).length,
    unknownEmployeeCount: issues.filter(item => item.issue.includes('شناخته')).length,
    missingMappingCount: issues.filter(item => item.issue.includes('ستون')).length,
    issues,
  });
  const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase()
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  try {
    const workbook = await readWorkbookRows(file);
    const rows = workbook.rowsBySheet[workbook.sheets[0]] || [];
    if (rows.length < 2) {
      issues.push({ row: 1, column: 'فایل', employee: '', issue: 'فایل داده‌ای ندارد', correction: 'قالب MIS را دانلود و حداقل یک ردیف تکمیل کنید.' });
      return makeResult([], 0);
    }
    const headers = (rows[0] || []).map((cell: unknown) => String(cell ?? '').trim());
    const find = (...terms: string[]) => headers.findIndex(header => terms.some(term => normalize(header).includes(normalize(term))));
    const col = {
      code: find('کد پرسنلی', 'staff code', 'employee code'),
      period: find('دوره ارزیابی', 'period'),
      produced: find('تولید واقعی', 'produced units'),
      target: find('تارگت', 'برنامه مصوب تولید', 'target units'),
      efficiency: find('راندمان', 'efficiency'),
      scrap: find('ضایعات', 'scrap rate'),
      downtime: find('توقف', 'downtime'),
      quality: find('کیفیت', 'quality'),
      note: find('توضیحات واحد mis', 'یادداشت', 'notes'),
    };
    const required = ['code', 'period', 'produced', 'target', 'efficiency', 'scrap', 'downtime', 'quality'] as const;
    let missing = false;
    for (const field of required) if (col[field] < 0 && !(field === 'period' && expectedPeriod?.trim())) {
      missing = true;
      issues.push({ row: 1, column: field, employee: '', issue: 'ستون الزامی پیدا نشد', correction: 'عنوان ستون را از قالب MIS استفاده کنید.' });
    }
    if (missing) return makeResult([], 0);

    const employeesByCode = new Map(existingEmployees.map(item => [normalize(item.code).toUpperCase(), item]));
    const seen = new Set<string>();
    const records: MISProductionRecord[] = [];
    const parseNumber = (value: unknown) => {
      const raw = normalize(value).replace(/[%٪,٬\s]/g, '').replace(/[٫]/g, '.');
      if (!raw) return null;
      const number = Number(raw);
      return Number.isFinite(number) ? number : null;
    };
    let matchedCount = 0;
    rows.slice(1).forEach((row: unknown[], index: number) => {
      const rowNumber = index + 2;
      const val = (field: keyof typeof col) => String(row?.[col[field]] ?? '').trim();
      if (!row?.some(cell => String(cell ?? '').trim())) return;
      const rawCode = val('code');
      const code = normalize(rawCode).toUpperCase();
      const employee = employeesByCode.get(code);
      let invalid = false;
      const issue = (field: keyof typeof col | 'code', message: string, correction: string) => {
        const idx = field === 'code' ? col.code : col[field];
        issues.push({ row: rowNumber, column: idx >= 0 ? headers[idx] : String(field), employee: rawCode, issue: message, correction });
        invalid = true;
      };
      if (!code) issue('code', 'کد پرسنلی خالی است', 'کد یکتای ثبت‌شده در فهرست کارکنان را وارد کنید.');
      if (code && seen.has(code)) issue('code', 'کد پرسنلی در فایل تکراری است', 'برای هر کد در یک دوره فقط یک ردیف نگه دارید.');
      if (code) seen.add(code);
      if (code && !employee) issue('code', 'کارمند با این کد شناخته نمی‌شود', 'کد را بررسی یا ابتدا کارمند را وارد کنید.');
      const period = col.period >= 0 ? val('period') : expectedPeriod?.trim() || '';
      if (!period) issue('period', 'دوره ارزیابی خالی است', 'دوره ارزیابی را وارد کنید.');
      if (expectedPeriod?.trim() && normalize(period) !== normalize(expectedPeriod)) issue('period', 'دوره با زمینه انتخاب‌شده یکسان نیست', `ردیف را به دوره ${expectedPeriod} اصلاح کنید.`);
      const labels = { produced: 'تولید واقعی', target: 'برنامه مصوب', efficiency: 'راندمان', scrap: 'ضایعات', downtime: 'ساعات توقف', quality: 'کیفیت' } as const;
      const numbers: Record<string, number> = {};
      for (const field of Object.keys(labels) as Array<keyof typeof labels>) {
        const number = parseNumber(val(field));
        if (number === null) issue(field, 'مقدار عددی خالی یا نامعتبر است', 'مقدار عددی معتبر وارد کنید؛ خانه خالی به صفر تبدیل نمی‌شود.');
        else numbers[field] = number;
      }
      if (numbers.target === 0) issue('target', 'هدف صفر برای محاسبه مجاز نیست', 'هدف مصوب بزرگ‌تر از صفر وارد کنید.');
      if (invalid || !employee) return;
      const efficiencyRate = numbers.efficiency < 2 && numbers.efficiency > 0 ? numbers.efficiency * 100 : numbers.efficiency;
      const scrapRate = numbers.scrap < 0.2 && numbers.scrap > 0 ? numbers.scrap * 100 : numbers.scrap;
      const qualityScore = numbers.quality < 2 && numbers.quality > 0 ? numbers.quality * 100 : numbers.quality;
      records.push({
        id: `mis:${encodeURIComponent(period)}:${encodeURIComponent(employee.code)}`, empCode: employee.code, empName: employee.name,
        period, producedUnits: numbers.produced, targetUnits: numbers.target, efficiencyRate, scrapRate, downtimeHours: numbers.downtime,
        qualityScore, calculatedKpiScore: calculateMISScore(efficiencyRate, scrapRate, qualityScore),
        notes: col.note >= 0 ? val('note') : '', importedAt: new Date().toISOString(),
      });
      matchedCount++;
    });
    return makeResult(records, matchedCount);
  } catch {
    issues.push({ row: 1, column: 'فایل', employee: '', issue: 'فایل اکسل خوانده نشد', correction: 'فایل سالم با قالب xlsx پشتیبانی‌شده را انتخاب کنید.' });
    return makeResult([], 0);
  }
}

/**
 * Generates and downloads a proper XLSX employee import template
 * with separate cells/columns for each field.
 */
export function downloadEmployeeExcelTemplate() {
  const headers = [
    'کد پرسنلی',
    'نام و نام خانوادگی',
    'واحد سازمانی',
    'شغل / سمت',
    'نقش (employee/supervisor/admin)',
    'نام‌کاربری (اختیاری)',
    'کد پرسنلی سرپرست (اختیاری)',
  ];

  const sampleRows = [
    ['EMP-1001', 'مهندس آرش صادقی', 'سالن تراشکاری CNC', 'اپراتور CNC', 'employee', 'arash.sadeghi', 'EMP-1000'],
    ['EMP-1002', 'جناب آقای بهنام کاظمی', 'سالن مونتاژ ۲', 'سوپروایزر', 'supervisor', 'behnam.kazemi', 'EMP-1000'],
    ['EMP-1003', 'خانم فاطمه رضوی', 'کنترل کیفیت و آزمایشگاه', 'سوپروایزر QC', 'supervisor', 'fatemeh.rezaei', 'EMP-1000'],
  ];

  void downloadWorkbook(
    'قالب_ایمپورت_پرسنل_اصفهان_چالاک.xlsx',
    [{
      name: 'داده‌های_پرسنل',
      rows: [headers, ...sampleRows],
      widths: [18, 25, 22, 20, 28, 20, 22],
    }]
  );
}

/**
 * Generates and downloads a proper XLSX criteria import template
 * with separate cells/columns for each field.
 */
export function downloadCriteriaExcelTemplate() {
  const headers = [
    'کد شاخص',
    'عنوان شاخص',
    'دسته (K/Q/B/S/L)',
    'تعریف / شرح',
    'منبع',
    'روش محاسبه',
    'جهت (more/less)',
    'سامانه نمره‌دهی (supervisor/mis/kasra/system/multi_source)',
  ];

  const sampleRows = [
    ['K-01', 'دقت در کیفیت محصول', 'کیفیت', 'حاشیه‌گیری دقیق قطعات تولیدی', 'کنترل کیفیت', 'محاسبه کارگاهی', 'more', 'supervisor'],
    ['B-05', 'رعایت ایمنی فردی', 'رفتار', 'عدم استفاده از ابز بدون محافغ', 'ایمنی', 'نظرسنجی استاندارد', 'less', 'system'],
    ['S-03', 'زمان توقف غیرمنتظره', 'امنیت', 'متوسط توقف خط در ساعت کاری', 'MIS', 'محاسبه از سیستم MES', 'less', 'mis'],
  ];

  void downloadWorkbook(
    'قالب_ایمپورت_شاخص‌ها_اصفهان_چالاک.xlsx',
    [{
      name: 'شاخص‌های_ارزیابی',
      rows: [headers, ...sampleRows],
      widths: [18, 28, 16, 32, 16, 22, 16, 32],
    }]
  );
}

/**
 * Exports current employees as a real XLSX workbook (separate cells/columns).
 */
export function downloadEmployeesXlsx(employees: Employee[]) {
  const headers = [
    'کد پرسنلی',
    'نام و نام خانوادگی',
    'واحد سازمانی',
    'شغل',
    'نقش دسترسی',
    'نام‌کاربری',
    'کد پرسنلی سرپرست',
  ];

  const rows = employees.map(emp => [
    emp.code,
    emp.name,
    emp.unit,
    emp.role === 'admin' ? 'admin' : emp.role === 'supervisor' ? 'supervisor' : 'employee',
    emp.username || '',
    emp.supervisorId || '',
  ]);

  void downloadWorkbook(
    `صادرات_پرسنل_اصفهان_چالاک_${Date.now()}.xlsx`,
    [{
      name: 'داده‌های_پرسنل',
      rows: [headers, ...rows],
      widths: [18, 25, 22, 20, 20, 20, 22],
    }]
  );
}

/**
 * Exports current criteria as a real XLSX workbook (separate cells/columns).
 */
export function downloadCriteriaXlsx(criteria: Criterion[]) {
  const headers = [
    'کد شاخص',
    'عنوان شاخص',
    'دسته',
    'تعریف',
    'منبع',
    'روش محاسبه',
    'جهت',
    'سامانه نمره‌دهی',
  ];

  const rows = criteria.map(c => [
    c.code,
    c.name,
    c.cat,
    c.def,
    c.source || '',
    c.method || '',
    c.dir,
    c.scoringSource || '',
  ]);

  void downloadWorkbook(
    `صادرات_شاخص‌ها_اصفهان_چالاک_${Date.now()}.xlsx`,
    [{
      name: 'شاخص‌های_ارزیابی',
      rows: [headers, ...rows],
      widths: [18, 28, 12, 30, 18, 22, 12, 24],
    }]
  );
}

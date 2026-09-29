/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { thresholdsFollowDirection, validManualScoreLimits } from './criterionScoring';
import { Employee, Criterion, JobProfile, ProfileItem, Evaluation } from '../types';

export type ValidationResult<T> =
  | { success: true; data: T; errors?: never }
  | { success: false; errors: string[]; data?: never };

export type AdminPasswordValidationResult =
  | { success: true; newPassword: string; error?: never }
  | { success: false; error: string; newPassword?: never };

/**
 * XSS & HTML Tag Sanitizer
 * Strips script tags, HTML entities, javascript: links, and dangerous control characters.
 */
export function sanitizeInputString(val: unknown): string {
  if (val === null || val === undefined) return '';
  let str = typeof val === 'string' ? val : String(val);
  
  // Neutralize common XSS and script vectors
  str = str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .replace(/on\w+\s*=/gi, '') // Event handlers like onerror=, onclick=
    .replace(/[<>]/g, '') // Strip remaining angled brackets for plain text fields
    .replace(/\0/g, '') // Null bytes
    .trim();

  return str;
}

// ==========================================
// 1. EMPLOYEE SCHEMA & VALIDATION
// ==========================================
export const EmployeeInputSchema = z.object({
  name: z.string().min(2, 'نام و نام خانوادگی همکار باید حداقل ۲ کاراکتر باشد.').max(100, 'نام بیش از حد طولانی است.'),
  code: z.string().min(2, 'کد پرسنلی باید حداقل ۲ کاراکتر باشد.').max(30, 'کد پرسنلی نامعتبر است.'),
  unit: z.string().min(2, 'واحد یا دپارتمان سازمانی الزامی است.').max(100),
  profileId: z.string().min(1, 'انتخاب پروفایل شغلی الزامی است.'),
  role: z.enum(['admin', 'supervisor', 'employee'] as const, {
    message: 'نقش سازمانی نامعتبر است.'
  }),
  username: z.string()
    .min(1, 'نام کاربری الزامی است.')
    .max(50, 'نام کاربری نامعتبر است.')
    .regex(/^[a-z0-9_.-]+$/, 'نام کاربری فقط می‌تواند شامل حروف انگلیسی، اعداد، نقطه و خط تیره باشد.'),
  supervisorId: z.string().max(50).optional(),
  peerReviewerId: z.string().max(50).optional(),
  calibrationLeadId: z.string().max(50).optional(),
  approverId: z.string().max(50).optional(),
  hrPartnerId: z.string().max(50).optional(),
  hseReviewerId: z.string().max(50).optional()
});

export function sanitizeEmployeeData(data: any): any {
  if (!data || typeof data !== 'object') return data;

  const codeSanitized = sanitizeInputString(data.code).toUpperCase();
  let usernameRaw = sanitizeInputString(data.username).toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  if (!usernameRaw) {
    const codeClean = codeSanitized.toLowerCase().replace(/[^a-z0-9]/g, '');
    usernameRaw = `user_${codeClean || Math.random().toString(36).substring(2, 7)}`;
  }

  return {
    ...data,
    name: sanitizeInputString(data.name),
    code: codeSanitized,
    unit: sanitizeInputString(data.unit),
    profileId: sanitizeInputString(data.profileId),
    username: usernameRaw,
    supervisorId: data.supervisorId ? sanitizeInputString(data.supervisorId) : undefined,
    peerReviewerId: data.peerReviewerId ? sanitizeInputString(data.peerReviewerId) : undefined,
    calibrationLeadId: data.calibrationLeadId ? sanitizeInputString(data.calibrationLeadId) : undefined,
    approverId: data.approverId ? sanitizeInputString(data.approverId) : undefined,
    hrPartnerId: data.hrPartnerId ? sanitizeInputString(data.hrPartnerId) : undefined,
    hseReviewerId: data.hseReviewerId ? sanitizeInputString(data.hseReviewerId) : undefined
  };
}

export function validateEmployeeInput(data: unknown): ValidationResult<Omit<Employee, 'id'>> {
  const sanitized = sanitizeEmployeeData(data);
  const result = EmployeeInputSchema.safeParse(sanitized);
  if (result.success) {
    return { success: true, data: result.data as Omit<Employee, 'id'> };
  }
  const errorMessages = result.error.issues ? result.error.issues.map(i => i.message) : ['داده‌های وارد شده نامعتبر است.'];
  return {
    success: false,
    errors: errorMessages
  };
}

// ==========================================
// 2. CRITERION SCHEMA & VALIDATION
// ==========================================
export const CriterionInputSchema = z.object({
  code: z.string().min(2, 'کد شاخص الزامی است.').max(40, 'کد شاخص نامعتبر است.'),
  cat: z.enum(['K', 'Q', 'B', 'S', 'L'] as const, {
    message: 'دسته‌بندی شاخص نامعتبر است.'
  }),
  name: z.string().min(2, 'عنوان شاخص باید حداقل ۲ کاراکتر باشد.').max(150, 'عنوان شاخص بیش از حد طولانی است.'),
  def: z.string().min(3, 'تعریف عملیاتی و سنجه باید حداقل ۳ کاراکتر باشد.').max(1000, 'تعریف بیش از حد طولانی است.'),
  source: z.string().max(200).optional(),
  method: z.string().max(200).optional(),
  dir: z.enum(['more', 'less'] as const).optional(),
  scoringSource: z.enum(['supervisor', 'mis', 'kasra', 'system', 'multi_source'] as const).optional(),
  misMetricKey: z.enum(['efficiency', 'scrap_rate', 'quality_score', 'output_qty', 'downtime', 'attendance_delay', 'attendance_absence', 'discipline', 'custom'] as const).optional(),
  customMetricField: z.string().max(100).optional(),
  autoPopulate: z.boolean().optional(),
  misTargetValue: z.number().optional(),
  calculationType: z.enum(['ratio', 'inverse_ratio', 'defect_rate', 'custom_formula', 'direct_score'] as const).optional(),
  formulaExpression: z.string().max(500).optional(),
  variables: z.array(z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    unit: z.string().optional(),
    defaultValue: z.number().optional()
  })).optional(),
  unit: z.string().max(50).optional(),
  targetValue: z.number().optional(),
  allowedScoreMin: z.number().int().min(1).max(5).optional(),
  allowedScoreMax: z.number().int().min(1).max(5).optional(),
  scoreThresholds: z.object({
    score5: z.number(),
    score4: z.number(),
    score3: z.number(),
    score2: z.number()
  }).optional(),
  multiSourceConfig: z.object({
    aggregationMode: z.enum(['weighted_average', 'sum', 'min', 'max'] as const).optional(),
    items: z.array(z.object({
      source: z.enum(['supervisor', 'mis', 'kasra', 'system'] as const),
      weightPercent: z.number().min(0).max(100),
      misMetricKey: z.enum(['efficiency', 'scrap_rate', 'quality_score', 'output_qty', 'downtime', 'attendance_delay', 'attendance_absence', 'discipline', 'custom'] as const).optional(),
      label: z.string().max(120).optional(),
    })).max(8),
  }).optional(),
  department: z.string().max(150).optional()
}).refine(data => {
  const codeClean = data.code.trim().toUpperCase();
  const prefix = codeClean.split('-')[0];
  return prefix === data.cat || codeClean.startsWith(data.cat) || codeClean.startsWith('KPI-') || codeClean.startsWith('C-');
}, {
  message: 'کد شاخص باید با پیشوند دسته انتخابی (مانند K- یا B- یا KPI-) آغاز شود.',
  path: ['code']
}).refine(data => {
  return validManualScoreLimits(data.allowedScoreMin, data.allowedScoreMax);
}, {
  message: 'حداقل نمره باید کمتر یا مساوی حداکثر نمره باشد.',
  path: ['allowedScoreMax']
}).refine(data => {
  const thresholds = data.scoreThresholds;
  if (!thresholds) return true;
  return thresholdsFollowDirection(thresholds, data.dir || 'more');
}, {
  message: 'ترتیب آستانه‌ها با جهت مطلوبیت شاخص سازگار نیست.',
  path: ['scoreThresholds']
});

export function sanitizeCriterionData(data: any): any {
  if (!data || typeof data !== 'object') return data;
  return {
    ...data,
    code: sanitizeInputString(data.code).toUpperCase(),
    name: sanitizeInputString(data.name),
    def: sanitizeInputString(data.def),
    source: data.source ? sanitizeInputString(data.source) : undefined,
    method: data.method ? sanitizeInputString(data.method) : undefined,
    dir: data.dir || undefined,
    scoringSource: data.scoringSource || 'supervisor',
    misMetricKey: data.misMetricKey || undefined,
    customMetricField: data.customMetricField ? sanitizeInputString(data.customMetricField) : undefined,
    autoPopulate: data.autoPopulate !== undefined ? Boolean(data.autoPopulate) : true,
    misTargetValue: typeof data.misTargetValue === 'number' ? data.misTargetValue : (data.misTargetValue ? Number(data.misTargetValue) : undefined),
    calculationType: data.calculationType || undefined,
    formulaExpression: data.formulaExpression ? sanitizeInputString(data.formulaExpression) : undefined,
    unit: data.unit ? sanitizeInputString(data.unit) : undefined,
    targetValue: typeof data.targetValue === 'number' ? data.targetValue : (data.targetValue !== undefined && data.targetValue !== '' ? Number(data.targetValue) : undefined),
    allowedScoreMin: data.allowedScoreMin === '' || data.allowedScoreMin === undefined ? undefined : Number(data.allowedScoreMin),
    allowedScoreMax: data.allowedScoreMax === '' || data.allowedScoreMax === undefined ? undefined : Number(data.allowedScoreMax),
    variables: Array.isArray(data.variables) ? data.variables.map((v: any) => ({
      key: sanitizeInputString(v.key),
      label: sanitizeInputString(v.label),
      unit: v.unit ? sanitizeInputString(v.unit) : undefined,
      defaultValue: typeof v.defaultValue === 'number' ? v.defaultValue : undefined
    })) : undefined,
    scoreThresholds: data.scoreThresholds ? {
      score5: Number(data.scoreThresholds.score5),
      score4: Number(data.scoreThresholds.score4),
      score3: Number(data.scoreThresholds.score3),
      score2: Number(data.scoreThresholds.score2),
    } : undefined
  };
}

export function validateCriterionInput(data: unknown): ValidationResult<Omit<Criterion, 'id'>> {
  const sanitized = sanitizeCriterionData(data);
  const result = CriterionInputSchema.safeParse(sanitized);
  if (result.success) {
    return { success: true, data: result.data as Omit<Criterion, 'id'> };
  }
  const errorMessages = result.error.issues ? result.error.issues.map(i => i.message) : ['داده‌های شاخص نامعتبر است.'];
  return {
    success: false,
    errors: errorMessages
  };
}

// ==========================================
// 3. JOB PROFILE SCHEMA & VALIDATION
// ==========================================
export const ProfileItemSchema = z.object({
  cid: z.string().min(1, 'شناسه شاخص الزامی است.'),
  weight: z.number().min(5, 'وزن شاخص نمی‌تواند کمتر از ۵٪ باشد.').max(50, 'وزن یک شاخص نمی‌تواند بیش از ۵۰٪ باشد.')
});

export const JobProfileInputSchema = z.object({
  title: z.string().min(2, 'عنوان شغل باید حداقل ۲ کاراکتر باشد.').max(150),
  code: z.string().min(1, 'کد شغل الزامی است.').max(30),
  family: z.string().min(1, 'خانواده شغلی الزامی است.').max(50),
  baseRewardAmount: z.number().optional(),
  locked: z.boolean().default(false),
  items: z.array(ProfileItemSchema).min(1, 'پروفایل شغلی باید حداقل شامل یک شاخص باشد.')
});

export function sanitizeJobProfileData(data: any): any {
  if (!data || typeof data !== 'object') return data;
  return {
    ...data,
    title: sanitizeInputString(data.title),
    code: sanitizeInputString(data.code).toUpperCase(),
    family: sanitizeInputString(data.family),
    locked: Boolean(data.locked),
    baseRewardAmount: data.baseRewardAmount ? Number(data.baseRewardAmount) : undefined,
    items: Array.isArray(data.items) ? data.items.map((it: any) => ({
      cid: sanitizeInputString(it?.cid),
      weight: typeof it?.weight === 'number' ? it.weight : Number(it?.weight) || 0
    })) : []
  };
}

export function validateJobProfileInput(data: unknown): ValidationResult<Omit<JobProfile, 'id'>> {
  const sanitized = sanitizeJobProfileData(data);
  const result = JobProfileInputSchema.safeParse(sanitized);
  if (result.success) {
    return { success: true, data: result.data as Omit<JobProfile, 'id'> };
  }
  const errorMessages = result.error.issues ? result.error.issues.map(i => i.message) : ['داده‌های پروفایل شغلی نامعتبر است.'];
  return {
    success: false,
    errors: errorMessages
  };
}

// ==========================================
// 4. EVALUATION & SCORE VALIDATION
// ==========================================
export const ScoreItemSchema = z.object({
  cid: z.string().min(1),
  weight: z.number().min(0).max(100),
  value: z.number().min(0).max(5),
  self: z.number().min(0).max(5),
  peer: z.number().min(0).max(5).optional(),
  doc: z.string().max(1000).optional()
});

export const EvaluationInputSchema = z.object({
  empId: z.string().min(1, 'شناسه همکار الزامی است.'),
  profileId: z.string().min(1, 'شناسه پروفایل شغلی الزامی است.'),
  period: z.string().min(2, 'دوره ارزیابی الزامی است.').max(50),
  status: z.enum(['draft', 'submitted', 'pending', 'reviewed', 'approved', 'locked'] as const),
  scores: z.array(ScoreItemSchema),
  created: z.number().optional(),
  growthNotes: z.string().max(2000).optional(),
  aiSuggestions: z.string().max(2000).optional()
});

export function sanitizeEvaluationData(data: any): any {
  if (!data || typeof data !== 'object') return data;
  return {
    ...data,
    empId: sanitizeInputString(data.empId),
    profileId: sanitizeInputString(data.profileId),
    period: sanitizeInputString(data.period),
    status: data.status,
    scores: Array.isArray(data.scores) ? data.scores.map((sc: any) => ({
      cid: sanitizeInputString(sc?.cid),
      weight: typeof sc?.weight === 'number' ? sc.weight : Number(sc?.weight) || 0,
      value: typeof sc?.value === 'number' ? sc.value : Number(sc?.value) || 0,
      self: typeof sc?.self === 'number' ? sc.self : Number(sc?.self) || 0,
      peer: typeof sc?.peer === 'number' ? sc.peer : undefined,
      doc: sc?.doc ? sanitizeInputString(sc.doc) : undefined
    })) : [],
    growthNotes: data.growthNotes ? sanitizeInputString(data.growthNotes) : undefined,
    aiSuggestions: data.aiSuggestions ? sanitizeInputString(data.aiSuggestions) : undefined
  };
}

export function validateEvaluationInput(data: unknown): ValidationResult<Partial<Evaluation>> {
  const sanitized = sanitizeEvaluationData(data);
  const result = EvaluationInputSchema.safeParse(sanitized);
  if (result.success) {
    return { success: true, data: result.data as Partial<Evaluation> };
  }
  const errorMessages = result.error.issues ? result.error.issues.map(i => i.message) : ['داده‌های ارزیابی نامعتبر است.'];
  return {
    success: false,
    errors: errorMessages
  };
}

// ==========================================
// 5. ADMIN & USER PASSWORD VALIDATION
// ==========================================
export const AdminPasswordSchema = z.object({
  currentPassword: z.string().min(1, 'کلمه عبور فعلی الزامی است.'),
  newPassword: z.string()
    .min(8, 'کلمه عبور جدید مدیریت باید حداقل ۸ کاراکتر باشد.')
    .max(100, 'کلمه عبور بیش از حد طولانی است.')
    .refine(val => !val.includes(' '), 'کلمه عبور نباید حاوی فاصله خالی باشد.'),
  confirmPassword: z.string().min(1, 'تکرار کلمه عبور جدید الزامی است.')
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'کلمه عبور جدید با تکرار آن همخوانی ندارد.',
  path: ['confirmPassword']
});

export function validateAdminPasswordChange(data: unknown): AdminPasswordValidationResult {
  const result = AdminPasswordSchema.safeParse(data);
  if (result.success) {
    return { success: true, newPassword: result.data.newPassword };
  }
  const msg = result.error.issues?.[0]?.message || 'خطا در اعتبارسنجی کلمه عبور';
  return { success: false, error: msg };
}

/**
 * Clear legacy local session keys and tokens immediately upon admin password update
 */
export function clearLegacyAdminSessions(): void {
  // Clear legacy and stored admin session keys from localStorage
  localStorage.removeItem('pe_current_user');
  localStorage.removeItem('pe_admin_logged_in');
  localStorage.removeItem('pe_auth_token');
  localStorage.removeItem('pe_legacy_admin');
  localStorage.removeItem('pe_admin_session');
  
  // Clear active session storage keys
  sessionStorage.removeItem('pe_admin_session');
  sessionStorage.removeItem('pe_session_user');
  sessionStorage.removeItem('pe_admin_session_logged_at');
}

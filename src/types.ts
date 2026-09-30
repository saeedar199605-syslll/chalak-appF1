/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CategoryKey = 'K' | 'Q' | 'B' | 'S' | 'L';

export interface KpiVariableDefinition {
  key: string;            // e.g. "actual", "target", "scrap", "cycle_time"
  label: string;          // e.g. "تولید واقعی", "برنامه مصوب"
  unit?: string;          // e.g. "عدد", "ثانیه", "درصد"
  defaultValue?: number;
}

export type KpiCalculationType = 
  | 'ratio'           // (actual / target) * 100
  | 'inverse_ratio'   // (standard / actual) * 100
  | 'defect_rate'     // 100 - (scrap / total) * 100
  | 'custom_formula'  // e.g. "(actual / target) * 90 + (quality * 0.1)"
  | 'direct_score';   // مقیاس ۱ تا ۵ مستقیم

export interface KpiScoreThresholds {
  score5: number; // e.g. >= 105
  score4: number; // e.g. >= 95
  score3: number; // e.g. >= 85
  score2: number; // e.g. >= 70
}

export type CriterionScoringSource = 
  | 'supervisor' // ارزیابی و امتیازدهی مستقیم سرپرست کارگاه / مدیر مستقیم
  | 'mis'        // ورود خودکار داده‌ها از سامانه تولید و کیفیت MIS/MES
  | 'kasra'      // ورود خودکار داده‌ها از سامانه حضور و غیاب کسری
  | 'system'     // محاسبه خودکار سیستمی با موتور فرمول‌ساز KPI
  | 'multi_source'; // تامین ترکیبی از چند منبع (مانند MIS + کسری + سرپرست)

export interface MultiSourceItemConfig {
  source: 'supervisor' | 'mis' | 'kasra' | 'system';
  weightPercent: number; // e.g. 50 (for 50%)
  misMetricKey?: MisMetricKey;
  label?: string; // e.g. "تولید و راندمان MIS", "انضباط و تردد کسری", "کیفیت و سرپرست"
}

export interface MultiSourceConfig {
  items: MultiSourceItemConfig[];
  aggregationMode?: 'weighted_average' | 'sum' | 'min' | 'max';
}

export type MisMetricKey = 
  | 'efficiency'         // راندمان خط و تحقق برنامه زمان‌بندی تولید
  | 'scrap_rate'         // نرخ ضایعات و قطعات اسقاطی
  | 'quality_score'      // نرخ کیفیت و انطباق کیفی قطعات (QC)
  | 'output_qty'         // تیراژ تولید واقعی
  | 'downtime'           // توقفات خط و خرابی تجهیزات
  | 'attendance_delay'   // دقایق تاخیر ورود پرسنل
  | 'attendance_absence' // روزهای غیبت
  | 'discipline'         // انضباط اداری و تخلفات
  | 'custom';            // شاخص سفارشی با نام متغیر آزاد

export interface Criterion {
  id: string;
  code: string;
  cat: CategoryKey;
  name: string;
  def: string;
  source?: string;
  method?: string;
  dir?: 'more' | 'less'; // 'more' = higher is better, 'less' = lower is better
  scoringSource?: CriterionScoringSource; // مشخص‌کننده منبع ورود نمره (سرپرست یا MIS یا کسری یا چندمنبعی)
  misMetricKey?: MisMetricKey;            // کلید متریک متناظر در سامانه MIS
  customMetricField?: string;             // نام فیلد در فایل اکسل در صورت سفارشی بودن
  autoPopulate?: boolean;                 // اعمال خودکار نمره هنگام آپلود اکسل
  misTargetValue?: number;                // هدف عددی تعیین‌شده برای شاخص
  multiSourceConfig?: MultiSourceConfig;  // پیکربندی ترکیب منابع تامین داده
  calculationType?: KpiCalculationType;
  formulaExpression?: string;
  variables?: KpiVariableDefinition[];
  unit?: string;
  targetValue?: number;
  scoreThresholds?: KpiScoreThresholds;
  /** Optional limits for manually entered 1–5 supervisor scores. */
  allowedScoreMin?: number;
  allowedScoreMax?: number;
  department?: string; // بخش یا واحد سازمانی تأمین‌کننده شاخص (مانند تولید، کنترل کیفیت، HSE)
}

export interface ProfileItem {
  cid: string; // Criterion ID
  weight: number; // 5 to 25
}

export interface JobProfile {
  id: string;
  title: string;
  code: string; // e.g., B1, B3
  family: string; // e.g., B (Blue-collar), W (White-collar)
  locked: boolean;
  items: ProfileItem[];
  baseRewardAmount?: number;
}

export type UserRole = 'admin' | 'supervisor' | 'employee';

export interface Employee {
  id: string;
  name: string;
  code: string; // Staff ID, e.g. EMP-1001
  profileId: string;
  unit: string; // Department / Unit
  role: UserRole;
  username: string;
  supervisorId?: string; // Direct supervisor (Stage 2)
  peerReviewerId?: string; // Peer / Functional reviewer (360 feedback)
  calibrationLeadId?: string; // Calibration committee lead (Stage 3)
  approverId?: string; // Final HR Approver (Stage 4)
  hrPartnerId?: string; // HR Business Partner for feedback meeting (Stage 5)
  hseReviewerId?: string; // Existing account designated to review HSE workflow detours
  permissions?: string[]; // Granular RBAC permissions
}

export type WorkflowStageKey = 
  | 'self_review'        // خودارزیابی کارمند
  | 'supervisor_review'  // ارزیابی سرپرست مستقیم
  | 'peer_review'        // بازخورد همتا و ۳۶۰ درجه
  | 'calibration_review' // کمیته کالیبراسیون و انطباق سازمانی
  | 'hr_approval'        // تایید نهایی مدیریت منابع انسانی
  | 'feedback_meeting'   // گفت‌وگوی بازخورد و ابلاغ کارنامه
  | 'hse_review'         // بررسی واحد HSE; a non-linear detour
  | 'completed'          // خاتمه‌یافته و ثبت در سوابق
  | 'rejected'           // عودت داده‌شده جهت بازنگری
  | 'appealed';          // ثبت اعتراض و در حال رسیدگی کمیته تجدیدنظر

export interface WorkflowTransitionLog {
  id: string;
  fromStage: WorkflowStageKey;
  toStage: WorkflowStageKey;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: 'submit_self' | 'submit_supervisor' | 'submit_peer' | 'approve_calibration' | 'approve_hr' | 'reject_to_supervisor' | 'reject_to_employee' | 'complete_feedback' | 'submit_appeal' | 'resolve_appeal' | 'admin_override' | 'reassign_assignee' | 'advance' | 'route_hse' | 'complete_hse_review';
  comment?: string;
  targetAssigneeName?: string;
  timestamp: string;
  delegationId?: string;      // ID of delegation record if action was performed under delegation
  delegationContext?: string; // Persian text describing delegation source, e.g., "تفویض از طرف A"
}

export interface EvaluationRouteRule {
  id: string;
  title: string;
  unit?: string; // Specific unit or 'all'
  profileId?: string; // Specific profile or 'all'
  requiresSelfReview: boolean;
  requiresSupervisorReview: boolean;
  requiresPeerReview?: boolean;
  requiresCalibration: boolean;
  requiresHrApproval: boolean;
  autoAdvanceOnPass: boolean;
  maxSlaDaysPerStage?: number; // Days allowed before SLA breach
  defaultSupervisorId?: string;
  defaultApproverId?: string;
}

export interface IDPItem {
  id: string;
  competencyArea: string; // e.g. "دقت و انضباط فرآیندی"
  actionType: 'training_course' | 'on_the_job' | 'mentorship' | 'job_shadowing' | 'project_assignment';
  title: string;
  description: string;
  targetDate: string; // e.g. "۱۴۰۵/۰۸/۳۰"
  mentorName?: string;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  completionNotes?: string;
}

export interface GrievanceAppeal {
  id: string;
  evalId: string;
  empId: string;
  period: string;
  appealedCriteriaIds: string[];
  reason: string;
  evidenceNotes?: string;
  status: 'submitted' | 'under_review' | 'accepted_modified' | 'rejected_upheld';
  submittedAt: string;
  reviewedAt?: string;
  reviewerName?: string;
  committeeDecision?: string;
  adjustedScoreDelta?: number;
}

export interface ScoreSourceBreakdown {
  misScore?: number;
  misMetricValue?: number | string;
  kasraScore?: number;
  kasraMetricValue?: number | string;
  supervisorScore?: number;
  systemScore?: number;
  updatedAt?: string;
}

export interface ScoreItem {
  cid: string;
  weight: number;
  value: number; // 1 to 5, or 0 if unrated (Supervisor)
  self: number;  // 1 to 5, or 0 if unrated (Employee)
  peer?: number; // 1 to 5, or 0 if unrated (Peer/360)
  doc?: string;  // Supporting document / justification
  sourceType?: 'supervisor' | 'mis' | 'kasra' | 'system' | 'multi_source' | 'auto'; // منبع ثبت نمره فعلی
  autoPopulated?: boolean; // آیا از اکسل MIS یا کسری به صورت خودکار نشانده شده
  rawMetricValue?: number | string; // مقدار خام ورودی مانند راندمان ۹۵٪ یا تاخیر ۳۰ دقیقه
  rawMetricLabel?: string; // برچسب متریک مانند "راندمان خط"
  overrideNote?: string; // توضیح سرپرست در صورت تغییر دستی نمره خودکار
  overrideBy?: string;   // نام کاربری که تغییر را انجام داده
  sourceBreakdown?: ScoreSourceBreakdown; // تفکیک نمرات چند منبعی (MIS، کسری، سرپرست)
}

export interface UserCustomPermission {
  userId: string;
  canEditCriteria: boolean;
  canEditProfiles: boolean;
  canEditEmployees: boolean;
  canStartEvaluations: boolean;
  canLockScores: boolean;
  canDefineTargets: boolean;
  canViewReports: boolean;
  canRestoreBackup: boolean;
}

export interface KasraAttendanceRecord {
  id: string;
  empCode: string;
  empName?: string;
  period: string;
  evaluationPeriodId?: string;
  totalWorkHours: number;
  delayMinutes: number;
  absenceDays: number;
  leaveDays: number;
  overtimeHours: number;
  disciplineInfractions: number;
  calculatedScore: number; // 1 to 5
  notes?: string;
  importedAt: string;
}

export interface MISProductionRecord {
  id: string;
  empCode: string;
  empName?: string;
  period: string;
  producedUnits: number;
  targetUnits: number;
  efficiencyRate: number; // e.g. 102.5%
  scrapRate: number; // e.g. 1.2%
  downtimeHours: number;
  qualityScore: number; // e.g. 98%
  calculatedKpiScore: number; // 1 to 5
  notes?: string;
  importedAt: string;
}

export interface DynamicColumnMapping {
  excelColumn: string; // Header title from Excel
  targetType: 'staffCode' | 'staffName' | 'period' | 'criterion' | 'attendance_metric' | 'mis_metric' | 'note' | 'ignore';
  targetCriterionId?: string; // e.g. 'c1', 'C-BEH-01'
  targetMetricKey?: 'totalWorkHours' | 'delayMinutes' | 'absenceDays' | 'leaveDays' | 'overtimeHours' | 'disciplineInfractions' | 'producedUnits' | 'targetUnits' | 'efficiencyRate' | 'scrapRate' | 'downtimeHours' | 'qualityScore';
}

export interface DynamicExcelRowRecord {
  id: string;
  empCode: string;
  empName?: string;
  period: string;
  jobTitle?: string;
  unit?: string;
  scores: Record<string, number>; // criterionId -> score 1 to 5
  docs: Record<string, string>; // criterionId -> explanation/evidence
  metrics: {
    delayMinutes?: number;
    absenceDays?: number;
    disciplineInfractions?: number;
    efficiencyRate?: number;
    scrapRate?: number;
    qualityScore?: number;
  };
  overallNote?: string;
  isModifiedManually?: boolean;
  isValid: boolean;
  validationError?: string;
}

export interface BiasWarning {
  type: 'halo_horns' | 'recency' | 'leniency_strictness' | 'inappropriate_tone' | 'lack_of_evidence' | 'generic';
  title: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  highlightSnippet?: string;
}

export interface BiasAnalysisResult {
  integrityScore: number; // 0 to 100
  hasWarnings: boolean;
  biasesDetected: BiasWarning[];
  suggestedRevision: string;
  coachingAdvice: string;
  analyzedAt: string;
}

export interface Evaluation {
  id: string;
  empId: string;
  profileId: string;
  period: string; // e.g., "نیمه اول ۱۴۰۵"
  /** Stable period identity; optional for backward compatibility with legacy evaluations. */
  evaluationPeriodId?: string;
  status: 'draft' | 'calibrated' | 'locked';
  stage?: WorkflowStageKey; // Current workflow stage
  currentAssigneeId?: string; // Who currently has the task (e.g. employee, supervisor, HR/admin)
  currentAssigneeName?: string;
  currentAssigneeRole?: UserRole;
  routeRuleId?: string;
  requiresSelfReview?: boolean;
  hseReviewContext?: {
    requestedFromStage: WorkflowStageKey;
    returnStage: WorkflowStageKey;
    requestedById: string;
    requestedAt: string;
    hseReviewerId: string;
    reason: string;
    returnAssigneeId: string;
    returnAssigneeName: string;
    returnAssigneeRole: UserRole;
    reviewNote?: string;
    reviewedAt?: string;
  };
  bulkOperationId?: string;
  history?: WorkflowTransitionLog[]; // Audit trail of stage movements
  finalReward?: number; // Calculated financial reward based on score
  rejectionReason?: string;
  scores: ScoreItem[];
  potentialScore?: number; // 1 to 5 for 9-Box Grid
  nineBoxPlacement?: {
    performance: 'low' | 'medium' | 'high';
    potential: 'low' | 'medium' | 'high';
    boxTitle: string;
    boxCategory: 'star' | 'high_performer' | 'core_player' | 'inconsistent' | 'talent_risk';
  };
  idpItems?: IDPItem[]; // Individual Development Plan
  appeal?: GrievanceAppeal; // Grievance / Appeal
  note?: string; // Performance conversation summary
  biasAnalysis?: BiasAnalysisResult;
  aiFeedback?: {
    strengths: string[];
    developmentAreas: string[];
    actionItems: string[];
    summary: string;
  };
  aiLoading?: boolean;
  created: number;
}

export interface UserNotification {
  id: string;
  eventKey: string;
  recipientId: string;
  eventType: 'evaluation_started' | 'workflow_submitted' | 'workflow_returned' | 'workflow_reassigned' | 'workflow_advanced' | 'hse_review_requested' | 'hse_review_completed' | 'delegation_created' | 'delegation_revoked';
  title: string;
  message: string;
  targetTab: 'workflow' | 'evaluations';
  evaluationId?: string;
  actorId: string;
  createdAt: string;
  readAt?: string;
}

export const CATEGORIES: Record<CategoryKey, string> = {
  K: 'نتایج کمی (KPI)',
  Q: 'کیفیت و انطباق',
  B: 'رفتارهای شایستگی',
  S: 'ایمنی (HSE)',
  L: 'رهبری و مدیریت',
};

export const PERFORMANCE_SCALE: Record<number, string> = {
  5: 'فراتر از انتظار',
  4: 'بالاتر از انتظار',
  3: 'مطابق انتظار',
  2: 'نیازمند بهبود',
  1: 'غیرقابل قبول',
};

export const NEED_DOCUMENT_SCORES = [1, 2, 5];
export const MIN_WEIGHT = 5;
export const MAX_WEIGHT = 25;
export const MAX_CRITERIA_COUNT = 12;
export const MANDATORY_SAFETY_CODE = 'S-01';
export const SCALE_FACTOR = 20; // 1-5 scale to 100 scale

export const CYCLE_STEPS = [
  { step: 1, title: 'هدف‌گذاری و تفاهم‌نامه', desc: 'تعیین معیارها و اوزان در ابتدای دوره' },
  { step: 2, title: 'بازخورد مستمر و میان‌دوره', desc: 'گفت‌وگوهای هدایت‌گر و پایش مسیر کار' },
  { step: 3, title: 'خودارزیابی کارمند', desc: 'ثبت خودارزیابی توسط کارمند برای توسعه سلف-آگاهی' },
  { step: 4, title: 'ارزیابی نهایی سرپرست', desc: 'ثبت نمرات و مستندات پشتیبان برای رتبه‌های خاص' },
  { step: 5, title: 'کالیبراسیون سازمانی', desc: 'هم‌ترازسازی نمرات جهت رفع تورم نمره و سوگیری' },
  { step: 6, title: 'ابلاغ، بازخورد و توسعه', desc: 'جلسه گفت‌وگوی توسعه‌ای و بازخورد رشددهنده' },
];

export function getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'E' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'E';
}

export const WORKFLOW_STAGES: Record<WorkflowStageKey, {
  label: string;
  stepNumber: number;
  description: string;
  badgeColor: string;
  actorRole: UserRole | 'committee' | 'any';
  responsibleLabel: string;
}> = {
  self_review: {
    label: 'خودارزیابی کارمند',
    stepNumber: 1,
    description: 'ثبت نمرات خودارزیابی و شواهد توسط کارمند',
    badgeColor: 'blue',
    actorRole: 'employee',
    responsibleLabel: 'کارمند (شاغل)'
  },
  supervisor_review: {
    label: 'ارزیابی سرپرست مستقیم',
    stepNumber: 2,
    description: 'بررسی، ثبت نمرات سرپرست و شواهد ارزیابی',
    badgeColor: 'amber',
    actorRole: 'supervisor',
    responsibleLabel: 'سرپرست مستقیم خط / واحد'
  },
  peer_review: {
    label: 'ارزیابی ۳۶۰ درجه و همتا',
    stepNumber: 3,
    description: 'دریافت بازخورد همکاران و سرپرستان ماتریسی',
    badgeColor: 'cyan',
    actorRole: 'any',
    responsibleLabel: 'ارزیاب همتا / سرپرست تخصصی'
  },
  calibration_review: {
    label: 'کمیته کالیبراسیون و انطباق',
    stepNumber: 4,
    description: 'کنترل توزیع نرمال، رفع تورم نمره و هم‌ترازی سازمانی',
    badgeColor: 'purple',
    actorRole: 'admin',
    responsibleLabel: 'کمیته کالیبراسیون و ارزیابی'
  },
  hr_approval: {
    label: 'تایید نهایی مدیریت منابع انسانی',
    stepNumber: 5,
    description: 'تایید نهایی، قفل نمرات و صدور مجوز کارنامه',
    badgeColor: 'indigo',
    actorRole: 'admin',
    responsibleLabel: 'مدیریت ارشد منابع انسانی'
  },
  feedback_meeting: {
    label: 'گفت‌وگوی بازخورد و IDP',
    stepNumber: 6,
    description: 'جلسه بازخورد توسعه‌ای و تدوین برنامه بهبود فردی',
    badgeColor: 'teal',
    actorRole: 'supervisor',
    responsibleLabel: 'سرپرست و شاغل'
  },
  hse_review: {
    label: 'بررسی واحد HSE',
    stepNumber: 0,
    description: 'بررسی موردی پرونده توسط بازبین تعیین‌شده واحد HSE و بازگشت به ادامه مسیر',
    badgeColor: 'orange',
    actorRole: 'any',
    responsibleLabel: 'بازبین تعیین‌شده HSE'
  },
  completed: {
    label: 'مختومه و بایگانی شده',
    stepNumber: 7,
    description: 'پرونده نهایی شده و در سوابق پرسنلی ثبت گردید',
    badgeColor: 'emerald',
    actorRole: 'any',
    responsibleLabel: 'اتمام فرآیند'
  },
  rejected: {
    label: 'عودت داده شده جهت اصلاح',
    stepNumber: 0,
    description: 'عودت به مرحله قبل به دلیل نقص مستندات یا عدم انطباق',
    badgeColor: 'rose',
    actorRole: 'any',
    responsibleLabel: 'نیازمند بازنگری'
  },
  appealed: {
    label: 'در حال رسیدگی به اعتراض',
    stepNumber: 8,
    description: 'اعتراض شاغل توسط کمیته تجدیدنظر در حال بررسی است',
    badgeColor: 'orange',
    actorRole: 'admin',
    responsibleLabel: 'کمیته تجدیدنظر و فرجام‌خواهی'
  }
};

export const NINE_BOX_MATRIX = {
  high_high: { title: 'ستاره آینده‌ساز (Future Star)', category: 'star' as const, color: 'emerald', desc: 'عملکرد برتر و پتانسیل جهش سازمانی / گزینش برای رهبری' },
  high_med: { title: 'پیشران با پتانسیل بالا (Growth Driver)', category: 'high_performer' as const, color: 'teal', desc: 'عملکرد عالی با ظرفیت ارتقای چندجانبه' },
  high_low: { title: 'متخصص مجرب (Expert / Core Specialist)', category: 'high_performer' as const, color: 'blue', desc: 'عملکرد بسیار پایدار و تسلط عمیق تخصصی' },
  med_high: { title: 'استعداد نوظهور (Emerging Talent)', category: 'high_performer' as const, color: 'cyan', desc: 'پتانسیل بالا نیازمند تثبیت و رشد عملکرد' },
  med_med: { title: 'ستون استوار سازمان (Core Performer)', category: 'core_player' as const, color: 'indigo', desc: 'عملکرد و پتانسیل متعادل و مورد اعتماد' },
  med_low: { title: 'شاغل موثر (Effective Contributor)', category: 'core_player' as const, color: 'amber', desc: 'انجام وظایف استاندارد، حفظ انگیزه و تثبیت' },
  low_high: { title: 'پتانسیل خام / معمای سازمانی (Enigma)', category: 'inconsistent' as const, color: 'purple', desc: 'پتانسیل بالا اما عملکرد نامطلوب / نیازمند تغییر نقش یا انگیزش' },
  low_med: { title: 'نیازمند توانمندسازی (Dilemma)', category: 'inconsistent' as const, color: 'orange', desc: 'نیازمند آموزش فوری و مربیگری مهارتی' },
  low_low: { title: 'ریسک عملکردی (Underperformer)', category: 'talent_risk' as const, color: 'rose', desc: 'نیازمند برنامه اقدام اصلاحی اضطراری (PIP)' }
};

export const DEFAULT_ROUTE_RULES: EvaluationRouteRule[] = [
  {
    id: 'route-default-workshop',
    title: 'مسیر استاندارد مشاغل کارگاهی و تولیدی',
    unit: 'all',
    profileId: 'all',
    requiresSelfReview: false,
    requiresSupervisorReview: true,
    requiresCalibration: true,
    requiresHrApproval: true,
    autoAdvanceOnPass: false
  },
  {
    id: 'route-fast-track',
    title: 'مسیر سریع پرسنل موقت یا آزمایشی',
    unit: 'all',
    requiresSelfReview: false,
    requiresSupervisorReview: true,
    requiresCalibration: false,
    requiresHrApproval: true,
    autoAdvanceOnPass: true
  }
];

export const GRADE_DETAILS = {
  A: { label: 'برجسته و ستودنی', color: 'emerald', description: 'به‌طور مستمر فراتر از سطح انتظارات عمل کرده است.' },
  B: { label: 'خوب و فراتر از انتظار', color: 'blue', description: 'بسیاری از اهداف را بالاتر از سطح انتظار محقق کرده است.' },
  C: { label: 'کامل و مطابق انتظار', color: 'amber', description: 'اهداف تعریف‌شده را به‌طور کامل و با کیفیت پذیرفتنی انجام داده است.' },
  D: { label: 'نیازمند بهبود', color: 'orange', description: 'برخی از اهداف کلیدی محقق نشده و نیاز به مربیگری مستقیم دارد.' },
  E: { label: 'غیرقابل قبول', color: 'red', description: 'عملکرد بسیار پایین‌تر از استانداردهای پذیرفتنی است.' },
};

// ==========================================
// LATTICE-STYLE TALENT & PERFORMANCE TYPES
// ==========================================

export type OKRConfidence = 'on_track' | 'at_risk' | 'behind' | 'completed';
export type OKRLevel = 'company' | 'department' | 'individual';

export interface OKRKeyResult {
  id: string;
  title: string;
  metricType: 'percentage' | 'number' | 'currency' | 'boolean';
  startValue: number;
  currentValue: number;
  targetValue: number;
  unit: string;
  confidence: OKRConfidence;
  ownerName: string;
  lastUpdated: string;
}

export interface OKRGoal {
  id: string;
  title: string;
  description: string;
  level: OKRLevel;
  department: string;
  ownerId: string;
  ownerName: string;
  period: string; // e.g. "۱۴۰۵ - سه‌ماهه اول"
  category: 'strategic' | 'quality' | 'productivity' | 'safety' | 'innovation' | 'people';
  progress: number; // 0 to 100
  confidence: OKRConfidence;
  keyResults: OKRKeyResult[];
  alignmentParentId?: string; // Cascaded parent OKR
  createdDate: string;
  dueDate: string;
}

export interface TalkingPoint {
  id: string;
  text: string;
  isCompleted: boolean;
  addedBy: 'supervisor' | 'employee';
}

export interface OneOnOneActionItem {
  id: string;
  title: string;
  assigneeName: string;
  dueDate: string;
  isDone: boolean;
}

export interface OneOnOneMeeting {
  id: string;
  empId: string;
  empName: string;
  supervisorId: string;
  supervisorName: string;
  scheduledDate: string; // e.g. "۱۴۰۵/۰۶/۱۵ ساعت ۱۰:۰۰"
  period: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  talkingPoints: TalkingPoint[];
  actionItems: OneOnOneActionItem[];
  sharedNotes?: string;
  privateSupervisorNotes?: string;
  moodRating?: number; // 1 to 5
  meetingMinutes?: string;
}

export interface PraiseKudos {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  receiverId: string;
  receiverName: string;
  companyValue: 'کیفیت برتر' | 'کار تیمی و همدلی' | 'تعهد به ایمنی و HSE' | 'نوآوری و خلاقیت فنی' | 'مسئولیت‌پذیری و انضباط';
  badgeIcon: string;
  message: string;
  reactions: {
    claps: number;
    hearts: number;
    rockets: number;
    stars: number;
  };
  userReactions?: string[]; // current user reacted emojis
  createdAt: string;
}

export interface Feedback360Request {
  id: string;
  targetEmpId: string;
  targetEmpName: string;
  reviewerEmpId: string;
  reviewerEmpName: string;
  relationship: 'peer' | 'subordinate' | 'cross_functional' | 'manager';
  status: 'pending' | 'submitted';
  period: string;
  strengths?: string;
  growthAreas?: string;
  ratings?: Record<string, number>; // competencyId -> 1..5
  submittedAt?: string;
}

export interface PulseSurveyMetric {
  id: string;
  title: string;
  category: 'engagement' | 'manager_support' | 'workload' | 'recognition' | 'psychological_safety';
  score: number; // 0 to 100
  trend: 'up' | 'down' | 'stable';
  changeValue: string; // e.g. "+4.2%"
  responseRate: number; // e.g. 92%
}

// ==========================================
// KICKIDLER-STYLE PRODUCTIVITY & ACTIVITY TYPES
// ==========================================

export type KickidlerLiveStatus = 'productive' | 'neutral' | 'unproductive' | 'idle' | 'offline';

export interface TimeCategoryBreakdown {
  productiveMinutes: number;   // زمان کار واقعی و ابزارهای مجاز
  neutralMinutes: number;      // مکاتبات اداری، سرچ فنی
  unproductiveMinutes: number; // شبکه‌های نامربوط، سایت‌های تفریحی، اتلاف وقت
  idleMinutes: number;         // خواب سیستم، دور بودن از ایستگاه
  totalWorkMinutes: number;    // کل زمان ثبت شده شیفت
}

export interface WorkdayActivityRecord {
  id: string;
  empId: string;
  empName: string;
  empCode: string;
  unit: string;
  date: string; // e.g. "۱۴۰۵/۰۶/۱۴"
  timeBreakdown: TimeCategoryBreakdown;
  productivityIndex: number; // 0 to 100% (Kickidler Efficiency Rate)
  keystrokesCount: number;
  mouseClicksCount: number;
  activeAppTitle: string;
  activeAppCategory: 'cad_cam' | 'mes_erp' | 'office_docs' | 'browsing' | 'idle';
  burnoutRiskScore: number; // 0 to 100%
  burnoutCategory: 'optimal' | 'high_workload' | 'burnout_risk' | 'underloaded';
  violationsCount: number;
}

export interface LiveEmployeeActivity {
  empId: string;
  empName: string;
  empCode: string;
  unit: string;
  status: KickidlerLiveStatus;
  currentApp: string;
  currentAppCategory: string;
  shiftStartTime: string;
  activeDurationMinutes: number;
  todayProductivityRate: number; // %
  todayIdleMinutes: number;
  intensityRate: 'high' | 'medium' | 'low'; // ضربان فعالیت فعلی
  lastActiveTimestamp: string;
  avatarColor?: string;
}

export interface KickidlerViolation {
  id: string;
  empId: string;
  empName: string;
  empCode: string;
  unit: string;
  timestamp: string;
  type: 'unproductive_site' | 'prolonged_idle' | 'late_arrival' | 'early_departure' | 'unauthorized_program';
  title: string;
  description: string;
  durationMinutes?: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'new' | 'acknowledged' | 'addressed';
}



export interface SupportTicket {
  id: string;
  senderId: string;
  senderName: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'closed';
  createdAt: string;
  updatedAt: string;
  replies: { id: string; senderId: string; senderName: string; message: string; createdAt: string; isAdmin: boolean }[];
}

export interface RewardCoefficient {
  jobFamily: string; // "all" for default, or specific family like "تولید"
  baseAmount: number; // Base reward in IRR/Toman
}

export interface PerformanceMultiplier {
  minScore: number;
  maxScore: number;
  multiplier: number;
}

export interface RewardConfig {
  formula?: string;
  coefficients: RewardCoefficient[];
  multipliers: PerformanceMultiplier[];
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Comprehensive Seed Data for Lattice & Kickidler Modules
 * Tailored for Isfahan Chalak Enterprise Environment
 */

import { 
  OKRGoal, 
  OneOnOneMeeting, 
  PraiseKudos, 
  PulseSurveyMetric, 
  WorkdayActivityRecord, 
  LiveEmployeeActivity, 
  KickidlerViolation 
} from '../types';

export const INITIAL_OKRS: OKRGoal[] = [];

export const INITIAL_ONE_ON_ONES: OneOnOneMeeting[] = [];

export const INITIAL_KUDOS: PraiseKudos[] = [];

export const INITIAL_PULSE_METRICS: PulseSurveyMetric[] = [
  {
    id: 'pm-1',
    title: 'شاخص تعلق و انگیزش سازمانی (eSat)',
    category: 'engagement',
    score: 86.4,
    trend: 'up',
    changeValue: '+4.2%',
    responseRate: 94
  },
  {
    id: 'pm-2',
    title: 'اثربخشی بازخورد و مربیگری سرپرستان مستقیم',
    category: 'manager_support',
    score: 89.1,
    trend: 'up',
    changeValue: '+6.5%',
    responseRate: 91
  },
  {
    id: 'pm-3',
    title: 'تعادل بار کاری و سلامت روانی (Work-Life Balance)',
    category: 'workload',
    score: 75.8,
    trend: 'stable',
    changeValue: '+0.8%',
    responseRate: 88
  },
  {
    id: 'pm-4',
    title: 'شاخص امنیت روانی و جرات‌ورزی در ارائه ایده‌ها',
    category: 'psychological_safety',
    score: 82.0,
    trend: 'up',
    changeValue: '+3.1%',
    responseRate: 89
  }
];

// ==========================================
// KICKIDLER REAL-TIME MONITORING SEED DATA
// ==========================================

export const INITIAL_KICKIDLER_RECORDS: WorkdayActivityRecord[] = [
  {
    id: 'kd-rec-1',
    empId: 'emp-1',
    empName: 'کارمند نمونه',
    empCode: 'EMP-1001',
    unit: 'سالن ماشین‌کاری ۱',
    date: '۱۴۰۵/۰۶/۱۴',
    timeBreakdown: {
      productiveMinutes: 405, // 6h 45m
      neutralMinutes: 42,     // 42m
      unproductiveMinutes: 13,// 13m
      idleMinutes: 20,        // 20m
      totalWorkMinutes: 480   // 8h
    },
    productivityIndex: 88.5,
    keystrokesCount: 14280,
    mouseClicksCount: 3840,
    activeAppTitle: 'سیستم برنامه‌ریزی تولید اصفهان چالاک (MES)',
    activeAppCategory: 'mes_erp',
    burnoutRiskScore: 32,
    burnoutCategory: 'optimal',
    violationsCount: 0
  },
  {
    id: 'kd-rec-2',
    empId: 'emp-2',
    empName: 'سرکار خانم مریم احمدی',
    empCode: 'EMP-1002',
    unit: 'آزمایشگاه کنترل کیفیت',
    date: '۱۴۰۵/۰۶/۱۴',
    timeBreakdown: {
      productiveMinutes: 420, // 7h 00m
      neutralMinutes: 35,
      unproductiveMinutes: 10,
      idleMinutes: 15,
      totalWorkMinutes: 480
    },
    productivityIndex: 91.2,
    keystrokesCount: 16900,
    mouseClicksCount: 4200,
    activeAppTitle: 'نرم‌افزار CMM و آنالیز اندازه‌برداری Mitutoyo',
    activeAppCategory: 'cad_cam',
    burnoutRiskScore: 28,
    burnoutCategory: 'optimal',
    violationsCount: 0
  },
  {
    id: 'kd-rec-3',
    empId: 'emp-3',
    empName: 'مهندس حسن کریمی',
    empCode: 'EMP-1003',
    unit: 'سالن ماشین‌کاری ۱',
    date: '۱۴۰۵/۰۶/۱۴',
    timeBreakdown: {
      productiveMinutes: 370, // 6h 10m
      neutralMinutes: 50,
      unproductiveMinutes: 28,
      idleMinutes: 32,
      totalWorkMinutes: 480
    },
    productivityIndex: 82.0,
    keystrokesCount: 11400,
    mouseClicksCount: 2950,
    activeAppTitle: 'کنترلر CNC زیمنس Sinumerik 840D',
    activeAppCategory: 'cad_cam',
    burnoutRiskScore: 68,
    burnoutCategory: 'high_workload',
    violationsCount: 1
  },
  {
    id: 'kd-rec-4',
    empId: 'emp-4',
    empName: 'کارمند نمونه',
    empCode: 'EMP-1004',
    unit: 'واحد تعالی سازمانی و کالیبراسیون',
    date: '۱۴۰۵/۰۶/۱۴',
    timeBreakdown: {
      productiveMinutes: 395,
      neutralMinutes: 55,
      unproductiveMinutes: 12,
      idleMinutes: 18,
      totalWorkMinutes: 480
    },
    productivityIndex: 86.8,
    keystrokesCount: 18450,
    mouseClicksCount: 5120,
    activeAppTitle: 'سامانه تحلیل کالیبراسیون و انطباق استاندارد ISO',
    activeAppCategory: 'mes_erp',
    burnoutRiskScore: 35,
    burnoutCategory: 'optimal',
    violationsCount: 0
  },
  {
    id: 'kd-rec-5',
    empId: 'emp-5',
    empName: 'کارمند نمونه',
    empCode: 'EMP-1005',
    unit: 'سالن ماشین‌کاری ۱',
    date: '۱۴۰۵/۰۶/۱۴',
    timeBreakdown: {
      productiveMinutes: 325, // 5h 25m
      neutralMinutes: 60,
      unproductiveMinutes: 45,
      idleMinutes: 50,
      totalWorkMinutes: 480
    },
    productivityIndex: 72.4,
    keystrokesCount: 8900,
    mouseClicksCount: 2100,
    activeAppTitle: 'مرورگر کروم - وب‌گردی و پورتال اخبار',
    activeAppCategory: 'browsing',
    burnoutRiskScore: 45,
    burnoutCategory: 'underloaded',
    violationsCount: 2
  }
];

export const INITIAL_LIVE_ACTIVITIES: LiveEmployeeActivity[] = [
  {
    empId: 'emp-1',
    empName: 'کارمند نمونه',
    empCode: 'EMP-1001',
    unit: 'سالن ماشین‌کاری ۱',
    status: 'productive',
    currentApp: 'سامانه داشبورد تولید MES (میز کار فعال)',
    currentAppCategory: 'نرم‌افزار مجاز صنعتی (ERP/MES)',
    shiftStartTime: '۰۷:۳۰',
    activeDurationMinutes: 145,
    todayProductivityRate: 88.5,
    todayIdleMinutes: 20,
    intensityRate: 'high',
    lastActiveTimestamp: 'همین الان (پالس فعال)',
    avatarColor: 'bg-emerald-600'
  },
  {
    empId: 'emp-2',
    empName: 'سرکار خانم مریم احمدی',
    empCode: 'EMP-1002',
    unit: 'آزمایشگاه کنترل کیفیت',
    status: 'productive',
    currentApp: 'نرم‌افزار CMM Mitutoyo - گزارش تلرانس‌های بسته ۵',
    currentAppCategory: 'مهندسی و آزمایشگاه دقیق',
    shiftStartTime: '۰۷:۴۵',
    activeDurationMinutes: 110,
    todayProductivityRate: 91.2,
    todayIdleMinutes: 15,
    intensityRate: 'high',
    lastActiveTimestamp: 'همین الان (پالس فعال)',
    avatarColor: 'bg-blue-600'
  },
  {
    empId: 'emp-3',
    empName: 'مهندس حسن کریمی',
    empCode: 'EMP-1003',
    unit: 'سالن ماشین‌کاری ۱',
    status: 'neutral',
    currentApp: 'فایل اکسل گزارش شیفت و متریال ایستگاه فرز ۳',
    currentAppCategory: 'اسناد اداری و گزارش‌های شیفت',
    shiftStartTime: '۰۷:۵۰',
    activeDurationMinutes: 40,
    todayProductivityRate: 82.0,
    todayIdleMinutes: 32,
    intensityRate: 'medium',
    lastActiveTimestamp: '۳ دقیقه قبل',
    avatarColor: 'bg-indigo-600'
  },
  {
    empId: 'emp-4',
    empName: 'کارمند نمونه',
    empCode: 'EMP-1004',
    unit: 'واحد تعالی سازمانی و کالیبراسیون',
    status: 'productive',
    currentApp: 'ماژول کالیبراسیون عملکرد و شایستگی اصفهان چالاک',
    currentAppCategory: 'پرتال منابع انسانی و کالیبراسیون',
    shiftStartTime: '۰۷:۳۰',
    activeDurationMinutes: 180,
    todayProductivityRate: 86.8,
    todayIdleMinutes: 18,
    intensityRate: 'high',
    lastActiveTimestamp: 'همین الان (پالس فعال)',
    avatarColor: 'bg-purple-600'
  },
  {
    empId: 'emp-5',
    empName: 'کارمند نمونه',
    empCode: 'EMP-1005',
    unit: 'سالن ماشین‌کاری ۱',
    status: 'idle',
    currentApp: 'عدم تعامل کاربر با ایستگاه کاری (قفل موقت)',
    currentAppCategory: 'زمان عدم فعالیت (Idle Time)',
    shiftStartTime: '۰۸:۰۵',
    activeDurationMinutes: 0,
    todayProductivityRate: 72.4,
    todayIdleMinutes: 50,
    intensityRate: 'low',
    lastActiveTimestamp: '۱۸ دقیقه قبل',
    avatarColor: 'bg-amber-600'
  }
];

export const INITIAL_VIOLATIONS: KickidlerViolation[] = [
  {
    id: 'viol-1',
    empId: 'emp-5',
    empName: 'کارمند نمونه',
    empCode: 'EMP-1005',
    unit: 'سالن ماشین‌کاری ۱',
    timestamp: '۱۴۰۵/۰۶/۱۴ - ۰۸:۰۵',
    type: 'late_arrival',
    title: 'تاخیر ۳۵ دقیقه‌ای در شروع شیفت کاری',
    description: 'شروع کارت‌زنی در ساعت ۰۸:۰۵ انجام شد در حالی که شیفت موظف از ساعت ۰۷:۳۰ بوده است.',
    durationMinutes: 35,
    severity: 'medium',
    status: 'acknowledged'
  },
  {
    id: 'viol-2',
    empId: 'emp-5',
    empName: 'کارمند نمونه',
    empCode: 'EMP-1005',
    unit: 'سالن ماشین‌کاری ۱',
    timestamp: '۱۴۰۵/۰۶/۱۴ - ۱۰:۴۵',
    type: 'prolonged_idle',
    title: 'توقف بدون فعالیت (Idle) بیش از ۳۵ دقیقه',
    description: 'هیچ‌گونه پالس ورودی ماوس، کیبورد یا کنترلر خط در مدت ۳۸ دقیقه ثبت نگردید.',
    durationMinutes: 38,
    severity: 'high',
    status: 'new'
  },
  {
    id: 'viol-3',
    empId: 'emp-3',
    empName: 'مهندس حسن کریمی',
    empCode: 'EMP-1003',
    unit: 'سالن ماشین‌کاری ۱',
    timestamp: '۱۴۰۵/۰۶/۱۳ - ۱۴:۲۰',
    type: 'unproductive_site',
    title: 'استفاده از شبکه اجتماعی و سایت تفریحی در شیفت کاری',
    description: 'بازدید از وب‌سایت‌های سرگرمی به مدت ۲۲ دقیقه متوالی در زمان فعال خط تولید.',
    durationMinutes: 22,
    severity: 'medium',
    status: 'addressed'
  }
];

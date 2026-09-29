/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Criterion, JobProfile, Employee, Evaluation } from './types';

export const SEED_CRITERIA: Criterion[] = [
  // نتایج کمی (K)
  {
    id: 'crit-k1',
    code: 'K-01',
    cat: 'K',
    name: 'تحقق خروجی نسبت به هدف',
    def: 'درصد دستیابی به اهداف تولید هفتگی و ماهانه تعیین شده در سیستم WMS/MES',
    source: 'گزارش سیستم MES',
    method: 'نسبت کل تولید تایید شده به هدف تعیین شده (درصد)',
    dir: 'more',
    scoringSource: 'mis',
    misMetricKey: 'efficiency',
    autoPopulate: true
  },
  {
    id: 'crit-k2',
    code: 'K-04',
    cat: 'K',
    name: 'نرخ ضایعات و دوباره‌کاری',
    def: 'درصد قطعات ضایع شده یا نیازمند دوباره‌کاری از کل تولید خط',
    source: 'ثبت کارپوشه QC / ضایعات ایستگاه',
    method: 'نسبت اقلام رد شده به کل اقلام خروجی (معکوس)',
    dir: 'less',
    scoringSource: 'mis',
    misMetricKey: 'scrap_rate',
    autoPopulate: true
  },
  {
    id: 'crit-k3',
    code: 'K-06',
    cat: 'K',
    name: 'اثربخشی کلی تجهیزات (OEE)',
    def: 'میزان بهره‌وری، دسترس‌پذیری و کیفیت ماشین‌آلات در زمان کارکرد',
    source: 'لاگ دیجیتال ماشین (MES)',
    method: 'درصد تحقق بهره‌وری کل خط (درصد)',
    dir: 'more',
    scoringSource: 'mis',
    misMetricKey: 'efficiency',
    autoPopulate: true
  },
  {
    id: 'crit-k4',
    code: 'K-07',
    cat: 'K',
    name: 'نرخ توقفات قابل‌کنترل',
    def: 'مجموع زمان توقفات خط ناشی از خطای اپراتوری، دیرکرد مواد یا خطای تنظیمات',
    source: 'ثبت سیستم مانیتورینگ توقفات خط',
    method: 'معکوس مجموع ساعات توقف غیرمجاز در ماه',
    dir: 'less',
    scoringSource: 'mis',
    misMetricKey: 'downtime',
    autoPopulate: true
  },
  {
    id: 'crit-k5',
    code: 'K-09',
    cat: 'K',
    name: 'پوشش بازرسی طبق برنامه',
    def: 'درصد انجام ممیزی‌ها و تست‌های محصول طبق چک‌لیست مدون کنترل کیفیت',
    source: 'کارتابل کنترل کیفیت (QC Log)',
    method: 'تعداد بازرسی‌های ثبت شده به برنامه‌ریزی مصوب',
    dir: 'more',
    scoringSource: 'supervisor',
    autoPopulate: false
  },
  {
    id: 'crit-k6',
    code: 'K-10',
    cat: 'K',
    name: 'به‌موقع بودن تصمیم‌گیری ترخیص/توقف محموله',
    def: 'میانگین زمان سپری شده برای اعلام نظر فنی در خصوص محموله‌های بلاتکلیف',
    source: 'سامانه یکپارچه انبار و کیفیت',
    method: 'درصد تصمیم‌گیری‌های انجام شده زیر استاندارد زمانی ۶۰ دقیقه',
    dir: 'more',
    scoringSource: 'supervisor',
    autoPopulate: false
  },
  {
    id: 'crit-k7',
    code: 'K-11',
    cat: 'K',
    name: 'زمان تعویض و راه‌اندازی (Changeover)',
    def: 'مدت زمان خاموشی دستگاه برای تغییر قالب، تعویض ابزار یا تنظیم سایز جدید تولید',
    source: 'لاگ عملیاتی راه‌اندازان تولید',
    method: 'معکوس میانگین زمان تعویض قالب در ماه (دقیقه)',
    dir: 'less',
    scoringSource: 'mis',
    misMetricKey: 'downtime',
    autoPopulate: true
  },

  // کیفیت و انطباق (Q)
  {
    id: 'crit-q1',
    code: 'Q-01',
    cat: 'Q',
    name: 'رعایت دقیق استانداردهای SOP',
    def: 'میزان انطباق گام‌های کاری با دستورالعمل‌های استاندارد عملیاتی مصوب خط',
    source: 'نتایج ممیزی دوره‌ای سرپرست براساس چک‌لیست BARS',
    method: 'ممیزی تصادفی ماهیانه با سنجه ۵ سطحی رفتاری',
    scoringSource: 'supervisor',
    autoPopulate: false
  },
  {
    id: 'crit-q2',
    code: 'Q-03',
    cat: 'Q',
    name: 'صحت و کامل‌بودن ثبت داده‌های کیفی',
    def: 'دقت ثبت سوابق کیفی، ابعاد، عیوب و نتایج در سامانه یکپارچه سازمان بدون خطای اعتبارسنجی',
    source: 'بازرسی نمونه‌ای پرونده‌های کنترل فرآیند',
    method: 'چک‌لیست تطبیقی سوابق ثبت‌شده',
    scoringSource: 'supervisor',
    autoPopulate: false
  },
  {
    id: 'crit-q3',
    code: 'Q-04',
    cat: 'Q',
    name: 'رعایت دستورالعمل فنی تنظیمات اولیه',
    def: 'دقت در اعمال پارامترهای فنی کالیبراسیون دستگاه طبق کارت مشخصات محصول',
    source: 'لاگ فنی راه‌اندازی قالب',
    method: 'چک‌لیست راه‌اندازی بدون انحراف پارامتری',
    scoringSource: 'supervisor',
    autoPopulate: false
  },
  {
    id: 'crit-q4',
    code: 'Q-05',
    cat: 'Q',
    name: 'رعایت اصول نظام آراستگی (5S)',
    def: 'پاکیزه‌سازی، سازماندهی، انضباط و مرتب‌سازی ابزار و ایستگاه کاری قبل، حین و بعد از شیفت',
    source: 'امتیاز ممیزی هفتگی واحد HSE & 5S',
    method: 'میانگین نمره ممیزی‌های تصادفی ۵اس',
    scoringSource: 'supervisor',
    autoPopulate: false
  },

  // ایمنی (S) - اختیاری
  {
    id: 'crit-s1',
    code: 'S-01',
    cat: 'S',
    name: 'رعایت اصول ایمنی، بهداشت و موازین HSE',
    def: 'استفاده مستمر از تجهیزات حفاظت فردی (کلاه، دستکش، عینک) و گزارش‌دهی شرایط ناایمن و شبه‌حوادث',
    source: 'سیستم ثبت تخلفات ایمنی / چک‌لیست ناظر HSE',
    method: 'ارزیابی رفتاری بر اساس پرونده عدم‌انطباق (HSE Incident Rate)',
    scoringSource: 'supervisor',
    autoPopulate: false
  },

  // رفتارهای شایستگی (B)
  {
    id: 'crit-b1',
    code: 'B-01',
    cat: 'B',
    name: 'نظم، تعهد کاری و انضباط حضور',
    def: 'کارت‌زنی دقیق، حضور به موقع در ایستگاه کاری و پاسخگویی سریع در تعویض شیفت',
    source: 'گزارش سیستم حضور و غیاب کسری',
    method: 'سنجش دقایق تاخیر و غیبت با کسر نمره',
    scoringSource: 'kasra',
    misMetricKey: 'attendance_delay',
    autoPopulate: true
  },
  {
    id: 'crit-b2',
    code: 'B-03',
    cat: 'B',
    name: 'مسئولیت‌پذیری و دقت فنی در انجام وظایف',
    def: 'احساس مالکیت نسبت به ایستگاه، مراقبت اصولی از ماشین‌آلات و پاسخگویی مسئولانه در زمان رخداد خطا',
    source: 'فرم ارزیابی ۳۶۰ درجه و نظرسنجی همکاران',
    method: 'سنجش شاخص‌های تعهد و پاسخگویی رفتاری',
    scoringSource: 'supervisor',
    autoPopulate: false
  },

  // رهبری و مدیریت (L)
  {
    id: 'crit-l1',
    code: 'L-01',
    cat: 'L',
    name: 'مربیگری و توسعه مهارت‌های تیم',
    def: 'تلاش فعالانه برای آموزش اپراتورهای تازه‌کار و ارتقای سطح دانش فنی اعضای خط تولید',
    source: 'پرونده آموزش‌های ثبت‌شده درون‌واحدی',
    method: 'تعداد ساعات آموزش ارائه شده و پیشرفت مهارت کارآموزان',
    scoringSource: 'supervisor',
    autoPopulate: false
  }
];

export const SEED_PROFILES: JobProfile[] = [
  {
    id: 'prof-1',
    title: 'اپراتور خط تولید',
    code: 'B1',
    family: 'مشاغل کارگاهی (تولیدی)',
    locked: true,
    items: [
      { cid: 'crit-k3', weight: 20 }, // راندمان OEE
      { cid: 'crit-k4', weight: 15 }, // توقفات قابل‌کنترل
      { cid: 'crit-k2', weight: 15 }, // نرخ ضایعات
      { cid: 'crit-q1', weight: 15 }, // رعایت SOP
      { cid: 'crit-q4', weight: 10 }, // رعایت 5S
      { cid: 'crit-s1', weight: 15 }, // ایمنی (HSE)
      { cid: 'crit-b1', weight: 10 }, // نظم و تعهد
    ]
  },
  {
    id: 'prof-2',
    title: 'اپراتور کنترل کیفیت (QC)',
    code: 'B3',
    family: 'مشاغل کارگاهی (کیفی)',
    locked: true,
    items: [
      { cid: 'crit-k5', weight: 25 }, // پوشش بازرسی طبق برنامه (بالای سقف مجاز ۲۵٪ نیست)
      { cid: 'crit-k6', weight: 15 }, // به‌موقع بودن محموله
      { cid: 'crit-q1', weight: 15 }, // رعایت SOP
      { cid: 'crit-q2', weight: 15 }, // صحت ثبت داده‌ها
      { cid: 'crit-s1', weight: 15 }, // ایمنی
      { cid: 'crit-b2', weight: 15 }, // مسئولیت‌پذیری فنی
    ]
  },
  {
    id: 'prof-3',
    title: 'اپراتور تنظیم و راه‌اندازی (Setup)',
    code: 'B5',
    family: 'مشاغل فنی تخصصی',
    locked: false,
    items: [
      { cid: 'crit-k7', weight: 25 }, // زمان تعویض قالب
      { cid: 'crit-k4', weight: 15 }, // توقفات قابل‌کنترل
      { cid: 'crit-k2', weight: 10 }, // ضایعات
      { cid: 'crit-q1', weight: 15 }, // رعایت SOP
      { cid: 'crit-q3', weight: 10 }, // رعایت رویه تنظیم اولیه
      { cid: 'crit-s1', weight: 15 }, // ایمنی
      { cid: 'crit-b2', weight: 10 }, // مسئولیت‌پذیری
    ]
  }
];

export const SEED_EMPLOYEES: Employee[] = [
  {
    id: 'emp-admin',
    name: 'مدیریت ارشد منابع انسانی',
    code: 'ADMIN-001',
    profileId: 'prof-3',
    unit: 'ستاد مرکزی اصفهان چالاک',
    role: 'admin',
    username: 'admin'
  }
];

export const SEED_EVALUATIONS: Evaluation[] = [];

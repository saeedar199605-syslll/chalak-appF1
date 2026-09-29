/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CalendarWorkflowEvent {
  id: string;
  title: string;
  description: string;
  location?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  allDay?: boolean;
}

/**
 * Format Date string into ICS format (e.g. 20260825 or 20260825T090000Z)
 */
function formatICSDate(dateStr: string, isAllDay: boolean = true): string {
  const clean = dateStr.replace(/-/g, '');
  if (isAllDay) {
    return clean;
  }
  return `${clean}T083000Z`;
}

/**
 * Generate iCalendar RFC-5545 text format
 */
export function generateICSContent(events: CalendarWorkflowEvent[]): string {
  const nowStr = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chalak Performance Management//Workflow Deadlines//FA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:تقویم سررسید ارزیابی عملکرد اصفهان چالاک',
    'X-WR-TIMEZONE:Asia/Tehran',
    'X-WR-CALDESC:مهلت‌های زمانی و سررسید گام‌های ارزیابی عملکرد پرسنل'
  ];

  events.forEach(evt => {
    const startFormatted = formatICSDate(evt.startDate, evt.allDay !== false);
    const endFormatted = formatICSDate(evt.endDate, evt.allDay !== false);

    ics.push(
      'BEGIN:VEVENT',
      `UID:${evt.id}-${nowStr}@chalak-performance.local`,
      `DTSTAMP:${nowStr}`,
      `DTSTART;VALUE=DATE:${startFormatted}`,
      `DTEND;VALUE=DATE:${endFormatted}`,
      `SUMMARY:${evt.title.replace(/,/g, '\\,')}`,
      `DESCRIPTION:${evt.description.replace(/\n/g, '\\n').replace(/,/g, '\\,')}`,
      evt.location ? `LOCATION:${evt.location.replace(/,/g, '\\,')}` : 'LOCATION:سامانه ارزیابی عملکرد اصفهان چالاک',
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:یادآوری: ۱ روز مانده به ${evt.title}`,
      'END:VALARM',
      'END:VEVENT'
    );
  });

  ics.push('END:VCALENDAR');
  return ics.join('\r\n');
}

/**
 * Trigger download of .ics file
 */
export function downloadWorkflowCalendarICS(events: CalendarWorkflowEvent[], filename = 'chalak_evaluation_deadlines.ics') {
  const content = generateICSContent(events);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Standard factory workflow deadlines for the current review cycle
 */
export const DEFAULT_WORKFLOW_DEADLINES: CalendarWorkflowEvent[] = [
  {
    id: 'step-1-goal-setting',
    title: 'گام ۱: ابلاغ اهداف و ماتریس شاخص‌های شایستگی',
    description: 'ابلاغ فرمول‌های عملکردی و وزن شاخص‌های پنج‌گانه به کلیه پرسنل و سرپرستان واحدهای تولیدی و ستادی',
    startDate: '2026-08-25',
    endDate: '2026-08-28',
    location: 'کارخانه اصفهان چالاک - سامانه ارزیابی'
  },
  {
    id: 'step-2-self-eval',
    title: 'گام ۲: سررسید تکمیل خودارزیابی پرسنل',
    description: 'مهلت نهایی همکاران جهت امتیازدهی به خود در سامانه و بارگذاری مستندات کلیدی شایستگی‌ها',
    startDate: '2026-09-01',
    endDate: '2026-09-06',
    location: 'سامانه کارنامه پرسنلی'
  },
  {
    id: 'step-3-supervisor-review',
    title: 'گام ۳: سررسید ارزیابی اولیه سرپرستان و ثبت بازخورد',
    description: 'بررسی دقیق کارنامه افراد تحت سرپرستی، امتیازدهی ۱ تا ۵ و درج خلاصه نقاط قوت و فرصت‌های بهبود',
    startDate: '2026-09-07',
    endDate: '2026-09-14',
    location: 'کارتابل سرپرستان'
  },
  {
    id: 'step-4-coaching-meeting',
    title: 'گام ۴: برگزاری جلسات گفت‌وگوی عملکرد و مربیگری',
    description: 'مذاکره حضوری دونفره سرپرست و همکار جهت تفاهم بر روی برنامه توسعه فردی (IDP) و توافق نمرات',
    startDate: '2026-09-15',
    endDate: '2026-09-22',
    location: 'اتاق جلسات واحدها'
  },
  {
    id: 'step-5-calibration-committee',
    title: 'گام ۵: جلسه کمیته کالیبراسیون و توزیع نرمال گریدها',
    description: 'بررسی توزیع نمرات سازمان در کمیته ارزیابی، بازبینی ماتریس ۹ خانه‌ای استعداد و تایید نهایی مدیریت ارشد',
    startDate: '2026-09-23',
    endDate: '2026-09-26',
    location: 'سالن جلسات مدیریت ارشد'
  },
  {
    id: 'step-6-final-announcement',
    title: 'گام ۶: ابلاغ احکام پاداش شایستگی و قفل نهایی پرونده‌ها',
    description: 'صدور احکام رتبه‌بندی عملکرد، اعمال ضرایب پاداش بهره‌وری و قفل امنیتی پرونده‌های دوره',
    startDate: '2026-09-27',
    endDate: '2026-09-30',
    location: 'سامانه منابع انسانی'
  }
];

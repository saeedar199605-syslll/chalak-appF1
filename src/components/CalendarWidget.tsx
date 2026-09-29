/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronRight, 
  ChevronLeft, 
  Clock, 
  MapPin, 
  Users, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  CalendarDays,
  Target,
  Scale,
  Sparkles,
  ClipboardList,
  Filter,
  ArrowUpRight,
  X,
  Edit2,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Employee, Evaluation } from '../types';
import { db } from '../utils/db';

export type CalendarEventType = 'evaluation' | 'calibration' | 'okr' | 'one_on_one';

export interface CalendarEvent {
  id: string;
  title: string;
  type: CalendarEventType;
  dateStr: string; // e.g. "1404/07/15"
  time: string;
  location: string;
  attendees: string;
  description: string;
  targetTab?: string;
  status?: 'upcoming' | 'urgent' | 'completed';
}

interface CalendarWidgetProps {
  currentUser?: Employee;
  evaluations?: Evaluation[];
  onNavigate?: (tab: string) => void;
  theme?: 'dark' | 'light';
}

const PERSIAN_MONTH_NAMES = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

const WEEKDAY_NAMES = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

// Preloaded realistic events for Chalak industrial workshop & supervisor schedule
const DEFAULT_EVENTS: CalendarEvent[] = [
  {
    id: 'evt-1',
    title: 'سررسید خودارزیابی پرسنل سالن ماشین‌کاری ۱',
    type: 'evaluation',
    dateStr: '1404/07/08',
    time: '۱۶:۰۰',
    location: 'پرتال خودارزیابی سامانه',
    attendees: 'تمامی اپراتورهای ماشین‌کاری و تراشکاری',
    description: 'پایان مهلت ثبت نمرات خودارزیابی و بارگذاری مستندات شایستگی فردی در سیستم.',
    targetTab: 'evaluations',
    status: 'urgent'
  },
  {
    id: 'evt-2',
    title: 'جلسه کالیبراسیون نمرات خطوط تولید و مونتاژ',
    type: 'calibration',
    dateStr: '1404/07/12',
    time: '۱۰:۳۰',
    location: 'اتاق جلسات مدیریت تولید (طبقه ۲)',
    attendees: 'سرپرستان خطوط، مدیر کارخانه، نماینده منابع انسانی',
    description: 'بررسی هم‌ترازی توزیع نمرات نهایی کارگاهی و رفع سوگیری‌های ارفاقی یا سخت‌گیرانه.',
    targetTab: 'calibration',
    status: 'upcoming'
  },
  {
    id: 'evt-3',
    title: 'پایان دوره سه‌ماهه OKR - ارزیابی شاخص‌های کلیدی',
    type: 'okr',
    dateStr: '1404/07/18',
    time: '۱۴:۰۰',
    location: 'سالن کنفرانس شهید خرازی / آنلاین',
    attendees: 'تیم راهبری استراتژیک و سرپرستان ارشد',
    description: 'محاسبه درصد تحقق نتایج کلیدی (KRs) دوره تابستان و رونمایی از تارگت‌های پاییز.',
    targetTab: 'lattice-hub',
    status: 'upcoming'
  },
  {
    id: 'evt-4',
    title: 'جلسه مربیگری ۱به۱ توسعه فردی (IDP) با اپراتورهای ارشد',
    type: 'one_on_one',
    dateStr: '1404/07/20',
    time: '۱۱:۰۰',
    location: 'دفتر سرپرستی سالن ۱',
    attendees: 'سرپرست خط و اپراتور ارشد شیفت',
    description: 'مرور نتایج ارزیابی دوره گذشته و تعیین اقدامات توانمندسازی و گذراندن دوره SMED.',
    targetTab: 'lattice-hub',
    status: 'upcoming'
  },
  {
    id: 'evt-5',
    title: 'سررسید نهایی ثبت نمرات ارزیابی توسط سرپرستان',
    type: 'evaluation',
    dateStr: '1404/07/25',
    time: '۱۸:۰۰',
    location: 'پرتال ارزیابی اصفهان چالاک',
    attendees: 'کلیه سرپرستان خطوط تولید و کنترل کیفیت',
    description: 'قفل اولیه نمرات سرپرست و ارسال پرونده‌ها به کارتابل کمیته کالیبراسیون.',
    targetTab: 'evaluations',
    status: 'upcoming'
  },
  {
    id: 'evt-6',
    title: 'کمیته نهایی کالیبراسیون و حل اختلاف رتبه‌بندی سازمان',
    type: 'calibration',
    dateStr: '1404/07/28',
    time: '۰۹:۰۰',
    location: 'دفتر مدیریت ارشد',
    attendees: 'مدیرعامل، مدیر منابع انسانی، سرپرستان منتخب',
    description: 'تطبیق رتبه‌بندی نهایی با بودجه پاداش‌های فصلی و توزیع نرمال سازمان.',
    targetTab: 'calibration',
    status: 'upcoming'
  }
];

export default function CalendarWidget({
  currentUser,
  evaluations = [],
  onNavigate,
  theme = 'light'
}: CalendarWidgetProps) {
  // Current Persian month state (monthIndex: 0 to 11, year: 1404)
  const [currentYear, setCurrentYear] = useState<number>(1404);
  const [currentMonthIndex, setCurrentMonthIndex] = useState<number>(6); // مهر ماه (Index 6)
  const [selectedDate, setSelectedDate] = useState<string>('1404/07/12');
  const [activeFilter, setActiveFilter] = useState<'all' | CalendarEventType>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // New Event Form State
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventType, setNewEventType] = useState<CalendarEventType>('evaluation');
  const [newEventDate, setNewEventDate] = useState('1404/07/15');
  const [newEventTime, setNewEventTime] = useState('۱۰:۰۰');
  const [newEventLocation, setNewEventLocation] = useState('سالن جلسات کارخانه');
  const [newEventAttendees, setNewEventAttendees] = useState('سرپرستان خط و مدیر تولید');
  const [newEventDesc, setNewEventDesc] = useState('');

  // Persisted Calendar Events
  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    const saved = localStorage.getItem('pe_supervisor_calendar_events');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_EVENTS;
      }
    }
    return DEFAULT_EVENTS;
  });

  const saveEvents = (updated: CalendarEvent[]) => {
    setEvents(updated);
    db.saveMiscData('pe_supervisor_calendar_events', updated);
  };

  useEffect(() => db.subscribe((key, data) => {
    if (key === 'pe_supervisor_calendar_events' && Array.isArray(data)) setEvents(data);
  }), []);

  const openEventEditor = (event: CalendarEvent) => {
    setEditingEventId(event.id);
    setNewEventTitle(event.title);
    setNewEventType(event.type);
    setNewEventDate(event.dateStr);
    setNewEventTime(event.time);
    setNewEventLocation(event.location);
    setNewEventAttendees(event.attendees);
    setNewEventDesc(event.description);
    setIsAddModalOpen(true);
  };

  const closeEventEditor = () => {
    setIsAddModalOpen(false);
    setEditingEventId(null);
    setNewEventTitle('');
    setNewEventDesc('');
  };

  const deleteEvent = (event: CalendarEvent) => {
    if (currentUser?.role !== 'admin' || !window.confirm(`رویداد «${event.title}» حذف شود؟`)) return;
    saveEvents(events.filter(item => item.id !== event.id));
  };

  const handlePrevMonth = () => {
    if (currentMonthIndex === 0) {
      setCurrentMonthIndex(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonthIndex(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonthIndex === 11) {
      setCurrentMonthIndex(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonthIndex(prev => prev + 1);
    }
  };

  const handleGoToday = () => {
    setCurrentYear(1404);
    setCurrentMonthIndex(6); // مهر
    setSelectedDate('1404/07/12');
  };

  // Month days computation (Standard Persian calendar: months 1-6 have 31 days, 7-11 have 30 days, 12 has 29)
  const totalDaysInMonth = useMemo(() => {
    if (currentMonthIndex < 6) return 31;
    if (currentMonthIndex < 11) return 30;
    return 29;
  }, [currentMonthIndex]);

  // First day offset (deterministic representation for Persian calendar grid)
  const firstDayOffset = useMemo(() => {
    // Arbitrary consistent offset for realistic Persian calendar layout
    return (currentMonthIndex * 2 + currentYear) % 7;
  }, [currentMonthIndex, currentYear]);

  // Format date helper: e.g. "1404/07/05"
  const formatDayDateStr = (day: number) => {
    const mStr = String(currentMonthIndex + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    return `${currentYear}/${mStr}/${dStr}`;
  };

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter(evt => {
      if (activeFilter === 'all') return true;
      return evt.type === activeFilter;
    });
  }, [events, activeFilter]);

  // Map of date string -> events on that date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    filteredEvents.forEach(evt => {
      const existing = map.get(evt.dateStr) || [];
      existing.push(evt);
      map.set(evt.dateStr, existing);
    });
    return map;
  }, [filteredEvents]);

  // Selected date events
  const selectedDayEvents = useMemo(() => {
    return events.filter(e => e.dateStr === selectedDate);
  }, [events, selectedDate]);

  // Handle adding new event
  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) return;

    const newEvt: CalendarEvent = {
      id: `evt-${Date.now()}`,
      title: newEventTitle.trim(),
      type: newEventType,
      dateStr: newEventDate.trim(),
      time: newEventTime.trim() || '۰۹:۰۰',
      location: newEventLocation.trim() || 'سالن جلسات',
      attendees: newEventAttendees.trim() || 'سرپرستان خط',
      description: newEventDesc.trim(),
      status: 'upcoming',
      targetTab: newEventType === 'evaluation' ? 'evaluations' : newEventType === 'calibration' ? 'calibration' : 'lattice-hub'
    };

    const updated = editingEventId
      ? events.map(item => item.id === editingEventId ? { ...newEvt, id: editingEventId } : item)
      : [...events, newEvt];
    saveEvents(updated);
    setSelectedDate(newEventDate.trim());
    setIsAddModalOpen(false);
    setEditingEventId(null);

    // Reset Form
    setNewEventTitle('');
    setNewEventDesc('');
  };

  const getTypeBadge = (type: CalendarEventType) => {
    switch (type) {
      case 'evaluation':
        return {
          label: 'سررسید ارزیابی',
          color: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30',
          dot: 'bg-rose-500',
          icon: ClipboardList
        };
      case 'calibration':
        return {
          label: 'کمیته کالیبراسیون',
          color: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30',
          dot: 'bg-purple-500',
          icon: Scale
        };
      case 'okr':
        return {
          label: 'پایان دوره OKR',
          color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30',
          dot: 'bg-emerald-500',
          icon: Target
        };
      case 'one_on_one':
        return {
          label: 'جلسه ۱به۱ مربیگری',
          color: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30',
          dot: 'bg-blue-500',
          icon: Users
        };
    }
  };

  return (
    <div className="bg-slate-900/60 dark:bg-slate-900/70 light:bg-white border border-slate-700/60 dark:border-slate-800 rounded-3xl p-5 md:p-6 space-y-6 shadow-xl transition-all">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-500/20 to-indigo-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-inner">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-slate-100 tracking-tight">
                تقویم تعاملی سرپرستان و سررسیدهای سازمانی
              </h2>
              <span className="text-[10px] font-bold bg-teal-500/15 text-teal-400 border border-teal-500/30 px-2 py-0.5 rounded-full">
                ویژه راهبری خطوط
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              پایش بصری مواعد ارزیابی عملکرد، جلسات هم‌ترازی کالیبراسیون و پایان دوره‌های فصلی OKR
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleGoToday}
            className="text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer"
          >
            امروز (مهر ماه)
          </button>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="text-xs font-bold px-3.5 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-slate-950 flex items-center gap-1.5 shadow-md shadow-teal-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>ثبت سررسید / رویداد</span>
          </button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="text-slate-400 text-[11px] font-bold shrink-0 flex items-center gap-1">
          <Filter className="w-3.5 h-3.5" />
          فیلتر دسته‌ها:
        </span>
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer shrink-0 ${
            activeFilter === 'all'
              ? 'bg-slate-700 text-white shadow-sm'
              : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
          }`}
        >
          همه رویدادها ({events.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('evaluation')}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
            activeFilter === 'evaluation'
              ? 'bg-rose-500 text-white shadow-sm'
              : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-rose-400" />
          <span>سررسید ارزیابی‌ها</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('calibration')}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
            activeFilter === 'calibration'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/20'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-purple-400" />
          <span>جلسات کالیبراسیون</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('okr')}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
            activeFilter === 'okr'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>پایان دوره OKR</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('one_on_one')}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
            activeFilter === 'one_on_one'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          <span>جلسات ۱به۱ مربیگری</span>
        </button>
      </div>

      {/* Main Calendar & Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Monthly Calendar View (7 cols) */}
        <div className="lg:col-span-7 bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 space-y-4">
          {/* Month Navigation Header */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
              title="ماه قبل"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="text-center">
              <h3 className="text-sm font-black text-slate-100 font-mono">
                {PERSIAN_MONTH_NAMES[currentMonthIndex]} {currentYear}
              </h3>
              <span className="text-[10px] text-teal-400 font-semibold">
                دوره ارزیابی پاییز ۱۴۰۴ کارخانه
              </span>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
              title="ماه بعد"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday Names Header */}
          <div className="grid grid-cols-7 text-center text-[11px] font-bold text-slate-400 pb-1 border-b border-slate-800">
            {WEEKDAY_NAMES.map((wd, i) => (
              <div key={i} className={i === 6 ? 'text-rose-400' : ''}>
                {wd}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1.5 text-xs">
            {/* Empty padding slots before first day */}
            {Array.from({ length: firstDayOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="h-14 rounded-xl opacity-10 bg-slate-800/20 pointer-events-none" />
            ))}

            {/* Month Day Cells */}
            {Array.from({ length: totalDaysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateStr = formatDayDateStr(dayNum);
              const isSelected = selectedDate === dateStr;
              const dayEvents = eventsByDate.get(dateStr) || [];
              const hasEvents = dayEvents.length > 0;
              const isFriday = (firstDayOffset + i) % 7 === 6;

              return (
                <button
                  type="button"
                  key={dayNum}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`h-14 rounded-xl p-1 flex flex-col justify-between items-center transition-all cursor-pointer relative border ${
                    isSelected
                      ? 'bg-teal-500/20 border-teal-500 text-teal-300 font-bold shadow-md ring-2 ring-teal-500/20'
                      : hasEvents
                      ? 'bg-slate-900 border-slate-700/80 hover:border-slate-600 text-slate-200'
                      : 'bg-slate-900/30 border-slate-800/60 hover:bg-slate-800/40 text-slate-400'
                  }`}
                >
                  {/* Day Number */}
                  <span className={`text-[11px] font-mono ${isFriday && !isSelected ? 'text-rose-400' : ''}`}>
                    {dayNum}
                  </span>

                  {/* Indicator Dots / Event markers */}
                  <div className="flex items-center justify-center gap-1 w-full overflow-hidden px-0.5">
                    {dayEvents.slice(0, 3).map((evt, idx) => {
                      const badge = getTypeBadge(evt.type);
                      return (
                        <span
                          key={idx}
                          className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}
                          title={evt.title}
                        />
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <span className="text-[8px] font-mono text-slate-400">+{dayEvents.length - 3}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Legend */}
          <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between flex-wrap gap-2 text-[10px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>سررسید ارزیابی</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              <span>جلسه کالیبراسیون</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>پایان دوره OKR</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>جلسه ۱به۱ مربیگری</span>
            </div>
          </div>
        </div>

        {/* Right: Selected Day Events & Action Panel (5 cols) */}
        <div className="lg:col-span-5 bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-teal-400" />
              <h4 className="text-xs font-bold text-slate-200">
                رویدادهای تاریخ: <span className="text-teal-400 font-mono font-black">{selectedDate}</span>
              </h4>
            </div>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md font-mono">
              {selectedDayEvents.length} سررسید
            </span>
          </div>

          {/* List of events for this selected day */}
          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-0.5">
            {selectedDayEvents.length > 0 ? (
              selectedDayEvents.map(evt => {
                const badge = getTypeBadge(evt.type);
                const IconComponent = badge.icon;
                return (
                  <div
                    key={evt.id}
                    className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5 hover:border-slate-700 transition-all shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1 ${badge.color}`}>
                          <IconComponent className="w-3 h-3" />
                          <span>{badge.label}</span>
                        </span>
                        <h5 className="text-xs font-bold text-slate-100 leading-snug">{evt.title}</h5>
                      </div>
                      {evt.status === 'urgent' && (
                        <span className="text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded animate-pulse">
                          فوری
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {evt.description}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-850">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span className="font-mono">{evt.time}</span>
                      </div>
                      <div className="flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{evt.location}</span>
                      </div>
                      <div className="col-span-2 flex items-center gap-1 truncate text-slate-400">
                        <Users className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{evt.attendees}</span>
                      </div>
                    </div>

                    {currentUser?.role === 'admin' && (
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => openEventEditor(evt)} className="text-[11px] font-bold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 py-1.5 rounded-lg flex items-center justify-center gap-1">
                          <Edit2 className="w-3.5 h-3.5" /> ویرایش
                        </button>
                        <button type="button" onClick={() => deleteEvent(evt)} className="text-[11px] font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 py-1.5 rounded-lg flex items-center justify-center gap-1">
                          <Trash2 className="w-3.5 h-3.5" /> حذف
                        </button>
                      </div>
                    )}

                    {/* Quick navigation link */}
                    {evt.targetTab && onNavigate && (
                      <button
                        type="button"
                        onClick={() => onNavigate(evt.targetTab!)}
                        className="w-full text-[11px] font-bold text-teal-400 hover:text-teal-300 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer"
                      >
                        <span>ورود به بخش مربوطه</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center text-slate-500 space-y-2">
                <CalendarDays className="w-8 h-8 text-slate-700 mx-auto" />
                <p className="text-xs font-semibold">هیچ سررسیدی برای این تاریخ ثبت نشده است.</p>
                <button
                  type="button"
                  onClick={() => {
                    setNewEventDate(selectedDate);
                    setIsAddModalOpen(true);
                  }}
                  className="text-[11px] font-bold text-teal-400 hover:underline inline-block mt-1"
                >
                  + ثبت سررسید جدید در این روز
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
         ADD NEW EVENT MODAL
         ========================================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-teal-400" />
                <h3 className="text-sm font-bold text-slate-100">{editingEventId ? 'ویرایش رویداد تقویم' : 'ثبت سررسید یا رویداد جدید در تقویم'}</h3>
              </div>
              <button
                type="button"
                onClick={closeEventEditor}
                className="text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-3 text-right">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">عنوان سررسید یا جلسه</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: جلسه کالیبراسیون نمرات واحد ماشین‌کاری..."
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">دسته‌بندی رویداد</label>
                  <select
                    value={newEventType}
                    onChange={(e) => setNewEventType(e.target.value as CalendarEventType)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 cursor-pointer"
                  >
                    <option value="evaluation">سررسید ارزیابی</option>
                    <option value="calibration">کمیته کالیبراسیون</option>
                    <option value="okr">پایان دوره OKR</option>
                    <option value="one_on_one">جلسه ۱به۱ مربیگری</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">تاریخ سررسید (شمسی)</label>
                  <input
                    type="text"
                    required
                    placeholder="۱۴۰۴/۰۷/۱۵"
                    value={newEventDate}
                    onChange={(e) => setNewEventDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 font-mono text-center focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">ساعت برگزاری</label>
                  <input
                    type="text"
                    placeholder="۱۰:۳۰"
                    value={newEventTime}
                    onChange={(e) => setNewEventTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 font-mono text-center focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">محل یا لینک برگزاری</label>
                  <input
                    type="text"
                    placeholder="اتاق جلسات مدیریت تولید"
                    value={newEventLocation}
                    onChange={(e) => setNewEventLocation(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">افراد یا واحدهای حاضر</label>
                <input
                  type="text"
                  placeholder="سرپرستان خط ۱ و ۲، مدیر منابع انسانی"
                  value={newEventAttendees}
                  onChange={(e) => setNewEventAttendees(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">توضیحات و دستور جلسه</label>
                <textarea
                  rows={2}
                  placeholder="اقدامات لازم یا مستندات مورد نیاز برای جلسه..."
                  value={newEventDesc}
                  onChange={(e) => setNewEventDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 focus:outline-none focus:border-teal-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeEventEditor}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-teal-500 hover:bg-teal-600 shadow-lg shadow-teal-500/20 cursor-pointer flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{editingEventId ? 'ذخیره ویرایش' : 'ثبت در تقویم'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

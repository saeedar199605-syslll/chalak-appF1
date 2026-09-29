/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Kickidler Productivity & Workday Analytics Suite
 * Real-time Employee Monitoring, Productive vs Idle Time Analysis, Violations Log & Burnout Dynamics
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Monitor, 
  Clock, 
  AlertOctagon, 
  Flame, 
  Activity, 
  Search, 
  CheckCircle2, 
  MousePointer, 
  Keyboard, 
  Send, 
  TrendingUp, 
  Layers, 
  BarChart3, 
  Check, 
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Zap
} from 'lucide-react';
import { 
  Employee, 
  WorkdayActivityRecord, 
  LiveEmployeeActivity, 
  KickidlerViolation, 
  KickidlerLiveStatus 
} from '../types';

import { db } from '../utils/db';

interface KickidlerProductivityHubProps {
  currentUser: Employee;
  employees: Employee[];
  theme?: 'dark' | 'light';
  onNavigate?: (tab: string) => void;
}

export default function KickidlerProductivityHub({
  currentUser,
  employees,
  theme = 'dark'
}: KickidlerProductivityHubProps) {
  const [activeSubTab, setActiveSubTab] = useState<'live_grid' | 'time_breakdown' | 'violations' | 'burnout'>('live_grid');

  // Persistence for live activities
  // Start empty — no fabricated sample personnel in production state
  const [liveActivities, setLiveActivities] = useState<LiveEmployeeActivity[]>(() => {
    try {
      const saved = localStorage.getItem('pe_kickidler_live');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persistence for daily records
  // Start empty — no fabricated sample personnel in production state
  const [records, setRecords] = useState<WorkdayActivityRecord[]>(() => {
    try {
      const saved = localStorage.getItem('pe_kickidler_records');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persistence for violations
  // Start empty — no fabricated sample violations in production state
  const [violations, setViolations] = useState<KickidlerViolation[]>(() => {
    try {
      const saved = localStorage.getItem('pe_kickidler_violations');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Sync to localStorage
  useEffect(() => {
    db.saveMiscData('pe_kickidler_live', liveActivities);
  }, [liveActivities]);

  useEffect(() => {
    db.saveMiscData('pe_kickidler_records', records);
  }, [records]);

  useEffect(() => {
    db.saveMiscData('pe_kickidler_violations', violations);
  }, [violations]);

  // Filters & selection
  const [statusFilter, setStatusFilter] = useState<'all' | KickidlerLiveStatus>('all');
  const [selectedRecordEmpId, setSelectedRecordEmpId] = useState<string>(records[0]?.empId || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationToast, setNotificationToast] = useState<string | null>(null);

  // Modals state
  const [isStationAlertModalOpen, setIsStationAlertModalOpen] = useState(false);
  const [targetAlertEmpName, setTargetAlertEmpName] = useState('');
  const [alertMessageText, setAlertMessageText] = useState('لطفاً تمرکز کاری بر نقشه فنی قطعه حفظ شود و فعالیت‌های خارج از شرح وظایف متوقف گردد.');
  const [alertUrgency, setAlertUrgency] = useState<'normal' | 'urgent'>('normal');

  const [isNewViolationModalOpen, setIsNewViolationModalOpen] = useState(false);
  const [violEmpId, setViolEmpId] = useState(employees[1]?.id || '');
  const [violType, setViolType] = useState<KickidlerViolation['type']>('unproductive_site');
  const [violSeverity, setViolSeverity] = useState<KickidlerViolation['severity']>('high');
  const [violTitle, setViolTitle] = useState('');
  const [violDescription, setViolDescription] = useState('');

  // Editing and Deleting states for Violations, Records, and Live activities
  const [editingViolation, setEditingViolation] = useState<KickidlerViolation | null>(null);
  const [deletingViolation, setDeletingViolation] = useState<KickidlerViolation | null>(null);

  const [editingRecord, setEditingRecord] = useState<WorkdayActivityRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<WorkdayActivityRecord | null>(null);

  const [editingLive, setEditingLive] = useState<LiveEmployeeActivity | null>(null);
  const [deletingLiveEmpId, setDeletingLiveEmpId] = useState<string | null>(null);

  const handleSaveEditedViolation = (updated: KickidlerViolation) => {
    const nextList = violations.map(v => v.id === updated.id ? updated : v);
    setViolations(nextList);
    try {
      db.saveMiscData('pe_kickidler_violations', nextList);
    } catch {}
    setEditingViolation(null);
    setNotificationToast(`هشدار انضباطی «${updated.title}» با موفقیت ویرایش شد.`);
    setTimeout(() => setNotificationToast(null), 3500);
  };

  const handleDeleteViolation = (id: string) => {
    const nextList = violations.filter(v => v.id !== id);
    setViolations(nextList);
    try {
      db.saveMiscData('pe_kickidler_violations', nextList);
    } catch {}
    setDeletingViolation(null);
    setNotificationToast('هشدار انضباطی با موفقیت از سیستم حذف گردید.');
    setTimeout(() => setNotificationToast(null), 3500);
  };

  const handleSaveEditedRecord = (updated: WorkdayActivityRecord) => {
    // Recalculate productivity index
    const total = updated.timeBreakdown.totalWorkMinutes || 480;
    const pei = Math.round((updated.timeBreakdown.productiveMinutes / total) * 100);
    const finalRecord = { ...updated, productivityIndex: pei };

    const nextList = records.map(r => r.empId === finalRecord.empId ? finalRecord : r);
    setRecords(nextList);
    try {
      db.saveMiscData('pe_kickidler_records', nextList);
    } catch {}
    setEditingRecord(null);
    setNotificationToast(`کارنامه زمانی ${finalRecord.empName} با موفقیت ویرایش و شاخص‌ها بازتنظیم شدند.`);
    setTimeout(() => setNotificationToast(null), 3500);
  };

  const handleDeleteRecord = (empId: string) => {
    const nextList = records.filter(r => r.empId !== empId);
    setRecords(nextList);
    if (selectedRecordEmpId === empId) {
      setSelectedRecordEmpId(nextList[0]?.empId || '');
    }
    try {
      db.saveMiscData('pe_kickidler_records', nextList);
    } catch {}
    setDeletingRecord(null);
    setNotificationToast('رکورد کارنامه زمانی پرسنل با موفقیت حذف شد.');
    setTimeout(() => setNotificationToast(null), 3500);
  };

  const handleSaveEditedLive = (updated: LiveEmployeeActivity) => {
    const nextList = liveActivities.map(l => l.empId === updated.empId ? updated : l);
    setLiveActivities(nextList);
    try {
      db.saveMiscData('pe_kickidler_live', nextList);
    } catch {}
    setEditingLive(null);
    setNotificationToast(`وضعیت فعالیت زنده ${updated.empName} با موفقیت به‌روزرسانی شد.`);
    setTimeout(() => setNotificationToast(null), 3500);
  };

  const handleDeleteLive = (empId: string) => {
    const nextList = liveActivities.filter(l => l.empId !== empId);
    setLiveActivities(nextList);
    try {
      db.saveMiscData('pe_kickidler_live', nextList);
    } catch {}
    setDeletingLiveEmpId(null);
    setNotificationToast('شاغل موردنظر از پایش مانیتورینگ زنده حذف شد.');
    setTimeout(() => setNotificationToast(null), 3500);
  };

  const handleClearAllRecords = () => {
    if (!window.confirm('آیا مطمئنید می‌خواهید تمام رکوردهای فعالیت و فرسودگی شغلی را حذف کنید؟ این عمل قابل بازگشت نیست.')) return;
    setRecords([]);
    setLiveActivities([]);
    setViolations([]);
    setSelectedRecordEmpId('');
    try {
      db.saveMiscData('pe_kickidler_records', []);
      db.saveMiscData('pe_kickidler_live', []);
      db.saveMiscData('pe_kickidler_violations', []);
    } catch {}
    setNotificationToast('تمام داده‌های فعالیت و فرسودگی شغلی با موفقیت پاک‌سازی شدند.');
    setTimeout(() => setNotificationToast(null), 3500);
  };

  // Live simulation tick (to give realistic live monitoring feel)
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveActivities(prev => prev.map(item => {
        if (item.status === 'productive' || item.status === 'neutral') {
          return {
            ...item,
            activeDurationMinutes: item.activeDurationMinutes + 1
          };
        } else if (item.status === 'idle') {
          return {
            ...item,
            todayIdleMinutes: item.todayIdleMinutes + 1
          };
        }
        return item;
      }));
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // Open Station Alert Modal
  const openStationAlert = (empName: string) => {
    setTargetAlertEmpName(empName);
    setIsStationAlertModalOpen(true);
  };

  // Submit Station Alert
  const handleSendStationAlertSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsStationAlertModalOpen(false);
    setNotificationToast(`هشدار فوری «${alertUrgency === 'urgent' ? 'فوری/قرمز' : 'عادی'}» به مانیتور ایستگاه «${targetAlertEmpName}» مخابره گردید.`);
    setTimeout(() => {
      setNotificationToast(null);
    }, 4500);
  };

  // Handle Violation Status Change
  const handleUpdateViolationStatus = (violId: string, nextStatus: KickidlerViolation['status']) => {
    setViolations(prev => prev.map(v => v.id === violId ? { ...v, status: nextStatus } : v));
    setNotificationToast('وضعیت هشدار انضباطی با موفقیت به‌روزرسانی شد.');
    setTimeout(() => setNotificationToast(null), 3500);
  };

  // Submit New Violation
  const handleCreateViolationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!violTitle.trim()) return;

    const emp = employees.find(e => e.id === violEmpId) || employees[1];
    const newViol: KickidlerViolation = {
      id: `viol-${Date.now()}`,
      empId: emp.id,
      empName: emp.name,
      empCode: emp.code,
      unit: emp.unit,
      timestamp: 'همین الان',
      type: violType,
      severity: violSeverity,
      title: violTitle.trim(),
      description: violDescription.trim() || 'ثبت دستی هشدار کارکرد توسط ناظر سیستم',
      status: 'new'
    };

    setViolations([newViol, ...violations]);
    setIsNewViolationModalOpen(false);
    setViolTitle('');
    setViolDescription('');
    setNotificationToast(`هشدار انضباطی برای «${emp.name}» در سامانه ثبت شد.`);
    setTimeout(() => setNotificationToast(null), 4000);
  };

  // Helper format minutes to hours and minutes
  const formatMinutes = (minutes: number): string => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} دقیقه`;
    if (m === 0) return `${h} ساعت`;
    return `${h} ساعت و ${m} دقیقه`;
  };

  // Calculate Organization Average Productivity Index
  const averagePei = records.length > 0 
    ? (records.reduce((acc, r) => acc + r.productivityIndex, 0) / records.length).toFixed(1)
    : '85.0';

  const totalViolationsCount = violations.filter(v => v.status !== 'addressed').length;

  // Filter live activities
  const filteredLive = liveActivities.filter(item => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return item.empName.toLowerCase().includes(q) || item.unit.toLowerCase().includes(q) || item.empCode.toLowerCase().includes(q);
    }
    return true;
  });

  const selectedRecord = records.find(r => r.empId === selectedRecordEmpId) || records[0];

  const getStatusBadge = (status: KickidlerLiveStatus) => {
    switch (status) {
      case 'productive':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>مولد و فعال (Productive)</span>
          </span>
        );
      case 'neutral':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>فعالیت اداری / خنثی</span>
          </span>
        );
      case 'unproductive':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/15 border border-rose-500/30">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-bounce" />
            <span>غیرمولد / وب‌گردی</span>
          </span>
        );
      case 'idle':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700">
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            <span>عدم تعامل (Idle)</span>
          </span>
        );
      case 'offline':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span>غیرفعال / خارج از شیفت</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Toast notification for action feedback */}
      {notificationToast && (
        <div className="fixed bottom-6 left-6 z-50 p-4 rounded-xl bg-slate-900 dark:bg-teal-700 text-white text-xs font-bold shadow-2xl flex items-center gap-2 animate-slide-up border border-teal-500/40">
          <CheckCircle2 className="w-4 h-4 text-teal-300" />
          <span>{notificationToast}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className={`p-6 rounded-2xl border transition-all ${
        theme === 'dark' 
          ? 'bg-gradient-to-r from-slate-900 via-teal-950/40 to-slate-900 border-teal-900/40 text-slate-100' 
          : 'bg-gradient-to-r from-white via-teal-50/40 to-white border-teal-100 text-slate-900 shadow-sm'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-teal-500/20 text-teal-500 border border-teal-500/30">
                <Monitor className="w-5 h-5" />
              </span>
              <div>
                <h1 className={`text-xl font-black tracking-tight flex items-center gap-2 ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                  سامانه پایش بهره‌وری و فعالیت زمانی پرسنل
                  <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 bg-teal-500/15 px-2 py-0.5 rounded-full border border-teal-500/30">
                    Kickidler Analytics
                  </span>
                </h1>
                <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                  تحلیل آنلاین زمان مولد، خنثی، غیرمولد و عدم تعامل (Idle)، رهگیری تخلفات کاری و رادار فرسودگی شغلی (Burnout)
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex items-center gap-3">
            <div className={`px-3.5 py-2 rounded-xl border text-right ${
              theme === 'dark' ? 'bg-slate-950/60 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
            }`}>
              <div className={`text-[10px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>میانگین راندمان زمانی (PEI):</div>
              <div className="text-lg font-black font-mono text-teal-600 dark:text-teal-400">{averagePei}٪</div>
            </div>

            <div className={`px-3.5 py-2 rounded-xl border text-right ${
              theme === 'dark' ? 'bg-slate-950/60 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
            }`}>
              <div className={`text-[10px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>هشدارهای باز کاری:</div>
              <div className="text-lg font-black font-mono text-rose-600 dark:text-rose-400">{totalViolationsCount} مورد</div>
            </div>
          </div>
        </div>

        {/* Sub-Tab Navigation */}
        <div className={`flex items-center gap-2 mt-6 border-t pt-4 overflow-x-auto ${
          theme === 'dark' ? 'border-slate-800' : 'border-teal-100'
        }`}>
          <button
            onClick={() => setActiveSubTab('live_grid')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'live_grid'
                ? 'bg-teal-600 text-white shadow-sm'
                : theme === 'dark' ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60' : 'text-slate-600 hover:text-slate-900 hover:bg-teal-50/80'
            }`}
          >
            <Monitor className="w-4 h-4" />
            <span>پایش زنده پرسنل (Live Grid)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">{liveActivities.length}</span>
          </button>

          <button
            onClick={() => setActiveSubTab('time_breakdown')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'time_breakdown'
                ? 'bg-teal-600 text-white shadow-sm'
                : theme === 'dark' ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60' : 'text-slate-600 hover:text-slate-900 hover:bg-teal-50/80'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>آنالیز زمان مولد و اتلاف</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">۴ دسته</span>
          </button>

          <button
            onClick={() => setActiveSubTab('violations')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'violations'
                ? 'bg-teal-600 text-white shadow-sm'
                : theme === 'dark' ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60' : 'text-slate-600 hover:text-slate-900 hover:bg-teal-50/80'
            }`}
          >
            <AlertOctagon className="w-4 h-4" />
            <span>رهگیری تخلفات و هشدارهای کاری</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-500 font-mono">{violations.length}</span>
          </button>

          <button
            onClick={() => setActiveSubTab('burnout')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'burnout'
                ? 'bg-teal-600 text-white shadow-sm'
                : theme === 'dark' ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60' : 'text-slate-600 hover:text-slate-900 hover:bg-teal-50/80'
            }`}
          >
            <Flame className="w-4 h-4" />
            <span>داینامیک فرسودگی و فشار کاری</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500 font-mono">رادار</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: LIVE MULTI-SCREEN GRID */}
      {activeSubTab === 'live_grid' && (
        <div className="space-y-6">
          {/* Controls & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className={`flex items-center gap-1.5 p-1 rounded-xl border w-full sm:w-auto overflow-x-auto ${
              theme === 'dark' ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === 'all' 
                    ? 'bg-teal-600 text-white shadow-sm' 
                    : theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                همه ({liveActivities.length})
              </button>
              <button
                onClick={() => setStatusFilter('productive')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === 'productive' 
                    ? 'bg-emerald-600 text-white shadow-sm' 
                    : theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                مولد و فعال
              </button>
              <button
                onClick={() => setStatusFilter('neutral')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === 'neutral' 
                    ? 'bg-amber-600 text-white shadow-sm' 
                    : theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                اداری / خنثی
              </button>
              <button
                onClick={() => setStatusFilter('idle')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === 'idle' 
                    ? 'bg-slate-700 text-white shadow-sm' 
                    : theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                دور از سیستم (Idle)
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجوی نام یا کد پرسنلی..."
                className={`w-full border rounded-xl py-2 pr-9 pl-4 text-xs focus:outline-none focus:border-teal-500 ${
                  theme === 'dark' ? 'bg-slate-900/70 border-slate-800 text-slate-200' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            </div>
          </div>

          {/* Multi-Screen Live Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredLive.length === 0 && (
              <div className="col-span-full flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-5 py-12 text-center dark:border-slate-700 dark:bg-slate-900/60">
                <Monitor aria-hidden="true" className="h-9 w-9 text-slate-400 dark:text-slate-500" />
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {liveActivities.length === 0 ? 'هنوز داده‌ای از فعالیت زنده ثبت نشده است' : 'نتیجه‌ای با فیلترهای انتخابی یافت نشد'}
                </h2>
                <p className="max-w-md text-xs leading-6 text-slate-600 dark:text-slate-400">
                  {liveActivities.length === 0 ? 'با دریافت داده فعالیت، وضعیت پرسنل در همین بخش نمایش داده می‌شود.' : 'نام یا کد پرسنلی دیگری جستجو کنید یا فیلتر وضعیت را تغییر دهید.'}
                </p>
              </div>
            )}
            {filteredLive.map(item => (
              <div
                key={item.empId}
                className={`p-5 rounded-2xl border transition-all space-y-4 shadow-sm ${
                  theme === 'dark' 
                    ? 'bg-slate-900/70 border-slate-800 hover:border-teal-900/60 text-slate-100' 
                    : 'bg-white border-slate-200 hover:border-teal-200 text-slate-900'
                }`}
              >
                {/* Employee Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-white text-xs ${item.avatarColor || 'bg-slate-700'}`}>
                      {item.empCode.replace('EMP-', '#')}
                    </div>
                    <div>
                      <h4 className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>{item.empName}</h4>
                      <p className={`text-[10px] font-mono ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{item.empCode} • {item.unit}</p>
                    </div>
                  </div>

                  {getStatusBadge(item.status)}
                </div>

                {/* Current Active Window / Application */}
                <div className={`p-3 rounded-xl border space-y-1.5 ${
                  theme === 'dark' ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className={`flex items-center justify-between text-[10px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                    <span className="flex items-center gap-1">
                      <Layers className="w-3 h-3 text-teal-500" /> پنجره / اپلیکیشن فعال:
                    </span>
                    <span className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 font-bold font-mono">
                      {item.intensityRate === 'high' ? <><span>ضربان بالا</span><Zap className="h-3.5 w-3.5" aria-label="شدت بالا" /></> : 'عادی'}
                    </span>
                  </div>
                  <div className={`text-xs font-bold truncate ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`} title={item.currentApp}>
                    {item.currentApp}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    دسته‌بندی: <span className={`font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>{item.currentAppCategory}</span>
                  </div>
                </div>

                {/* Metrics Row */}
                <div className={`grid grid-cols-3 gap-2 text-center pt-1 border-t ${
                  theme === 'dark' ? 'border-slate-800/60' : 'border-slate-100'
                }`}>
                  <div className="space-y-0.5">
                    <div className="text-[10px] text-slate-500">بهره‌وری امروز</div>
                    <div className="text-xs font-black font-mono text-teal-600 dark:text-teal-400">{item.todayProductivityRate}٪</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[10px] text-slate-500">زمان بی‌کاری</div>
                    <div className={`text-xs font-black font-mono ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>{item.todayIdleMinutes} دقیقه</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[10px] text-slate-500">شروع شیفت</div>
                    <div className={`text-xs font-black font-mono ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>{item.shiftStartTime}</div>
                  </div>
                </div>

                {/* Live Action Buttons */}
                <div className={`flex items-center gap-2 pt-2 border-t ${
                  theme === 'dark' ? 'border-slate-800/60' : 'border-slate-100'
                }`}>
                  <button
                    onClick={() => openStationAlert(item.empName)}
                    className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all ${
                      theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <Send className="w-3 h-3 text-teal-500" />
                    <span>ارسال پیام به ایستگاه</span>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedRecordEmpId(item.empId);
                      setActiveSubTab('time_breakdown');
                    }}
                    className="p-1.5 rounded-xl bg-teal-600/15 text-teal-600 dark:text-teal-400 hover:bg-teal-600/25 border border-teal-500/30 text-[11px] font-bold cursor-pointer transition"
                    title="مشاهده کارنامه بهره‌وری"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingLive(JSON.parse(JSON.stringify(item)))}
                    className={`p-1.5 rounded-xl border text-[11px] font-bold cursor-pointer transition ${
                      theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-teal-300' : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-teal-700'
                    }`}
                    title="ویرایش مشخصات و وضعیت پایش زنده"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeletingLiveEmpId(item.empId)}
                    className={`p-1.5 rounded-xl border text-[11px] font-bold cursor-pointer transition ${
                      theme === 'dark' ? 'bg-slate-800 hover:bg-rose-900/40 border-slate-700 text-rose-400' : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700'
                    }`}
                    title="حذف از پایش زنده"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: TIME BREAKDOWN & PEI */}
      {activeSubTab === 'time_breakdown' && (
        <div className="space-y-6">
          {/* Employee Selector Bar */}
          <div className={`flex items-center justify-between gap-3 flex-wrap p-3 rounded-2xl border ${
            theme === 'dark' ? 'bg-slate-900/70 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>انتخاب شاغل جهت تحلیل:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {records.map(rec => (
                  <button
                    key={rec.empId}
                    onClick={() => setSelectedRecordEmpId(rec.empId)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedRecordEmpId === rec.empId
                        ? 'bg-teal-600 text-white shadow-sm'
                        : theme === 'dark' ? 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    {rec.empName}
                  </button>
                ))}
              </div>
            </div>

            <div className={`text-xs font-mono ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
              تاریخ گزارش: <strong>{selectedRecord.date}</strong>
            </div>
          </div>

          {/* Active Record Productivity Overview Card */}
          <div className={`p-6 rounded-2xl border space-y-6 ${
            theme === 'dark' ? 'bg-slate-900/70 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900 shadow-sm'
          }`}>
            <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-4 border-b ${
              theme === 'dark' ? 'border-slate-800' : 'border-slate-100'
            }`}>
              <div className="space-y-1">
                <h3 className={`text-base font-bold flex items-center gap-2 ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                  <span>کارنامه بهره‌وری زمانی کیک‌ایدلر:</span>
                  <span className="text-teal-600 dark:text-teal-400">{selectedRecord.empName}</span>
                </h3>
                <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                  کد پرسنلی: {selectedRecord.empCode} • واحد سازمانی: {selectedRecord.unit}
                </p>
              </div>

              {/* Productivity Index Score Badge & Edit/Delete Record */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="text-left space-y-0.5">
                  <div className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>شاخص راندمان بهره‌وری (PEI)</div>
                  <div className="text-3xl font-black font-mono text-teal-600 dark:text-teal-400">
                    {selectedRecord.productivityIndex}٪
                  </div>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-500">
                  <Activity className="w-6 h-6" />
                </div>

                <div className="flex items-center gap-1.5 border-r pr-3 mr-1 border-slate-700">
                  <button
                    type="button"
                    onClick={() => setEditingRecord(JSON.parse(JSON.stringify(selectedRecord)))}
                    className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer transition ${
                      theme === 'dark' 
                        ? 'bg-slate-800 hover:bg-teal-900/40 border-slate-700 text-teal-300' 
                        : 'bg-teal-50 hover:bg-teal-100 border-teal-200 text-teal-700'
                    }`}
                    title="ویرایش مقادیر و زمان‌های کارنامه"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">ویرایش کارنامه</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeletingRecord(selectedRecord)}
                    className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer transition ${
                      theme === 'dark' 
                        ? 'bg-slate-800 hover:bg-rose-900/40 border-slate-700 text-rose-400' 
                        : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700'
                    }`}
                    title="حذف این رکورد کارنامه"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">حذف</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Kickidler 4-Category Stacked Bar */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className={`font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>توزیع زمانی کارکرد شیفت (۸ ساعت موظف):</span>
                <span className={`font-mono ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{formatMinutes(selectedRecord.timeBreakdown.totalWorkMinutes)}</span>
              </div>

              {/* Stacked Percentage Bar */}
              <div className={`w-full h-4 rounded-xl overflow-hidden flex border ${
                theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-200 border-slate-300'
              }`}>
                <div 
                  className="bg-emerald-500 h-full transition-all duration-500" 
                  style={{ width: `${(selectedRecord.timeBreakdown.productiveMinutes / selectedRecord.timeBreakdown.totalWorkMinutes) * 100}%` }}
                  title={`زمان مولد: ${formatMinutes(selectedRecord.timeBreakdown.productiveMinutes)}`}
                />
                <div 
                  className="bg-amber-500 h-full transition-all duration-500" 
                  style={{ width: `${(selectedRecord.timeBreakdown.neutralMinutes / selectedRecord.timeBreakdown.totalWorkMinutes) * 100}%` }}
                  title={`زمان خنثی: ${formatMinutes(selectedRecord.timeBreakdown.neutralMinutes)}`}
                />
                <div 
                  className="bg-rose-500 h-full transition-all duration-500" 
                  style={{ width: `${(selectedRecord.timeBreakdown.unproductiveMinutes / selectedRecord.timeBreakdown.totalWorkMinutes) * 100}%` }}
                  title={`زمان غیرمولد: ${formatMinutes(selectedRecord.timeBreakdown.unproductiveMinutes)}`}
                />
                <div 
                  className="bg-slate-500 h-full transition-all duration-500" 
                  style={{ width: `${(selectedRecord.timeBreakdown.idleMinutes / selectedRecord.timeBreakdown.totalWorkMinutes) * 100}%` }}
                  title={`زمان عدم فعالیت: ${formatMinutes(selectedRecord.timeBreakdown.idleMinutes)}`}
                />
              </div>

              {/* Legend & Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                <div className={`p-3.5 rounded-xl border space-y-1 ${
                  theme === 'dark' ? 'bg-emerald-950/20 border-emerald-800/40' : 'bg-emerald-50 border-emerald-200'
                }`}>
                  <div className="flex items-center justify-between text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                    <span>زمان کاملاً مولد</span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  </div>
                  <div className="text-base font-black font-mono text-emerald-600 dark:text-emerald-300">
                    {formatMinutes(selectedRecord.timeBreakdown.productiveMinutes)}
                  </div>
                  <div className={`text-[10px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                    {Math.round((selectedRecord.timeBreakdown.productiveMinutes / selectedRecord.timeBreakdown.totalWorkMinutes) * 100)}٪ از کل شیفت
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border space-y-1 ${
                  theme === 'dark' ? 'bg-amber-950/20 border-amber-800/40' : 'bg-amber-50 border-amber-200'
                }`}>
                  <div className="flex items-center justify-between text-[11px] text-amber-600 dark:text-amber-400 font-bold">
                    <span>زمان خنثی / اداری</span>
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  </div>
                  <div className="text-base font-black font-mono text-amber-600 dark:text-amber-300">
                    {formatMinutes(selectedRecord.timeBreakdown.neutralMinutes)}
                  </div>
                  <div className={`text-[10px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                    {Math.round((selectedRecord.timeBreakdown.neutralMinutes / selectedRecord.timeBreakdown.totalWorkMinutes) * 100)}٪ از کل شیفت
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border space-y-1 ${
                  theme === 'dark' ? 'bg-rose-950/20 border-rose-800/40' : 'bg-rose-50 border-rose-200'
                }`}>
                  <div className="flex items-center justify-between text-[11px] text-rose-600 dark:text-rose-400 font-bold">
                    <span>زمان غیرمولد / اتلاف</span>
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  </div>
                  <div className="text-base font-black font-mono text-rose-600 dark:text-rose-300">
                    {formatMinutes(selectedRecord.timeBreakdown.unproductiveMinutes)}
                  </div>
                  <div className={`text-[10px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                    {Math.round((selectedRecord.timeBreakdown.unproductiveMinutes / selectedRecord.timeBreakdown.totalWorkMinutes) * 100)}٪ از کل شیفت
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border space-y-1 ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-slate-100 border-slate-300'
                }`}>
                  <div className={`flex items-center justify-between text-[11px] font-bold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                    <span>عدم تعامل / Idle</span>
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                  </div>
                  <div className={`text-base font-black font-mono ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                    {formatMinutes(selectedRecord.timeBreakdown.idleMinutes)}
                  </div>
                  <div className={`text-[10px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                    {Math.round((selectedRecord.timeBreakdown.idleMinutes / selectedRecord.timeBreakdown.totalWorkMinutes) * 100)}٪ از کل شیفت
                  </div>
                </div>
              </div>
            </div>

            {/* Hardware & Keystroke Input Metrics */}
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t ${
              theme === 'dark' ? 'border-slate-800/60' : 'border-slate-100'
            }`}>
              <div className={`p-4 rounded-xl border flex items-center justify-between ${
                theme === 'dark' ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500">
                    <Keyboard className="w-5 h-5" />
                  </div>
                  <div>
                    <div className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>مجموع ضربات کلید (Keystrokes)</div>
                    <div className="text-[10px] text-slate-500">پالس‌های تایپ و کدگذاری در شیفت</div>
                  </div>
                </div>
                <div className="text-xl font-black font-mono text-indigo-600 dark:text-indigo-400">
                  {selectedRecord.keystrokesCount.toLocaleString('fa-IR')}
                </div>
              </div>

              <div className={`p-4 rounded-xl border flex items-center justify-between ${
                theme === 'dark' ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-500">
                    <MousePointer className="w-5 h-5" />
                  </div>
                  <div>
                    <div className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>مجموع کلیک‌های ماوس</div>
                    <div className="text-[10px] text-slate-500">تعاملات رابط کاربری و کنترلر</div>
                  </div>
                </div>
                <div className="text-xl font-black font-mono text-teal-600 dark:text-teal-400">
                  {selectedRecord.mouseClicksCount.toLocaleString('fa-IR')}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: VIOLATIONS & ANOMALIES */}
      {activeSubTab === 'violations' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className={`text-base font-bold flex items-center gap-2 ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                <AlertOctagon className="w-5 h-5 text-rose-500" />
                <span>گزارش هشدارهای انضباطی و نقض موازین کارکرد (Violations Log)</span>
              </h3>
              <p className={`text-xs mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                شناسایی خودکار تاخیرات، خروج زودهنگام، توقفات نامتعارف و بازدید از برنامه‌های غیرمجاز
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsNewViolationModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>ثبت هشدار انضباطی جدید</span>
              </button>
            </div>
          </div>

          {/* Violations Cards */}
          <div className="space-y-3">
            {violations.map(viol => (
              <div
                key={viol.id}
                className={`p-5 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  theme === 'dark' 
                    ? 'bg-slate-900/70 border-slate-800 hover:border-rose-900/60 text-slate-100' 
                    : 'bg-white border-slate-200 hover:border-rose-300 text-slate-900 shadow-sm'
                }`}
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>{viol.empName} ({viol.empCode})</span>
                    <span className={`text-[10px] font-mono ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{viol.unit}</span>

                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      viol.severity === 'critical' 
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30' 
                        : viol.severity === 'high'
                          ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30'
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                    }`}>
                      شدت: {viol.severity === 'critical' ? 'بحرانی' : viol.severity === 'high' ? 'بالا' : 'متوسط'}
                    </span>

                    <span className="text-[10px] text-slate-500 font-mono">
                      زمان رخداد: {viol.timestamp}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-rose-600 dark:text-rose-400">{viol.title}</h4>
                  <p className={`text-xs leading-relaxed max-w-4xl ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                    {viol.description}
                  </p>
                </div>

                {/* Status action buttons */}
                <div className="flex items-center gap-2">
                  {viol.status === 'new' && (
                    <button
                      onClick={() => handleUpdateViolationStatus(viol.id, 'acknowledged')}
                      className="px-3 py-1.5 rounded-xl bg-amber-600/15 text-amber-600 dark:text-amber-400 hover:bg-amber-600/25 border border-amber-500/30 text-xs font-bold cursor-pointer transition"
                    >
                      تایید و اعلام تذکر
                    </button>
                  )}
                  {viol.status === 'acknowledged' && (
                    <button
                      onClick={() => handleUpdateViolationStatus(viol.id, 'addressed')}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600/25 border border-emerald-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                    >
                      <Check className="w-3 h-3" />
                      <span>رسیدگی و مختومه</span>
                    </button>
                  )}
                  {viol.status === 'addressed' && (
                    <span className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 ${
                      theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> مختومه شده
                    </span>
                  )}

                  {/* Edit & Delete buttons */}
                  <button
                    type="button"
                    onClick={() => setEditingViolation(JSON.parse(JSON.stringify(viol)))}
                    className={`p-1.5 rounded-xl border text-xs font-bold cursor-pointer transition ${
                      theme === 'dark' 
                        ? 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-teal-300' 
                        : 'bg-teal-50 hover:bg-teal-100 border-teal-200 text-teal-700'
                    }`}
                    title="ویرایش هشدار انضباطی"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeletingViolation(viol)}
                    className={`p-1.5 rounded-xl border text-xs font-bold cursor-pointer transition ${
                      theme === 'dark' 
                        ? 'bg-slate-800/80 hover:bg-rose-900/40 border-slate-700 text-rose-400' 
                        : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700'
                    }`}
                    title="حذف هشدار انضباطی"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: BURNOUT DYNAMICS & WORKLOAD RADAR */}
      {activeSubTab === 'burnout' && (
        <div className="space-y-6">
          <div className={`p-6 rounded-2xl border space-y-4 ${
            theme === 'dark' 
              ? 'bg-gradient-to-r from-slate-900 via-rose-950/30 to-slate-900 border-rose-900/40' 
              : 'bg-gradient-to-r from-rose-50/60 via-white to-orange-50/60 border-rose-200 shadow-sm'
          }`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className={`text-base font-bold flex items-center gap-2 ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                  <Flame className="w-5 h-5 text-rose-500" />
                  <span>داینامیک فرسودگی شغلی و شدت بار کاری (Kickidler Burnout Radar)</span>
                </h3>
                <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                  پایش پیوسته ساعات ممتد کاربری، ریتم اضافه‌کاری‌های فرساینده و پیشگیری زودهنگام از افت کیفیت و فرسودگی پرسنل
                </p>
              </div>

              <div className="px-4 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs font-bold">
                ریسک فرسودگی سازمانی: <span className="font-mono text-sm">{records.length > 0 ? Math.round(records.reduce((sum, r) => sum + r.burnoutRiskScore, 0) / records.length) : 0}٪ ({records.length > 0 ? 'ثبت‌شده' : 'بدون داده'})</span>
              </div>
              {records.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllRecords}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                    theme === 'dark' ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20' : 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200'
                  }`}
                  title="پاک‌سازی تمام رکوردهای فرسودگی شغلی"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>پاک‌سازی همه</span>
                </button>
              )}
            </div>
          </div>

          {/* Burnout Cards for Each Employee */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {records.length === 0 ? (
              <div className="w-full p-8 border border-dashed rounded-2xl text-center col-span-full" style={{
                borderColor: theme === 'dark' ? 'rgba(148,163,189,0.3)' : 'rgba(148,163,189,0.4)',
                backgroundColor: theme === 'dark' ? 'rgba(17,24,39,0.3)' : 'rgba(248,250,252,0.6)'
              }}>
                <Flame className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                <p className={`text-sm font-bold mb-1 ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>هیچ‌گاه داده فرسودگی شغلی ثبت‌شده‌ای وجود ندارد</p>
                <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                  داده‌های فرسودگی و بار کاری از سوابق فعالیت پرسنل محاسبه می‌شوند. پس از ثبت فعالیت یا بارگذاری داده، کارت‌های پرسنل نمایش داده خواهند شد.
                </p>
              </div>
            ) : (
            records.map(rec => {
              const isHigh = rec.burnoutRiskScore >= 60;
              const isOptimal = rec.burnoutRiskScore < 60 && rec.burnoutRiskScore >= 25;
              return (
                <div
                  key={rec.empId}
                  className={`p-5 rounded-2xl border transition-all space-y-4 ${
                    isHigh 
                      ? theme === 'dark' ? 'bg-rose-950/20 border-rose-800/60 text-slate-100' : 'bg-rose-50/40 border-rose-200 text-slate-900'
                      : isOptimal
                        ? theme === 'dark' ? 'bg-slate-900/70 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900 shadow-sm'
                        : theme === 'dark' ? 'bg-amber-950/20 border-amber-800/40 text-slate-100' : 'bg-amber-50/40 border-amber-200 text-slate-900'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>{rec.empName}</h4>
                      <p className={`text-[10px] font-mono ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{rec.unit}</p>
                    </div>

                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                      isHigh 
                        ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30' 
                        : isOptimal
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                    }`}>
                      {isHigh ? 'ریسک فرسودگی بالا' : isOptimal ? 'بار کاری متعادل' : 'کمتر از ظرفیت'}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold">
                      <span className={theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}>شاخص شدت فرسودگی (Burnout Risk)</span>
                      <span className={`font-mono ${isHigh ? 'text-rose-500' : 'text-teal-600 dark:text-teal-400'}`}>
                        {rec.burnoutRiskScore}٪
                      </span>
                    </div>
                    <div className={`w-full h-2 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-200'}`}>
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          isHigh ? 'bg-rose-500' : isOptimal ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${rec.burnoutRiskScore}%` }}
                      />
                    </div>
                  </div>

                  <div className={`p-3 rounded-xl border text-xs leading-relaxed ${
                    theme === 'dark' ? 'bg-slate-950/60 border-slate-800/60 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}>
                    {isHigh 
                      ? 'ساعات پیوسته بدون وقفه در شیفت‌های کاری. توصیه: تنظیم زمان استراحت ارگونومیک و بازتوزیع وظایف ستاپ.' 
                      : isOptimal
                        ? 'ریتم کاری استاندارد، توزیع مناسب زمان مولد و تعادل فعالیت‌ها.'
                        : 'ظرفیت خالی در انجام وظایف تحلیلی. امکان تفویض مسئولیت‌های جدید وجود دارد.'
                    }
                  </div>
                </div>
              );
            })
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: Send Station Alert */}
      {isStationAlertModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`border w-full max-w-lg rounded-2xl p-6 space-y-4 text-right shadow-2xl animate-scale-up ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className={`flex items-center justify-between pb-3 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
              <h3 className="text-base font-bold flex items-center gap-2">
                <Send className="w-5 h-5 text-teal-500" />
                <span>مخابره پیام هشدار فوری به ایستگاه: {targetAlertEmpName}</span>
              </h3>
              <button 
                type="button"
                onClick={() => setIsStationAlertModalOpen(false)}
                aria-label="بستن"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSendStationAlertSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>درجه فوریت پیام:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAlertUrgency('normal')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      alertUrgency === 'normal'
                        ? 'bg-teal-600 border-teal-500 text-white shadow-sm'
                        : theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-700'
                    }`}
                  >
                    تذکر نظارتی عادی
                  </button>
                  <button
                    type="button"
                    onClick={() => setAlertUrgency('urgent')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      alertUrgency === 'urgent'
                        ? 'bg-rose-600 border-rose-500 text-white shadow-sm'
                        : theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-700'
                    }`}
                  >
                    هشدار فوری (قرمز)
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>متن پیام نمایشی روی مانیتور اپراتور:</label>
                <textarea
                  rows={3}
                  required
                  value={alertMessageText}
                  onChange={(e) => setAlertMessageText(e.target.value)}
                  className={`w-full border rounded-xl p-3 text-xs focus:outline-none focus:border-teal-500 leading-relaxed ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsStationAlertModalOpen(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                    theme === 'dark' ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md cursor-pointer transition"
                >
                  ارسال پیام به ایستگاه
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Add New Violation */}
      {isNewViolationModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`border w-full max-w-lg rounded-2xl p-6 space-y-4 text-right shadow-2xl animate-scale-up ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className={`flex items-center justify-between pb-3 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
              <h3 className="text-base font-bold flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-rose-500" />
                <span>ثبت هشدار انضباطی یا انحراف کارکرد جدید</span>
              </h3>
              <button 
                type="button"
                onClick={() => setIsNewViolationModalOpen(false)}
                aria-label="بستن"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateViolationSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>انتخاب پرسنل خاطی:</label>
                <select
                  value={violEmpId}
                  onChange={(e) => setViolEmpId(e.target.value)}
                  className={`w-full border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-rose-500 ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.code} - {emp.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>نوع تخلف / انحراف:</label>
                  <select
                    value={violType}
                    onChange={(e) => setViolType(e.target.value as any)}
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-rose-500 ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="unproductive_site">بازدید سایت / نرم‌افزار غیرمجاز</option>
                    <option value="prolonged_idle">توقف طولانی‌مدت غیرمجاز (Idle)</option>
                    <option value="late_arrival">تاخیر در ورود به شیفت</option>
                    <option value="early_departure">ترک زودهنگام ایستگاه</option>
                    <option value="unauthorized_program">اجرای برنامه نامربوط</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>شدت تخلف:</label>
                  <select
                    value={violSeverity}
                    onChange={(e) => setViolSeverity(e.target.value as any)}
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-rose-500 ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="low">کم (تذکر شفاهی)</option>
                    <option value="medium">متوسط (هشدار سیستمی)</option>
                    <option value="high">بالا (کسر از کارنامه)</option>
                    <option value="critical">بحرانی (ارجاع به کمیته انضباطی)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>عنوان کوتاه تخلف:</label>
                <input
                  type="text"
                  required
                  value={violTitle}
                  onChange={(e) => setViolTitle(e.target.value)}
                  placeholder="مثلاً: توقف بدون توجیه خط فرز بیش از ۳۵ دقیقه..."
                  className={`w-full border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-rose-500 ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>توضیحات و گزارش ناظر:</label>
                <textarea
                  rows={2}
                  value={violDescription}
                  onChange={(e) => setViolDescription(e.target.value)}
                  placeholder="جزئیات مشاهده‌شده یا گزارش لاگ مانیتورینگ..."
                  className={`w-full border rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500 leading-relaxed ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewViolationModalOpen(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                    theme === 'dark' ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md cursor-pointer transition"
                >
                  ثبت رسمی تخلف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE VIOLATION MODAL */}
      {deletingViolation && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 text-right my-auto">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 bg-rose-500/10 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">حذف هشدار انضباطی</h3>
                <p className="text-xs text-slate-400">{deletingViolation.empName} ({deletingViolation.empCode})</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              آیا از حذف هشدار <span className="font-bold text-white">«{deletingViolation.title}»</span> اطمینان دارید؟ این عملیات قابل بازگشت نیست.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingViolation(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => handleDeleteViolation(deletingViolation.id)}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/20 cursor-pointer"
              >
                تایید و حذف قطعی
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* EDIT VIOLATION MODAL */}
      {editingViolation && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className={`relative w-full max-w-lg rounded-2xl border p-6 shadow-2xl space-y-4 my-auto ${
            theme === 'dark' ? 'bg-slate-900 border-teal-500/30 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-teal-400">
                <Edit2 className="w-5 h-5" />
                <h3 className="text-base font-bold">ویرایش هشدار انضباطی کیک‌ایدلر</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingViolation(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">عنوان هشدار / تخلف:</label>
                <input
                  type="text"
                  value={editingViolation.title}
                  onChange={e => setEditingViolation({ ...editingViolation, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">توضیحات و گزارش کارشناس:</label>
                <textarea
                  rows={2}
                  value={editingViolation.description}
                  onChange={e => setEditingViolation({ ...editingViolation, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">سطح شدت:</label>
                  <select
                    value={editingViolation.severity}
                    onChange={e => setEditingViolation({ ...editingViolation, severity: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="low">کم (تذکر شفاهی)</option>
                    <option value="medium">متوسط (هشدار سیستمی)</option>
                    <option value="high">بالا (کسر از کارنامه)</option>
                    <option value="critical">بحرانی (کمیته انضباطی)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold mb-1">وضعیت رسیدگی:</label>
                  <select
                    value={editingViolation.status}
                    onChange={e => setEditingViolation({ ...editingViolation, status: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="new">جدید (بررسی‌نشده)</option>
                    <option value="acknowledged">تایید و تذکر داده‌شده</option>
                    <option value="addressed">مختومه شده</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingViolation(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => handleSaveEditedViolation(editingViolation)}
                className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-teal-600/20 cursor-pointer"
              >
                <Save className="w-4 h-4" /> ذخیره تغییرات
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* DELETE RECORD MODAL */}
      {deletingRecord && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 text-right my-auto">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 bg-rose-500/10 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">حذف کارنامه زمانی شاغل</h3>
                <p className="text-xs text-slate-400">{deletingRecord.empName} ({deletingRecord.empCode})</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              آیا از حذف داده‌های کارنامه بهره‌وری زمانی <span className="font-bold text-white">«{deletingRecord.empName}»</span> برای تاریخ {deletingRecord.date} اطمینان دارید؟
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingRecord(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => handleDeleteRecord(deletingRecord.empId)}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/20 cursor-pointer"
              >
                تایید و حذف قطعی
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* EDIT RECORD MODAL */}
      {editingRecord && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className={`relative w-full max-w-lg rounded-2xl border p-6 shadow-2xl space-y-4 my-auto ${
            theme === 'dark' ? 'bg-slate-900 border-teal-500/30 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-teal-400">
                <Edit2 className="w-5 h-5" />
                <h3 className="text-base font-bold">ویرایش کارنامه زمانی و بهره‌وری: {editingRecord.empName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1 text-emerald-400">زمان مولد (دقیقه):</label>
                  <input
                    type="number"
                    value={editingRecord.timeBreakdown.productiveMinutes}
                    onChange={e => {
                      const productiveMinutes = Number(e.target.value);
                      setEditingRecord({
                        ...editingRecord,
                        timeBreakdown: { ...editingRecord.timeBreakdown, productiveMinutes }
                      });
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 text-amber-400">زمان اداری / خنثی (دقیقه):</label>
                  <input
                    type="number"
                    value={editingRecord.timeBreakdown.neutralMinutes}
                    onChange={e => {
                      const neutralMinutes = Number(e.target.value);
                      setEditingRecord({
                        ...editingRecord,
                        timeBreakdown: { ...editingRecord.timeBreakdown, neutralMinutes }
                      });
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1 text-rose-400">زمان غیرمولد (دقیقه):</label>
                  <input
                    type="number"
                    value={editingRecord.timeBreakdown.unproductiveMinutes}
                    onChange={e => {
                      const unproductiveMinutes = Number(e.target.value);
                      setEditingRecord({
                        ...editingRecord,
                        timeBreakdown: { ...editingRecord.timeBreakdown, unproductiveMinutes }
                      });
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-400">زمان عدم فعالیت / Idle (دقیقه):</label>
                  <input
                    type="number"
                    value={editingRecord.timeBreakdown.idleMinutes}
                    onChange={e => {
                      const idleMinutes = Number(e.target.value);
                      setEditingRecord({
                        ...editingRecord,
                        timeBreakdown: { ...editingRecord.timeBreakdown, idleMinutes }
                      });
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <label className="block font-bold mb-1 text-[11px]">مجموع شیفت (دقیقه):</label>
                  <input
                    type="number"
                    value={editingRecord.timeBreakdown.totalWorkMinutes}
                    onChange={e => {
                      const totalWorkMinutes = Number(e.target.value);
                      setEditingRecord({
                        ...editingRecord,
                        timeBreakdown: { ...editingRecord.timeBreakdown, totalWorkMinutes }
                      });
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 text-[11px]">تعداد کلیدها (کیبورد):</label>
                  <input
                    type="number"
                    value={editingRecord.keystrokesCount}
                    onChange={e => setEditingRecord({ ...editingRecord, keystrokesCount: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 text-[11px]">تعداد کلیک ماوس:</label>
                  <input
                    type="number"
                    value={editingRecord.mouseClicksCount}
                    onChange={e => setEditingRecord({ ...editingRecord, mouseClicksCount: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => handleSaveEditedRecord(editingRecord)}
                className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-teal-600/20 cursor-pointer"
              >
                <Save className="w-4 h-4" /> ذخیره تغییرات کارنامه
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* EDIT LIVE ACTIVITY MODAL */}
      {editingLive && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className={`relative w-full max-w-md rounded-2xl border p-6 shadow-2xl space-y-4 my-auto ${
            theme === 'dark' ? 'bg-slate-900 border-teal-500/30 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-teal-400">
                <Edit2 className="w-5 h-5" />
                <h3 className="text-base font-bold">ویرایش پایش زنده: {editingLive.empName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingLive(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">وضعیت مانیتورینگ زنده:</label>
                <select
                  value={editingLive.status}
                  onChange={e => setEditingLive({ ...editingLive, status: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500"
                >
                  <option value="productive">مولد و فعال (Productive)</option>
                  <option value="neutral">خنثی / اداری (Neutral)</option>
                  <option value="idle">دور از سیستم (Idle)</option>
                  <option value="offline">آفلاین / خارج از شیفت (Offline)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold mb-1">پنجره / اپلیکیشن فعال:</label>
                <input
                  type="text"
                  value={editingLive.currentApp}
                  onChange={e => setEditingLive({ ...editingLive, currentApp: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">دسته‌بندی نرم‌افزار:</label>
                <input
                  type="text"
                  value={editingLive.currentAppCategory}
                  onChange={e => setEditingLive({ ...editingLive, currentAppCategory: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">نرخ بهره‌وری امروز (٪):</label>
                  <input
                    type="number"
                    value={editingLive.todayProductivityRate}
                    onChange={e => setEditingLive({ ...editingLive, todayProductivityRate: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">زمان بی‌کاری (دقیقه):</label>
                  <input
                    type="number"
                    value={editingLive.todayIdleMinutes}
                    onChange={e => setEditingLive({ ...editingLive, todayIdleMinutes: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingLive(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => handleSaveEditedLive(editingLive)}
                className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-teal-600/20 cursor-pointer"
              >
                <Save className="w-4 h-4" /> ذخیره
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* DELETE LIVE ACTIVITY CONFIRMATION MODAL */}
      {deletingLiveEmpId && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 text-right my-auto">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 bg-rose-500/10 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-100">حذف شاغل از پایش زنده</h3>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              آیا از حذف این شاغل از مانیتورینگ زنده کیک‌ایدلر اطمینان دارید؟
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingLiveEmpId(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => handleDeleteLive(deletingLiveEmpId)}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/20 cursor-pointer"
              >
                تایید و حذف
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

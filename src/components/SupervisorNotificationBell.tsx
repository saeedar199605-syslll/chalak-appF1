/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Bell, 
  AlertTriangle, 
  Clock, 
  ArrowLeft, 
  CheckCircle2, 
  ChevronDown, 
  GitFork, 
  Flame,
  X
} from 'lucide-react';
import { Evaluation, Employee, UserNotification } from '../types';
import { getOverdueEvaluations, OverdueEvaluationItem } from '../utils/overdueNotifications';

interface SupervisorNotificationBellProps {
  evaluations: Evaluation[];
  employees: Employee[];
  currentUser: Employee;
  onNavigate: (tab: string) => void;
  theme?: 'light' | 'dark';
  className?: string;
  directNavigateOnClick?: boolean; // When true, clicking bell directly navigates to workflow
  notifications?: UserNotification[];
  onMarkNotificationRead?: (id: string) => void;
  onMarkAllNotificationsRead?: () => void;
  onOpenNotification?: (notification: UserNotification) => void;
}

export default function SupervisorNotificationBell({
  evaluations,
  employees,
  currentUser,
  onNavigate,
  theme = 'dark',
  className = '',
  directNavigateOnClick = false
  , notifications = [], onMarkNotificationRead, onMarkAllNotificationsRead, onOpenNotification
}: SupervisorNotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const overdueList: OverdueEvaluationItem[] = getOverdueEvaluations(evaluations, employees, currentUser);
  const overdueCount = overdueList.length;
  const unreadNotifications = notifications.filter(item => !item.readAt).length;
  const recentNotifications = [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);

  // Items pending approval/action by current user or in supervisor/admin scope
  const pendingApprovalsCount = useMemo(() => {
    return evaluations.filter(ev => {
      if (ev.stage === 'completed') return false;
      const userRole = currentUser.role as string;
      const evStage = (ev.stage || '') as string;
      if (userRole === 'admin') return true;
      if (userRole === 'hr') return evStage === 'hr_approval' || evStage === 'calibration_review';
      if (userRole === 'manager') return evStage === 'manager_review' || evStage === 'calibration_review';
      if (userRole === 'supervisor') {
        const emp = employees.find(e => e.id === ev.empId);
        return emp?.supervisorId === currentUser.id && (evStage === 'supervisor_review' || ev.currentAssigneeId === currentUser.id);
      }
      return ev.currentAssigneeId === currentUser.id;
    }).length;
  }, [evaluations, employees, currentUser]);

  const totalPendingCount = Math.max(overdueCount, pendingApprovalsCount, unreadNotifications);
  const shouldShake = overdueCount > 5 || pendingApprovalsCount > 5;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleOrNavigate = (e: React.MouseEvent) => {
    e.preventDefault();
    if (overdueCount === 0 && unreadNotifications === 0) {
      onNavigate('workflow');
      return;
    }
    setIsOpen(!isOpen);
  };

  const handleNavigateToWorkflow = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    onNavigate('workflow');
  };

  return (
    <div ref={containerRef} className={`relative inline-flex items-center ${className}`} dir="rtl">
      {/* Smart Bell Unified Trigger Button */}
      <button
        type="button"
        onClick={handleToggleOrNavigate}
        title={totalPendingCount > 0 
          ? `${totalPendingCount} پرونده ارزیابی معوقه یا در انتظار اقدام - برای مشاهده جزئیات کلیک کنید` 
          : 'اعلان‌های هوشمند: همه پرونده‌ها در وضعیت استاندارد قرار دارند'
        }
        className={`relative px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 group border ${
          totalPendingCount > 0
            ? theme === 'dark'
              ? 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/30 text-rose-300 shadow-sm'
              : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700 shadow-xs'
            : theme === 'dark' 
              ? 'bg-slate-900/80 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-slate-200' 
              : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-800 shadow-xs'
        }`}
        aria-label="اعلان پرونده‌های معوقه و در انتظار اقدام"
      >
        <div className="relative shrink-0">
          <Bell className={`w-4 h-4 transition-transform duration-300 ${
            shouldShake 
              ? 'text-rose-500 animate-bell-shake filter drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]' 
              : totalPendingCount > 0 
                ? 'text-rose-500 group-hover:scale-110 group-hover:rotate-12 animate-pulse' 
                : ''
          }`} />
          
          {/* Animated Ping Glow Ring if Overdue or Many Pending */}
          {totalPendingCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${shouldShake ? 'bg-rose-500 opacity-90' : 'bg-rose-400 opacity-75'}`}></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600 border border-white/40"></span>
            </span>
          )}
        </div>

        {/* Overdue / Pending Badge with Count */}
        {totalPendingCount > 0 ? (
          <div className="flex items-center gap-1.5 font-bold text-xs">
            <span className={`px-1.5 py-0.2 rounded-md text-white font-mono text-[11px] flex items-center gap-1 ${
              shouldShake ? 'bg-rose-600 animate-pulse ring-2 ring-rose-500/50 font-black' : 'bg-rose-500'
            }`}>
              {shouldShake && <Flame className="w-3 h-3 text-amber-300 animate-bounce" />}
              {totalPendingCount}
            </span>
            <span className="text-[11px] font-bold">
              {shouldShake ? 'اقدام فوری' : unreadNotifications > 0 ? 'اعلان' : overdueCount > 0 ? 'معوقه' : 'در انتظار'}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        ) : (
          <span className="hidden sm:inline text-[11px] text-slate-400 font-medium">به‌روز</span>
        )}
      </button>

      {/* Interactive Overdue Dropdown Popover */}
      {isOpen && (
        <div 
          className={`fixed sm:absolute left-4 right-4 sm:left-0 sm:right-auto top-14 sm:top-full mt-2 sm:w-96 rounded-2xl border shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 backdrop-blur-xl ${
            theme === 'dark' 
              ? 'bg-slate-900/98 border-slate-800 shadow-slate-950/90 text-slate-100' 
              : 'bg-white/98 border-slate-200 shadow-slate-300 text-slate-800'
          }`}
        >
          {/* Header */}
          <div className={`flex items-center justify-between pb-3 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-rose-500/15 text-rose-500 flex items-center justify-center shrink-0">
                <Flame className="w-4 h-4" />
              </div>
              <div>
                <h4 className={`text-xs font-black ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                  اعلان‌ها و کارهای نیازمند اقدام
                </h4>
                <p className={`text-[10px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                  {unreadNotifications} اعلان خوانده‌نشده · {overdueCount} ارزیابی معوق از SLA
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className={`p-1.5 rounded-lg transition ${
                theme === 'dark' 
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800' 
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {recentNotifications.length > 0 && <div className="space-y-2 border-b border-slate-800 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black">اعلان‌های شما</span>
              {unreadNotifications > 0 && <button type="button" onClick={onMarkAllNotificationsRead} className="text-[10px] text-teal-400">خواندن همه</button>}
            </div>
            <div className="max-h-52 space-y-1.5 overflow-y-auto">
              {recentNotifications.map(notification => <button key={notification.id} type="button" onClick={() => { if (!notification.readAt) onMarkNotificationRead?.(notification.id); if (onOpenNotification) onOpenNotification(notification); else onNavigate(notification.targetTab); setIsOpen(false); }} className={`block w-full rounded-xl border p-2.5 text-right ${notification.readAt ? 'border-slate-800 bg-slate-950/40 opacity-75' : 'border-teal-500/20 bg-teal-500/5'}`}>
                <span className="flex items-center justify-between gap-2"><strong className="text-[11px]">{notification.title}</strong>{!notification.readAt && <i className="h-2 w-2 rounded-full bg-teal-400" />}</span>
                <span className="mt-1 block text-[10px] leading-4 text-slate-400">{notification.message}</span>
                <span className="mt-1 block text-[9px] text-slate-500">{new Date(notification.createdAt).toLocaleString()}</span>
              </button>)}
            </div>
          </div>}

          {recentNotifications.length === 0 && overdueCount === 0 && <div className="py-6 text-center text-xs text-slate-400">اعلانی ندارید. پرونده‌های جدید پس از اقدام در اینجا نمایش داده می‌شوند.</div>}

          {/* List of Overdue Items */}
          <div className="max-h-64 overflow-y-auto space-y-2 py-3 pr-0.5">
            {overdueList.map((item) => (
              <div
                key={item.evalId}
                onClick={handleNavigateToWorkflow}
                className={`p-3 rounded-xl border transition cursor-pointer group ${
                  theme === 'dark'
                    ? 'bg-slate-950/60 border-slate-800/80 hover:border-rose-500/50'
                    : 'bg-slate-50 border-slate-200 hover:border-rose-400 hover:bg-rose-50/30'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
                    <span className={`text-xs font-bold transition ${
                      theme === 'dark' ? 'text-slate-200 group-hover:text-teal-400' : 'text-slate-800 group-hover:text-rose-600'
                    }`}>
                      {item.empName}
                    </span>
                  </div>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    theme === 'dark' ? 'text-slate-400 bg-slate-900 border border-slate-800' : 'text-slate-600 bg-white border border-slate-200'
                  }`}>
                    {item.empCode}
                  </span>
                </div>

                <p className={`text-[11px] mt-1 font-medium leading-relaxed ${
                  theme === 'dark' ? 'text-rose-300/90' : 'text-rose-700'
                }`}>
                  {item.reason}
                </p>

                <div className={`flex items-center justify-between mt-2 pt-2 border-t text-[10px] ${
                  theme === 'dark' ? 'border-slate-800/60' : 'border-slate-200'
                }`}>
                  <span className={theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}>
                    مرحله: <strong className={theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}>{item.stageLabel}</strong>
                  </span>
                  <span className="font-mono font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-lg border border-rose-500/20">
                    {item.daysOverdue} روز تاخیر
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Footer Navigation Action */}
          <div className={`pt-3 border-t ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
            <button
              type="button"
              onClick={handleNavigateToWorkflow}
              className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-teal-600/20 cursor-pointer"
            >
              <GitFork className="w-4 h-4" />
              <span>انتقال به گردش کار و تعیین تکلیف</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

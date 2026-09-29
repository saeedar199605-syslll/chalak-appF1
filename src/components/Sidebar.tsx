/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Streamlined & Modern Sidebar Navigation
 * Clean, uncluttered, role-aware, and highly responsive.
 */

import React from 'react';
import { LifeBuoy, LayoutDashboard, 
  FileSpreadsheet, 
  Briefcase, 
  Users, 
  ClipboardCheck, 
  Scale, 
  TrendingUp, 
  ShieldCheck,
  Sun,
  Moon,
  LogOut,
  Award,
  BookOpen,
  HelpCircle,
  X,
  LockKeyhole,
  GitFork,
  Calculator,
  Target,
  Monitor,
  Printer,
  FileText
} from 'lucide-react';
import { Employee, UserRole } from '../types';
import { canAccessTab } from '../utils/accessControl';

interface SidebarProps {
  currentTab: string;
  onChangeTab: (tab: string) => void;
  currentUser: Employee;
  onLogout: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  hasCertifiedBadge: boolean;
  onStartTour: () => void;
  onOpenManual?: () => void;
  canDownloadManual?: boolean;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export default function Sidebar({ 
  currentTab, 
  onChangeTab, 
  currentUser, 
  onLogout, 
  theme, 
  onToggleTheme, 
  hasCertifiedBadge,
  onStartTour,
  onOpenManual,
  canDownloadManual = true,
  isMobileOpen = false,
  onCloseMobile
}: SidebarProps) {
  
  // Navigation follows the product lifecycle: prepare → evaluate → review → report.
  type MenuItem = { id: string, label: string, icon: any, roles?: string[], permission?: string };
  type MenuGroup = { title: string, items: MenuItem[] };
  
  const menuGroups: MenuGroup[] = [
    { title: '۱. آماده‌سازی سازمان', items: [
      { id: 'employees', label: 'مدیریت کارکنان', icon: Users, roles: ['admin'] },
      { id: 'profiles', label: 'پروفایل‌های شغلی', icon: Briefcase, roles: ['admin'] },
      { id: 'criteria', label: 'بانک شاخص‌ها و فرمول‌های KPI', icon: Calculator, roles: ['admin', 'supervisor'], permission: 'manage_criteria' },
    ] },
    { title: '۲. دوره و ارزیابی', items: [
      { id: 'dashboard', label: 'داشبورد و آمادگی دوره', icon: LayoutDashboard, roles: ['admin', 'supervisor'] },
      { id: 'evaluations', label: 'ارزیابی‌ها، MIS و دوره‌ها', icon: ClipboardCheck, roles: ['admin', 'supervisor'] },
      { id: 'my-evaluation', label: 'کارنامه و خودارزیابی من', icon: ShieldCheck, roles: ['employee'] },
    ] },
    { title: '۳. گردش کار و بازبینی', items: [
      { id: 'workflow', label: 'کارتابل و گردش کار', icon: GitFork, roles: ['admin', 'supervisor', 'employee'] },
      { id: 'calibration', label: 'کالیبراسیون نمرات', icon: Scale, roles: ['admin'] },
    ] },
    { title: '۴. نتایج و گزارش', items: [
      { id: 'reports', label: 'تحلیل‌ها و ماتریس ۹-Box', icon: TrendingUp, roles: ['admin', 'supervisor'], permission: 'view_all_reports' },
      { id: 'rewards', label: 'محاسبات ریالی پاداش', icon: Award, roles: ['admin'] },
    ] },
    { title: '۵. توسعه و پایش مستمر', items: [
      { id: 'lattice-hub', label: 'اهداف OKR، جلسات ۱به۱ و تمجید', icon: Target, roles: ['admin', 'supervisor', 'employee'] },
      { id: 'kickidler-hub', label: 'پایش زمان و بهره‌وری کارکرد', icon: Monitor, roles: ['admin', 'supervisor'] },
    ] },
    { title: '۶. پشتیبانی و مدیریت سامانه', items: [
      { id: 'onboarding', label: 'آموزش بدو ورود', icon: BookOpen, roles: ['admin', 'supervisor', 'employee'] },
      { id: 'support', label: currentUser.role === 'admin' ? 'مدیریت تیکت‌ها' : 'پشتیبانی و ارتباط با مدیر', icon: LifeBuoy, roles: ['admin', 'supervisor', 'employee'] },
      { id: 'settings', label: 'مرکز مدیریت و امنیت', icon: LockKeyhole, roles: ['admin'] },
    ] },
  ];

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'مدیر منابع انسانی';
      case 'supervisor': return 'سرپرست خط';
      case 'employee': return 'اپراتور کارگاه';
    }
  };

  const handleTabClick = (tabId: string) => {
    onChangeTab(tabId);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 bg-slate-950/55 backdrop-blur-sm z-40 md:hidden animate-in fade-in"
        />
      )}

      {/* Sidebar Container */}
      <aside className={`app-sidebar
        fixed inset-y-0 right-0 z-50 md:static md:z-auto
        w-[17.5rem] border-l flex flex-col justify-between h-screen shrink-0 select-none
        transition-all duration-300 ease-in-out
        ${isMobileOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full md:translate-x-0'}
        ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800 shadow-md'}
      `}>
        
        {/* Top Header & Navigation Links */}
        <div className="p-4 flex flex-col gap-5 flex-1 min-h-0 overflow-y-auto overscroll-contain">
          
          {/* Clean Brand Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800/80">
            <div 
              onClick={() => handleTabClick(currentUser.role === 'employee' ? 'my-evaluation' : 'dashboard')}
              className="flex items-center gap-3 cursor-pointer rounded-xl outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-teal-500"
              title="صفحه اصلی"
            >
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 dark:border-slate-700 flex items-center justify-center p-1.5 shadow-sm shrink-0">
                <img src="/logo.svg" alt="لوگو چالاک" className="w-full h-full object-contain" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-black tracking-tight truncate">اصفهان چالاک</h1>
                <p className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold truncate">سامانه ارزیابی عملکرد</p>
              </div>
            </div>

            {/* Mobile Close Button */}
            {onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="بستن منو"
                className="md:hidden grid min-h-10 min-w-10 place-items-center rounded-lg bg-slate-800/40 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Clean Active User Badge */}
          <div className={`px-3.5 py-3 rounded-2xl border text-right flex items-center justify-between shadow-sm ${
            theme === 'dark' ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200 shadow-sm'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <div className="min-w-0">
                <span className="text-xs font-black truncate block">
                  {currentUser.name}
                </span>
                <span className="text-[9px] text-slate-400 truncate block">
                  {getRoleLabel(currentUser.role)}
                </span>
              </div>
            </div>
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 shrink-0">
              {currentUser.code}
            </span>
          </div>

          {/* Navigation Menu */}
          <nav aria-label="ناوبری اصلی" className="flex flex-col gap-4">
            {menuGroups.map((group, gIdx) => {
              const visibleItems = group.items.filter(item => {
              return canAccessTab(currentUser, item.id);
            });
              if (visibleItems.length === 0) return null;

              return (
                <div key={gIdx} className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-500 px-3 py-2 block whitespace-normal break-words">
                    {group.title}
                  </span>
                  <div className="space-y-0.5">
                    {visibleItems.map(item => {
                      const Icon = item.icon;
                      const isActive = currentTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleTabClick(item.id)}
                          title={item.label}
                          aria-current={isActive ? 'page' : undefined}
                          className={`flex min-h-11 items-center justify-between w-full px-3 py-2.5 rounded-xl text-right text-[13px] font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                            isActive 
                              ? theme === 'dark'
                                ? 'bg-teal-500/10 text-teal-200 font-bold border-r-2 border-teal-400'
                                : 'bg-teal-50 text-teal-900 font-bold border-r-2 border-teal-600'
                              : theme === 'dark'
                                ? 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Icon className={`w-[1.125rem] h-[1.125rem] shrink-0 ${isActive ? 'text-teal-600 dark:text-teal-300' : 'text-slate-400'}`} />
                            <span className="min-w-0 flex-1 whitespace-normal break-words leading-5">{item.label}</span>
                          </div>
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-600 dark:bg-teal-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

        </div>

        {/* Footer: Streamlined Controls */}
        <div className={`p-3.5 border-t flex flex-col gap-2.5 shrink-0 ${
          theme === 'dark' ? 'border-slate-800 bg-slate-950/70' : 'border-slate-200 bg-slate-50'
        }`}>
          {/* Comprehensive PDF Manual button */}
          {onOpenManual && (
            <button
              type="button"
              onClick={onOpenManual}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold transition-all shadow-md shadow-teal-600/20 cursor-pointer"
              title={canDownloadManual ? "مشاهده و دریافت کتابچه راهنمای جامع PDF" : "مشاهده آنلاین کتابچه راهنمای جامع سامانه"}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{canDownloadManual ? "دانلود کتابچه راهنما (PDF)" : "مشاهده کتابچه راهنما (آنلاین)"}</span>
            </button>
          )}

          {/* Interactive Tour link */}
          <button
            type="button"
            onClick={onStartTour}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/20 text-[11px] font-bold transition-all cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>راهنمای تعاملی سامانه</span>
          </button>

          {/* Theme & Logout */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={onToggleTheme}
              className={`min-h-10 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 px-2 text-xs font-bold ${
                theme === 'dark' ? 'hover:bg-slate-800 text-amber-400' : 'hover:bg-slate-200 text-indigo-600'
              }`}
              title={theme === 'dark' ? 'حالت روز' : 'حالت شب'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span className="text-[10px] text-slate-400">{theme === 'dark' ? 'روز' : 'شب'}</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="min-h-10 rounded-lg transition-all cursor-pointer text-rose-400 hover:bg-rose-500/10 flex items-center gap-1 px-2 text-[11px] font-bold"
              title="خروج از حساب"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج</span>
            </button>
          </div>

        </div>

      </aside>
    </>
  );
}

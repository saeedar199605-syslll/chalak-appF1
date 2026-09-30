import { LayoutDashboard, Users, Briefcase, Calculator, ClipboardCheck, ShieldCheck, GitFork, Scale, TrendingUp, Award, Target, Monitor, BookOpen, LifeBuoy, LockKeyhole, FileSpreadsheet } from 'lucide-react';
import type { Employee } from '../types';
import { canAccessTab } from './accessControl';
import { readGranularPermissionPolicy } from './authorization';

export const NAVIGATION_GROUPS = [
  { id: 'home', title: 'شروع', items: [{ id: 'dashboard', label: 'داشبورد', icon: LayoutDashboard }] },
  { id: 'daily', title: 'کار روزانه', items: [
    { id: 'workflow', label: 'کارتابل و گردش کار', icon: GitFork },
    { id: 'my-evaluation', label: 'کارنامه من', icon: ShieldCheck },
    { id: 'lattice-hub', label: 'اهداف و گفت‌وگوها', icon: Target },
    { id: 'kickidler-hub', label: 'پایش کارکرد', icon: Monitor },
  ] },
  { id: 'performance', title: 'مدیریت عملکرد', items: [
    { id: 'employees', label: 'کارکنان', icon: Users },
    { id: 'profiles', label: 'پروفایل‌های شغلی', icon: Briefcase },
    { id: 'criteria', label: 'شاخص‌های ارزیابی', icon: Calculator },
    { id: 'evaluations', label: 'دوره‌ها و ارزیابی‌ها', icon: ClipboardCheck },
    { id: 'calibration', label: 'کالیبراسیون', icon: Scale },
  ] },
  { id: 'data', title: 'داده و درون‌ریزی', items: [{ id: 'imports', label: 'درون‌ریزی عملکرد', icon: FileSpreadsheet }] },
  { id: 'reports', title: 'نتایج و گزارش‌ها', items: [
    { id: 'reports', label: 'گزارش‌های عملکرد', icon: TrendingUp },
    { id: 'rewards', label: 'پاداش', icon: Award },
  ] },
  { id: 'administration', title: 'مدیریت سیستم', items: [{ id: 'settings', label: 'مرکز مدیریت', icon: LockKeyhole }] },
  { id: 'help', title: 'آموزش و پشتیبانی', items: [
    { id: 'onboarding', label: 'آموزش شروع کار', icon: BookOpen },
    { id: 'support', label: 'پشتیبانی', icon: LifeBuoy },
  ] },
];
export function visibleNavigation(user: Employee, policy = readGranularPermissionPolicy()) {
  return NAVIGATION_GROUPS.map(group => ({ ...group, items: group.items.filter(item => canAccessTab(user, item.id, policy)) })).filter(group => group.items.length);
}
export function navigationLocation(tab: string) {
  const group = NAVIGATION_GROUPS.find(group => group.items.some(item => item.id === tab));
  return { group: group?.title || '', title: group?.items.find(item => item.id === tab)?.label || '' };
}

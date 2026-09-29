import React, { useState, useMemo, useEffect } from 'react';
import { 
  Printer, 
  FileDown, 
  Search, 
  BookOpen, 
  X, 
  CheckCircle2, 
  Award, 
  Users, 
  LayoutDashboard, 
  ClipboardCheck, 
  GitFork, 
  Target, 
  Monitor, 
  Calculator, 
  Briefcase, 
  Scale, 
  TrendingUp, 
  LockKeyhole, 
  HelpCircle,
  AlertTriangle,
  ChevronLeft,
  Calendar,
  Layers,
  Sparkles,
  ShieldCheck,
  FileSpreadsheet,
  Download,
  Lock,
  Unlock,
  Sliders,
  RotateCcw,
  Check,
  Eye,
  EyeOff,
  UserCheck
} from 'lucide-react';
import { Employee, UserRole } from '../types';
import { 
  ManualAccessPolicy, 
  getManualAccessPolicy, 
  saveManualAccessPolicy, 
  canUserViewManual, 
  canUserDownloadManual 
} from '../utils/manualAccessManager';

interface ComprehensiveManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: 'dark' | 'light';
  currentUser?: Employee | null;
  employees?: Employee[];
}

export default function ComprehensiveManualModal({
  isOpen,
  onClose,
  theme = 'light',
  currentUser = null,
  employees = []
}: ComprehensiveManualModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeChapter, setActiveChapter] = useState<string>('all');
  const [policy, setPolicy] = useState<ManualAccessPolicy>(getManualAccessPolicy);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configFeedback, setConfigFeedback] = useState<string | null>(null);

  useEffect(() => {
    const handlePolicyUpdate = () => {
      setPolicy(getManualAccessPolicy());
    };
    window.addEventListener('manual_access_policy_updated', handlePolicyUpdate);
    return () => window.removeEventListener('manual_access_policy_updated', handlePolicyUpdate);
  }, []);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.username === 'admin';
  const canView = canUserViewManual(currentUser, policy);
  const canDownload = canUserDownloadManual(currentUser, policy);

  if (!isOpen) return null;

  const handlePrint = () => {
    if (!canDownload) return;
    window.print();
  };

  const handleToggleViewRole = (role: UserRole) => {
    if (role === 'admin') return; // Admin always retains access
    const newRoles = policy.allowedRolesToView.includes(role)
      ? policy.allowedRolesToView.filter(r => r !== role)
      : [...policy.allowedRolesToView, role];
    
    // If view permission is removed, also remove download permission
    const newDownloadRoles = newRoles.includes(role) 
      ? policy.allowedRolesToDownload 
      : policy.allowedRolesToDownload.filter(r => r !== role);

    const updated = {
      ...policy,
      allowedRolesToView: newRoles,
      allowedRolesToDownload: newDownloadRoles
    };
    setPolicy(updated);
    saveManualAccessPolicy(updated, currentUser?.name || 'مدیر سیستم');
    triggerFeedback('دسترسی مشاهده بروزرسانی شد.');
  };

  const handleToggleDownloadRole = (role: UserRole) => {
    if (role === 'admin') return; // Admin always retains access
    const newDownloadRoles = policy.allowedRolesToDownload.includes(role)
      ? policy.allowedRolesToDownload.filter(r => r !== role)
      : [...policy.allowedRolesToDownload, role];
    
    // If granted download permission, ensure view permission is also enabled
    const newViewRoles = newDownloadRoles.includes(role) && !policy.allowedRolesToView.includes(role)
      ? [...policy.allowedRolesToView, role]
      : policy.allowedRolesToView;

    const updated = {
      ...policy,
      allowedRolesToView: newViewRoles,
      allowedRolesToDownload: newDownloadRoles
    };
    setPolicy(updated);
    saveManualAccessPolicy(updated, currentUser?.name || 'مدیر سیستم');
    triggerFeedback('مجوز دانلود و چاپ بروزرسانی شد.');
  };

  const handleApplyPreset = (preset: 'all' | 'standard' | 'supervisors' | 'admin_only') => {
    let updated: ManualAccessPolicy;
    if (preset === 'all') {
      updated = {
        ...policy,
        allowedRolesToView: ['admin', 'supervisor', 'employee'],
        allowedRolesToDownload: ['admin', 'supervisor', 'employee']
      };
    } else if (preset === 'standard') {
      // Employees can only view, Supervisors and Admin can view + download
      updated = {
        ...policy,
        allowedRolesToView: ['admin', 'supervisor', 'employee'],
        allowedRolesToDownload: ['admin', 'supervisor']
      };
    } else if (preset === 'supervisors') {
      // Only supervisors and admin
      updated = {
        ...policy,
        allowedRolesToView: ['admin', 'supervisor'],
        allowedRolesToDownload: ['admin', 'supervisor']
      };
    } else {
      // Admin only
      updated = {
        ...policy,
        allowedRolesToView: ['admin'],
        allowedRolesToDownload: ['admin']
      };
    }
    setPolicy(updated);
    saveManualAccessPolicy(updated, currentUser?.name || 'مدیر سیستم');
    triggerFeedback('الگوی دسترسی با موفقیت اعمال گردید.');
  };

  const triggerFeedback = (msg: string) => {
    setConfigFeedback(msg);
    setTimeout(() => setConfigFeedback(null), 3000);
  };

  // If user does not have permission to view the manual
  if (!canView) {
    return (
      <div role="dialog" aria-modal="true" aria-labelledby="manual-access-denied-title" className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 font-sans" dir="rtl">
        <div className="bg-slate-900 border border-rose-500/40 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-500/10">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h3 id="manual-access-denied-title" className="text-base sm:text-lg font-black text-slate-100">دسترسی به کتابچه راهنما محدود است</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              طبق سیاست امنیتی تعیین‌شده توسط مدیر ارشد سیستم، حساب کاربری شما با نقش «
              <span className="text-rose-400 font-bold">
                {currentUser?.role === 'employee' ? 'همکار / اپراتور' : currentUser?.role === 'supervisor' ? 'سرپرست' : 'کاربر'}
              </span>
              » مجوز مشاهده کتابچه راهنمای جامع را ندارد.
            </p>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800 text-[11px] text-slate-400 text-right space-y-1">
            <div className="font-bold text-slate-300">راهنمایی:</div>
            <div>• در صورت نیاز به مستندات یا راهنما، با سرپرست مستقیم یا مدیریت منابع انسانی تماس حاصل فرمایید.</div>
            <div>• برای آموزش سامانه می‌توانید از دکمه «راهنمای تعاملی سامانه» در منوی کناری استفاده نمایید.</div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all cursor-pointer"
          >
            متوجه شدم و بستن
          </button>
        </div>
      </div>
    );
  }

  const handleDownloadMarkdown = () => {
    if (!canDownload) return;
    const markdownContent = `# کتابچه راهنما و دستورالعمل جامع کاربری سامانه ارزیابی عملکرد و مربیگری شرکت اصفهان چالاک
نسخه: ۲.۱ (ویرایش تولیدی ۱۴۰۵)
تهیه و تدوین: واحد سرمایه انسانی و توسعه سازمانی
کاربر دریافت‌کننده: ${currentUser?.name || 'کاربر سازمانی'} (${currentUser?.code || '-'})
تاریخ دریافت: ${new Date().toLocaleDateString('fa-IR')}

---

## فهرست فصول و مباحث:
۱. مقدمه، اهداف و فلسفه ارزیابی عملکرد
۲. ورود به سیستم، سطوح دسترسی (RBAC) و مدیریت کاربری
۳. راهنمای گام‌به‌گام داشبورد ارزیابی، رادار شایستگی‌ها و تقویم عملیاتی
۴. فرآیند تکمیل کارنامه عملکرد و خودارزیابی پرسنل
۵. گردش کار تاییدات و سیکل ۷ مرحله‌ای عملکرد
۶. ماژول اهداف OKR، جلسات ۱به۱ و بازخورد Lattice
۷. ماژول پایش زمان و بهره‌وری کارکرد (Kickidler)
۸. بانک شاخص‌های کمی (KPI) و شایستگی‌های رفتاری
۹. شناسنامه و پروفایل‌های شغلی
۱۰. مدیریت پرونده پرسنلی، اکسل و حذف ایمن
۱۱. کالیبراسیون سازمانی و توزیع نرمال نمرات
۱۲. ماتریس استعدادیابی ۹-Box و جانشین‌پروری
۱۳. مرکز مدیریت، امنیت و پیکربندی مجوزها
۱۴. آموزش بدو ورود، آزمون‌ها و صدور گواهینامه
۱۵. سوالات متداول و عیب‌یابی سامانه

---
(جهت مطالعه متن کامل، لطفاً نسخه چاپی PDF را از داخل سامانه استخراج نمایید.)
`;
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'راهنمای_جامع_سامانه_ارزیابی_عملکرد_اصفهان_چالاک.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="comprehensive-manual-title" className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-start overflow-y-auto p-2 sm:p-4 md:p-6 print:p-0 print:bg-white print:static print:overflow-visible">
      
      {/* Protection against unauthorized print if download is forbidden */}
      {!canDownload && (
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body, #printable-manual-document {
              display: none !important;
            }
          }
        ` }} />
      )}

      {/* Top Floating Control Bar - Hidden when printing */}
      <div className="no-print w-full max-w-5xl bg-slate-900/90 border border-slate-700/70 rounded-2xl p-3 sm:p-4 mb-4 shadow-2xl flex flex-wrap items-center justify-between gap-3 sticky top-2 z-40 backdrop-blur-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 id="comprehensive-manual-title" className="text-sm sm:text-base font-black text-slate-100">کتابچه راهنما و مرجع جامع کاربری</h2>
              {canDownload ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  نسخه PDF آماده چاپ
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  فقط مشاهده آنلاین
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">دستورالعمل قدم‌به‌قدم کار با تمام ۱۲ ماژول سامانه اصفهان چالاک</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو در بخش‌ها..."
              className="pr-8 pl-3 py-1.5 rounded-xl bg-slate-800 text-slate-200 text-xs border border-slate-700 focus:outline-none focus:border-teal-500 w-32 sm:w-44 placeholder:text-slate-500"
            />
          </div>

          {/* Admin Access Settings Toggle Button */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setIsConfigOpen(!isConfigOpen)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isConfigOpen 
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20' 
                  : 'bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30'
              }`}
              title="مدیریت دسترسی و تعیین چه کسانی می‌توانند کتابچه را ببینند یا دانلود کنند"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>دسترسی‌ها (ادمین)</span>
            </button>
          )}

          {canDownload ? (
            <>
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all shadow-lg shadow-teal-600/20 cursor-pointer"
                title="چاپ یا ذخیره به صورت فایل PDF"
              >
                <Printer className="w-4 h-4" />
                <span>چاپ / دانلود PDF</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadMarkdown}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
                title="دانلود نسخه متنی مارک‌داون"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">دانلود متنی</span>
              </button>
            </>
          ) : (
            <div 
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-bold"
              title="دانلود فایل توسط مدیر سیستم برای حساب شما غیرفعال شده است"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>دانلود محدود است</span>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="بستن پنجره راهنما"
            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 transition-all cursor-pointer"
            title="بستن پنجره راهنما"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ADMIN INLINE ACCESS POLICY CONFIGURATION PANEL */}
      {isAdmin && isConfigOpen && (
        <div className="no-print w-full max-w-5xl bg-slate-900 border-2 border-amber-500/40 rounded-3xl p-5 mb-4 shadow-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-200" dir="rtl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
                  <span>پیکربندی سیاست دسترسی به کتابچه راهنما (ویژه ادمین)</span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-md font-mono">RBAC Policy</span>
                </h3>
                <p className="text-[11px] text-slate-400">تعیین دقیق اینکه چه کسانی می‌توانند کتابچه را مشاهده کنند و چه کسانی حق دانلود PDF دارند</p>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-slate-400 font-bold">الگوهای آماده:</span>
              <button
                type="button"
                onClick={() => handleApplyPreset('all')}
                className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-all cursor-pointer"
                title="همه کاربران می‌توانند مشاهده و دانلود کنند"
              >
                عمومی (همگان)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('standard')}
                className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 transition-all cursor-pointer"
                title="پرسنل فقط مشاهده آنلاین، سرپرستان و ادمین مشاهده + دانلود"
              >
                استاندارد سازمانی
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('supervisors')}
                className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 transition-all cursor-pointer"
                title="فقط سرپرستان و ادمین مجاز هستند"
              >
                فقط سرپرستان
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('admin_only')}
                className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-all cursor-pointer"
                title="فقط ادمین سیستم مجاز است"
              >
                محرمانه (فقط ادمین)
              </button>
            </div>
          </div>

          {configFeedback && (
            <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{configFeedback}</span>
            </div>
          )}

          {/* Permissions Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* 1. VIEW ACCESS CARD */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                  <Eye className="w-4 h-4 text-teal-400" />
                  <span>۱. مجوز مشاهده و باز کردن کتابچه</span>
                </div>
                <span className="text-[10px] text-teal-400 font-mono">View Permission</span>
              </div>

              <div className="space-y-2.5 text-xs">
                {/* Admin */}
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-slate-800">
                  <span className="text-slate-300 font-medium">مدیر ارشد سیستم (Admin)</span>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    همیشه مجاز (سیستمی)
                  </span>
                </div>

                {/* Supervisor */}
                <label className="flex items-center justify-between p-2 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 cursor-pointer transition-all">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox"
                      checked={policy.allowedRolesToView.includes('supervisor')}
                      onChange={() => handleToggleViewRole('supervisor')}
                      className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-800 focus:ring-teal-500 cursor-pointer"
                    />
                    <span className="text-slate-200 font-bold">سرپرستان خط و واحدهای کارگاه</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    policy.allowedRolesToView.includes('supervisor') 
                      ? 'text-teal-400 bg-teal-500/10' 
                      : 'text-rose-400 bg-rose-500/10'
                  }`}>
                    {policy.allowedRolesToView.includes('supervisor') ? 'مجاز به مشاهده' : 'مسدود شده'}
                  </span>
                </label>

                {/* Employee */}
                <label className="flex items-center justify-between p-2 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 cursor-pointer transition-all">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox"
                      checked={policy.allowedRolesToView.includes('employee')}
                      onChange={() => handleToggleViewRole('employee')}
                      className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-800 focus:ring-teal-500 cursor-pointer"
                    />
                    <span className="text-slate-200 font-bold">کارمندان، اپراتورها و تکنسین‌ها</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    policy.allowedRolesToView.includes('employee') 
                      ? 'text-teal-400 bg-teal-500/10' 
                      : 'text-rose-400 bg-rose-500/10'
                  }`}>
                    {policy.allowedRolesToView.includes('employee') ? 'مجاز به مشاهده' : 'مسدود شده'}
                  </span>
                </label>
              </div>
            </div>

            {/* 2. DOWNLOAD & PRINT ACCESS CARD */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                  <Download className="w-4 h-4 text-amber-400" />
                  <span>۲. مجوز دانلود فایل و چاپ PDF</span>
                </div>
                <span className="text-[10px] text-amber-400 font-mono">Download & Print</span>
              </div>

              <div className="space-y-2.5 text-xs">
                {/* Admin */}
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-slate-800">
                  <span className="text-slate-300 font-medium">مدیر ارشد سیستم (Admin)</span>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    همیشه مجاز (سیستمی)
                  </span>
                </div>

                {/* Supervisor */}
                <label className="flex items-center justify-between p-2 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 cursor-pointer transition-all">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox"
                      checked={policy.allowedRolesToDownload.includes('supervisor')}
                      onChange={() => handleToggleDownloadRole('supervisor')}
                      className="w-4 h-4 text-amber-500 rounded border-slate-700 bg-slate-800 focus:ring-amber-500 cursor-pointer"
                    />
                    <span className="text-slate-200 font-bold">سرپرستان خط و واحدهای کارگاه</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    policy.allowedRolesToDownload.includes('supervisor') 
                      ? 'text-emerald-400 bg-emerald-500/10' 
                      : 'text-amber-400 bg-amber-500/10'
                  }`}>
                    {policy.allowedRolesToDownload.includes('supervisor') ? 'دانلود PDF مجاز' : 'فقط مشاهده'}
                  </span>
                </label>

                {/* Employee */}
                <label className="flex items-center justify-between p-2 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 cursor-pointer transition-all">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox"
                      checked={policy.allowedRolesToDownload.includes('employee')}
                      onChange={() => handleToggleDownloadRole('employee')}
                      className="w-4 h-4 text-amber-500 rounded border-slate-700 bg-slate-800 focus:ring-amber-500 cursor-pointer"
                    />
                    <span className="text-slate-200 font-bold">کارمندان، اپراتورها و تکنسین‌ها</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    policy.allowedRolesToDownload.includes('employee') 
                      ? 'text-emerald-400 bg-emerald-500/10' 
                      : 'text-amber-400 bg-amber-500/10'
                  }`}>
                    {policy.allowedRolesToDownload.includes('employee') ? 'دانلود PDF مجاز' : 'فقط مشاهده'}
                  </span>
                </label>
              </div>
            </div>

          </div>

          {/* Footer Security Watermark & Confirmation */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-800 text-xs">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input 
                type="checkbox" 
                checked={policy.showWatermark} 
                onChange={(e) => {
                  const updated = { ...policy, showWatermark: e.target.checked };
                  setPolicy(updated);
                  saveManualAccessPolicy(updated, currentUser?.name || 'مدیر سیستم');
                  triggerFeedback('وضعیت واترمارک ذخیره شد.');
                }}
                className="w-4 h-4 text-teal-500 rounded border-slate-700 bg-slate-800 focus:ring-teal-500 cursor-pointer" 
              />
              <span>درج واترمارک امنیتی هوشمند (نام پرسنل، کد پرسنلی و تاریخ استخراج در پایین صفحات چاپی)</span>
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsConfigOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition-all cursor-pointer shadow-md shadow-teal-600/20"
              >
                تأیید و بستن تنظیمات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Printable Document Canvas */}
      <div 
        id="printable-manual-document"
        className="w-full max-w-5xl bg-white text-slate-900 rounded-3xl p-6 sm:p-10 md:p-14 shadow-2xl space-y-10 border border-slate-200 print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none print:rounded-none font-sans"
        dir="rtl"
      >
        {/* Printable Watermark Bar (Visible only when printed) */}
        {policy.showWatermark && (
          <div className="hidden print:flex items-center justify-between text-[9px] text-slate-500 border-b border-slate-300 pb-1 mb-6 font-mono">
            <span>شرکت تولیدی و صنعتی اصفهان چالاک - سند راهنمای رسمی (داخلی و محرمانه)</span>
            <span>گیرنده مجاز نسخه: {currentUser?.name || 'کاربر سیستم'} ({currentUser?.code || '-'}) | زمان استخراج: {new Date().toLocaleDateString('fa-IR')}</span>
          </div>
        )}

        {/* =========================================================================
            COVER & TITLE PAGE
           ========================================================================= */}
        <header className="border-b-4 border-teal-600 pb-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-teal-600 text-white flex items-center justify-center font-black text-2xl shadow-lg shadow-teal-600/30">
                چ
              </div>
              <div>
                <span className="text-xs font-extrabold text-teal-700 tracking-wider">شرکت تولیدی و صنعتی اصفهان چالاک</span>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-950 mt-0.5">
                  کتابچه راهنمای جامع کاربری و مرجع عملیاتی سامانه ارزیابی عملکرد
                </h1>
                <p className="text-xs text-slate-600 mt-1">
                  راهنمای گام‌به‌گام پایش بهره‌وری سازمانی، اهداف OKR، جلسات ۱به۱ مربیگری و ارزیابی شایستگی‌های شغلی
                </p>
              </div>
            </div>

            <div className="text-left text-xs text-slate-500 border-r-2 sm:border-r-0 sm:border-l-2 border-teal-500/30 pr-3 sm:pr-0 sm:pl-3 space-y-1">
              <p><strong className="text-slate-800">کد سند:</strong> SOP-HR-EVAL-1405</p>
              <p><strong className="text-slate-800">نسخه سیستم:</strong> 2.1</p>
              <p><strong className="text-slate-800">تاریخ بازبینی:</strong> ۲۵ شهریور ۱۴۰۵</p>
              <p><strong className="text-slate-800">وضعیت:</strong> مصوب و لازم‌الاجرا</p>
            </div>
          </div>

          {/* Quick Meta Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-right">
              <span className="text-[11px] text-slate-500 block font-medium">مخاطبین اصلی</span>
              <span className="text-xs font-black text-slate-900 mt-0.5 block">کلیه مدیران، سرپرستان و پرسنل</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-right">
              <span className="text-[11px] text-slate-500 block font-medium">پوشش ماژول‌ها</span>
              <span className="text-xs font-black text-teal-700 mt-0.5 block">۱۲ ماژول تخصصی و یکپارچه</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-right">
              <span className="text-[11px] text-slate-500 block font-medium">مدل ارزیابی</span>
              <span className="text-xs font-black text-slate-900 mt-0.5 block">ترکیبی (KPI کمی + شایستگی کیفی)</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-right">
              <span className="text-[11px] text-slate-500 block font-medium">هدف کلیدی</span>
              <span className="text-xs font-black text-emerald-700 mt-0.5 block">رشد فردی، بهره‌وری و شایسته‌سالاری</span>
            </div>
          </div>
        </header>

        {/* =========================================================================
            TABLE OF CONTENTS
           ========================================================================= */}
        <section className="bg-teal-50/60 border border-teal-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-teal-900 font-black text-sm">
            <Layers className="w-4 h-4 text-teal-700" />
            <span>فهرست تفصیلی فصول کتابچه راهنما</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs text-slate-700">
            <a href="#sec-1" className="hover:text-teal-700 hover:underline">فصل ۱: مقدمه و فلسفه ارزیابی عملکرد چالاک</a>
            <a href="#sec-2" className="hover:text-teal-700 hover:underline">فصل ۲: سطوح دسترسی و نقشه راه کاربران (RBAC)</a>
            <a href="#sec-3" className="hover:text-teal-700 hover:underline">فصل ۳: سیکل استاندارد ۷ مرحله‌ای عملکرد</a>
            <a href="#sec-4" className="hover:text-teal-700 hover:underline">فصل ۴: داشبورد ارزیابی و ویجت تقویم</a>
            <a href="#sec-5" className="hover:text-teal-700 hover:underline">فصل ۵: کارنامه پرسنل و راهنمای خودارزیابی</a>
            <a href="#sec-6" className="hover:text-teal-700 hover:underline">فصل ۶: کارنامه‌های عملکرد و ارزیابی سرپرست</a>
            <a href="#sec-7" className="hover:text-teal-700 hover:underline">فصل ۷: گردش کار، کارتابل تاییدات و هشدارها</a>
            <a href="#sec-8" className="hover:text-teal-700 hover:underline">فصل ۸: اهداف OKR، جلسات ۱به۱ و تمجید (Lattice)</a>
            <a href="#sec-9" className="hover:text-teal-700 hover:underline">فصل ۹: پایش زمان و بهره‌وری کارکرد (Kickidler)</a>
            <a href="#sec-10" className="hover:text-teal-700 hover:underline">فصل ۱۰: بانک شاخص‌های کمی (KPI) و فرمول‌ها</a>
            <a href="#sec-11" className="hover:text-teal-700 hover:underline">فصل ۱۱: پروفایل‌های شغلی و شایستگی‌ها</a>
            <a href="#sec-12" className="hover:text-teal-700 hover:underline">فصل ۱۲: مدیریت پرسنل، اکسل و حذف ایمن</a>
            <a href="#sec-13" className="hover:text-teal-700 hover:underline">فصل ۱۳: کمیته کالیبراسیون و توزیع نرمال</a>
            <a href="#sec-14" className="hover:text-teal-700 hover:underline">فصل ۱۴: ماتریس ۹-Box و برنامه‌ریزی جانشینی</a>
            <a href="#sec-15" className="hover:text-teal-700 hover:underline">فصل ۱۵: مرکز مدیریت، امنیت و رمزهای عبور</a>
            <a href="#sec-16" className="hover:text-teal-700 hover:underline">فصل ۱۶: آموزش بدو ورود و کسب گواهینامه</a>
            <a href="#sec-17" className="hover:text-teal-700 hover:underline">فصل ۱۷: سوالات متداول (FAQ) و خطایابی سریع</a>
          </div>
        </section>

        {/* =========================================================================
            CHAPTER 1: INTRODUCTION & PHILOSOPHY
           ========================================================================= */}
        <section id="sec-1" className="space-y-4 pt-4">
          <div className="flex items-center gap-2 border-r-4 border-teal-600 pr-3">
            <h2 className="text-lg sm:text-xl font-black text-slate-900">فصل ۱: مقدمه و فلسفه ارزیابی عملکرد در شرکت اصفهان چالاک</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed text-justify">
            سامانه ارزیابی عملکرد و مربیگری شرکت اصفهان چالاک، با هدف گذر از فرآیندهای سنتی، سلیقه‌ای و مقطعی ارزیابی به یک مدل نوین، شفاف، داده‌محور و پیوسته طراحی و توسعه یافته است. در این مدل، ارزیابی عملکرد صرفاً ابزاری برای سنجش پایانی نیست؛ بلکه پیشرانی برای <strong>توسعه فردی پرسنل، تقویت مهارت‌های کارگاهی، هم‌راستاسازی اهداف عملیاتی با چشم‌انداز کارخانه و ایجاد فرهنگ گفت‌وگوی سازنده (Coaching)</strong> میان سرپرستان خطوط تولید و اپراتورهاست.
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-teal-600" />
              سه اصل بنیادین سیستم ارزیابی اصفهان چالاک:
            </h4>
            <ul className="list-disc list-inside space-y-1 text-slate-700 pr-2">
              <li><strong>شفافیت کامل شاخص‌ها:</strong> هر همکار از روز اول کاری می‌داند بر چه مبنایی ارزیابی می‌شود (شاخص‌های کمی، شایستگی‌های رفتاری و اوزان مصوب).</li>
              <li><strong>حق خودارزیابی و شنیده‌شدن دیدگاه همکار:</strong> پرسنل قبل از سرپرست، عملکرد و دستاوردهای خود را ثبت و نمره‌دهی می‌کنند.</li>
              <li><strong>مربیگری و بهبود مستمر (نه مچ‌گیری):</strong> تمرکز اصلی بر برگزاری جلسات منظم ۱به۱ و تدوین برنامه‌های اقدام ملموس برای رفع نقاط ضعف است.</li>
            </ul>
          </div>
        </section>

        {/* =========================================================================
            CHAPTER 2: RBAC & ROLES
           ========================================================================= */}
        <section id="sec-2" className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2 border-r-4 border-indigo-600 pr-3">
            <h2 className="text-lg sm:text-xl font-black text-slate-900">فصل ۲: سطوح دسترسی و نقشه راه نقش‌های کاربری (RBAC)</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed text-justify">
            سامانه دارای سه نقش اصلی است که هر کدام منوها، ویجت‌ها و امکانات متناسب با مسئولیت‌های سازمانی خود را مشاهده می‌کنند:
          </p>
          
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden text-right">
              <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">نقش کاربری</th>
                  <th className="p-3">عنوان سازمانی نمونه</th>
                  <th className="p-3">منوها و اختیارات مجاز</th>
                  <th className="p-3">اقدامات کلیدی</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr className="bg-white">
                  <td className="p-3 font-bold text-teal-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-teal-600" />
                    مدیر منابع انسانی (Admin)
                  </td>
                  <td className="p-3">مدیر کارخانه، رئیس منابع انسانی</td>
                  <td className="p-3">دسترسی تام به تمامی ۱۲ ماژول، کالیبراسیون، تنظیمات امنیتی، بانک شاخص‌ها، ماتریس ۹-Box و مدیریت کارکنان</td>
                  <td className="p-3">تعریف دوره‌ها، تنظیم وزن‌ها، نظارت بر کالیبراسیون، مدیریت رمزها و کاربران، استخراج گزارشات مدیریتی</td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="p-3 font-bold text-indigo-800 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-indigo-600" />
                    سرپرست خط / واحد (Supervisor)
                  </td>
                  <td className="p-3">سرپرست تولید، مدیر کنترل کیفیت، سرپرست انبار</td>
                  <td className="p-3">داشبورد واحد، کارنامه‌های عملکرد زیرمجموعه، گردش کار، اهداف OKR، پایش Kickidler، تقویم عملیاتی</td>
                  <td className="p-3">ارزیابی عملکرد پرسنل واحد، برگزاری جلسات ۱به۱، تعیین اهداف فصلی، تایید یا عودت خودارزیابی‌ها</td>
                </tr>
                <tr className="bg-white">
                  <td className="p-3 font-bold text-amber-800 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-amber-600" />
                    پرسنل و اپراتور (Employee)
                  </td>
                  <td className="p-3">اپراتور دستگاه، تکنسین آزمایشگاه، کارشناس اداری</td>
                  <td className="p-3">کارنامه و خودارزیابی من، اهداف OKR من، جلسات ۱به۱، بازخورد و تمجید همکاران، آموزش بدو ورود</td>
                  <td className="p-3">تکمیل فرم خودارزیابی فصلی، مشاهده کارنامه و نمرات، پیگیری اهداف فردی، شرکت در آزمون‌های آموزشی</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* =========================================================================
            CHAPTER 3: STANDARD 7-STEP CYCLE
           ========================================================================= */}
        <section id="sec-3" className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2 border-r-4 border-emerald-600 pr-3">
            <h2 className="text-lg sm:text-xl font-black text-slate-900">فصل ۳: سیکل استاندارد ۷ مرحله‌ای ارزیابی عملکرد</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed text-justify">
            هر دوره ارزیابی (فصلی یا ۶ ماهه) از یک گردش کار شفاف و پیوسته پیروی می‌کند تا عدالت ارزیابی و دقت سنجش تضمین گردد:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-bold inline-flex items-center justify-center text-[10px]">۱</span>
              <h5 className="font-bold text-slate-900">تعریف و ابلاغ اهداف (OKR)</h5>
              <p className="text-[11px] text-slate-600">تعیین اهداف کلیدی فصل با توافق سرپرست و پرسنل و تخصیص شاخص‌های KPI.</p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-bold inline-flex items-center justify-center text-[10px]">۲</span>
              <h5 className="font-bold text-slate-900">پایش پیوسته و ۱به۱</h5>
              <p className="text-[11px] text-slate-600">برگزاری جلسات ماهانه مربیگری و ثبت پیشرفت اقدامات و تمجید دستاوردها.</p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-bold inline-flex items-center justify-center text-[10px]">۳</span>
              <h5 className="font-bold text-slate-900">تکمیل خودارزیابی</h5>
              <p className="text-[11px] text-slate-600">ورود نمرات و توضیحات پرسنل در صفحه «کارنامه من» و ارسال برای سرپرست.</p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-bold inline-flex items-center justify-center text-[10px]">۴</span>
              <h5 className="font-bold text-slate-900">ارزیابی توسط سرپرست</h5>
              <p className="text-[11px] text-slate-600">بررسی عملکرد، ثبت نمرات سرپرست، ارائه شواهد عینی و تعیین اهداف توسعه.</p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-bold inline-flex items-center justify-center text-[10px]">۵</span>
              <h5 className="font-bold text-slate-900">کالیبراسیون نمرات</h5>
              <p className="text-[11px] text-slate-600">انطباق نمرات با منحنی توزیع نرمال جهت حذف سوگیری‌های احتمالی سرپرستان.</p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-bold inline-flex items-center justify-center text-[10px]">۶</span>
              <h5 className="font-bold text-slate-900">جلسه بازخورد نهایی</h5>
              <p className="text-[11px] text-slate-600">گفت‌وگوی حضوری سرپرست و پرسنل، امضای کارنامه و بررسی نقاط قوت و فرصت‌ها.</p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-bold inline-flex items-center justify-center text-[10px]">۷</span>
              <h5 className="font-bold text-slate-900">برنامه توسعه فردی (IDP)</h5>
              <p className="text-[11px] text-slate-600">ثبت دوره‌های آموزشی، پاداش‌های شایستگی و آمادگی برای دوره بعدی ارزیابی.</p>
            </div>
          </div>
        </section>

        {/* =========================================================================
            CHAPTER 4: DASHBOARD & CALENDAR
           ========================================================================= */}
        <section id="sec-4" className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2 border-r-4 border-sky-600 pr-3">
            <h2 className="text-lg sm:text-xl font-black text-slate-900">فصل ۴: راهنمای داشبورد ارزیابی و تقویم عملیاتی</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed text-justify">
            داشبورد سامانه، نمای ۳۶۰ درجه و زنده از وضعیت ارزیابی سازمان و واحدهاست. این بخش شامل موارد زیر است:
          </p>
          <div className="space-y-3 text-xs text-slate-700">
            <div className="p-3 bg-sky-50/50 border border-sky-200 rounded-xl">
              <h4 className="font-bold text-sky-900">۱. کارت‌های کلیدی شاخص‌ها (Top KPI Cards):</h4>
              <p className="mt-1 text-slate-600">نمایش تعداد شاخص‌های فعال بانک، پروفایل‌های شغلی مصوب، کل پرسنل و میانگین نمره نهایی کالیبره شده سازمان.</p>
            </div>
            <div className="p-3 bg-sky-50/50 border border-sky-200 rounded-xl">
              <h4 className="font-bold text-sky-900">۲. رادار شایستگی‌های سازمان (Radar Chart D3):</h4>
              <p className="mt-1 text-slate-600">نمایش همزمان ۶ بعد شایستگی (کیفیت، ایمنی، فنی، رفتاری، بهره‌وری و کار تیمی) و مقایسه سطح میانگین پرسنل با حد استاندارد شرکت.</p>
            </div>
            <div className="p-3 bg-sky-50/50 border border-sky-200 rounded-xl">
              <h4 className="font-bold text-sky-900">۳. تحلیل هوشمند رشد شایستگی‌ها (Smart Growth Analytics):</h4>
              <p className="mt-1 text-slate-600">نمودار روند تاریخی، تحلیل تغییرات در دوره‌های متوالی و پیش‌بینی وضعیت مربیگری برای فصول آینده.</p>
            </div>
            <div className="p-3 bg-sky-50/50 border border-sky-200 rounded-xl">
              <h4 className="font-bold text-sky-900">۴. تقویم عملیاتی سرپرستان (Calendar Widget):</h4>
              <p className="mt-1 text-slate-600">مشاهده سررسیدهای تکمیل ارزیابی، تاریخ جلسات کالیبراسیون و رویدادهای فصلی با قابلیت ثبت و فیلتر رویدادهای جدید.</p>
            </div>
          </div>
        </section>

        {/* =========================================================================
            CHAPTER 5: MY EVALUATION (FOR EMPLOYEES)
           ========================================================================= */}
        <section id="sec-5" className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2 border-r-4 border-amber-600 pr-3">
            <h2 className="text-lg sm:text-xl font-black text-slate-900">فصل ۵: راهنمای کارنامه و خودارزیابی من (ویژه همکاران و اپراتورها)</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed text-justify">
            هر همکار با ورود به حساب کاربری خود، بلافاصله وارد صفحه اختصاصی «کارنامه و خودارزیابی من» می‌شود. مراحل کار به این شرح است:
          </p>
          <div className="space-y-2 text-xs text-slate-700">
            <div className="flex items-start gap-2 bg-amber-50/60 p-3 rounded-xl border border-amber-200">
              <span className="font-black text-amber-800 shrink-0">گام اول:</span>
              <p>مشاهده دوره ارزیابی فعال و فهرست معیارهای تخصیص‌یافته بر اساس شغل (مثلاً راندمان، دقت و مهارت کارگاهی).</p>
            </div>
            <div className="flex items-start gap-2 bg-amber-50/60 p-3 rounded-xl border border-amber-200">
              <span className="font-black text-amber-800 shrink-0">گام دوم:</span>
              <p>ورود امتیاز خودارزیابی برای هر معیار (از ۰ تا ۱۰۰ یا سطح شایستگی) به همراه ثبت توضیحات درباره موفقیت‌ها یا چالش‌های تجربه شده.</p>
            </div>
            <div className="flex items-start gap-2 bg-amber-50/60 p-3 rounded-xl border border-amber-200">
              <span className="font-black text-amber-800 shrink-0">گام سوم:</span>
              <p>کلیک روی دکمه «ثبت نهایی خودارزیابی و ارسال به سرپرست». پس از این مرحله، وضعیت پرونده به «در انتظار ارزیابی سرپرست» تغییر می‌یابد.</p>
            </div>
            <div className="flex items-start gap-2 bg-amber-50/60 p-3 rounded-xl border border-amber-200">
              <span className="font-black text-amber-800 shrink-0">گام چهارم:</span>
              <p>مشاهده بازخورد نهایی، نمره سرپرست، نمره کالیبره شده و دریافت کارنامه رسمی پس از اتمام دوره.</p>
            </div>
          </div>
        </section>

        {/* =========================================================================
            CHAPTER 6 & 7: EVALUATION SHEETS & WORKFLOW
           ========================================================================= */}
        <section id="sec-6" className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2 border-r-4 border-teal-700 pr-3">
            <h2 className="text-lg sm:text-xl font-black text-slate-900">فصل ۶ و ۷: کارنامه‌های عملکرد، نمره‌دهی سرپرستان و گردش کار تاییدات</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed text-justify">
            سرپرستان محترم از طریق تب «کارنامه‌های عملکرد» و «گردش کار و تاییدات»، فرآیند ارزیابی نیروهای تحت سرپرستی خود را به انجام می‌رسانند:
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 text-xs">
            <h4 className="font-bold text-slate-900">فرمول محاسبه نمره کل کارنامه:</h4>
            <div className="bg-white p-3 rounded-xl border border-slate-300 font-mono text-center text-teal-800 font-bold text-xs sm:text-sm">
              نمره کل = مجموع (نمره معیار × ضریب وزن معیار) ÷ مجموع اوزان
            </div>
            <p className="text-slate-600 leading-relaxed">
              سیستم به صورت بلادرنگ میانگین موزون را محاسبه کرده و رده عملکردی (Grade) را بر مبنای جدول استاندارد زیر تعیین می‌کند:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-[11px]">
              <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                <span className="font-bold text-emerald-800 block">رده A+ (عالی)</span>
                <span className="text-slate-600">امتیاز ۹۰ تا ۱۰۰</span>
              </div>
              <div className="p-2 bg-teal-50 border border-teal-200 rounded-lg">
                <span className="font-bold text-teal-800 block">رده A (خیلی خوب)</span>
                <span className="text-slate-600">امتیاز ۸۰ تا ۸۹.۹</span>
              </div>
              <div className="p-2 bg-sky-50 border border-sky-200 rounded-lg">
                <span className="font-bold text-sky-800 block">رده B (خوب و استاندارد)</span>
                <span className="text-slate-600">امتیاز ۷۰ تا ۷۹.۹</span>
              </div>
              <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg">
                <span className="font-bold text-amber-800 block">رده C (نیازمند بهبود)</span>
                <span className="text-slate-600">امتیاز ۶۰ تا ۶۹.۹</span>
              </div>
              <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg">
                <span className="font-bold text-rose-800 block">رده D (ضعیف / بحرانی)</span>
                <span className="text-slate-600">کمتر از ۶۰</span>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            CHAPTER 8: LATTICE HUB (OKRs, 1-on-1, FEEDBACK)
           ========================================================================= */}
        <section id="sec-8" className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2 border-r-4 border-rose-600 pr-3">
            <h2 className="text-lg sm:text-xl font-black text-slate-900">فصل ۸: مدیریت اهداف OKR، جلسات ۱به۱ و تمجید (Lattice Hub)</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed text-justify">
            ماژول Lattice، بازوی مربیگری پیوسته سازمان است و مانع از خلاصه شدن ارزیابی در یک نمره پایان فصل می‌شود. این بخش شامل سه رکن است:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-4 bg-rose-50/40 border border-rose-200 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-rose-800 font-bold">
                <Target className="w-4 h-4" />
                <span>اهداف و نتایج کلیدی (OKRs)</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                تعریف اهداف فصلی، وزن‌دهی به نتایج کلیدی (Key Results) و به‌روزرسانی مستمر درصد پیشرفت توسط پرسنل و سرپرست.
              </p>
            </div>

            <div className="p-4 bg-rose-50/40 border border-rose-200 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-rose-800 font-bold">
                <Users className="w-4 h-4" />
                <span>جلسات ۱به۱ (1-on-1 Meetings)</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                ثبت تاریخ جلسه مربیگری، دستور کار، چالش‌های پرسنل، اقدامات توافق‌شده (Action Items) و پیگیری در جلسه بعد.
              </p>
            </div>

            <div className="p-4 bg-rose-50/40 border border-rose-200 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-rose-800 font-bold">
                <Sparkles className="w-4 h-4" />
                <span>تمجید و بازخورد همکاران (Praise)</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                ارسال پیام تقدیر و تشویق برای همکاران بابت دستاوردهای تیمی با تگ‌های ارزش‌های چالاک (ایمنی، نوآوری و تعهد).
              </p>
            </div>
          </div>
        </section>

        {/* =========================================================================
            CHAPTER 9: KICKIDLER HUB (TIME & PRODUCTIVITY)
           ========================================================================= */}
        <section id="sec-9" className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2 border-r-4 border-purple-600 pr-3">
            <h2 className="text-lg sm:text-xl font-black text-slate-900">فصل ۹: پایش زمان و بهره‌وری کارکرد پرسنل (Kickidler Hub)</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed text-justify">
            ماژول Kickidler ابزار مانیتورینگ کارکرد و بهره‌وری زمان پرسنل کارخانه و دفاتر است:
          </p>
          <div className="bg-purple-50/40 border border-purple-200 rounded-2xl p-4 space-y-2 text-xs text-slate-700">
            <ul className="list-disc list-inside space-y-1.5 leading-relaxed">
              <li><strong>تفکیک ساعات کاری:</strong> نمایش زمان کار مفید (Productive)، زمان غیرمفید (Unproductive) و زمان‌های وقفه (Idle/Break).</li>
              <li><strong>شاخص نرخ تمرکز (Efficiency Rate):</strong> محاسبه درصد فعالیت مفید اپراتورها در خطوط تولید و شیفت‌ها.</li>
              <li><strong>گزارش‌های مقایسه‌ای واحدها:</strong> مقایسه عملکرد شیفت صبح، عصر و شب با میانگین‌های استاندارد تولید شرکت اصفهان چالاک.</li>
            </ul>
          </div>
        </section>

        {/* =========================================================================
            CHAPTER 10 & 11: CRITERIA & JOB PROFILES
           ========================================================================= */}
        <section id="sec-10" className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2 border-r-4 border-teal-600 pr-3">
            <h2 className="text-lg sm:text-xl font-black text-slate-900">فصل ۱۰ و ۱۱: بانک شاخص‌های کمی (KPI) و شناسنامه پروفایل‌های شغلی</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed text-justify">
            این بخش‌ها هسته پیکربندی استانداردهای ارزیابی شرکت هستند:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <h4 className="font-bold text-teal-800 flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-teal-600" />
                بانک شاخص‌های عملکردی (Criteria Bank):
              </h4>
              <p className="text-slate-600 leading-relaxed">
                تعریف معیارهای کمی و کیفی با مشخص کردن دسته‌بندی (فنی، ایمنی، کیفی، رفتاری)، مقادیر حداقل و حداکثر، ضرایب پیش‌فرض و راهنمای ارزیابی سرپرست.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <h4 className="font-bold text-teal-800 flex items-center gap-1.5">
                <Briefcase className="w-4 h-4 text-teal-600" />
                پروفایل‌های شغلی (Job Profiles):
              </h4>
              <p className="text-slate-600 leading-relaxed">
                نگاشت معیارهای بانک شاخص‌ها به عناوین شغلی کارخانه (نظیر اپراتور خط، کنترل کیفیت، انباردار و...) همراه با تخصیص وزن‌های اختصاصی متناسب با شغل.
              </p>
            </div>
          </div>
        </section>

        {/* =========================================================================
            CHAPTER 12: EMPLOYEES & SECURE DELETION
           ========================================================================= */}
        <section id="sec-12" className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2 border-r-4 border-emerald-600 pr-3">
            <h2 className="text-lg sm:text-xl font-black text-slate-900">فصل ۱۲: مدیریت کارکنان، تبادل اکسل و حذف ایمن پرونده‌ها</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed text-justify">
            بخش «مدیریت کارکنان» مرکز نگهداری پایگاه داده پرسنلی است:
          </p>
          <div className="space-y-2 text-xs text-slate-700">
            <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-1">
              <h4 className="font-bold text-emerald-900">۱. افزودن تکی یا دسته‌جمعی از اکسل (Excel Bulk Import/Export):</h4>
              <p className="text-slate-600">امکان بارگذاری فایل اکسل پرسنل با اعتبارسنجی خودکار ستون‌ها و همچنین دانلود خروجی استاندارد اکسل از کل پرسنل ثبت شده.</p>
            </div>
            <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-1">
              <h4 className="font-bold text-emerald-900">۲. سیاست محافظت دائمی از مدیر ارشد سیستم (Admin Security):</h4>
              <p className="text-slate-600">حساب کاربری ادمین سیستم به هیچ وجه قابل حذف نیست و آیکون حذف برای آن غیرفعال است تا دسترسی به سامانه هرگز مسدود نگردد.</p>
            </div>
            <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-1">
              <h4 className="font-bold text-emerald-900">۳. فرآیند حذف بدون خطای سایر پرسنل:</h4>
              <p className="text-slate-600">با کلیک روی سطل زباله هر پرسنل، پنجره تأیید هوشمند باز شده و با موافقت، پرونده، ارزیابی‌ها و رمزهای وابسته به شکل ایمن و پایدار از سامانه و دیتابیس پاکسازی می‌شوند.</p>
            </div>
          </div>
        </section>

        {/* =========================================================================
            CHAPTER 13 & 14: CALIBRATION & 9-BOX
           ========================================================================= */}
        <section id="sec-13" className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2 border-r-4 border-indigo-700 pr-3">
            <h2 className="text-lg sm:text-xl font-black text-slate-900">فصل ۱۳ و ۱۴: کالیبراسیون سازمانی و ماتریس استعدادیابی ۹-Box</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed text-justify">
            کالیبراسیون و ماتریس ۹-Box پیشرفته‌ترین ابزارهای تحلیلی سامانه جهت رعایت عدالت و شایسته‌سالاری هستند:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-indigo-50/40 border border-indigo-200 rounded-2xl space-y-2">
              <h4 className="font-bold text-indigo-900 flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-indigo-600" />
                کمیته کالیبراسیون نمرات (Calibration):
              </h4>
              <p className="text-slate-600 leading-relaxed">
                تحلیل انحراف معیار نمرات داده‌شده توسط سرپرستان مختلف با منحنی توزیع نرمال گاوسی (Bell Curve)، اصلاح سخت‌گیری یا سهل‌گیری و تایید نهایی قبل از ابلاغ به پرسنل.
              </p>
            </div>

            <div className="p-4 bg-indigo-50/40 border border-indigo-200 rounded-2xl space-y-2">
              <h4 className="font-bold text-indigo-900 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                ماتریس ۹-Box استعدادیابی و جانشینی:
              </h4>
              <p className="text-slate-600 leading-relaxed">
                دسته‌بندی پرسنل در ۹ خانه بر اساس محور عملکرد (Performance) و پتانسیل رشد (Potential) جهت تعیین ستارگان آینده، کاندیداهای ارتقا و برنامه‌های بازآموزی.
              </p>
            </div>
          </div>
        </section>

        {/* =========================================================================
            CHAPTER 15: SECURITY & RBAC MANAGEMENT
           ========================================================================= */}
        <section id="sec-15" className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2 border-r-4 border-rose-700 pr-3">
            <h2 className="text-lg sm:text-xl font-black text-slate-900">فصل ۱۵: مرکز مدیریت، امنیت و تعیین رمزهای عبور</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed text-justify">
            مدیر منابع انسانی در منوی «مرکز مدیریت و امنیت» قادر است:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-xs text-slate-700 pr-2">
            <li>رمز عبور هر کاربر را مشاهده، کپی، یا مستقیماً تغییر دهد.</li>
            <li>دسترسی‌های جزیی هر نقش را در ماتریس دسترسی‌ها (RBAC Matrix) به صورت فعال/غیرفعال تنظیم کند.</li>
            <li>وضعیت لاگین‌ها، خطاهای سیستم و رویدادهای امنیتی را پایش نماید.</li>
            <li>پایگاه داده را همگام‌سازی، بکاپ‌گیری یا بازنشانی نماید.</li>
          </ul>
        </section>

        {/* =========================================================================
            CHAPTER 16: ONBOARDING & EXAM
           ========================================================================= */}
        <section id="sec-16" className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2 border-r-4 border-teal-600 pr-3">
            <h2 className="text-lg sm:text-xl font-black text-slate-900">فصل ۱۶: آموزش بدو ورود، آزمون‌ها و صدور گواهینامه</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed text-justify">
            پرسنل جدیدالورود و همکاران می‌توانند با مطالعه اسلایدهای تعاملی و شرکت در آزمون تستی شایستگی، نشان معتبر <strong>«کارشناس تاییدشده عملکرد اصفهان چالاک»</strong> را دریافت کنند که به صورت خودکار در کنار نام آنها در سیستم درج می‌گردد.
          </p>
        </section>

        {/* =========================================================================
            CHAPTER 17: FAQ & TROUBLESHOOTING
           ========================================================================= */}
        <section id="sec-17" className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2 border-r-4 border-slate-800 pr-3">
            <h2 className="text-lg sm:text-xl font-black text-slate-900">فصل ۱۷: پرسش‌های متداول (FAQ) و نکات فنی</h2>
          </div>
          
          <div className="space-y-3 text-xs text-slate-700">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <h5 className="font-bold text-slate-900">سؤال: اگر رمز عبور خود را فراموش کنم چه باید کرد؟</h5>
              <p className="mt-1 text-slate-600">پاسخ: به مدیر منابع انسانی اطلاع دهید. مدیر می‌تواند در «مرکز مدیریت و امنیت» یک کلمه عبور جدید تنظیم کند؛ کلمه عبور قبلی قابل مشاهده یا بازیابی نیست.</p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <h5 className="font-bold text-slate-900">سؤال: چگونه آخرین تغییرات ثبت‌شده در مرورگر دیگر را دریافت کنم؟</h5>
              <p className="mt-1 text-slate-600">پاسخ: از دکمه «تازه‌سازی / همگام» در نوار بالای سامانه استفاده کنید. سامانه ابتدا تغییرات ذخیره‌نشده محلی را با ایمنی ارسال و سپس آخرین نسخه مجاز ابری را دریافت می‌کند؛ صفحه جاری تغییر نمی‌کند.</p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <h5 className="font-bold text-slate-900">نکته امنیتی کلمه عبور</h5>
              <p className="mt-1 text-slate-600">کلمه عبور باید حداقل ۸ کاراکتر باشد. آن را در پیام عمومی، گزارش یا فایل مشترک ثبت نکنید و پس از دریافت رمز تولیدشده، در نگهداری آن دقت کنید.</p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <h5 className="font-bold text-slate-900">سؤال: آیا خودارزیابی پس از ارسال قابل ویرایش است؟</h5>
              <p className="mt-1 text-slate-600">پاسخ: تا زمانی که سرپرست نمره خود را قفل نکرده باشد، با هماهنگی سرپرست و بازگردانی وضعیت پرونده در «گردش کار» امکان ویرایش مجدد فراهم است.</p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <h5 className="font-bold text-slate-900">سؤال: چگونه نسخه PDF این راهنما را در گوشی یا رایانه ذخیره کنم؟</h5>
              <p className="mt-1 text-slate-600">پاسخ: کافی است دکمه آبی‌رنگ «چاپ / دانلود PDF» در بالای همین پنجره را بفشارید و در پنجره چاپگر، گزینه «Save as PDF» (ذخیره به عنوان PDF) را انتخاب و ذخیره فرمایید.</p>
            </div>
          </div>
        </section>

        {/* =========================================================================
            DOCUMENT FOOTER & SIGN-OFF
           ========================================================================= */}
        <footer className="border-t-2 border-teal-600 pt-6 space-y-4 text-xs text-slate-500">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-right">
              <p className="font-bold text-slate-800">توسعه‌یافته برای شرکت تولیدی و صنعتی اصفهان چالاک</p>
              <p>کلیه حقوق مادی و معنوی این سامانه و متدولوژی ارزیابی متعلق به شرکت اصفهان چالاک می‌باشد.</p>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-center">
                <span className="block font-bold text-slate-700">تاییدکننده فنی</span>
                <span className="text-[10px] text-slate-400">واحد سیستم‌ها و روش‌ها</span>
              </div>
              <div className="text-center">
                <span className="block font-bold text-slate-700">تاییدکننده سازمانی</span>
                <span className="text-[10px] text-slate-400">مدیریت منابع انسانی</span>
              </div>
            </div>
          </div>

          <div className="text-center text-[10px] text-slate-400 border-t border-slate-200 pt-3">
            صفحه رسمی دستورالعمل و راهنمای جامع | سامانه ارزیابی عملکرد و مربیگری اصفهان چالاک ۱۴۰۵
          </div>
        </footer>

      </div>

    </div>
  );
}

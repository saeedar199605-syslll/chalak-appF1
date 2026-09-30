/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Login from './components/Login';
import SupervisorNotificationBell from './components/SupervisorNotificationBell';
import { IconButton } from './components/ui/Primitives';
const Dashboard = lazy(() => import('./components/Dashboard'));
const CriteriaBank = lazy(() => import('./components/CriteriaBank'));
const JobProfiles = lazy(() => import('./components/JobProfiles'));
const Employees = lazy(() => import('./components/Employees'));
const Evaluations = lazy(() => import('./components/Evaluations'));
const Calibration = lazy(() => import('./components/Calibration'));
const Reports = lazy(() => import('./components/Reports'));
const SupportTickets = lazy(() => import('./components/SupportTickets'));
const Onboarding = lazy(() => import('./components/Onboarding'));
const MyEvaluation = lazy(() => import('./components/MyEvaluation'));
const ManagementCenter = lazy(() => import('./components/ManagementCenter'));
const RewardCalculationCenter = lazy(() => import('./components/RewardCalculationCenter'));
const WorkflowManager = lazy(() => import('./components/WorkflowManager'));
const LatticePerformanceHub = lazy(() => import('./components/LatticePerformanceHub'));
const KickidlerProductivityHub = lazy(() => import('./components/KickidlerProductivityHub'));
const ComprehensiveManualModal = lazy(() => import('./components/ComprehensiveManualModal'));
import { UploadCloud,  
   Home,
   BookOpen,
   Sun,
   Moon,
   ShieldCheck,
   Activity,
   Sparkles,
   Users,
   Monitor,
  Eye,
  LogOut,
  Menu,
  Download,
  Printer,
  RotateCcw,
  LockKeyhole,
  Scale,
  ClipboardCheck,
   FileSpreadsheet,
  CheckCircle2,
  Save,
  HelpCircle,
  Bell,
  BellOff,
  RefreshCw
} from 'lucide-react';
import { Criterion, JobProfile, Employee, Evaluation, UserNotification, DEFAULT_ROUTE_RULES } from './types';
import { DelegationRecord, isDelegationActive } from './utils/workflowAuthorization';
import {  SEED_CRITERIA, SEED_PROFILES, SEED_EMPLOYEES, SEED_EVALUATIONS } from './seedData';
import {  browserNotifications } from './utils/browserNotifications';
import {  db } from './utils/db';
import { canAccessTab, defaultTabFor } from './utils/accessControl';
import { buildEvaluationStarts, isEvaluationPeriodActive } from './utils/evaluationStart';
import { employeeDeletionBlockMessage, getEmployeeDeletionBlockReason, planEmployeeBulkDeletion } from './utils/employeeDeletion';
import {  
  validateEmployeeInput, 
  validateCriterionInput, 
  validateJobProfileInput, 
  clearLegacyAdminSessions 
} from './utils/validation';

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [activeEvalId, setActiveEvalId] = useState<string | null>(null);
  const [workflowNotificationFocus, setWorkflowNotificationFocus] = useState<{ evaluationId: string; sequence: number } | null>(null);
  const workflowNotificationSequence = useRef(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<{
    status: 'idle' | 'syncing' | 'synced' | 'retrying' | 'offline' | 'error' | 'conflict' | 'authentication_required' | 'write_rejected';
    message: string;
    revision?: number;
    lastSyncedAt?: string;
    conflict?: boolean;
    code?: string;
    reason?: string;
    retryable?: boolean;
  }>({ status: 'idle', message: 'در انتظار ورود به سامانه' });
  const [cloudDataVersion, setCloudDataVersion] = useState(0);
  const [activeTourStep, setActiveTourStep] = useState<number | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const sessionRestorePromiseRef = useRef<Promise<{
    isApiResponse: boolean;
    responseOk: boolean;
    result?: { user?: Employee; error?: string };
  }> | null>(null);

  const sanitizeUser = (user: Employee | null): Employee | null => {
    if (!user) return null;
    return user;
  };

  // Session-isolated user state (per browser/device)
  const [currentUser, setCurrentUser] = useState<Employee | null>(() => {
    const sessionSaved = sessionStorage.getItem('pe_session_user');
    if (sessionSaved) {
      try {
        const parsed = JSON.parse(sessionSaved);
        const user = sanitizeUser(parsed);
        if (user && user.role === 'admin') {
          const sessionLoggedAt = sessionStorage.getItem('pe_admin_session_logged_at');
          const passUpdatedAt = localStorage.getItem('pe_admin_password_updated_at');
          if (sessionLoggedAt && passUpdatedAt) {
            if (new Date(passUpdatedAt).getTime() > new Date(sessionLoggedAt).getTime()) {
              // Admin password changed after session was created -> invalidate session
              clearLegacyAdminSessions();
              return null;
            }
          }
        }
        return user;
      } catch {
        return null;
      }
    }
    return null;
  });

  // Restore identity from the HttpOnly server session. Browser storage is never
  // authoritative for role or permissions in production.
  useEffect(() => {
    let active = true;
    const hasSessionHint = Boolean(sessionStorage.getItem('pe_session_user') || localStorage.getItem('pe_server_session_hint'));
    if (!hasSessionHint) {
      setCurrentUser(null);
      setSessionChecked(true);
      return () => { active = false; };
    }
    const restoreServerSession = async () => {
      try {
        const restorePromise = sessionRestorePromiseRef.current || (sessionRestorePromiseRef.current = fetch('/api/auth/session', { credentials: 'same-origin' }).then(async response => {
          const isApiResponse = (response.headers.get('Content-Type') || '').includes('application/json');
          const result = isApiResponse ? await response.json() as { user?: Employee; error?: string } : undefined;
          return { isApiResponse, responseOk: response.ok, result };
        }));
        const { isApiResponse, responseOk, result } = await restorePromise;
        if (isApiResponse) {
          if (!active) return;
          if (responseOk && result?.user) {
            sessionStorage.setItem('pe_session_user', JSON.stringify(result.user));
            localStorage.setItem('pe_server_session_hint', '1');
            setCurrentUser(result.user);
            setCurrentTab(restoreNavigationFor(result.user));
          } else {
            localStorage.removeItem('pe_server_session_hint');
            clearLegacyAdminSessions();
            setCurrentUser(null);
          }
        }
      } catch {
        // Offline/Vite demo mode intentionally keeps the local session available.
      } finally {
        if (active) setSessionChecked(true);
      }
    };
    restoreServerSession().catch(() => { if (active) setSessionChecked(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!sessionChecked || !currentUser) {
      db.stopCloudSync();
      return;
    }
    db.initializeCloudSync(currentUser.id).catch(() => {});
    return () => db.stopCloudSync();
  }, [sessionChecked, currentUser?.id]);

  useEffect(() => {
    const handleCloudStatus = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.status) setCloudStatus(detail);
    };
    const handleAuthExpired = () => {
      if (import.meta.env.DEV) db.stopCloudSync();
      else {
        db.clearAuthorizedCache();
        setEmployees([]);
        setEvaluations([]);
        setArchivedEvaluations([]);
        setProfiles([]);
        setCriteria([]);
        setDelegations([]);
      }
      clearLegacyAdminSessions();
      setCurrentUser(null);
      setCurrentTab('dashboard');
    };
    const handleCloudDataReceived = () => setCloudDataVersion(version => version + 1);
    window.addEventListener('pe_cloud_sync_status', handleCloudStatus);
    window.addEventListener('pe_auth_expired', handleAuthExpired);
    window.addEventListener('pe_cloud_data_received', handleCloudDataReceived);
    return () => {
      window.removeEventListener('pe_cloud_sync_status', handleCloudStatus);
      window.removeEventListener('pe_auth_expired', handleAuthExpired);
      window.removeEventListener('pe_cloud_data_received', handleCloudDataReceived);
    };
  }, []);

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    return browserNotifications.getPermissionStatus();
  });

  // Invalidate admin session if password updated in another tab
  useEffect(() => {
    const handleStorageUpdate = (e: StorageEvent) => {
      if (currentUser?.role === 'admin' && e.key === 'pe_admin_password_updated_at') {
        const sessionLoggedAt = sessionStorage.getItem('pe_admin_session_logged_at');
        const passUpdatedAt = localStorage.getItem('pe_admin_password_updated_at');
        if (sessionLoggedAt && passUpdatedAt) {
          if (new Date(passUpdatedAt).getTime() > new Date(sessionLoggedAt).getTime()) {
            clearLegacyAdminSessions();
            setCurrentUser(null);
            setCurrentTab('dashboard');
          }
        }
      }
    };

    window.addEventListener('storage', handleStorageUpdate);
    return () => window.removeEventListener('storage', handleStorageUpdate);
  }, [currentUser]);

  // Invalidate persistent admin session on admin password change event
  useEffect(() => {
    const handleAdminPasswordChangedEvent = () => {
      if (currentUser?.role === 'admin') {
        clearLegacyAdminSessions();
        setCurrentUser(null);
        setCurrentTab('dashboard');
      }
    };

    window.addEventListener('pe_admin_password_changed', handleAdminPasswordChangedEvent);
    return () => window.removeEventListener('pe_admin_password_changed', handleAdminPasswordChangedEvent);
  }, [currentUser]);

  const handleRequestNotification = async () => {
    const granted = await browserNotifications.requestPermission();
    setNotificationPermission(granted ? 'granted' : 'denied');
    if (granted) {
      browserNotifications.send({
        title: 'اعلان‌های سامانه ارزیابی عملکرد فعال شد',
        body: 'از این پس یادآوری‌های تاییدات و سررسید کارتابل‌ها را به صورت خودکار دریافت خواهید کرد.'
      });
    }
  };

  const getTourStepsForRole = (userRole: string) => {
    if (userRole === 'employee') {
      return [
        { tab: 'my-evaluation', title: 'کارنامه و خودارزیابی من', desc: 'مشاهده شاخص‌های تخصصی شغل خود، امتیازدهی ۱ تا ۵ و ارسال نهایی به سرپرست' },
        { tab: 'workflow', title: 'گردش کار و تاییدات', desc: 'رهگیری زنده پرونده در ۶ گام گردش کار و امکان ثبت اعتراض و درخواست بازنگری' },
        { tab: 'onboarding', title: 'آموزش بدو ورود', desc: 'آشنایی کامل با آیین‌نامه ارزیابی عملکرد و پاسخ به آزمون سنجش صلاحیت' }
      ];
    } else if (userRole === 'supervisor') {
      return [
        { tab: 'dashboard', title: 'داشبورد ارزیابی و هدف‌گذاری', desc: 'پایش روند رشد عملکرد پرسنل کارگاه و ثبت اهداف بهبود فردی' },
        { tab: 'workflow', title: 'کارتابل وظایف و گردش کار', desc: 'مشاهده سریع پرونده‌های در انتظار ارزیابی سرپرست و ارسال به کالیبراسیون' },
        { tab: 'evaluations', title: 'فرم‌های ارزیابی و مربی‌گری هوشمند', desc: 'ثبت نمرات شاخص‌ها با مستندات الزامی و دریافت پیشنهادات تحلیلی AI' },
        { tab: 'employees', title: 'لیست پرسنل و کنترل وضعیت', desc: 'بررسی وضعیت تکمیل ارزیابی زیرمجموعه و شروع سریع ارزیابی دوره‌ای' },
        { tab: 'reports', title: 'تحلیل‌ها و ماتریس ۹-Box', desc: 'مشاهده نمودار توزیع نمرات و پراکندگی پرسنل بر حسب شایستگی' },
        { tab: 'onboarding', title: 'آموزش و آزمون ارزیاب', desc: 'مرور ضوابط ضدسوگیری و اخذ نشان افتخار ارزیاب ذیصلاح' }
      ];
    } else {
      // Admin / HR
      return [
        { tab: 'dashboard', title: 'داشبورد جامع مدیریت', desc: 'مشاهده آمار کلان سازمان، تحلیل‌های هوش مصنوعی و شاخص‌های کلیدی (KPIs)' },
        { tab: 'workflow', title: 'مدیریت گردش کار و انتساب سازمانی', desc: 'پیکربندی مراحل سازمانی، قوانین تایید و انتساب گروهی سرپرستان' },
        { tab: 'criteria', title: 'بانک مرکزی شاخص‌ها', desc: 'تعریف و فرمول‌بندی معیارهای کمی و کیفی بر اساس ابعاد پنج‌گانه شایستگی' },
        { tab: 'profiles', title: 'پروفایل‌های شغلی و اوزان', desc: 'تنظیم اوزان شاخص‌ها (مجموع ۱۰۰٪) و درج اجباری شاخص ایمنی HSE' },
        { tab: 'employees', title: 'مدیریت پرسنل و ساختار', desc: 'ویرایش پرسنل، انتساب مشاغل و تعیین سلسله‌مراتب ارزیابی' },
        { tab: 'evaluations', title: 'فرم‌های ارزیابی سازمانی', desc: 'پایش جامع نمرات، آپلود اکسل و بررسی مستندات پرونده‌ها' },
        { tab: 'calibration', title: 'پنل کالیبراسیون کمیته', desc: 'کنترل توزیع زنگوله‌ای نمرات و جلوگیری از تورم نمره‌ای' },
        { tab: 'reports', title: 'گزارشات و ماتریس استعداد', desc: 'ماتریس ۹-Box، تحلیل روندها و خروجی رسمی کارنامه‌ها' },
        { tab: 'settings', title: 'مرکز امنیت و پشتیبان‌گیری', desc: 'مدیریت کاربران، کلمات عبور، لاگ‌ها و بکاپ‌گیری ابری' }
      ];
    }
  };

  const currentTourSteps = currentUser ? getTourStepsForRole(currentUser.role) : [];

  const handleStartTour = () => {
    if (!currentUser) return;
    const steps = getTourStepsForRole(currentUser.role);
    if (steps.length > 0) {
      setActiveTourStep(0);
      setCurrentTab(steps[0].tab);
    }
  };

  const handleNextTourStep = () => {
    if (activeTourStep === null || !currentUser) return;
    const steps = getTourStepsForRole(currentUser.role);
    if (activeTourStep < steps.length - 1) {
      const nextStep = activeTourStep + 1;
      setActiveTourStep(nextStep);
      setCurrentTab(steps[nextStep].tab);
    } else {
      setActiveTourStep(null);
      localStorage.setItem('pe_tour_completed_' + currentUser.id + '_' + currentUser.role, 'true');
    }
  };

  const handlePrevTourStep = () => {
    if (activeTourStep === null || !currentUser) return;
    const steps = getTourStepsForRole(currentUser.role);
    if (activeTourStep > 0) {
      const prevStep = activeTourStep - 1;
      setActiveTourStep(prevStep);
      setCurrentTab(steps[prevStep].tab);
    }
  };

  const [hasCertifiedBadge, setHasCertifiedBadge] = useState<boolean>(() => {
    return localStorage.getItem('pe_certified_badge') === 'true';
  });

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('pe_theme');
    if (!saved) {
      localStorage.setItem('pe_theme', 'light');
      return 'light';
    }
    return (saved as 'dark' | 'light') || 'light';
  });

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; visible: boolean } | null>(null);

  const navigationKeyFor = (user: Employee) => `pe_last_tab_${user.id}_${user.username.toLowerCase()}`;
  const restoreNavigationFor = (user: Employee): string => {
    const saved = localStorage.getItem(navigationKeyFor(user));
    return saved && canAccessTab(user, saved) ? saved : defaultTabFor(user);
  };

  const [criteria, setCriteria] = useState<Criterion[]>(() => db.getCriteria());
  const [profiles, setProfiles] = useState<JobProfile[]>(() => db.getProfiles());
  const [employees, setEmployees] = useState<Employee[]>(() => db.getEmployees());
  const [evaluations, setEvaluations] = useState<Evaluation[]>(() => db.getEvaluations());
  const [archivedEvaluations, setArchivedEvaluations] = useState<Evaluation[]>(() => db.getArchivedEvaluations());
  const [delegations, setDelegations] = useState<DelegationRecord[]>(() => db.getDelegations());
  const [notifications, setNotifications] = useState<UserNotification[]>(() => db.getMiscData<UserNotification[]>('pe_notifications', []));

  const notifyDataSaved = useCallback(() => {
    setSaveIndicator(true);
    const t = setTimeout(() => setSaveIndicator(false), 2000);
    return () => clearTimeout(t);
  }, []);

  // Multi-tab and intra-app real-time synchronization
  useEffect(() => {
    // 1. Intra-app reactive listener for instant updates across all forms
    const unsubscribe = db.subscribe((key, data) => {
      if (key === 'pe_criteria') setCriteria(data || db.getCriteria());
      else if (key === 'pe_profiles') setProfiles(data || db.getProfiles());
      else if (key === 'pe_employees') setEmployees(data || db.getEmployees());
      else if (key === 'pe_evaluations') setEvaluations(data || db.getEvaluations());
      else if (key === 'pe_archived_evaluations') setArchivedEvaluations(data || db.getArchivedEvaluations());
      else if (key === 'pe_delegations') setDelegations(data || db.getDelegations());
      else if (key === 'pe_notifications') setNotifications(data || db.getMiscData<UserNotification[]>('pe_notifications', []));
      notifyDataSaved();
    });

    // 2. Cross-tab synchronization
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'pe_criteria') setCriteria(db.getCriteria());
      else if (e.key === 'pe_profiles') setProfiles(db.getProfiles());
      else if (e.key === 'pe_employees') setEmployees(db.getEmployees());
      else if (e.key === 'pe_evaluations') setEvaluations(db.getEvaluations());
      else if (e.key === 'pe_archived_evaluations') setArchivedEvaluations(db.getArchivedEvaluations());
      else if (e.key === 'pe_delegations') setDelegations(db.getDelegations());
      else if (e.key === 'pe_notifications') setNotifications(db.getMiscData<UserNotification[]>('pe_notifications', []));
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      unsubscribe();
      window.removeEventListener('storage', handleStorage);
    };
  }, [notifyDataSaved]);

  // Check and alert pending tasks if user is logged in
  useEffect(() => {
    if (!currentUser) return;

    if (currentUser.role === 'supervisor') {
      const pendingEvals = evaluations.filter(ev => {
        const emp = employees.find(e => e.id === ev.empId);
        return emp && ev.stage === 'supervisor_review' && ev.currentAssigneeId === currentUser.id && (ev.status === 'draft' || ev.status === 'pending');
      });
      if (pendingEvals.length > 0 && notificationPermission === 'granted') {
        const lastAlert = sessionStorage.getItem('pe_last_notif_alert');
        if (!lastAlert) {
          browserNotifications.sendWorkflowDeadlineAlert('supervisor', pendingEvals.length, 'پایان ماه جاری');
          sessionStorage.setItem('pe_last_notif_alert', 'true');
        }
      }
    } else if (currentUser.role === 'employee') {
      const myEval = evaluations.find(ev => ev.empId === currentUser.id);
      const selfReviewPending = Boolean(myEval && (myEval.stage === 'self_review' || myEval.stage === 'rejected') &&
        myEval.requiresSelfReview !== false && myEval.scores.every(s => s.self === 0));
      if (selfReviewPending && notificationPermission === 'granted') {
        const lastAlert = sessionStorage.getItem('pe_last_notif_emp_alert');
        if (!lastAlert) {
          browserNotifications.sendWorkflowDeadlineAlert('employee', 1);
          sessionStorage.setItem('pe_last_notif_emp_alert', 'true');
        }
      }
    }
  }, [currentUser, evaluations, employees, notificationPermission]);

  // Session user storage is handled strictly inside sessionStorage on handleLogin / handleLogout

  useEffect(() => {
    localStorage.setItem('pe_certified_badge', hasCertifiedBadge ? 'true' : 'false');
  }, [hasCertifiedBadge]);

  useEffect(() => {
    document.documentElement.classList.toggle('light-theme', theme === 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const handleLogin = (emp: Employee) => {
    const sanitized = sanitizeUser(emp);
    if (!sanitized) return;
    sessionStorage.setItem('pe_session_user', JSON.stringify(sanitized));
    if (!import.meta.env.DEV) localStorage.setItem('pe_server_session_hint', '1');
    if (sanitized.role === 'admin') {
      sessionStorage.setItem('pe_admin_session_logged_at', new Date().toISOString());
    }
    setCurrentUser(sanitized);
    setSessionChecked(true);
    
    // Check if onboarding or tour is needed for this role
    const hasSeenRoleTour = localStorage.getItem('pe_tour_completed_' + sanitized.id + '_' + sanitized.role);
    const hasOnboarded = localStorage.getItem('pe_onboarded_' + sanitized.id);

    if (!hasOnboarded) {
      setCurrentTab('onboarding');
    } else if (!hasSeenRoleTour) {
      setCurrentTab(restoreNavigationFor(sanitized));
      setTimeout(() => {
        handleStartTour();
      }, 400);
    } else {
      setCurrentTab(restoreNavigationFor(sanitized));
    }
  };

  const handleLogout = () => {
    if (import.meta.env.DEV) db.stopCloudSync();
    else {
      db.clearAuthorizedCache();
      setEmployees([]);
      setEvaluations([]);
      setArchivedEvaluations([]);
      setProfiles([]);
      setCriteria([]);
    }
    setDelegations([]);
    fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
    clearLegacyAdminSessions();
    localStorage.removeItem('pe_server_session_hint');
    sessionStorage.removeItem('pe_last_notif_alert');
    sessionStorage.removeItem('pe_last_notif_emp_alert');
    setCurrentUser(null);
    setActiveEvalId(null);
    setWorkflowNotificationFocus(null);
    setCurrentTab('dashboard');
  };

  const handleForceAdminReauth = useCallback(() => {
    db.stopCloudSync();
    clearLegacyAdminSessions();
    setCurrentUser(null);
    setActiveEvalId(null);
    setWorkflowNotificationFocus(null);
    setCurrentTab('dashboard');
  }, []);

  const handleForceCloudSync = async () => {
    if (cloudStatus.status === 'syncing') return;
    if (cloudStatus.conflict) return;
    setContextMenu(null);
    await db.refreshFromCloudNow();
  };

  const handleResolveCloudConflict = async (choice: 'local' | 'remote') => {
    await db.resolveCloudRevisionConflict(choice);
  };

  const handleRetryRejectedCloudWrite = async () => {
    await db.retryRejectedCloudWrite();
  };

  const handleToggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('pe_theme', next);
      return next;
    });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    // DO NOT intercept right-clicks on inputs or textareas so native copy/paste works!
    const target = e.target as HTMLElement;
    if (target.tagName.toLowerCase() === 'input' || target.tagName.toLowerCase() === 'textarea' || target.isContentEditable) {
      return; // allow native menu
    }
    e.preventDefault();
    const menuWidth = 280;
    const menuHeight = 440;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuWidth > window.innerWidth) x = Math.max(10, window.innerWidth - menuWidth - 15);
    if (y + menuHeight > window.innerHeight) y = Math.max(10, window.innerHeight - menuHeight - 15);
    setContextMenu({ x, y, visible: true });
  };

  const handleQuickJSONBackup = () => {
    const dataToExport = {
      meta: { app: 'سیستم ارزیابی عملکرد', version: '3.5.0-Enterprise', exportDate: new Date().toISOString(), exportedBy: currentUser?.name || 'ناشناس' },
      employees, profiles, criteria, evaluations
    };
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(dataToExport, null, 2))}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `chalak_quick_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setContextMenu(null);
  };

  const handleAddCriterion = (crit: Omit<Criterion, 'id'>): boolean => {
    const valResult = validateCriterionInput(crit);
    if (!valResult.success) {
      alert(valResult.errors.join('\n'));
      return false;
    }
    const validated = valResult.data;
    const exists = criteria.some(c => c.code.trim().toUpperCase() === validated.code.trim().toUpperCase());
    if (exists) return false;
    db.addCriterion(validated);
    setCriteria(db.getCriteria());
    notifyDataSaved();
    return true;
  };

  const handleUpdateCriterion = (id: string, crit: Omit<Criterion, 'id'>): boolean => {
    const valResult = validateCriterionInput(crit);
    if (!valResult.success) {
      alert(valResult.errors.join('\n'));
      return false;
    }
    const validated = valResult.data;
    const isDuplicate = criteria.some(c => c.code.trim().toUpperCase() === validated.code.trim().toUpperCase() && c.id !== id);
    if (isDuplicate) return false;
    db.updateCriterion(id, validated);
    setCriteria(db.getCriteria());
    notifyDataSaved();
    return true;
  };

  const handleDeleteCriterion = (id: string) => {
    const res = db.deleteCriterion(id);
    if (res.success) {
      setCriteria(db.getCriteria());
      setProfiles(db.getProfiles());
      setEvaluations(db.getEvaluations());
      notifyDataSaved();
    } else {
      alert('خطا در حذف شاخص');
    }
  };

  const handleAddProfile = (prof: Omit<JobProfile, 'id'>) => {
    const valResult = validateJobProfileInput(prof);
    if (!valResult.success) {
      alert(valResult.errors.join('\n'));
      return;
    }
    db.addProfile(valResult.data);
    setProfiles(db.getProfiles());
    notifyDataSaved();
  };

  const handleUpdateProfile = (id: string, prof: Omit<JobProfile, 'id'>) => {
    const valResult = validateJobProfileInput(prof);
    if (!valResult.success) {
      alert(valResult.errors.join('\n'));
      return;
    }
    db.updateProfile(id, valResult.data);
    setProfiles(db.getProfiles());
    notifyDataSaved();
  };

  const handleDeleteProfile = (id: string) => {
    const res = db.deleteProfile(id, true);
    if (!res.success) {
      alert(res.error || 'خطا در حذف پروفایل شغلی.');
      return;
    }
    setProfiles(db.getProfiles());
    setEmployees(db.getEmployees());
    notifyDataSaved();
  };

  const handleBulkDeleteProfiles = (ids: string[]) => {
    const res = db.deleteProfilesBatch(ids);
    setProfiles(db.getProfiles());
    setEmployees(db.getEmployees());
    notifyDataSaved();
  };

  const handleToggleLockProfile = (id: string) => {
    const prof = profiles.find(p => p.id === id);
    if (prof) {
      db.updateProfile(id, { ...prof, locked: !prof.locked });
      setProfiles(db.getProfiles());
      notifyDataSaved();
    }
  };

  const handleAddEmployee = (emp: Omit<Employee, 'id'>) => {
    const valResult = validateEmployeeInput(emp);
    if (!valResult.success) {
      alert(valResult.errors.join('\n'));
      return;
    }
    const { employee: newEmp, evaluation } = db.addEmployee(valResult.data);
    setEmployees(db.getEmployees());
    if (evaluation) {
      setEvaluations(db.getEvaluations());
    }
    notifyDataSaved();
  };

  const renameCloudCredential = async (oldUsername: string, newUsername: string): Promise<boolean> => {
    if (oldUsername.trim().toLowerCase() === newUsername.trim().toLowerCase()) return true;
    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', oldUsername, username: newUsername }),
      });
      const isJson = (response.headers.get('Content-Type') || '').includes('application/json');
      if (!isJson) return import.meta.env.DEV;
      const result = await response.json() as { error?: string };
      if (!response.ok) alert(result.error || 'انتقال اطلاعات ورود به نام کاربری جدید ناموفق بود.');
      return response.ok;
    } catch {
      if (!import.meta.env.DEV) alert('ارتباط با سرویس مدیریت حساب برقرار نشد.');
      return import.meta.env.DEV;
    }
  };

  const handleUpdateEmployee = async (id: string, emp: Omit<Employee, 'id'>) => {
    const valResult = validateEmployeeInput(emp);
    if (!valResult.success) {
      alert(valResult.errors.join('\n'));
      return;
    }
    const existing = employees.find(employee => employee.id === id);
    if (existing && !(await renameCloudCredential(existing.username, valResult.data.username))) return;
    db.updateEmployee(id, valResult.data);
    setEmployees(db.getEmployees());
    notifyDataSaved();
  };

  const removeCloudCredential = async (username: string) => {
    try {
      const response = await fetch('/api/auth/password', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const isApiResponse = (response.headers.get('Content-Type') || '').includes('application/json');
      return !isApiResponse && import.meta.env.DEV ? true : response.ok;
    } catch {
      return import.meta.env.DEV;
    }
  };

  const removeCloudCredentialsBulk = async (usernames: string[]): Promise<boolean> => {
    if (usernames.length === 0) return true;
    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_delete', usernames }),
      });
      const isApiResponse = (response.headers.get('Content-Type') || '').includes('application/json');
      return !isApiResponse && import.meta.env.DEV ? true : response.ok;
    } catch {
      return import.meta.env.DEV;
    }
  };

  const handleDeleteEmployee = async (id: string): Promise<boolean> => {
    const target = employees.find(e => e.id === id);
    if (!target) return false;
    const blockReason = getEmployeeDeletionBlockReason(target, employees.filter(employee => employee.id !== id), evaluations, db.getArchivedEvaluations());
    if (blockReason) {
      alert(employeeDeletionBlockMessage(blockReason));
      return false;
    }
    if (!(await removeCloudCredential(target.username))) {
      alert('حذف اطلاعات ورود کاربر از سرور ناموفق بود؛ عملیات حذف متوقف شد.');
      return false;
    }
    const success = db.deleteEmployee(id);
    if (success) {
      if (activeEvalId && evaluations.some(item => item.id === activeEvalId && item.empId === id)) {
        setActiveEvalId(null);
      }
      setEmployees(db.getEmployees());
      setEvaluations(db.getEvaluations());
      notifyDataSaved();
      return true;
    }
    return false;
  };

  const handleBulkDeleteEmployees = async (ids: string[]): Promise<boolean> => {
    if (!ids || ids.length === 0) return false;
    const deletionPlan = planEmployeeBulkDeletion(ids, employees, evaluations, db.getArchivedEvaluations());
    const targets = employees.filter(employee => deletionPlan.deletableIds.has(employee.id));
    const blockedCount = new Set(ids).size - targets.length;
    if (!targets.length) {
      alert('کارکنان انتخاب‌شده سابقه، پرونده باز، رابطه سازمانی یا حساب محافظت‌شده دارند و حذف نشدند.');
      return false;
    }
    // Single bulk credential deletion — ONE request, not N per employee.
    if (!(await removeCloudCredentialsBulk(targets.map(t => t.username).filter(Boolean)))) {
      alert('حذف اطلاعات ورود گروهی از سرور ناموفق بود؛ عملیات گروهی متوقف شد.');
      return false;
    }
    const res = db.deleteEmployeesBatch(targets.map(target => target.id));
    if (res.success) {
      setEmployees(db.getEmployees());
      setEvaluations(db.getEvaluations());
      notifyDataSaved();
      if (blockedCount) alert(`${res.deletedCount} کارمند حذف شد؛ ${blockedCount} مورد به‌دلیل سابقه، پرونده باز، رابطه سازمانی یا حساب محافظت‌شده باقی ماند.`);
      return true;
    }
    return false;
  };

  const handleBulkUpdateEmployees = (updatedList: Employee[]) => {
    db.saveEmployees(updatedList);
    setEmployees(db.getEmployees());
    notifyDataSaved();
  };

  const handleImportEmployees = async (
    updatedList: Employee[],
    sourceImport: import('./utils/sourceImports').MasterDataSourceImportContext,
  ): Promise<boolean> => {
    const accepted = await db.saveEmployeesWithSourceImport(updatedList, sourceImport);
    if (!accepted) return false;
    setEmployees(db.getEmployees());
    notifyDataSaved();
    return true;
  };

  const handleBulkUpdateEvaluations = async (updatedEvals: Evaluation[], sourceImport?: import('./utils/sourceImports').ProtectedSourceImportContext): Promise<boolean> => {
    if (sourceImport) {
      const accepted = await db.saveEvaluationsWithSourceImport(updatedEvals, sourceImport);
      if (!accepted) return false;
      setEvaluations(db.getEvaluations());
      notifyDataSaved();
      return true;
    }
    db.saveEvaluations(updatedEvals);
    setEvaluations(updatedEvals);
    notifyDataSaved();
    return true;
  };

  const handleSetProfiles = (updatedProfiles: JobProfile[]) => {
    db.saveProfiles(updatedProfiles);
    setProfiles(updatedProfiles);
    notifyDataSaved();
  };

  const handleSetCriteria = (updatedCriteria: Criterion[]) => {
    db.saveCriteria(updatedCriteria);
    setCriteria(updatedCriteria);
    notifyDataSaved();
  };

  const handleUpdateDelegations = (updatedDelegations: DelegationRecord[]) => {
    db.saveDelegations(updatedDelegations);
    setDelegations(db.getDelegations());
    notifyDataSaved();
  };

  const handleSetArchivedEvaluations = (updatedArchived: Evaluation[]) => {
    db.saveArchivedEvaluations(updatedArchived);
    setArchivedEvaluations(updatedArchived);
    notifyDataSaved();
  };

  const handleAddEvaluation = (empId: string, period: string) => {
    handleBulkStartEvaluations([empId], period);
  };

  const handleActivateEvaluationPeriod = (period: string): boolean => {
    if (currentUser?.role !== 'admin' || !period.trim()) return false;
    db.saveMiscData('pe_active_period', period.trim());
    notifyDataSaved();
    return true;
  };

  const handleBulkStartEvaluations = (employeeIds: string[], period: string): boolean => {
    if (currentUser?.role !== 'admin' || !isEvaluationPeriodActive(db.getMiscData<string>('pe_active_period', ''), period)) return false;
    const routeRules = db.getMiscData('pe_route_rules', DEFAULT_ROUTE_RULES);
    const newEvaluations = buildEvaluationStarts(employeeIds, period, employees, profiles, evaluations, Date.now(), routeRules);
    if (!newEvaluations.length) return false;
    const next = [...evaluations, ...newEvaluations];
    db.saveEvaluations(next);
    setEvaluations(next);
    setActiveEvalId(newEvaluations[0].id);
    setCurrentTab('evaluations');
    notifyDataSaved();
    return true;
  };

  const handleUpdateEvaluation = (id: string, updatedEv: Evaluation) => {
    setEvaluations(prev => {
      const exists = prev.some(e => e.id === id);
      const next = exists ? prev.map(e => e.id === id ? updatedEv : e) : [...prev, updatedEv];
      db.saveEvaluations(next);
      return next;
    });
    notifyDataSaved();
  };

  const handleBatchAddCriteria = (
    newOrUpdatedList: Array<Omit<Criterion, 'id'> & { id?: string }>,
    mode: 'merge' | 'prefix_dept' | 'skip_existing' | 'replace' = 'merge',
    sourceImport?: import('./utils/sourceImports').MasterDataSourceImportContext,
  ): Promise<boolean> | boolean => {
    const batchMode = mode === 'replace' ? 'replace' : mode === 'skip_existing' ? 'skip_existing' : 'merge';
    const prepared = db.prepareCriteriaBatch(newOrUpdatedList, batchMode);
    if (sourceImport) {
      return db.saveCriteriaWithSourceImport(prepared.criteria, sourceImport).then(accepted => {
        if (!accepted) return false;
        setCriteria(db.getCriteria());
        notifyDataSaved();
        return true;
      });
    }
    db.saveCriteria(prepared.criteria);
    setCriteria(db.getCriteria());
    notifyDataSaved();
    return true;
  };

  const handleDeleteEvaluation = (id: string) => {
    if (!db.deleteEvaluation(id)) {
      alert('ارزیابی نهایی یا بایگانی‌شده برای حفظ سوابق حذف نمی‌شود.');
      return;
    }
    setEvaluations(db.getEvaluations());
    if (activeEvalId === id) setActiveEvalId(null);
    notifyDataSaved();
  };

  const handleBulkDeleteCriteria = (ids: string[]) => {
    const res = db.deleteCriteriaBatch(ids);
    if (res.deletedCount > 0) {
      setCriteria(db.getCriteria());
      setProfiles(db.getProfiles());
      setEvaluations(db.getEvaluations());
      notifyDataSaved();
    }
  };

  const handleBulkDeleteEvaluations = (ids: string[]) => {
    const res = db.deleteEvaluationsBatch(ids);
    if (res.deletedCount > 0) {
      setEvaluations(db.getEvaluations());
      if (activeEvalId && ids.includes(activeEvalId)) {
        setActiveEvalId(null);
      }
      notifyDataSaved();
    }
  };

  const handleStartEvaluationDirect = (empId: string) => {
    const period = db.getMiscData<string>('pe_active_period', '').trim();
    if (!period) {
      alert('برای آغاز ارزیابی، ابتدا یک دوره را در بخش ارزیابی‌ها فعال کنید.');
      return;
    }
    const existing = evaluations.find(ev => ev.empId === empId && ev.period === period);
    if (existing) {
      setActiveEvalId(existing.id);
      setCurrentTab('evaluations');
    } else {
      handleAddEvaluation(empId, period);
    }
  };

  const handleSelectEvaluation = (id: string) => {
    setActiveEvalId(id);
    setCurrentTab('evaluations');
  };

  const markNotificationRead = (id: string) => {
    const updated = notifications.map(item => item.id === id && !item.readAt ? { ...item, readAt: new Date().toISOString() } : item);
    db.saveMiscData('pe_notifications', updated);
  };

  const markAllNotificationsRead = () => {
    const readAt = new Date().toISOString();
    db.saveMiscData('pe_notifications', notifications.map(item => item.readAt ? item : { ...item, readAt }));
  };

  const openNotification = (notification: UserNotification) => {
    if (notification.evaluationId) {
      setActiveEvalId(notification.evaluationId);
      workflowNotificationSequence.current += 1;
      setWorkflowNotificationFocus({ evaluationId: notification.evaluationId, sequence: workflowNotificationSequence.current });
    }
    setCurrentTab(notification.targetTab);
  };

  const getTabTitle = (tab: string) => {
    switch (tab) {
      case 'dashboard': return 'داشبورد مدیریت';
      case 'workflow': return 'گردش کار و تاییدات';
      case 'criteria': return 'بانک شاخص‌ها';
      case 'profiles': return 'پروفایل‌های شغلی';
      case 'employees': return 'مدیریت کارکنان';
      case 'evaluations': return 'فرم‌های ارزیابی';
      case 'calibration': return 'کالیبراسیون عملکرد';
      case 'reports': return 'گزارشات سازمانی';
      case 'rewards': return 'محاسبات ریالی و پاداش';
      case 'lattice-hub': return 'مدیریت اهداف و استعدادها (Lattice)';
      case 'kickidler-hub': return 'پایش بهره‌وری و زمان کار (Kickidler)';
      case 'onboarding': return 'آموزش سیستم';
      case 'my-evaluation': return 'ارزیابی من';
      case 'settings': return 'تنظیمات امنیتی';
      default: return 'سیستم مدیریت عملکرد';
    }
  };

  useEffect(() => {
    if (currentUser && !canAccessTab(currentUser, currentTab)) {
      setCurrentTab(defaultTabFor(currentUser));
    }
  }, [currentUser, currentTab]);

  useEffect(() => {
    if (sessionChecked && currentUser && canAccessTab(currentUser, currentTab)) {
      localStorage.setItem(navigationKeyFor(currentUser), currentTab);
    }
  }, [sessionChecked, currentUser?.id, currentUser?.username, currentTab]);

  if (!sessionChecked) {
    return <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-300" dir="rtl">در حال بررسی نشست امن…</div>;
  }

  if (!currentUser) {
    return <Login employees={employees} onLogin={handleLogin} theme={theme} />;
  }

  if (!canAccessTab(currentUser, currentTab)) {
    return <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-400" dir="rtl">در حال انتقال به بخش مجاز…</div>;
  }

  return (
    <div onContextMenu={handleContextMenu} className={`app-shell flex flex-col md:flex-row h-screen overflow-hidden font-sans text-right transition-colors duration-300 relative ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'}`} dir="rtl">
      
      <header className={`md:hidden flex items-center justify-between px-4 py-3 border-b z-30 shrink-0 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
        <div className="flex items-center gap-2.5">
          <IconButton onClick={() => setIsMobileMenuOpen(true)} className="border-transparent bg-transparent text-teal-500 hover:bg-slate-800/50" label="منو">
            <Menu className="w-5 h-5" />
          </IconButton>
          <span className="text-xs font-black tracking-tight">{getTabTitle(currentTab)}</span>
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            onClick={handleForceCloudSync}
            disabled={cloudStatus.status === 'syncing'}
            title={cloudStatus.message}
            label={cloudStatus.message}
            className={`p-1.5 rounded-xl border transition-colors ${
              cloudStatus.status === 'synced' ? 'text-sky-400 bg-sky-500/10 border-sky-500/20' :
              cloudStatus.status === 'syncing' || cloudStatus.status === 'retrying' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
              cloudStatus.status === 'offline' ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' :
              'text-rose-400 bg-rose-500/10 border-rose-500/20'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${cloudStatus.status === 'syncing' || cloudStatus.status === 'retrying' ? 'animate-spin' : ''}`} />
          </IconButton>
          {['write_rejected', 'authentication_required', 'conflict'].includes(cloudStatus.status) && (
            <span role="status" aria-live="polite" className="max-w-[50vw] truncate text-[10px] text-rose-400" title={cloudStatus.message}>{cloudStatus.status === 'write_rejected' ? 'ذخیره ابری رد شد' : cloudStatus.status === 'authentication_required' ? 'ورود دوباره لازم است' : 'تعارض نسخه'}</span>
          )}
          <button 
            type="button" 
            onClick={() => setIsManualModalOpen(true)} 
            className="p-1.5 rounded-xl bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 transition-colors cursor-pointer"
            title="کتابچه راهنما و دانلود PDF"
          >
            <BookOpen className="w-4 h-4" />
          </button>
          <SupervisorNotificationBell
            evaluations={evaluations}
            employees={employees}
            currentUser={currentUser}
            onNavigate={setCurrentTab}
            theme={theme}
            notifications={notifications}
            onMarkNotificationRead={markNotificationRead}
            onMarkAllNotificationsRead={markAllNotificationsRead}
            onOpenNotification={openNotification}
          />
          <IconButton onClick={handleToggleTheme} className="border-transparent bg-transparent" label="تغییر پوسته">
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </IconButton>
        </div>
      </header>

      <Sidebar 
        currentTab={currentTab} 
        onChangeTab={(tab) => { setCurrentTab(tab); if (tab !== 'evaluations') setActiveEvalId(null); }} 
        currentUser={currentUser} onLogout={handleLogout} theme={theme} onToggleTheme={handleToggleTheme} 
        hasCertifiedBadge={hasCertifiedBadge}
        onStartTour={handleStartTour}
        onOpenManual={() => setIsManualModalOpen(true)}
        isMobileOpen={isMobileMenuOpen} onCloseMobile={() => setIsMobileMenuOpen(false)} 
      />

      <main className={`app-main min-w-0 flex-1 overflow-y-auto transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-950' : 'bg-slate-50'}`}>
        {/* Desktop Sticky Header with Supervisor Overdue Notification Bell */}
        <div className={`hidden md:flex flex-wrap items-center justify-between gap-3 px-5 lg:px-8 py-3 border-b sticky top-0 z-20 backdrop-blur-xl ${
          theme === 'dark' ? 'bg-slate-950/90 border-slate-800/80' : 'bg-white/90 border-slate-200/80 shadow-sm'
        }`}>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <span className="text-sm font-extrabold tracking-tight">{getTabTitle(currentTab)}</span>
            <span className="hidden xl:inline h-4 w-px bg-slate-200 dark:bg-slate-800" aria-hidden="true" />
            <span className="hidden xl:inline text-xs text-slate-500 font-medium">سامانه جامع مدیریت عملکرد و ارزیابی شایستگی‌های شغلی</span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleForceCloudSync}
              disabled={cloudStatus.status === 'syncing'}
              title={`${cloudStatus.message}${cloudStatus.revision !== undefined ? ` — نسخه ${cloudStatus.revision}` : ''}`}
              className={`text-[10px] font-bold flex items-center gap-1 px-2.5 py-1 rounded-full border transition-colors ${
                cloudStatus.status === 'synced' ? 'text-sky-400 bg-sky-500/10 border-sky-500/20' :
                cloudStatus.status === 'syncing' || cloudStatus.status === 'retrying' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                cloudStatus.status === 'offline' ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' :
                cloudStatus.status === 'idle' ? 'text-slate-400 bg-slate-500/10 border-slate-500/20' :
                'text-rose-400 bg-rose-500/10 border-rose-500/20'
              }`}
            >
              <RefreshCw className={`w-3 h-3 ${cloudStatus.status === 'syncing' || cloudStatus.status === 'retrying' ? 'animate-spin' : ''}`} />
              {cloudStatus.status === 'synced' ? 'تازه‌سازی / همگام' :
               cloudStatus.status === 'syncing' ? 'در حال تازه‌سازی' :
               cloudStatus.status === 'retrying' ? 'تلاش مجدد همگام‌سازی' :
               cloudStatus.status === 'offline' ? 'آفلاین؛ ذخیره محلی فعال' :
               cloudStatus.status === 'conflict' ? 'تعارض نسخه' :
               cloudStatus.status === 'authentication_required' ? 'ورود دوباره لازم است' :
               cloudStatus.status === 'write_rejected' ? 'ذخیره ابری رد شد' :
               cloudStatus.status === 'error' ? 'خطای فضای ابری' : 'ابر غیرفعال'}
            </button>
            {cloudStatus.status === 'write_rejected' && (
              <div role="status" aria-live="polite" className="flex max-w-[560px] items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[10px] text-rose-200">
                <span>{cloudStatus.message}</span>
                <button type="button" onClick={handleRetryRejectedCloudWrite} className="shrink-0 rounded-lg bg-rose-500/20 px-2 py-1 font-bold text-rose-100">تلاش دوباره</button>
              </div>
            )}
            {cloudStatus.status === 'authentication_required' && (
              <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-200">
                <span>{cloudStatus.message}</span>
                <button type="button" onClick={handleLogout} className="shrink-0 rounded-lg bg-amber-500/15 px-2 py-1 font-bold text-amber-100">ورود دوباره</button>
              </div>
            )}
            {cloudStatus.conflict && <div className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/5 p-1">
              <span className="px-1 text-[9px] text-rose-300">تعارض نسخه</span>
              <button type="button" onClick={() => handleResolveCloudConflict('remote')} className="rounded-lg bg-slate-800 px-2 py-1 text-[9px] font-bold text-slate-100">نسخه ابری</button>
              <button type="button" onClick={() => handleResolveCloudConflict('local')} className="rounded-lg bg-rose-500/20 px-2 py-1 text-[9px] font-bold text-rose-200">نسخه محلی</button>
            </div>}
            {saveIndicator && <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />ذخیره محلی</span>}
            <button
              type="button"
              onClick={() => setIsManualModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/20 text-xs font-bold transition-all cursor-pointer"
              title="مشاهده و دانلود کتابچه راهنمای جامع به صورت PDF"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>کتابچه راهنما (PDF)</span>
            </button>
            <SupervisorNotificationBell
              evaluations={evaluations}
              employees={employees}
              currentUser={currentUser}
              onNavigate={setCurrentTab}
              theme={theme}
              notifications={notifications}
              onMarkNotificationRead={markNotificationRead}
              onMarkAllNotificationsRead={markAllNotificationsRead}
              onOpenNotification={openNotification}
            />
            <button
              type="button"
              onClick={handleToggleTheme}
              className="p-1.5 rounded-xl bg-slate-800/20 text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
              title="تغییر تم"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
            </button>
          </div>
        </div>

        <div className="app-content px-4 py-5 sm:px-6 sm:py-6 xl:px-8 xl:py-8">
          <div className="app-page mx-auto max-w-[88rem] space-y-7">
          <Suspense key={cloudDataVersion} fallback={<div className="p-8 text-center text-sm text-slate-400">در حال بارگذاری بخش…</div>}>
          {currentTab === 'dashboard' && <Dashboard criteria={criteria} profiles={profiles} employees={employees} evaluations={evaluations} onNavigate={setCurrentTab} onSelectEvaluation={handleSelectEvaluation} currentUser={currentUser} hasCertifiedBadge={hasCertifiedBadge} theme={theme} />}
          {currentTab === 'workflow' && (
            <WorkflowManager 
              currentUser={currentUser} 
              evaluations={evaluations} 
              employees={employees} 
              profiles={profiles} 
              criteria={criteria} 
              delegations={delegations} 
              onUpdateEvaluation={handleUpdateEvaluation} 
              onBulkUpdateEvaluations={handleBulkUpdateEvaluations} 
              onDeleteEvaluation={handleDeleteEvaluation}
              onBulkDeleteEvaluations={handleBulkDeleteEvaluations}
              onUpdateEmployees={handleBulkUpdateEmployees} 
              onSelectEvaluation={handleSelectEvaluation} 
              notificationFocus={workflowNotificationFocus}
              onUpdateDelegations={handleUpdateDelegations} 
              theme={theme} 
            />
          )}
          {currentTab === 'criteria' && (
            <CriteriaBank 
              criteria={criteria} 
              onAddCriterion={handleAddCriterion} 
              onUpdateCriterion={handleUpdateCriterion} 
              onDeleteCriterion={handleDeleteCriterion} 
              onBulkDeleteCriteria={handleBulkDeleteCriteria}
              onBatchAddCriteria={handleBatchAddCriteria}
              employees={employees}
              profiles={profiles}
              evaluations={evaluations}
              onUpdateEvaluations={handleBulkUpdateEvaluations}
              currentUser={currentUser}
              theme={theme} 
            />
          )}
          {currentTab === 'profiles' && (
            <JobProfiles 
              profiles={profiles} 
              criteria={criteria} 
              onAddProfile={handleAddProfile} 
              onUpdateProfile={handleUpdateProfile} 
              onDeleteProfile={handleDeleteProfile} 
              onBulkDeleteProfiles={handleBulkDeleteProfiles}
              onToggleLockProfile={handleToggleLockProfile} 
              onAddCriterion={handleAddCriterion} 
              theme={theme} 
              currentUser={currentUser}
            />
          )}
          {currentTab === 'employees' && <Employees employees={employees} profiles={profiles} evaluations={evaluations} currentUser={currentUser} onAddEmployee={handleAddEmployee} onUpdateEmployee={handleUpdateEmployee} onBulkUpdateEmployees={handleBulkUpdateEmployees} onImportEmployees={handleImportEmployees} onDeleteEmployee={handleDeleteEmployee} onBulkDeleteEmployees={handleBulkDeleteEmployees} onStartEvaluation={handleStartEvaluationDirect} theme={theme} />}
          {currentTab === 'evaluations' && <Evaluations evaluations={evaluations} employees={employees} profiles={profiles} criteria={criteria} onAddEvaluation={handleAddEvaluation} onActivateEvaluationPeriod={handleActivateEvaluationPeriod} onBulkStartEvaluations={handleBulkStartEvaluations} onUpdateEvaluation={handleUpdateEvaluation} onBulkUpdateEvaluations={handleBulkUpdateEvaluations} onDeleteEvaluation={handleDeleteEvaluation} onBulkDeleteEvaluations={handleBulkDeleteEvaluations} activeEvalId={activeEvalId} onSetActiveEval={setActiveEvalId} onNavigateToWorkflow={() => setCurrentTab('workflow')} currentUser={currentUser} />}
          {currentTab === 'calibration' && <Calibration evaluations={evaluations} employees={employees} profiles={profiles} onUpdateEvaluation={handleUpdateEvaluation} onSelectEvaluation={handleSelectEvaluation} />}
          {currentTab === 'support' && <SupportTickets currentUser={currentUser} theme={theme} />}
          {currentTab === 'reports' && (
            <Reports 
              evaluations={evaluations} 
              employees={employees} 
              profiles={profiles} 
              criteria={criteria} 
              onDeleteEvaluation={handleDeleteEvaluation}
              onBulkDeleteEvaluations={handleBulkDeleteEvaluations}
              onSelectEvaluation={handleSelectEvaluation}
              onNavigate={setCurrentTab}
              currentUser={currentUser}
              theme={theme}
            />
          )}
          {currentTab === 'lattice-hub' && (
            <LatticePerformanceHub 
              currentUser={currentUser} 
              employees={employees} 
              theme={theme} 
              onNavigate={setCurrentTab} 
            />
          )}
          {currentTab === 'kickidler-hub' && (
            <KickidlerProductivityHub 
              currentUser={currentUser} 
              employees={employees} 
              theme={theme} 
              onNavigate={setCurrentTab} 
            />
          )}
          {currentTab === 'onboarding' && <Onboarding currentUser={currentUser} onComplete={() => { if (currentUser) localStorage.setItem('pe_onboarded_' + currentUser.id, 'true'); if (currentUser && currentUser.role === 'employee') setCurrentTab('my-evaluation'); else setCurrentTab('dashboard'); }} hasCertifiedBadge={hasCertifiedBadge} onGrantBadge={() => setHasCertifiedBadge(true)} theme={theme} />}
          {currentTab === 'my-evaluation' && <MyEvaluation currentUser={currentUser} activePeriod={db.getMiscData<string>('pe_active_period', '')} evaluations={evaluations} profiles={profiles} criteria={criteria} onUpdateEvaluation={handleUpdateEvaluation} theme={theme} />}
          {currentTab === 'rewards' && currentUser.role === 'admin' && <RewardCalculationCenter evaluations={evaluations} employees={employees} profiles={profiles} theme={theme} onBulkUpdateEvaluations={handleBulkUpdateEvaluations} />}
          {currentTab === 'settings' && (
            currentUser.role === 'admin' ? (
              <ManagementCenter 
                employees={employees} 
                profiles={profiles} 
                criteria={criteria} 
                evaluations={evaluations} 
                archivedEvaluations={archivedEvaluations}
                onSetEmployees={handleBulkUpdateEmployees} 
                onSetProfiles={handleSetProfiles} 
                onSetCriteria={handleSetCriteria} 
                onSetEvaluations={handleBulkUpdateEvaluations} 
                onSetArchivedEvaluations={handleSetArchivedEvaluations}
                currentUser={currentUser} 
                theme={theme} 
                onForceReauth={handleForceAdminReauth}
              />
            ) : (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-3xl p-8 text-center space-y-4 max-w-lg mx-auto mt-12 shadow-xl">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
                  <LockKeyhole className="w-6 h-6" />
                </div>
                <h3 className="text-base font-black text-rose-700 dark:text-rose-300">عدم دسترسی مجاز به پرتال مدیریت</h3>
                <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  تنظیمات پیشرفته و مرکز مدیریت سامانه منحصراً در اختیار مدیریت ارشد منابع انسانی با کلمه عبور اختصاصی می‌باشد.
                </p>
                <button
                  type="button"
                  onClick={() => setCurrentTab(currentUser.role === 'employee' ? 'my-evaluation' : 'dashboard')}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  بازگشت به داشبورد
                </button>
              </div>
            )
          )}
          </Suspense>
          </div>
        </div>
      </main>

      {contextMenu?.visible && (
        <div className={`fixed rounded-2xl border p-2 w-72 shadow-2xl z-50 text-right animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl ${theme === 'dark' ? 'bg-slate-900/95 border-slate-800 text-slate-200 shadow-teal-950/30' : 'bg-white/95 border-slate-200 text-slate-800 shadow-slate-300'}`} style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          <div className="px-3 py-2 border-b border-slate-800/15 text-[10px] font-black text-slate-400 flex justify-between items-center">
            <span className="flex items-center gap-1.5 text-teal-400"><Sparkles className="w-3.5 h-3.5" /> میانبرهای ویژه</span>
            <span className="text-[9px] bg-teal-500/10 text-teal-400 px-1.5 py-0.5 rounded font-mono">v3.5 CF</span>
          </div>
          <div className="p-1 space-y-0.5 mt-1 text-xs">
            {currentUser.role !== 'employee' ? (
              <>
                <button type="button" onClick={() => { setCurrentTab('dashboard'); setContextMenu(null); }} className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-teal-500/10 hover:text-teal-400 transition-all cursor-pointer">
                  <div className="flex items-center gap-2"><Home className="w-3.5 h-3.5 text-teal-500" /><span>داشبورد من</span></div>
                  <span className="text-[10px] text-slate-500 font-mono">Alt+1</span>
                </button>
                <button type="button" onClick={() => { setCurrentTab('evaluations'); setContextMenu(null); }} className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-teal-500/10 hover:text-teal-400 transition-all cursor-pointer">
                  <div className="flex items-center gap-2"><ClipboardCheck className="w-3.5 h-3.5 text-teal-500" /><span>ارزیابی‌ها</span></div>
                  <span className="text-[10px] text-slate-500 font-mono">Alt+2</span>
                </button>
              </>
            ) : (
              <button type="button" onClick={() => { setCurrentTab('my-evaluation'); setContextMenu(null); }} className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-teal-500/10 hover:text-teal-400 transition-all cursor-pointer">
                <div className="flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5 text-teal-500" /><span>ارزیابی من</span></div>
                <span className="text-[10px] text-slate-500 font-mono">Alt+1</span>
              </button>
            )}
            {currentUser.role === 'admin' && (
              <button type="button" onClick={() => { setCurrentTab('settings'); setContextMenu(null); }} className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-rose-500/10 hover:text-rose-400 transition-all cursor-pointer">
                <div className="flex items-center gap-2"><LockKeyhole className="w-3.5 h-3.5 text-rose-500" /><span>تنظیمات پیشرفته</span></div>
                <span className="text-[10px] text-rose-400 font-mono">SuperAdmin</span>
              </button>
            )}
            <hr className={`my-1 ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`} />
            <button type="button" onClick={handleForceCloudSync} className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-sky-500/10 hover:text-sky-400 transition-all cursor-pointer text-sky-400">
              <div className="flex items-center gap-2"><UploadCloud className="w-3.5 h-3.5" /><span>همگام‌سازی ابری اکنون</span></div>
              <span className="text-[10px] text-sky-400 font-mono">Sync</span>
            </button>
            <button type="button" onClick={handleQuickJSONBackup} className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-indigo-500/10 hover:text-indigo-400 transition-all cursor-pointer text-indigo-400">
              <div className="flex items-center gap-2"><Download className="w-3.5 h-3.5" /><span>بکاپ سریع (JSON)</span></div>
              <span className="text-[10px] text-indigo-400 font-mono">Backup</span>
            </button>
            <button type="button" onClick={() => { setContextMenu(null); setIsManualModalOpen(true); }} className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-teal-500/10 hover:text-teal-400 transition-all cursor-pointer text-teal-400">
              <div className="flex items-center gap-2"><BookOpen className="w-3.5 h-3.5" /><span>کتابچه راهنمای جامع (PDF)</span></div>
              <span className="text-[10px] text-teal-400 font-mono">Manual</span>
            </button>
            <button type="button" onClick={() => { setContextMenu(null); window.print(); }} className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-teal-500/10 hover:text-teal-400 transition-all cursor-pointer">
              <div className="flex items-center gap-2"><Printer className="w-3.5 h-3.5" /><span>پرینت / PDF گزارش</span></div>
              <span className="text-[10px] text-slate-500 font-mono">Ctrl+P</span>
            </button>
            <button type="button" onClick={() => { handleToggleTheme(); setContextMenu(null); }} className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-teal-500/10 hover:text-teal-400 transition-all cursor-pointer">
              <div className="flex items-center gap-2">{theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-500" />}<span>تغییر قالب</span></div>
              <span className="text-[10px] text-slate-500">{theme === 'dark' ? 'روشن' : 'تاریک'}</span>
            </button>
            <button type="button" onClick={() => { handleStartTour(); setContextMenu(null); }} className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-teal-500/10 hover:text-teal-400 transition-all cursor-pointer">
              <div className="flex items-center gap-2"><HelpCircle className="w-3.5 h-3.5 text-teal-400" /><span>آموزش مجدد</span></div>
              <span className="text-[10px] text-slate-500 font-mono">Tour</span>
            </button>
            <hr className={`my-1 ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`} />
            <div className="px-3 py-1 text-[10px] text-slate-500 flex justify-between items-center">
              <span className="truncate">{currentUser.name}</span><span className="font-mono">{currentUser.code}</span>
            </div>
            <button type="button" onClick={() => { handleLogout(); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer font-bold">
              <LogOut className="w-3.5 h-3.5" /><span>خروج از حساب</span>
            </button>
          </div>
        </div>
      )}
      
       {activeTourStep !== null && currentTourSteps[activeTourStep] && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-[999] p-4 font-sans text-right" dir="rtl">
           <div className="bg-slate-900 border border-teal-500/40 p-6 rounded-3xl max-w-md w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
             <div className="flex justify-between items-center border-b border-slate-800 pb-3">
               <div className="flex items-center gap-2">
                 <div className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-ping" />
                 <h3 className="text-sm font-black text-teal-400">راهنمای هوشمند</h3>
               </div>
               <span className="text-[10px] bg-slate-800 border border-slate-700 text-slate-400 px-2.5 py-1 rounded-lg font-mono">{activeTourStep + 1} از {currentTourSteps.length}</span>
             </div>
             <div className="space-y-2">
               <h4 className="text-sm font-black text-slate-100">{currentTourSteps[activeTourStep].title}</h4>
               <p className="text-xs text-slate-400 leading-relaxed font-medium">{currentTourSteps[activeTourStep].desc}</p>
             </div>
             <div className="flex justify-between items-center pt-2">
               <button type="button" onClick={() => setActiveTourStep(null)} className="text-xs text-slate-500 hover:text-slate-300 font-bold transition-colors cursor-pointer">بستن آموزش</button>
               <div className="flex items-center gap-2">
                 {activeTourStep > 0 && <button type="button" onClick={handlePrevTourStep} className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer border border-slate-700">قبلی</button>}
                 <button type="button" onClick={handleNextTourStep} className="bg-teal-500 hover:bg-teal-600 text-slate-950 font-black px-4 py-2 rounded-xl text-xs transition-all shadow-lg shadow-teal-500/20 cursor-pointer">
                   {activeTourStep === currentTourSteps.length - 1 ? 'پایان' : 'بعدی'}
                 </button>
               </div>
             </div>
           </div>
        </div>
      )}

      {/* Comprehensive System Manual & Printable PDF Guide Modal */}
      <Suspense fallback={null}>
        <ComprehensiveManualModal
          isOpen={isManualModalOpen}
          onClose={() => setIsManualModalOpen(false)}
          theme={theme}
          currentUser={currentUser}
          employees={employees}
        />
      </Suspense>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { validateJobProfileInput } from '../utils/validation';
import { 
  Briefcase, 
  Plus, 
  Lock, 
  Unlock, 
  Trash2, 
  Edit3, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Info,
  Scale,
  Download,
  UploadCloud,
  FileSpreadsheet,
  Layers,
  Sparkles,
  PlusCircle
} from 'lucide-react';
import { 
  JobProfile, 
  Criterion, 
  ProfileItem, 
  Employee,
  MIN_WEIGHT, 
  MAX_WEIGHT, 
  MAX_CRITERIA_COUNT,
  CATEGORIES,
  CategoryKey
} from '../types';
import UniversalDataExchange, { DataExchangeConfig } from './UniversalDataExchange';

interface JobProfilesProps {
  profiles: JobProfile[];
  criteria: Criterion[];
  onAddProfile: (prof: Omit<JobProfile, 'id'>) => void;
  onUpdateProfile: (id: string, prof: Omit<JobProfile, 'id'>) => void;
  onDeleteProfile: (id: string) => void;
  onBulkDeleteProfiles?: (ids: string[]) => void;
  onToggleLockProfile: (id: string) => void;
  onAddCriterion?: (crit: Omit<Criterion, 'id'>) => boolean;
  theme?: 'dark' | 'light';
  currentUser?: Employee | null;
}

export default function JobProfiles({
  profiles,
  criteria,
  onAddProfile,
  onUpdateProfile,
  onDeleteProfile,
  onBulkDeleteProfiles,
  onToggleLockProfile,
  onAddCriterion,
  theme = 'dark',
  currentUser
}: JobProfilesProps) {
  const isAdmin = currentUser?.role === 'admin' || currentUser?.username === 'admin' || currentUser?.code === 'ADMIN-001';
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isExchangeModalOpen, setIsExchangeModalOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState<JobProfile | null>(null);
  const [selectedProfileIds, setSelectedProfileIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  const handleToggleSelectProfile = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const next = new Set(selectedProfileIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedProfileIds(next);
  };

  const handleToggleSelectAllProfiles = () => {
    if (selectedProfileIds.size === profiles.length) {
      setSelectedProfileIds(new Set());
    } else {
      setSelectedProfileIds(new Set(profiles.map(p => p.id)));
    }
  };

  // Handle saving (create or update) a job profile
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: string[] = [];
    if (!formTitle.trim()) errors.push('عنوان شغلی الزامی است.');
    if (!formCode.trim()) errors.push('کد شغلی الزامی است.');
    if (!formFamily.trim()) errors.push('خانواده شغلی الزامی است.');
    // Check that weights sum to 100
    if (totalCurrentWeight !== 100) errors.push('مجموع اوزان شاخص‌ها باید دقیقاً ۱۰۰٪ باشد.');
    // HSE is optional — no mandatory safety criterion enforcement
    if (errors.length > 0) {
      setErrorMsg(errors.join('\n'));
      return;
    }
    const profile: Omit<JobProfile, 'id'> = {
      title: formTitle.trim(),
      code: formCode.trim().toUpperCase(),
      family: formFamily.trim(),
      items: selectedItems,
      baseRewardAmount: formBaseReward,
      locked: false,
    };
    setErrorMsg('');
    if (editingId) {
      onUpdateProfile(editingId, profile);
    } else {
      onAddProfile(profile);
    }
    setIsModalOpen(false);
  };

  const handleConfirmBulkDelete = () => {
    if (selectedProfileIds.size === 0) return;
    if (onBulkDeleteProfiles) {
      onBulkDeleteProfiles(Array.from(selectedProfileIds));
    } else {
      selectedProfileIds.forEach(id => onDeleteProfile(id));
    }
    setSelectedProfileIds(new Set());
    setIsBulkDeleteModalOpen(false);
  };

  // Quick Criterion Add inside Profile Modal
  const [isQuickCritOpen, setIsQuickCritOpen] = useState(false);
  const [quickCritName, setQuickCritName] = useState('');
  const [quickCritCode, setQuickCritCode] = useState('');
  const [quickCritCat, setQuickCritCat] = useState<CategoryKey>('K');
  const [quickCritDef, setQuickCritDef] = useState('');
  const [quickCritError, setQuickCritError] = useState('');

  // Form values
  const [formTitle, setFormTitle] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formFamily, setFormFamily] = useState('');
  const [formBaseReward, setFormBaseReward] = useState<number | undefined>(undefined);
  
  // Array of { cid: string, weight: number } for the profile
  const [selectedItems, setSelectedItems] = useState<ProfileItem[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  // Data Exchange Configuration for Profiles
  const profilesExchangeConfig: DataExchangeConfig<JobProfile> = {
    entityName: 'پروفایل‌ها و ماتریس‌های اوزان شغلی',
    entityKey: 'job_profiles',
    items: profiles,
    csvHeaders: [
      { key: 'title', label: 'عنوان رده شغلی' },
      { key: 'code', label: 'کد شغل' },
      { key: 'family', label: 'خانواده شغلی' },
      { key: 'itemsCount', label: 'تعداد شاخص‌ها', accessor: (p) => p.items.length },
      { 
        key: 'itemsSummary', 
        label: 'شاخص‌ها و اوزان', 
        accessor: (p) => p.items.map(i => {
          const c = criteria.find(cr => cr.id === i.cid);
          return `${c?.code || i.cid}(${i.weight}%)`;
        }).join(' | ') 
      },
      { key: 'locked', label: 'وضعیت تصویب', accessor: (p) => p.locked ? 'تصویب شده' : 'پیش‌نویس' }
    ],
    templateSampleRows: [
      { 'عنوان رده شغلی': 'اپراتور ارشد تراشکاری CNC', 'کد شغل': 'OP-CNC-01', 'خانواده شغلی': 'فنی مهندسی', 'تعداد شاخص‌ها': '5', 'شاخص‌ها و اوزان': 'K-PRD-01(25%) | B-HSE-01(20%) | K-QC-01(20%) | B-TEAM-01(20%) | B-5S-01(15%)', 'وضعیت تصویب': 'تصویب شده' }
    ],
    onImport: (importedItems, mode) => {
      let count = 0;
      const errors: string[] = [];

      importedItems.forEach((item: any, index: number) => {
        const rowNum = index + 1;
        const title = (item.title || item['عنوان رده شغلی'] || 'شغل جدید').trim();
        const code = (item.code || item['کد شغل'] || `P-${Math.floor(Math.random() * 1000)}`).trim().toUpperCase();
        const family = (item.family || item['خانواده شغلی'] || 'تولید').trim();
        
        let items: ProfileItem[] = [];
        if (Array.isArray(item.items)) {
          items = item.items;
        } else {
          // Try to parse summary string like: "K-PRD-01(25%) | B-HSE-01(20%)"
          const summaryStr = (item.itemsSummary || item['شاخص‌ها و اوزان'] || '').toString();
          if (summaryStr) {
            const segments = summaryStr.split(/[|,;]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
            segments.forEach((seg: string) => {
              const match = seg.match(/^([A-Za-z0-9\-_]+)\s*\(?\s*(\d+)\s*%?\)?/);
              if (match) {
                const critCode = match[1].trim();
                const weight = parseInt(match[2], 10);
                const matchedCrit = criteria.find(c => c.code.toLowerCase() === critCode.toLowerCase() || c.id === critCode);
                if (matchedCrit) {
                  items.push({ cid: matchedCrit.id, weight });
                }
              }
            });
          }

          // Fallback if no criteria parsed: leave empty (HSE is optional)
          // No auto-inclusion of mandatory safety criterion
        }

        const candidate = {
          title,
          code,
          family,
          items,
          locked: false
        };

        const validation = validateJobProfileInput(candidate);
        if (!validation.success) {
          errors.push(`سطر ${rowNum} (${title} - ${code}): ${validation.errors.join('، ')}`);
          return;
        }

        const validProfile = validation.data;
        const existing = profiles.find(p => p.code.toLowerCase() === validProfile.code.toLowerCase());

        if (existing) {
          if (mode === 'replace' || mode === 'merge') {
            onUpdateProfile(existing.id, validProfile);
            count++;
          }
        } else {
          onAddProfile(validProfile);
          count++;
        }
      });

      return {
        count,
        message: `تعداد ${count} پروفایل و الگوی شایستگی شغلی با موفقیت ثبت و به‌روزرسانی شد.`,
        errors
      };
    }
  };

  // Helper to validate profile weights and requirements
  const validateProfileItems = (items: ProfileItem[]): { ok: boolean; errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      errors.push(`مجموع وزن‌ها باید دقیقاً ۱۰۰٪ باشد. مجموع فعلی شما ${totalWeight}٪ است.`);
    }

    items.forEach((item) => {
      const crit = criteria.find(c => c.id === item.cid);
      if (item.weight < MIN_WEIGHT || item.weight > MAX_WEIGHT) {
        errors.push(`وزن معیار «${crit?.code || item.cid}» باید بین ${MIN_WEIGHT}٪ تا ${MAX_WEIGHT}٪ باشد (مقدار فعلی: ${item.weight}٪).`);
      }
    });

    // HSE is optional — no mandatory safety criterion enforcement

    if (items.length > MAX_CRITERIA_COUNT) {
      warnings.push(`تعداد معیارهای انتخابی (${items.length} شاخص) بیش از حد توصیه‌شده (${MAX_CRITERIA_COUNT} شاخص) است. شلوغی بیش از حد تمرکز فرد را کاهش می‌دهد.`);
    }

    const uniqueCategories = new Set(
      items.map(item => criteria.find(c => c.id === item.cid)?.cat).filter(Boolean)
    );
    if (uniqueCategories.size < 2) {
      errors.push('نمایه شایستگی نباید تک‌بعدی باشد. ترکیب حداقل دو بعد (مثلاً خروجی کمی و رفتارهای کیفی) الزامی است.');
    }

    return {
      ok: errors.length === 0,
      errors,
      warnings
    };
  };

  const openForm = (prof?: JobProfile) => {
    if (prof) {
      if (prof.locked) {
        alert('این پروفایل قفل و تایید نهایی شده است. برای ویرایش، ابتدا قفل آن را باز کنید.');
        return;
      }
      setEditingId(prof.id);
      setFormTitle(prof.title);
      setFormCode(prof.code);
      setFormFamily(prof.family);
    setFormBaseReward(prof.baseRewardAmount);
      setSelectedItems([...prof.items]);
    } else {
      setEditingId(null);
      setFormTitle('');
      setFormCode('');
      setFormFamily('');
    setFormBaseReward(undefined);
      // HSE is optional — start with empty selected items, no auto-include
      setSelectedItems([]);
    }
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleToggleCriterion = (cid: string) => {
    const exists = selectedItems.find(i => i.cid === cid);
    if (exists) {
      setSelectedItems(selectedItems.filter(i => i.cid !== cid));
    } else {
      setSelectedItems([...selectedItems, { cid, weight: 10 }]);
    }
  };

  const handleWeightChange = (cid: string, weight: number) => {
    setSelectedItems(
      selectedItems.map(i => i.cid === cid ? { ...i, weight } : i)
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const validationItems = validateProfileItems(selectedItems);
    if (!validationItems.ok) {
      setErrorMsg(validationItems.errors[0]); // Show first error
      return;
    }

    const rawData = {
      title: formTitle,
      code: formCode,
      family: formFamily || 'عمومی',
      items: selectedItems,
      locked: false,
      baseRewardAmount: formBaseReward
    };

    const validation = validateJobProfileInput(rawData);
    if (!validation.success) {
      setErrorMsg(validation.errors.join(' | '));
      return;
    }

    const payload = validation.data;

    if (editingId) {
      onUpdateProfile(editingId, payload);
    } else {
      onAddProfile(payload);
    }

    setIsModalOpen(false);
  };

  const totalCurrentWeight = selectedItems.reduce((sum, item) => sum + item.weight, 0);


  return (
<div className="app-page space-y-7 text-right" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-end flex-wrap gap-5 border-b border-slate-200/80 pb-5 dark:border-slate-800/80">
        <div className="max-w-2xl">
          <p className="mb-1.5 text-xs font-bold text-teal-700 dark:text-teal-300">ساختار شغل و چارچوب ارزیابی</p>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <span className="bg-teal-500/10 text-teal-700 dark:text-teal-300 p-2 rounded-xl" aria-hidden="true">
              <Briefcase className="h-5 w-5" />
            </span>
            مدیریت پروفایل‌های شغلی
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-7">
            تعریف شناسنامه ارزیابی برای هر شغل
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          
          {selectedProfileIds.size > 0 && (
            <button
              onClick={() => setIsBulkDeleteModalOpen(true)}
              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 border border-rose-500/20 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>حذف گروهی ({selectedProfileIds.size})</span>
            </button>
          )}
          <button
            onClick={() => {
              setEditingId(null);
              setFormTitle('');
              setFormCode('');
              setFormFamily('');
              setFormBaseReward(undefined);
              setSelectedItems([]);
              setErrorMsg('');
              setIsModalOpen(true);
            }}
            className="bg-teal-600 hover:bg-teal-500 text-white font-black px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition-colors cursor-pointer"
          >
            افزودن پروفایل جدید
          </button>
        </div>
      </div>

      {/* Profiles Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {profiles.map(p => (

          <div key={p.id} className={`p-5 rounded-2xl border flex flex-col gap-4 transition-all shadow-sm ${selectedProfileIds.has(p.id) ? 'bg-indigo-50 border-indigo-300 dark:bg-indigo-900/20 dark:border-indigo-500/50' : 'bg-white border-slate-200 hover:border-slate-300 dark:bg-slate-900/80 dark:border-slate-800 dark:hover:border-slate-700'}`}>
             <div className="flex justify-between items-start">
               <div className="flex items-start gap-3">
                 <input
                   type="checkbox"
                   checked={selectedProfileIds.has(p.id)}
                   onChange={(e) => handleToggleSelectProfile(p.id, e as any)}
                   className="mt-1 w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500/30 focus:ring-offset-0 cursor-pointer"
                 />
                 <div>

                 <h3 className="font-bold text-slate-200">{p.title}</h3>
                 <div className="text-xs text-slate-400 mt-1 space-y-1">
                   <p>کد: <span className="font-mono text-teal-400">{p.code}</span></p>
                   <p>خانواده شغلی: {p.family}</p>
                   {p.baseRewardAmount ? <p className="text-emerald-400">ضریب پایه: {new Intl.NumberFormat('fa-IR').format(p.baseRewardAmount)} ریال</p> : null}
                 </div>
               </div>
               </div>
               <div className="flex gap-2">
                 <button onClick={() => {
                    setEditingId(p.id);
                    setFormTitle(p.title);
                    setFormCode(p.code);
                    setFormFamily(p.family);
                    setFormBaseReward(p.baseRewardAmount);
                    setSelectedItems([...(p.items || [])]);
                    setErrorMsg('');
                    setIsModalOpen(true);
                 }} className="text-blue-400 hover:text-blue-300 text-xs">ویرایش</button>
                 <button onClick={() => onDeleteProfile(p.id)} className="text-rose-400 hover:text-rose-300 text-xs">حذف</button>
               </div>
             </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in" dir="rtl">
          <form onSubmit={handleSaveProfile} className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center shrink-0">
              <h2 className="font-black text-slate-100">{editingId ? 'ویرایش پروفایل' : 'افزودن پروفایل جدید'}</h2>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-200 cursor-pointer">بستن</button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 text-sm text-slate-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-bold mb-1 text-slate-300">عنوان شغلی</label>
                  <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)} className="w-full px-3 py-2 rounded-xl border bg-slate-900 border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="مثال: سرپرست تولید" />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1 text-slate-300">کد شغلی</label>
                  <input type="text" value={formCode} onChange={e => setFormCode(e.target.value)} className="w-full px-3 py-2 rounded-xl border bg-slate-900 border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="مثال: PRD-01" />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1 text-slate-300">خانواده شغلی</label>
                  <input type="text" value={formFamily} onChange={e => setFormFamily(e.target.value)} className="w-full px-3 py-2 rounded-xl border bg-slate-900 border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="مثال: تولید، مهندسی..." />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1 text-slate-300">ضریب ریالی (مبلغ پایه پاداش به ریال)</label>
                  <input type="number" value={formBaseReward || ''} onChange={e => setFormBaseReward(e.target.value ? Number(e.target.value) : undefined)} className="w-full px-3 py-2 rounded-xl border bg-slate-900 border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="مبلغ پیش‌فرض (اختیاری)" />
                </div>
              </div>
{/* Criterion Selector & Weighting list */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <label className="font-bold text-slate-300">شاخص‌های ارزیابی و اوزان شایستگی</label>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickCritName('');
                        setQuickCritCode(`K-${Date.now().toString().slice(-4)}`);
                        setQuickCritCat('K');
                        setQuickCritDef('');
                        setQuickCritError('');
                        setIsQuickCritOpen(!isQuickCritOpen);
                      }}
                      className="text-[11px] bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>تعریف و افزودن شاخص جدید به بانک معیارها</span>
                    </button>
                  </div>
                  <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                    totalCurrentWeight === 100 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-orange-500/10 text-orange-400'
                  }`}>
                    مجموع اوزان فعلی: {totalCurrentWeight}٪ (باید دقیقاً ۱۰۰٪ باشد)
                  </span>
                </div>

                {/* Inline Quick Criterion Creation Box */}
                {isQuickCritOpen && (
                  <div className="p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl space-y-2.5 animate-in fade-in">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">تعریف شاخص جدید در بانک مرکزی معیارها:</span>
                      <button
                        type="button"
                        onClick={() => setIsQuickCritOpen(false)}
                        className="text-slate-400 hover:text-white text-xs cursor-pointer"
                      >
                        بستن
                      </button>
                    </div>

                    {quickCritError && (
                      <div className="text-[11px] text-rose-400 font-bold bg-rose-500/10 p-1.5 rounded-lg">
                        {quickCritError}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="نام شاخص جدید..."
                        value={quickCritName}
                        onChange={(e) => setQuickCritName(e.target.value)}
                        className="bg-slate-950 border border-indigo-500/40 rounded-xl py-1.5 px-2.5 text-xs text-slate-100 placeholder:text-slate-500"
                      />
                      <input
                        type="text"
                        placeholder="کد شاخص (مثل: K-PRD-05)..."
                        value={quickCritCode}
                        onChange={(e) => setQuickCritCode(e.target.value)}
                        className="bg-slate-950 border border-indigo-500/40 rounded-xl py-1.5 px-2.5 text-xs text-slate-100 font-mono"
                      />
                      <select
                        value={quickCritCat}
                        onChange={(e) => setQuickCritCat(e.target.value as CategoryKey)}
                        className="bg-slate-950 border border-indigo-500/40 rounded-xl py-1.5 px-2.5 text-xs text-slate-100"
                      >
                        <option value="K">خروجی و عملکرد کمی (K)</option>
                        <option value="B">شایستگی‌های رفتاری (B)</option>
                        <option value="Q">کیفیت و مهارت تخصصی (Q)</option>
                        <option value="S">نظم، ایمنی و HSE (S)</option>
                        <option value="M">مدیریت و رهبری (M)</option>
                      </select>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="تعریف عملیاتی و سنجه..."
                        value={quickCritDef}
                        onChange={(e) => setQuickCritDef(e.target.value)}
                        className="flex-1 bg-slate-950 border border-indigo-500/40 rounded-xl py-1.5 px-2.5 text-xs text-slate-100 placeholder:text-slate-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!quickCritName.trim() || !quickCritCode.trim()) {
                            setQuickCritError('نام و کد شاخص الزامی است.');
                            return;
                          }
                          if (onAddCriterion) {
                            const success = onAddCriterion({
                              code: quickCritCode.trim(),
                              name: quickCritName.trim(),
                              cat: quickCritCat,
                              def: quickCritDef.trim() || `تعریف عملیاتی ${quickCritName}`,
                              dir: 'more'
                            });
                            if (success) {
                              // We also need to select it
                              const found = criteria.find(c => c.code.toLowerCase() === quickCritCode.trim().toLowerCase());
                              if (found) {
                                setSelectedItems(prev => [...prev, { cid: found.id, weight: 10 }]);
                              }
                              setIsQuickCritOpen(false);
                            } else {
                              setQuickCritError('کد شاخص تکراری است یا با خطا مواجه شد.');
                            }
                          }
                        }}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-1.5 rounded-xl text-xs cursor-pointer shadow-md"
                      >
                        ثبت در بانک معیارها
                      </button>
                    </div>
                  </div>
                )}

                <div className="border border-slate-800 rounded-xl overflow-hidden max-h-64 overflow-y-auto divide-y divide-slate-800/60 bg-slate-950/40">
                  {criteria.map((c) => {
                    const matchedItem = selectedItems.find(i => i.cid === c.id);
                    const isSelected = !!matchedItem;

                    return (
                      <div 
                        key={c.id} 
                        className={`p-3 flex justify-between items-center transition-colors ${
                          isSelected ? 'bg-slate-800/10' : ''
                        }`}
                      >
                        <label className="flex items-center gap-3 cursor-pointer text-xs font-semibold text-slate-200 select-none flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleCriterion(c.id)}
                            className="rounded text-teal-500 focus:ring-teal-500 bg-slate-900 border-slate-700 w-4 h-4"
                          />
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                            c.cat === 'K' ? 'bg-blue-500/10 text-blue-400' :
                            c.cat === 'Q' ? 'bg-amber-500/10 text-amber-300' :
                            c.cat === 'B' ? 'bg-purple-500/10 text-purple-300' :
                            c.cat === 'S' ? 'bg-red-500/10 text-red-400' :
                            'bg-emerald-500/10 text-emerald-300'
                          }`}>
                            {c.code}
                          </span>
                          <span className="truncate">{c.name}</span>
                        </label>

                        {isSelected && (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-slate-500 font-medium">وزن:</span>
                            <input
                              type="number"
                              min="5"
                              max="25"
                              required
                              value={matchedItem.weight}
                              onChange={(e) => handleWeightChange(c.id, parseInt(e.target.value) || 0)}
                              className="w-16 bg-slate-950 border border-slate-800 rounded-lg py-1 px-2 text-xs text-center text-slate-200 font-bold font-mono focus:outline-none focus:border-teal-500"
                            />
                            <span className="text-xs text-slate-400">%</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={errorMsg !== '' && totalCurrentWeight !== 100}
                  className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-slate-900 rounded-xl text-xs font-bold cursor-pointer"
                >
                  ذخیره الگو
                </button>
              </div>
              {errorMsg && (
                <div className="p-3 bg-rose-500/10 border-t border-rose-500/30 text-rose-300 text-xs whitespace-pre-line">
                  {errorMsg}
                </div>
              )}
            </div>
            </form>
        </div>,
        document.body
      )}

      {/* Universal Data Exchange Modal for Job Profiles */}
      <UniversalDataExchange
        config={profilesExchangeConfig}
        isOpen={isExchangeModalOpen}
        onClose={() => setIsExchangeModalOpen(false)}
        theme={theme}
      />

      {/* Delete Single Profile Confirmation Modal */}
      {profileToDelete && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-right animate-in fade-in my-auto">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-100">تایید حذف پروفایل شایستگی شغلی</h3>
                <p className="text-[11px] text-slate-400">کد شغل: {profileToDelete.code}</p>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>عنوان شغل:</span>
                <span className="font-bold text-slate-100">{profileToDelete.title}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>خانواده شغلی:</span>
                <span className="text-teal-400">{profileToDelete.family}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>تعداد شاخص‌های مرتبط:</span>
                <span className="font-bold font-mono">{profileToDelete.items.length} شاخص</span>
              </div>
            </div>

            <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-300 leading-relaxed">
              <p className="font-bold text-rose-200 mb-0.5">هشدار یکپارچگی ساختار:</p>
              <p>در صورت انتساب این پروفایل به کارکنان، رده شغلی پرسنل مرتبط آزاد شده تا بلافاصله بتوانید پروفایل جدید به آنها اختصاص دهید.</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setProfileToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition-all cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteProfile(profileToDelete.id);
                  setProfileToDelete(null);
                }}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all cursor-pointer shadow-lg shadow-rose-600/20 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تایید و حذف قطعی</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Bulk Delete Profiles Confirmation Modal */}
      {isBulkDeleteModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-right animate-in fade-in my-auto">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-100">تایید حذف گروهی پروفایل‌های شغلی</h3>
                <p className="text-[11px] text-slate-400">حذف همزمان {selectedProfileIds.size} پروفایل شغلی</p>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 space-y-2 text-xs max-h-48 overflow-y-auto">
              <div className="text-slate-400 font-medium mb-1">پروفایل‌های انتخاب‌شده برای حذف:</div>
              {Array.from(selectedProfileIds).map(id => {
                const p = profiles.find(item => item.id === id);
                return (
                  <div key={id} className="flex justify-between items-center py-1 border-b border-slate-900 text-slate-200 text-xs">
                    <span>{p?.title || 'پروفایل'}</span>
                    <span className="font-mono text-teal-400 text-[11px]">{p?.code}</span>
                  </div>
                );
              })}
            </div>

            <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-300 leading-relaxed">
              <p className="font-bold text-rose-200 mb-0.5">هشدار یکپارچگی داده‌ها:</p>
              <p>کلیه پروفایل‌های انتخاب‌شده حذف شده و پرسنل متصل به این رده‌ها آزاد می‌شوند.</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition-all cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDelete}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all cursor-pointer shadow-lg shadow-rose-600/20 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تایید و حذف گروهی ({selectedProfileIds.size} مورد)</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

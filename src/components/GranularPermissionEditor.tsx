import { useMemo, useState } from 'react';
import { db } from '../utils/db';
import { AUTHORIZATION_MODULES, MODULE_CAPABILITIES, getEffectivePermissionGrant, getWorkflowCeiling, readGranularPermissionPolicy, type AuthorizationCapability, type AuthorizationModule, type GranularPermissionPolicy, type PermissionScope } from '../utils/authorization';
import { WORKFLOW_STAGES, type Employee, type WorkflowStageKey } from '../types';

const moduleLabels: Record<AuthorizationModule, string> = {
  employees: 'کارکنان', evaluations: 'ارزیابی‌ها', mis: 'داده‌های MIS', workflow: 'گردش کار', cartable: 'کارتابل', reports: 'گزارش‌ها', analytics: 'تحلیل‌ها', criteria: 'معیارها', profiles: 'پروفایل‌ها', delegation: 'تفویض', calibration: 'کالیبراسیون', rewards: 'پاداش', administration: 'مدیریت', support: 'پشتیبانی', onboarding: 'راهنما',
};
const capabilityLabels: Record<AuthorizationCapability, string> = {
  view: 'مشاهده', create: 'ایجاد', edit: 'ویرایش', delete: 'حذف', bulk_edit: 'ویرایش گروهی', bulk_delete: 'حذف گروهی', import: 'درون‌ریزی', export: 'برون‌بری', submit: 'ارسال', return: 'بازگردانی', approve: 'تأیید', reassign: 'تغییر مسئول', delegate: 'تفویض اختیار', advance_workflow: 'پیشبرد گردش کار', finalize: 'نهایی‌سازی', route_hse: 'ارجاع پرونده به واحد HSE',
};
const scopeLabels: Record<PermissionScope['type'], string> = { own: 'سوابق خود', direct_reports: 'زیردستان مستقیم', own_unit: 'واحد خود', selected_units: 'واحدهای منتخب', authorized_employees: 'محدوده مجاز سازمانی', all: 'کل سازمان (فقط مدیر)' };
const stageOrder: WorkflowStageKey[] = ['self_review', 'supervisor_review', 'peer_review', 'calibration_review', 'hr_approval', 'feedback_meeting', 'completed'];
const stageCapabilityStages: WorkflowStageKey[] = [...stageOrder.slice(0, -1), 'hse_review', 'completed'];

export default function GranularPermissionEditor({ employees }: { employees: Employee[] }) {
  const [policy, setPolicy] = useState<GranularPermissionPolicy>(() => readGranularPermissionPolicy());
  const [selectedModule, setSelectedModule] = useState<AuthorizationModule>('workflow');
  const [selectedSupervisor, setSelectedSupervisor] = useState('');
  const [scopeTypes, setScopeTypes] = useState<Record<string, PermissionScope['type']>>({});
  const [unitsText, setUnitsText] = useState('');
  const supervisors = employees.filter(employee => employee.role === 'supervisor');
  const ownerKey = selectedSupervisor || '';
  const supervisor = supervisors.find(employee => employee.id === ownerKey);
  const moduleCapabilities = MODULE_CAPABILITIES[selectedModule];
  const activeGrants = useMemo(() => ownerKey ? policy.users?.[ownerKey] || {} : policy.roles?.supervisor || {}, [ownerKey, policy]);

  const getScope = (capability: AuthorizationCapability): PermissionScope | null => {
    const moduleGrants = activeGrants[selectedModule];
    if (moduleGrants && Object.prototype.hasOwnProperty.call(moduleGrants, capability)) return moduleGrants[capability] || null;
    if (ownerKey && policy.roles?.supervisor?.[selectedModule] && Object.prototype.hasOwnProperty.call(policy.roles.supervisor[selectedModule]!, capability)) return policy.roles.supervisor[selectedModule]![capability] || null;
    const person = supervisor || ({ id: 'preview', role: 'supervisor', unit: '', name: '', code: '', profileId: '', username: '' } as Employee);
    return getEffectivePermissionGrant(policy, person, selectedModule, capability);
  };

  const updateGrant = (capability: AuthorizationCapability, scope: PermissionScope | null) => {
    setPolicy(current => {
      const key = ownerKey ? 'users' : 'roles';
      if (key === 'users' && !ownerKey) return current;
      const collection = key === 'users' ? current.users || {} : current.roles || {};
      const grants = key === 'users' ? (collection as NonNullable<GranularPermissionPolicy['users']>)[ownerKey] || {} : (collection as NonNullable<GranularPermissionPolicy['roles']>).supervisor || {};
      const moduleGrants = { ...(grants[selectedModule] || {}), [capability]: scope };
      const nextGrants = { ...grants, [selectedModule]: moduleGrants };
      if (key === 'users') return { ...current, users: { ...current.users, [ownerKey]: nextGrants } };
      return { ...current, roles: { ...current.roles, supervisor: nextGrants } };
    });
  };

  const setCeiling = (stage: WorkflowStageKey) => setPolicy(current => ownerKey
    ? { ...current, userWorkflowCeilings: { ...current.userWorkflowCeilings, [ownerKey]: stage } }
    : { ...current, workflowCeilings: { ...current.workflowCeilings, supervisor: stage } });

  const getStageCapability = (stage: WorkflowStageKey, capability: 'view' | 'edit' | 'act' | 'advance') =>
    policy.userWorkflowStageCapabilities?.[ownerKey]?.[stage]?.[capability] ??
    policy.workflowStageCapabilities?.supervisor?.[stage]?.[capability] ??
    (capability === 'view' || capability === 'act' || (capability === 'edit' && stage === 'supervisor_review') || (capability === 'advance' && stage === 'supervisor_review'));

  const updateStageCapability = (stage: WorkflowStageKey, capability: 'view' | 'edit' | 'act' | 'advance', enabled: boolean) => setPolicy(current => ownerKey
    ? { ...current, userWorkflowStageCapabilities: { ...current.userWorkflowStageCapabilities, [ownerKey]: { ...current.userWorkflowStageCapabilities?.[ownerKey], [stage]: { ...current.userWorkflowStageCapabilities?.[ownerKey]?.[stage], [capability]: enabled } } } }
    : { ...current, workflowStageCapabilities: { ...current.workflowStageCapabilities, supervisor: { ...current.workflowStageCapabilities?.supervisor, [stage]: { ...current.workflowStageCapabilities?.supervisor?.[stage], [capability]: enabled } } } });

  const save = () => {
    db.saveMiscData('pe_granular_permissions', policy);
  };

  const selectedEffective = moduleCapabilities.filter(capability => getScope(capability));
  const activeCeiling = supervisor ? getWorkflowCeiling(supervisor, policy) : policy.workflowCeilings?.supervisor || 'supervisor_review';

  return <section className="rounded-3xl border border-indigo-500/25 bg-slate-900/70 p-5 space-y-5" dir="rtl">
    <header className="space-y-1">
      <h3 className="text-sm font-black text-slate-100">صلاحیت‌های دقیق سرپرست</h3>
      <p className="text-xs text-slate-400">ماژول ← عملیات ← محدوده. این تنظیمات در همگام‌سازی و مرز API نیز اعمال می‌شود.</p>
    </header>
    <div className="grid gap-3 md:grid-cols-3">
      <label className="text-xs text-slate-300">الگوی نقش یا سرپرست
        <select className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2" value={ownerKey} onChange={event => setSelectedSupervisor(event.target.value)}>
          <option value="">همه سرپرستان (الگوی نقش)</option>
          {supervisors.map(employee => <option key={employee.id} value={employee.id}>{employee.name} · {employee.code}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-300">حداکثر مرحله مجاز
        <select className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2" value={activeCeiling} onChange={event => setCeiling(event.target.value as WorkflowStageKey)}>
          {stageOrder.map(stage => <option key={stage} value={stage}>{WORKFLOW_STAGES[stage].label}</option>)}
        </select>
      </label>
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-5 text-amber-200">مرحله پیش‌فرض تا دریافت سیاست مالک، ارزیابی سرپرست است. تنظیم مرحله بالاتر اختیار گردش‌کار را تغییر می‌دهد.</div>
    </div>
    <div className="grid gap-4 lg:grid-cols-[minmax(10rem,15rem)_1fr]">
      <nav className="grid grid-cols-2 gap-1 lg:grid-cols-1">
        {AUTHORIZATION_MODULES.map(module => <button key={module} type="button" onClick={() => setSelectedModule(module)} className={`rounded-xl px-3 py-2 text-right text-xs ${selectedModule === module ? 'bg-teal-500/15 text-teal-200 ring-1 ring-teal-500/30' : 'bg-slate-950/60 text-slate-400 hover:text-slate-200'}`}>{moduleLabels[module]}</button>)}
      </nav>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-slate-100">{moduleLabels[selectedModule]} · عملیات و محدوده</h4>
          <div className="flex gap-2">
            <button type="button" className="text-[11px] text-teal-300" onClick={() => moduleCapabilities.forEach(capability => updateGrant(capability, { type: 'authorized_employees' }))}>انتخاب همه</button>
            <button type="button" className="text-[11px] text-rose-300" onClick={() => moduleCapabilities.forEach(capability => updateGrant(capability, null))}>پاک‌کردن</button>
          </div>
        </div>
        <div className="divide-y divide-slate-800 rounded-2xl border border-slate-800">
          {moduleCapabilities.map(capability => {
            const current = getScope(capability);
            const enabled = Boolean(current);
            const scopeType = scopeTypes[capability] || current?.type || 'authorized_employees';
            return <div key={capability} className="grid items-center gap-2 p-3 sm:grid-cols-[minmax(8rem,1fr)_auto_minmax(10rem,1fr)]">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-200"><input type="checkbox" checked={enabled} onChange={event => updateGrant(capability, event.target.checked ? ({ type: scopeType, ...(scopeType === 'selected_units' ? { unitIds: unitsText.split(',').map(item => item.trim()).filter(Boolean) } : {}) } as PermissionScope) : null)} />{capabilityLabels[capability]}</label>
              <span className="text-[10px] text-slate-500">{enabled ? 'مجاز' : 'مسدود'}</span>
              <div className="flex gap-2">
                <select disabled={!enabled} value={scopeType} onChange={event => { const type = event.target.value as PermissionScope['type']; setScopeTypes(current => ({ ...current, [capability]: type })); updateGrant(capability, type === 'selected_units' ? { type, unitIds: unitsText.split(',').map(item => item.trim()).filter(Boolean) } : { type } as PermissionScope); }} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-[10px] disabled:opacity-50">
                  {(['own', 'direct_reports', 'own_unit', 'selected_units', 'authorized_employees', 'all'] as PermissionScope['type'][]).map(type => <option key={type} value={type}>{scopeLabels[type]}</option>)}
                </select>
                {scopeType === 'selected_units' && <input aria-label="واحدهای منتخب" value={unitsText} onChange={event => { const value = event.target.value; setUnitsText(value); updateGrant(capability, { type: 'selected_units', unitIds: value.split(',').map(item => item.trim()).filter(Boolean) }); }} placeholder="نام واحدها با ویرگول" className="w-1/2 rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-[10px]" />}
              </div>
            </div>;
          })}
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-[11px] text-slate-300">موثر برای {ownerKey ? supervisor?.name : 'نقش سرپرست'}: {selectedEffective.length} عملیات فعال در این ماژول؛ محدوده هر عملیات کنار همان مورد نمایش داده می‌شود.</div>
      </div>
    </div>
    <div className="space-y-2">
      <h4 className="font-bold text-slate-100">اختیار بر اساس مرحله</h4>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {stageCapabilityStages.map(stage => <div key={stage} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <div className="mb-2 text-xs font-bold text-slate-200">{WORKFLOW_STAGES[stage].label}</div>
          <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-400">
            {(['view', 'edit', 'act', 'advance'] as const).map(capability => {
              const checked = getStageCapability(stage, capability);
              return <label key={capability} className="flex items-center gap-1"><input type="checkbox" checked={checked} onChange={event => updateStageCapability(stage, capability, event.target.checked)} />{capability === 'view' ? 'مشاهده' : capability === 'edit' ? 'ویرایش' : capability === 'act' ? 'اقدام' : 'پیشبرد'}</label>;
            })}
          </div>
        </div>)}
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
      <span className="text-[11px] text-slate-500">پیش‌نمایش: {selectedEffective.length ? selectedEffective.map(cap => capabilityLabels[cap]).join('، ') : 'بدون دسترسی'} · سقف: {WORKFLOW_STAGES[activeCeiling].label}</span>
      <button type="button" onClick={save} className="rounded-xl bg-teal-500 px-4 py-2 text-xs font-black text-slate-950">ذخیره و ثبت ممیزی</button>
    </div>
  </section>;
}

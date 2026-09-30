import { useMemo, useState } from 'react';
import { db } from '../utils/db';
import {
  AUTHORIZATION_MODULES,
  MODULE_CAPABILITIES,
  getEffectivePermissionGrant,
  getWorkflowCeiling,
  readGranularPermissionPolicy,
  type AuthorizationCapability,
  type AuthorizationModule,
  type GranularPermissionPolicy,
  type PermissionScope,
} from '../utils/authorization';
import { WORKFLOW_STAGES, type Employee, type WorkflowStageKey } from '../types';
import { rankEmployeesBySearch } from '../utils/personnelSearch';

const moduleLabels: Record<AuthorizationModule, string> = {
  employees: 'کارکنان', evaluations: 'ارزیابی‌ها', mis: 'داده‌های MIS و کسری', workflow: 'گردش کار', cartable: 'کارتابل',
  reports: 'گزارش‌ها', analytics: 'تحلیل‌ها', criteria: 'معیارها', profiles: 'پروفایل‌ها', delegation: 'تفویض',
  calibration: 'کالیبراسیون', rewards: 'پاداش', administration: 'مدیریت', support: 'پشتیبانی', onboarding: 'راهنما',
};
const capabilityLabels: Record<AuthorizationCapability, string> = {
  view: 'مشاهده', create: 'ایجاد', edit: 'ویرایش', delete: 'حذف', bulk_edit: 'ویرایش گروهی', bulk_delete: 'حذف گروهی',
  import: 'درون‌ریزی عمومی', export: 'برون‌بری', submit: 'ارسال', return: 'بازگردانی', approve: 'تأیید', reassign: 'تغییر مسئول',
  delegate: 'تفویض اختیار', advance_workflow: 'پیشبرد گردش کار', finalize: 'نهایی‌سازی', route_hse: 'ارجاع به HSE', bulk_score: 'امتیازدهی گروهی',
  employee_import: 'درون‌ریزی کارکنان', criteria_import: 'درون‌ریزی معیارها', mis_import: 'درون‌ریزی MIS', kasra_import: 'درون‌ریزی کسری',
};
const scopeLabels: Record<PermissionScope['type'], string> = {
  own: 'سوابق خود', direct_reports: 'زیردستان مستقیم', own_unit: 'واحد خود', selected_units: 'واحدهای منتخب',
  authorized_employees: 'محدوده مجاز سازمانی', all: 'کل سازمان',
};
const stages: WorkflowStageKey[] = ['self_review', 'supervisor_review', 'peer_review', 'calibration_review', 'hr_approval', 'feedback_meeting', 'hse_review', 'completed'];
const roles: Array<{ value: Employee['role']; label: string }> = [
  { value: 'supervisor', label: 'الگوی نقش سرپرست' },
  { value: 'employee', label: 'الگوی نقش کارمند' },
];

function withoutCapability(grants: GranularPermissionPolicy['users'] | GranularPermissionPolicy['roles'], owner: string, module: AuthorizationModule, capability: AuthorizationCapability) {
  const existing = (grants as Record<string, any> | undefined)?.[owner] || {};
  const moduleGrants = { ...(existing[module] || {}) };
  delete moduleGrants[capability];
  const nextModules = { ...existing, [module]: moduleGrants };
  return { ...(grants || {}), [owner]: nextModules };
}

export default function GranularPermissionEditor({ employees }: { employees: Employee[] }) {
  const [policy, setPolicy] = useState<GranularPermissionPolicy>(() => readGranularPermissionPolicy());
  const [selectedTarget, setSelectedTarget] = useState('role:supervisor');
  const [selectedModule, setSelectedModule] = useState<AuthorizationModule>('workflow');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [unitsText, setUnitsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const isUserTarget = selectedTarget.startsWith('user:');
  const selectedUserId = isUserTarget ? selectedTarget.slice(5) : '';
  const selectedUser = employees.find(employee => employee.id === selectedUserId);
  const selectedRole = (isUserTarget ? selectedUser?.role : selectedTarget.slice(5)) as Employee['role'] | undefined;
  const canEdit = selectedRole === 'employee' || selectedRole === 'supervisor';
  const selectedLabel = selectedUser ? `${selectedUser.name} · ${selectedUser.code}` : roles.find(role => `role:${role.value}` === selectedTarget)?.label || 'نقش';
  const moduleCapabilities = MODULE_CAPABILITIES[selectedModule];
  const units = useMemo(() => Array.from(new Set(employees.map(employee => employee.unit).filter(Boolean))).sort(), [employees]);
  const searchedUsers = useMemo(() => {
    const filtered = rankEmployeesBySearch(employees.filter(employee => employee.role !== 'admin'), userSearchTerm, employee => [employee.role, employee.unit]);
    if (selectedUser && !filtered.some(employee => employee.id === selectedUser.id)) return [selectedUser, ...filtered];
    return filtered;
  }, [employees, selectedUser, userSearchTerm]);

  const getScope = (capability: AuthorizationCapability): PermissionScope | null => {
    if (!selectedRole) return null;
    const person = selectedUser || ({ id: 'permission-preview', role: selectedRole, unit: '', name: '', code: '', profileId: '', username: '' } as Employee);
    return getEffectivePermissionGrant(policy, person, selectedModule, capability);
  };

  const getGrantStatus = (capability: AuthorizationCapability): 'inherited' | 'allow' | 'deny' => {
    if (isUserTarget && selectedUser) {
      const grants = policy.users?.[selectedUser.id]?.[selectedModule];
      if (!grants || !Object.prototype.hasOwnProperty.call(grants, capability)) return 'inherited';
      return grants[capability] ? 'allow' : 'deny';
    }
    const roleGrants = selectedRole ? policy.roles?.[selectedRole]?.[selectedModule] : undefined;
    if (!roleGrants || !Object.prototype.hasOwnProperty.call(roleGrants, capability)) return 'inherited';
    return roleGrants[capability] ? 'allow' : 'deny';
  };

  const setGrant = (capability: AuthorizationCapability, status: 'inherited' | 'allow' | 'deny', scope: PermissionScope) => {
    if (!selectedRole || (isUserTarget && !selectedUser)) return;
    setPolicy(current => {
      if (isUserTarget) {
        if (status === 'inherited') {
          const nextUsers = withoutCapability(current.users, selectedUser!.id, selectedModule, capability);
          return { ...current, users: nextUsers };
        }
        const ownerGrants = current.users?.[selectedUser!.id] || {};
        const moduleGrants = { ...(ownerGrants[selectedModule] || {}), [capability]: status === 'allow' ? scope : null };
        return { ...current, users: { ...current.users, [selectedUser!.id]: { ...ownerGrants, [selectedModule]: moduleGrants } } };
      }
      if (status === 'inherited') {
        const nextRoles = withoutCapability(current.roles, selectedRole, selectedModule, capability);
        return { ...current, roles: nextRoles as GranularPermissionPolicy['roles'] };
      }
      const ownerGrants = current.roles?.[selectedRole] || {};
      const moduleGrants = { ...(ownerGrants[selectedModule] || {}), [capability]: status === 'allow' ? scope : null };
      return { ...current, roles: { ...current.roles, [selectedRole]: { ...ownerGrants, [selectedModule]: moduleGrants } } };
    });
  };

  const updateStageCapability = (stage: WorkflowStageKey, capability: 'view' | 'edit' | 'act' | 'advance', enabled: boolean) => {
    if (!selectedRole) return;
    setPolicy(current => isUserTarget && selectedUser
      ? { ...current, userWorkflowStageCapabilities: { ...current.userWorkflowStageCapabilities, [selectedUser.id]: { ...current.userWorkflowStageCapabilities?.[selectedUser.id], [stage]: { ...current.userWorkflowStageCapabilities?.[selectedUser.id]?.[stage], [capability]: enabled } } } }
      : { ...current, workflowStageCapabilities: { ...current.workflowStageCapabilities, [selectedRole]: { ...current.workflowStageCapabilities?.[selectedRole], [stage]: { ...current.workflowStageCapabilities?.[selectedRole]?.[stage], [capability]: enabled } } } });
  };

  const setCeiling = (stage: WorkflowStageKey) => {
    if (!selectedRole) return;
    setPolicy(current => isUserTarget && selectedUser
      ? { ...current, userWorkflowCeilings: { ...current.userWorkflowCeilings, [selectedUser.id]: stage } }
      : { ...current, workflowCeilings: { ...current.workflowCeilings, [selectedRole]: stage } });
  };

  const activeCeiling = selectedUser
    ? getWorkflowCeiling(selectedUser, policy)
    : selectedRole ? policy.workflowCeilings?.[selectedRole] || getWorkflowCeiling({ id: '', role: selectedRole, unit: '', name: '', code: '', profileId: '', username: '' }, policy) : 'supervisor_review';

  const save = async () => {
    if (saving || !canEdit) return;
    setSaving(true);
    setSaveMessage('');
    db.saveMiscData('pe_granular_permissions', policy);
    const accepted = await db.pushStateToCloud();
    setSaving(false);
    setSaveMessage(accepted ? 'تنظیمات دسترسی در فضای ابری ذخیره شد.' : 'ذخیره ابری تأیید نشد؛ دسترسی جدید هنوز تأیید نشده است.');
  };

  const effectiveCapabilities = moduleCapabilities.filter(capability => getScope(capability));

  return <section className="rounded-3xl border border-indigo-500/25 bg-slate-900/70 p-5 space-y-5" dir="rtl">
    <header className="space-y-1">
      <h3 className="text-sm font-black text-slate-100">دسترسی نقش و کاربر</h3>
      <p className="text-xs text-slate-400">هر کاربر از الگوی نقش خود ارث می‌برد و می‌تواند مجوزهای مشخص و محدوده دسترسی جداگانه داشته باشد.</p>
    </header>

    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-xs text-slate-300">نقش یا کاربر
        <input aria-label="جستجوی کاربر بر اساس کد پرسنلی" value={userSearchTerm} onChange={event => setUserSearchTerm(event.target.value)} placeholder="جستجو با نام یا کد پرسنلی" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2" />
        <select aria-label="کاربر یا نقش" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2" value={selectedTarget} onChange={event => setSelectedTarget(event.target.value)}>
          {roles.map(role => <option key={role.value} value={`role:${role.value}`}>{role.label}</option>)}
          <optgroup label="تنظیم اختصاصی کاربر">
            {searchedUsers.map(employee => <option key={employee.id} value={`user:${employee.id}`}>{employee.name} · {employee.code} · {employee.role === 'supervisor' ? 'سرپرست' : 'کارمند'}</option>)}
          </optgroup>
        </select>
      </label>
      <label className="text-xs text-slate-300">حداکثر مرحله مجاز
        <select aria-label="حداکثر مرحله مجاز" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2" value={activeCeiling} onChange={event => setCeiling(event.target.value as WorkflowStageKey)}>
          {stages.filter(stage => stage !== 'hse_review').map(stage => <option key={stage} value={stage}>{WORKFLOW_STAGES[stage].label}</option>)}
        </select>
      </label>
    </div>

    <div className="grid gap-4 lg:grid-cols-[minmax(10rem,15rem)_1fr]">
      <nav className="grid grid-cols-2 gap-1 lg:grid-cols-1" aria-label="ماژول‌های دسترسی">
        {AUTHORIZATION_MODULES.map(module => <button key={module} type="button" onClick={() => setSelectedModule(module)} className={`rounded-xl px-3 py-2 text-right text-xs ${selectedModule === module ? 'bg-teal-500/15 text-teal-200 ring-1 ring-teal-500/30' : 'bg-slate-950/60 text-slate-400 hover:text-slate-200'}`}>{moduleLabels[module]}</button>)}
      </nav>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-slate-100">{moduleLabels[selectedModule]} · {selectedLabel}</h4>
          {selectedModule === 'mis' && <p className="text-[10px] text-amber-200">درون‌ریزی MIS و کسری مجوزهای جداگانه دارند.</p>}
        </div>
        <div className="divide-y divide-slate-800 rounded-2xl border border-slate-800">
          {moduleCapabilities.map(capability => {
            const current = getScope(capability);
            const status = getGrantStatus(capability);
            const scopeType = current?.type || 'authorized_employees';
            const options = scopeType === 'selected_units' && current?.type === 'selected_units' ? current.unitIds.join(', ') : unitsText;
            return <div key={capability} className="grid items-center gap-2 p-3 sm:grid-cols-[minmax(9rem,1fr)_minmax(8rem,auto)_minmax(10rem,1fr)]">
              <span className="text-xs font-semibold text-slate-200">{capabilityLabels[capability]}</span>
              <select aria-label={`وضعیت ${capabilityLabels[capability]}`} value={status} onChange={event => setGrant(capability, event.target.value as 'inherited' | 'allow' | 'deny', current || { type: 'authorized_employees' })} className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-[10px]">
                <option value="inherited">ارث‌بری از نقش</option><option value="allow">اجازه صریح</option><option value="deny">منع صریح</option>
              </select>
              <div className="flex gap-2">
                <select aria-label={`محدوده ${capabilityLabels[capability]}`} disabled={status === 'deny'} value={scopeType} onChange={event => {
                  const type = event.target.value as PermissionScope['type'];
                  setGrant(capability, 'allow', type === 'selected_units' ? { type, unitIds: unitsText.split(',').map(value => value.trim()).filter(Boolean) } : { type } as PermissionScope);
                }} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-[10px] disabled:opacity-50">
                  {(['own', 'direct_reports', 'own_unit', 'selected_units', 'authorized_employees'] as PermissionScope['type'][]).map(type => <option key={type} value={type}>{scopeLabels[type]}</option>)}
                </select>
                {scopeType === 'selected_units' && <input aria-label="واحدهای منتخب" value={options} onChange={event => {
                  const value = event.target.value;
                  setUnitsText(value);
                  setGrant(capability, 'allow', { type: 'selected_units', unitIds: value.split(',').map(item => item.trim()).filter(Boolean) });
                }} placeholder="واحدها با ویرگول" className="w-1/2 rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-[10px]" />}
              </div>
            </div>;
          })}
        </div>
        <p className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-[11px] text-slate-300">{selectedLabel}: {effectiveCapabilities.length} مجوز مؤثر در این ماژول. وضعیت هر مجوز نشان می‌دهد از نقش به ارث رسیده یا برای این {isUserTarget ? 'کاربر' : 'نقش'} جداگانه ثبت شده است.</p>
      </div>
    </div>

    <div className="space-y-2">
      <h4 className="font-bold text-slate-100">اختیار گردش کار در هر مرحله</h4>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {stages.map(stage => <div key={stage} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <div className="mb-2 text-xs font-bold text-slate-200">{WORKFLOW_STAGES[stage].label}</div>
          <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-400">
            {(['view', 'edit', 'act', 'advance'] as const).map(capability => {
              const checked = policy.userWorkflowStageCapabilities?.[selectedUserId]?.[stage]?.[capability] ??
                policy.workflowStageCapabilities?.[selectedRole || 'supervisor']?.[stage]?.[capability] ??
                (capability === 'view' || capability === 'act' || (capability === 'edit' && stage === 'supervisor_review') || (capability === 'advance' && stage === 'supervisor_review'));
              return <label key={capability} className="flex items-center gap-1"><input type="checkbox" checked={checked} onChange={event => updateStageCapability(stage, capability, event.target.checked)} />{capability === 'view' ? 'مشاهده' : capability === 'edit' ? 'ویرایش' : capability === 'act' ? 'اقدام' : 'پیشبرد'}</label>;
            })}
          </div>
        </div>)}
      </div>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
      <div className="text-[11px] text-slate-400"><span>مؤثر: {effectiveCapabilities.map(capability => capabilityLabels[capability]).join('، ') || 'بدون دسترسی'} · سقف مرحله: {WORKFLOW_STAGES[activeCeiling].label}</span>{saveMessage && <span role="status" className={`mt-1 block ${saveMessage.startsWith('تنظیمات') ? 'text-emerald-300' : 'text-rose-300'}`}>{saveMessage}</span>}</div>
      <button type="button" disabled={saving || !canEdit} onClick={save} className="rounded-xl bg-teal-500 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-50">{saving ? 'در حال ذخیره…' : 'ذخیره و ثبت ممیزی'}</button>
    </div>
  </section>;
}

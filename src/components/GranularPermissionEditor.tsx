import { useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck, Save, RotateCcw } from 'lucide-react';
import { db } from '../utils/db';
import { AUTHORIZATION_MODULES, MODULE_CAPABILITIES, authorize, canAccessWorkflowStage, getWorkflowCeiling, isWithinWorkflowCeiling, readGranularPermissionPolicy, type AuthorizationCapability as Action, type AuthorizationModule as Module, type GranularPermissionPolicy as Policy, type PermissionScope as Scope, type WorkflowStageCapability as StageAction } from '../utils/authorization';
import { WORKFLOW_STAGES, type Employee, type WorkflowStageKey as Stage } from '../types';
import { rankEmployeesBySearch, normalizeSearchText } from '../utils/personnelSearch';
import SearchInput from './ui/SearchInput';
import { Badge, Button, Card, Select, EmptyState } from './ui/Primitives';

const modules: Record<Module, string> = { employees: 'کارکنان', evaluations: 'ارزیابی‌ها', mis: 'داده‌های عملکرد', workflow: 'گردش کار', cartable: 'کارتابل', reports: 'گزارش‌ها', analytics: 'تحلیل‌ها', criteria: 'شاخص‌ها', profiles: 'پروفایل‌های شغلی', delegation: 'تفویض اختیار', calibration: 'کالیبراسیون', rewards: 'پاداش', administration: 'مدیریت سیستم', support: 'پشتیبانی', onboarding: 'آموزش' };
const actions: Record<Action, string> = { view: 'مشاهده', create: 'ایجاد', edit: 'ویرایش', delete: 'حذف', bulk_edit: 'ویرایش گروهی', bulk_delete: 'حذف گروهی', import: 'درون‌ریزی عمومی', export: 'خروجی گرفتن', submit: 'ارسال', return: 'بازگردانی', approve: 'تأیید', reassign: 'تغییر مسئول', delegate: 'تفویض اختیار', advance_workflow: 'پیشبرد گردش کار', finalize: 'نهایی‌سازی', route_hse: 'ارجاع به HSE', bulk_score: 'امتیازدهی گروهی', employee_import: 'درون‌ریزی کارکنان', criteria_import: 'درون‌ریزی شاخص‌ها', mis_import: 'درون‌ریزی MIS', kasra_import: 'درون‌ریزی کسری' };
const scopes: Record<Scope['type'], string> = { own: 'سوابق خود', direct_reports: 'زیردستان مستقیم', own_unit: 'واحد خود (در محدوده مجاز)', selected_units: 'واحدهای منتخب', authorized_employees: 'کارکنان مجاز', all: 'کل سازمان' };
const roles = { admin: 'ادمین', supervisor: 'سرپرست', employee: 'کارمند' };
const statuses = { inherited: 'ارث‌بری از نقش', allow: 'اجازه صریح', deny: 'منع صریح' };
type Status = keyof typeof statuses;
const panels = { modules: 'ماژول‌ها و اقدامات', scope: 'محدوده سازمانی', workflow: 'اختیار گردش کار', imports: 'مجوزهای درون‌ریزی', preview: 'پیش‌نمایش دسترسی' };
const stages: Stage[] = ['self_review', 'supervisor_review', 'peer_review', 'calibration_review', 'hr_approval', 'feedback_meeting', 'hse_review', 'completed'];
const stageActions: Record<StageAction, string> = { view: 'مشاهده', edit: 'ویرایش', act: 'اقدام', advance: 'پیشبرد' };
const importRights: Array<[Module, Action]> = [['employees', 'employee_import'], ['criteria', 'criteria_import'], ['mis', 'mis_import'], ['mis', 'kasra_import']];
const json = (value: unknown) => JSON.stringify(value);
function scopeText(scope?: Scope | null): string {
  if (!scope) return 'بدون دسترسی';
  if (scope.type === 'selected_units') return `${scopes[scope.type]}: ${scope.unitIds.join('، ') || 'انتخاب نشده'}`;
  if (scope.type === 'authorized_employees' && scope.employeeIds?.length) return `${scopes[scope.type]}: ${scope.employeeIds.length} نفر`;
  return scopes[scope.type];
}

export default function GranularPermissionEditor({ employees }: { employees: Employee[] }) {
  const [saved, setSaved] = useState(readGranularPermissionPolicy);
  const [policy, setPolicy] = useState(readGranularPermissionPolicy);
  const [target, setTarget] = useState('role:supervisor');
  const [query, setQuery] = useState('');
  const [scopeQuery, setScopeQuery] = useState('');
  const [panel, setPanel] = useState<keyof typeof panels>('modules');
  const [module, setModule] = useState<Module>('workflow');
  const [action, setAction] = useState<Action>('view');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const submittedPolicy = useRef<string | null>(null);
  const dirty = json(saved) !== json(policy);
  const isUser = target.startsWith('user:');
  const user = employees.find(e => target === `user:${e.id}`);
  const role = user?.role || target.slice(5) as Employee['role'];
  const actor: Employee = user || { id: '', name: `الگوی نقش ${roles[role]}`, code: '', username: '', unit: '', profileId: '', role };
  const baseline: Policy = useMemo(() => ({ ...policy, users: { ...policy.users, [actor.id]: {} }, userWorkflowCeilings: { ...policy.userWorkflowCeilings, [actor.id]: undefined }, userWorkflowStageCapabilities: { ...policy.userWorkflowStageCapabilities, [actor.id]: {} } }), [policy, actor.id]);
  const users = useMemo(() => rankEmployeesBySearch(employees, query, e => [roles[e.role], e.role, e.unit]), [employees, query]);
  const units = useMemo(() => Array.from(new Set(employees.map(e => e.unit).filter(Boolean))).sort(), [employees]);
  const grants = isUser ? policy.users?.[actor.id] : policy.roles?.[role];
  const effective = (m: Module, a: Action) => authorize(actor, m, a, undefined, policy);
  const status = (m: Module, a: Action): Status => !Object.prototype.hasOwnProperty.call(grants?.[m] || {}, a) ? 'inherited' : grants?.[m]?.[a] ? 'allow' : 'deny';
  const ceiling = getWorkflowCeiling(actor, policy);
  const matrix = isUser ? policy.userWorkflowStageCapabilities?.[actor.id] : policy.workflowStageCapabilities?.[role];
  const changes = AUTHORIZATION_MODULES.flatMap(m => MODULE_CAPABILITIES[m].flatMap(a => {
    const before = isUser ? saved.users?.[actor.id]?.[m]?.[a] : saved.roles?.[role]?.[m]?.[a];
    const after = grants?.[m]?.[a];
    return json(before) === json(after) ? [] : [`${modules[m]} / ${actions[a]}: ${before === undefined ? 'ارث‌بری' : scopeText(before)} ← ${after === undefined ? 'ارث‌بری' : scopeText(after)}`];
  }));
  const oldCeiling = getWorkflowCeiling(actor, saved);
  if (oldCeiling !== ceiling) changes.push(`سقف گردش کار: ${WORKFLOW_STAGES[oldCeiling].label} ← ${WORKFLOW_STAGES[ceiling].label}`);
  for (const stage of stages) for (const a of Object.keys(stageActions) as StageAction[]) {
    const before = isUser ? saved.userWorkflowStageCapabilities?.[actor.id]?.[stage]?.[a] : saved.workflowStageCapabilities?.[role]?.[stage]?.[a];
    const after = matrix?.[stage]?.[a];
    if (before !== after) changes.push(`${WORKFLOW_STAGES[stage].label} / ${stageActions[a]}: ${before === undefined ? 'ارث‌بری' : before ? 'اجازه' : 'منع'} ← ${after === undefined ? 'ارث‌بری' : after ? 'اجازه' : 'منع'}`);
  }
  useEffect(() => db.subscribe(key => {
    if (key !== 'pe_granular_permissions') return;
    if (!dirty && !saving) { const next = readGranularPermissionPolicy(); setSaved(next); setPolicy(next); }
    else if (!saving) setMessage('نسخه دسترسی تغییر کرده است؛ پیش از ذخیره نسخه جدید را بررسی کنید.');
  }), [dirty, saving]);
  useEffect(() => {
    const persisted = (event: Event) => {
      if ((event as CustomEvent).detail?.status !== 'synced' || submittedPolicy.current !== json(policy) || json(readGranularPermissionPolicy()) !== json(policy)) return;
      submittedPolicy.current = null; setSaved(policy); setMessage('دسترسی‌ها با موفقیت ذخیره شد.');
    };
    window.addEventListener('pe_cloud_sync_status', persisted);
    return () => window.removeEventListener('pe_cloud_sync_status', persisted);
  }, [policy]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    const navigate = (event: Event) => { if (dirty && !window.confirm('تغییرات ذخیره‌نشده کنار گذاشته شود؟')) event.preventDefault(); };
    window.addEventListener('beforeunload', protect);
    window.addEventListener('pe_navigation_request', navigate);
    return () => { window.removeEventListener('beforeunload', protect); window.removeEventListener('pe_navigation_request', navigate); };
  }, [dirty]);
  const setGrant = (m: Module, a: Action, choice: Status, scope?: Scope) => {
    setMessage('');
    setPolicy(current => {
      const field = isUser ? 'users' : 'roles';
      const key = isUser ? actor.id : role;
      const owner = current[field]?.[key] || {};
      const next = { ...owner[m] };
      if (choice === 'inherited') delete next[a];
      else next[a] = choice === 'deny' ? null : scope || effective(m, a).scope || { type: 'authorized_employees' };
      return { ...current, [field]: { ...current[field], [key]: { ...owner, [m]: next } } };
    });
  };
  const setStage = (stage: Stage, a: StageAction, choice: Status) => setPolicy(current => {
    const field = isUser ? 'userWorkflowStageCapabilities' : 'workflowStageCapabilities';
    const key = isUser ? actor.id : role;
    const owner = current[field]?.[key] || {}, row = { ...owner[stage] };
    if (choice === 'inherited') delete row[a]; else row[a] = choice === 'allow';
    if (choice === 'deny' && a === 'view') { row.edit = false; row.act = false; row.advance = false; }
    if (choice === 'deny' && a === 'act') row.advance = false;
    if (choice === 'allow' && a !== 'view') row.view = true;
    if (choice === 'allow' && a === 'advance') row.act = true;
    return { ...current, [field]: { ...current[field], [key]: { ...owner, [stage]: row } } };
  });
  const discard = () => { const local = readGranularPermissionPolicy(); const next = dirty && json(local) === json(policy) ? saved : local; if (json(local) === json(policy) && dirty) db.saveMiscData('pe_granular_permissions', next); setPolicy(next); setSaved(next); setMessage('تغییرات ذخیره‌نشده کنار گذاشته شد.'); };
  const selectTarget = (next: string) => {
    if (dirty && !window.confirm('تغییرات ذخیره‌نشده کنار گذاشته شود؟')) return;
    if (dirty) discard();
    setTarget(next); setScopeQuery(''); setMessage('');
  };
  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true); setMessage('');
    try {
      const local = json(readGranularPermissionPolicy());
      if (local !== json(saved) && local !== json(policy)) { setMessage('تعارض نسخه: دسترسی‌ها تغییر کرده‌اند. نسخه جدید را بررسی کنید.'); return; }
      db.saveMiscData('pe_granular_permissions', policy);
      submittedPolicy.current = json(policy);
      if (await db.pushStateToCloud()) { const persisted = readGranularPermissionPolicy(); setSaved(persisted); setPolicy(persisted); setMessage('دسترسی‌ها با موفقیت ذخیره شد.'); }
      else setMessage('ذخیره سرور تأیید نشد. خطای دسترسی یا تعارض نسخه را بررسی کنید؛ تغییرات هنوز تأیید نشده‌اند.');
    } catch { setMessage('ذخیره سرور ناموفق بود؛ دوباره تلاش کنید.'); }
    finally { setSaving(false); }
  };
  const grantRow = (m: Module, a: Action) => {
    const result = effective(m, a), base = authorize(actor, m, a, undefined, baseline);
    return <div key={`${m}.${a}`} className="grid gap-3 border-b border-slate-200 py-4 last:border-0 dark:border-slate-800 md:grid-cols-[1fr_12rem_1fr]">
      <div><h5 className="text-sm font-bold">{actions[a]}</h5><p className="mt-1 text-xs text-slate-500">پایه نقش: {scopeText(base.scope)}</p></div>
      <Select aria-label={`وضعیت ${actions[a]}`} disabled={saving} value={status(m, a)} onChange={e => setGrant(m, a, e.target.value as Status)}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      <div className="flex flex-wrap items-center gap-2"><Badge tone={result.allowed ? 'success' : 'danger'}>{result.allowed ? 'مجاز' : 'غیرمجاز'}</Badge><span className="text-xs">{scopeText(result.scope)}</span>{result.allowed && <button type="button" className="text-xs font-bold text-teal-700 dark:text-teal-300 underline" onClick={() => { setModule(m); setAction(a); setPanel('scope'); }}>ویرایش محدوده</button>}</div>
    </div>;
  };
  const scope = effective(module, action).scope;
  const availableUnits = scope?.type === 'selected_units' ? Array.from(new Set([...units, ...scope.unitIds])) : units;
  const all = AUTHORIZATION_MODULES.flatMap(m => MODULE_CAPABILITIES[m].map(a => ({ m, a, result: effective(m, a) })));

  return <section aria-label="مدیریت دسترسی کاربران" className="space-y-5 text-slate-900 dark:text-slate-100" dir="rtl">
    <header><h2 className="flex items-center gap-2 text-xl font-black"><ShieldCheck className="h-6 w-6 text-teal-600" />دسترسی کاربران</h2><p className="mt-2 text-sm text-slate-500">کاربر را انتخاب کنید، پایه نقش را بررسی کنید و تغییرات اختصاصی را پیش از ذخیره ببینید.</p></header>
    <div className="grid items-start gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
      <Card className="space-y-4 xl:sticky xl:top-24"><h3 className="font-bold">انتخاب کاربر یا نقش</h3>
        <SearchInput resultCount={users.length} aria-label="جستجوی کاربر بر اساس کد پرسنلی" value={query} onChange={e => setQuery(e.target.value)} placeholder="نام، کد پرسنلی، نقش یا واحد" />
        <p role="status" className="text-xs text-slate-500">{users.length} کاربر</p>
        <label className="block text-sm">کاربر یا نقش<Select aria-label="کاربر یا نقش" className="mt-2 w-full" value={target} disabled={saving} onChange={e => selectTarget(e.target.value)}><optgroup label="پایه نقش"><option value="role:supervisor">الگوی نقش سرپرست</option><option value="role:employee">الگوی نقش کارمند</option></optgroup><optgroup label="کاربران">{users.map(e => <option key={e.id} value={`user:${e.id}`}>{e.name} · {e.code} · {roles[e.role]} · {e.unit}</option>)}{user && !users.some(e => e.id === user.id) && <option value={target}>{user.name} · {user.code} (انتخاب جاری)</option>}</optgroup></Select></label>
        {!users.length && <EmptyState title="کاربری پیدا نشد" description="نام یا کد دیگری وارد کنید." />}
        <p className="text-xs leading-6 text-slate-500">تغییر الگوی نقش بر همه کاربران آن نقش اثر دارد. تنظیم اختصاصی فقط برای کاربر انتخاب‌شده اعمال می‌شود.</p>
      </Card>
      <div className="min-w-0 space-y-4">
        <Card><h3 className="text-lg font-black">{actor.name}</h3><div className="mt-3 flex flex-wrap gap-2"><Badge>{roles[role]}</Badge><Badge>{actor.unit || 'الگوی مشترک نقش'}</Badge>{actor.code && <Badge>{actor.code}</Badge>}<Badge>{db.getMiscData<string[]>('pe_locked_users', []).includes(actor.username) ? 'حساب مسدود' : 'حساب فعال'}</Badge><Badge tone={dirty ? 'warning' : 'success'}>{dirty ? 'تغییرات ذخیره‌نشده' : 'نسخه ذخیره‌شده'}</Badge></div></Card>
        {role === 'admin' ? <Card className="space-y-4 border-teal-500"><h4 className="font-black text-teal-700 dark:text-teal-300">ادمین دسترسی عملیاتی کامل در سطح کل سازمان دارد.</h4><Badge tone="success">کل سازمان · مجاز از طریق ادمین</Badge><p>همه ماژول‌ها، اقدامات و چهار نوع درون‌ریزی از طریق دسترسی ادمین مجاز هستند.</p><h5 className="font-bold">قواعد حفاظت از سوابق</h5><ul className="list-inside list-disc space-y-2 text-sm"><li>تاریخچه ممیزی قابل پاک کردن نیست.</li><li>داده منبع محافظت‌شده قابل جعل دستی نیست.</li><li>تاریخچه نهایی‌شده محافظت می‌شود.</li></ul></Card> : <>
          <Card><h4 className="font-bold">پایه نقش {roles[role]}</h4><p className="mt-2 text-sm text-slate-500">مجوزهای زیر از نقش می‌آیند؛ تغییرات اختصاصی جداگانه اعمال می‌شود.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{AUTHORIZATION_MODULES.map(m => {
            const allowed = MODULE_CAPABILITIES[m].filter(a => authorize(actor, m, a, undefined, baseline).allowed);
            return allowed.length ? <p key={m} className="rounded-xl bg-slate-50 p-3 text-xs leading-6 dark:bg-slate-950"><strong>{modules[m]}:</strong> {allowed.map(a => `${actions[a]} (${scopeText(authorize(actor, m, a, undefined, baseline).scope)})`).join('، ')}</p> : null;
          })}</div><p className="mt-3 text-xs">سقف پایه: {WORKFLOW_STAGES[getWorkflowCeiling(actor, baseline)].label}</p></Card>
          <nav aria-label="بخش‌های تنظیم دسترسی" className="flex flex-wrap gap-2">{Object.entries(panels).map(([id, label]) => <Button key={id} variant={panel === id ? 'primary' : 'secondary'} aria-pressed={panel === id} onClick={() => setPanel(id as keyof typeof panels)}>{label}</Button>)}</nav>
          {panel === 'modules' && <Card><label className="block text-sm font-bold">ماژول<Select aria-label="ماژول دسترسی" value={module} className="mt-2 w-full" onChange={e => { setModule(e.target.value as Module); setAction('view'); }}>{AUTHORIZATION_MODULES.map(m => <option key={m} value={m}>{modules[m]}</option>)}</Select></label><div className="mt-3">{MODULE_CAPABILITIES[module].filter(a => !a.endsWith('_import')).map(a => grantRow(module, a))}</div></Card>}
          {panel === 'imports' && <Card><h4 className="font-bold">چهار مجوز مستقل درون‌ریزی</h4><p className="mt-2 text-sm text-slate-500">مجوز عمومی درون‌ریزی به معنای اجازه MIS یا کسری نیست.</p>{importRights.map(([m, a]) => grantRow(m, a))}</Card>}
          {panel === 'scope' && <Card className="space-y-4"><h4 className="font-bold">محدوده سازمانی</h4><div className="grid gap-3 sm:grid-cols-2"><label>ماژول<Select className="mt-2 w-full" aria-label="ماژول محدوده" value={module} onChange={e => { setModule(e.target.value as Module); setAction('view'); }}>{AUTHORIZATION_MODULES.map(m => <option key={m} value={m}>{modules[m]}</option>)}</Select></label><label>اقدام<Select className="mt-2 w-full" aria-label="اقدام محدوده" value={action} onChange={e => setAction(e.target.value as Action)}>{MODULE_CAPABILITIES[module].map(a => <option key={a} value={a}>{actions[a]}</option>)}</Select></label></div>
            <p className="text-sm">مؤثر: {scopeText(scope)} · {statuses[status(module, action)]}</p>
            <label className="block">محدوده این اقدام<Select className="mt-2 w-full" aria-label={`محدوده ${actions[action]}`} value={scope?.type || ''} onChange={e => { const type = e.target.value as Scope['type']; setGrant(module, action, 'allow', type === 'selected_units' ? { type, unitIds: [] } : type === 'authorized_employees' ? { type, employeeIds: [] } : { type }); }}><option value="" disabled>انتخاب محدوده و اجازه صریح</option>{Object.entries(scopes).filter(([type]) => type !== 'all').map(([type, label]) => <option key={type} value={type}>{label}</option>)}</Select></label>
            {(scope?.type === 'selected_units' || scope?.type === 'authorized_employees') && <><SearchInput aria-label="جستجوی محدوده" value={scopeQuery} onChange={e => setScopeQuery(e.target.value)} placeholder="جستجوی واحد، نام یا کد پرسنلی" /><div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3 dark:border-slate-700">{scope.type === 'selected_units' ? availableUnits.filter(unit => normalizeSearchText(unit).includes(normalizeSearchText(scopeQuery))).map(unit => <label key={unit} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={scope.unitIds.includes(unit)} onChange={e => setGrant(module, action, 'allow', { type: 'selected_units', unitIds: e.target.checked ? [...scope.unitIds, unit] : scope.unitIds.filter(id => id !== unit) })} />{unit}</label>) : rankEmployeesBySearch(employees, scopeQuery).map(e => <label key={e.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={scope.employeeIds?.includes(e.id) || false} onChange={event => setGrant(module, action, 'allow', { type: 'authorized_employees', employeeIds: event.target.checked ? [...scope.employeeIds || [], e.id] : scope.employeeIds?.filter(id => id !== e.id) || [] })} />{e.name} · {e.code} · {e.unit}</label>)}</div><>{scope.type === 'selected_units' && scopeQuery.trim() && !availableUnits.includes(scopeQuery.trim()) && <Button onClick={() => { setGrant(module, action, 'allow', { type: 'selected_units', unitIds: [...scope.unitIds, scopeQuery.trim()] }); setScopeQuery(''); }}>انتخاب واحد با این نام</Button>}</><p className="text-xs">انتخاب جاری: {scope.type === 'selected_units' ? scope.unitIds.join('، ') || 'هیچ واحدی' : scope.employeeIds?.length ? employees.filter(e => scope.employeeIds?.includes(e.id)).map(e => `${e.name} (${e.code})`).join('، ') : 'محدوده مجاز بر اساس رابطه سازمانی؛ انتخاب فردی ثبت نشده است.'}</p></>}
          </Card>}
          {panel === 'workflow' && <Card className="space-y-4"><h4 className="font-bold">اختیار مراحل در ترتیب فرایند</h4><label className="block">حداکثر مرحله مجاز<Select className="mt-2 w-full" aria-label="حداکثر مرحله مجاز" value={ceiling} onChange={e => setPolicy(current => ({ ...current, [isUser ? 'userWorkflowCeilings' : 'workflowCeilings']: { ...current[isUser ? 'userWorkflowCeilings' : 'workflowCeilings'], [isUser ? actor.id : role]: e.target.value } }))}>{stages.filter(s => s !== 'hse_review').map(s => <option key={s} value={s}>{WORKFLOW_STAGES[s].label}</option>)}</Select></label><p className="text-xs text-slate-500">سقف مرحله و مجوز اقدام هر دو کنترل می‌شوند. HSE مسیر تخصصی جداگانه دارد.</p>{stages.map(stage => <fieldset key={stage} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><legend className="px-2 text-sm font-bold">{WORKFLOW_STAGES[stage].label}</legend><div className="grid gap-3 sm:grid-cols-2">{(Object.keys(stageActions) as StageAction[]).map(a => <label key={a} className="text-sm">{stageActions[a]}<Select className="mt-1 w-full" aria-label={`${WORKFLOW_STAGES[stage].label} ${stageActions[a]}`} value={matrix?.[stage]?.[a] === undefined ? 'inherited' : matrix[stage][a] ? 'allow' : 'deny'} onChange={e => setStage(stage, a, e.target.value as Status)}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><span className="mt-1 block text-xs text-slate-500">پایه: {canAccessWorkflowStage(actor, stage, a, baseline) ? 'مجاز' : 'غیرمجاز'} · مؤثر: {canAccessWorkflowStage(actor, stage, a, policy) ? 'مجاز' : 'غیرمجاز'}{stage !== 'hse_review' && !isWithinWorkflowCeiling(actor, stage, policy) ? ' · خارج از سقف پیشبرد' : ''}</span></label>)}</div></fieldset>)}</Card>}
          <Card aria-label="دسترسی مؤثر" className="space-y-3"><h4 className="font-bold">پیش‌نمایش دسترسی مؤثر</h4><p className="text-sm">سقف پیشبرد: {WORKFLOW_STAGES[ceiling].label}</p><div className="grid gap-3 sm:grid-cols-2"><div><h5 className="font-bold text-emerald-700 dark:text-emerald-300">این کاربر می‌تواند</h5><ul className="mt-2 space-y-2 text-xs leading-6">{all.filter(row => row.result.allowed).map(({ m, a, result }) => <li key={`${m}.${a}`}>{modules[m]} · {actions[a]} · {scopeText(result.scope)}</li>)}</ul></div><div><h5 className="font-bold text-rose-700 dark:text-rose-300">این کاربر نمی‌تواند</h5><ul className="mt-2 space-y-2 text-xs leading-6">{all.filter(row => !row.result.allowed && (panel === 'preview' || row.a.endsWith('_import'))).map(({ m, a }) => <li key={`${m}.${a}`}>{modules[m]} · {actions[a]}</li>)}</ul></div></div></Card>
        </>}
        {changes.length > 0 && <Card aria-label="تغییرات قابل اعمال"><h4 className="font-bold">تغییرات قابل اعمال ({changes.length})</h4><ul className="mt-3 space-y-2 text-sm">{changes.map((change, i) => <li key={i}>{change}</li>)}</ul></Card>}
        {isUser && role !== 'admin' && <Button disabled={saving} onClick={() => { if (!window.confirm('تنظیم اختصاصی این کاربر حذف و پایه نقش اعمال شود؟')) return; setPolicy(current => { const next = structuredClone(current); delete next.users?.[actor.id]; delete next.userWorkflowCeilings?.[actor.id]; delete next.userWorkflowStageCapabilities?.[actor.id]; return next; }); }}>بازنشانی تنظیم اختصاصی به پایه نقش</Button>}
      </div>
    </div>
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"><div><p className="text-sm font-bold">{dirty ? 'تغییرات ذخیره‌نشده' : 'تغییری برای ذخیره وجود ندارد'}</p>{message && <p role="status" className="mt-2 max-w-2xl text-sm">{message}</p>}</div><div className="flex flex-wrap gap-2"><Button disabled={!dirty || saving} onClick={discard}><RotateCcw className="h-4 w-4" />انصراف از تغییرات</Button><Button variant="primary" disabled={!dirty || saving || role === 'admin'} onClick={save}><Save className="h-4 w-4" />{saving ? 'در حال ذخیره…' : 'ذخیره و ثبت ممیزی'}</Button></div></div>
  </section>;
}

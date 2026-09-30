import SearchInput from './ui/SearchInput';
import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Search, X } from 'lucide-react';
import type { Criterion, Employee, Evaluation, JobProfile } from '../types';
import { manualScoreRange } from '../utils/criterionScoring';
import { isSupervisorScorableScore, prepareBulkScorePlan, type ScoreAssignments } from '../utils/bulkScoring';
import { matchesEmployeeSearch } from '../utils/personnelSearch';

interface BulkScoringModalProps {
  evaluationIds: string[];
  evaluations: Evaluation[];
  employees: Employee[];
  profiles: JobProfile[];
  criteria: Criterion[];
  currentUser: Employee;
  onSave: (evaluations: Evaluation[]) => void;
  onClose: () => void;
}

export default function BulkScoringModal(props: BulkScoringModalProps) {
  const { evaluationIds, evaluations, employees, profiles, criteria, currentUser } = props;
  const uniqueIds = useMemo(() => Array.from(new Set(evaluationIds)), [evaluationIds]);
  const [mode, setMode] = useState<'same' | 'matrix'>('same');
  const [criterionId, setCriterionId] = useState('');
  const [scoreValue, setScoreValue] = useState('');
  const [comment, setComment] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [matrixValues, setMatrixValues] = useState<Record<string, Record<string, number>>>({});
  const [step, setStep] = useState<'edit' | 'preview'>('edit');
  const [operationId] = useState(() => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `bulk-${Date.now()}`);

  const evaluationById = useMemo(() => new Map(evaluations.map(evaluation => [evaluation.id, evaluation])), [evaluations]);
  const selectedEvaluations = useMemo(() => uniqueIds.map(id => evaluationById.get(id)).filter((item): item is Evaluation => Boolean(item)), [uniqueIds, evaluationById]);
  const employeeById = useMemo(() => new Map(employees.map(employee => [employee.id, employee])), [employees]);
  const profileById = useMemo(() => new Map(profiles.map(profile => [profile.id, profile])), [profiles]);
  const visibleSelectedEvaluations = useMemo(() => selectedEvaluations.filter(evaluation => {
    const employee = employeeById.get(evaluation.empId);
    return Boolean(employee && matchesEmployeeSearch(employee, searchTerm, [evaluation.period, evaluation.stage || evaluation.status]));
  }), [selectedEvaluations, employeeById, searchTerm]);
  const candidateCriteria = useMemo(() => criteria.filter(criterion => selectedEvaluations.some(evaluation => {
    const profile = profileById.get(evaluation.profileId);
    const score = evaluation.scores.find(item => item.cid === criterion.id);
    return Boolean(profile?.items.some(item => item.cid === criterion.id) && isSupervisorScorableScore(score, criterion));
  })), [criteria, selectedEvaluations, profileById]);

  const assignments: ScoreAssignments = useMemo(() => mode === 'same'
    ? Object.fromEntries(uniqueIds.map(id => [id, criterionId && scoreValue ? { [criterionId]: Number(scoreValue) } : {}]))
    : matrixValues,
  [mode, uniqueIds, criterionId, scoreValue, matrixValues]);
  const plan = useMemo(() => prepareBulkScorePlan({
    evaluationIds: uniqueIds,
    assignments,
    comment,
    evaluations,
    employees,
    profiles,
    criteria,
    actor: currentUser,
    operationId,
  }), [uniqueIds, assignments, comment, evaluations, employees, profiles, criteria, currentUser, operationId]);

  const selectedCriterion = criteria.find(item => item.id === criterionId);
  const selectedRange = selectedCriterion ? manualScoreRange(selectedCriterion) : { min: 1, max: 5 };
  const matrixCriteria = candidateCriteria.filter(criterion => selectedEvaluations.some(evaluation =>
    profileById.get(evaluation.profileId)?.items.some(item => item.cid === criterion.id)
  ));

  const confirmSave = () => {
    if (!plan.updatedEvaluations.length) return;
    const changedById = new Map<string, Evaluation>(plan.updatedEvaluations.map(evaluation => [evaluation.id, evaluation]));
    props.onSave(evaluations.map(evaluation => changedById.get(evaluation.id) || evaluation));
    props.onClose();
  };

  const editScoreCell = (evaluationId: string, cid: string, value: string) => {
    setMatrixValues(current => {
      const row = { ...(current[evaluationId] || {}) };
      if (value === '') delete row[cid];
      else row[cid] = Number(value);
      return { ...current, [evaluationId]: row };
    });
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="bulk-score-title">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 id="bulk-score-title" className="text-base font-black">امتیازدهی گروهی</h2>
            <p className="mt-1 text-xs text-slate-400">{uniqueIds.length} پرونده انتخاب شده؛ بررسی اختیار و محدوده برای هر پرونده جداگانه انجام می‌شود.</p>
          </div>
          <button type="button" aria-label="بستن" onClick={props.onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-5 py-3">
          <button type="button" onClick={() => { setMode('same'); setStep('edit'); }} className={`rounded-xl border px-3 py-2 text-xs font-bold ${mode === 'same' ? 'border-teal-500/50 bg-teal-500/10 text-teal-200' : 'border-slate-700 text-slate-300'}`}>یک نمره برای همه</button>
          <button type="button" onClick={() => { setMode('matrix'); setStep('edit'); }} className={`rounded-xl border px-3 py-2 text-xs font-bold ${mode === 'matrix' ? 'border-teal-500/50 bg-teal-500/10 text-teal-200' : 'border-slate-700 text-slate-300'}`}>جدول نمره‌دهی</button>
          <span className="mr-auto rounded-xl bg-slate-950 px-3 py-2 text-[10px] text-slate-400">ثبت همه تغییرات با یک ذخیره گروهی انجام می‌شود.</span>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-3">
          <SearchInput resultCount={visibleSelectedEvaluations.length} aria-label="جستجوی کارکنان امتیازدهی گروهی" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="جستجو با نام یا کد پرسنلی" />
          <span className="shrink-0 text-[10px] text-slate-500">{visibleSelectedEvaluations.length} از {selectedEvaluations.length}</span>
        </div>

        {step === 'edit' ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
            {mode === 'same' ? (
              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-xs font-semibold">معیار دستی
                  <select value={criterionId} onChange={event => setCriterionId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs">
                    <option value="">انتخاب معیار</option>
                    {candidateCriteria.map(criterion => <option key={criterion.id} value={criterion.id}>{criterion.name}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold">نمره مشترک
                  <select value={scoreValue} onChange={event => setScoreValue(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs">
                    <option value="">انتخاب نمره</option>
                    {Array.from({ length: selectedRange.max - selectedRange.min + 1 }, (_, index) => selectedRange.min + index).map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold">شاهد یا توضیح مشترک (اختیاری)
                  <input value={comment} onChange={event => setComment(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs" />
                </label>
              </div>
            ) : null}
            {mode === 'same' && searchTerm.trim() && <div className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-[10px] text-slate-300" aria-label="نتایج کارکنان انتخاب‌شده">
              {visibleSelectedEvaluations.map(evaluation => { const employee = employeeById.get(evaluation.empId); return <span key={evaluation.id} className="rounded-lg bg-slate-800 px-2 py-1">{employee?.name} · {employee?.code}</span>; })}
              {!visibleSelectedEvaluations.length && <span className="text-slate-500">موردی پیدا نشد.</span>}
            </div>}
            {mode === 'matrix' && uniqueIds.length > 100 ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">برای جلوگیری از کندشدن جدول، حالت جدولی تا ۱۰۰ پرونده را می‌پذیرد. برای گروه‌های بزرگ از «یک نمره برای همه» استفاده کنید.</div>
            ) : mode === 'matrix' ? (
              <div className="max-h-[62vh] overflow-auto rounded-2xl border border-slate-800">
                <table className="min-w-full border-collapse text-right text-[11px]">
                  <thead className="sticky top-0 bg-slate-950 text-slate-300"><tr><th className="min-w-52 p-2">کارمند</th>{matrixCriteria.map(criterion => <th key={criterion.id} className="min-w-28 p-2">{criterion.name}</th>)}</tr></thead>
                  <tbody>
                    {visibleSelectedEvaluations.map(evaluation => {
                      const employee = employeeById.get(evaluation.empId);
                      const profile = profileById.get(evaluation.profileId);
                      return <tr key={evaluation.id} className="border-t border-slate-800">
                        <td className="p-2"><span className="block font-bold">{employee?.name || 'نامشخص'}</span><span className="text-[9px] text-slate-500">{employee?.code || ''} • {evaluation.stage || 'مرحله نامشخص'}</span></td>
                        {matrixCriteria.map(criterion => {
                          const applicable = profile?.items.some(item => item.cid === criterion.id);
                          const score = evaluation.scores.find(item => item.cid === criterion.id);
                          const scorable = applicable && isSupervisorScorableScore(score, criterion);
                          const range = manualScoreRange(criterion);
                          return <td key={criterion.id} className="p-2">
                            <select aria-label={`${employee?.name || 'کارمند'}، ${criterion.name}`} disabled={!scorable} value={matrixValues[evaluation.id]?.[criterion.id] ?? ''} onChange={event => editScoreCell(evaluation.id, criterion.id, event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs disabled:opacity-40">
                              <option value="">—</option>{Array.from({ length: range.max - range.min + 1 }, (_, index) => range.min + index).map(value => <option key={value} value={value}>{value}</option>)}
                            </select>
                          </td>;
                        })}
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            {mode === 'matrix' && <label className="block max-w-2xl text-xs font-semibold">شاهد مشترک برای نمره‌های واردشده (اختیاری)<input value={comment} onChange={event => setComment(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs" /></label>}
            <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-[11px] text-slate-400"><AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" /> معیارهای MIS، کسری و سیستمی در جدول غیرفعال‌اند و API نیز تغییر مستقیم آن‌ها را رد می‌کند.</div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto p-5">
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3"><span className="text-[10px] text-slate-500">انتخاب‌شده</span><strong className="mt-1 block text-lg">{plan.selected}</strong></div>
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3"><span className="text-[10px] text-emerald-300">مجاز برای ثبت</span><strong className="mt-1 block text-lg text-emerald-300">{plan.eligible}</strong></div>
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-3"><span className="text-[10px] text-rose-300">ردشده با دلیل</span><strong className="mt-1 block text-lg text-rose-300">{plan.rejected}</strong></div>
            </div>
            <div className="overflow-auto rounded-2xl border border-slate-800">
              <table className="min-w-full text-right text-[11px]"><thead className="bg-slate-950 text-slate-300"><tr><th className="p-2">کارمند</th><th className="p-2">پرونده</th><th className="p-2">نتیجه</th></tr></thead>
                <tbody>{plan.rows.map(row => <tr key={row.evaluationId} className="border-t border-slate-800"><td className="p-2">{row.employeeName}</td><td className="p-2 font-mono text-slate-500">{row.evaluationId}</td><td className={`p-2 ${row.eligible ? 'text-emerald-300' : 'text-rose-300'}`}>{row.eligible ? <CheckCircle2 className="ml-1 inline h-3.5 w-3.5" /> : <AlertTriangle className="ml-1 inline h-3.5 w-3.5" />}{row.reasonLabel}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-slate-800 px-5 py-4">
          <button type="button" onClick={props.onClose} className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300">انصراف</button>
          <div className="flex gap-2">
            {step === 'preview' && <button type="button" onClick={() => setStep('edit')} className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-200">بازگشت به ویرایش</button>}
            {step === 'edit' ? <button type="button" onClick={() => setStep('preview')} disabled={!plan.rows.some(row => row.reason !== 'no_score_input')} className="rounded-xl bg-teal-500 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-40">پیش‌نمایش و بررسی مجوز</button> : <button type="button" onClick={confirmSave} disabled={!plan.updatedEvaluations.length} className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-40">تأیید و ذخیره {plan.eligible} پرونده</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

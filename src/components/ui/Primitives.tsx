import React from 'react';
import { X } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-teal-600 text-white border border-teal-600 shadow-sm shadow-teal-950/10 hover:bg-teal-700 hover:border-teal-700',
  secondary: 'bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50 hover:border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-700',
  ghost: 'bg-transparent text-slate-600 border border-transparent hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white',
  danger: 'bg-rose-600 hover:bg-rose-700 text-white border border-rose-600 shadow-sm shadow-rose-950/10',
  success: 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600 shadow-sm shadow-emerald-950/10',
};

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold leading-5 transition-all duration-150 hover:-translate-y-px active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:translate-y-0 disabled:scale-100 disabled:opacity-50 ${buttonVariants[variant]} ${className}`}
    />
  );
}

export function IconButton({
  label,
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      type={props.type || 'button'}
      aria-label={label}
      title={props.title || label}
      className={`inline-grid min-h-10 min-w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all duration-150 hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white dark:focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input {...rest} className={`min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm shadow-slate-950/[0.03] placeholder:text-slate-400 transition-colors focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:placeholder:text-slate-500 dark:shadow-none ${className}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', ...rest } = props;
  return <select {...rest} className={`min-h-11 max-w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm shadow-slate-950/[0.03] transition-colors focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:shadow-none ${className}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props;
  return <textarea {...rest} className={`w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-7 text-slate-800 shadow-sm shadow-slate-950/[0.03] placeholder:text-slate-400 transition-colors focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:placeholder:text-slate-500 dark:shadow-none ${className}`} />;
}

export function Badge({ children, tone = 'neutral', className = '' }: {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-300',
    success: 'bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300',
    warning: 'bg-amber-500/10 text-amber-700 ring-amber-600/20 dark:text-amber-300',
    danger: 'bg-rose-500/10 text-rose-700 ring-rose-600/20 dark:text-rose-300',
    info: 'bg-sky-500/10 text-sky-700 ring-sky-600/20 dark:text-sky-300',
  };
  return <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold leading-5 ring-1 ring-inset ${tones[tone]} ${className}`}>{children}</span>;
}

export function Card({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <section {...props} className={`min-w-0 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm shadow-slate-950/[0.035] dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-black/10 ${className}`} />;
}

export function Toolbar({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm shadow-slate-950/[0.03] dark:border-slate-800 dark:bg-slate-900/75 sm:flex-row sm:items-center sm:justify-between ${className}`} />;
}

export function Table({ className = '', ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <div className="table-responsive max-w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60"><table {...props} className={`w-full border-collapse text-right text-sm ${className}`} /></div>;
}

export function Dialog({ open, title, onClose, children, className = '' }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" role="presentation" onMouseDown={onClose}>
    <section role="dialog" aria-modal="true" aria-label={title} className={`max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 ${className}`} onMouseDown={(event) => event.stopPropagation()}>
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800"><h2 className="text-base font-black text-slate-900 dark:text-white">{title}</h2><IconButton label="بستن" onClick={onClose} className="min-h-9 min-w-9 rounded-lg"><X className="h-4 w-4" aria-hidden="true" /></IconButton></div>
      {children}
    </section>
  </div>;
}

export function EmptyState({ title, description, action }: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
    <div className="max-w-md">
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</h3>
      {description && <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  </div>;
}

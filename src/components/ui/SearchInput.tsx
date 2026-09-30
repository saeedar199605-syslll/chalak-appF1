import { useRef, type InputHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';

/** Keep the visible text raw. Consumers derive normalized filters separately. */
export default function SearchInput({ value, onChange, className = '', resultCount, ...props }: InputHTMLAttributes<HTMLInputElement> & { resultCount?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  return <div className="min-w-0 w-full" data-search-control>
    <div className="relative">
    <Search aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    <input {...props} ref={input} type="search" value={value} onChange={onChange}
      aria-label={props['aria-label'] || props.placeholder || 'جستجو'}
      onCompositionStart={event => { composing.current = true; props.onCompositionStart?.(event); }}
      onCompositionEnd={event => { composing.current = false; props.onCompositionEnd?.(event); }}
      className={`min-h-11 w-full rounded-xl border border-slate-300 bg-white py-2.5 pr-10 pl-12 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ${className}`} />
    {String(value ?? '').length > 0 && <button type="button" aria-label="پاک کردن جستجو"
      className="absolute left-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-teal-500 dark:hover:bg-slate-800"
      onMouseDown={event => event.preventDefault()} onClick={() => {
        if (composing.current || !input.current) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input.current, '');
        input.current.dispatchEvent(new Event('input', { bubbles: true }));
        input.current.focus();
      }}><X aria-hidden="true" className="h-4 w-4" /></button>}
    </div>
    {resultCount !== undefined && <p aria-live="polite" data-search-results className="mt-1 text-xs text-slate-500 dark:text-slate-400">{resultCount === 0 ? String(value ?? '').length ? 'نتیجه‌ای پیدا نشد' : 'هنوز داده‌ای ثبت نشده است' : `${resultCount} نتیجه`}</p>}
  </div>;
}

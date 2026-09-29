import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props { children?: React.ReactNode }
interface State { failed: boolean }

export default class ErrorBoundary extends React.Component<Props, State> {
  declare readonly props: Props;
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Keep diagnostics in the browser console; never silently swallow a render failure.
    console.error('Application render failure', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="min-h-screen grid place-items-center bg-slate-950 p-6 text-right" dir="rtl">
        <section className="w-full max-w-lg rounded-3xl border border-rose-500/30 bg-slate-900 p-7 shadow-2xl">
          <AlertTriangle className="mb-4 h-10 w-10 text-rose-400" aria-hidden="true" />
          <h1 className="text-lg font-black text-slate-100">نمایش این بخش با خطا روبه‌رو شد</h1>
          <p className="mt-2 text-sm leading-7 text-slate-400">اطلاعات شما عمداً حذف نشده است. ابتدا دوباره تلاش کنید؛ اگر خطا ادامه داشت، جزئیات زمان و بخش جاری را به مدیر سامانه اعلام کنید.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-500">
            <RotateCcw className="h-4 w-4" /> بازگشایی امن سامانه
          </button>
        </section>
      </main>
    );
  }
}

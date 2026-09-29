import React, { useState, useEffect } from 'react';
import { Ticket, Send, CheckCircle2, MessageSquare, Edit2, Trash2 } from 'lucide-react';
import { SupportTicket, Employee } from '../types';
import { db } from '../utils/db';

interface SupportTicketsProps {
  currentUser: Employee;
  theme?: 'dark' | 'light';
}

export default function SupportTickets({ currentUser, theme = 'light' }: SupportTicketsProps) {
  const isAdmin = currentUser.role === 'admin';
  const [tickets, setTickets] = useState<SupportTicket[]>(() => db.getMiscData('pe_tickets', []));
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [reply, setReply] = useState('');

  useEffect(() => {
    const unsub = db.subscribe((key, data) => {
      if (key === 'pe_tickets' && Array.isArray(data)) {
        setTickets(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data);
        setActiveTicket(previous => previous ? data.find(ticket => ticket.id === previous.id) || null : null);
      }
    });
    return unsub;
  }, []);

  const saveTickets = (newTickets: SupportTicket[]) => {
    setTickets(newTickets);
    db.saveMiscData('pe_tickets', newTickets);
  };

  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;

    const newTicket: SupportTicket = {
      id: `tkt-${Date.now()}`,
      senderId: currentUser.id,
      senderName: currentUser.name,
      subject,
      message,
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      replies: []
    };

    saveTickets([newTicket, ...tickets]);
    setSubject('');
    setMessage('');
  };

  const handleReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || !activeTicket) return;

    const newReply = {
      id: `rep-${Date.now()}`,
      senderId: currentUser.id,
      senderName: currentUser.name,
      message: reply,
      createdAt: new Date().toISOString(),
      isAdmin
    };

    const updatedTickets = tickets.map(t => {
      if (t.id === activeTicket.id) {
        const updated = { 
          ...t, 
          replies: [...t.replies, newReply], 
          updatedAt: new Date().toISOString(),
          status: isAdmin && t.status === 'open' ? 'in_progress' : t.status
        } as SupportTicket;
        setActiveTicket(updated);
        return updated;
      }
      return t;
    });

    saveTickets(updatedTickets);
    setReply('');
  };

  const toggleStatus = (t: SupportTicket) => {
    const newStatus = t.status === 'closed' ? 'open' : 'closed';
    const updatedTickets = tickets.map(ticket => {
      if (ticket.id === t.id) {
        const updated = { ...ticket, status: newStatus as any, updatedAt: new Date().toISOString() };
        if (activeTicket?.id === t.id) setActiveTicket(updated);
        return updated;
      }
      return ticket;
    });
    saveTickets(updatedTickets);
  };

  const handleEditTicket = (ticket: SupportTicket) => {
    if (!isAdmin) return;
    const nextSubject = window.prompt('موضوع تیکت را ویرایش کنید:', ticket.subject);
    if (nextSubject === null || !nextSubject.trim()) return;
    const nextMessage = window.prompt('متن اصلی تیکت را ویرایش کنید:', ticket.message);
    if (nextMessage === null || !nextMessage.trim()) return;
    const updated = {
      ...ticket,
      subject: nextSubject.trim(),
      message: nextMessage.trim(),
      updatedAt: new Date().toISOString(),
    };
    saveTickets(tickets.map(item => item.id === ticket.id ? updated : item));
    setActiveTicket(updated);
  };

  const handleDeleteTicket = (ticket: SupportTicket) => {
    if (!isAdmin || !window.confirm(`تیکت «${ticket.subject}» و تمام پاسخ‌های آن حذف شود؟`)) return;
    saveTickets(tickets.filter(item => item.id !== ticket.id));
    setActiveTicket(null);
  };

  const updateTicketReplies = (ticket: SupportTicket, replies: SupportTicket['replies']) => {
    const updated = { ...ticket, replies, updatedAt: new Date().toISOString() };
    saveTickets(tickets.map(item => item.id === ticket.id ? updated : item));
    setActiveTicket(updated);
  };

  const handleEditReply = (ticket: SupportTicket, replyId: string) => {
    if (!isAdmin) return;
    const target = ticket.replies.find(item => item.id === replyId);
    if (!target) return;
    const message = window.prompt('متن پاسخ را ویرایش کنید:', target.message);
    if (message === null || !message.trim()) return;
    updateTicketReplies(ticket, ticket.replies.map(item => item.id === replyId ? { ...item, message: message.trim() } : item));
  };

  const handleDeleteReply = (ticket: SupportTicket, replyId: string) => {
    if (!isAdmin || !window.confirm('این پاسخ حذف شود؟')) return;
    updateTicketReplies(ticket, ticket.replies.filter(item => item.id !== replyId));
  };

  const visibleTickets = isAdmin ? tickets : tickets.filter(t => t.senderId === currentUser.id);

  return (
<div className="app-page grid grid-cols-1 gap-4 animate-in fade-in duration-300 md:min-h-[calc(100vh-6rem)] md:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)] md:grid-rows-[auto_minmax(0,1fr)]">
      <header className="col-span-full border-b border-slate-200 pb-4 text-right dark:border-slate-800">
        <p className="text-[11px] font-bold text-teal-700 dark:text-teal-300">پشتیبانی و ارتباط</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">مرکز پشتیبانی</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">درخواست‌های خود را ثبت و پاسخ‌ها را در همین بخش پیگیری کنید.</p>
      </header>
      <div className={`min-h-52 max-h-64 min-w-0 flex flex-col rounded-2xl border shadow-sm overflow-hidden md:max-h-none ${theme === 'dark' ? 'bg-slate-900/70 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className={`p-4 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-slate-100'} flex items-center justify-between`}>
          <h2 className="font-bold flex items-center gap-2"><Ticket className="w-5 h-5 text-indigo-500" /> {isAdmin ? 'تیکت‌های کاربران' : 'تیکت‌های من'}</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {visibleTickets.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              <Ticket aria-hidden="true" className="h-8 w-8 text-slate-400 dark:text-slate-500" />
              <span>هنوز تیکتی ثبت نشده است.</span>
            </div>
          )}
          {visibleTickets.map(t => (
            <div 
              key={t.id} 
              onClick={() => setActiveTicket(t)}
              className={`p-3 rounded-xl cursor-pointer transition-colors border ${activeTicket?.id === t.id ? (theme === 'dark' ? 'bg-indigo-500/20 border-indigo-500/30' : 'bg-indigo-50 border-indigo-200') : (theme === 'dark' ? 'bg-slate-800/50 border-transparent hover:bg-slate-800' : 'bg-slate-50 border-transparent hover:bg-slate-100')}`}
            >
              <div className="flex justify-between items-start mb-1">
                <h4 className="font-bold text-sm truncate">{t.subject}</h4>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${t.status === 'open' ? 'bg-rose-500/10 text-rose-500' : t.status === 'in_progress' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                  {t.status === 'open' ? 'باز' : t.status === 'in_progress' ? 'در حال بررسی' : 'بسته شده'}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-500">
                <span>{isAdmin ? t.senderName : 'شما'}</span>
                <span>{new Date(t.updatedAt).toLocaleDateString('fa-IR')}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`min-w-0 min-h-[28rem] flex flex-col rounded-2xl border shadow-sm overflow-hidden ${theme === 'dark' ? 'bg-slate-900/70 border-slate-800' : 'bg-white border-slate-200'}`}>
        {!activeTicket ? (
          <div className="flex-1 p-6 flex flex-col">
            <h3 className="font-bold mb-4 flex items-center gap-2"><MessageSquare className="w-5 h-5 text-teal-500" /> ثبت تیکت پشتیبانی جدید</h3>
            <form onSubmit={handleCreateTicket} className="flex w-full max-w-2xl flex-col gap-4">
              <div>
                <label className="block text-xs font-bold mb-1.5 opacity-70">موضوع مشکل / درخواست</label>
                <input 
                  type="text" 
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className={`w-full p-3 rounded-xl border outline-none transition-colors ${theme === 'dark' ? 'bg-slate-950 border-slate-700 focus:border-teal-500 text-white' : 'bg-white border-slate-300 focus:border-teal-500 text-slate-900'}`}
                  placeholder="مثال: عدم دسترسی به داشبورد"
                  required
                />
              </div>
              <div className="flex flex-col">
                <label className="block text-xs font-bold mb-1.5 opacity-70">شرح دقیق</label>
                <textarea 
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  className={`min-h-40 max-h-64 w-full p-3 rounded-xl border outline-none transition-colors resize-y focus-visible:ring-2 focus-visible:ring-teal-500 ${theme === 'dark' ? 'bg-slate-950 border-slate-700 focus:border-teal-500 text-white' : 'bg-white border-slate-300 focus:border-teal-500 text-slate-900'}`}
                  placeholder="لطفا مشکل خود را کامل توضیح دهید..."
                  required
                />
              </div>
              <button type="submit" className="self-end px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl flex items-center gap-2 transition-colors">
                <Send className="w-4 h-4" /> ارسال تیکت
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className={`p-4 border-b flex justify-between items-center shrink-0 ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
              <div>
                <h3 className="font-bold text-lg">{activeTicket.subject}</h3>
                <p className="text-xs text-slate-500">ایجاد کننده: {activeTicket.senderName} • {new Date(activeTicket.createdAt).toLocaleString('fa-IR')}</p>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <>
                    <button type="button" onClick={() => handleEditTicket(activeTicket)} className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20" title="ویرایش تیکت">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => handleDeleteTicket(activeTicket)} className="p-2 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20" title="حذف تیکت">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button type="button" onClick={() => toggleStatus(activeTicket)} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${activeTicket.status === 'closed' ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' : 'bg-slate-500/10 text-slate-500 hover:bg-slate-500/20'}`}>
                  <CheckCircle2 className="w-4 h-4" /> {activeTicket.status === 'closed' ? 'باز کردن مجدد' : 'بستن تیکت'}
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Original Message */}
              <div className="flex flex-col gap-1 items-start">
                <div className={`p-4 rounded-2xl rounded-tr-sm max-w-[80%] ${activeTicket.senderId === currentUser.id ? 'bg-teal-600 text-white' : (theme === 'dark' ? 'bg-slate-800' : 'bg-slate-100')}`}>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{activeTicket.message}</p>
                </div>
              </div>
              
              {/* Replies */}
              {activeTicket.replies.map(r => {
                const isMe = r.senderId === currentUser.id;
                return (
                  <div key={r.id} className={`flex flex-col gap-1 ${isMe ? 'items-start' : 'items-end'}`}>
                    <div className="flex items-center gap-1 px-1">
                      <span className="text-[10px] text-slate-500">{r.senderName} {r.isAdmin && <span className="text-rose-500 font-bold">(ادمین)</span>}</span>
                      {isAdmin && (
                        <>
                          <button type="button" onClick={() => handleEditReply(activeTicket, r.id)} className="text-indigo-400 hover:text-indigo-300" title="ویرایش پاسخ"><Edit2 className="w-3 h-3" /></button>
                          <button type="button" onClick={() => handleDeleteReply(activeTicket, r.id)} className="text-rose-400 hover:text-rose-300" title="حذف پاسخ"><Trash2 className="w-3 h-3" /></button>
                        </>
                      )}
                    </div>
                    <div className={`p-3 rounded-2xl max-w-[80%] ${isMe ? 'rounded-tr-sm bg-teal-600 text-white' : (theme === 'dark' ? 'rounded-tl-sm bg-slate-800' : 'rounded-tl-sm bg-slate-100')}`}>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={`p-4 border-t ${theme === 'dark' ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-slate-50'}`}>
              {activeTicket.status === 'closed' ? (
                <div className="text-center text-sm text-slate-500 py-2 flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> این تیکت بسته شده است.
                </div>
              ) : (
                <form onSubmit={handleReply} className="flex gap-2">
                  <input 
                    type="text" 
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    className={`flex-1 px-4 py-3 rounded-xl border outline-none transition-colors ${theme === 'dark' ? 'bg-slate-950 border-slate-700 focus:border-teal-500 text-white' : 'bg-white border-slate-300 focus:border-teal-500 text-slate-900'}`}
                    placeholder="پاسخ خود را بنویسید..."
                    required
                  />
                  <button type="submit" className="px-5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl flex items-center justify-center transition-colors">
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

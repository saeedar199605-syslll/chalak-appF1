/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Lattice Performance Suite
 * Comprehensive OKRs & Goals Cascade, 1-on-1 Coaching, Praise Wall, 360 Feedback & Pulse Surveys
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Target, 
  Users, 
  Heart, 
  Hand,
  Rocket,
  Star,
  Activity, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  MessageSquare, 
  Calendar, 
  Award, 
  TrendingUp, 
  Lock, 
  Check, 
  X,
  FileText,
  Edit2,
  Trash2,
  Save,
  Frown,
  Meh,
  Smile,
  SmilePlus,
  Zap,
  Handshake,
  ShieldCheck,
  Lightbulb
} from 'lucide-react';
import { 
  Employee, 
  OKRGoal, 
  OKRKeyResult, 
  OneOnOneMeeting, 
  PraiseKudos, 
  PulseSurveyMetric,
  OKRConfidence 
} from '../types';
import { 
  INITIAL_OKRS, 
  INITIAL_ONE_ON_ONES, 
  INITIAL_KUDOS, 
  INITIAL_PULSE_METRICS 
} from '../data/latticeKickidlerSeed';
import { db } from '../utils/db';

interface LatticePerformanceHubProps {
  currentUser: Employee;
  employees: Employee[];
  theme?: 'dark' | 'light';
  onNavigate?: (tab: string) => void;
}

const PULSE_OPTIONS = [
  { score: 1, label: 'بسیار فرسوده', Icon: Frown, color: 'text-rose-600 dark:text-rose-300' },
  { score: 2, label: 'کم‌انرژی', Icon: Meh, color: 'text-amber-600 dark:text-amber-300' },
  { score: 3, label: 'معمولی', Icon: Smile, color: 'text-slate-600 dark:text-slate-300' },
  { score: 4, label: 'بسیار خوب', Icon: SmilePlus, color: 'text-emerald-700 dark:text-emerald-300' },
  { score: 5, label: 'پرانرژی و مشتاق', Icon: Zap, color: 'text-teal-700 dark:text-teal-300' },
] as const;

const KUDOS_BADGE_OPTIONS = [
  { value: '👏', label: 'قدردانی', Icon: Hand },
  { value: '🏆', label: 'دستاورد', Icon: Award },
  { value: '🚀', label: 'پیشرفت', Icon: Rocket },
  { value: '⭐', label: 'درخشش', Icon: Star },
  { value: '🤝', label: 'همکاری', Icon: Handshake },
  { value: '💡', label: 'ایده نو', Icon: Lightbulb },
  { value: '🛡️', label: 'اعتماد', Icon: ShieldCheck },
] as const;

export default function LatticePerformanceHub({
  currentUser,
  employees,
  theme = 'dark'
}: LatticePerformanceHubProps) {
  const [activeSubTab, setActiveSubTab] = useState<'okrs' | 'one_on_ones' | 'praise' | 'pulse'>('okrs');

  // Persistence for OKRs with real-time db sync
  const [okrs, setOkrs] = useState<OKRGoal[]>(() => db.getOkrs());

  // Persistence for 1-on-1s
  const [oneOnOnes, setOneOnOnes] = useState<OneOnOneMeeting[]>(() => 
    db.getMiscData('pe_lattice_one_on_ones', INITIAL_ONE_ON_ONES)
  );

  // Persistence for Kudos
  const [kudosList, setKudosList] = useState<PraiseKudos[]>(() => 
    db.getMiscData('pe_lattice_kudos', INITIAL_KUDOS)
  );

  // Pulse Survey Metrics
  const [pulseMetrics, setPulseMetrics] = useState<PulseSurveyMetric[]>(() => 
    db.getMiscData('pe_lattice_pulse', INITIAL_PULSE_METRICS)
  );

  // Real-time synchronization across app tabs and edit forms
  useEffect(() => {
    const unsub = db.subscribe((key, data) => {
      if (key === 'pe_lattice_okrs' && Array.isArray(data)) {
        setOkrs(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data);
      } else if (key === 'pe_lattice_one_on_ones' && Array.isArray(data)) {
        setOneOnOnes(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data);
      } else if (key === 'pe_lattice_kudos' && Array.isArray(data)) {
        setKudosList(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data);
      } else if (key === 'pe_lattice_pulse' && Array.isArray(data)) {
        setPulseMetrics(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data);
      }
    });
    return unsub;
  }, []);

  // Save changes to db and dispatch notifications
  useEffect(() => {
    db.saveOkrs(okrs);
  }, [okrs]);

  useEffect(() => {
    db.saveMiscData('pe_lattice_one_on_ones', oneOnOnes);
  }, [oneOnOnes]);

  useEffect(() => {
    db.saveMiscData('pe_lattice_kudos', kudosList);
  }, [kudosList]);

  useEffect(() => {
    db.saveMiscData('pe_lattice_pulse', pulseMetrics);
  }, [pulseMetrics]);

  // Modals & form states
  const [isNewOkrModalOpen, setIsNewOkrModalOpen] = useState(false);
  const [isNew1on1ModalOpen, setIsNew1on1ModalOpen] = useState(false);
  const [isGiveKudosModalOpen, setIsGiveKudosModalOpen] = useState(false);
  const [selected1on1Id, setSelected1on1Id] = useState<string | null>(oneOnOnes[0]?.id || null);
  const [newTalkingPointText, setNewTalkingPointText] = useState('');
  const [newActionItemTitle, setNewActionItemTitle] = useState('');
  const [actionItemAssignee, setActionItemAssignee] = useState('');
  const [pulseAnswered, setPulseAnswered] = useState(false);
  const [selectedPulseRating, setSelectedPulseRating] = useState<number | null>(null);

  // Filter state for OKRs
  const [okrLevelFilter, setOkrLevelFilter] = useState<'all' | 'company' | 'department' | 'individual'>('all');

  // Kudos modal form
  const [kudosReceiverId, setKudosReceiverId] = useState<string>(employees[1]?.id || '');
  const [kudosCompanyValue, setKudosCompanyValue] = useState<PraiseKudos['companyValue']>('کار تیمی و همدلی');
  const [kudosMessage, setKudosMessage] = useState<string>('');
  const [kudosBadge, setKudosBadge] = useState<string>('👏');

  // New OKR Form State
  const [newOkrTitle, setNewOkrTitle] = useState('');
  const [newOkrDescription, setNewOkrDescription] = useState('');
  const [newOkrLevel, setNewOkrLevel] = useState<'company' | 'department' | 'individual'>('department');
  const [newOkrDepartment, setNewOkrDepartment] = useState('تولید و ماشین‌کاری');
  const [newOkrOwnerId, setNewOkrOwnerId] = useState(employees[0]?.id || '');
  const [newOkrDueDate, setNewOkrDueDate] = useState('۱۴۰۵/۰۶/۳۱');
  const [newKrTitle, setNewKrTitle] = useState('');
  const [newKrStartValue, setNewKrStartValue] = useState(0);
  const [newKrTargetValue, setNewKrTargetValue] = useState(100);
  const [newKrUnit, setNewKrUnit] = useState('درصد');

  // New 1-on-1 Form State
  const [new1on1EmpId, setNew1on1EmpId] = useState(employees[1]?.id || '');
  const [new1on1Date, setNew1on1Date] = useState('۱۴۰۵/۰۶/۲۰ ساعت ۱۰:۰۰');
  const [new1on1InitialTopic, setNew1on1InitialTopic] = useState('');

  // Handle KR Progress Quick Update
  const handleUpdateKrValue = (goalId: string, krId: string, delta: number) => {
    setOkrs(prev => prev.map(goal => {
      if (goal.id !== goalId) return goal;
      const updatedKrs = goal.keyResults.map(kr => {
        if (kr.id !== krId) return kr;
        const boundedVal = Math.max(kr.startValue, kr.currentValue + delta);
        let conf: OKRConfidence = kr.confidence;
        const ratio = kr.targetValue !== kr.startValue ? (boundedVal - kr.startValue) / (kr.targetValue - kr.startValue) : 1;
        if (ratio >= 1) conf = 'completed';
        else if (ratio >= 0.7) conf = 'on_track';
        else if (ratio >= 0.4) conf = 'at_risk';
        else conf = 'behind';
        return {
          ...kr,
          currentValue: boundedVal,
          confidence: conf,
          lastUpdated: 'همین الان'
        };
      });

      // Recalculate Goal overall progress
      const totalProgressSum = updatedKrs.reduce((acc, kr) => {
        const range = kr.targetValue - kr.startValue;
        if (range === 0) return acc + 100;
        const p = Math.min(100, Math.max(0, ((kr.currentValue - kr.startValue) / range) * 100));
        return acc + p;
      }, 0);
      const overallP = Math.round(totalProgressSum / updatedKrs.length);

      let overallConf: OKRConfidence = 'on_track';
      if (overallP >= 100) overallConf = 'completed';
      else if (overallP < 50) overallConf = 'behind';
      else if (overallP < 75) overallConf = 'at_risk';

      return {
        ...goal,
        keyResults: updatedKrs,
        progress: overallP,
        confidence: overallConf
      };
    }));
  };

  // OKR Edit and Delete states
  const [editingOkr, setEditingOkr] = useState<OKRGoal | null>(null);
  const [deletingOkr, setDeletingOkr] = useState<OKRGoal | null>(null);

  const handleSaveEditedOkr = (updated: OKRGoal) => {
    let overallProgress = updated.progress;
    let overallConf = updated.confidence;
    if (updated.keyResults && updated.keyResults.length > 0) {
      const sum = updated.keyResults.reduce((acc, kr) => {
        const range = kr.targetValue - kr.startValue;
        if (range === 0) return acc + 100;
        return acc + Math.min(100, Math.max(0, ((kr.currentValue - kr.startValue) / range) * 100));
      }, 0);
      overallProgress = Math.round(sum / updated.keyResults.length);
      if (overallProgress >= 100) overallConf = 'completed';
      else if (overallProgress < 50) overallConf = 'behind';
      else if (overallProgress < 75) overallConf = 'at_risk';
      else overallConf = 'on_track';
    }

    const finalUpdated: OKRGoal = {
      ...updated,
      progress: overallProgress,
      confidence: overallConf
    };

    setOkrs(prev => {
      const nextOkrs = prev.map(g => g.id === finalUpdated.id ? finalUpdated : g);
      db.saveOkrs(nextOkrs);
      return nextOkrs;
    });
    setEditingOkr(null);
  };

  const handleDeleteOkr = (goalId: string) => {
    setOkrs(prev => {
      const nextOkrs = prev.filter(g => g.id !== goalId);
      db.saveOkrs(nextOkrs);
      return nextOkrs;
    });
    setDeletingOkr(null);
  };

  // 1-on-1 Edit & Delete states
  const [editing1on1, setEditing1on1] = useState<OneOnOneMeeting | null>(null);
  const [deleting1on1, setDeleting1on1] = useState<OneOnOneMeeting | null>(null);

  // Kudos Edit & Delete states
  const [editingKudos, setEditingKudos] = useState<PraiseKudos | null>(null);
  const [deletingKudos, setDeletingKudos] = useState<PraiseKudos | null>(null);

  // Save edited 1-on-1
  const handleSaveEdited1on1 = (updated: OneOnOneMeeting) => {
    setOneOnOnes(prev => prev.map(m => m.id === updated.id ? updated : m));
    setEditing1on1(null);
  };

  // Delete 1-on-1
  const handleDelete1on1 = (meetingId: string) => {
    setOneOnOnes(prev => {
      const nextList = prev.filter(m => m.id !== meetingId);
      if (selected1on1Id === meetingId) {
        setSelected1on1Id(nextList[0]?.id || null);
      }
      return nextList;
    });
    setDeleting1on1(null);
  };

  // Delete Talking Point
  const handleDeleteTalkingPoint = (meetingId: string, pointId: string) => {
    setOneOnOnes(prev => prev.map(m => {
      if (m.id !== meetingId) return m;
      return {
        ...m,
        talkingPoints: m.talkingPoints.filter(tp => tp.id !== pointId)
      };
    }));
  };

  // Delete Action Item
  const handleDeleteActionItem = (meetingId: string, itemId: string) => {
    setOneOnOnes(prev => prev.map(m => {
      if (m.id !== meetingId) return m;
      return {
        ...m,
        actionItems: m.actionItems.filter(ai => ai.id !== itemId)
      };
    }));
  };

  // Save edited Kudos
  const handleSaveEditedKudos = (updated: PraiseKudos) => {
    setKudosList(prev => prev.map(k => k.id === updated.id ? updated : k));
    setEditingKudos(null);
  };

  // Delete Kudos
  const handleDeleteKudos = (kudosId: string) => {
    setKudosList(prev => prev.filter(k => k.id !== kudosId));
    setDeletingKudos(null);
  };

  // Toggle Talking Point in 1-on-1
  const handleToggleTalkingPoint = (meetingId: string, pointId: string) => {
    setOneOnOnes(prev => prev.map(m => {
      if (m.id !== meetingId) return m;
      return {
        ...m,
        talkingPoints: m.talkingPoints.map(tp => tp.id === pointId ? { ...tp, isCompleted: !tp.isCompleted } : tp)
      };
    }));
  };

  // Add Talking Point to active meeting
  const handleAddTalkingPoint = (meetingId: string) => {
    if (!newTalkingPointText.trim()) return;
    setOneOnOnes(prev => prev.map(m => {
      if (m.id !== meetingId) return m;
      const newTp = {
        id: `tp-${Date.now()}`,
        text: newTalkingPointText.trim(),
        isCompleted: false,
        addedBy: currentUser.role === 'employee' ? ('employee' as const) : ('supervisor' as const)
      };
      return {
        ...m,
        talkingPoints: [...m.talkingPoints, newTp]
      };
    }));
    setNewTalkingPointText('');
  };

  // Toggle Action Item
  const handleToggleActionItem = (meetingId: string, itemId: string) => {
    setOneOnOnes(prev => prev.map(m => {
      if (m.id !== meetingId) return m;
      return {
        ...m,
        actionItems: m.actionItems.map(ai => ai.id === itemId ? { ...ai, isDone: !ai.isDone } : ai)
      };
    }));
  };

  // Add Action Item
  const handleAddActionItem = (meetingId: string) => {
    if (!newActionItemTitle.trim()) return;
    const meeting = oneOnOnes.find(m => m.id === meetingId);
    setOneOnOnes(prev => prev.map(m => {
      if (m.id !== meetingId) return m;
      const newAi = {
        id: `ai-${Date.now()}`,
        title: newActionItemTitle.trim(),
        assigneeName: actionItemAssignee.trim() || meeting?.empName || 'همکار',
        dueDate: '۱۴۰۵/۰۶/۳۱',
        isDone: false
      };
      return {
        ...m,
        actionItems: [...m.actionItems, newAi]
      };
    }));
    setNewActionItemTitle('');
  };

  // Handle Kudos Emoji Reaction
  const handleReactKudos = (kudosId: string, reactionType: 'claps' | 'hearts' | 'rockets' | 'stars') => {
    setKudosList(prev => prev.map(k => {
      if (k.id !== kudosId) return k;
      const currentCount = k.reactions[reactionType] || 0;
      return {
        ...k,
        reactions: {
          ...k.reactions,
          [reactionType]: currentCount + 1
        }
      };
    }));
  };

  // Send new Kudos
  const handleSendKudos = (e: React.FormEvent) => {
    e.preventDefault();
    if (!kudosMessage.trim() || !kudosReceiverId) return;
    const receiver = employees.find(emp => emp.id === kudosReceiverId);
    if (!receiver) return;

    const newKudos: PraiseKudos = {
      id: `kudos-${Date.now()}`,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderRole: currentUser.role === 'admin' ? 'مدیر ارزیابی' : currentUser.role === 'supervisor' ? 'سرپرست مستقیم' : 'همکار',
      receiverId: receiver.id,
      receiverName: receiver.name,
      companyValue: kudosCompanyValue,
      badgeIcon: kudosBadge,
      message: kudosMessage.trim(),
      reactions: { claps: 1, hearts: 1, rockets: 1, stars: 1 },
      createdAt: 'همین الان'
    };

    setKudosList([newKudos, ...kudosList]);
    setIsGiveKudosModalOpen(false);
    setKudosMessage('');
  };

  // Create New OKR
  const handleCreateNewOkr = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOkrTitle.trim()) return;

    const owner = employees.find(emp => emp.id === newOkrOwnerId) || currentUser;
    const initialKr: OKRKeyResult = {
      id: `kr-${Date.now()}`,
      title: newKrTitle.trim() || 'دستیابی به اهداف عملیاتی تعیین‌شده',
      metricType: 'percentage',
      startValue: Number(newKrStartValue) || 0,
      currentValue: Number(newKrStartValue) || 0,
      targetValue: Number(newKrTargetValue) || 100,
      unit: newKrUnit.trim() || 'درصد',
      confidence: 'on_track',
      ownerName: owner.name,
      lastUpdated: 'امروز'
    };

    const newGoal: OKRGoal = {
      id: `okr-${Date.now()}`,
      title: newOkrTitle.trim(),
      description: newOkrDescription.trim() || 'هدف استراتژیک مصوب کارگروه ارزیابی عملکرد',
      level: newOkrLevel,
      department: newOkrDepartment,
      ownerId: owner.id,
      ownerName: owner.name,
      period: '۱۴۰۵ - سه‌ماهه اول',
      category: 'productivity',
      progress: 0,
      confidence: 'on_track',
      keyResults: [initialKr],
      createdDate: '۱۴۰۵/۰۱/۱۵',
      dueDate: newOkrDueDate || '۱۴۰۵/۰۶/۳۱'
    };

    setOkrs(prev => {
      const next = [newGoal, ...prev];
      db.saveOkrs(next);
      return next;
    });
    setIsNewOkrModalOpen(false);
    setNewOkrTitle('');
    setNewOkrDescription('');
    setNewKrTitle('');
  };

  // Create New 1-on-1 Meeting
  const handleCreateNew1on1 = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find(e => e.id === new1on1EmpId) || employees[1];
    const newMeeting: OneOnOneMeeting = {
      id: `1on1-${Date.now()}`,
      empId: emp.id,
      empName: emp.name,
      supervisorId: currentUser.id,
      supervisorName: currentUser.name,
      scheduledDate: new1on1Date,
      period: 'سه‌ماهه اول ۱۴۰۵',
      status: 'scheduled',
      talkingPoints: [
        {
          id: `tp-${Date.now()}-1`,
          text: new1on1InitialTopic.trim() || 'مرور دستاوردهای هفته و موانع پیش‌رو در فرایند کاری',
          isCompleted: false,
          addedBy: 'supervisor'
        }
      ],
      actionItems: [],
      sharedNotes: 'مقرر گردید شاخص‌های تحویلی تا پایان هفته به‌روزرسانی شوند.',
      privateSupervisorNotes: 'تمرکز بر توسعه مهارت‌های تخصصی و تسهیل ارتباطات بین‌واحدی',
      moodRating: 5
    };

    setOneOnOnes([newMeeting, ...oneOnOnes]);
    setSelected1on1Id(newMeeting.id);
    setIsNew1on1ModalOpen(false);
    setNew1on1InitialTopic('');
  };

  // Filtered OKRs
  const filteredOkrs = okrs.filter(goal => {
    if (okrLevelFilter === 'all') return true;
    return goal.level === okrLevelFilter;
  });

  const activeMeeting = oneOnOnes.find(m => m.id === selected1on1Id) || oneOnOnes[0];

  const getConfidenceBadge = (confidence: OKRConfidence) => {
    switch (confidence) {
      case 'completed':
        return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> محقق شده</span>;
      case 'on_track':
        return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-600 dark:text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded-full"><TrendingUp className="w-3 h-3" /> در مسیر هدف</span>;
      case 'at_risk':
        return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full"><AlertTriangle className="w-3 h-3" /> در معرض ریسک</span>;
      case 'behind':
        return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" /> عقب افتاده</span>;
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header Banner */}
      <div className={`p-6 rounded-2xl border transition-all ${
        theme === 'dark' 
          ? 'bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-indigo-900/40 text-slate-100' 
          : 'bg-gradient-to-r from-white via-indigo-50/40 to-white border-indigo-100 text-slate-900 shadow-sm'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-500 border border-indigo-500/30">
                <Target className="w-5 h-5" />
              </span>
              <div>
                <h1 className={`text-xl font-black tracking-tight flex items-center gap-2 ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                  سامانه مدیریت عملکرد پیوسته و استعدادها
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/15 px-2 py-0.5 rounded-full border border-indigo-500/30">
                    Lattice Suite
                  </span>
                </h1>
                <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                  متدولوژی هم‌راستایی اهداف (OKRs)، گفت‌وگوهای هدایت‌گر دونفره (1-on-1s)، دیوار تمجید و بازخورد ۳۶۰ درجه
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsGiveKudosModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Heart className="w-3.5 h-3.5 fill-current" />
              <span>ارسال تمجید (Kudos)</span>
            </button>
            <button
              onClick={() => setIsNewOkrModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ثبت هدف جدید (OKR)</span>
            </button>
          </div>
        </div>

        {/* Sub-Tab Navigation */}
        <div className={`flex items-center gap-2 mt-6 border-t pt-4 overflow-x-auto ${theme === 'dark' ? 'border-slate-800' : 'border-indigo-100'}`}>
          <button
            onClick={() => setActiveSubTab('okrs')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'okrs'
                ? 'bg-indigo-600 text-white shadow-sm'
                : theme === 'dark' 
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-indigo-50/80'
            }`}
          >
            <Target className="w-4 h-4" />
            <span>اهداف و نتایج کلیدی (OKRs)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">{okrs.length}</span>
          </button>

          <button
            onClick={() => setActiveSubTab('one_on_ones')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'one_on_ones'
                ? 'bg-indigo-600 text-white shadow-sm'
                : theme === 'dark' 
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-indigo-50/80'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>جلسات دونفره و کوچینگ</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">{oneOnOnes.length}</span>
          </button>

          <button
            onClick={() => setActiveSubTab('praise')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'praise'
                ? 'bg-indigo-600 text-white shadow-sm'
                : theme === 'dark' 
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-indigo-50/80'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>دیوار تمجید و بازخورد ۳۶۰</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">{kudosList.length}</span>
          </button>

          <button
            onClick={() => setActiveSubTab('pulse')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'pulse'
                ? 'bg-indigo-600 text-white shadow-sm'
                : theme === 'dark' 
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-indigo-50/80'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>ارزیابی نبض سازمان (Pulse)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-mono">eNPS: +48</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: OKRS & GOALS */}
      {activeSubTab === 'okrs' && (
        <div className="space-y-6">
          {/* Level Filter Bar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className={`flex items-center gap-1.5 p-1 rounded-xl border ${
              theme === 'dark' ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                onClick={() => setOkrLevelFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  okrLevelFilter === 'all' 
                    ? 'bg-indigo-600 text-white shadow-sm' 
                    : theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                همه اهداف ({okrs.length})
              </button>
              <button
                onClick={() => setOkrLevelFilter('company')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  okrLevelFilter === 'company' 
                    ? 'bg-indigo-600 text-white shadow-sm' 
                    : theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                اهداف استراتژیک کل سازمان
              </button>
              <button
                onClick={() => setOkrLevelFilter('department')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  okrLevelFilter === 'department' 
                    ? 'bg-indigo-600 text-white shadow-sm' 
                    : theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                اهداف واحدها و دپارتمان‌ها
              </button>
              <button
                onClick={() => setOkrLevelFilter('individual')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  okrLevelFilter === 'individual' 
                    ? 'bg-indigo-600 text-white shadow-sm' 
                    : theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                اهداف فردی پرسنل
              </button>
            </div>

            <div className={`text-xs font-medium flex items-center gap-1.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
              <span>دوره ارزیابی:</span>
              <span className={`font-bold ${theme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>سه‌ماهه اول ۱۴۰۵</span>
            </div>
          </div>

          {/* OKR Cards Grid */}
          <div className="space-y-4">
            {filteredOkrs.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-5 py-12 text-center dark:border-slate-700 dark:bg-slate-900/60">
                <Target aria-hidden="true" className="h-9 w-9 text-slate-400 dark:text-slate-500" />
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {okrs.length === 0 ? 'هنوز هدفی ثبت نشده است' : 'هدفی با این فیلتر یافت نشد'}
                </h2>
                <p className="max-w-md text-xs leading-6 text-slate-600 dark:text-slate-400">
                  {okrs.length === 0 ? 'برای شروع برنامه‌ریزی عملکرد، اولین هدف و نتایج کلیدی آن را ثبت کنید.' : 'برای دیدن سایر اهداف، فیلتر سطح را تغییر دهید.'}
                </p>
                {okrs.length === 0 && (
                  <button type="button" onClick={() => setIsNewOkrModalOpen(true)} className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                    <Plus aria-hidden="true" className="h-4 w-4" /> ثبت هدف جدید
                  </button>
                )}
              </div>
            )}
            {filteredOkrs.map(goal => (
              <div 
                key={goal.id} 
                className={`p-5 rounded-2xl border transition-all ${
                  theme === 'dark' 
                    ? 'bg-slate-900/70 border-slate-800 hover:border-indigo-900/60 text-slate-100' 
                    : 'bg-white border-slate-200 hover:border-indigo-200 text-slate-900 shadow-sm'
                }`}
              >
                <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b ${
                  theme === 'dark' ? 'border-slate-800' : 'border-slate-100'
                }`}>
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        goal.level === 'company' 
                          ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20' 
                          : goal.level === 'department'
                            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                            : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      }`}>
                        {goal.level === 'company' ? 'سطح سازمان' : goal.level === 'department' ? `واحد: ${goal.department}` : `فردی: ${goal.ownerName}`}
                      </span>

                      {getConfidenceBadge(goal.confidence)}

                      <span className={`text-[11px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                        مهلت تحقق: <span className="font-mono font-bold">{goal.dueDate}</span>
                      </span>
                    </div>

                    <h3 className={`text-base font-bold ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                      {goal.title}
                    </h3>
                    <p className={`text-xs leading-relaxed max-w-4xl ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                      {goal.description}
                    </p>
                  </div>

                  {/* Goal Progress Bar & Actions */}
                  <div className="flex items-center gap-4 min-w-[240px] justify-between lg:justify-end">
                    <div className="space-y-1 text-right">
                      <div className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>میزان تحقق کلی</div>
                      <div className="text-2xl font-black font-mono text-indigo-600 dark:text-indigo-400">{goal.progress}٪</div>
                    </div>
                    <div className={`w-24 h-2.5 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-200'}`}>
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          goal.progress >= 80 ? 'bg-emerald-500' : goal.progress >= 50 ? 'bg-indigo-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${goal.progress}%` }}
                      />
                    </div>

                    {/* Action buttons: Edit & Delete */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditingOkr(JSON.parse(JSON.stringify(goal)))}
                        className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer transition ${
                          theme === 'dark' 
                            ? 'bg-slate-800/80 hover:bg-indigo-900/40 border-slate-700 text-indigo-300' 
                            : 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700'
                        }`}
                        title="ویرایش کامل هدف OKR و سنجه‌ها"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">ویرایش</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeletingOkr(goal)}
                        className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer transition ${
                          theme === 'dark' 
                            ? 'bg-slate-800/80 hover:bg-rose-900/40 border-slate-700 text-rose-400' 
                            : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700'
                        }`}
                        title="حذف هدف OKR"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">حذف</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Key Results Section */}
                <div className="mt-4 space-y-2.5">
                  <div className={`text-[11px] font-bold tracking-wider flex items-center gap-1.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                    <Target className="w-3.5 h-3.5 text-indigo-500" />
                    <span>نتایج کلیدی قابل سنجش (Key Results):</span>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5">
                    {goal.keyResults.map(kr => {
                      const range = kr.targetValue - kr.startValue;
                      const pct = range === 0 ? 100 : Math.min(100, Math.max(0, Math.round(((kr.currentValue - kr.startValue) / range) * 100)));
                      return (
                        <div 
                          key={kr.id} 
                          className={`p-3.5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                            theme === 'dark' 
                              ? 'bg-slate-950/60 border-slate-800/80' 
                              : 'bg-slate-50 border-slate-200 shadow-xs'
                          }`}
                        >
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>{kr.title}</span>
                              {getConfidenceBadge(kr.confidence)}
                            </div>
                            <div className={`text-[11px] flex items-center gap-3 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                              <span>مسئول: <strong className={theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}>{kr.ownerName}</strong></span>
                              <span>•</span>
                              <span>آخرین به‌روزرسانی: <span>{kr.lastUpdated}</span></span>
                            </div>
                          </div>

                          {/* Metric values & interactive quick adjuster */}
                          <div className="flex items-center gap-3">
                            <div className="text-left font-mono">
                              <div className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                                {kr.currentValue} / {kr.targetValue} <span className="text-[10px] font-sans text-slate-500">{kr.unit}</span>
                              </div>
                              <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">{pct}٪ محقق شده</div>
                            </div>

                            {/* Interactive Quick Increment/Decrement */}
                            <div className={`flex items-center gap-1 rounded-lg p-0.5 border ${
                              theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
                            }`}>
                              <button
                                type="button"
                                onClick={() => handleUpdateKrValue(goal.id, kr.id, -1)}
                                className={`w-6 h-6 flex items-center justify-center rounded text-xs font-bold cursor-pointer transition ${
                                  theme === 'dark' ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                                }`}
                                title="کاهش ۱ واحد"
                              >
                                -
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateKrValue(goal.id, kr.id, 1)}
                                className={`w-6 h-6 flex items-center justify-center rounded text-xs font-bold cursor-pointer transition ${
                                  theme === 'dark' ? 'hover:bg-slate-800 text-emerald-400' : 'hover:bg-slate-100 text-emerald-600'
                                }`}
                                title="افزایش ۱ واحد"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: 1-ON-1S & COACHING */}
      {activeSubTab === 'one_on_ones' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Meetings List Sidebar */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className={`text-sm font-bold flex items-center gap-1.5 ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                <Calendar className="w-4 h-4 text-indigo-500" />
                <span>جلسات گفت‌وگوی دونفره</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsNew1on1ModalOpen(true)}
                className="p-1.5 rounded-lg bg-indigo-600/15 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600/25 border border-indigo-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>تنظیم جلسه جدید</span>
              </button>
            </div>

            <div className="space-y-2">
              {oneOnOnes.map(meeting => {
                const isSelected = meeting.id === activeMeeting?.id;
                const completedPoints = meeting.talkingPoints.filter(tp => tp.isCompleted).length;
                return (
                  <div
                    key={meeting.id}
                    onClick={() => setSelected1on1Id(meeting.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-indigo-600/15 border-indigo-500/60 shadow-md' 
                        : theme === 'dark'
                          ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                          : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>{meeting.empName}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        meeting.status === 'completed' 
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' 
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      }`}>
                        {meeting.status === 'completed' ? 'برگزار شد' : 'برنامه‌ریزی شده'}
                      </span>
                    </div>

                    <div className={`text-[11px] flex items-center justify-between ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                      <span>با سرپرست: {meeting.supervisorName}</span>
                      <span className="font-mono">{meeting.scheduledDate}</span>
                    </div>

                    <div className="mt-2 text-[10px] flex items-center gap-2">
                      <span className="text-indigo-600 dark:text-indigo-400 font-bold">{completedPoints} از {meeting.talkingPoints.length} مبحث بررسی شد</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Meeting Workspace */}
          {activeMeeting && (
            <div className={`lg:col-span-8 space-y-5 p-5 rounded-2xl border ${
              theme === 'dark' ? 'bg-slate-900/70 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              {/* Meeting Header */}
              <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b ${
                theme === 'dark' ? 'border-slate-800' : 'border-slate-100'
              }`}>
                <div>
                  <h3 className={`text-base font-bold flex items-center gap-2 ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                    <span>جلسه کوچینگ و بازخورد دونفره:</span>
                    <span className="text-indigo-600 dark:text-indigo-400">{activeMeeting.empName}</span>
                  </h3>
                  <p className={`text-xs mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                    سرپرست مستقیم: {activeMeeting.supervisorName} • زمان: {activeMeeting.scheduledDate}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>شاخص روحیه:</span>
                    <div className="flex items-center gap-1 text-amber-500 text-sm">
                      {[1, 2, 3, 4, 5].map(star => (
                        <span key={star} className={star <= (activeMeeting.moodRating || 4) ? 'opacity-100' : 'opacity-25'}>
                          <Star className="h-4 w-4 fill-current" aria-hidden="true" />
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions for 1-on-1 meeting: Edit and Delete */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditing1on1(JSON.parse(JSON.stringify(activeMeeting)))}
                      className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer transition ${
                        theme === 'dark' 
                          ? 'bg-slate-800/80 hover:bg-indigo-900/40 border-slate-700 text-indigo-300' 
                          : 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700'
                      }`}
                      title="ویرایش مشخصات جلسه 1-on-1"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">ویرایش</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleting1on1(activeMeeting)}
                      className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer transition ${
                        theme === 'dark' 
                          ? 'bg-slate-800/80 hover:bg-rose-900/40 border-slate-700 text-rose-400' 
                          : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700'
                      }`}
                      title="حذف جلسه"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">حذف</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Talking Points */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className={`text-xs font-bold flex items-center gap-1.5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                    <span>موضوعات گفت‌وگو (Shared Talking Points)</span>
                  </h4>
                  <span className={`text-[10px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>هر دو طرف امکان افزودن موضوع دارند</span>
                </div>

                <div className="space-y-2">
                  {activeMeeting.talkingPoints.map(tp => (
                    <div 
                      key={tp.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                        tp.isCompleted 
                          ? theme === 'dark'
                            ? 'bg-emerald-950/20 border-emerald-800/40 text-slate-400 line-through' 
                            : 'bg-emerald-50 border-emerald-200 text-slate-500 line-through'
                          : theme === 'dark'
                            ? 'bg-slate-950/60 border-slate-800 text-slate-200 hover:border-indigo-900/60'
                            : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-indigo-300'
                      }`}
                    >
                      <div 
                        onClick={() => handleToggleTalkingPoint(activeMeeting.id, tp.id)}
                        className="flex items-center gap-2.5 flex-1 cursor-pointer"
                      >
                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                          tp.isCompleted ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-slate-400 dark:border-slate-600'
                        }`}>
                          {tp.isCompleted && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="text-xs font-medium">{tp.text}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                          افزوده شده توسط: {tp.addedBy === 'supervisor' ? 'سرپرست' : 'همکار'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTalkingPoint(activeMeeting.id, tp.id);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                          title="حذف موضوع گفت‌وگو"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add new talking point input */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newTalkingPointText}
                    onChange={(e) => setNewTalkingPointText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTalkingPoint(activeMeeting.id)}
                    placeholder="موضوع جدیدی برای گفت‌وگو اضافه کنید..."
                    className={`flex-1 border rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTalkingPoint(activeMeeting.id)}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer transition"
                  >
                    افزودن
                  </button>
                </div>
              </div>

              {/* Action Items */}
              <div className={`space-y-3 pt-3 border-t ${theme === 'dark' ? 'border-slate-800' : 'border-slate-100'}`}>
                <h4 className={`text-xs font-bold flex items-center gap-1.5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-500" />
                  <span>تعهدات و اقدامات بعد از جلسه (Action Items)</span>
                </h4>

                <div className="space-y-2">
                  {activeMeeting.actionItems.map(ai => (
                    <div 
                      key={ai.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                        ai.isDone 
                          ? theme === 'dark'
                            ? 'bg-teal-950/20 border-teal-800/40 text-slate-400 line-through' 
                            : 'bg-teal-50 border-teal-200 text-slate-500 line-through'
                          : theme === 'dark'
                            ? 'bg-slate-950/60 border-slate-800 text-slate-200 hover:border-teal-900/60'
                            : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-teal-300'
                      }`}
                    >
                      <div 
                        onClick={() => handleToggleActionItem(activeMeeting.id, ai.id)}
                        className="flex items-center gap-2.5 flex-1 cursor-pointer"
                      >
                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                          ai.isDone ? 'bg-teal-600 border-teal-500 text-white' : 'border-slate-400 dark:border-slate-600'
                        }`}>
                          {ai.isDone && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="text-xs font-medium">{ai.title}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className={`text-[10px] flex items-center gap-2 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                          <span>مسئول: <strong className={theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}>{ai.assigneeName}</strong></span>
                          <span>•</span>
                          <span className="font-mono">موعد: {ai.dueDate}</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteActionItem(activeMeeting.id, ai.id);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                          title="حذف اقدام"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add new Action Item */}
                <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newActionItemTitle}
                    onChange={(e) => setNewActionItemTitle(e.target.value)}
                    placeholder="عنوان اقدام توافق‌شده..."
                    className={`flex-1 border rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-teal-500 w-full ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                  <input
                    type="text"
                    value={actionItemAssignee}
                    onChange={(e) => setActionItemAssignee(e.target.value)}
                    placeholder="نام مسئول اقدام"
                    className={`w-full sm:w-40 border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-teal-500 ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => handleAddActionItem(activeMeeting.id)}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer transition"
                  >
                    ثبت اقدام
                  </button>
                </div>
              </div>

              {/* Private Supervisor Coaching Notes */}
              <div className={`p-4 rounded-xl border space-y-2 ${
                theme === 'dark' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200'
              }`}>
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-bold">
                  <Lock className="w-3.5 h-3.5" />
                  <span>یادداشت‌های محرمانه مربیگری سرپرست (Private Coaching Notes)</span>
                </div>
                <p className={`text-xs leading-relaxed ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                  {activeMeeting.privateSupervisorNotes || 'نکته‌ای برای مربیگری ثبت نشده است.'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: PRAISE & KUDOS WALL */}
      {activeSubTab === 'praise' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className={`text-base font-bold flex items-center gap-2 ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                <Award className="w-5 h-5 text-amber-500" />
                <span>دیوار تمجید و قدردانی سازمانی (Kudos & Recognition Wall)</span>
              </h3>
              <p className={`text-xs mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                فرهنگ قدردانی همتایان، پاداش معنوی و پاسداشت ارزش‌های بنیادی شرکت اصفهان چالاک
              </p>
            </div>

            <button
              onClick={() => setIsGiveKudosModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Heart className="w-4 h-4 fill-current" />
              <span>ارسال تمجید برای همکار</span>
            </button>
          </div>

          {/* Kudos Cards Feed */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {kudosList.map(kudos => (
              <div 
                key={kudos.id}
                className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 ${
                  theme === 'dark' 
                    ? 'bg-slate-900/70 border-slate-800 hover:border-pink-900/50 text-slate-100' 
                    : 'bg-white border-slate-200 hover:border-pink-300 text-slate-900 shadow-sm'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-pink-50 dark:bg-pink-500/10 border border-pink-200 dark:border-pink-500/20 flex items-center justify-center text-pink-700 dark:text-pink-300">
                        {(() => {
                          const BadgeIcon = KUDOS_BADGE_OPTIONS.find(option => option.value === kudos.badgeIcon)?.Icon || Star;
                          return <BadgeIcon className="w-5 h-5" aria-hidden="true" />;
                        })()}
                      </div>
                      <div>
                        <div className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                          از طرف <strong className={theme === 'dark' ? 'text-slate-200' : 'text-slate-900'}>{kudos.senderName}</strong> به <strong className="text-pink-600 dark:text-pink-400">{kudos.receiverName}</strong>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">{kudos.createdAt}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                        {kudos.companyValue}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingKudos(JSON.parse(JSON.stringify(kudos)))}
                        className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer transition ${
                          theme === 'dark' 
                            ? 'bg-slate-800/80 hover:bg-pink-900/40 border-slate-700 text-pink-300' 
                            : 'bg-pink-50 hover:bg-pink-100 border-pink-200 text-pink-700'
                        }`}
                        title="ویرایش تمجید"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingKudos(kudos)}
                        className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer transition ${
                          theme === 'dark' 
                            ? 'bg-slate-800/80 hover:bg-rose-900/40 border-slate-700 text-rose-400' 
                            : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700'
                        }`}
                        title="حذف تمجید"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <p className={`text-xs leading-relaxed font-medium p-3 rounded-xl border ${
                    theme === 'dark' 
                      ? 'bg-slate-950/40 border-slate-800/60 text-slate-200' 
                      : 'bg-pink-50/40 border-pink-100 text-slate-800'
                  }`}>
                    «{kudos.message}»
                  </p>
                </div>

                {/* Reaction Buttons */}
                <div className={`flex items-center gap-2 pt-2 border-t ${theme === 'dark' ? 'border-slate-800' : 'border-slate-100'}`}>
                  <button
                    type="button"
                    onClick={() => handleReactKudos(kudos.id, 'claps')}
                    aria-label={`تشویق؛ ${kudos.reactions.claps} واکنش`}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      theme === 'dark' ? 'bg-slate-800/60 hover:bg-slate-700/60 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <Hand aria-hidden="true" className="h-4 w-4" />
                    <span className="font-mono">{kudos.reactions.claps}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReactKudos(kudos.id, 'hearts')}
                    aria-label={`پسندیدن؛ ${kudos.reactions.hearts} واکنش`}
                    className={`px-2.5 py-1 rounded-lg text-rose-500 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      theme === 'dark' ? 'bg-slate-800/60 hover:bg-slate-700/60' : 'bg-slate-100 hover:bg-slate-200'
                    }`}
                  >
                    <Heart aria-hidden="true" className="h-4 w-4" />
                    <span className="font-mono">{kudos.reactions.hearts}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReactKudos(kudos.id, 'rockets')}
                    aria-label={`پیشرفت؛ ${kudos.reactions.rockets} واکنش`}
                    className={`px-2.5 py-1 rounded-lg text-indigo-500 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      theme === 'dark' ? 'bg-slate-800/60 hover:bg-slate-700/60' : 'bg-slate-100 hover:bg-slate-200'
                    }`}
                  >
                    <Rocket aria-hidden="true" className="h-4 w-4" />
                    <span className="font-mono">{kudos.reactions.rockets}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReactKudos(kudos.id, 'stars')}
                    aria-label={`ستاره؛ ${kudos.reactions.stars} واکنش`}
                    className={`px-2.5 py-1 rounded-lg text-amber-500 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      theme === 'dark' ? 'bg-slate-800/60 hover:bg-slate-700/60' : 'bg-slate-100 hover:bg-slate-200'
                    }`}
                  >
                    <Star aria-hidden="true" className="h-4 w-4" />
                    <span className="font-mono">{kudos.reactions.stars}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: PULSE SURVEYS & ENPS */}
      {activeSubTab === 'pulse' && (
        <div className="space-y-6">
          {/* Quick interactive daily pulse check */}
          <div className={`p-5 rounded-2xl border space-y-4 ${
            theme === 'dark' 
              ? 'bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 border-emerald-800/40' 
              : 'bg-gradient-to-r from-emerald-50/50 via-white to-indigo-50/50 border-emerald-200 shadow-sm'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className={`text-base font-bold flex items-center gap-2 ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                  <Activity className="w-5 h-5 text-emerald-500" />
                  <span>نبض امروز شما در سازمان (Daily Pulse Check)</span>
                </h3>
                <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                  میزان احساس تعلق، انگیزش و شفافیت مسیر شغلی خود را با یک کلیک اعلام نمایید (ثبت کاملاً محرمانه):
                </p>
              </div>

              {pulseAnswered && (
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 animate-fade-in flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> نظر شما در تحلیل این ماه ثبت شد
                </span>
              )}
            </div>

            <div className="grid grid-cols-5 gap-2 sm:gap-3 max-w-xl">
              {PULSE_OPTIONS.map(item => {
                const PulseIcon = item.Icon;
                return (
                <button
                  key={item.score}
                  onClick={() => {
                    setSelectedPulseRating(item.score);
                    setPulseAnswered(true);
                  }}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                    selectedPulseRating === item.score
                      ? 'bg-emerald-600 border-emerald-500 text-white shadow-md'
                      : theme === 'dark'
                        ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-300'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700 shadow-xs'
                  }`}
                >
                  <PulseIcon className={`h-6 w-6 ${selectedPulseRating === item.score ? 'text-white' : item.color}`} aria-hidden="true" />
                  <span className="text-[10px] font-bold text-center">{item.label}</span>
                </button>
                );
              })}
            </div>
          </div>

          {/* Pulse Indices Dashboard */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {pulseMetrics.map(metric => (
              <div 
                key={metric.id} 
                className={`p-4 rounded-2xl border space-y-3 ${
                  theme === 'dark' ? 'bg-slate-900/70 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                }`}
              >
                <div className={`flex items-center justify-between text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                  <span>نرخ مشارکت: <strong className={theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}>{metric.responseRate}٪</strong></span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold flex items-center gap-0.5">
                    <TrendingUp className="w-3 h-3" /> {metric.changeValue}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>{metric.title}</div>
                  <div className="text-3xl font-black font-mono text-indigo-600 dark:text-indigo-400">{metric.score}٪</div>
                </div>

                <div className={`w-full h-1.5 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-200'}`}>
                  <div 
                    className="h-full rounded-full bg-indigo-500" 
                    style={{ width: `${metric.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* eNPS Organizational Score Details */}
          <div className={`p-6 rounded-2xl border grid grid-cols-1 md:grid-cols-3 gap-6 ${
            theme === 'dark' ? 'bg-slate-900/70 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className={`space-y-2 md:border-l pl-4 ${theme === 'dark' ? 'border-slate-800' : 'border-slate-100'}`}>
              <div className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>شاخص خالص ترویج‌کنندگان (eNPS)</div>
              <div className="text-4xl font-black font-mono text-emerald-600 dark:text-emerald-400">+48</div>
              <p className={`text-xs leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                بر اساس پاسخ به سوال «چقدر احتمال دارد اصفهان چالاک را به عنوان محل کار عالی به دیگران پیشنهاد دهید؟»
              </p>
            </div>

            <div className={`space-y-2 md:border-l pl-4 ${theme === 'dark' ? 'border-slate-800' : 'border-slate-100'}`}>
              <div className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>توزیع نگرش پرسنل</div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                  <span>مروجان و سفیران سازمانی (Promoters):</span>
                  <span className="font-mono">۶۴٪</span>
                </div>
                <div className="flex justify-between text-amber-600 dark:text-amber-400 font-bold">
                  <span>بی‌طرف و محافظه‌کار (Passives):</span>
                  <span className="font-mono">۲۰٪</span>
                </div>
                <div className="flex justify-between text-rose-600 dark:text-rose-400 font-bold">
                  <span>منتقدان و ناراضیان (Detractors):</span>
                  <span className="font-mono">۱۶٪</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>توصیه هوشمند سیستم</div>
              <p className={`text-xs leading-relaxed ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                ارزیابی نشان‌دهنده امنیت روانی بالا در بیان ایده‌هاست، اما در شیفت شب سالن ماشین‌کاری نیاز به پایش فشار کاری و استراحت‌های تجدید قوا وجود دارد.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Give Kudos */}
      {isGiveKudosModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="give-kudos-dialog-title"
            className={`border w-full max-w-lg rounded-2xl p-6 space-y-4 text-right shadow-2xl animate-scale-up ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}
          >
            <div className={`flex items-center justify-between pb-3 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
              <h3 id="give-kudos-dialog-title" className="text-base font-bold flex items-center gap-2">
                <Heart className="w-5 h-5 text-pink-500 fill-current" />
                <span>ارسال تمجید سازمانی برای همکار (Kudos)</span>
              </h3>
              <button 
                type="button"
                onClick={() => setIsGiveKudosModalOpen(false)}
                aria-label="بستن"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSendKudos} className="space-y-4">
              <div className="space-y-1.5">
                <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>انتخاب همکار دریافت‌کننده:</label>
                <select
                  value={kudosReceiverId}
                  onChange={(e) => setKudosReceiverId(e.target.value)}
                  className={`w-full border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-pink-500 ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>ارزش سازمانی منطبق:</label>
                <select
                  value={kudosCompanyValue}
                  onChange={(e) => setKudosCompanyValue(e.target.value as any)}
                  className={`w-full border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-pink-500 ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="کیفیت برتر">کیفیت برتر و دقت فنی</option>
                  <option value="کار تیمی و همدلی">کار تیمی و همدلی</option>
                  <option value="تعهد به ایمنی و HSE">تعهد به ایمنی و بهداشت (HSE)</option>
                  <option value="نوآوری و خلاقیت فنی">نوآوری و خلاقیت فنی</option>
                  <option value="مسئولیت‌پذیری و انضباط">مسئولیت‌پذیری و انضباط</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>انتخاب نشان نمادین (Badge Icon):</label>
                <div role="group" aria-label="انتخاب نشان نمادین" className="flex flex-wrap gap-2">
                  {KUDOS_BADGE_OPTIONS.map(({ value, label, Icon: BadgeIcon }) => (
                    <button
                      type="button"
                      key={value}
                      title={label}
                      aria-label={label}
                      aria-pressed={kudosBadge === value}
                      onClick={() => setKudosBadge(value)}
                      className={`min-h-10 min-w-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                        kudosBadge === value
                          ? 'bg-pink-600 text-white ring-2 ring-pink-500/30'
                          : theme === 'dark' ? 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-600' : 'bg-slate-100 border border-slate-300 text-slate-700 hover:bg-white'
                      }`}
                    >
                      <BadgeIcon className="w-5 h-5" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>متن پیام تقدیر و تشکر:</label>
                <textarea
                  required
                  rows={3}
                  value={kudosMessage}
                  onChange={(e) => setKudosMessage(e.target.value)}
                  placeholder="دلیل تمجید خود را بنویسید (مثلاً: کمک فوق‌العاده در رفع عیب ماشین...)"
                  className={`w-full border rounded-xl p-3 text-xs focus:outline-none focus:border-pink-500 leading-relaxed ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsGiveKudosModalOpen(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                    theme === 'dark' ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 text-white text-xs font-bold shadow-md cursor-pointer"
                >
                  ارسال روی دیوار تمجید
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL 2: New OKR (Fully functional) */}
      {isNewOkrModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`border w-full max-w-xl rounded-2xl p-6 space-y-4 text-right shadow-2xl animate-scale-up max-h-[90vh] overflow-y-auto ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className={`flex items-center justify-between pb-3 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
              <h3 className="text-base font-bold flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-500" />
                <span>ثبت و فعال‌سازی هدف استراتژیک جدید (OKR)</span>
              </h3>
              <button 
                type="button"
                onClick={() => setIsNewOkrModalOpen(false)}
                aria-label="بستن"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewOkr} className="space-y-4">
              <div className="space-y-1.5">
                <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>عنوان هدف (Objective):</label>
                <input
                  type="text"
                  required
                  value={newOkrTitle}
                  onChange={(e) => setNewOkrTitle(e.target.value)}
                  placeholder="مثال: ارتقای شاخص اثربخشی کلی تجهیزات خطوط تولید..."
                  className={`w-full border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>توضیحات و چرایی استراتژیک:</label>
                <textarea
                  rows={2}
                  value={newOkrDescription}
                  onChange={(e) => setNewOkrDescription(e.target.value)}
                  placeholder="توضیح دهید چرا این هدف برای پیشبرد ماموریت شرکت حیاتی است..."
                  className={`w-full border rounded-xl p-3 text-xs focus:outline-none focus:border-indigo-500 leading-relaxed ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>سطح هدف:</label>
                  <select
                    value={newOkrLevel}
                    onChange={(e) => setNewOkrLevel(e.target.value as any)}
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="company">استراتژیک کل سازمان</option>
                    <option value="department">واحد سازمانی / دپارتمان</option>
                    <option value="individual">فردی پرسنل</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>واحد سازمانی مسئول:</label>
                  <input
                    type="text"
                    value={newOkrDepartment}
                    onChange={(e) => setNewOkrDepartment(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>مسئول پیگیری هدف:</label>
                  <select
                    value={newOkrOwnerId}
                    onChange={(e) => setNewOkrOwnerId(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  >
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>مهلت تحقق:</label>
                  <input
                    type="text"
                    value={newOkrDueDate}
                    onChange={(e) => setNewOkrDueDate(e.target.value)}
                    placeholder="مثال: ۱۴۰۵/۰۶/۳۱"
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              {/* Initial Key Result Definition */}
              <div className={`p-4 rounded-xl border space-y-3 ${
                theme === 'dark' ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  <span>نتیجه کلیدی کمی اولیه (Key Result):</span>
                </div>

                <div className="space-y-1.5">
                  <input
                    type="text"
                    required
                    value={newKrTitle}
                    onChange={(e) => setNewKrTitle(e.target.value)}
                    placeholder="عنوان شاخص قابل اندازه‌گیری (مثال: افزایش نمره رضایت کیفی قطعات به ۹۲)"
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500">مقدار پایه:</label>
                    <input
                      type="number"
                      value={newKrStartValue}
                      onChange={(e) => setNewKrStartValue(Number(e.target.value))}
                      className={`w-full border rounded-lg px-2.5 py-1.5 text-xs text-center font-mono ${
                        theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">مقدار هدف:</label>
                    <input
                      type="number"
                      value={newKrTargetValue}
                      onChange={(e) => setNewKrTargetValue(Number(e.target.value))}
                      className={`w-full border rounded-lg px-2.5 py-1.5 text-xs text-center font-mono ${
                        theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">واحد سنجش:</label>
                    <input
                      type="text"
                      value={newKrUnit}
                      onChange={(e) => setNewKrUnit(e.target.value)}
                      placeholder="درصد، مورد، ساعت"
                      className={`w-full border rounded-lg px-2.5 py-1.5 text-xs text-center ${
                        theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewOkrModalOpen(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                    theme === 'dark' ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md cursor-pointer transition"
                >
                  ثبت و فعال‌سازی هدف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: New 1-on-1 Meeting (Fully functional) */}
      {isNew1on1ModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`border w-full max-w-lg rounded-2xl p-6 space-y-4 text-right shadow-2xl animate-scale-up ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className={`flex items-center justify-between pb-3 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
              <h3 className="text-base font-bold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-500" />
                <span>برنامه‌ریزی جلسه کوچینگ و گفت‌وگوی دونفره (1-on-1)</span>
              </h3>
              <button 
                type="button"
                onClick={() => setIsNew1on1ModalOpen(false)}
                aria-label="بستن"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNew1on1} className="space-y-4">
              <div className="space-y-1.5">
                <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>طرف گفت‌وگو (همکار شاغل):</label>
                <select
                  value={new1on1EmpId}
                  onChange={(e) => setNew1on1EmpId(e.target.value)}
                  className={`w-full border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  {employees.filter(e => e.id !== currentUser.id).map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>تاریخ و زمان جلسه:</label>
                <input
                  type="text"
                  required
                  value={new1on1Date}
                  onChange={(e) => setNew1on1Date(e.target.value)}
                  placeholder="مثال: ۱۴۰۵/۰۶/۲۵ ساعت ۱۴:۰۰"
                  className={`w-full border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>مبحث اصلی دستور جلسه (Talking Point اولیه):</label>
                <textarea
                  rows={2}
                  value={new1on1InitialTopic}
                  onChange={(e) => setNew1on1InitialTopic(e.target.value)}
                  placeholder="مثلاً: بررسی دستاوردها، شناسایی گلوگاه‌های فرایندی و نیازهای آموزشی شاغل..."
                  className={`w-full border rounded-xl p-3 text-xs focus:outline-none focus:border-indigo-500 leading-relaxed ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNew1on1ModalOpen(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                    theme === 'dark' ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md cursor-pointer transition"
                >
                  تنظیم و ثبت جلسه
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE OKR MODAL */}
      {deletingOkr && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 text-right my-auto">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 bg-rose-500/10 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">حذف هدف OKR</h3>
                <p className="text-xs text-slate-400">{deletingOkr.level === 'company' ? 'سطح سازمان' : deletingOkr.department}</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              آیا از حذف هدف <span className="font-bold text-white">«{deletingOkr.title}»</span> و کلیه سنجه‌های کلیدی مرتبط با آن اطمینان دارید؟
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingOkr(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => handleDeleteOkr(deletingOkr.id)}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/20 cursor-pointer"
              >
                تایید و حذف قطعی
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* EDIT OKR MODAL */}
      {editingOkr && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className={`relative w-full max-w-2xl rounded-2xl border p-6 shadow-2xl space-y-4 my-auto max-h-[90vh] overflow-y-auto ${
            theme === 'dark' ? 'bg-slate-900 border-indigo-500/30 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-indigo-400">
                <Edit2 className="w-5 h-5" />
                <h3 className="text-base font-bold">ویرایش هدف استراتژیک و نتایج کلیدی (OKR)</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingOkr(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">عنوان هدف (Objective):</label>
                <input
                  type="text"
                  value={editingOkr.title}
                  onChange={e => setEditingOkr({ ...editingOkr, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">شرح و انگیزه استراتژیک:</label>
                <textarea
                  rows={2}
                  value={editingOkr.description}
                  onChange={e => setEditingOkr({ ...editingOkr, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold mb-1">سطح هدف:</label>
                  <select
                    value={editingOkr.level}
                    onChange={e => setEditingOkr({ ...editingOkr, level: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="company">کل سازمان</option>
                    <option value="department">واحد سازمانی</option>
                    <option value="individual">فردی</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold mb-1">واحد مربوطه:</label>
                  <input
                    type="text"
                    value={editingOkr.department || ''}
                    onChange={e => setEditingOkr({ ...editingOkr, department: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">مهلت تحقق:</label>
                  <input
                    type="text"
                    value={editingOkr.dueDate}
                    onChange={e => setEditingOkr({ ...editingOkr, dueDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Key Results editing */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-400">نتایج کلیدی (Key Results):</span>
                  <button
                    type="button"
                    onClick={() => {
                      const newKr: OKRKeyResult = {
                        id: `kr-${Date.now()}`,
                        title: 'سنجه کلیدی جدید',
                        metricType: 'percentage',
                        startValue: 0,
                        currentValue: 0,
                        targetValue: 100,
                        unit: 'درصد',
                        ownerName: currentUser.name,
                        confidence: 'on_track',
                        lastUpdated: 'همین الان'
                      };
                      setEditingOkr({
                        ...editingOkr,
                        keyResults: [...editingOkr.keyResults, newKr]
                      });
                    }}
                    className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-300 rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> افزودن سنجه کلیدی
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto p-1">
                  {editingOkr.keyResults.map((kr, idx) => (
                    <div key={kr.id} className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          value={kr.title}
                          onChange={e => {
                            const newKrs = [...editingOkr.keyResults];
                            newKrs[idx] = { ...newKrs[idx], title: e.target.value };
                            setEditingOkr({ ...editingOkr, keyResults: newKrs });
                          }}
                          placeholder="عنوان سنجه کلیدی..."
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newKrs = editingOkr.keyResults.filter((_, i) => i !== idx);
                            setEditingOkr({ ...editingOkr, keyResults: newKrs });
                          }}
                          className="p-1 text-rose-400 hover:text-rose-300 cursor-pointer"
                          title="حذف این سنجه"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-[11px]">
                        <div>
                          <label className="text-slate-400 block text-[10px]">شروع:</label>
                          <input
                            type="number"
                            value={kr.startValue}
                            onChange={e => {
                              const newKrs = [...editingOkr.keyResults];
                              newKrs[idx] = { ...newKrs[idx], startValue: Number(e.target.value) };
                              setEditingOkr({ ...editingOkr, keyResults: newKrs });
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 block text-[10px]">فعلی:</label>
                          <input
                            type="number"
                            value={kr.currentValue}
                            onChange={e => {
                              const newKrs = [...editingOkr.keyResults];
                              newKrs[idx] = { ...newKrs[idx], currentValue: Number(e.target.value) };
                              setEditingOkr({ ...editingOkr, keyResults: newKrs });
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 block text-[10px]">هدف:</label>
                          <input
                            type="number"
                            value={kr.targetValue}
                            onChange={e => {
                              const newKrs = [...editingOkr.keyResults];
                              newKrs[idx] = { ...newKrs[idx], targetValue: Number(e.target.value) };
                              setEditingOkr({ ...editingOkr, keyResults: newKrs });
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 block text-[10px]">واحد:</label>
                          <input
                            type="text"
                            value={kr.unit}
                            onChange={e => {
                              const newKrs = [...editingOkr.keyResults];
                              newKrs[idx] = { ...newKrs[idx], unit: e.target.value };
                              setEditingOkr({ ...editingOkr, keyResults: newKrs });
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingOkr(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => handleSaveEditedOkr(editingOkr)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 cursor-pointer"
              >
                <Save className="w-4 h-4" /> ذخیره تغییرات OKR
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* EDIT 1-ON-1 MODAL */}
      {editing1on1 && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className={`relative w-full max-w-lg rounded-2xl border p-6 shadow-2xl space-y-4 my-auto max-h-[90vh] overflow-y-auto ${
            theme === 'dark' ? 'bg-slate-900 border-indigo-500/30 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-indigo-400">
                <Edit2 className="w-5 h-5" />
                <h3 className="text-base font-bold">ویرایش جلسه کوچینگ و گفت‌وگو (1-on-1)</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditing1on1(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">طرف گفت‌وگو (همکار شاغل):</label>
                <select
                  value={editing1on1.empId}
                  onChange={e => {
                    const emp = employees.find(emp => emp.id === e.target.value);
                    setEditing1on1({
                      ...editing1on1,
                      empId: e.target.value,
                      empName: emp ? emp.name : editing1on1.empName
                    });
                  }}
                  className={`w-full border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">سرپرست مستقیم:</label>
                  <input
                    type="text"
                    value={editing1on1.supervisorName}
                    onChange={e => setEditing1on1({ ...editing1on1, supervisorName: e.target.value })}
                    className={`w-full border rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">تاریخ و ساعت برگزاری:</label>
                  <input
                    type="text"
                    value={editing1on1.scheduledDate}
                    onChange={e => setEditing1on1({ ...editing1on1, scheduledDate: e.target.value })}
                    className={`w-full border rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">وضعیت برگزاری:</label>
                  <select
                    value={editing1on1.status}
                    onChange={e => setEditing1on1({ ...editing1on1, status: e.target.value as any })}
                    className={`w-full border rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="scheduled">برنامه‌ریزی شده</option>
                    <option value="completed">برگزار شد</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold mb-1">شاخص روحیه جلسه (۱ تا ۵):</label>
                  <select
                    value={editing1on1.moodRating || 4}
                    onChange={e => setEditing1on1({ ...editing1on1, moodRating: Number(e.target.value) })}
                    className={`w-full border rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value={1}>۱ ستاره (نیاز به پیگیری شدید)</option>
                    <option value={2}>۲ ستاره (کم‌انرژی)</option>
                    <option value={3}>۳ ستاره (معمولی)</option>
                    <option value={4}>۴ ستاره (خوب و سازنده)</option>
                    <option value={5}>۵ ستاره (عالی و بسیار پرانرژی)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">یادداشت‌های محرمانه مربیگری سرپرست:</label>
                <textarea
                  rows={3}
                  value={editing1on1.privateSupervisorNotes || ''}
                  onChange={e => setEditing1on1({ ...editing1on1, privateSupervisorNotes: e.target.value })}
                  placeholder="نکات مربیگری و تحلیل رفتار همکار..."
                  className={`w-full border rounded-xl p-3 text-xs focus:outline-none focus:border-indigo-500 leading-relaxed ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditing1on1(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => handleSaveEdited1on1(editing1on1)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 cursor-pointer"
              >
                <Save className="w-4 h-4" /> ذخیره تغییرات جلسه
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* DELETE 1-ON-1 MODAL */}
      {deleting1on1 && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 text-right my-auto">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 bg-rose-500/10 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">حذف جلسه کوچینگ (1-on-1)</h3>
                <p className="text-xs text-slate-400">{deleting1on1.scheduledDate}</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              آیا از حذف جلسه گفت‌وگوی دونفره با همکار <span className="font-bold text-white">«{deleting1on1.empName}»</span> و کلیه اقدامات ثبت‌شده در آن اطمینان دارید؟
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleting1on1(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => handleDelete1on1(deleting1on1.id)}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/20 cursor-pointer"
              >
                تایید و حذف قطعی
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* EDIT KUDOS MODAL */}
      {editingKudos && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className={`relative w-full max-w-lg rounded-2xl border p-6 shadow-2xl space-y-4 my-auto max-h-[90vh] overflow-y-auto ${
            theme === 'dark' ? 'bg-slate-900 border-pink-500/30 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-pink-400">
                <Heart className="w-5 h-5 fill-current" />
                <h3 className="text-base font-bold">ویرایش پیام تقدیر و تمجید (Kudos)</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingKudos(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">همکار دریافت‌کننده:</label>
                <select
                  value={editingKudos.receiverId}
                  onChange={e => {
                    const emp = employees.find(emp => emp.id === e.target.value);
                    setEditingKudos({
                      ...editingKudos,
                      receiverId: e.target.value,
                      receiverName: emp ? emp.name : editingKudos.receiverName
                    });
                  }}
                  className={`w-full border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-pink-500 ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold mb-1">نام فرستنده:</label>
                <input
                  type="text"
                  value={editingKudos.senderName}
                  onChange={e => setEditingKudos({ ...editingKudos, senderName: e.target.value })}
                  className={`w-full border rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-pink-500 ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className="block font-bold mb-1">ارزش سازمانی منطبق:</label>
                <select
                  value={editingKudos.companyValue}
                  onChange={e => setEditingKudos({ ...editingKudos, companyValue: e.target.value as any })}
                  className={`w-full border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-pink-500 ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="کیفیت برتر">کیفیت برتر و دقت فنی</option>
                  <option value="کار تیمی و همدلی">کار تیمی و همدلی</option>
                  <option value="تعهد به ایمنی و HSE">تعهد به ایمنی و بهداشت (HSE)</option>
                  <option value="نوآوری و خلاقیت فنی">نوآوری و خلاقیت فنی</option>
                  <option value="مسئولیت‌پذیری و انضباط">مسئولیت‌پذیری و انضباط</option>
                </select>
              </div>

              <div>
                <label className="block font-bold mb-1">انتخاب نشان نمادین (Badge Icon):</label>
                <div className="flex gap-2">
                  {KUDOS_BADGE_OPTIONS.map(({ value, label, Icon: BadgeIcon }) => (
                    <button
                      type="button"
                      key={value}
                      title={label}
                      aria-label={label}
                      aria-pressed={editingKudos.badgeIcon === value}
                      onClick={() => setEditingKudos({ ...editingKudos, badgeIcon: value })}
                      className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center transition-all cursor-pointer ${
                        editingKudos.badgeIcon === value
                          ? 'bg-pink-600 text-white shadow-sm ring-2 ring-pink-500/30'
                          : theme === 'dark' ? 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-600' : 'bg-slate-100 border border-slate-300 text-slate-700 hover:bg-white'
                      }`}
                    >
                      <BadgeIcon className="w-5 h-5" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">متن پیام تقدیر و تشکر:</label>
                <textarea
                  required
                  rows={3}
                  value={editingKudos.message}
                  onChange={e => setEditingKudos({ ...editingKudos, message: e.target.value })}
                  className={`w-full border rounded-xl p-3 text-xs focus:outline-none focus:border-pink-500 leading-relaxed ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingKudos(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => handleSaveEditedKudos(editingKudos)}
                className="px-5 py-2 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-pink-600/20 cursor-pointer"
              >
                <Save className="w-4 h-4" /> ذخیره تغییرات تمجید
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* DELETE KUDOS MODAL */}
      {deletingKudos && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 text-right my-auto">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 bg-rose-500/10 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">حذف پیام تمجید و قدردانی</h3>
                <p className="text-xs text-slate-400">ارزش سازمانی: {deletingKudos.companyValue}</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              آیا از حذف پیام قدردانی از <span className="font-bold text-white">«{deletingKudos.senderName}»</span> به <span className="font-bold text-white">«{deletingKudos.receiverName}»</span> با متن:
            </p>
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-300 italic">
              «{deletingKudos.message}»
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingKudos(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => handleDeleteKudos(deletingKudos.id)}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/20 cursor-pointer"
              >
                تایید و حذف قطعی
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

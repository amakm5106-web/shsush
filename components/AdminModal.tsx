'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  X,
  Check,
  Ban,
  Settings as SettingsIcon,
  BarChart3,
  ArrowDownLeft,
  ArrowUpRight,
  Save,
  Dices,
  RefreshCw,
  Search,
  Users,
  Wallet,
  AlertTriangle,
  ShieldCheck,
  Crown,
  Flame,
  Copy,
  PlusCircle,
  MinusCircle,
  Building2,
  CheckCircle2,
  Database,
} from 'lucide-react';
import {
  DepositRequest,
  GameSettings,
  PlayerBet,
  WithdrawalRequest,
  UserProfile,
  CurrentRoundData,
} from '@/lib/types';
import { formatKs, classifyDiceTotal, classifyDiceColor } from '@/lib/constants';
import { sounds } from '@/lib/audio';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GameSettings;
  pendingDeposits: DepositRequest[];
  pendingWithdrawals: WithdrawalRequest[];
  allBets: PlayerBet[];
  currentRound: CurrentRoundData | null;
  onApproveDeposit: (depositId: string, userId: string, amount: number) => Promise<boolean>;
  onDeclineDeposit: (depositId: string) => Promise<boolean>;
  onApproveWithdrawal: (withdrawalId: string, userId: string, amount: number) => Promise<boolean>;
  onDeclineWithdrawal: (withdrawalId: string, userId: string, amount: number, reason?: string) => Promise<boolean>;
  onUpdateSettings: (newSettings: GameSettings) => Promise<boolean>;
  onTriggerRoll: () => void;
  onAdjustUserBalance: (
    userId: string,
    amount: number,
    isDeduct: boolean,
    note: string
  ) => Promise<{ success: boolean; newBalance?: number; error?: string; user?: UserProfile }>;
  onSearchUsers?: (query: string) => Promise<UserProfile[]>;
  onToggleUserFlag?: (userId: string, isFlagged: boolean) => Promise<boolean>;
  onToggleUserRole?: (userId: string, newRole: 'admin' | 'user') => Promise<boolean>;
  onForceDiceRoll?: (dice1: number, dice2: number) => Promise<boolean>;
}

export function AdminModal({
  isOpen,
  onClose,
  settings,
  pendingDeposits,
  pendingWithdrawals,
  allBets,
  currentRound,
  onApproveDeposit,
  onDeclineDeposit,
  onApproveWithdrawal,
  onDeclineWithdrawal,
  onUpdateSettings,
  onTriggerRoll,
  onAdjustUserBalance,
  onSearchUsers,
  onToggleUserFlag,
  onToggleUserRole,
  onForceDiceRoll,
}: AdminModalProps) {
  const [activeTab, setActiveTab] = useState<'deposits' | 'withdrawals' | 'users' | 'dice' | 'banking' | 'settings' | 'turso'>('deposits');
  const [prevSettings, setPrevSettings] = useState<GameSettings>(settings);
  const [formSettings, setFormSettings] = useState<GameSettings>({ ...settings });
  const [saving, setSaving] = useState<boolean>(false);
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [rejectionTarget, setRejectionTarget] = useState<WithdrawalRequest | null>(null);
  const [rejectionNote, setRejectionNote] = useState<string>('');

  // Turso Database Migration States
  const [tursoDbUrl, setTursoDbUrl] = useState<string>('libsql://casino-xavianelio.aws-ap-southeast-1.turso.io');
  const [tursoAuthToken, setTursoAuthToken] = useState<string>(
    'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTQwOTkxNjMsImlkIjoiMDFhMWI2YjItMzgwMS03ZDBkLTliODQtNjAxNWVjNjM3ZTgzIiwia2lkIjoiQUFOQ3JJdjV5b0l5aERZbXlXZXU3dWNJNE9wUHZmZGp3S1plbVFob0VtdyIsInJpZCI6ImE5Y2ZmN2U5LWIyNjAtNDk0YS05ZmE0LWRkZWEyMzQ3Y2YxMiJ9.bjJi_iZ9gYIlksPBHMIUVDZ0df6Z-uZbLLrUWgAemrWsbFg98m8Uf9S38T7cElh6Op7fiK9KEwG4Letad1uZDQ'
  );
  const [tursoChecking, setTursoChecking] = useState<boolean>(false);
  const [tursoStatus, setTursoStatus] = useState<{ success: boolean; msg: string; detail?: string } | null>({
    success: true,
    msg: 'Turso Database ချိတ်ဆက်မှု အောင်မြင်နေပါသည် (Connected)',
  });
  const [isMigrating, setIsMigrating] = useState<boolean>(false);
  const [migrationResult, setMigrationResult] = useState<any | null>(null);

  // User Management & Balance Adjustment States
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [userList, setUserList] = useState<UserProfile[]>([]);
  const [searchingUsers, setSearchingUsers] = useState<boolean>(false);
  const [userFilter, setUserFilter] = useState<'all' | 'users' | 'admins' | 'deposited' | 'flagged'>('all');
  
  // Direct Balance Adjuster State
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [targetUserObj, setTargetUserObj] = useState<UserProfile | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<string>('');
  const [isDeductMode, setIsDeductMode] = useState<boolean>(false);
  const [adjustReason, setAdjustReason] = useState<string>('Admin Manual Topup');
  const [adjustingBalance, setAdjustingBalance] = useState<boolean>(false);
  const [balanceFeedback, setBalanceFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Dice Override State
  const [forcedDice1, setForcedDice1] = useState<number>(3);
  const [forcedDice2, setForcedDice2] = useState<number>(4);
  const [savingDiceOverride, setSavingDiceOverride] = useState<boolean>(false);
  const [overrideFeedback, setOverrideFeedback] = useState<string | null>(null);

  // Sync settings when props change
  if (settings !== prevSettings) {
    setPrevSettings(settings);
    setFormSettings({ ...settings });
  }

  // Load initial users when switching to 'users' tab
  useEffect(() => {
    if (activeTab === 'users' && isOpen && userList.length === 0 && onSearchUsers) {
      const timer = setTimeout(() => {
        setSearchingUsers(true);
        onSearchUsers('')
          .then((res) => {
            if (res) setUserList(res);
          })
          .finally(() => setSearchingUsers(false));
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeTab, isOpen, onSearchUsers, userList.length]);

  if (!isOpen) return null;

  // Analytics computation
  const totalWager = allBets.reduce((acc, b) => acc + (b.amount || 0), 0);
  const totalPayout = allBets.reduce((acc, b) => acc + (b.payout || 0), 0);
  const grossProfit = totalWager - totalPayout;
  const totalWins = allBets.filter((b) => b.status === 'win').length;
  const totalLoss = allBets.filter((b) => b.status === 'loss').length;

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const ok = await onUpdateSettings(formSettings);
      if (ok) {
        sounds.playWin();
        alert('Settings သိမ်းဆည်းပြီးပါပြီ!');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSearchUsersSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!onSearchUsers) return;
    setSearchingUsers(true);
    try {
      const res = await onSearchUsers(userSearchQuery.trim());
      setUserList(res || []);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleLookupUserForAdjust = async (uidOrPhone: string) => {
    if (!uidOrPhone.trim()) return;
    setBalanceFeedback(null);
    setAdjustingBalance(true);
    try {
      if (onSearchUsers) {
        const found = await onSearchUsers(uidOrPhone.trim());
        if (found && found.length > 0) {
          setTargetUserObj(found[0]);
          setTargetUserId(found[0].uid);
        } else {
          setBalanceFeedback({ type: 'error', msg: 'ဤ ID သို့မဟုတ် ဖုန်းနံပါတ်ဖြင့် မန်ဘာမတွေ့ရှိပါ' });
          setTargetUserObj(null);
        }
      }
    } finally {
      setAdjustingBalance(false);
    }
  };

  const handleExecuteBalanceAdjustment = async () => {
    const num = Number(adjustAmount.replace(/,/g, ''));
    if (!targetUserId.trim()) {
      setBalanceFeedback({ type: 'error', msg: 'မန်ဘာ User ID ထည့်သွင်းပေးပါ' });
      return;
    }
    if (isNaN(num) || num <= 0) {
      setBalanceFeedback({ type: 'error', msg: 'မှန်ကန်သော ငွေပမာဏ ရိုက်ထည့်ပါ' });
      return;
    }

    setAdjustingBalance(true);
    setBalanceFeedback(null);
    try {
      const res = await onAdjustUserBalance(
        targetUserId.trim(),
        num,
        isDeductMode,
        adjustReason.trim() || 'Admin Adjustment'
      );
      if (res.success) {
        sounds.playWin();
        setBalanceFeedback({
          type: 'success',
          msg: `အောင်မြင်ပါသည်! လက်ကျန်ငွေအသစ်: ${formatKs(res.newBalance || 0)}`,
        });
        setAdjustAmount('');
        if (res.user) {
          setTargetUserObj(res.user);
        }
        // Refresh local users list if present
        if (onSearchUsers) {
          onSearchUsers(userSearchQuery).then((u) => setUserList(u || []));
        }
      } else {
        setBalanceFeedback({ type: 'error', msg: res.error || 'လုပ်ဆောင်မှု မအောင်မြင်ပါ' });
      }
    } finally {
      setAdjustingBalance(false);
    }
  };

  const handleSaveForcedDice = async () => {
    if (!onForceDiceRoll) return;
    setSavingDiceOverride(true);
    setOverrideFeedback(null);
    try {
      const ok = await onForceDiceRoll(forcedDice1, forcedDice2);
      if (ok) {
        sounds.playWin();
        const total = forcedDice1 + forcedDice2;
        setOverrideFeedback(`အောင်မြင်ပါသည်! နောက်အလှည့်တွင် အံစာ (${forcedDice1}, ${forcedDice2} = ${total}) ထွက်ပေါ်ပါမည်။`);
        setTimeout(() => setOverrideFeedback(null), 6000);
      }
    } finally {
      setSavingDiceOverride(false);
    }
  };

  // Filtered users
  const filteredUsers = userList.filter((u) => {
    if (userFilter === 'admins') return u.role === 'admin';
    if (userFilter === 'users') return u.role !== 'admin';
    if (userFilter === 'deposited') return u.hasSuccessfulDeposit;
    if (userFilter === 'flagged') return u.isHedgingFlagged;
    return true;
  });

  const forcedTotal = forcedDice1 + forcedDice2;
  const forcedClass = classifyDiceTotal(forcedTotal);
  const forcedColor = classifyDiceColor(forcedTotal);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-xl animate-fadeIn">
      <div className="relative w-full max-w-3xl dark-glass rounded-3xl p-3 sm:p-5 shadow-[0_20px_60px_rgba(0,0,0,0.85)] border border-white/20 flex flex-col max-h-[94vh] overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/15">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-400">
              <ShieldAlert className="w-5 h-5 stroke-[2.4]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-white text-base tracking-tight">Casino Master Admin Panel</h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-black uppercase tracking-wider">
                  Super Admin
                </span>
              </div>
              <p className="text-[11px] text-white/70 font-medium">
                ငွေသွင်း/ထုတ် အတည်ပြုခြင်း • ID ဖြင့် Balance တိုး/နှုတ် • User စာရင်း • Live အံစာ ထိန်းချုပ်မှု
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              sounds.playChip();
              onClose();
            }}
            className="p-2 rounded-xl dark-glass-btn text-white hover:bg-white/10 active:scale-90 transition-all"
          >
            <X className="w-5 h-5 stroke-white stroke-[2.4]" />
          </button>
        </div>

        {/* 6-Tab Navigation Bar */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 p-1 dark-glass rounded-2xl my-2.5 border border-white/15">
          <button
            onClick={() => {
              sounds.playChip();
              setActiveTab('deposits');
            }}
            className={`flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-[11px] font-black transition-all ${
              activeTab === 'deposits'
                ? 'bg-amber-400 text-black shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5 stroke-[2.4]" />
            ငွေသွင်း ({pendingDeposits.length})
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              setActiveTab('withdrawals');
            }}
            className={`flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-[11px] font-black transition-all ${
              activeTab === 'withdrawals'
                ? 'bg-amber-400 text-black shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.4]" />
            ငွေထုတ် ({pendingWithdrawals.length})
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              setActiveTab('users');
            }}
            className={`flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-[11px] font-black transition-all ${
              activeTab === 'users'
                ? 'bg-amber-400 text-black shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5 stroke-[2.4]" />
            မန်ဘာ & Balance
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              setActiveTab('dice');
            }}
            className={`flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-[11px] font-black transition-all ${
              activeTab === 'dice'
                ? 'bg-amber-400 text-black shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Dices className="w-3.5 h-3.5 stroke-[2.4]" />
            အံစာ & Win
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              setActiveTab('banking');
            }}
            className={`flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-[11px] font-black transition-all ${
              activeTab === 'banking'
                ? 'bg-amber-400 text-black shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 stroke-[2.4]" />
            အကောင့်များ
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              setActiveTab('settings');
            }}
            className={`flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-[11px] font-black transition-all ${
              activeTab === 'settings'
                ? 'bg-amber-400 text-black shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5 stroke-[2.4]" />
            စည်းမျဉ်း/စာရင်း
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              setActiveTab('turso');
            }}
            className={`flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-[11px] font-black transition-all ${
              activeTab === 'turso'
                ? 'bg-amber-400 text-black shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Database className="w-3.5 h-3.5 stroke-[2.4]" />
            Turso ပြောင်းရန်
          </button>
        </div>

        {/* TAB 1: DEPOSITS */}
        {activeTab === 'deposits' && (
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2.5">
            {pendingDeposits.length === 0 ? (
              <div className="py-16 text-center text-xs text-white/60 font-bold flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400/40" />
                <span>စစ်ဆေးရန်ကျန်ရှိသော ငွေသွင်းတောင်းဆိုမှု မရှိပါ။</span>
              </div>
            ) : (
              pendingDeposits.map((dep) => (
                <div key={dep.depositId} className="p-3.5 rounded-2xl dark-glass-card flex flex-col gap-2.5 border border-white/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-black text-white text-sm">{dep.userName}</span>
                      <span className="text-[11px] text-white/60 font-mono block">ID: {dep.userId}</span>
                      {dep.phone && <span className="text-[11px] text-amber-400 font-mono block">ဖုန်း: {dep.phone}</span>}
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-base font-black text-emerald-400">
                        +{formatKs(dep.amount)}
                      </span>
                      {dep.isFirstDeposit && dep.amount >= 5000 && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 block mt-0.5">
                          +2,000 Ks First Bonus ပါဝင်မည်
                        </span>
                      )}
                      <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded bg-white/10 text-white border border-white/15 block mt-0.5">
                        {dep.method}
                      </span>
                    </div>
                  </div>

                  {dep.receiptImage && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedReceipt(dep.receiptImage || null)}
                        className="text-xs font-black text-white underline flex items-center gap-1 py-1 px-2.5 rounded-lg bg-black/40 border border-white/15 hover:bg-black/60"
                      >
                        <Search className="w-3.5 h-3.5 stroke-[2.4]" />
                        ပြေစာ Screenshot ကြည့်ရန်
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => onDeclineDeposit(dep.depositId)}
                      className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-black transition-all active:scale-95 border border-red-500/30"
                    >
                      ပယ်ချမည်
                    </button>
                    <button
                      type="button"
                      onClick={() => onApproveDeposit(dep.depositId, dep.userId, dep.amount)}
                      className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black transition-all active:scale-95 shadow-md flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      အတည်ပြုမည် (ငွေသွင်းပေးမည်)
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: WITHDRAWALS */}
        {activeTab === 'withdrawals' && (
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2.5">
            {pendingWithdrawals.length === 0 ? (
              <div className="py-16 text-center text-xs text-white/60 font-bold flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400/40" />
                <span>စစ်ဆေးရန်ကျန်ရှိသော ငွေထုတ်တောင်းဆိုမှု မရှိပါ။</span>
              </div>
            ) : (
              pendingWithdrawals.map((w) => (
                <div key={w.withdrawalId} className="p-3.5 rounded-2xl dark-glass-card flex flex-col gap-2.5 border border-white/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-black text-white text-sm">{w.accountName}</span>
                      <span className="text-[11px] text-white/60 font-mono block">UID: {w.userId}</span>
                      <span className="text-xs text-amber-400 font-mono font-bold block mt-0.5">
                        {w.method.toUpperCase()}: {w.phone}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-base font-black text-amber-400">
                        -{formatKs(w.amount)}
                      </span>
                      <span className="text-[10px] text-white/60 block mt-0.5">
                        {new Date(w.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => {
                        setRejectionTarget(w);
                        setRejectionNote('ငွေလွှဲအကောင့်နံပါတ် သို့မဟုတ် အမည် မှားယွင်းနေပါသည်');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-black transition-all active:scale-95 border border-red-500/30"
                    >
                      ပယ်ချမည် (ပြန်အမ်းမည်)
                    </button>
                    <button
                      type="button"
                      onClick={() => onApproveWithdrawal(w.withdrawalId, w.userId, w.amount)}
                      className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black transition-all active:scale-95 shadow-md flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      လွှဲပြီးပြီ (အတည်ပြုမည်)
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: USER MANAGEMENT & BALANCE ADJUSTMENT */}
        {activeTab === 'users' && (
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
            {/* 1. DIRECT BALANCE ADJUSTER (TOP SECTION) */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-zinc-950/80 to-black border border-amber-500/30 shadow-lg">
              <div className="flex items-center gap-2 mb-2.5">
                <Wallet className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs sm:text-sm font-black text-white">ID ဖြင့် Balance တိုး/နှုတ် (Direct Balance Topup / Deduct)</h4>
              </div>

              {/* ID Input with Lookup button */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2.5">
                <div className="sm:col-span-2 flex items-center gap-1.5 p-1.5 rounded-xl bg-black/60 border border-white/15">
                  <input
                    type="text"
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    placeholder="User UID သို့မဟုတ် ဖုန်းနံပါတ် ရိုက်ထည့်ပါ..."
                    className="bg-transparent flex-1 px-2.5 text-xs text-white focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => handleLookupUserForAdjust(targetUserId)}
                    disabled={adjustingBalance || !targetUserId.trim()}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs shrink-0 transition-all active:scale-95"
                  >
                    စစ်ဆေးမည်
                  </button>
                </div>

                {/* Credit / Deduct Mode Toggle */}
                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/60 border border-white/15">
                  <button
                    type="button"
                    onClick={() => setIsDeductMode(false)}
                    className={`py-1 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1 ${
                      !isDeductMode ? 'bg-emerald-500 text-black shadow' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    ငွေဖြည့် (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDeductMode(true)}
                    className={`py-1 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1 ${
                      isDeductMode ? 'bg-red-500 text-white shadow' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <MinusCircle className="w-3.5 h-3.5" />
                    ငွေနှုတ် (-)
                  </button>
                </div>
              </div>

              {/* Target User Info Badge if loaded */}
              {targetUserObj && (
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between mb-2.5">
                  <div>
                    <span className="text-xs font-black text-white">{targetUserObj.fullName}</span>
                    <span className="text-[11px] text-zinc-400 font-mono block">UID: {targetUserObj.uid}</span>
                    {targetUserObj.phoneNumber && (
                      <span className="text-[11px] text-amber-400 font-mono block">ဖုန်း: {targetUserObj.phoneNumber}</span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-zinc-400 font-bold block">လက်ရှိ လက်ကျန်ငွေ</span>
                    <span className="text-sm sm:text-base font-black text-amber-400 font-mono">
                      {formatKs(targetUserObj.balance || 0)}
                    </span>
                  </div>
                </div>
              )}

              {/* Amount and Reason */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2.5">
                <div>
                  <label className="text-[11px] font-bold text-zinc-400 block mb-1">
                    {isDeductMode ? 'နှုတ်ယူမည့် ပမာဏ (Ks)' : 'ဖြည့်သွင်းမည့် ပမာဏ (Ks)'}
                  </label>
                  <input
                    type="number"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    placeholder="ဥပမာ - 10000"
                    className="w-full p-2 rounded-xl bg-black/60 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                  />
                  {/* Preset Buttons */}
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    {[5000, 10000, 50000, 100000, 500000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setAdjustAmount(amt.toString())}
                        className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-zinc-300"
                      >
                        +{formatKs(amt)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-zinc-400 block mb-1">အကြောင်းပြချက် (Reason / Note)</label>
                  <input
                    type="text"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="ဥပမာ - KPay ငွေလွှဲလက်ခံရရှိ၍ ဖြည့်သွင်းပေးခြင်း"
                    className="w-full p-2 rounded-xl bg-black/60 border border-white/15 text-white text-xs focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="button"
                    onClick={handleExecuteBalanceAdjustment}
                    disabled={adjustingBalance || !adjustAmount}
                    className={`w-full mt-2 py-2 rounded-xl text-xs font-black transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5 ${
                      isDeductMode
                        ? 'bg-red-600 hover:bg-red-500 text-white'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-black'
                    }`}
                  >
                    {isDeductMode ? <MinusCircle className="w-3.5 h-3.5" /> : <PlusCircle className="w-3.5 h-3.5" />}
                    {isDeductMode ? 'ငွေနှုတ်ယူမှုကို အတည်ပြုမည်' : 'ငွေဖြည့်သွင်းမှုကို အတည်ပြုမည်'}
                  </button>
                </div>
              </div>

              {/* Feedback Message */}
              {balanceFeedback && (
                <div
                  className={`p-2 rounded-xl text-xs font-bold ${
                    balanceFeedback.type === 'success'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-red-500/20 text-red-300 border border-red-500/30'
                  }`}
                >
                  {balanceFeedback.msg}
                </div>
              )}
            </div>

            {/* 2. TOTAL USER EXPLORER (BOTTOM SECTION) */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" />
                  <span className="text-xs sm:text-sm font-black text-white">
                    Total Users စာရင်း ({filteredUsers.length})
                  </span>
                </div>

                {/* User Search Input */}
                <form onSubmit={handleSearchUsersSubmit} className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/60 border border-white/15">
                    <Search className="w-3.5 h-3.5 text-zinc-400" />
                    <input
                      type="text"
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      placeholder="UID သို့မဟုတ် ဖုန်းရှာရန်..."
                      className="bg-transparent text-xs text-white focus:outline-none w-36 sm:w-44 font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={searchingUsers}
                    className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${searchingUsers ? 'animate-spin' : ''}`} />
                  </button>
                </form>
              </div>

              {/* User Category Filter Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] font-bold">
                {[
                  { id: 'all', label: 'အားလုံး' },
                  { id: 'users', label: 'ကစားသမားများ' },
                  { id: 'admins', label: 'Admin များ' },
                  { id: 'deposited', label: 'ငွေသွင်းဖူးသူများ' },
                  { id: 'flagged', label: 'သံသယဖြစ်ဖွယ် (Flagged)' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setUserFilter(tab.id as typeof userFilter)}
                    className={`px-2.5 py-1 rounded-lg border whitespace-nowrap transition-all ${
                      userFilter === tab.id
                        ? 'bg-amber-400 text-black border-amber-400 font-black'
                        : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Users List Cards */}
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                {filteredUsers.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-400 font-bold">
                    {searchingUsers ? 'မန်ဘာများ ရှာဖွေနေပါသည်...' : 'ရှာဖွေမှုနှင့် ကိုက်ညီသော မန်ဘာမရှိပါ။'}
                  </div>
                ) : (
                  filteredUsers.map((u) => (
                    <div
                      key={u.uid}
                      className="p-3 rounded-2xl bg-zinc-950/70 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:border-amber-400/30 transition-all"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-white">{u.fullName || 'မန်ဘာ'}</span>
                          {u.role === 'admin' && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[9px] font-black uppercase">
                              Admin
                            </span>
                          )}
                          {u.isHedgingFlagged && (
                            <span className="px-1.5 py-0.2 rounded bg-red-500/20 text-red-300 border border-red-500/30 text-[9px] font-black uppercase">
                              Flagged
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-400 font-mono block">UID: {u.uid}</span>
                        {u.phoneNumber && (
                          <span className="text-[11px] text-amber-400 font-mono font-bold block">
                            ဖုန်း: {u.phoneNumber}
                          </span>
                        )}
                        <div className="flex items-center gap-3 text-[10px] text-zinc-400 mt-1">
                          <span>ဖိတ်ခေါ်: {u.referralsCount || 0} ယောက်</span>
                          <span>လောင်းကြေးစုစုပေါင်း: {formatKs(u.totalBetCumulative || 0)}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                        <div className="text-right mr-1">
                          <span className="text-[10px] text-zinc-400 font-bold block">Balance</span>
                          <span className="text-sm font-black text-amber-400 font-mono">
                            {formatKs(u.balance || 0)}
                          </span>
                        </div>

                        {/* Quick Action Buttons */}
                        <button
                          type="button"
                          onClick={() => {
                            setTargetUserId(u.uid);
                            setTargetUserObj(u);
                            setBalanceFeedback(null);
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-[11px] transition-all active:scale-95"
                        >
                          Balance ပြင်မည်
                        </button>

                        {onToggleUserFlag && (
                          <button
                            type="button"
                            onClick={() => onToggleUserFlag(u.uid, !u.isHedgingFlagged)}
                            title={u.isHedgingFlagged ? 'Unflag / Ban ဖြေလျှော့မည်' : 'သံသယအဖြစ် Flag မှတ်သားမည်'}
                            className={`p-1.5 rounded-xl border text-[11px] font-bold ${
                              u.isHedgingFlagged
                                ? 'bg-red-500/20 text-red-300 border-red-500/30'
                                : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
                            }`}
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: LIVE DICE & AUTO-WIN CONTROL */}
        {activeTab === 'dice' && (
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
            {/* Live Round Overview */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-zinc-950/80 border border-white/10 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
                  <span className="text-xs sm:text-sm font-black text-white">
                    လက်ရှိ လှည့်လည်နေသော အလှည့် (Live Round #{currentRound?.roundId || 101})
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase">
                  {currentRound?.status === 'betting' ? 'လောင်းကြေးဖွင့်လှစ်ထား' : 'အံစာလည်နေသည်'}
                </span>
              </div>

              {/* Status Indicators */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-[10px] text-zinc-400 block">Round ID</span>
                  <span className="text-sm font-mono font-black text-white">#{currentRound?.roundId || 101}</span>
                </div>
                <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-[10px] text-zinc-400 block">ကျန်ရှိချိန်</span>
                  <span className="text-sm font-mono font-black text-amber-400">{currentRound?.durationSeconds || 60}s</span>
                </div>
                <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-[10px] text-zinc-400 block">အိမ်တော်ကာကွယ်မှု</span>
                  <span className="text-xs font-black text-emerald-400">Auto-Win On</span>
                </div>
                <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-[10px] text-zinc-400 block">Round Duration</span>
                  <span className="text-sm font-mono font-black text-white">{settings.ROUND_DURATION_SECONDS || 60}s</span>
                </div>
              </div>

              {/* Force Advance Round Immediately Button */}
              <div className="pt-2 flex items-center justify-between border-t border-white/10">
                <span className="text-[11px] text-zinc-400">အချိန်မစောင့်ဘဲ အလှည့်ကို ချက်ချင်း အဆုံးသတ် လှည့်စေလိုပါက:</span>
                <button
                  type="button"
                  onClick={() => {
                    sounds.playChip();
                    onTriggerRoll();
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs transition-all active:scale-95 shadow flex items-center gap-1.5"
                >
                  <Dices className="w-3.5 h-3.5 stroke-[2.5]" />
                  အခုချက်ချင်း လှည့်မည် (Force Roll)
                </button>
              </div>
            </div>

            {/* Manual Next Roll Override (Admin Power) */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-purple-500/10 via-zinc-950/80 to-black border border-purple-500/30">
              <div className="flex items-center gap-2 mb-2">
                <Dices className="w-4 h-4 text-purple-400" />
                <h4 className="text-xs sm:text-sm font-black text-white">နောက်အလှည့် အံစာရလဒ် ကြိုတင်သတ်မှတ်ခြင်း (Manual Override)</h4>
              </div>
              <p className="text-[11px] text-zinc-400 mb-3">
                Admin အနေဖြင့် လာမည့်အလှည့်အတွက် ထွက်ပေါ်စေလိုသော အံစာမျက်နှာများကို တိုက်ရိုက်ရွေးချယ် သတ်မှတ်နိုင်ပါသည်။
              </p>

              <div className="grid grid-cols-2 gap-3 mb-3">
                {/* Dice 1 Selector */}
                <div>
                  <label className="text-[11px] font-bold text-zinc-300 block mb-1">အံစာ ၁ (Dice 1):</label>
                  <div className="grid grid-cols-6 gap-1">
                    {[1, 2, 3, 4, 5, 6].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setForcedDice1(num)}
                        className={`py-2 rounded-xl border text-xs font-black transition-all ${
                          forcedDice1 === num
                            ? 'bg-amber-400 text-black border-amber-400 shadow-md scale-105'
                            : 'bg-white/5 text-white border-white/15 hover:bg-white/10'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dice 2 Selector */}
                <div>
                  <label className="text-[11px] font-bold text-zinc-300 block mb-1">အံစာ ၂ (Dice 2):</label>
                  <div className="grid grid-cols-6 gap-1">
                    {[1, 2, 3, 4, 5, 6].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setForcedDice2(num)}
                        className={`py-2 rounded-xl border text-xs font-black transition-all ${
                          forcedDice2 === num
                            ? 'bg-amber-400 text-black border-amber-400 shadow-md scale-105'
                            : 'bg-white/5 text-white border-white/15 hover:bg-white/10'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Preview of Forced Outcome */}
              <div className="p-3 rounded-xl bg-black/60 border border-white/10 flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-400 text-black font-black font-mono text-xl flex items-center justify-center">
                    {forcedTotal}
                  </div>
                  <div>
                    <span className="text-xs font-black text-white block">
                      ပေါင်းလဒ်: {forcedTotal} ({forcedClass === 'small' ? 'အသေး' : forcedClass === 'big' ? 'အကြီး' : 'ဘုံအများဆုံး ၇'})
                    </span>
                    <span className="text-[11px] text-zinc-400 block">
                      အရောင်: {forcedColor === 'red' ? 'အနီ' : forcedColor === 'green' ? 'အစိမ်း' : 'ခရမ်း'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveForcedDice}
                  disabled={savingDiceOverride}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs transition-all active:scale-95 shadow-md flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  ရလဒ် အတည်ပြု သတ်မှတ်မည်
                </button>
              </div>

              {overrideFeedback && (
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-200 border border-purple-500/30 text-xs font-bold">
                  {overrideFeedback}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: BANKING & PAYMENT SETTINGS */}
        {activeTab === 'banking' && (
          <form onSubmit={handleSaveSettings} className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
            <div className="p-3.5 sm:p-4 rounded-2xl bg-zinc-950/80 border border-white/10 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs sm:text-sm font-black text-white">ငွေလက်ခံ အကောင့်များ စီမံခြင်း (Payment Accounts)</h4>
              </div>

              {/* KPay Section */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-cyan-400 font-black text-xs">
                  <span>KBZPay (KPay) အချက်အလက်</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 block mb-1">KPay ဖုန်းနံပါတ်:</label>
                    <input
                      type="text"
                      value={formSettings.KPAY_PHONE}
                      onChange={(e) => setFormSettings({ ...formSettings, KPAY_PHONE: e.target.value })}
                      className="w-full p-2 rounded-xl bg-black/60 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 block mb-1">KPay အကောင့်အမည်:</label>
                    <input
                      type="text"
                      value={formSettings.KPAY_NAME}
                      onChange={(e) => setFormSettings({ ...formSettings, KPAY_NAME: e.target.value })}
                      className="w-full p-2 rounded-xl bg-black/60 border border-white/15 text-white text-xs focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>
              </div>

              {/* WavePay Section */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-amber-400 font-black text-xs">
                  <span>WavePay အချက်အလက်</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 block mb-1">WavePay ဖုန်းနံပါတ်:</label>
                    <input
                      type="text"
                      value={formSettings.WAVE_PHONE}
                      onChange={(e) => setFormSettings({ ...formSettings, WAVE_PHONE: e.target.value })}
                      className="w-full p-2 rounded-xl bg-black/60 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 block mb-1">WavePay အကောင့်အမည်:</label>
                    <input
                      type="text"
                      value={formSettings.WAVE_NAME}
                      onChange={(e) => setFormSettings({ ...formSettings, WAVE_NAME: e.target.value })}
                      className="w-full p-2 rounded-xl bg-black/60 border border-white/15 text-white text-xs focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs transition-all active:scale-95 shadow-md flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'သိမ်းဆည်းနေပါသည်...' : 'ငွေလက်ခံအကောင့်များ သိမ်းဆည်းမည်'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* TAB 6: SETTINGS & ANALYTICS */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSaveSettings} className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
            {/* Financial Overview Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-3 rounded-2xl bg-zinc-950/70 border border-white/10">
                <span className="text-[10px] text-zinc-400 font-bold block">စုစုပေါင်း လောင်းကြေး</span>
                <span className="text-sm sm:text-base font-black text-white font-mono">
                  {formatKs(totalWager)}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-zinc-950/70 border border-white/10">
                <span className="text-[10px] text-zinc-400 font-bold block">ပေးလျော်ငွေ စုစုပေါင်း</span>
                <span className="text-sm sm:text-base font-black text-red-400 font-mono">
                  {formatKs(totalPayout)}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-zinc-950/70 border border-white/10">
                <span className="text-[10px] text-zinc-400 font-bold block">အိမ်တော်အမြတ် (Gross Margin)</span>
                <span className={`text-sm sm:text-base font-black font-mono ${grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatKs(grossProfit)}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-zinc-950/70 border border-white/10">
                <span className="text-[10px] text-zinc-400 font-bold block">နိုင် / ရှုံး အချိုး</span>
                <span className="text-sm sm:text-base font-black text-amber-400 font-mono">
                  {totalWins}W / {totalLoss}L
                </span>
              </div>
            </div>

            {/* Game Limits and Commission */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-zinc-950/80 border border-white/10 flex flex-col gap-3">
              <h4 className="text-xs sm:text-sm font-black text-white">စည်းမျဉ်း & ကန့်သတ်ချက်များ (Game Rules & Limits)</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-zinc-400 block mb-1">အနည်းဆုံး ငွေသွင်းပမာဏ (Ks):</label>
                  <input
                    type="number"
                    value={formSettings.MINIMUM_DEPOSIT}
                    onChange={(e) => setFormSettings({ ...formSettings, MINIMUM_DEPOSIT: Number(e.target.value) })}
                    className="w-full p-2 rounded-xl bg-black/60 border border-white/15 text-white font-mono text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-zinc-400 block mb-1">အနည်းဆုံး ငွေထုတ်ပမာဏ (Ks):</label>
                  <input
                    type="number"
                    value={formSettings.MINIMUM_WITHDRAW}
                    onChange={(e) => setFormSettings({ ...formSettings, MINIMUM_WITHDRAW: Number(e.target.value) })}
                    className="w-full p-2 rounded-xl bg-black/60 border border-white/15 text-white font-mono text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-zinc-400 block mb-1">Referral ကော်မရှင်နှုန်း (%):</label>
                  <input
                    type="number"
                    step="0.005"
                    value={formSettings.COMMISSION_RATE}
                    onChange={(e) => setFormSettings({ ...formSettings, COMMISSION_RATE: Number(e.target.value) })}
                    className="w-full p-2 rounded-xl bg-black/60 border border-white/15 text-white font-mono text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-zinc-400 block mb-1">First Deposit Bonus (Ks):</label>
                  <input
                    type="number"
                    value={formSettings.WELCOME_BONUS || 2000}
                    onChange={(e) => setFormSettings({ ...formSettings, WELCOME_BONUS: Number(e.target.value) })}
                    className="w-full p-2 rounded-xl bg-black/60 border border-white/15 text-white font-mono text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-zinc-400 block mb-1">အလှည့်ကြာချိန် စက္ကန့် (Round Duration):</label>
                  <input
                    type="number"
                    value={formSettings.ROUND_DURATION_SECONDS || 60}
                    onChange={(e) => setFormSettings({ ...formSettings, ROUND_DURATION_SECONDS: Number(e.target.value) })}
                    className="w-full p-2 rounded-xl bg-black/60 border border-white/15 text-white font-mono text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs transition-all active:scale-95 shadow-md flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'သိမ်းဆည်းနေပါသည်...' : 'စည်းမျဉ်းများ သိမ်းဆည်းမည်'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* TAB 7: TURSO & DATA MIGRATION */}
        {activeTab === 'turso' && (
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4">
            {/* Header info */}
            <div className="p-4 rounded-2xl dark-glass-card border border-amber-400/30 bg-amber-500/5 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-amber-400 font-black text-sm">
                <Database className="w-5 h-5 text-amber-400" />
                <span>Turso (LibSQL) Cloud Database & Data Migration</span>
              </div>
              <p className="text-xs text-white/70 leading-relaxed">
                Turso သို့ ပြောင်းလဲအသုံးပြုခြင်းဖြင့် Firebase ၏ နေ့စဉ် 50,000 Read ကန့်သတ်ချက် (Quota Limit) ကို လွတ်မြောက်စေပြီး လစဉ် Reads & Writes သန်းပေါင်းများစွာကို အခမဲ့ စိတ်ချလက်ချ အသုံးပြုနိုင်မည် ဖြစ်ပါသည်။
              </p>
            </div>

            {/* Connection Inputs */}
            <div className="p-4 rounded-2xl dark-glass-card border border-white/10 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-white flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-amber-400" />
                  Turso Connection Settings
                </span>
                {tursoStatus && (
                  <span
                    className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                      tursoStatus.success
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-red-500/20 text-red-400 border border-red-500/40'
                    }`}
                  >
                    {tursoStatus.success ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    {tursoStatus.msg}
                  </span>
                )}
              </div>

              {/* URL Input */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-white/80">Database URL:</label>
                <input
                  type="text"
                  value={tursoDbUrl}
                  onChange={(e) => setTursoDbUrl(e.target.value)}
                  placeholder="libsql://casino-xavianelio.aws-ap-southeast-1.turso.io"
                  className="p-2.5 rounded-xl bg-black/60 border border-white/15 text-white font-mono text-xs focus:border-amber-400 outline-none"
                />
              </div>

              {/* Token Input */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-white/80">Database Auth Token (JWT):</label>
                <textarea
                  value={tursoAuthToken}
                  onChange={(e) => {
                    setTursoAuthToken(e.target.value);
                    setTursoStatus(null);
                  }}
                  rows={3}
                  placeholder="Turso Database Token အသစ်ကို ဤနေရာတွင် ထည့်ပါ..."
                  className="p-2.5 rounded-xl bg-black/60 border border-white/15 text-white font-mono text-xs focus:border-amber-400 outline-none resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={tursoChecking || isMigrating}
                  onClick={async () => {
                    setTursoChecking(true);
                    setTursoStatus(null);
                    try {
                      const res = await fetch('/api/turso/test', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          url: tursoDbUrl.trim(),
                          token: tursoAuthToken.trim(),
                          initSchema: true,
                        }),
                      });
                      const data = await res.json();
                      if (data.success) {
                        setTursoStatus({
                          success: true,
                          msg: 'Connected အောင်မြင်ပါသည်!',
                        });
                        sounds.playWin();
                      } else {
                        setTursoStatus({
                          success: false,
                          msg: '401 Unauthorized',
                          detail: data.error,
                        });
                      }
                    } catch (e: any) {
                      setTursoStatus({
                        success: false,
                        msg: 'ချိတ်ဆက်မှု မအောင်မြင်ပါ',
                        detail: e.message || String(e),
                      });
                    } finally {
                      setTursoChecking(false);
                    }
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 border border-white/10"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${tursoChecking ? 'animate-spin' : ''}`} />
                  {tursoChecking ? 'စစ်ဆေးနေပါသည်...' : 'Connection စစ်ဆေးမည် (Test)'}
                </button>
              </div>

              {/* Error instruction card if failed */}
              {tursoStatus && !tursoStatus.success && (
                <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-200 flex flex-col gap-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-red-400">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>Token မမှန်ကန်သေးပါ (Invalid Token):</span>
                  </div>
                  <p className="text-[11px] text-white/80 leading-relaxed">
                    Turso Dashboard ထဲရှိ Database (<code className="bg-black/50 px-1 py-0.5 rounded text-amber-300">casino</code>) သို့ သွားပြီး <strong>Tokens -&gt; Create Token</strong> ကို နှိပ်၍ ထွက်လာသော <strong>Database Token</strong> အသစ်ကို ကူးယူထည့်သွင်းပေးပါ။
                  </p>
                </div>
              )}
            </div>

            {/* Data Migration Box */}
            <div className="p-4 rounded-2xl dark-glass-card border border-white/10 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-white flex items-center gap-1.5">
                  <ArrowUpRight className="w-4 h-4 text-amber-400" />
                  Firebase မှ Turso သို့ Data များ ကူးပြောင်းခြင်း (One-Click Migration)
                </span>
              </div>

              <p className="text-xs text-white/70 leading-relaxed">
                အရင် Firebase Database ပေါ်တွင် ရှိနေသော <strong>User စာရင်းများ၊ ငွေလက်ကျန် (Balance)၊ Referral စာရင်းများ၊ ငွေသွင်း/ငွေထုတ်မှတ်တမ်းများ နှင့် အလောင်းအစားမှတ်တမ်းများ</strong> အားလုံးကို Turso Database ထဲသို့ တိုက်ရိုက် ထည့်သွင်းပေးမည် ဖြစ်ပါသည်။
              </p>

              <button
                type="button"
                disabled={isMigrating || tursoChecking}
                onClick={async () => {
                  if (!confirm('Firebase မှ data များကို Turso သို့ ပြောင်းရွှေ့ရန် သေချာပါသလား?')) return;
                  setIsMigrating(true);
                  setMigrationResult(null);
                  try {
                    const res = await fetch('/api/migrate-to-turso', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        url: tursoDbUrl.trim(),
                        token: tursoAuthToken.trim(),
                      }),
                    });
                    const data = await res.json();
                    setMigrationResult(data);
                    if (data.success) {
                      sounds.playWin();
                    }
                  } catch (e: any) {
                    setMigrationResult({
                      success: false,
                      error: e.message || String(e),
                    });
                  } finally {
                    setIsMigrating(false);
                  }
                }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-black text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg"
              >
                <Database className={`w-4 h-4 ${isMigrating ? 'animate-spin' : ''}`} />
                {isMigrating ? 'Data များ ပြောင်းရွှေ့နေပါသည်... ခေတ္တစောင့်ပါ' : 'Firebase မှ Data များကို Turso သို့ ပြောင်းရွှေ့မည် (Migrate Now)'}
              </button>

              {/* Migration Result display */}
              {migrationResult && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex flex-col gap-2 ${
                    migrationResult.success
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                      : 'bg-red-950/40 border-red-500/40 text-red-200'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5">
                    {migrationResult.success ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-300">အောင်မြင်စွာ ပြောင်းရွှေ့ပြီးစီးပါပြီ!</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                        <span className="text-red-300">မအောင်မြင်သေးပါ:</span>
                      </>
                    )}
                  </div>

                  {migrationResult.success && migrationResult.migrated && (
                    <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                      <div className="p-2 rounded-lg bg-black/40 border border-white/10 flex justify-between">
                        <span>မန်ဘာ (Users):</span>
                        <strong className="text-amber-400">{migrationResult.migrated.users} ယောက်</strong>
                      </div>
                      <div className="p-2 rounded-lg bg-black/40 border border-white/10 flex justify-between">
                        <span>ငွေသွင်း (Deposits):</span>
                        <strong className="text-amber-400">{migrationResult.migrated.deposits} ခု</strong>
                      </div>
                      <div className="p-2 rounded-lg bg-black/40 border border-white/10 flex justify-between">
                        <span>ငွေထုတ် (Withdrawals):</span>
                        <strong className="text-amber-400">{migrationResult.migrated.withdrawals} ခု</strong>
                      </div>
                      <div className="p-2 rounded-lg bg-black/40 border border-white/10 flex justify-between">
                        <span>အလောင်းအစား (Bets):</span>
                        <strong className="text-amber-400">{migrationResult.migrated.bets} ခု</strong>
                      </div>
                    </div>
                  )}

                  {!migrationResult.success && (
                    <div className="text-[11px] text-white/80 leading-relaxed flex flex-col gap-1">
                      <p>{migrationResult.error}</p>
                      {migrationResult.suggestion && <p className="text-amber-300 font-bold">{migrationResult.suggestion}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rejection Modal for Withdrawals */}
        {rejectionTarget && (
          <div className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4">
            <div className="relative max-w-md w-full dark-glass-card rounded-2xl p-4 border border-red-500/30 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-red-400 font-black text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>ငွေထုတ်တောင်းဆိုမှုကို ပယ်ချခြင်း (Reject Withdrawal)</span>
              </div>

              <p className="text-xs text-white/80">
                မန်ဘာ <strong>{rejectionTarget.accountName}</strong> ၏ ငွေထုတ်တောင်းဆိုငွေ{' '}
                <strong>{formatKs(rejectionTarget.amount)}</strong> ကို ပယ်ချပြီး အကောင့်ထဲသို့ ငွေပြန်အမ်းပါမည်။
              </p>

              {/* Preset Reasons */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-white">လျင်မြန်စွာ ရွေးချယ်နိုင်သော အကြောင်းအရင်းများ:</label>
                <div className="grid grid-cols-1 gap-1">
                  {[
                    'ငွေလွှဲအကောင့်နံပါတ် သို့မဟုတ် အမည် မှားယွင်းနေပါသည်',
                    'လောင်းကြေးမပြည့်မီ ငွေထုတ်ခွင့်မပြုပါ (Turnover မပြည့်သေးပါ)',
                    'စနစ်စစ်ဆေးချက်အရ သံသယဖြစ်ဖွယ် အကောင့်အဖြစ် သတ်မှတ်ထားပါသည်',
                    'ဘဏ်လိုင်းခေတ္တကျနေပါသဖြင့် နောက်မှ ပြန်လည်ထုတ်ယူပေးပါ',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRejectionNote(preset)}
                      className={`text-[10px] py-1 px-2 rounded-lg border text-left transition-all ${
                        rejectionNote === preset
                          ? 'bg-white text-black font-bold border-white'
                          : 'bg-white/5 text-white/80 border-white/10 hover:border-white/30'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Note Input */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-white">အသေးစိတ် အကြောင်းအရင်း စာသား:</label>
                <textarea
                  value={rejectionNote}
                  onChange={(e) => setRejectionNote(e.target.value)}
                  rows={3}
                  placeholder="ပယ်ချရသည့် အကြောင်းအရင်းကို ရေးပါ..."
                  className="p-2 rounded-xl bg-black/60 border border-white/20 text-white text-xs resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setRejectionTarget(null)}
                  className="flex-1 py-2 rounded-xl bg-white/10 text-white font-bold text-xs hover:bg-white/15"
                >
                  မလုပ်တော့ပါ
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await onDeclineWithdrawal(
                      rejectionTarget.withdrawalId,
                      rejectionTarget.userId,
                      rejectionTarget.amount,
                      rejectionNote.trim() || 'အကြောင်းပြချက် မဖော်ပြထားပါ'
                    );
                    if (ok) {
                      setRejectionTarget(null);
                      alert('ငွေထုတ်တောင်းဆိုမှုကို ပယ်ချပြီး User ထံ အကြောင်းပြချက် ပေးပို့ပြီးပါပြီ။');
                    }
                  }}
                  className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs active:scale-95 transition-all shadow-md"
                >
                  ပယ်ချမည် (Confirm)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Receipt Image Lightbox Modal */}
        {selectedReceipt && (
          <div className="fixed inset-0 z-60 bg-black/95 flex items-center justify-center p-4">
            <div className="relative max-w-lg w-full flex flex-col items-center">
              <button
                onClick={() => setSelectedReceipt(null)}
                className="absolute -top-10 right-0 p-2 text-white bg-white/20 rounded-full"
              >
                <X className="w-5 h-5 stroke-white stroke-[2.4]" />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedReceipt}
                alt="Receipt Full View"
                className="max-h-[80vh] w-auto rounded-2xl border border-white/20 object-contain"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Check,
  AlertCircle,
  CreditCard,
  RefreshCw,
  Coins,
  History,
  Clock,
  CheckCircle2,
  XCircle,
  Hash,
} from 'lucide-react';
import { GameSettings, UserProfile, DepositRequest, WithdrawalRequest } from '@/lib/types';
import { formatKs } from '@/lib/constants';
import { sounds } from '@/lib/audio';
import { getTransactionStatus } from '@/lib/transactionStatus';

interface WalletViewProps {
  user: UserProfile;
  settings: GameSettings;
  userWithdrawals?: WithdrawalRequest[];
  userDeposits?: DepositRequest[];
  initialTab?: 'deposit' | 'withdraw' | 'history' | 'transfer';
  onSubmitDeposit: (amount: number, method: 'kpay' | 'wave', trxLast5: string) => Promise<boolean>;
  onSubmitWithdrawal: (amount: number, method: 'kpay' | 'wave', phone: string, accountName: string) => Promise<boolean>;
  onTransferReferral: () => Promise<boolean>;
  onBindBank?: (method: 'kpay' | 'wave', phone: string, accountName: string) => Promise<boolean>;
  onRefreshUser?: () => void;
  onRequireAuth?: () => void;
}

export function WalletView({
  user,
  settings,
  userWithdrawals = [],
  userDeposits = [],
  initialTab = 'deposit',
  onSubmitDeposit,
  onSubmitWithdrawal,
  onTransferReferral,
  onBindBank,
  onRefreshUser,
  onRequireAuth,
}: WalletViewProps) {
  const [tab, setTab] = useState<'deposit' | 'withdraw' | 'history' | 'transfer'>(initialTab);
  const [historySubTab, setHistorySubTab] = useState<'deposits' | 'withdrawals'>('deposits');
  const [method, setMethod] = useState<'kpay' | 'wave'>(user.boundBank?.method || 'kpay');
  const [depositAmount, setDepositAmount] = useState<number>(settings.MINIMUM_DEPOSIT || 3000);
  const [withdrawAmount, setWithdrawAmount] = useState<number>(settings.MINIMUM_WITHDRAW || 3000);
  const [phone, setPhone] = useState<string>(user.boundBank?.phone || '');
  const [accountName, setAccountName] = useState<string>(user.boundBank?.accountName || '');
  const [trxLast5, setTrxLast5] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [bindingBank, setBindingBank] = useState<boolean>(false);
  const [isEditingBank, setIsEditingBank] = useState<boolean>(!user.boundBank);
  const [transferring, setTransferring] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Daily Withdrawal Limit Computation (တစ်ရက် အများဆုံးငွေထုတ် ကန့်သတ်ချက်)
  const [currentTimestamp] = useState<number>(() => Date.now());
  const maxDailyLimit = settings.MAX_DAILY_WITHDRAWAL || 300000;
  const oneDayAgo = currentTimestamp - 24 * 60 * 60 * 1000;
  const todayWithdrawn = userWithdrawals
    .filter((w) => w.createdAt >= oneDayAgo && (w.status === 'approved' || w.status === 'pending'))
    .reduce((sum, w) => sum + (w.amount || 0), 0);
  const remainingDailyWithdrawal = Math.max(0, maxDailyLimit - todayWithdrawn);

  // Latest Declined Withdrawal for immediate alert
  const latestDeclined = userWithdrawals.find((w) => w.status === 'declined');

  const currentPayPhone = method === 'kpay' ? settings.KPAY_PHONE : settings.WAVE_PHONE;
  const currentPayName = method === 'kpay' ? settings.KPAY_NAME : settings.WAVE_NAME;

  // Deposit Rules
  const isFirstDeposit = !user.hasSuccessfulDeposit;
  const minDepositRequired = isFirstDeposit
    ? (settings.MINIMUM_FIRST_DEPOSIT || 3000)
    : (settings.MINIMUM_DEPOSIT || 3000);

  // Withdrawal Eligibility Rules
  const requiredDepositForFirstWithdraw = settings.FIRST_WITHDRAW_DEPOSIT_REQUIRED || 5000;
  const requiredWagerForWithdrawal = Math.ceil(withdrawAmount * (settings.WITHDRAW_WAGER_PERCENT || 0.5));
  const firstWithdrawEligible = (user.totalSuccessfulDeposit || 0) >= requiredDepositForFirstWithdraw;
  const subsequentWithdrawEligible = (user.wagerSinceLastWithdrawal || 0) >= requiredWagerForWithdrawal;

  // Anti-Hedging check
  const isHedgingBlocked = !!user.isHedgingFlagged || (user.cleanTurnoverRequired || 0) > 0;

  const handleCopyPhone = () => {
    sounds.playChip();
    navigator.clipboard.writeText(currentPayPhone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || user.uid === 'guest') {
      if (onRequireAuth) onRequireAuth();
      else alert('ငွေသွင်းရန် အကောင့်ဝင်ပေးပါရန်။');
      return;
    }

    if (depositAmount < minDepositRequired) {
      alert(`အနည်းဆုံး ငွေသွင်းပမာဏမှာ ${formatKs(minDepositRequired)} ဖြစ်ပါသည်။`);
      return;
    }

    const cleanTrx = trxLast5.trim();
    if (!cleanTrx || cleanTrx.length < 5) {
      alert('ငွေလွှဲပြေစာမှ နောက်ဆုံးဂဏန်း ၅ လုံးကို အပြည့်အစုံ ရိုက်ထည့်ပေးပါရန်။');
      return;
    }

    setLoading(true);
    try {
      const ok = await onSubmitDeposit(depositAmount, method, cleanTrx);
      if (ok) {
        sounds.playWin();
        setTrxLast5('');
        setSuccessToast('ငွေသွင်းတောင်းဆိုမှု ပို့ပြီးပါပြီ။');
        setTab('history');
        setHistorySubTab('deposits');
        setTimeout(() => setSuccessToast(null), 6000);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || user.uid === 'guest') {
      if (onRequireAuth) onRequireAuth();
      else alert('ငွေထုတ်ရန် အကောင့်ဝင်ပေးပါရန်။');
      return;
    }

    if (isHedgingBlocked) {
      alert('ဘေးမညီလောင်းကြေးကြောင့် ငွေထုတ်လို့ မရသေးပါ။');
      return;
    }

    if (!isFirstDeposit && !firstWithdrawEligible) {
      alert(`ပထမအကြိမ် ငွေထုတ်ရန် ${formatKs(requiredDepositForFirstWithdraw)} သွင်းထားရန် လိုအပ်ပါသည်။`);
      return;
    }

    if (!subsequentWithdrawEligible) {
      alert(`လိုအပ်သော လောင်းကြေး ${formatKs(requiredWagerForWithdrawal)} မပြည့်သေးပါ။`);
      return;
    }

    if (withdrawAmount < (settings.MINIMUM_WITHDRAW || 3000)) {
      alert(`အနည်းဆုံး ငွေထုတ်ပမာဏမှာ ${formatKs(settings.MINIMUM_WITHDRAW || 3000)} ဖြစ်ပါသည်။`);
      return;
    }

    if (withdrawAmount > user.balance) {
      alert('လက်ကျန်ငွေ မလုံလောက်ပါ။');
      return;
    }

    if (withdrawAmount > remainingDailyWithdrawal) {
      alert(`ယနေ့အတွက် ငွေထုတ်ယူနိုင်သော ကန့်သတ်ပမာဏမှာ ${formatKs(remainingDailyWithdrawal)} သာ ကျန်ရှိပါတော့သည်။`);
      return;
    }

    const targetPhone = user.boundBank?.phone || phone;
    const targetName = user.boundBank?.accountName || accountName;

    if (!targetPhone || !targetName) {
      alert('ငွေလက်ခံမည့် ဖုန်းနံပါတ်နှင့် အကောင့်အမည် ထည့်သွင်းပေးပါရန်။');
      return;
    }

    setLoading(true);
    try {
      const ok = await onSubmitWithdrawal(withdrawAmount, method, targetPhone, targetName);
      if (ok) {
        sounds.playWin();
        setSuccessToast('ငွေထုတ်တောင်းဆိုမှု ပို့ပြီးပါပြီ။');
        setTab('history');
        setHistorySubTab('withdrawals');
        setTimeout(() => setSuccessToast(null), 6000);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !accountName) {
      alert('ဖုန်းနံပါတ်နှင့် အကောင့်နာမည် အပြည့်အစုံ ဖြည့်စွက်ပါရန်။');
      return;
    }
    if (!onBindBank) return;

    setBindingBank(true);
    try {
      const ok = await onBindBank(method, phone, accountName);
      if (ok) {
        sounds.playWin();
        setIsEditingBank(false);
        setSuccessToast('အကောင့် ချိတ်ဆက်ပြီးပါပြီ။');
        setTimeout(() => setSuccessToast(null), 4000);
      }
    } finally {
      setBindingBank(false);
    }
  };

  const handleTransferCommission = async () => {
    if (user.referralBalance < settings.MINIMUM_TRANSFER_AMOUNT) {
      alert(`မိတ်ဆက်ခ ပြောင်းရန် အနည်းဆုံး ${formatKs(settings.MINIMUM_TRANSFER_AMOUNT)} ပြည့်ရပါမည်။`);
      return;
    }
    setTransferring(true);
    try {
      const ok = await onTransferReferral();
      if (ok) {
        sounds.playWin();
        setSuccessToast('မိတ်ဆက်ခကို လက်ကျန်ငွေထဲသို့ ပြောင်းပြီးပါပြီ။');
        setTimeout(() => setSuccessToast(null), 5000);
      }
    } finally {
      setTransferring(false);
    }
  };

  const quickDepositPresets = [3000, 5000, 10000, 20000, 50000, 100000];
  const quickWithdrawPresets = [3000, 5000, 10000, 30000, 50000, 100000];

  return (
    <div className="premium-wallet-view w-full flex flex-col gap-4 pb-12 animate-fadeIn">
      {/* 1. TOP VIP BALANCE & WALLET HERO */}
      <div className="premium-wallet-hero relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-zinc-950/90">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30 pointer-events-none"
          style={{ backgroundImage: `url('/assets/casino/obsidian_bg.jpg')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent pointer-events-none" />

        <div className="relative z-10 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black shadow-lg shadow-amber-500/20 shrink-0">
              <Wallet className="w-6 h-6 stroke-black stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-zinc-400 tracking-wide uppercase">
                  လက်ကျန်ငွေ
                </span>
                {onRefreshUser && (
                  <button
                    onClick={() => {
                      sounds.playChip();
                      onRefreshUser();
                    }}
                    className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all active:scale-95"
                    title="လက်ကျန်ငွေ ပြန်လည်စစ်ဆေးမည်"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl sm:text-3xl font-black text-white font-mono tabular-nums tracking-tight">
                  {formatKs(user.balance || 0)}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* 2. FOUR SEGMENTED NAVIGATION TABS */}
        <div className="relative z-10 px-4 pb-4 pt-1 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar border-t border-white/5">
          <button
            onClick={() => {
              sounds.playChip();
              setTab('deposit');
            }}
            className={`flex-1 min-w-[90px] py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
              tab === 'deposit'
                ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/20 font-black'
                : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/5'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>ငွေသွင်း</span>
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              setTab('withdraw');
            }}
            className={`flex-1 min-w-[90px] py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
              tab === 'withdraw'
                ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/20 font-black'
                : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/5'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>ငွေထုတ်</span>
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              setTab('history');
            }}
            className={`flex-1 min-w-[90px] py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
              tab === 'history'
                ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/20 font-black'
                : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/5'
            }`}
          >
            <History className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>မှတ်တမ်း</span>
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              setTab('transfer');
            }}
            className={`flex-1 min-w-[110px] py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
              tab === 'transfer'
                ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/20 font-black'
                : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/5'
            }`}
          >
            <Coins className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>မိတ်ဆက်ခပြောင်း</span>
          </button>
        </div>
      </div>

      {/* Success Feedback Notification */}
      {successToast && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center gap-2 animate-fadeIn shadow-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* TAB 1: DEPOSIT (ငွေသွင်း) */}
      {tab === 'deposit' && (
        <form onSubmit={handleDepositSubmit} className="flex flex-col gap-4">
          {/* Method Selector */}
          <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-2xl flex flex-col gap-3">
            <span className="text-xs font-black text-white flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-amber-400" />
              <span>ငွေပေးချေမှု</span>
            </span>

            <div className="grid grid-cols-2 gap-3">
              {/* KBZPay Card */}
              <button
                type="button"
                onClick={() => {
                  sounds.playChip();
                  setMethod('kpay');
                }}
                className={`p-3 sm:p-4 rounded-2xl border transition-all flex items-center gap-3 text-left relative overflow-hidden ${
                  method === 'kpay'
                    ? 'bg-blue-950/40 border-blue-500/60 shadow-lg shadow-blue-500/10'
                    : 'bg-zinc-900/40 border-white/10 hover:border-white/20 opacity-70 hover:opacity-100'
                }`}
              >
                <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-md border border-white/10 bg-blue-600">
                  <img
                    src="/assets/casino/kpay_badge.jpg"
                    alt="KBZPay"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs sm:text-sm font-black text-white">KBZPay</span>
                </div>
                {method === 'kpay' && (
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-400" />
                )}
              </button>

              {/* Wave Money Card */}
              <button
                type="button"
                onClick={() => {
                  sounds.playChip();
                  setMethod('wave');
                }}
                className={`p-3 sm:p-4 rounded-2xl border transition-all flex items-center gap-3 text-left relative overflow-hidden ${
                  method === 'wave'
                    ? 'bg-amber-950/40 border-amber-500/60 shadow-lg shadow-amber-500/10'
                    : 'bg-zinc-900/40 border-white/10 hover:border-white/20 opacity-70 hover:opacity-100'
                }`}
              >
                <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-md border border-white/10 bg-amber-500">
                  <img
                    src="/assets/casino/wave_badge.jpg"
                    alt="Wave Money"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs sm:text-sm font-black text-white">Wave Money</span>
                </div>
                {method === 'wave' && (
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400" />
                )}
              </button>
            </div>
          </div>

          {/* Payee Details Box */}
          <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-white">ငွေလွှဲရန်</span>
              <span className="text-[11px] text-zinc-400 font-medium">
                အနည်းဆုံးသွင်းငွေ: <strong className="text-amber-400 font-mono">{formatKs(minDepositRequired)}</strong>
              </span>
            </div>

            <div className="p-3 sm:p-4 rounded-2xl bg-black/60 border border-white/10 flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-xs text-zinc-400 font-medium">{currentPayName}</span>
                <span className="text-base sm:text-lg font-black text-amber-400 font-mono tracking-wider mt-0.5">
                  {currentPayPhone}
                </span>
              </div>

              <button
                type="button"
                onClick={handleCopyPhone}
                className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs transition-all active:scale-95 shadow-md flex items-center gap-1.5 shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Copy className="w-3.5 h-3.5 stroke-[2.5]" />}
                <span>{copied ? 'ကူးပြီး' : 'နံပါတ်ကူးမည်'}</span>
              </button>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              ငွေလွှဲပြီးပါက ပြေစာမှ နောက်ဆုံး ၅ လုံးကို ထည့်ပါ။
            </p>
          </div>

          {/* Deposit Amount Selection */}
          <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-2xl flex flex-col gap-3">
            <span className="text-xs font-black text-white">သွင်းမည့်ပမာဏ</span>

            {/* Quick Chips */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {quickDepositPresets.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    sounds.playChip();
                    setDepositAmount(amt);
                  }}
                  className={`py-2 px-1 rounded-xl text-xs font-bold font-mono transition-all border ${
                    depositAmount === amt
                      ? 'bg-amber-400 text-black border-amber-400 shadow-md font-black'
                      : 'bg-zinc-900 text-zinc-300 border-white/10 hover:border-white/20'
                  }`}
                >
                  {formatKs(amt)}
                </button>
              ))}
            </div>

            {/* Custom Input */}
            <div className="relative mt-1">
              <input
                type="number"
                min={minDepositRequired}
                step={500}
                value={depositAmount || ''}
                onChange={(e) => setDepositAmount(Number(e.target.value))}
                placeholder="သွင်းမည့်ပမာဏ"
                className="w-full py-3 px-4 rounded-xl bg-black/60 border border-white/15 text-white font-mono font-bold text-sm focus:outline-none focus:border-amber-400/80"
              />
              <span className="absolute right-4 top-3.5 text-xs text-zinc-400 font-bold">Ks</span>
            </div>
          </div>

          {/* Transaction ID Last 5 Digits Input (Replacing Image Upload completely) */}
          <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-white flex items-center gap-1.5">
                <Hash className="w-4 h-4 text-amber-400" />
                <span>ငွေလွှဲနံပါတ် · နောက်ဆုံး ၅ လုံး</span>
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="relative mt-1">
                <input
                  type="text"
                  maxLength={6}
                  value={trxLast5}
                  onChange={(e) => setTrxLast5(e.target.value.replace(/\s+/g, ''))}
                  placeholder="ဥပမာ: 89012"
                  className="w-full py-3.5 px-4 rounded-xl bg-black/70 border-2 border-amber-400/60 text-white font-mono font-black text-xl tracking-widest text-center focus:outline-none focus:border-amber-400 placeholder:text-zinc-600 placeholder:tracking-normal placeholder:font-normal placeholder:text-sm shadow-inner"
                  required
                />
              </div>

            </div>
          </div>

          {/* Submit Deposit Button */}
          <button
            type="submit"
            disabled={loading || !trxLast5.trim()}
            className="w-full py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-black font-black text-sm transition-all active:scale-95 shadow-xl shadow-amber-500/10 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="w-5 h-5 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowDownLeft className="w-5 h-5 stroke-[2.5]" />
            )}
            <span>{loading ? 'တင်နေသည်…' : `ငွေသွင်းတင်မည် · ${formatKs(depositAmount)}`}</span>
          </button>
        </form>
      )}

      {/* TAB 2: WITHDRAW (ငွေထုတ်) */}
      {tab === 'withdraw' && (
        <form onSubmit={handleWithdrawSubmit} className="flex flex-col gap-4">
          {/* Latest Declined Alert if any */}
          {latestDeclined && (
            <div className="p-3.5 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs font-bold flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <span>ယခင်ငွေထုတ်လွှာ ပယ်ချခံခဲ့ရပါသည် ({formatKs(latestDeclined.amount)})</span>
                {(latestDeclined.rejectionReason || latestDeclined.adminNote) && (
                  <span className="text-[11px] text-red-300 font-normal">
                    အကြောင်းပြချက်: {latestDeclined.rejectionReason || latestDeclined.adminNote}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Bound Bank Account Box */}
          <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-white flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-amber-400" />
                <span>ငွေလက်ခံမည့် ဘဏ်အကောင့်</span>
              </span>
              {user.boundBank && (
                <button
                  type="button"
                  onClick={() => setIsEditingBank(!isEditingBank)}
                  className="text-[11px] text-amber-400 hover:text-amber-300 font-bold"
                >
                  {isEditingBank ? 'ပယ်ဖျက်မည်' : 'အကောင့် ပြင်မည်'}
                </button>
              )}
            </div>

            {user.boundBank && !isEditingBank ? (
              <div className="p-3 sm:p-4 rounded-2xl bg-black/60 border border-white/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-white/10 bg-zinc-800">
                    <img
                      src={user.boundBank.method === 'kpay' ? '/assets/casino/kpay_badge.jpg' : '/assets/casino/wave_badge.jpg'}
                      alt={user.boundBank.method}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-white">{user.boundBank.accountName}</span>
                    <span className="text-xs font-mono text-zinc-400">{user.boundBank.phone}</span>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                  ချိတ်ဆက်ပြီး
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-3 p-3.5 rounded-2xl bg-black/60 border border-white/10">
                <span className="text-[11px] text-zinc-400">
                  {user.boundBank ? 'အကောင့်အချက်အလက် ပြင်ဆင်ပါ' : 'ငွေထုတ်ယူမည့် အကောင့်ကို ဦးစွာ ချိတ်ဆက်ပါ'}
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMethod('kpay')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      method === 'kpay'
                        ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                        : 'bg-zinc-900 text-zinc-400 border-white/10'
                    }`}
                  >
                    KBZPay
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod('wave')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      method === 'wave'
                        ? 'bg-amber-500 text-black border-amber-400 shadow-md'
                        : 'bg-zinc-900 text-zinc-400 border-white/10'
                    }`}
                  >
                    Wave Money
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="အကောင့်အမည်"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="py-2.5 px-3 rounded-xl bg-zinc-900 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
                />

                <input
                  type="tel"
                  placeholder="ဖုန်းနံပါတ် (09xxxxxxxxx)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="py-2.5 px-3 rounded-xl bg-zinc-900 border border-white/15 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
                />

                <button
                  type="button"
                  onClick={handleSaveBank}
                  disabled={bindingBank}
                  className="py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/10 transition-all active:scale-95"
                >
                  {bindingBank ? 'သိမ်းဆည်းနေပါသည်...' : 'အကောင့် သိမ်းဆည်းမည်'}
                </button>
              </div>
            )}
          </div>

          {/* Daily Limit & Turnover Gauge */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl flex flex-col justify-between">
              <span className="text-[11px] text-zinc-400 font-bold">ယနေ့ ထုတ်နိုင်သည့်ပမာဏ</span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-base sm:text-lg font-black text-amber-400 font-mono tabular-nums">
                  {formatKs(remainingDailyWithdrawal)}
                </span>
                <span className="text-[10px] text-zinc-500">/ {formatKs(maxDailyLimit)}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl flex flex-col justify-between">
              <span className="text-[11px] text-zinc-400 font-bold">လိုအပ်သည့် လောင်းကြေး</span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-base sm:text-lg font-black text-emerald-400 font-mono tabular-nums">
                  {formatKs(user.wagerSinceLastWithdrawal || 0)}
                </span>
                <span className="text-[10px] text-zinc-500">/ {formatKs(requiredWagerForWithdrawal)}</span>
              </div>
            </div>
          </div>

          {/* Withdrawal Amount Selection */}
          <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-2xl flex flex-col gap-3">
            <span className="text-xs font-black text-white">ထုတ်မည့်ပမာဏ · အနည်းဆုံး {formatKs(settings.MINIMUM_WITHDRAW || 3000)}</span>

            {/* Quick Chips */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {quickWithdrawPresets.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    sounds.playChip();
                    setWithdrawAmount(amt);
                  }}
                  className={`py-2 px-1 rounded-xl text-xs font-bold font-mono transition-all border ${
                    withdrawAmount === amt
                      ? 'bg-amber-400 text-black border-amber-400 shadow-md font-black'
                      : 'bg-zinc-900 text-zinc-300 border-white/10 hover:border-white/20'
                  }`}
                >
                  {formatKs(amt)}
                </button>
              ))}
            </div>

            {/* Custom Input */}
            <div className="relative mt-1">
              <input
                type="number"
                min={settings.MINIMUM_WITHDRAW || 3000}
                step={500}
                value={withdrawAmount || ''}
                onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                placeholder="ထုတ်မည့်ပမာဏ"
                className="w-full py-3 px-4 rounded-xl bg-black/60 border border-white/15 text-white font-mono font-bold text-sm focus:outline-none focus:border-amber-400/80"
              />
              <span className="absolute right-4 top-3.5 text-xs text-zinc-400 font-bold">Ks</span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-black font-black text-sm transition-all active:scale-95 shadow-xl shadow-amber-500/10 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="w-5 h-5 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowUpRight className="w-5 h-5 stroke-[2.5]" />
            )}
            <span>{loading ? 'တင်နေသည်…' : `ငွေထုတ်တင်မည် · ${formatKs(withdrawAmount)}`}</span>
          </button>
        </form>
      )}

      {/* TAB 3: HISTORY (ငွေသွင်းနှင့် ငွေထုတ် မှတ်တမ်းများ) */}
      {tab === 'history' && (
        <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-2xl flex flex-col gap-4">
          {/* History Sub-Tabs */}
          <div className="flex items-center gap-2 border-b border-white/10 pb-3">
            <button
              onClick={() => {
                sounds.playChip();
                setHistorySubTab('deposits');
              }}
              className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                historySubTab === 'deposits'
                  ? 'bg-amber-400 text-black font-black shadow-md'
                  : 'bg-white/5 text-zinc-400 hover:text-white'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>ငွေသွင်း ({userDeposits.length})</span>
            </button>

            <button
              onClick={() => {
                sounds.playChip();
                setHistorySubTab('withdrawals');
              }}
              className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                historySubTab === 'withdrawals'
                  ? 'bg-amber-400 text-black font-black shadow-md'
                  : 'bg-white/5 text-zinc-400 hover:text-white'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>ငွေထုတ် ({userWithdrawals.length})</span>
            </button>
          </div>

          {/* Sub-View: Deposits List */}
          {historySubTab === 'deposits' && (
            <div className="flex flex-col gap-2 max-h-[440px] overflow-y-auto pr-1">
              {userDeposits.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500 flex flex-col items-center justify-center gap-2">
                  <Clock className="w-8 h-8 text-zinc-600 stroke-[1.5]" />
                  <span>ငွေသွင်းထားသော မှတ်တမ်း မရှိသေးပါ။</span>
                </div>
              ) : (
                userDeposits.map((d, idx) => (
                  <div
                    key={d.id || d.depositId || idx}
                    className="p-3.5 rounded-2xl bg-zinc-900/60 border border-white/10 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-white/10 bg-zinc-800">
                        <img
                          src={d.method === 'kpay' ? '/assets/casino/kpay_badge.jpg' : '/assets/casino/wave_badge.jpg'}
                          alt={d.method}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-white text-sm">
                            {formatKs(d.amount)}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono uppercase">
                            {d.method === 'kpay' ? 'KBZPay' : 'Wave Money'}
                          </span>
                        </div>
                        <span className="text-[11px] text-amber-300 font-mono mt-0.5 font-bold">
                          ငွေလွှဲနံပါတ်: <span className="bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded">{d.trxLast5 || d.receiptImage || '-'}</span>
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono mt-0.5">{new Date(d.createdAt).toLocaleString('my-MM')} {d.reviewedAt ? `· စစ်ဆေးပြီး ${new Date(d.reviewedAt).toLocaleString('my-MM')}` : ''}</span>
                        {d.reviewNote && <span className="text-[10px] text-red-300/80 mt-0.5">မှတ်ချက်: {d.reviewNote}</span>}
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div>
                      {(d.status === 'approved' || d.status === 'completed') && (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {getTransactionStatus(d.status, 'deposit').label}
                        </span>
                      )}
                      {d.status === 'pending' && (
                        <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {getTransactionStatus(d.status, 'deposit').label}
                        </span>
                      )}
                      {d.status === 'declined' && (
                        <span className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] font-bold flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          {getTransactionStatus(d.status, 'deposit').label}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Sub-View: Withdrawals List */}
          {historySubTab === 'withdrawals' && (
            <div className="flex flex-col gap-2 max-h-[440px] overflow-y-auto pr-1">
              {userWithdrawals.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500 flex flex-col items-center justify-center gap-2">
                  <Clock className="w-8 h-8 text-zinc-600 stroke-[1.5]" />
                  <span>ငွေထုတ်ယူထားသော မှတ်တမ်း မရှိသေးပါ။</span>
                </div>
              ) : (
                userWithdrawals.map((w, idx) => (
                  <div
                    key={w.id || w.withdrawalId || idx}
                    className="p-3.5 rounded-2xl bg-zinc-900/60 border border-white/10 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-white/10 bg-zinc-800">
                        <img
                          src={w.method === 'kpay' ? '/assets/casino/kpay_badge.jpg' : '/assets/casino/wave_badge.jpg'}
                          alt={w.method}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-white text-sm">
                            {formatKs(w.amount)}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono uppercase">
                            {w.method === 'kpay' ? 'KBZPay' : 'Wave Money'}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono mt-0.5">{new Date(w.createdAt).toLocaleString('my-MM')} · {w.phone} {w.reviewedAt ? `· စစ်ဆေးပြီး ${new Date(w.reviewedAt).toLocaleString('my-MM')}` : ''}</span>
                        {(w.rejectionReason || w.reviewNote) && <span className="text-[10px] text-red-300/80 mt-0.5">မအောင်မြင်ရခြင်း: {w.rejectionReason || w.reviewNote}</span>}
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div>
                      {(w.status === 'approved' || w.status === 'completed') && (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {getTransactionStatus(w.status, 'withdrawal').label}
                        </span>
                      )}
                      {w.status === 'pending' && (
                        <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {getTransactionStatus(w.status, 'withdrawal').label}
                        </span>
                      )}
                      {w.status === 'declined' && (
                        <span className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] font-bold flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          {getTransactionStatus(w.status, 'withdrawal').label}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: COMMISSION TRANSFER (မိတ်ဆက်ခပြောင်း) */}
      {tab === 'transfer' && (
        <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-2xl flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-400 text-black flex items-center justify-center font-black shrink-0 shadow-lg shadow-amber-400/20">
              <Coins className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white">မိတ်ဆက်ခ လက်ကျန်</h3>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-black/60 border border-white/10 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400">လက်ကျန်ငွေ</span>
            <span className="text-xl sm:text-2xl font-black text-amber-400 font-mono tabular-nums">
              {formatKs(user.referralBalance)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleTransferCommission}
            disabled={transferring || user.referralBalance < settings.MINIMUM_TRANSFER_AMOUNT}
            className="w-full py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs sm:text-sm transition-all active:scale-95 shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {transferring ? (
              <RefreshCw className="w-5 h-5 animate-spin" aria-hidden="true" />
            ) : (
              <Coins className="w-4 h-4 stroke-[2.5]" />
            )}
            <span>
              {user.referralBalance >= settings.MINIMUM_TRANSFER_AMOUNT
                ? 'ပြောင်းရန်'
                : `အနည်းဆုံး ${formatKs(settings.MINIMUM_TRANSFER_AMOUNT)}`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

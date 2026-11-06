'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Check,
  Upload,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  CreditCard,
  RefreshCw,
  Lock,
  Coins,
  History,
  Clock,
  CheckCircle2,
  XCircle,
  X,
  ChevronRight,
  Info,
} from 'lucide-react';
import { GameSettings, UserProfile, BoundBank, WithdrawalRequest } from '@/lib/types';
import { formatKs } from '@/lib/constants';
import { sounds } from '@/lib/audio';
import { compressReceiptImage } from '@/lib/imageUtils';

interface WalletViewProps {
  user: UserProfile;
  settings: GameSettings;
  userWithdrawals?: WithdrawalRequest[];
  onSubmitDeposit: (amount: number, method: 'kpay' | 'wave', receiptImage: string) => Promise<boolean>;
  onSubmitWithdrawal: (amount: number, method: 'kpay' | 'wave', phone: string, accountName: string) => Promise<boolean>;
  onTransferReferral: () => Promise<boolean>;
  onBindBank?: (method: 'kpay' | 'wave', phone: string, accountName: string) => Promise<boolean>;
  onRefreshUser?: () => void;
}

export function WalletView({
  user,
  settings,
  userWithdrawals = [],
  onSubmitDeposit,
  onSubmitWithdrawal,
  onTransferReferral,
  onBindBank,
  onRefreshUser,
}: WalletViewProps) {
  const [tab, setTab] = useState<'deposit' | 'withdraw' | 'history' | 'transfer'>('deposit');
  const [method, setMethod] = useState<'kpay' | 'wave'>(user.boundBank?.method || 'kpay');
  const [depositAmount, setDepositAmount] = useState<number>(settings.MINIMUM_DEPOSIT || 3000);
  const [withdrawAmount, setWithdrawAmount] = useState<number>(settings.MINIMUM_WITHDRAW || 3000);
  const [phone, setPhone] = useState<string>(user.boundBank?.phone || '');
  const [accountName, setAccountName] = useState<string>(user.boundBank?.accountName || '');
  const [receiptBase64, setReceiptBase64] = useState<string>('');
  const [compressing, setCompressing] = useState<boolean>(false);
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('ဓါတ်ပုံဖိုင် (JPG, PNG) သာ တင်ပေးပါရန်။');
      return;
    }

    setCompressing(true);
    try {
      sounds.playChip();
      const compressed = await compressReceiptImage(file);
      setReceiptBase64(compressed);
    } catch (err) {
      console.error('Image compression failed:', err);
      alert('ဓါတ်ပုံ တင်ရာတွင် အမှားဖြစ်ပေါ်သွားပါသည်။ ပြန်လည် ကြိုးစားပေးပါ။');
    } finally {
      setCompressing(false);
    }
  };

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (depositAmount < minDepositRequired) {
      alert(`အနည်းဆုံး ငွေသွင်းပမာဏမှာ ${formatKs(minDepositRequired)} ဖြစ်ပါသည်။`);
      return;
    }
    if (!receiptBase64) {
      alert('ငွေလွှဲပြေစာ (Screenshot) ဓါတ်ပုံ ထည့်သွင်းပေးပါရန်။');
      return;
    }

    setLoading(true);
    try {
      const ok = await onSubmitDeposit(depositAmount, method, receiptBase64);
      if (ok) {
        sounds.playWin();
        setReceiptBase64('');
        setSuccessToast(`ငွေသွင်းလွှာ (${formatKs(depositAmount)}) တင်ပြပြီးပါပြီ။ စက္ကန့် ၃၀ အတွင်း စစ်ဆေးအတည်ပြုပေးပါမည်။`);
        setTab('history');
        setTimeout(() => setSuccessToast(null), 6000);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isHedgingBlocked) {
      alert('ဘေးမညီလောင်းကြေး (Hedging) သို့မဟုတ် ကန့်သတ်ချက် ရှိနေသဖြင့် ငွေထုတ်ယူမှုကို ခေတ္တရပ်ဆိုင်းထားပါသည်။');
      return;
    }

    if (!isFirstDeposit && !firstWithdrawEligible) {
      alert(`ပထမအကြိမ် ငွေထုတ်ရန် အနည်းဆုံး စုစုပေါင်း သွင်းငွေ ${formatKs(requiredDepositForFirstWithdraw)} ပြည့်ရပါမည်။`);
      return;
    }

    if (!subsequentWithdrawEligible) {
      alert(`ငွေထုတ်ယူရန် လိုအပ်သော လောင်းကြေးလည်ပတ်ငွေ (${formatKs(requiredWagerForWithdrawal)}) မပြည့်မီသေးပါ။`);
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
        setSuccessToast(`ငွေထုတ်လွှာ (${formatKs(withdrawAmount)}) တင်ပြပြီးပါပြီ။ စက္ကန့် ၃၀ အတွင်း လွှဲပြောင်းပေးပါမည်။`);
        setTab('history');
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
        setSuccessToast('ဘဏ်အကောင့် အောင်မြင်စွာ ချိတ်ဆက်ပြီးပါပြီ!');
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
        setSuccessToast(`မိတ်ဆက်ခ ${formatKs(user.referralBalance)} ကို ပင်မလက်ကျန်သို့ ပြောင်းပြီးပါပြီ!`);
        setTimeout(() => setSuccessToast(null), 5000);
      }
    } finally {
      setTransferring(false);
    }
  };

  const quickDepositPresets = [3000, 5000, 10000, 20000, 50000, 100000];
  const quickWithdrawPresets = [3000, 5000, 10000, 30000, 50000, 100000];

  return (
    <div className="w-full flex flex-col gap-4 pb-12 animate-fadeIn">
      {/* 1. TOP VIP BALANCE & WALLET HERO (With subtle dark obsidian & gold backdrop) */}
      <div className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-zinc-950/90">
        {/* Subtle Obsidian & Warm Gold Background Image Overlay */}
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
                  ကစားနိုင်သော လက်ကျန်ငွေ
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

          {/* Quick Trust Badges */}
          <div className="flex items-center gap-2 self-start sm:self-auto text-xs font-bold text-zinc-300">
            <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>စက္ကန့် ၃၀ ငွေသွင်း/ထုတ်</span>
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
          {/* Method Selector with Real Logo Badges */}
          <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-2xl flex flex-col gap-3">
            <span className="text-xs font-black text-white flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-amber-400" />
              <span>ငွေပေးချေမှု နည်းလမ်း ရွေးချယ်ပါ</span>
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
                  <span className="text-[10px] text-blue-300 font-medium">KPay မိုဘိုင်းဘဏ်</span>
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
                  <span className="text-[10px] text-amber-300 font-medium">WavePay အိတ်ဆောင်</span>
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
              <span className="text-xs font-black text-white">ငွေလက်ခံမည့် {method === 'kpay' ? 'KBZPay' : 'Wave Money'} အကောင့်</span>
              <span className="text-[11px] text-zinc-400 font-medium">
                အနည်းဆုံးသွင်းငွေ: <strong className="text-amber-400 font-mono">{formatKs(minDepositRequired)}</strong>
              </span>
            </div>

            <div className="p-3 sm:p-4 rounded-2xl bg-black/60 border border-white/10 flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-xs text-zinc-400 font-medium">အကောင့်အမည်: <strong className="text-white">{currentPayName}</strong></span>
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
              💡 အထက်ပါဖုန်းနံပါတ်သို့ ငွေလွှဲပြီးပါက ငွေလွှဲပြေစာ (Screenshot) ကို အောက်တွင် ထည့်သွင်းပေးပါရန်။
            </p>
          </div>

          {/* Deposit Amount Selection */}
          <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-2xl flex flex-col gap-3">
            <span className="text-xs font-black text-white">ငွေသွင်းမည့် ပမာဏ</span>

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
                placeholder={`သွင်းမည့်ပမာဏ (အနည်းဆုံး ${minDepositRequired} Ks)`}
                className="w-full py-3 px-4 rounded-xl bg-black/60 border border-white/15 text-white font-mono font-bold text-sm focus:outline-none focus:border-amber-400/80"
              />
              <span className="absolute right-4 top-3.5 text-xs text-zinc-400 font-bold">Ks</span>
            </div>
          </div>

          {/* Transaction Slip Screenshot Upload */}
          <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-2xl flex flex-col gap-3">
            <span className="text-xs font-black text-white flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-amber-400" />
              <span>ငွေလွှဲပြေစာ (Screenshot) တင်ရန်</span>
            </span>

            {receiptBase64 ? (
              <div className="relative rounded-2xl overflow-hidden border border-white/20 p-2 bg-black/70 flex flex-col items-center">
                <img
                  src={receiptBase64}
                  alt="Receipt Preview"
                  className="max-h-60 rounded-xl object-contain shadow-lg"
                />
                <button
                  type="button"
                  onClick={() => setReceiptBase64('')}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>ပုံဖျက်ပြီး အသစ်ပြန်တင်မည်</span>
                </button>
              </div>
            ) : (
              <label className="border-2 border-dashed border-white/20 hover:border-amber-400/60 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer bg-black/40 transition-all group">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 group-hover:text-amber-400 transition-colors">
                  <Upload className="w-6 h-6 stroke-[1.8]" />
                </div>
                <div className="text-center">
                  <span className="text-xs font-bold text-white block">
                    {compressing ? 'ဓါတ်ပုံ အရွယ်အစား ညှိနေပါသည်...' : 'ငွေလွှဲ Screenshot ရွေးချယ်ပါ'}
                  </span>
                  <span className="text-[10px] text-zinc-400 mt-0.5 block">
                    JPG သို့မဟုတ် PNG (အလိုအလျောက် အကောင်းဆုံးချုံ့ပေးပါသည်)
                  </span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={compressing}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Submit Deposit Button */}
          <button
            type="submit"
            disabled={loading || compressing}
            className="w-full py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-black font-black text-sm transition-all active:scale-95 shadow-xl shadow-amber-500/10 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <span className="animate-spin text-lg">⏳</span>
            ) : (
              <ArrowDownLeft className="w-5 h-5 stroke-[2.5]" />
            )}
            <span>{loading ? 'တင်ပြနေပါသည်...' : `ငွေသွင်းလွှာ တင်မည် (${formatKs(depositAmount)})`}</span>
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
                  placeholder="အကောင့်နာမည် (Account Name)"
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
              <span className="text-[11px] text-zinc-400 font-bold">ယနေ့ ငွေထုတ်ယူနိုင်သော ကန့်သတ်ချက်</span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-base sm:text-lg font-black text-amber-400 font-mono tabular-nums">
                  {formatKs(remainingDailyWithdrawal)}
                </span>
                <span className="text-[10px] text-zinc-500">/ ၃ သိန်း ကျပ်</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl flex flex-col justify-between">
              <span className="text-[11px] text-zinc-400 font-bold">လိုအပ်သော လောင်းကြေးလည်ပတ်ငွေ</span>
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
            <span className="text-xs font-black text-white">ထုတ်ယူမည့် ပမာဏ</span>

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
                placeholder={`ထုတ်မည့်ပမာဏ (အနည်းဆုံး ${settings.MINIMUM_WITHDRAW || 3000} Ks)`}
                className="w-full py-3 px-4 rounded-xl bg-black/60 border border-white/15 text-white font-mono font-bold text-sm focus:outline-none focus:border-amber-400/80"
              />
              <span className="absolute right-4 top-3.5 text-xs text-zinc-400 font-bold">Ks</span>
            </div>
          </div>

          {/* Submit Withdrawal Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-black font-black text-sm transition-all active:scale-95 shadow-xl shadow-amber-500/10 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <span className="animate-spin text-lg">⏳</span>
            ) : (
              <ArrowUpRight className="w-5 h-5 stroke-[2.5]" />
            )}
            <span>{loading ? 'ထုတ်ယူနေပါသည်...' : `ငွေထုတ်မည် (${formatKs(withdrawAmount)})`}</span>
          </button>
        </form>
      )}

      {/* TAB 3: TRANSACTION HISTORY (မှတ်တမ်း) */}
      {tab === 'history' && (
        <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-2xl flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <span className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
              <History className="w-4 h-4 text-amber-400" />
              <span>ငွေထုတ်ယူမှု မှတ်တမ်းများ ({userWithdrawals.length})</span>
            </span>
          </div>

          <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
            {userWithdrawals.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500 flex flex-col items-center justify-center gap-2">
                <Clock className="w-8 h-8 text-zinc-600 stroke-[1.5]" />
                <span>ငွေထုတ်ယူထားသော မှတ်တမ်း မရှိသေးပါ။</span>
              </div>
            ) : (
              userWithdrawals.map((w, idx) => (
                <div
                  key={w.id || idx}
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
                          {w.method}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono mt-0.5">
                        {new Date(w.createdAt).toLocaleString()} · {w.phone} ({w.accountName})
                      </span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div>
                    {w.status === 'approved' && (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        ခွင့်ပြုပြီး
                      </span>
                    )}
                    {w.status === 'pending' && (
                      <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1 animate-pulse">
                        <Clock className="w-3 h-3" />
                        စစ်ဆေးဆဲ
                      </span>
                    )}
                    {w.status === 'declined' && (
                      <span className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] font-bold flex items-center gap-1">
                        <XCircle className="w-3 h-3" />
                        ပယ်ချခဲ့သည်
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
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
              <h3 className="text-sm sm:text-base font-black text-white">မိတ်ဆက်ခကို ပင်မလက်ကျန်သို့ ပြောင်းမည်</h3>
              <p className="text-xs text-zinc-400">
                ရရှိထားသော မိတ်ဆက်ခကို ဂိမ်းထဲသို့ ထည့်သွင်းပြီး စလော့နှင့် အံစာတုံး တိုက်ရိုက်ကစားပါ
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-black/60 border border-white/10 flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400">ရရှိထားသော မိတ်ဆက်ခ လက်ကျန်</span>
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
              <span className="animate-spin text-lg">⏳</span>
            ) : (
              <Coins className="w-4 h-4 stroke-[2.5]" />
            )}
            <span>
              {user.referralBalance >= settings.MINIMUM_TRANSFER_AMOUNT
                ? `မိတ်ဆက်ခ (${formatKs(user.referralBalance)}) ကို ပင်မလက်ကျန်သို့ ပြောင်းမည်`
                : `အနည်းဆုံး ${formatKs(settings.MINIMUM_TRANSFER_AMOUNT)} ပြည့်ပါက ပြောင်းနိုင်ပါသည်`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

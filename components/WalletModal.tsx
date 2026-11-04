'use client';

import React, { useState, useEffect } from 'react';
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
  X,
  Smartphone,
  CreditCard,
  RefreshCw,
  Lock,
  Clock,
  History,
} from 'lucide-react';
import { GameSettings, UserProfile, BoundBank, WithdrawalRequest } from '@/lib/types';
import { formatKs } from '@/lib/constants';
import { sounds } from '@/lib/audio';
import { compressReceiptImage } from '@/lib/imageUtils';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  settings: GameSettings;
  userWithdrawals?: WithdrawalRequest[];
  onSubmitDeposit: (amount: number, method: 'kpay' | 'wave', receiptImage: string) => Promise<boolean>;
  onSubmitWithdrawal: (amount: number, method: 'kpay' | 'wave', phone: string, accountName: string) => Promise<boolean>;
  onTransferReferral: () => Promise<boolean>;
  onBindBank?: (method: 'kpay' | 'wave', phone: string, accountName: string) => Promise<boolean>;
}

export function WalletModal({
  isOpen,
  onClose,
  user,
  settings,
  userWithdrawals = [],
  onSubmitDeposit,
  onSubmitWithdrawal,
  onTransferReferral,
  onBindBank,
}: WalletModalProps) {
  const [tab, setTab] = useState<'deposit' | 'withdraw' | 'history' | 'transfer'>('deposit');
  const [method, setMethod] = useState<'kpay' | 'wave'>(user.boundBank?.method || 'kpay');
  const [depositAmount, setDepositAmount] = useState<number>(settings.MINIMUM_DEPOSIT);
  const [withdrawAmount, setWithdrawAmount] = useState<number>(settings.MINIMUM_WITHDRAW);
  const [phone, setPhone] = useState<string>(user.boundBank?.phone || '');
  const [accountName, setAccountName] = useState<string>(user.boundBank?.accountName || '');
  const [receiptBase64, setReceiptBase64] = useState<string>('');
  const [compressing, setCompressing] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [bindingBank, setBindingBank] = useState<boolean>(false);

  // Daily Withdrawal Limit Computation (တစ်ရက် အများဆုံးငွေထုတ် ကန့်သတ်ချက်)
  const [currentTimestamp] = useState<number>(() => Date.now());
  const maxDailyLimit = settings.MAX_DAILY_WITHDRAWAL || 300000;
  const oneDayAgo = currentTimestamp - 24 * 60 * 60 * 1000;
  const todayWithdrawn = userWithdrawals
    .filter((w) => w.createdAt >= oneDayAgo && (w.status === 'approved' || w.status === 'pending'))
    .reduce((sum, w) => sum + (w.amount || 0), 0);
  const remainingDailyWithdrawal = Math.max(0, maxDailyLimit - todayWithdrawn);

  // Latest Declined Withdrawal for immediate user notification
  const latestDeclined = userWithdrawals.find((w) => w.status === 'declined');

  if (!isOpen) return null;

  const currentPayPhone = method === 'kpay' ? settings.KPAY_PHONE : settings.WAVE_PHONE;
  const currentPayName = method === 'kpay' ? settings.KPAY_NAME : settings.WAVE_NAME;

  // Deposit Minimum Rule
  const isFirstDeposit = !user.hasSuccessfulDeposit;
  const minDepositRequired = isFirstDeposit ? settings.MINIMUM_FIRST_DEPOSIT : settings.MINIMUM_DEPOSIT;

  // Withdrawal Eligibility Rules
  const isFirstWithdrawal = user.withdrawalCount === 0;
  const requiredDepositForFirstWithdraw = settings.FIRST_WITHDRAW_DEPOSIT_REQUIRED; // 5000 Ks
  const requiredWagerForWithdrawal = Math.ceil(withdrawAmount * settings.WITHDRAW_WAGER_PERCENT); // 50%

  const firstWithdrawEligible = user.totalSuccessfulDeposit >= requiredDepositForFirstWithdraw;
  const subsequentWithdrawEligible = user.wagerSinceLastWithdrawal >= requiredWagerForWithdrawal;

  // Anti-Hedging check
  const isHedgingBlocked = !!user.isHedgingFlagged || (user.cleanTurnoverRequired || 0) > 0;

  const handleCopyPhone = () => {
    sounds.playChip();
    navigator.clipboard.writeText(currentPayPhone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCompressing(true);
      try {
        const compressed = await compressReceiptImage(file);
        setReceiptBase64(compressed);
      } catch (err) {
        console.error('Receipt compression error, falling back to basic reader:', err);
        const reader = new FileReader();
        reader.onloadend = () => {
          setReceiptBase64(reader.result as string);
        };
        reader.readAsDataURL(file);
      } finally {
        setCompressing(false);
      }
    }
  };

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (depositAmount < minDepositRequired) {
      alert(`အနည်းဆုံးငွေသွင်းပမာဏမှာ ${formatKs(minDepositRequired)} ဖြစ်ပါသည်။`);
      return;
    }
    if (!receiptBase64) {
      alert('ကျေးဇူးပြု၍ ငွေလွှဲပြေစာ Screenshot ကို ထည့်သွင်းပေးပါ။');
      return;
    }
    setLoading(true);
    try {
      const success = await onSubmitDeposit(depositAmount, method, receiptBase64);
      if (success) {
        alert('ငွေသွင်းတောင်းဆိုမှု အောင်မြင်ပါသည်။ Admin စစ်ဆေးပြီးပါက Wallet ထဲသို့ ချက်ချင်းရောက်ရှိပါမည်။');
        setReceiptBase64('');
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExplicitBindBank = async () => {
    if (!phone.trim() || !accountName.trim()) {
      alert('ငွေလက်ခံမည့် ဖုန်းနံပါတ်နှင့် အကောင့်အမည် ထည့်သွင်းပေးပါ။');
      return;
    }
    if (onBindBank) {
      setBindingBank(true);
      try {
        await onBindBank(method, phone, accountName);
      } finally {
        setBindingBank(false);
      }
    }
  };

  const handleWithdrawalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Anti-Hedging Check
    if (isHedgingBlocked) {
      alert(
        `အကြီး နှင့် အသေး နှစ်ဖက်လုံးလောင်းကစားမှု (Hedging) တွေ့ရှိထားသဖြင့် ငွေထုတ်ယူခွင့် ယာယီဆိုင်းငံ့ထားပါသည်။\n\nစည်းကမ်းနှင့်အညီ ပြန်လည်ကစားရမည့် လောင်းကြေးပမာဏ: ${formatKs(
          user.cleanTurnoverRequired
        )} ပြည့်အောင် ကစားပြီးမှသာ ငွေထုတ်ယူနိုင်ပါမည်။`
      );
      return;
    }

    if (withdrawAmount < settings.MINIMUM_WITHDRAW) {
      alert(`အနည်းဆုံးငွေထုတ်ပမာဏမှာ ${formatKs(settings.MINIMUM_WITHDRAW)} ဖြစ်ပါသည်။`);
      return;
    }
    if (withdrawAmount > user.balance) {
      alert('လက်ကျန်ငွေ မလုံလောက်ပါ။');
      return;
    }

    // Daily Withdrawal Limit Cap Check
    if (todayWithdrawn + withdrawAmount > maxDailyLimit) {
      alert(
        `တစ်ရက်လျှင် အများဆုံး ငွေထုတ်နိုင်သည့် ကန့်သတ်ပမာဏမှာ ${formatKs(maxDailyLimit)} ဖြစ်ပါသည်။\n\nယနေ့ ထုတ်ယူပြီးပမာဏ: ${formatKs(todayWithdrawn)}\nယနေ့ ထပ်မံထုတ်ယူနိုင်သည့် လက်ကျန်: ${formatKs(remainingDailyWithdrawal)}`
      );
      return;
    }
    if (isFirstWithdrawal && !firstWithdrawEligible) {
      const remaining = requiredDepositForFirstWithdraw - user.totalSuccessfulDeposit;
      alert(`ပထမဆုံး ငွေထုတ်ရန် အတည်ပြုပြီးသား ငွေသွင်းစုစုပေါင်း ${formatKs(requiredDepositForFirstWithdraw)} ပြည့်ရပါမည်။ (ထပ်မံသွင်းရန်: ${formatKs(remaining)})`);
      return;
    }
    if (!isFirstWithdrawal && !subsequentWithdrawEligible) {
      const remaining = requiredWagerForWithdrawal - user.wagerSinceLastWithdrawal;
      alert(`ငွေထုတ်ရန် လောင်းကြေးမပြည့်သေးပါ။ လိုအပ်သောလောင်းကြေး: ${formatKs(requiredWagerForWithdrawal)} (50%)။ ထပ်မံဆော့ရန်: ${formatKs(remaining)}`);
      return;
    }

    const targetPhone = user.boundBank ? user.boundBank.phone : phone;
    const targetAccountName = user.boundBank ? user.boundBank.accountName : accountName;
    const targetMethod = user.boundBank ? user.boundBank.method : method;

    if (!targetPhone || !targetAccountName) {
      alert('ငွေလက်ခံမည့် ဖုန်းနံပါတ်နှင့် အကောင့်အမည် ထည့်သွင်းပေးပါ။');
      return;
    }

    setLoading(true);
    try {
      const success = await onSubmitWithdrawal(withdrawAmount, targetMethod, targetPhone, targetAccountName);
      if (success) {
        alert('ငွေထုတ်တောင်းဆိုမှု အောင်မြင်ပါသည်။ Admin အတည်ပြုပြီးပါက ငွေလွှဲပေးပါမည်။');
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTransferSubmit = async () => {
    if (user.referralBalance < settings.MINIMUM_TRANSFER_AMOUNT) {
      alert(`မိတ်ဆက်ခ ပြောင်းရန် အနည်းဆုံး ${formatKs(settings.MINIMUM_TRANSFER_AMOUNT)} ပြည့်ရပါမည်။`);
      return;
    }
    setLoading(true);
    try {
      const ok = await onTransferReferral();
      if (ok) {
        sounds.playWin();
        alert('မိတ်ဆက်ခကို ပင်မလက်ကျန်ငွေသို့ အောင်မြင်စွာ ပြောင်းရွှေ့ပြီးပါပြီ!');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-xl animate-fadeIn">
      <div className="relative w-full max-w-md dark-glass rounded-3xl p-5 shadow-[0_20px_60px_rgba(0,0,0,0.85)] border border-white/20 flex flex-col max-h-[92vh] overflow-y-auto">
        {/* Header with White Bold Line Action Icon */}
        <div className="flex items-center justify-between pb-3 border-b border-white/15">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-white/10 border border-white/20 text-white">
              <Wallet className="w-5 h-5 stroke-white stroke-[2.4]" />
            </div>
            <div>
              <h3 className="font-black text-white text-base tracking-tight">ငွေသွင်း / ငွေထုတ် ကောင်တာ</h3>
              <p className="text-[11px] text-white/70 font-medium">KPay & Wave Money Instant Banking</p>
            </div>
          </div>

          <button
            onClick={() => {
              sounds.playChip();
              onClose();
            }}
            className="p-2 rounded-xl dark-glass-btn text-white active:scale-90"
          >
            <X className="w-5 h-5 stroke-white stroke-[2.4]" />
          </button>
        </div>

        {/* User Balance Overview Cards */}
        <div className="grid grid-cols-2 gap-2.5 my-3">
          <div className="p-3.5 rounded-2xl dark-glass-card flex flex-col">
            <span className="text-[11px] font-bold text-white/80 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 stroke-white stroke-[2.2]" />
              ပင်မလက်ကျန်
            </span>
            <span className="text-xl font-black text-white mt-1.5 tracking-tight">{formatKs(user.balance)}</span>
          </div>

          <div className="p-3.5 rounded-2xl dark-glass-card flex flex-col">
            <span className="text-[11px] font-bold text-white/80 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 stroke-white stroke-[2.2]" />
              မိတ်ဆက်ခလက်ကျန်
            </span>
            <span className="text-xl font-black text-white mt-1.5 tracking-tight">
              {formatKs(user.referralBalance)}
            </span>
          </div>
        </div>

        {/* Action Switcher Tabs (4 Tabs) */}
        <div className="grid grid-cols-4 gap-1 p-1.5 dark-glass rounded-2xl mb-4 border border-white/15">
          <button
            onClick={() => {
              sounds.playChip();
              setTab('deposit');
            }}
            className={`flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-black transition-all ${
              tab === 'deposit'
                ? 'bg-white/20 border border-white/30 text-white shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
            ငွေသွင်း
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              setTab('withdraw');
            }}
            className={`flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-black transition-all ${
              tab === 'withdraw'
                ? 'bg-white/20 border border-white/30 text-white shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
            ငွေထုတ်
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              setTab('history');
            }}
            className={`flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-black transition-all ${
              tab === 'history'
                ? 'bg-white/20 border border-white/30 text-white shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
            မှတ်တမ်း
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              setTab('transfer');
            }}
            className={`flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-black transition-all ${
              tab === 'transfer'
                ? 'bg-white/20 border border-white/30 text-white shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
            လွှဲပြောင်း
          </button>
        </div>

        {/* Tab 1: Deposit Form */}
        {tab === 'deposit' && (
          <form onSubmit={handleDepositSubmit} className="flex flex-col gap-3.5">
            {/* Method Toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  sounds.playChip();
                  setMethod('kpay');
                }}
                className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 font-black text-xs transition-all ${
                  method === 'kpay'
                    ? 'dark-glass-btn-active'
                    : 'dark-glass-btn text-white/70'
                }`}
              >
                <Smartphone className="w-4 h-4 stroke-white stroke-[2.4]" />
                KBZPay (KPay)
              </button>

              <button
                type="button"
                onClick={() => {
                  sounds.playChip();
                  setMethod('wave');
                }}
                className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 font-black text-xs transition-all ${
                  method === 'wave'
                    ? 'dark-glass-btn-active'
                    : 'dark-glass-btn text-white/70'
                }`}
              >
                <Smartphone className="w-4 h-4 stroke-white stroke-[2.4]" />
                Wave Money
              </button>
            </div>

            {/* Official Receiver Account Box */}
            <div className="p-3.5 rounded-2xl dark-glass-card flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white/80">
                  တရားဝင် {method.toUpperCase()} ငွေလက်ခံအကောင့်
                </span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-white/15 border border-white/20 text-white">
                  အလိုအလျောက်စစ်ဆေးမည်
                </span>
              </div>

              <div className="flex items-center justify-between bg-black/60 p-2.5 rounded-xl border border-white/15">
                <div>
                  <div className="text-sm font-black text-white tracking-wide">{currentPayPhone}</div>
                  <div className="text-xs text-white/70 font-bold">{currentPayName}</div>
                </div>

                <button
                  type="button"
                  onClick={handleCopyPhone}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg dark-glass-btn text-xs font-black text-white active:scale-90"
                >
                  {copied ? <Check className="w-3.5 h-3.5 stroke-white stroke-[2.4]" /> : <Copy className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />}
                  <span>{copied ? 'ကူးပြီး' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* First Deposit 5000+ -> 2000 Bonus Banner */}
            {!user.hasSuccessfulDeposit && (
              <div className="p-3 rounded-2xl bg-white/10 border border-white/25 flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 stroke-white stroke-[2.4] shrink-0" />
                <div className="flex flex-col">
                  <span className="text-xs font-black text-white">
                    ၅,၀၀၀ Ks သွင်းပါက Bonus ၂,၀၀၀ Ks လက်ဆောင်!
                  </span>
                  <span className="text-[11px] text-white/80 font-medium">
                    ပထမဆုံးအကြိမ် ၅,၀၀၀ Ks နှင့်အထက် သွင်းယူသည့် မန်ဘာသစ်တိုင်း ၂,၀၀၀ Ks အပိုဆု ရရှိပါမည်။
                  </span>
                </div>
              </div>
            )}

            {/* Deposit Amount Input */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white">သွင်းမည့် ငွေပမာဏ (Ks)</label>
                <span className="text-[10px] font-bold text-white/70">
                  အနည်းဆုံး: {formatKs(minDepositRequired)}
                </span>
              </div>
              <input
                type="number"
                min={minDepositRequired}
                step={500}
                required
                value={depositAmount}
                onChange={(e) => setDepositAmount(Number(e.target.value))}
                className="w-full py-2.5 px-3 bg-black/60 rounded-xl border border-white/20 font-black text-white text-base focus:outline-none focus:border-white/50"
              />
            </div>

            {/* Receipt Upload Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-white">ငွေလွှဲပြေစာ Screenshot ထည့်သွင်းပါ</label>
              <label className="border-2 border-dashed border-white/25 hover:border-white/50 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer bg-black/40 transition-all">
                <Upload className="w-6 h-6 stroke-white stroke-[2.4]" />
                <span className="text-xs font-black text-white">
                  {compressing
                    ? 'ဓာတ်ပုံ အချိုးအစား ချိန်ညှိနေပါသည်...'
                    : receiptBase64
                    ? 'ပြေစာ ရွေးချယ်ပြီးပါပြီ (ပြန်ပြောင်းရန် နှိပ်ပါ)'
                    : 'ငွေလွှဲပြေစာ ဓာတ်ပုံ ရွေးချယ်ပါ'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || compressing}
              className="mt-1 w-full py-3 rounded-2xl dark-glass-btn hover:bg-white/20 border border-white/25 text-white font-black text-sm active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <Check className="w-4 h-4 stroke-white stroke-[2.4]" />
              {compressing ? 'ဓာတ်ပုံ အဆင်သင့်လုပ်နေပါသည်...' : loading ? 'ပေးပို့နေပါသည်...' : 'ငွေသွင်းတောင်းဆိုမှု တင်မည်'}
            </button>
          </form>
        )}

        {/* Tab 2: Withdraw Form */}
        {tab === 'withdraw' && (
          <form onSubmit={handleWithdrawalSubmit} className="flex flex-col gap-3.5">
            {/* Anti-Hedging Alert Banner */}
            {isHedgingBlocked && (
              <div className="p-3.5 rounded-2xl bg-white/10 border border-white/30 text-xs flex flex-col gap-1.5">
                <span className="font-black text-white flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 stroke-white stroke-[2.4]" />
                  Hedging စည်းကမ်းချက်ကြောင့် ငွေထုတ်ယူခွင့် ယာယီဆိုင်းငံ့ထားပါသည်
                </span>
                <p className="text-[11px] text-white/85 font-medium leading-relaxed">
                  အလှည့်တစ်ခုတည်းတွင် အကြီးရော အသေးပါ နှစ်ဖက်လုံး လောင်းကစားထားသဖြင့် ငွေထုတ်ယူခွင့် ယာယီပိတ်ထားပါသည်။ စည်းကမ်းနှင့်အညီ ပြန်လည်ကစားပြီးမှသာ ငွေထုတ်ယူနိုင်ပါမည်။
                </p>
                <div className="flex items-center justify-between text-xs font-black text-white mt-1 pt-1.5 border-t border-white/15">
                  <span>ပြန်လည်ကစားရန် လိုအပ်ငွေ:</span>
                  <span className="underline">{formatKs(user.cleanTurnoverRequired)}</span>
                </div>
              </div>
            )}

            {/* Daily Withdrawal Limit Card */}
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between text-xs">
              <div className="flex flex-col">
                <span className="text-[10px] text-white/60 font-bold">တစ်ရက် အများဆုံး ငွေထုတ်ကန့်သတ်ချက်</span>
                <span className="font-black text-white">{formatKs(maxDailyLimit)}</span>
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[10px] text-white/60 font-bold">ယနေ့ ထုတ်ယူနိုင်သည့် လက်ကျန်</span>
                <span className="font-black font-mono text-emerald-400">{formatKs(remainingDailyWithdrawal)}</span>
              </div>
            </div>

            {/* Latest Declined Withdrawal Alert Banner with Rejection Reason */}
            {latestDeclined && (
              <div className="p-3.5 rounded-2xl bg-red-950/40 border border-red-500/40 text-xs flex flex-col gap-1.5 animate-fadeIn">
                <div className="flex items-center gap-1.5 text-red-300 font-black">
                  <AlertCircle className="w-4 h-4 stroke-[2.2]" />
                  <span>နောက်ဆုံး ငွေထုတ်တောင်းဆိုမှု ပယ်ချခံရပါသည်</span>
                </div>
                <div className="p-2 rounded-xl bg-black/40 border border-red-500/20 text-[11px] text-white/90">
                  <span className="text-white/60 font-bold block mb-0.5">Admin မှ ပယ်ချရသည့် အကြောင်းအရင်း:</span>
                  <span className="font-black text-red-200">{latestDeclined.rejectionReason || 'အကြောင်းပြချက် မဖော်ပြထားပါ'}</span>
                </div>
                <span className="text-[10px] text-white/60 font-medium">
                  ထုတ်ယူငွေ {formatKs(latestDeclined.amount)} ကို သင့် Wallet ပင်မလက်ကျန်ထဲသို့ ပြန်လည် ထည့်သွင်းပေးပြီးဖြစ်ပါသည်။
                </span>
              </div>
            )}

            {/* Single Bank Account Binding Status Card */}
            {user.boundBank ? (
              <div className="p-3.5 rounded-2xl dark-glass-card border border-white/25 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-black text-white">
                    <ShieldCheck className="w-4 h-4 stroke-white stroke-[2.4]" />
                    ချိတ်ဆက်ထားသော ဘဏ်အကောင့် (၁ ခုသာ ခွင့်ပြုထားပါသည်)
                  </span>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-white/20 border border-white/30 text-white flex items-center gap-1">
                    <Lock className="w-3 h-3 stroke-white stroke-[2.4]" />
                    {user.boundBank.method === 'kpay' ? 'KBZPay' : 'Wave Money'}
                  </span>
                </div>
                <div className="bg-black/60 p-2.5 rounded-xl border border-white/15 flex items-center justify-between text-xs font-bold text-white">
                  <div className="flex flex-col">
                    <span className="font-mono font-black text-sm">{user.boundBank.phone}</span>
                    <span className="text-white/70 text-[11px]">{user.boundBank.accountName}</span>
                  </div>
                  <span className="text-[10px] text-white/60 font-medium">လုံခြုံရေးအရ ပုံသေဖြစ်သည်</span>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-2xl bg-black/60 border border-white/20 text-xs flex flex-col gap-1.5 text-white">
                <span className="font-black flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 stroke-white stroke-[2.4]" />
                  ဘဏ်တစ်ခုဘဲ ချိတ်ဆက်ခွင့်ရှိပါသည် (Single Bank Binding)
                </span>
                <p className="text-[11px] text-white/80 font-medium">
                  ငွေထုတ်ယူမည့် KPay သို့မဟုတ် Wave ဘဏ်အကောင့်ကို ၁ ခုသာ အတည်ပြု ချိတ်ဆက်ခွင့်ရှိပါသည်။ တစ်ကြိမ်ချိတ်ဆက်ပြီးပါက အခြားဘဏ်သို့ ပြောင်းလဲခွင့် မရှိပါ။
                </p>
              </div>
            )}

            {/* Eligibility Rule Checker Alert */}
            {isFirstWithdrawal ? (
              <div className="p-3.5 rounded-2xl dark-glass-card border border-white/20 text-xs flex flex-col gap-1">
                <span className="font-black text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 stroke-white stroke-[2.4]" />
                  ပထမဆုံး ငွေထုတ်ခြင်း စည်းမျဉ်း
                </span>
                <p className="text-white/80 font-bold">
                  ပထမဆုံးငွေထုတ်ရန် အနည်းဆုံး ငွေသွင်းစုစုပေါင်း {formatKs(requiredDepositForFirstWithdraw)} ပြည့်ရပါမည်။
                </p>
                <div className="mt-1 flex items-center justify-between text-[11px] font-black text-white">
                  <span>သွင်းပြီး: {formatKs(user.totalSuccessfulDeposit)}</span>
                  <span>{firstWithdrawEligible ? 'သတ်မှတ်ချက်ပြည့်မီပါပြီ' : `ကျန်: ${formatKs(Math.max(0, requiredDepositForFirstWithdraw - user.totalSuccessfulDeposit))}`}</span>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl dark-glass-card border border-white/20 text-xs flex flex-col gap-1">
                <span className="font-black text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 stroke-white stroke-[2.4]" />
                  ဆက်လက် ငွေထုတ်ခြင်း စည်းမျဉ်း (Turnover 50%)
                </span>
                <p className="text-white/80 font-bold">
                  ထုတ်ယူမည့် ငွေပမာဏ၏ ၅၀% လောင်းကြေးပြည့်ရပါမည်။
                </p>
                <div className="mt-1 flex items-center justify-between text-[11px] font-black text-white">
                  <span>လက်ရှိလောင်းထားမှု: {formatKs(user.wagerSinceLastWithdrawal)}</span>
                  <span>လိုအပ်ချက်: {formatKs(requiredWagerForWithdrawal)}</span>
                </div>
              </div>
            )}

            {/* Method Toggle (Disabled if already bound to one bank) */}
            {!user.boundBank && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    sounds.playChip();
                    setMethod('kpay');
                  }}
                  className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 font-black text-xs transition-all ${
                    method === 'kpay'
                      ? 'dark-glass-btn-active'
                      : 'dark-glass-btn text-white/70'
                  }`}
                >
                  <Smartphone className="w-4 h-4 stroke-white stroke-[2.4]" />
                  KBZPay (KPay)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sounds.playChip();
                    setMethod('wave');
                  }}
                  className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 font-black text-xs transition-all ${
                    method === 'wave'
                      ? 'dark-glass-btn-active'
                      : 'dark-glass-btn text-white/70'
                  }`}
                >
                  <Smartphone className="w-4 h-4 stroke-white stroke-[2.4]" />
                  Wave Money
                </button>
              </div>
            )}

            {/* Withdraw Amount Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-white">ထုတ်ယူမည့် ငွေပမာဏ (Ks)</label>
              <input
                type="number"
                min={settings.MINIMUM_WITHDRAW}
                max={user.balance}
                step={500}
                required
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                className="w-full py-2.5 px-3 bg-black/60 rounded-xl border border-white/20 font-black text-white text-base focus:outline-none focus:border-white/50"
              />
              <span className="text-[10px] text-white/70 font-bold">
                အနည်းဆုံး ငွေထုတ်ပမာဏ: {formatKs(settings.MINIMUM_WITHDRAW)}
              </span>
            </div>

            {/* Account Phone Input (Readonly if bound) */}
            {!user.boundBank && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-white">ငွေလက်ခံမည့် {method.toUpperCase()} ဖုန်းနံပါတ်</label>
                  <input
                    type="text"
                    required
                    placeholder="09xxxxxxxxx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full py-2.5 px-3 bg-black/60 rounded-xl border border-white/20 font-black text-white text-sm focus:outline-none focus:border-white/50"
                  />
                </div>

                {/* Account Name Input */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-white">အကောင့်ပိုင်ရှင် အမည်</label>
                  <input
                    type="text"
                    required
                    placeholder="Account Full Name"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="w-full py-2.5 px-3 bg-black/60 rounded-xl border border-white/20 font-black text-white text-sm focus:outline-none focus:border-white/50"
                  />
                </div>

                {onBindBank && (
                  <button
                    type="button"
                    onClick={handleExplicitBindBank}
                    disabled={bindingBank || !phone.trim() || !accountName.trim()}
                    className="w-full py-2 rounded-xl dark-glass-btn border border-white/20 text-white font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                  >
                    <Lock className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                    {bindingBank ? 'ချိတ်ဆက်နေပါသည်...' : 'ဤဘဏ်အကောင့်ကို အမြဲတမ်း ချိတ်ဆက်မည်'}
                  </button>
                )}
              </>
            )}

            <button
              type="submit"
              disabled={loading || isHedgingBlocked}
              className={`mt-1 w-full py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${
                isHedgingBlocked
                  ? 'opacity-40 cursor-not-allowed bg-black/40 border border-white/10 text-white/50'
                  : 'dark-glass-btn hover:bg-white/20 border border-white/25 text-white active:scale-95'
              }`}
            >
              <Check className="w-4 h-4 stroke-white stroke-[2.4]" />
              {loading ? 'ပေးပို့နေပါသည်...' : isHedgingBlocked ? 'ငွေထုတ်ခွင့် ယာယီဆိုင်းငံ့ထားပါသည်' : 'ငွေထုတ်တောင်းဆိုမှု တင်မည်'}
            </button>
          </form>
        )}

        {/* Tab 3: Withdrawal History & Admin Notes */}
        {tab === 'history' && (
          <div className="flex flex-col gap-2.5 py-1">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-black text-white">ငွေထုတ်တောင်းဆိုမှု မှတ်တမ်း</span>
              <span className="text-[10px] text-white/60 font-medium font-mono">{userWithdrawals.length} ခု</span>
            </div>

            {userWithdrawals.length === 0 ? (
              <div className="p-10 text-center text-xs text-white/60 flex flex-col items-center justify-center gap-2">
                <Clock className="w-8 h-8 stroke-white stroke-[2]" />
                <span className="font-bold text-white/80">ငွေထုတ်တောင်းဆိုထားသော မှတ်တမ်း မရှိသေးပါ။</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto pr-0.5">
                {userWithdrawals.map((w, idx) => {
                  const isApproved = w.status === 'approved';
                  const isDeclined = w.status === 'declined';
                  const isPending = w.status === 'pending';

                  return (
                    <div
                      key={w.withdrawalId || `with-${idx}`}
                      className="p-3.5 rounded-2xl dark-glass-card border border-white/15 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-white">{w.accountName}</span>
                          <span className="text-[10px] font-bold text-white/60">({w.method.toUpperCase()})</span>
                        </div>
                        <span className="font-mono text-sm font-black text-white">
                          -{formatKs(w.amount)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-white/70">
                        <span className="font-mono text-[10px]">
                          {new Date(w.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </span>

                        {isApproved && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-black text-[10px] flex items-center gap-1">
                            <Check className="w-3 h-3 stroke-[2.5]" />
                            အတည်ပြု ငွေလွှဲပြီး
                          </span>
                        )}
                        {isPending && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-300 font-black text-[10px] flex items-center gap-1">
                            <Clock className="w-3 h-3 stroke-[2.5]" />
                            Admin စစ်ဆေးဆဲ
                          </span>
                        )}
                        {isDeclined && (
                          <span className="px-2 py-0.5 rounded-md bg-red-500/20 border border-red-400/40 text-red-300 font-black text-[10px] flex items-center gap-1">
                            <X className="w-3 h-3 stroke-[2.5]" />
                            ပယ်ချခံရပါသည်
                          </span>
                        )}
                      </div>

                      {/* Admin Rejection Reason Note */}
                      {isDeclined && (
                        <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/30 text-xs flex flex-col gap-1 mt-0.5">
                          <span className="text-[10px] text-red-300 font-black">
                            Admin မှ ပယ်ချရသည့် အကြောင်းအရင်း (Note):
                          </span>
                          <p className="text-[11px] text-white font-bold">
                            {w.rejectionReason || 'အကြောင်းပြချက် မဖော်ပြထားပါ'}
                          </p>
                          <span className="text-[9px] text-white/60">
                            ငွေပမာဏ {formatKs(w.amount)} ကို ပင်မလက်ကျန်ထဲသို့ ပြန်လည် ထည့်သွင်းပေးပြီးဖြစ်ပါသည်။
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Transfer Referral Bonus */}
        {tab === 'transfer' && (
          <div className="flex flex-col gap-4 py-2">
            <div className="p-4 rounded-2xl dark-glass-card flex flex-col gap-2">
              <span className="text-xs font-bold text-white/80">မိတ်ဆက်ခ လက်ကျန်ငွေ</span>
              <span className="text-3xl font-black text-white tracking-tight">
                {formatKs(user.referralBalance)}
              </span>
              <p className="text-[11px] text-white/70 font-medium mt-1">
                မိတ်ဆက်ခကို အနည်းဆုံး {formatKs(settings.MINIMUM_TRANSFER_AMOUNT)} ပြည့်ပါက ပင်မကစားငွေလက်ကျန်သို့ ပြောင်းရွှေ့၍ ချက်ချင်းကစားနိုင်ပါသည်။
              </p>
            </div>

            <button
              onClick={handleTransferSubmit}
              disabled={loading || user.referralBalance < settings.MINIMUM_TRANSFER_AMOUNT}
              className={`w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all ${
                user.referralBalance >= settings.MINIMUM_TRANSFER_AMOUNT
                  ? 'dark-glass-btn hover:bg-white/20 border border-white/30 text-white shadow-lg active:scale-95'
                  : 'opacity-40 cursor-not-allowed bg-black/40 border border-white/10 text-white/50'
              }`}
            >
              <RefreshCw className="w-4 h-4 stroke-white stroke-[2.4]" />
              {loading ? 'ပြောင်းရွှေ့နေပါသည်...' : 'ပင်မလက်ကျန်ငွေသို့ ပြောင်းရွှေ့မည်'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

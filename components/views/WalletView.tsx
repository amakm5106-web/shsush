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
  ArrowRight,
  Image as ImageIcon,
  History,
  Clock,
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
  const [depositAmount, setDepositAmount] = useState<number>(settings.MINIMUM_DEPOSIT || 1000);
  const [withdrawAmount, setWithdrawAmount] = useState<number>(settings.MINIMUM_WITHDRAW || 5000);
  const [phone, setPhone] = useState<string>(user.boundBank?.phone || '');
  const [accountName, setAccountName] = useState<string>(user.boundBank?.accountName || '');
  const [receiptBase64, setReceiptBase64] = useState<string>('');
  const [compressing, setCompressing] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [bindingBank, setBindingBank] = useState<boolean>(false);
  const [transferring, setTransferring] = useState<boolean>(false);

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
  const minDepositRequired = isFirstDeposit ? (settings.MINIMUM_FIRST_DEPOSIT || 5000) : (settings.MINIMUM_DEPOSIT || 1000);

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
        console.error('Receipt compression fallback:', err);
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
      alert('ကျေးဇူးပြု၍ ငွေလွှဲပြေစာ (Voucher Screenshot) ကို တင်ပေးပါ။');
      return;
    }

    setLoading(true);
    try {
      const ok = await onSubmitDeposit(depositAmount, method, receiptBase64);
      if (ok) {
        setReceiptBase64('');
        alert('ငွေသွင်းလွှာ တင်ပြခြင်း အောင်မြင်ပါသည်။ Admin စစ်ဆေးအတည်ပြုပြီးပါက လက်ကျန်ငွေ ချက်ချင်း ဝင်ရောက်ပါမည်။');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isHedgingBlocked) {
      alert(
        `အကောင့်စစ်ဆေးဆဲ: အကြီးရောအသေးပါ နှစ်ဖက်လုံးလောင်းခြင်းကြောင့် ငွေထုတ်ယာယီပိတ်ထားပါသည်။ သန့်ရှင်းသော လောင်းကြေး ${formatKs(
          user.cleanTurnoverRequired || 0
        )} ပြန်လည်ကစားပြီးမှ ထုတ်ယူနိုင်ပါမည်။`
      );
      return;
    }

    if (!user.boundBank && (!phone || !accountName)) {
      alert('ကျေးဇူးပြု၍ ငွေလက်ခံမည့် ဖုန်းနံပါတ်နှင့် အကောင့်အမည် ထည့်သွင်းပေးပါ။');
      return;
    }

    if (withdrawAmount < (settings.MINIMUM_WITHDRAW || 5000)) {
      alert(`အနည်းဆုံး ငွေထုတ်ပမာဏမှာ ${formatKs(settings.MINIMUM_WITHDRAW || 5000)} ဖြစ်ပါသည်။`);
      return;
    }

    if (withdrawAmount > user.balance) {
      alert('လက်ကျန်ငွေ မလုံလောက်ပါ။');
      return;
    }

    // Daily Limit Cap Check
    if (todayWithdrawn + withdrawAmount > maxDailyLimit) {
      alert(
        `တစ်ရက်လျှင် အများဆုံး ငွေထုတ်နိုင်သည့် ကန့်သတ်ပမာဏမှာ ${formatKs(maxDailyLimit)} ဖြစ်ပါသည်။\n\nယနေ့ ထုတ်ယူပြီးပမာဏ: ${formatKs(todayWithdrawn)}\nယနေ့ ထပ်မံထုတ်ယူနိုင်သည့် လက်ကျန်: ${formatKs(remainingDailyWithdrawal)}`
      );
      return;
    }

    if (!firstWithdrawEligible) {
      alert(`ပထမဆုံးအကြိမ် ငွေထုတ်ရန် အနည်းဆုံး စုစုပေါင်းငွေသွင်း ${formatKs(requiredDepositForFirstWithdraw)} ပြည့်ရပါမည်။`);
      return;
    }

    if (!subsequentWithdrawEligible) {
      alert(`ငွေထုတ်ရန် လောင်းကြေးလည်ပတ်ငွေ ${formatKs(requiredWagerForWithdrawal)} ပြည့်ရပါမည်။ (လတ်တလော: ${formatKs(user.wagerSinceLastWithdrawal || 0)})`);
      return;
    }

    const withdrawPhone = user.boundBank?.phone || phone;
    const withdrawName = user.boundBank?.accountName || accountName;
    const withdrawMethod = user.boundBank?.method || method;

    setLoading(true);
    try {
      const ok = await onSubmitWithdrawal(withdrawAmount, withdrawMethod, withdrawPhone, withdrawName);
      if (ok) {
        alert('ငွေထုတ်လွှာ တင်ပြခြင်း အောင်မြင်ပါသည်။ Admin မှ စစ်ဆေး၍ မကြာမီ လွှဲပေးပါမည်။');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBindBankSubmit = async () => {
    if (!phone || !accountName) {
      alert('ဘဏ်ဖုန်းနံပါတ်နှင့် အကောင့်အမည် အပြည့်အစုံ ဖြည့်သွင်းပါ။');
      return;
    }
    if (!onBindBank) return;

    setBindingBank(true);
    try {
      const ok = await onBindBank(method, phone, accountName);
      if (ok) {
        sounds.playChip();
        alert('ဘဏ်အကောင့်ကို အောင်မြင်စွာ ချိတ်ဆက်ပြီးပါပြီ! (လုံခြုံရေးအရ နောက်တစ်ကြိမ် ပြောင်းလဲ၍မရပါ)');
      }
    } finally {
      setBindingBank(false);
    }
  };

  const handleTransferCommission = async () => {
    if (user.referralBalance < (settings.MINIMUM_TRANSFER_AMOUNT || 1000)) {
      alert(`မိတ်ဆက်ခ ပြောင်းရန် အနည်းဆုံး ${formatKs(settings.MINIMUM_TRANSFER_AMOUNT || 1000)} ပြည့်ရပါမည်။`);
      return;
    }
    setTransferring(true);
    try {
      const ok = await onTransferReferral();
      if (ok) {
        sounds.playWin();
        alert('မိတ်ဆက်ခကို ပင်မလက်ကျန်သို့ အောင်မြင်စွာ ပြောင်းပြီးပါပြီ!');
      }
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="w-full max-w-md px-3.5 flex flex-col gap-3.5 pb-8 animate-fadeIn">
      {/* Balance Banner Card */}
      <div className="p-4 rounded-3xl dark-glass-card border border-white/20 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-2xl bg-white/10 border border-white/20 text-white">
              <Wallet className="w-5 h-5 stroke-white stroke-[2.4]" />
            </div>
            <div>
              <span className="text-[11px] text-white/70 font-bold block uppercase tracking-wider">ပင်မလက်ကျန်ငွေ</span>
              <div className="text-2xl font-black text-white font-mono tracking-tight">
                {formatKs(user.balance)}
              </div>
            </div>
          </div>
          {onRefreshUser && (
            <button
              onClick={() => {
                sounds.playChip();
                onRefreshUser();
              }}
              className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/20 active:scale-95 transition-all"
              title="လက်ကျန်ငွေ ပြန်လည်စစ်ဆေးမည်"
            >
              <RefreshCw className="w-4 h-4 stroke-white stroke-[2.4]" />
            </button>
          )}
        </div>

        {/* Promo Incentive */}
        <div className="p-2.5 rounded-2xl bg-white/10 border border-white/20 flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 stroke-white stroke-[2.4] shrink-0" />
          <p className="text-xs text-white font-bold leading-relaxed">
            ငွေ ၅,၀၀၀ Ks စတင်သွင်းယူပါက ၂,၀၀၀ Ks Bonus အပိုလက်ဆောင် ရရှိပါမည်!
          </p>
        </div>
      </div>

      {/* 4 Main Action Sub-Tabs */}
      <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-black/60 border border-white/15">
        <button
          onClick={() => {
            sounds.playChip();
            setTab('deposit');
          }}
          className={`py-2 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1 ${
            tab === 'deposit'
              ? 'bg-white text-black shadow-lg font-black'
              : 'text-white/80 hover:text-white'
          }`}
        >
          <ArrowDownLeft className="w-3.5 h-3.5 stroke-[2.5]" />
          ငွေသွင်း
        </button>
        <button
          onClick={() => {
            sounds.playChip();
            setTab('withdraw');
          }}
          className={`py-2 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1 ${
            tab === 'withdraw'
              ? 'bg-white text-black shadow-lg font-black'
              : 'text-white/80 hover:text-white'
          }`}
        >
          <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
          ငွေထုတ်
        </button>
        <button
          onClick={() => {
            sounds.playChip();
            setTab('history');
          }}
          className={`py-2 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1 ${
            tab === 'history'
              ? 'bg-white text-black shadow-lg font-black'
              : 'text-white/80 hover:text-white'
          }`}
        >
          <History className="w-3.5 h-3.5 stroke-[2.5]" />
          မှတ်တမ်း
        </button>
        <button
          onClick={() => {
            sounds.playChip();
            setTab('transfer');
          }}
          className={`py-2 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1 ${
            tab === 'transfer'
              ? 'bg-white text-black shadow-lg font-black'
              : 'text-white/80 hover:text-white'
          }`}
        >
          <Coins className="w-3.5 h-3.5 stroke-[2.5]" />
          မိတ်ဆက်ခ
        </button>
      </div>

      {/* Tab 1: Deposit */}
      {tab === 'deposit' && (
        <form onSubmit={handleDepositSubmit} className="flex flex-col gap-3.5">
          {/* Method Selection */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                sounds.playChip();
                setMethod('kpay');
              }}
              className={`p-3 rounded-2xl border transition-all flex items-center justify-center gap-2 ${
                method === 'kpay'
                  ? 'bg-white/20 border-white text-white font-black shadow-md'
                  : 'dark-glass-card border-white/10 text-white/70'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
              <span className="font-bold text-xs">KBZ Pay (KPay)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sounds.playChip();
                setMethod('wave');
              }}
              className={`p-3 rounded-2xl border transition-all flex items-center justify-center gap-2 ${
                method === 'wave'
                  ? 'bg-white/20 border-white text-white font-black shadow-md'
                  : 'dark-glass-card border-white/10 text-white/70'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <span className="font-bold text-xs">WavePay</span>
            </button>
          </div>

          {/* Official Receiver Card */}
          <div className="p-3.5 rounded-2xl dark-glass-card border border-white/20 flex flex-col gap-2">
            <span className="text-[11px] text-white/70 font-bold uppercase tracking-wider">
              တရားဝင်ငွေလက်ခံအကောင့်
            </span>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-black text-white font-mono tracking-wide">
                  {currentPayPhone}
                </div>
                <div className="text-xs font-bold text-white/90">
                  အမည်: {currentPayName}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyPhone}
                className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white text-xs font-bold flex items-center gap-1 active:scale-95 transition-all"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-white" />
                    <span>ကူးပြီး</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 stroke-white" />
                    <span>ကူးယူမည်</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Amount Presets & Custom Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-white">သွင်းမည့်ပမာဏ (Ks)</label>
            <input
              type="number"
              min={minDepositRequired}
              step={100}
              value={depositAmount || ''}
              onChange={(e) => setDepositAmount(Number(e.target.value))}
              placeholder={`အနည်းဆုံး ${minDepositRequired} Ks`}
              className="w-full px-3.5 py-3 rounded-2xl bg-black/60 border border-white/20 text-white font-mono font-bold text-base focus:border-white focus:outline-none"
              required
            />
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {[1000, 5000, 10000, 50000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    sounds.playChip();
                    setDepositAmount(amt);
                  }}
                  className={`py-1.5 rounded-xl border text-xs font-mono font-bold transition-all ${
                    depositAmount === amt
                      ? 'bg-white text-black border-white'
                      : 'bg-white/5 border-white/15 text-white hover:bg-white/15'
                  }`}
                >
                  +{amt >= 1000 ? `${amt / 1000}K` : amt}
                </button>
              ))}
            </div>
          </div>

          {/* Receipt Screenshot Upload */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-white flex items-center justify-between">
              <span>ငွေလွှဲပြေစာ (Voucher Screenshot)</span>
              {compressing && <span className="text-[11px] text-white/70">ပုံချုံ့နေသည်...</span>}
            </label>
            <label className="p-4 rounded-2xl border-2 border-dashed border-white/25 hover:border-white/50 bg-black/40 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                disabled={compressing}
              />
              {receiptBase64 ? (
                <div className="flex flex-col items-center gap-2 w-full">
                  <div className="relative w-28 h-28 rounded-xl overflow-hidden border border-white/30">
                    <Image
                      src={receiptBase64}
                      alt="Receipt Voucher"
                      width={112}
                      height={112}
                      unoptimized
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="text-xs font-bold text-white flex items-center gap-1">
                    <Check className="w-4 h-4 stroke-white" /> ပြေစာတင်ပြီးပါပြီ (ပြန်ပြောင်းရန် နှိပ်ပါ)
                  </span>
                </div>
              ) : (
                <>
                  <Upload className="w-6 h-6 stroke-white stroke-[2]" />
                  <span className="text-xs font-bold text-white">ပြေစာ ဓာတ်ပုံရွေးချယ်ပါ</span>
                  <span className="text-[10px] text-white/60">ဖုန်းဓာတ်ပုံအား အလိုအလျောက်ချုံ့ပြီး တင်ပေးပါမည်</span>
                </>
              )}
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || compressing || !receiptBase64}
            className="w-full py-3.5 rounded-2xl bg-white text-black font-black text-sm tracking-wide shadow-xl hover:bg-white/95 active:scale-95 transition-all disabled:opacity-40"
          >
            {loading ? 'တင်ပြနေသည်...' : 'ငွေသွင်းလွှာ တင်ပြမည်'}
          </button>
        </form>
      )}

      {/* Tab 2: Withdraw */}
      {tab === 'withdraw' && (
        <form onSubmit={handleWithdrawSubmit} className="flex flex-col gap-3.5">
          {/* Anti-Hedging Warning if flagged */}
          {isHedgingBlocked && (
            <div className="p-3.5 rounded-2xl bg-white/10 border border-white/30 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-white font-black text-xs">
                <AlertCircle className="w-4 h-4 stroke-white" />
                <span>ငွေထုတ်ယာယီပိတ်ထားပါသည် (Hedging စည်းကမ်းဖောက်ဖျက်မှု)</span>
              </div>
              <p className="text-xs text-white/80 font-medium">
                အကြီးရောအသေးပါ နှစ်ဖက်လုံးလောင်းခဲ့သဖြင့် စည်းကမ်းအရ သန့်ရှင်းသော လောင်းကြေးလည်ပတ်ငွေ{' '}
                <strong className="text-white font-mono">{formatKs(user.cleanTurnoverRequired || 0)}</strong>{' '}
                ပြန်လည်ကစားပြီးမှ ထုတ်ယူနိုင်ပါမည်။
              </p>
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

          {/* Bound Bank Account Section */}
          <div className="p-3.5 rounded-2xl dark-glass-card border border-white/20 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-white/70 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 stroke-white" /> ချိတ်ဆက်ထားသော ဘဏ်အကောင့်
              </span>
              {user.boundBank && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/15 border border-white/20 font-bold text-white flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5 stroke-white" /> ချိတ်ဆက်ပြီး (ပြင်မရပါ)
                </span>
              )}
            </div>

            {user.boundBank ? (
              <div className="flex flex-col gap-0.5 pt-1">
                <div className="text-xs font-bold text-white uppercase">
                  {user.boundBank.method === 'kpay' ? 'KBZ Pay (KPay)' : 'WavePay'}
                </div>
                <div className="text-base font-black text-white font-mono">
                  {user.boundBank.phone}
                </div>
                <div className="text-xs font-bold text-white/80">
                  အမည်: {user.boundBank.accountName}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 pt-1">
                <p className="text-xs text-white/80 font-medium">
                  ဘဏ်တစ်ခုတည်းသာ ချိတ်ဆက်ခွင့်ရှိပြီး ချိတ်ဆက်ပြီးပါက လုံခြုံရေးအရ ပြောင်းလဲခွင့်မရှိပါ။
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMethod('kpay')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      method === 'kpay' ? 'bg-white text-black border-white' : 'bg-black/40 text-white/70 border-white/15'
                    }`}
                  >
                    KPay
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod('wave')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      method === 'wave' ? 'bg-white text-black border-white' : 'bg-black/40 text-white/70 border-white/15'
                    }`}
                  >
                    WavePay
                  </button>
                </div>

                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="ဖုန်းနံပါတ် (09xxxxxxxxx)"
                  className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-white font-mono text-xs focus:border-white focus:outline-none"
                />

                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="အကောင့်ပိုင်ရှင် အမည်အပြည့်အစုံ"
                  className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/20 text-white text-xs focus:border-white focus:outline-none"
                />

                {onBindBank && (
                  <button
                    type="button"
                    onClick={handleBindBankSubmit}
                    disabled={bindingBank || !phone || !accountName}
                    className="w-full py-2.5 rounded-xl bg-white/20 hover:bg-white/30 border border-white/30 text-white font-bold text-xs active:scale-95 transition-all"
                  >
                    {bindingBank ? 'ချိတ်ဆက်နေသည်...' : 'ဘဏ်အကောင့် သီးသန့်ချိတ်ဆက်မည်'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Amount Input */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-white">
              <span>ထုတ်ယူမည့်ပမာဏ (Ks)</span>
              <span>လက်ကျန်: {formatKs(user.balance)}</span>
            </div>
            <input
              type="number"
              min={settings.MINIMUM_WITHDRAW || 5000}
              step={100}
              value={withdrawAmount || ''}
              onChange={(e) => setWithdrawAmount(Number(e.target.value))}
              placeholder={`အနည်းဆုံး ${settings.MINIMUM_WITHDRAW || 5000} Ks`}
              className="w-full px-3.5 py-3 rounded-2xl bg-black/60 border border-white/20 text-white font-mono font-bold text-base focus:border-white focus:outline-none"
              required
            />
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {[5000, 10000, 50000, 100000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    sounds.playChip();
                    setWithdrawAmount(amt);
                  }}
                  className={`py-1.5 rounded-xl border text-xs font-mono font-bold transition-all ${
                    withdrawAmount === amt
                      ? 'bg-white text-black border-white'
                      : 'bg-white/5 border-white/15 text-white hover:bg-white/15'
                  }`}
                >
                  +{amt >= 1000 ? `${amt / 1000}K` : amt}
                </button>
              ))}
            </div>
          </div>

          {/* Rules Checklist */}
          <div className="p-3 rounded-2xl bg-black/40 border border-white/10 flex flex-col gap-1.5 text-xs">
            <div className="flex items-center justify-between font-bold text-white/80">
              <span>ပထမဆုံး ငွေသွင်းပြည့်မီမှု ({formatKs(requiredDepositForFirstWithdraw)}):</span>
              <span className={firstWithdrawEligible ? 'text-white font-black' : 'text-white/60'}>
                {firstWithdrawEligible ? 'ပြည့်မီပြီး' : `${formatKs(user.totalSuccessfulDeposit || 0)}`}
              </span>
            </div>
            <div className="flex items-center justify-between font-bold text-white/80">
              <span>လောင်းကြေးလည်ပတ်ငွေ (၅၀%):</span>
              <span className={subsequentWithdrawEligible ? 'text-white font-black' : 'text-white/60'}>
                {subsequentWithdrawEligible
                  ? 'ပြည့်မီပြီး'
                  : `${formatKs(user.wagerSinceLastWithdrawal || 0)} / ${formatKs(requiredWagerForWithdrawal)}`}
              </span>
            </div>
          </div>

          {/* Submit Withdrawal */}
          <button
            type="submit"
            disabled={loading || isHedgingBlocked || user.balance < (settings.MINIMUM_WITHDRAW || 5000)}
            className="w-full py-3.5 rounded-2xl bg-white text-black font-black text-sm tracking-wide shadow-xl hover:bg-white/95 active:scale-95 transition-all disabled:opacity-40"
          >
            {loading ? 'တင်ပြနေသည်...' : 'ငွေထုတ်ယူမည်'}
          </button>
        </form>
      )}

      {/* Tab 3: Withdrawal History & Admin Rejection Notes */}
      {tab === 'history' && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black text-white">ငွေထုတ်တောင်းဆိုမှု မှတ်တမ်း</span>
            <span className="text-[10px] text-white/60 font-medium font-mono">{userWithdrawals.length} ခု</span>
          </div>

          {userWithdrawals.length === 0 ? (
            <div className="p-12 text-center text-xs text-white/60 flex flex-col items-center justify-center gap-2.5 rounded-3xl dark-glass-card border border-white/10">
              <Clock className="w-8 h-8 stroke-white stroke-[2]" />
              <span className="font-bold text-white/80">ငွေထုတ်တောင်းဆိုထားသော မှတ်တမ်း မရှိသေးပါ။</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {userWithdrawals.map((w, idx) => {
                const isApproved = w.status === 'approved';
                const isDeclined = w.status === 'declined';
                const isPending = w.status === 'pending';

                return (
                  <div
                    key={w.withdrawalId || `with-${idx}`}
                    className="p-4 rounded-3xl dark-glass-card border border-white/15 flex flex-col gap-2"
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
                        <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-black text-[10px] flex items-center gap-1">
                          <Check className="w-3 h-3 stroke-[2.5]" />
                          အတည်ပြု ငွေလွှဲပြီး
                        </span>
                      )}
                      {isPending && (
                        <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-300 font-black text-[10px] flex items-center gap-1">
                          <Clock className="w-3 h-3 stroke-[2.5]" />
                          Admin စစ်ဆေးဆဲ
                        </span>
                      )}
                      {isDeclined && (
                        <span className="px-2.5 py-0.5 rounded-md bg-red-500/20 border border-red-400/40 text-red-300 font-black text-[10px] flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 stroke-[2.5]" />
                          ပယ်ချခံရပါသည်
                        </span>
                      )}
                    </div>

                    {/* Admin Rejection Reason Note */}
                    {isDeclined && (
                      <div className="p-3 rounded-2xl bg-red-950/40 border border-red-500/30 text-xs flex flex-col gap-1 mt-0.5">
                        <span className="text-[10px] text-red-300 font-black">
                          Admin မှ ပယ်ချရသည့် အကြောင်းအရင်း (Note):
                        </span>
                        <p className="text-[11px] text-white font-bold leading-relaxed">
                          {w.rejectionReason || 'အကြောင်းပြချက် မဖော်ပြထားပါ'}
                        </p>
                        <span className="text-[9px] text-white/60 font-medium">
                          ငွေပမာဏ {formatKs(w.amount)} ကို သင့် Wallet ပင်မလက်ကျန်ထဲသို့ ပြန်လည် ထည့်သွင်းပေးပြီးဖြစ်ပါသည်။
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

      {/* Tab 4: Transfer Referral */}
      {tab === 'transfer' && (
        <div className="flex flex-col gap-3.5">
          <div className="p-4 rounded-3xl dark-glass-card border border-white/20 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-2xl bg-white/10 border border-white/20 text-white">
                <Coins className="w-5 h-5 stroke-white stroke-[2.4]" />
              </div>
              <div>
                <span className="text-[11px] text-white/70 font-bold uppercase tracking-wider">
                  မိတ်ဆက်ခ ကော်မရှင်လက်ကျန်
                </span>
                <div className="text-2xl font-black text-white font-mono">
                  {formatKs(user.referralBalance || 0)}
                </div>
              </div>
            </div>

            <p className="text-xs text-white/80 font-medium leading-relaxed">
              သင့်မိတ်ဆက်ခ ကော်မရှင်ကို ပင်မလောင်းကြေးလက်ကျန်ငွေအဖြစ် ချက်ချင်းပြောင်းလဲ၍ ဆော့ကစားနိုင်ပါသည် သို့မဟုတ် ငွေထုတ်ယူနိုင်ပါသည်။
            </p>

            <button
              onClick={handleTransferCommission}
              disabled={transferring || (user.referralBalance || 0) < (settings.MINIMUM_TRANSFER_AMOUNT || 1000)}
              className="w-full py-3 rounded-2xl bg-white text-black font-black text-xs shadow-lg active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {transferring ? (
                'ပြောင်းနေသည်...'
              ) : (
                <>
                  <span>ပင်မလက်ကျန်သို့ ပြောင်းမည်</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

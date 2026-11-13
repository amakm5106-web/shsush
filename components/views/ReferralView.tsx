'use client';

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Users,
  Share2,
  Copy,
  Check,
  Gift,
  Coins,
  ShieldCheck,
  TrendingUp,
  Award,
  Clock,
  QrCode,
  X,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { GameSettings, UserProfile, ReferralMember } from '@/lib/types';
import { formatKs } from '@/lib/constants';
import { sounds } from '@/lib/audio';

interface ReferralViewProps {
  user: UserProfile;
  settings: GameSettings;
  referralMembers: ReferralMember[];
  onTransferReferral: () => Promise<boolean>;
  onClaimMilestone: (milestoneId: 'tier_2_deposited' | 'tier_5_deposited' | 'tier_10_50k') => Promise<boolean>;
  onGoToWallet?: () => void;
}

export function ReferralView({
  user,
  settings,
  referralMembers,
  onTransferReferral,
  onClaimMilestone,
}: ReferralViewProps) {
  const [filter, setFilter] = useState<'all' | 'deposited' | 'registered'>('all');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [transferring, setTransferring] = useState<boolean>(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [transferSuccessMsg, setTransferSuccessMsg] = useState<string | null>(null);

  // QR Code Modal State
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const origin = React.useSyncExternalStore(
    () => () => {},
    () => (typeof window !== 'undefined' ? window.location.origin : ''),
    () => ''
  );

  const referralLink = origin ? `${origin}?ref=${user.uid}` : `https://t.me/XinAiiiDiceBot?start=${user.uid}`;
  const shareText = `X-SITE ကာစီနို & စလော့တွင် အကောင့်ဖွင့်ပြီး ချက်ချင်းကစားပါ!\nဖိတ်ခေါ်လင့်ခ်: ${referralLink}`;
  const shareTelegramUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;

  // Generate QR Code dynamically
  useEffect(() => {
    if (!referralLink) return;
    QRCode.toDataURL(referralLink, {
      width: 320,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
      .then((url) => {
        setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('Failed to generate QR code:', err);
      });
  }, [referralLink]);

  const handleCopyLink = () => {
    sounds.playChip();
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const handleCopyCode = () => {
    sounds.playChip();
    navigator.clipboard.writeText(user.uid);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2200);
  };

  const handleTransfer = async () => {
    if (user.referralBalance < settings.MINIMUM_TRANSFER_AMOUNT) {
      alert(`ပြောင်းရန် အနည်းဆုံး ${formatKs(settings.MINIMUM_TRANSFER_AMOUNT)} လိုအပ်ပါသည်။`);
      return;
    }
    setTransferring(true);
    setTransferSuccessMsg(null);
    try {
      const ok = await onTransferReferral();
      if (ok) {
        sounds.playWin();
        setTransferSuccessMsg('မိတ်ဆက်ခကို လက်ကျန်ငွေထဲသို့ ပြောင်းပြီးပါပြီ။');
        setTimeout(() => setTransferSuccessMsg(null), 5000);
      }
    } finally {
      setTransferring(false);
    }
  };

  const handleClaim = async (milestoneId: 'tier_2_deposited' | 'tier_5_deposited' | 'tier_10_50k') => {
    sounds.playChip();
    setClaiming(milestoneId);
    try {
      const ok = await onClaimMilestone(milestoneId);
      if (ok) {
        sounds.playWin();
      }
    } finally {
      setClaiming(null);
    }
  };

  // Milestone & Metric Calculations (with fallback to referralMembers data if user object is temporarily throttled)
  const calculatedDepositedCount = referralMembers.filter((m) => m.hasSuccessfulDeposit).length;
  const calculatedTeamDeposit = referralMembers.reduce((sum, m) => sum + (m.totalSuccessfulDeposit || 0), 0);
  const depositedCount = Math.max(user.depositedReferralsCount || 0, calculatedDepositedCount);
  const totalTeamDeposit = Math.max(user.referralTotalDeposits || 0, calculatedTeamDeposit);
  const totalInvitedCount = Math.max(user.referralsCount || 0, referralMembers.length);
  const claimedList = user.claimedMilestones || [];

  const tier1Claimed = claimedList.includes('tier_2_deposited');
  const tier1Eligible = depositedCount >= 2 && !tier1Claimed;
  const tier1Progress = Math.min(100, Math.round((depositedCount / 2) * 100));

  const tier2Claimed = claimedList.includes('tier_5_deposited');
  const tier2Eligible = depositedCount >= 5 && !tier2Claimed;
  const tier2Progress = Math.min(100, Math.round((depositedCount / 5) * 100));

  const tier3Claimed = claimedList.includes('tier_10_50k');
  const tier3Eligible = totalTeamDeposit >= 50000 && !tier3Claimed;
  const tier3Progress = Math.min(100, Math.round((totalTeamDeposit / 50000) * 100));

  // Member filtering
  const depositedMembers = referralMembers.filter((m) => m.hasSuccessfulDeposit);
  const registeredOnlyMembers = referralMembers.filter((m) => !m.hasSuccessfulDeposit);

  const filteredMembers = referralMembers.filter((m) => {
    if (filter === 'deposited') return m.hasSuccessfulDeposit;
    if (filter === 'registered') return !m.hasSuccessfulDeposit;
    return true;
  });

  return (
    <div className="premium-referral-view w-full flex flex-col gap-4 pb-12 animate-fadeIn">
      {/* 1. REFERRAL HEADER */}
      <div className="premium-referral-header flex items-center justify-between gap-3 p-4 sm:p-5 rounded-3xl border border-black/10 bg-white/75 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-900">
            <Share2 className="h-5 w-5" />
          </div>
          <h1 className="text-base sm:text-lg font-black text-zinc-900 tracking-tight">ဖိတ်ခေါ်မှု</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3 py-2">
          <span className="text-[11px] font-semibold text-zinc-500">ကော်မရှင်</span>
          <span className="text-sm font-black text-zinc-900 font-mono">{Math.round(settings.COMMISSION_RATE * 100)}%</span>
        </div>
      </div>

      {/* 2. AFFILIATE HERO CARD (Instant Link, QR Code & Share) */}
      <div className="premium-referral-hero p-4 sm:p-6 rounded-3xl border border-black/10 bg-white/90 shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-zinc-700" />
              <span className="text-xs sm:text-sm font-black text-zinc-900">ဖိတ်ခေါ်လင့်ခ်</span>
            </div>
            <span className="text-[11px] text-zinc-500">
              ကုဒ်: <span className="font-mono text-zinc-800 font-black">{user.uid.slice(0, 8)}...</span>
            </span>
          </div>

          {/* Link Box with Copy Button */}
          <div className="flex items-center gap-2 p-1.5 sm:p-2 rounded-2xl bg-black/80 border border-white/15 shadow-inner">
            <input
              type="text"
              readOnly
              value={referralLink}
              aria-label="ဖိတ်ခေါ်လင့်ခ်"
              className="bg-transparent flex-1 px-3 text-xs sm:text-sm font-mono text-zinc-800 focus:outline-none select-all truncate"
            />
            <button
              onClick={handleCopyLink}
              className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-black text-xs transition-all active:scale-95 shadow-md flex items-center gap-1.5 shrink-0"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Copy className="w-3.5 h-3.5 stroke-[2.5]" />}
              <span>{copiedLink ? 'ကူးပြီး' : 'ကူးရန်'}</span>
            </button>
          </div>

          {/* Action Buttons: QR Code View & Telegram Share */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
            <button
              onClick={() => {
                sounds.playChip();
                setIsQrModalOpen(true);
              }}
              className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <QrCode className="w-4 h-4 text-amber-400" />
              <span>QR ပြရန်</span>
            </button>

            <button
              onClick={handleCopyCode}
              className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-cyan-400" />}
              <span>{copiedCode ? 'ကုဒ် ကူးပြီး' : 'ကုဒ်ကူးရန်'}</span>
            </button>

            <a
              href={shareTelegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => sounds.playChip()}
              className="py-2.5 px-3 rounded-xl bg-[#2AABEE]/20 hover:bg-[#2AABEE]/30 border border-[#2AABEE]/40 text-[#2AABEE] hover:text-white font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md"
            >
              <Share2 className="w-4 h-4" />
              <span>မျှဝေရန်</span>
            </a>
          </div>
        </div>
      </div>

      {/* 3. COMPACT REFERRAL SUMMARY */}
      <details className="premium-referral-section">
        <summary className="premium-referral-section__summary">
          <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-zinc-800">
            <Users className="h-4 w-4 shrink-0 text-zinc-600" />
            <span>ဖိတ်ခေါ်သူ <strong className="text-zinc-950">{totalInvitedCount}</strong></span>
            <span className="text-zinc-400">·</span>
            <span>ငွေသွင်းပြီး <strong className="text-zinc-950">{depositedCount}</strong></span>
          </div>
          <ChevronRight className="premium-referral-section__chevron h-4 w-4 shrink-0 text-zinc-500" />
        </summary>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 px-3 pb-3">
        {/* Stat 1: Total Invited */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-zinc-950/70 border border-white/10 flex flex-col justify-between backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-zinc-400">စုစုပေါင်း ဖိတ်ခေါ်သူ</span>
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Users className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-xl sm:text-2xl font-black text-white font-mono tabular-nums">
              {totalInvitedCount}
            </span>
            <span className="text-xs text-zinc-400 ml-1 font-bold">ယောက်</span>
          </div>
        </div>

        {/* Stat 2: Verified Active Members */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-zinc-950/70 border border-white/10 flex flex-col justify-between backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-zinc-400">ငွေသွင်း မန်ဘာအစစ်</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-xl sm:text-2xl font-black text-emerald-400 font-mono tabular-nums">
              {depositedCount}
            </span>
            <span className="text-xs text-zinc-400 ml-1 font-bold">ယောက်</span>
          </div>
        </div>

        {/* Stat 3: Team Total Turnover */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-zinc-950/70 border border-white/10 flex flex-col justify-between backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-zinc-400">မန်ဘာများ သွင်းငွေ</span>
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <TrendingUp className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-base sm:text-xl font-black text-white font-mono tabular-nums tracking-tight">
              {formatKs(totalTeamDeposit)}
            </span>
          </div>
        </div>

        {/* Stat 4: Earned Commission Balance */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-zinc-950/70 border border-amber-500/30 flex flex-col justify-between backdrop-blur-xl shadow-lg shadow-amber-500/5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-300">ရရှိထားသော မိတ်ဆက်ခ</span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Coins className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-base sm:text-xl font-black text-amber-400 font-mono tabular-nums tracking-tight">
              {formatKs(user.referralBalance)}
            </span>
          </div>
        </div>
        </div>
      </details>

      {/* 4. INSTANT COMMISSION TRANSFER TO MAIN BALANCE */}
      {user.referralBalance >= settings.MINIMUM_TRANSFER_AMOUNT ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-3xl border border-black/10 bg-white/90 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-100 text-zinc-900 flex items-center justify-center font-black shrink-0">
              <Coins className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-zinc-500">မိတ်ဆက်ခ လက်ကျန်</span>
              <span className="text-base font-black text-zinc-950 font-mono">{formatKs(user.referralBalance)}</span>
            </div>
          </div>

          <button
            onClick={handleTransfer}
            disabled={transferring}
            className="px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-black text-xs transition-all active:scale-95 shadow-sm flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
          >
            {transferring ? (
              <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
            )}
            <span>{transferring ? 'ပြောင်းနေသည်…' : 'ပြောင်းရန်'}</span>
          </button>
        </div>
      ) : (
        <div className="p-3 rounded-2xl bg-zinc-950/50 border border-white/5 flex items-center justify-between gap-2 text-zinc-400 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-zinc-500 shrink-0" />
            <span className="text-[11px]">
              ပြောင်းရန် အနည်းဆုံး <strong className="text-zinc-900 font-mono">{formatKs(settings.MINIMUM_TRANSFER_AMOUNT)}</strong> လိုအပ်ပါသည်
            </span>
          </div>
          <span className="text-[10px] font-mono font-bold text-amber-400/80 shrink-0">
            လက်ကျန် {formatKs(user.referralBalance)}
          </span>
        </div>
      )}

      {/* Transfer Success Notification */}
      {transferSuccessMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{transferSuccessMsg}</span>
        </div>
      )}

      {/* 5. OPTIONAL REWARD DETAILS */}
      <details className="premium-referral-section">
        <summary className="premium-referral-section__summary">
          <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-zinc-800">
            <Award className="h-4 w-4 shrink-0 text-zinc-600" />
            <span>ဆုကြေးများ</span>
            <span className="text-xs font-semibold text-zinc-500">· +9,000 Ks</span>
          </div>
          <ChevronRight className="premium-referral-section__chevron h-4 w-4 shrink-0 text-zinc-500" />
        </summary>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 px-4 pb-4">
          {/* Milestone Tier 1 */}
          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 flex flex-col justify-between gap-3 relative overflow-hidden">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs font-black text-white block">အဆင့် ၁: မန်ဘာ ၂ ယောက်</span>
                <span className="text-[11px] text-zinc-400">ငွေသွင်းမန်ဘာ ၂ ယောက်ပြည့်ပါက</span>
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-amber-400/10 text-amber-400 border border-amber-400/20 text-xs font-black font-mono shrink-0">
                +2,000 Ks
              </span>
            </div>

            {/* Progress Bar */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[10px] text-zinc-400 font-bold">
                <span>တိုးတက်မှု</span>
                <span className="font-mono text-white">{depositedCount}/2 ယောက်</span>
              </div>
              <div className="w-full bg-black/80 rounded-full h-2 overflow-hidden border border-white/10 p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500"
                  style={{ width: `${tier1Progress}%` }}
                />
              </div>
            </div>

            {/* Action State */}
            {tier1Claimed ? (
              <div className="py-2 px-3 rounded-xl bg-white/5 border border-white/10 text-zinc-400 text-xs font-black flex items-center justify-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                <span>ရယူပြီးပါပြီ</span>
              </div>
            ) : (
              <button
                disabled={!tier1Eligible || claiming === 'tier_2_deposited'}
                onClick={() => handleClaim('tier_2_deposited')}
                className={`w-full py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                  tier1Eligible
                    ? 'bg-amber-400 hover:bg-amber-300 text-black shadow-lg shadow-amber-400/20 active:scale-95'
                    : 'bg-white/5 text-zinc-500 border border-white/5 cursor-not-allowed'
                }`}
              >
                <Gift className="w-3.5 h-3.5" />
                <span>{claiming === 'tier_2_deposited' ? 'ရယူနေပါသည်...' : 'ဆုကြေးရယူမည်'}</span>
              </button>
            )}
          </div>

          {/* Milestone Tier 2 */}
          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 flex flex-col justify-between gap-3 relative overflow-hidden">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs font-black text-white block">အဆင့် ၂: မန်ဘာ ၅ ယောက်</span>
                <span className="text-[11px] text-zinc-400">ငွေသွင်းမန်ဘာ ၅ ယောက်ပြည့်ပါက</span>
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-amber-400/10 text-amber-400 border border-amber-400/20 text-xs font-black font-mono shrink-0">
                +2,000 Ks
              </span>
            </div>

            {/* Progress Bar */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[10px] text-zinc-400 font-bold">
                <span>တိုးတက်မှု</span>
                <span className="font-mono text-white">{depositedCount}/5 ယောက်</span>
              </div>
              <div className="w-full bg-black/80 rounded-full h-2 overflow-hidden border border-white/10 p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500"
                  style={{ width: `${tier2Progress}%` }}
                />
              </div>
            </div>

            {/* Action State */}
            {tier2Claimed ? (
              <div className="py-2 px-3 rounded-xl bg-white/5 border border-white/10 text-zinc-400 text-xs font-black flex items-center justify-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                <span>ရယူပြီးပါပြီ</span>
              </div>
            ) : (
              <button
                disabled={!tier2Eligible || claiming === 'tier_5_deposited'}
                onClick={() => handleClaim('tier_5_deposited')}
                className={`w-full py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                  tier2Eligible
                    ? 'bg-amber-400 hover:bg-amber-300 text-black shadow-lg shadow-amber-400/20 active:scale-95'
                    : 'bg-white/5 text-zinc-500 border border-white/5 cursor-not-allowed'
                }`}
              >
                <Gift className="w-3.5 h-3.5" />
                <span>{claiming === 'tier_5_deposited' ? 'ရယူနေပါသည်...' : 'ဆုကြေးရယူမည်'}</span>
              </button>
            )}
          </div>

          {/* Milestone Tier 3 */}
          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 flex flex-col justify-between gap-3 relative overflow-hidden">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs font-black text-white block">အဆင့် ၃: စုစုပေါင်း ၅၀,၀၀၀ Ks</span>
                <span className="text-[11px] text-zinc-400">မန်ဘာများ သွင်းငွေ ၅၀,၀၀၀ Ks ပြည့်ပါက</span>
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-amber-400/10 text-amber-400 border border-amber-400/20 text-xs font-black font-mono shrink-0">
                +5,000 Ks
              </span>
            </div>

            {/* Progress Bar */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[10px] text-zinc-400 font-bold">
                <span>တိုးတက်မှု</span>
                <span className="font-mono text-white">{formatKs(totalTeamDeposit)}/50,000 Ks</span>
              </div>
              <div className="w-full bg-black/80 rounded-full h-2 overflow-hidden border border-white/10 p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500"
                  style={{ width: `${tier3Progress}%` }}
                />
              </div>
            </div>

            {/* Action State */}
            {tier3Claimed ? (
              <div className="py-2 px-3 rounded-xl bg-white/5 border border-white/10 text-zinc-400 text-xs font-black flex items-center justify-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                <span>ရယူပြီးပါပြီ</span>
              </div>
            ) : (
              <button
                disabled={!tier3Eligible || claiming === 'tier_10_50k'}
                onClick={() => handleClaim('tier_10_50k')}
                className={`w-full py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                  tier3Eligible
                    ? 'bg-amber-400 hover:bg-amber-300 text-black shadow-lg shadow-amber-400/20 active:scale-95'
                    : 'bg-white/5 text-zinc-500 border border-white/5 cursor-not-allowed'
                }`}
              >
                <Gift className="w-3.5 h-3.5" />
                <span>{claiming === 'tier_10_50k' ? 'ရယူနေပါသည်...' : 'ဆုကြေးရယူမည်'}</span>
              </button>
            )}
          </div>
        </div>
      </details>

      {/* 6. DETAILED REFERRED MEMBERS FEED */}
      <details className="premium-referral-section">
        <summary className="premium-referral-section__summary">
          <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-zinc-800">
            <Users className="h-4 w-4 shrink-0 text-zinc-600" />
            <span>ဖိတ်ခေါ်သူစာရင်း</span>
          </div>
          <ChevronRight className="premium-referral-section__chevron h-4 w-4 shrink-0 text-zinc-500" />
        </summary>
      <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-2xl flex flex-col gap-3">
        {/* Header & Segmented Filter Tabs */}
        <div className="flex justify-end gap-2.5 pb-2 border-b border-white/10">
          <div className="flex items-center p-1 rounded-xl bg-zinc-900 border border-white/10 self-start sm:self-auto">
            <button
              onClick={() => {
                sounds.playChip();
                setFilter('all');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                filter === 'all' ? 'bg-amber-400 text-black shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              အားလုံး ({referralMembers.length})
            </button>
            <button
              onClick={() => {
                sounds.playChip();
                setFilter('deposited');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                filter === 'deposited' ? 'bg-amber-400 text-black shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              ငွေသွင်းပြီး ({depositedMembers.length})
            </button>
            <button
              onClick={() => {
                sounds.playChip();
                setFilter('registered');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                filter === 'registered' ? 'bg-amber-400 text-black shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              မသွင်းရသေး ({registeredOnlyMembers.length})
            </button>
          </div>
        </div>

        {/* Members Cards Feed */}
        <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1">
          {filteredMembers.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500 flex flex-col items-center justify-center gap-2.5">
              <Clock className="w-8 h-8 text-zinc-600 stroke-[1.5]" />
              <p className="font-medium">
                {filter === 'deposited'
                  ? 'ငွေသွင်းသူ မရှိသေးပါ။'
                  : filter === 'registered'
                  ? 'မသွင်းရသေးသူ မရှိပါ။'
                  : 'ဖိတ်ခေါ်သူ မရှိသေးပါ။'}
              </p>
              <button
                onClick={handleCopyLink}
                className="mt-1 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs border border-white/10 active:scale-95"
              >
                လင့်ခ်ကူးရန်
              </button>
            </div>
          ) : (
            filteredMembers.map((m, idx) => {
              const commissionEarned = m.totalSuccessfulDeposit
                ? Math.round(m.totalSuccessfulDeposit * settings.COMMISSION_RATE)
                : 0;

              return (
                <div
                  key={m.uid || idx}
                  className="p-3 sm:p-3.5 rounded-2xl bg-zinc-900/60 hover:bg-zinc-900/90 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all"
                >
                  {/* Left: Avatar + Identity */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/10 flex items-center justify-center text-amber-400 font-black text-xs shrink-0">
                      {(m.fullName || 'P')[0]?.toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white text-xs sm:text-sm">
                          {m.fullName || `အသုံးပြုသူ ${m.uid.slice(0, 6)}`}
                        </span>
                        {m.hasSuccessfulDeposit ? (
                          <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold flex items-center gap-1">
                            <ShieldCheck className="w-2.5 h-2.5" />
                            ငွေသွင်းပြီး
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-md bg-white/5 text-zinc-400 border border-white/10 text-[10px] font-medium">
                            အကောင့်ဖွင့်ရုံ
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono mt-0.5">
                        ကုဒ် · {m.uid.slice(0, 8)}...
                      </span>
                    </div>
                  </div>

                  {/* Right: Deposit & Commission Breakdown */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 self-stretch sm:self-auto pt-1 sm:pt-0 border-t border-white/5 sm:border-t-0">
                    <div className="flex flex-col sm:text-right">
                      <span className="text-[10px] text-zinc-400 font-bold">သွင်းငွေ</span>
                      <span className="text-xs font-mono font-bold text-white tabular-nums">
                        {formatKs(m.totalSuccessfulDeposit || 0)}
                      </span>
                    </div>

                    <div className="flex flex-col text-right">
                      <span className="text-[10px] text-amber-400/80 font-bold">ရရှိကော်မရှင်</span>
                      <span className="text-xs font-mono font-black text-amber-400 tabular-nums">
                        +{formatKs(commissionEarned)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      </details>

      {/* 7. QR CODE MODAL FOR IN-PERSON SCANNING */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-950 border border-white/20 p-5 shadow-2xl flex flex-col items-center gap-4 relative animate-scaleUp">
            {/* Close Button */}
            <button
              onClick={() => {
                sounds.playChip();
                setIsQrModalOpen(false);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>

            {/* Modal Title */}
            <div className="text-center pt-1">
              <div className="w-10 h-10 rounded-2xl bg-amber-400/10 border border-amber-400/30 text-amber-400 flex items-center justify-center mx-auto mb-2">
                <QrCode className="w-5 h-5 stroke-[2.5]" />
              </div>
              <h3 className="text-base font-black text-white">ဖိတ်ခေါ် QR</h3>
            </div>

            {/* QR Image Box */}
            <div className="p-3 bg-white rounded-2xl shadow-xl flex items-center justify-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="ဖိတ်ခေါ် QR"
                  className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-xs text-black/60 font-bold">
                  ပြုလုပ်နေသည်…
                </div>
              )}
            </div>

            {/* Quick Actions in Modal */}
            <div className="w-full flex flex-col gap-2">
              <button
                onClick={handleCopyLink}
                className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md"
              >
                {copiedLink ? <Check className="w-4 h-4 stroke-[3]" /> : <Copy className="w-4 h-4 stroke-[2.5]" />}
                <span>{copiedLink ? 'ကူးပြီးပါပြီ' : 'လင့်ခ်ကူးရန်'}</span>
              </button>

              <button
                onClick={() => setIsQrModalOpen(false)}
                className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-xs font-bold transition-all"
              >
                ပိတ်မည်
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

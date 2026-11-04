'use client';

import React, { useState } from 'react';
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
  Sparkles,
  ArrowRight,
  Clock,
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
  onGoToWallet,
}: ReferralViewProps) {
  const [filter, setFilter] = useState<'all' | 'deposited' | 'registered'>('all');
  const [copied, setCopied] = useState<boolean>(false);
  const [transferring, setTransferring] = useState<boolean>(false);
  const [claiming, setClaiming] = useState<string | null>(null);

  const origin = React.useSyncExternalStore(
    () => () => {},
    () => (typeof window !== 'undefined' ? window.location.origin : ''),
    () => ''
  );

  const referralLink = origin ? `${origin}?ref=${user.uid}` : `https://t.me/XinAiiiDiceBot?start=${user.uid}`;
  const shareText = `Xin Aiii အံစာတုံး ထီ & ကာစီနို Game တွင် အကောင့်ဖွင့်ပြီး ၅,၀၀၀ Ks စတင်သွင်းယူပါက ၂,၀၀၀ Ks Bonus ရယူပါ!\nဖိတ်ခေါ်လင့်ခ်: ${referralLink}`;
  const shareTelegramUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;

  const handleCopy = () => {
    sounds.playChip();
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTransfer = async () => {
    if (user.referralBalance < settings.MINIMUM_TRANSFER_AMOUNT) {
      alert(`မိတ်ဆက်ခ ပြောင်းရန် အနည်းဆုံး ${formatKs(settings.MINIMUM_TRANSFER_AMOUNT)} ပြည့်ရပါမည်။`);
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

  const handleClaim = async (milestoneId: 'tier_2_deposited' | 'tier_5_deposited' | 'tier_10_50k') => {
    setClaiming(milestoneId);
    try {
      await onClaimMilestone(milestoneId);
    } finally {
      setClaiming(null);
    }
  };

  // Milestone Calculations
  const depositedCount = user.depositedReferralsCount || 0;
  const totalTeamDeposit = user.referralTotalDeposits || 0;
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

  const filteredMembers = referralMembers.filter((m) => {
    if (filter === 'deposited') return m.hasSuccessfulDeposit;
    if (filter === 'registered') return !m.hasSuccessfulDeposit;
    return true;
  });

  return (
    <div className="w-full max-w-md px-3.5 flex flex-col gap-3.5 pb-8 animate-fadeIn">
      {/* Page Title */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-2xl bg-white/10 border border-white/20 text-white">
            <Users className="w-5 h-5 stroke-white stroke-[2.4]" />
          </div>
          <div>
            <h2 className="text-base font-black text-white tracking-tight">ဖိတ်ခေါ်မှု & မန်ဘာဆုကြေး</h2>
            <p className="text-[11px] text-white/70 font-medium">Referral Program & Commission</p>
          </div>
        </div>

        <span className="text-[11px] font-black px-2.5 py-1 rounded-xl bg-white/10 border border-white/20 text-white font-mono">
          {settings.COMMISSION_RATE * 100}% ကော်မရှင်
        </span>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-3.5 rounded-2xl dark-glass flex flex-col justify-between border border-white/15">
          <span className="text-[11px] font-bold text-white/80 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 stroke-white stroke-[2.2]" />
            စုစုပေါင်း ဖိတ်ခေါ်သူ
          </span>
          <span className="text-xl font-black text-white mt-2">
            {user.referralsCount || 0} <span className="text-xs font-bold text-white/70">ယောက်</span>
          </span>
        </div>

        <div className="p-3.5 rounded-2xl dark-glass flex flex-col justify-between border border-white/15">
          <span className="text-[11px] font-bold text-white/80 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 stroke-white stroke-[2.2]" />
            ငွေသွင်း မန်ဘာအစစ်
          </span>
          <span className="text-xl font-black text-white mt-2">
            {depositedCount} <span className="text-xs font-bold text-white/70">ယောက်</span>
          </span>
        </div>

        <div className="p-3.5 rounded-2xl dark-glass flex flex-col justify-between border border-white/15">
          <span className="text-[11px] font-bold text-white/80 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 stroke-white stroke-[2.2]" />
            မန်ဘာများ သွင်းငွေ
          </span>
          <span className="text-base font-black text-white mt-2 tracking-tight">
            {formatKs(totalTeamDeposit)}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl dark-glass flex flex-col justify-between border border-white/15">
          <span className="text-[11px] font-bold text-white/80 flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 stroke-white stroke-[2.2]" />
            မိတ်ဆက်ခ လက်ကျန်
          </span>
          <span className="text-base font-black text-white mt-2 tracking-tight">
            {formatKs(user.referralBalance)}
          </span>
        </div>
      </div>

      {/* Transfer Commission Button */}
      {user.referralBalance >= settings.MINIMUM_TRANSFER_AMOUNT && (
        <button
          onClick={handleTransfer}
          disabled={transferring}
          className="w-full py-3 rounded-2xl dark-glass-btn hover:bg-white/20 border border-white/30 text-white font-black text-xs active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg"
        >
          <Coins className="w-4 h-4 stroke-white stroke-[2.4]" />
          <span>မိတ်ဆက်ခ ({formatKs(user.referralBalance)}) ကို ပင်မလက်ကျန်သို့ ပြောင်းမည်</span>
        </button>
      )}

      {/* Referral Link & Sharing Card */}
      <div className="p-4 rounded-3xl dark-glass border border-white/15 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-white flex items-center gap-1.5">
            <Share2 className="w-4 h-4 stroke-white stroke-[2.4]" />
            ဖိတ်ခေါ်လင့်ခ် (Referral Link)
          </span>
          <span className="text-[10px] text-white/70 font-bold">Copy ယူပြီး သူငယ်ချင်းထံ ပို့ပါ</span>
        </div>

        <div className="flex items-center justify-between bg-black/60 p-2.5 rounded-xl border border-white/15 gap-2">
          <span className="text-xs font-mono font-bold text-white truncate flex-1">
            {referralLink}
          </span>
          <button
            onClick={handleCopy}
            className="shrink-0 flex items-center gap-1 py-1.5 px-3 rounded-lg dark-glass-btn text-xs font-black text-white active:scale-90"
          >
            {copied ? <Check className="w-3.5 h-3.5 stroke-white stroke-[2.4]" /> : <Copy className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />}
            <span>{copied ? 'ကူးပြီး' : 'Copy'}</span>
          </button>
        </div>

        <a
          href={shareTelegramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-2.5 rounded-xl dark-glass-btn hover:bg-white/20 border border-white/25 text-white font-black text-xs flex items-center justify-center gap-2 text-center"
        >
          <Share2 className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
          <span>Telegram တွင် တိုက်ရိုက်မျှဝေမည်</span>
        </a>
      </div>

      {/* 3 Milestone Reward Tiers */}
      <div className="flex flex-col gap-2.5">
        <h3 className="text-xs font-black text-white flex items-center gap-1.5 px-1">
          <Award className="w-4 h-4 stroke-white stroke-[2.4]" />
          <span>မန်ဘာ သွင်းငွေ ဆုကြေးများ (Milestone Bonuses)</span>
        </h3>

        {/* Tier 1 */}
        <div className="p-3.5 rounded-2xl dark-glass-card border border-white/15 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-black text-white text-xs block">အဆင့် ၁: မန်ဘာ ၂ ယောက် ငွေသွင်းပါက</span>
              <span className="text-[11px] text-white/70 font-medium">ငွေသွင်းမန်ဘာအစစ် ၂ ယောက် ပြည့်ပါက ဆုကြေး ၂,၀၀၀ Ks ရယူပါ</span>
            </div>
            <span className="text-sm font-black text-white font-mono">+2,000 Ks</span>
          </div>

          <div className="w-full bg-black/60 rounded-full h-2 overflow-hidden border border-white/15 p-0.5">
            <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${tier1Progress}%` }} />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-bold text-white/70">တိုးတက်မှု: {depositedCount}/2 ယောက်</span>
            {tier1Claimed ? (
              <span className="text-[11px] font-black text-white/60 flex items-center gap-1">
                <Check className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                ရယူပြီးပါပြီ
              </span>
            ) : (
              <button
                disabled={!tier1Eligible || claiming === 'tier_2_deposited'}
                onClick={() => handleClaim('tier_2_deposited')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                  tier1Eligible ? 'bg-white/20 border border-white/30 text-white shadow-md active:scale-95' : 'opacity-40 cursor-not-allowed bg-black/40 text-white/60'
                }`}
              >
                {claiming === 'tier_2_deposited' ? 'ရယူနေပါသည်...' : 'ဆုကြေးရယူမည်'}
              </button>
            )}
          </div>
        </div>

        {/* Tier 2 */}
        <div className="p-3.5 rounded-2xl dark-glass-card border border-white/15 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-black text-white text-xs block">အဆင့် ၂: မန်ဘာ ၅ ယောက် ငွေသွင်းပါက</span>
              <span className="text-[11px] text-white/70 font-medium">ငွေသွင်းမန်ဘာအစစ် ၅ ယောက် ပြည့်ပါက ဆုကြေး ၂,၀၀၀ Ks ထပ်မံရယူပါ</span>
            </div>
            <span className="text-sm font-black text-white font-mono">+2,000 Ks</span>
          </div>

          <div className="w-full bg-black/60 rounded-full h-2 overflow-hidden border border-white/15 p-0.5">
            <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${tier2Progress}%` }} />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-bold text-white/70">တိုးတက်မှု: {depositedCount}/5 ယောက်</span>
            {tier2Claimed ? (
              <span className="text-[11px] font-black text-white/60 flex items-center gap-1">
                <Check className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                ရယူပြီးပါပြီ
              </span>
            ) : (
              <button
                disabled={!tier2Eligible || claiming === 'tier_5_deposited'}
                onClick={() => handleClaim('tier_5_deposited')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                  tier2Eligible ? 'bg-white/20 border border-white/30 text-white shadow-md active:scale-95' : 'opacity-40 cursor-not-allowed bg-black/40 text-white/60'
                }`}
              >
                {claiming === 'tier_5_deposited' ? 'ရယူနေပါသည်...' : 'ဆုကြေးရယူမည်'}
              </button>
            )}
          </div>
        </div>

        {/* Tier 3 */}
        <div className="p-3.5 rounded-2xl dark-glass-card border border-white/15 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-black text-white text-xs block">အဆင့် ၃: မန်ဘာများ သွင်းငွေ စုစုပေါင်း ၅၀,၀၀၀ Ks ပြည့်ပါက</span>
              <span className="text-[11px] text-white/70 font-medium">မန်ဘာများ သွင်းငွေ စုစုပေါင်း ၅၀,၀၀၀ Ks ပြည့်ပါက ဆုကြေး ၅,၀၀၀ Ks ရယူပါ</span>
            </div>
            <span className="text-sm font-black text-white font-mono">+5,000 Ks</span>
          </div>

          <div className="w-full bg-black/60 rounded-full h-2 overflow-hidden border border-white/15 p-0.5">
            <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${tier3Progress}%` }} />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-bold text-white/70">တိုးတက်မှု: {formatKs(totalTeamDeposit)}/50,000 Ks</span>
            {tier3Claimed ? (
              <span className="text-[11px] font-black text-white/60 flex items-center gap-1">
                <Check className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                ရယူပြီးပါပြီ
              </span>
            ) : (
              <button
                disabled={!tier3Eligible || claiming === 'tier_10_50k'}
                onClick={() => handleClaim('tier_10_50k')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                  tier3Eligible ? 'bg-white/20 border border-white/30 text-white shadow-md active:scale-95' : 'opacity-40 cursor-not-allowed bg-black/40 text-white/60'
                }`}
              >
                {claiming === 'tier_10_50k' ? 'ရယူနေပါသည်...' : 'ဆုကြေးရယူမည်'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Member List Table */}
      <div className="p-4 rounded-3xl dark-glass border border-white/15 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-white flex items-center gap-1.5">
            <Users className="w-4 h-4 stroke-white stroke-[2.4]" />
            <span>ဖိတ်ခေါ်ထားသော မန်ဘာများ ({filteredMembers.length})</span>
          </span>

          <div className="flex items-center gap-1 text-[10px]">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-1 rounded-lg font-black transition-all ${filter === 'all' ? 'bg-white/20 text-white' : 'text-white/60'}`}
            >
              အားလုံး
            </button>
            <button
              onClick={() => setFilter('deposited')}
              className={`px-2 py-1 rounded-lg font-black transition-all ${filter === 'deposited' ? 'bg-white/20 text-white' : 'text-white/60'}`}
            >
              ငွေသွင်းပြီး
            </button>
            <button
              onClick={() => setFilter('registered')}
              className={`px-2 py-1 rounded-lg font-black transition-all ${filter === 'registered' ? 'bg-white/20 text-white' : 'text-white/60'}`}
            >
              မသွင်းရသေး
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
          {filteredMembers.length === 0 ? (
            <div className="py-8 text-center text-xs text-white/60 flex flex-col items-center justify-center gap-2">
              <Clock className="w-6 h-6 stroke-white stroke-[2]" />
              <span>ဖိတ်ခေါ်ထားသော မန်ဘာ မရှိသေးပါ။</span>
            </div>
          ) : (
            filteredMembers.map((m, idx) => (
              <div
                key={m.uid || idx}
                className="p-3 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between text-xs"
              >
                <div className="flex flex-col">
                  <span className="font-black text-white">{m.fullName || `Player ${m.uid.slice(0, 5)}`}</span>
                  <span className="text-[10px] text-white/60 font-mono">
                    {new Date(m.joinedAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {m.hasSuccessfulDeposit ? (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/30 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 stroke-white stroke-[2.4]" />
                      ငွေသွင်းပြီး ({formatKs(m.totalSuccessfulDeposit)})
                    </span>
                  ) : (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/5 text-white/60 border border-white/10">
                      အကောင့်ဖွင့်ထားရုံ
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

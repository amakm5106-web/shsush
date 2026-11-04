'use client';

import React, { useState } from 'react';
import {
  User,
  X,
  Share2,
  Copy,
  Check,
  CreditCard,
  Coins,
  ShieldCheck,
  LogOut,
  RefreshCw,
  Users,
  Award,
  AlertCircle,
  Lock,
  Clock,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { GameSettings, UserProfile, ReferralMember, BoundBank } from '@/lib/types';
import { formatKs } from '@/lib/constants';
import { sounds } from '@/lib/audio';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  settings: GameSettings;
  referralMembers: ReferralMember[];
  onTransferReferral: () => Promise<boolean>;
  onClaimMilestone: (milestoneId: 'tier_2_deposited' | 'tier_5_deposited' | 'tier_10_50k') => Promise<boolean>;
  onSignOut: () => void;
}

export function ProfileModal({
  isOpen,
  onClose,
  user,
  settings,
  referralMembers,
  onTransferReferral,
  onClaimMilestone,
  onSignOut,
}: ProfileModalProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'referrals'>('referrals');
  const [referralFilter, setReferralFilter] = useState<'all' | 'deposited' | 'registered'>('all');
  const [copied, setCopied] = useState<boolean>(false);
  const [transferring, setTransferring] = useState<boolean>(false);
  const [claiming, setClaiming] = useState<string | null>(null);

  const origin = React.useSyncExternalStore(
    () => () => {},
    () => (typeof window !== 'undefined' ? window.location.origin : ''),
    () => ''
  );

  const referralLink = origin ? `${origin}?ref=${user.uid}` : `https://t.me/XinAiiiDiceBot?start=${user.uid}`;

  if (!isOpen) return null;

  const shareText = `Xin Aiii အံစာတုံး ထီ & ကာစီနို Game တွင် အကောင့်ဖွင့်ပြီး Welcome Bonus ${formatKs(settings.WELCOME_BONUS)} လက်ဆောင်ယူလိုက်ပါ!\nဖိတ်ခေါ်လင့်ခ်: ${referralLink}`;
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

  // Filter referral members list
  const filteredReferrals = referralMembers.filter((m) => {
    if (referralFilter === 'deposited') return m.hasSuccessfulDeposit;
    if (referralFilter === 'registered') return !m.hasSuccessfulDeposit;
    return true;
  });

  const isFirstWithdrawal = user.withdrawalCount === 0;
  const firstWithdrawProgress = Math.min(
    100,
    Math.round((user.totalSuccessfulDeposit / settings.FIRST_WITHDRAW_DEPOSIT_REQUIRED) * 100)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-xl animate-fadeIn">
      <div className="relative w-full max-w-lg dark-glass rounded-3xl p-5 shadow-[0_20px_60px_rgba(0,0,0,0.85)] border border-white/20 flex flex-col max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/15">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-white/10 border border-white/20 text-white">
              <User className="w-5 h-5 stroke-white stroke-[2.4]" />
            </div>
            <div>
              <h3 className="font-black text-white text-base tracking-tight">ကိုယ်ပိုင်အကောင့် & မန်ဘာဆုကြေး</h3>
              <p className="text-[11px] text-white/70 font-medium">Player Profile & Referral Milestones</p>
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

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-2 my-3 p-1 dark-glass rounded-2xl border border-white/15">
          <button
            onClick={() => {
              sounds.playChip();
              setActiveTab('referrals');
            }}
            className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
              activeTab === 'referrals'
                ? 'bg-white/20 border border-white/30 text-white shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4 stroke-white stroke-[2.4]" />
            မိတ်ဆက် & မန်ဘာဆုကြေး
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              setActiveTab('profile');
            }}
            className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
              activeTab === 'profile'
                ? 'bg-white/20 border border-white/30 text-white shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <User className="w-4 h-4 stroke-white stroke-[2.4]" />
            အကောင့် & ဘဏ်အချက်အလက်
          </button>
        </div>

        {/* TAB 1: REFERRALS & MILESTONES */}
        {activeTab === 'referrals' && (
          <div className="flex flex-col gap-4">
            {/* 4 Stat Overview Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-2xl dark-glass-card flex flex-col">
                <span className="text-[11px] font-bold text-white/80 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 stroke-white stroke-[2.2]" />
                  စုစုပေါင်း ဖိတ်ခေါ်သူ
                </span>
                <span className="text-xl font-black text-white mt-1">
                  {user.referralsCount || 0} <span className="text-xs font-bold text-white/70">ယောက်</span>
                </span>
              </div>

              <div className="p-3 rounded-2xl dark-glass-card flex flex-col">
                <span className="text-[11px] font-bold text-white/80 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 stroke-white stroke-[2.2]" />
                  ငွေသွင်း မန်ဘာအစစ်
                </span>
                <span className="text-xl font-black text-white mt-1">
                  {depositedCount} <span className="text-xs font-bold text-white/70">ယောက်</span>
                </span>
              </div>

              <div className="p-3 rounded-2xl dark-glass-card flex flex-col">
                <span className="text-[11px] font-bold text-white/80 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 stroke-white stroke-[2.2]" />
                  မန်ဘာများ သွင်းငွေစုစုပေါင်း
                </span>
                <span className="text-base font-black text-white mt-1 tracking-tight">
                  {formatKs(totalTeamDeposit)}
                </span>
              </div>

              <div className="p-3 rounded-2xl dark-glass-card flex flex-col">
                <span className="text-[11px] font-bold text-white/80 flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 stroke-white stroke-[2.2]" />
                  မိတ်ဆက်ခ လက်ကျန်
                </span>
                <span className="text-base font-black text-white mt-1 tracking-tight">
                  {formatKs(user.referralBalance)}
                </span>
              </div>
            </div>

            {/* Referral Link & Telegram Share */}
            <div className="p-3.5 rounded-2xl dark-glass border border-white/20 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-white flex items-center gap-1.5">
                  <Share2 className="w-4 h-4 stroke-white stroke-[2.4]" />
                  ဖိတ်ခေါ်လင့်ခ် (Referral Link)
                </span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-white/15 border border-white/20 text-white">
                  {settings.COMMISSION_RATE * 100}% ကော်မရှင်
                </span>
              </div>

              <div className="flex items-center justify-between bg-black/60 p-2.5 rounded-xl border border-white/15">
                <span className="text-xs font-mono font-bold text-white truncate max-w-[240px]">
                  {referralLink}
                </span>

                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg dark-glass-btn text-xs font-black text-white active:scale-90"
                >
                  {copied ? <Check className="w-3.5 h-3.5 stroke-white stroke-[2.4]" /> : <Copy className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />}
                  <span>{copied ? 'ကူးပြီး' : 'Copy'}</span>
                </button>
              </div>

              <a
                href={shareTelegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 rounded-xl dark-glass-btn hover:bg-white/20 border border-white/25 text-white font-black text-xs flex items-center justify-center gap-2"
              >
                <Share2 className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                Telegram တွင် သူငယ်ချင်းများကို ဖိတ်ခေါ်မည်
              </a>
            </div>

            {/* Tiered Referral Milestones (User Requirements) */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-white flex items-center gap-1.5">
                  <Award className="w-4 h-4 stroke-white stroke-[2.4]" />
                  မန်ဘာဆုကြေး အဆင့်များ (Milestone Bonuses)
                </span>
                <span className="text-[10px] text-white/70 font-bold">ငွေသွင်းမှ မန်ဘာအစစ်ဖြစ်သည်</span>
              </div>

              {/* Milestone 1: 2 Deposited Members -> 2,000 Ks */}
              <div className="p-3.5 rounded-2xl dark-glass-card border border-white/20 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-white">မန်ဘာ ၂ ယောက် ဆုကြေး (၂,၀၀၀ Ks)</span>
                    <span className="text-[11px] text-white/75 font-medium">
                      အနည်းဆုံး ၂ ယောက်ဝင်ပြီး ၂ ယောက်လုံး ငွေသွင်းပါက ၂,၀၀၀ Ks ရရှိမည်။
                    </span>
                  </div>
                  <span className="font-mono text-xs font-black text-white">
                    {Math.min(2, depositedCount)}/2 ယောက်
                  </span>
                </div>

                <div className="w-full bg-black/60 rounded-full h-2 overflow-hidden border border-white/15">
                  <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${tier1Progress}%` }} />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-white/70 font-bold">
                    {tier1Claimed ? 'ဆုကြေးရယူပြီးပါပြီ' : tier1Eligible ? 'ဆုကြေးထုတ်ယူရန် အသင့်ဖြစ်ပါသည်' : 'ငွေသွင်းမန်ဘာ ၂ ယောက် လိုအပ်ပါသည်'}
                  </span>

                  <button
                    type="button"
                    disabled={tier1Claimed || !tier1Eligible || claiming === 'tier_2_deposited'}
                    onClick={() => handleClaim('tier_2_deposited')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 transition-all ${
                      tier1Claimed
                        ? 'bg-white/10 text-white/50 border border-white/10 cursor-not-allowed'
                        : tier1Eligible
                        ? 'dark-glass-btn-active hover:bg-white/30 text-white border border-white/40 active:scale-95'
                        : 'bg-black/40 text-white/40 border border-white/10 cursor-not-allowed'
                    }`}
                  >
                    {tier1Claimed ? <Check className="w-3.5 h-3.5 stroke-white stroke-[2.4]" /> : <Award className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />}
                    <span>{tier1Claimed ? 'ရယူပြီး' : '၂,၀၀၀ Ks ရယူမည်'}</span>
                  </button>
                </div>
              </div>

              {/* Milestone 2: 5 Deposited Members -> 2,000 Ks */}
              <div className="p-3.5 rounded-2xl dark-glass-card border border-white/20 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-white">မန်ဘာ ၅ ယောက် ဆုကြေး (၂,၀၀၀ Ks)</span>
                    <span className="text-[11px] text-white/75 font-medium">
                      ငွေသွင်းမန်ဘာအစစ် ၅ ယောက် ပြည့်ပါက ၂,၀၀၀ Ks ရရှိမည်။
                    </span>
                  </div>
                  <span className="font-mono text-xs font-black text-white">
                    {Math.min(5, depositedCount)}/5 ယောက်
                  </span>
                </div>

                <div className="w-full bg-black/60 rounded-full h-2 overflow-hidden border border-white/15">
                  <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${tier2Progress}%` }} />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-white/70 font-bold">
                    {tier2Claimed ? 'ဆုကြေးရယူပြီးပါပြီ' : tier2Eligible ? 'ဆုကြေးထုတ်ယူရန် အသင့်ဖြစ်ပါသည်' : 'ငွေသွင်းမန်ဘာ ၅ ယောက် လိုအပ်ပါသည်'}
                  </span>

                  <button
                    type="button"
                    disabled={tier2Claimed || !tier2Eligible || claiming === 'tier_5_deposited'}
                    onClick={() => handleClaim('tier_5_deposited')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 transition-all ${
                      tier2Claimed
                        ? 'bg-white/10 text-white/50 border border-white/10 cursor-not-allowed'
                        : tier2Eligible
                        ? 'dark-glass-btn-active hover:bg-white/30 text-white border border-white/40 active:scale-95'
                        : 'bg-black/40 text-white/40 border border-white/10 cursor-not-allowed'
                    }`}
                  >
                    {tier2Claimed ? <Check className="w-3.5 h-3.5 stroke-white stroke-[2.4]" /> : <Award className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />}
                    <span>{tier2Claimed ? 'ရယူပြီး' : '၂,၀၀၀ Ks ရယူမည်'}</span>
                  </button>
                </div>
              </div>

              {/* Milestone 3: 10 Members Group 50,000 Ks Deposit Target -> 5,000 Ks */}
              <div className="p-3.5 rounded-2xl dark-glass-card border border-white/20 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-white">မန်ဘာ ၁၀ ယောက် အဖွဲ့လိုက် ၅ သောင်း ဆုကြေး (၅,၀၀၀ Ks)</span>
                    <span className="text-[11px] text-white/75 font-medium">
                      ဖိတ်ခေါ်မန်ဘာများ သွင်းငွေစုစုပေါင်း ၅၀,၀၀၀ Ks ပြည့်ပါက ၅,၀၀၀ Ks ရရှိမည်။
                    </span>
                  </div>
                  <span className="font-mono text-xs font-black text-white">
                    {formatKs(totalTeamDeposit)} / 50,000 Ks
                  </span>
                </div>

                <div className="w-full bg-black/60 rounded-full h-2 overflow-hidden border border-white/15">
                  <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${tier3Progress}%` }} />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-white/70 font-bold">
                    {tier3Claimed ? 'ဆုကြေးရယူပြီးပါပြီ' : tier3Eligible ? 'ဆုကြေးထုတ်ယူရန် အသင့်ဖြစ်ပါသည်' : 'စုစုပေါင်း ၅ သောင်း သွင်းဆော့ရန် လိုသည်'}
                  </span>

                  <button
                    type="button"
                    disabled={tier3Claimed || !tier3Eligible || claiming === 'tier_10_50k'}
                    onClick={() => handleClaim('tier_10_50k')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 transition-all ${
                      tier3Claimed
                        ? 'bg-white/10 text-white/50 border border-white/10 cursor-not-allowed'
                        : tier3Eligible
                        ? 'dark-glass-btn-active hover:bg-white/30 text-white border border-white/40 active:scale-95'
                        : 'bg-black/40 text-white/40 border border-white/10 cursor-not-allowed'
                    }`}
                  >
                    {tier3Claimed ? <Check className="w-3.5 h-3.5 stroke-white stroke-[2.4]" /> : <Award className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />}
                    <span>{tier3Claimed ? 'ရယူပြီး' : '၅,၀၀၀ Ks ရယူမည်'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Transfer Referral Balance Button */}
            <button
              type="button"
              onClick={handleTransfer}
              disabled={transferring || user.referralBalance < settings.MINIMUM_TRANSFER_AMOUNT}
              className={`w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                user.referralBalance >= settings.MINIMUM_TRANSFER_AMOUNT
                  ? 'dark-glass-btn hover:bg-white/20 border border-white/30 text-white active:scale-95'
                  : 'opacity-40 cursor-not-allowed bg-black/40 border border-white/10 text-white/50'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
              မိတ်ဆက်ခကို ပင်မလက်ကျန်သို့ ပြောင်းရွှေ့မည် ({formatKs(settings.MINIMUM_TRANSFER_AMOUNT)} ပြည့်ပါက)
            </button>

            {/* Detailed Table of Invited Members */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-white flex items-center gap-1.5">
                  <Users className="w-4 h-4 stroke-white stroke-[2.4]" />
                  ဖိတ်ခေါ်မန်ဘာများ စာရင်း ({referralMembers.length})
                </span>

                {/* Sub Filter */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setReferralFilter('all')}
                    className={`px-2 py-0.5 rounded text-[10px] font-black transition-all ${
                      referralFilter === 'all'
                        ? 'bg-white/25 text-white border border-white/30'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    အားလုံး
                  </button>
                  <button
                    type="button"
                    onClick={() => setReferralFilter('deposited')}
                    className={`px-2 py-0.5 rounded text-[10px] font-black transition-all ${
                      referralFilter === 'deposited'
                        ? 'bg-white/25 text-white border border-white/30'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    ငွေသွင်းပြီး ({depositedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setReferralFilter('registered')}
                    className={`px-2 py-0.5 rounded text-[10px] font-black transition-all ${
                      referralFilter === 'registered'
                        ? 'bg-white/25 text-white border border-white/30'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    အကောင့်ဖွင့်ရုံ ({Math.max(0, referralMembers.length - depositedCount)})
                  </button>
                </div>
              </div>

              {filteredReferrals.length === 0 ? (
                <div className="p-6 rounded-2xl dark-glass-card text-center text-xs text-white/60 font-bold border border-white/10">
                  ဖိတ်ခေါ်ထားသော မန်ဘာမရှိသေးပါ။ အထက်ပါလင့်ခ်ဖြင့် သူငယ်ချင်းများကို စတင်ဖိတ်ခေါ်ပါ။
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl dark-glass border border-white/15">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/15 bg-white/5 text-white/70 font-bold text-[11px]">
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">မန်ဘာအမည်</th>
                        <th className="py-2.5 px-3">အခြေအနေ</th>
                        <th className="py-2.5 px-3 text-right">သွင်းငွေ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {filteredReferrals.map((member, idx) => (
                        <tr key={member.uid} className="hover:bg-white/5 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-white/60">{idx + 1}</td>
                          <td className="py-2.5 px-3">
                            <div className="font-black text-white">{member.fullName}</div>
                            <div className="font-mono text-[10px] text-white/60">{member.uid.slice(0, 8)}...</div>
                          </td>
                          <td className="py-2.5 px-3">
                            {member.hasSuccessfulDeposit ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-white/20 border border-white/30 text-white">
                                <ShieldCheck className="w-3 h-3 stroke-white stroke-[2.4]" />
                                ငွေသွင်းပြီး (မန်ဘာအစစ်)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-white/5 border border-white/15 text-white/70">
                                <Clock className="w-3 h-3 stroke-white stroke-[2]" />
                                အကောင့်ဖွင့်ရုံ (ငွေမသွင်းသေး)
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-white">
                            {formatKs(member.totalSuccessfulDeposit || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: PROFILE & BOUND BANK DETAILS */}
        {activeTab === 'profile' && (
          <div className="flex flex-col gap-4">
            {/* Profile Avatar Card */}
            <div className="p-4 rounded-2xl dark-glass-card flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white font-black text-lg">
                {user.fullName ? user.fullName.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="font-black text-white text-sm truncate">{user.fullName}</span>
                <span className="text-[11px] text-white/70 font-mono truncate">{user.email || user.uid}</span>
                <span className="inline-block mt-1 px-2.5 py-0.5 rounded-md text-[10px] font-black w-fit bg-white/15 border border-white/20 text-white">
                  Role: {user.role.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Financial Overview Cards */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3.5 rounded-2xl dark-glass-card flex flex-col">
                <span className="text-[11px] font-bold text-white/80 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 stroke-white stroke-[2.2]" />
                  ပင်မလက်ကျန်ငွေ
                </span>
                <span className="text-xl font-black text-white mt-1 tracking-tight">{formatKs(user.balance)}</span>
              </div>

              <div className="p-3.5 rounded-2xl dark-glass-card flex flex-col">
                <span className="text-[11px] font-bold text-white/80 flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 stroke-white stroke-[2.2]" />
                  မိတ်ဆက်ခလက်ကျန်
                </span>
                <span className="text-xl font-black text-white mt-1 tracking-tight">
                  {formatKs(user.referralBalance)}
                </span>
              </div>
            </div>

            {/* Single Bank Account Binding Status */}
            <div className="p-3.5 rounded-2xl dark-glass-card flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-white flex items-center gap-1.5">
                  <Lock className="w-4 h-4 stroke-white stroke-[2.4]" />
                  ချိတ်ဆက်ထားသော ဘဏ်အကောင့် (၁ ခုသာ ခွင့်ပြုထားသည်)
                </span>
                {user.boundBank ? (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-white/20 border border-white/30 text-white uppercase">
                    {user.boundBank.method === 'kpay' ? 'KBZPay' : 'Wave Money'}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/10 border border-white/20 text-white/70">
                    မချိတ်ဆက်ရသေးပါ
                  </span>
                )}
              </div>

              {user.boundBank ? (
                <div className="bg-black/60 p-3 rounded-xl border border-white/15 flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs font-black text-white">
                    <span>{user.boundBank.method.toUpperCase()} အကောင့်:</span>
                    <span className="font-mono text-sm">{user.boundBank.phone}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold text-white/80">
                    <span>အကောင့်အမည်:</span>
                    <span>{user.boundBank.accountName}</span>
                  </div>
                  <p className="text-[10px] text-white/60 font-medium mt-1">
                    စည်းကမ်းသတ်မှတ်ချက်အရ ဤဘဏ်အကောင့်သို့သာ ငွေထုတ်ယူခွင့် ပြုထားပါသည်။
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-white/80 font-medium">
                  ငွေထုတ်ကောင်တာတွင် ပထမဆုံး ငွေထုတ်ယူသည့်အခါ သင်၏ KPay သို့မဟုတ် Wave ဘဏ်အကောင့်ကို အလိုအလျောက် အတည်ပြု ချိတ်ဆက်ပေးပါမည်။
                </p>
              )}
            </div>

            {/* Anti-Hedging Status */}
            <div className="p-3.5 rounded-2xl dark-glass-card flex flex-col gap-1.5">
              <span className="text-xs font-black text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 stroke-white stroke-[2.4]" />
                ကစားသမား လိုက်နာမှု အခြေအနေ (Compliance)
              </span>
              {user.isHedgingFlagged || (user.cleanTurnoverRequired || 0) > 0 ? (
                <div className="bg-white/10 p-2.5 rounded-xl border border-white/25 flex flex-col gap-1">
                  <span className="text-xs font-black text-white flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                    Hedging ကစားမှု သတိပေးချက်
                  </span>
                  <p className="text-[11px] text-white/85 font-medium">
                    အလှည့်တစ်ခုတည်းတွင် အကြီးနှင့် အသေး နှစ်ဖက်လုံးလောင်းထားသဖြင့် ကျန်ရှိသော ပြန်လည်ကစားငွေ: {formatKs(user.cleanTurnoverRequired)} ပြည့်အောင် ကစားပြီးမှ ငွေထုတ်ယူနိုင်ပါမည်။
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-white/80 font-medium">
                  စည်းကမ်းလိုက်နာမှု: ပုံမှန် (အကြီး/အသေး နှစ်ဖက်လုံးလောင်းခြင်း မရှိပါ)
                </p>
              )}
            </div>

            {/* First Withdrawal Progress Box */}
            {isFirstWithdrawal && (
              <div className="p-3.5 rounded-2xl dark-glass-card flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-black text-white">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 stroke-white stroke-[2.4]" />
                    ပထမဆုံး ငွေထုတ်ခွင့် အဆင့်
                  </span>
                  <span>{firstWithdrawProgress}%</span>
                </div>

                <div className="w-full bg-black/60 rounded-full h-2 overflow-hidden border border-white/15">
                  <div
                    className="h-full rounded-full bg-white transition-all duration-500"
                    style={{ width: `${firstWithdrawProgress}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-white/80 font-bold">
                  <span>သွင်းပြီး: {formatKs(user.totalSuccessfulDeposit)}</span>
                  <span>လိုအပ်ချက်: {formatKs(settings.FIRST_WITHDRAW_DEPOSIT_REQUIRED)}</span>
                </div>
              </div>
            )}

            {/* Sign Out Button */}
            <button
              onClick={() => {
                sounds.playChip();
                onSignOut();
                onClose();
              }}
              className="w-full py-3 rounded-2xl dark-glass-btn hover:bg-white/15 border border-white/20 text-white font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <LogOut className="w-4 h-4 stroke-white stroke-[2.4]" />
              အကောင့်မှ ထွက်မည် (Sign Out)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

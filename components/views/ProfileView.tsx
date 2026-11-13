'use client';

import React, { useState } from 'react';
import {
  User,
  LogOut,
  LogIn,
  Copy,
  Check,
  CreditCard,
  History,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  Coins,
  TrendingUp,
  Crown,
  Award,
  Wallet,
  Dices,
  Flame,
  Megaphone,
  Headphones,
} from 'lucide-react';
import { GameSettings, UserProfile, PlayerBet } from '@/lib/types';
import { formatKs } from '@/lib/constants';
import { sounds } from '@/lib/audio';

interface ProfileViewProps {
  user: UserProfile | null;
  settings: GameSettings;
  bets: PlayerBet[];
  onSignIn: () => void;
  onSignOut: () => void;
  onRefresh?: () => void;
}

export function ProfileView({
  user,
  settings,
  bets,
  onSignIn,
  onSignOut,
  onRefresh,
}: ProfileViewProps) {
  const [filter, setFilter] = useState<'all' | 'win' | 'loss' | 'pending'>('all');
  const [copiedUid, setCopiedUid] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const handleCopyUid = () => {
    if (!user) return;
    sounds.playChip();
    navigator.clipboard.writeText(user.uid);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 2200);
  };

  const handleRefreshClick = async () => {
    if (!onRefresh) return;
    sounds.playChip();
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  const filteredBets = bets.filter((b) => {
    if (filter === 'win') return b.status === 'win';
    if (filter === 'loss') return b.status === 'loss';
    if (filter === 'pending') return b.status === 'pending';
    return true;
  });

  const winCount = bets.filter((b) => b.status === 'win').length;
  const lossCount = bets.filter((b) => b.status === 'loss').length;
  const pendingCount = bets.filter((b) => b.status === 'pending').length;

  // VIP Tier Level Determination
  const totalDeposit = user?.totalSuccessfulDeposit || 0;
  let vipTier = { name: 'VIP 1 Bronze', level: 1, nextTarget: 20000, color: 'text-amber-500' };
  if (totalDeposit >= 500000) {
    vipTier = { name: 'VIP 4 Diamond', level: 4, nextTarget: 500000, color: 'text-cyan-400' };
  } else if (totalDeposit >= 100000) {
    vipTier = { name: 'VIP 3 Gold', level: 3, nextTarget: 500000, color: 'text-amber-300' };
  } else if (totalDeposit >= 20000) {
    vipTier = { name: 'VIP 2 Silver', level: 2, nextTarget: 100000, color: 'text-zinc-200' };
  }

  const vipProgress = Math.min(100, Math.round((totalDeposit / vipTier.nextTarget) * 100));

  if (!user) {
    return (
      <div className="w-full flex flex-col items-center justify-center py-16 px-4 gap-4 animate-fadeIn">
        <div className="w-16 h-16 rounded-3xl bg-zinc-900/90 border border-white/10 flex items-center justify-center text-zinc-400 shadow-xl">
          <User className="w-8 h-8 stroke-[1.8]" />
        </div>
        <div className="text-center">
          <h2 className="text-base font-black text-white">အကောင့် မဝင်ရသေးပါ</h2>
          <p className="text-xs text-zinc-400 mt-1 max-w-xs">
            သင့်အကောင့်အချက်အလက်များနှင့် လောင်းကြေးမှတ်တမ်းများ ကြည့်ရှုရန် အကောင့်ဝင်ရောက်ပေးပါ။
          </p>
        </div>
        <button
          onClick={onSignIn}
          className="mt-2 px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs transition-all active:scale-95 shadow-lg flex items-center gap-2"
        >
          <LogIn className="w-4 h-4 stroke-[2.5]" />
          <span>အကောင့်ဝင်ရန် / အကောင့်ဖွင့်ရန်</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-4 pb-12 animate-fadeIn">
      {/* 1. VIP MEMBER PRESTIGE CARD (Obsidian & Gold Shimmer backdrop with VIP Badge) */}
      <div className="premium-member-hero relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-zinc-950/90">
        {/* Subtle Obsidian & Warm Gold Background Image Overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30 pointer-events-none"
          style={{ backgroundImage: `url('/assets/casino/obsidian_bg.jpg')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent pointer-events-none" />

        <div className="relative z-10 p-5 sm:p-6 flex flex-col gap-4">
          {/* Header Row: Avatar, VIP Badge, Name, Signout */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5">
              {/* VIP Badge Image */}
              <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 border border-amber-400/40 shadow-xl shadow-amber-500/10 bg-black">
                <img
                  src="/assets/casino/vip_badge.jpg"
                  alt="VIP Badge"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                    {user.fullName || 'VIP Member'}
                  </h1>
                  <span className="px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[10px] font-black uppercase font-mono tracking-wider">
                    {vipTier.name}
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] font-mono text-zinc-400 truncate max-w-[180px] sm:max-w-xs">
                    UID: {user.uid}
                  </span>
                  <button
                    onClick={handleCopyUid}
                    className="p-1 rounded-md bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all"
                    title="UID ကူးယူမည်"
                  >
                    {copiedUid ? <Check className="w-3 h-3 text-emerald-400 stroke-[3]" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>

                {user.email && (
                  <span className="text-[10px] text-zinc-500 mt-0.5 font-medium">
                    {user.email}
                  </span>
                )}
              </div>
            </div>

            {/* Account Actions: Refresh & Sign Out */}
            <div className="flex items-center gap-1.5 shrink-0">
              {onRefresh && (
                <button
                  onClick={handleRefreshClick}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white transition-all active:scale-95"
                  title="ပြန်လည်စစ်ဆေးမည်"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              )}

              <button
                onClick={() => {
                  sounds.playChip();
                  if (confirm('အကောင့်မှ ထွက်ခွာမှာ သေချာပါသလား။')) {
                    onSignOut();
                  }
                }}
                className="p-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-500/20 text-red-300 transition-all active:scale-95"
                title="အကောင့်ထွက်မည်"
              >
                <LogOut className="w-4 h-4 stroke-[2]" />
              </button>
            </div>
          </div>

          {/* VIP Progression Bar */}
          <div className="p-3 rounded-2xl bg-black/60 border border-white/10 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-zinc-400 flex items-center gap-1">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>VIP အဆင့်တိုးတက်မှု</span>
              </span>
              <span className="text-amber-400 font-mono">
                {formatKs(totalDeposit)} / {formatKs(vipTier.nextTarget)}
              </span>
            </div>
            <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden border border-white/10 p-0.5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-200 transition-all duration-500"
                style={{ width: `${vipProgress}%` }}
              />
            </div>
          </div>

          {/* 3 Metric Cards Strip */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="p-3 rounded-xl bg-black/50 border border-white/5 flex flex-col">
              <span className="text-[10px] text-zinc-400 font-bold">လက်ကျန်ငွေ</span>
              <span className="text-sm sm:text-base font-black text-amber-400 font-mono tabular-nums mt-1">
                {formatKs(user.balance || 0)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-black/50 border border-white/5 flex flex-col">
              <span className="text-[10px] text-zinc-400 font-bold">သွင်းငွေ စုစုပေါင်း</span>
              <span className="text-sm sm:text-base font-black text-white font-mono tabular-nums mt-1">
                {formatKs(user.totalSuccessfulDeposit || 0)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-black/50 border border-white/5 flex flex-col">
              <span className="text-[10px] text-zinc-400 font-bold">မိတ်ဆက်ခ လက်ကျန်</span>
              <span className="text-sm sm:text-base font-black text-purple-300 font-mono tabular-nums mt-1">
                {formatKs(user.referralBalance || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. BOUND BANK ACCOUNT STATUS */}
      <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-2xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl overflow-hidden shrink-0 border border-white/10 bg-zinc-800">
            {user.boundBank ? (
              <img
                src={user.boundBank.method === 'kpay' ? '/assets/casino/kpay_badge.jpg' : '/assets/casino/wave_badge.jpg'}
                alt={user.boundBank.method}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-500">
                <CreditCard className="w-5 h-5" />
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-black text-white">
                {user.boundBank ? `${user.boundBank.method === 'kpay' ? 'KBZPay' : 'Wave Money'} အကောင့်` : 'ဘဏ်အကောင့် မချိတ်ဆက်ရသေးပါ'}
              </span>
              {user.boundBank && (
                <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold">
                  Verified
                </span>
              )}
            </div>
            <span className="text-xs text-zinc-400 font-mono mt-0.5">
              {user.boundBank ? `${user.boundBank.accountName} · ${user.boundBank.phone}` : 'ငွေသွင်း/ထုတ်စာမျက်နှာတွင် ချိတ်ဆက်နိုင်ပါသည်'}
            </span>
          </div>
        </div>

        <span className="text-[10px] text-zinc-500 font-bold">
          {user.role === 'admin' ? 'အက်ဒမင်' : 'VIP အကောင့်'}
        </span>
      </div>

      {/* Official Telegram Channel & Customer Service Bot */}
      <div className="grid grid-cols-2 gap-2.5">
        <a
          href="https://t.me/dicemyanmar1"
          target="_blank"
          rel="noopener noreferrer"
          className="p-3 rounded-2xl bg-sky-950/40 border border-sky-500/30 hover:border-sky-400/60 flex items-center gap-2.5 transition-all active:scale-95 group shadow-sm"
        >
          <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <Megaphone className="w-4 h-4 stroke-[2.3]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-black text-white truncate">တရားဝင် Channel</span>
            <span className="text-[10px] text-sky-300 font-mono">@dicemyanmar1</span>
          </div>
        </a>

        <a
          href="https://t.me/xsitecasinobot"
          target="_blank"
          rel="noopener noreferrer"
          className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/30 hover:border-amber-400/60 flex items-center gap-2.5 transition-all active:scale-95 group shadow-sm"
        >
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <Headphones className="w-4 h-4 stroke-[2.3]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-black text-white truncate">Customer Service</span>
            <span className="text-[10px] text-amber-300 font-mono">@xsitecasinobot</span>
          </div>
        </a>
      </div>

      {/* 3. COMPREHENSIVE BETTING HISTORY LEDGER */}
      <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-2xl flex flex-col gap-3">
        {/* Header & Filter Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-amber-400" />
            <h2 className="text-xs sm:text-sm font-black text-white">
              လောင်းကြေးမှတ်တမ်းများ ({filteredBets.length})
            </h2>
          </div>

          <div className="flex items-center p-1 rounded-xl bg-zinc-900 border border-white/10 self-start sm:self-auto">
            <button
              onClick={() => {
                sounds.playChip();
                setFilter('all');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                filter === 'all' ? 'bg-amber-400 text-black shadow-sm font-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              အားလုံး ({bets.length})
            </button>
            <button
              onClick={() => {
                sounds.playChip();
                setFilter('win');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                filter === 'win' ? 'bg-amber-400 text-black shadow-sm font-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              အနိုင် ({winCount})
            </button>
            <button
              onClick={() => {
                sounds.playChip();
                setFilter('loss');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                filter === 'loss' ? 'bg-amber-400 text-black shadow-sm font-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              အရှုံး ({lossCount})
            </button>
            <button
              onClick={() => {
                sounds.playChip();
                setFilter('pending');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                filter === 'pending' ? 'bg-amber-400 text-black shadow-sm font-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              ဆိုင်းငံ့ ({pendingCount})
            </button>
          </div>
        </div>

        {/* Bets List Feed */}
        <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1">
          {filteredBets.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500 flex flex-col items-center justify-center gap-2">
              <Dices className="w-8 h-8 text-zinc-600 stroke-[1.5]" />
              <span>
                {filter === 'win'
                  ? 'အနိုင်ရရှိခဲ့သော လောင်းကြေး မရှိသေးပါ။'
                  : filter === 'loss'
                  ? 'အရှုံးလောင်းကြေး မရှိသေးပါ။'
                  : 'လောင်းကြေးမှတ်တမ်း မရှိသေးပါ။'}
              </span>
            </div>
          ) : (
            filteredBets.map((b, idx) => {
              const isWin = b.status === 'win';
              const isLoss = b.status === 'loss';
              const isPending = b.status === 'pending';

              return (
                <div
                  key={b.id || idx}
                  className="p-3 sm:p-3.5 rounded-2xl bg-zinc-900/60 hover:bg-zinc-900/90 border border-white/10 flex items-center justify-between gap-3 text-xs transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/10 flex items-center justify-center shrink-0">
                      <Dices className="w-4 h-4 text-amber-400" />
                    </div>

                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white">
                          {b.selection === 'အသေး' || b.selection === 'small'
                            ? 'အသေး (Small 2-6)'
                            : b.selection === '7' || b.selection === 'common'
                            ? 'ဘုံအများဆုံး (Common 7)'
                            : b.selection === 'အကြီး' || b.selection === 'big'
                            ? 'အကြီး (Big 8-12)'
                            : b.selection || b.betKind}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400">
                          #{b.roundId}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono mt-0.5">
                        {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {/* Status & Amounts */}
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col text-right">
                      <span className="text-[10px] text-zinc-400">လောင်းကြေး</span>
                      <span className="text-xs font-mono font-bold text-white tabular-nums">
                        {formatKs(b.amount)}
                      </span>
                    </div>

                    <div className="flex flex-col text-right min-w-[70px]">
                      {isWin && (
                        <>
                          <span className="text-[10px] text-emerald-400 font-bold">အနိုင်ရငွေ</span>
                          <span className="text-xs font-mono font-black text-emerald-400 tabular-nums">
                            +{formatKs(b.payout || b.profit || 0)}
                          </span>
                        </>
                      )}
                      {isLoss && (
                        <>
                          <span className="text-[10px] text-zinc-500 font-bold">အရှုံး</span>
                          <span className="text-xs font-mono font-bold text-zinc-400 tabular-nums">
                            -{formatKs(b.amount)}
                          </span>
                        </>
                      )}
                      {isPending && (
                        <span className="text-[10px] text-amber-400 font-mono font-bold animate-pulse">
                          စောင့်ဆိုင်းဆဲ
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

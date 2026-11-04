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

  const handleCopyUid = () => {
    if (!user) return;
    sounds.playChip();
    navigator.clipboard.writeText(user.uid);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 2000);
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

  return (
    <div className="w-full max-w-md px-3.5 flex flex-col gap-3.5 pb-8 animate-fadeIn">
      {/* User Header Profile Card */}
      <div className="p-4 rounded-3xl dark-glass-card border border-white/20 flex flex-col gap-3">
        {user ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/25 flex items-center justify-center text-white font-black text-lg shadow-inner">
                  {user.fullName ? user.fullName[0].toUpperCase() : 'U'}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-black text-white text-base tracking-tight">
                      {user.fullName}
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 border border-white/25 font-bold text-white">
                      {user.role === 'admin' ? 'အက်ဒမင်' : 'VIP မန်ဘာ'}
                    </span>
                  </div>
                  <p className="text-xs text-white/70 font-medium truncate max-w-[200px]">
                    {user.email}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  sounds.playChip();
                  onSignOut();
                }}
                className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/20 active:scale-95 transition-all"
                title="အကောင့်ထွက်မည်"
              >
                <LogOut className="w-4 h-4 stroke-white stroke-[2.2]" />
              </button>
            </div>

            {/* UID Copy Bar */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/50 border border-white/10 text-xs">
              <span className="text-white/60 font-mono">UID: {user.uid.slice(0, 16)}...</span>
              <button
                onClick={handleCopyUid}
                className="flex items-center gap-1 text-white font-bold hover:text-white/80 transition-colors"
              >
                {copiedUid ? (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-white" />
                    <span>ကူးပြီး</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 stroke-white" />
                    <span>UID ကူးမည်</span>
                  </>
                )}
              </button>
            </div>

            {/* Single Bound Bank Status */}
            {user.boundBank ? (
              <div className="p-2.5 rounded-xl bg-white/10 border border-white/15 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 stroke-white" />
                  <span className="font-bold text-white">
                    {user.boundBank.method.toUpperCase()} ({user.boundBank.phone})
                  </span>
                </div>
                <span className="text-[10px] text-white/70 font-mono">{user.boundBank.accountName}</span>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-xs text-white/70">
                <span>ဘဏ်အကောင့် မချိတ်ရသေးပါ</span>
                <span className="text-white font-bold">ငွေထုတ်ကဏ္ဍတွင် ချိတ်ပါ</span>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-4 gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
              <User className="w-7 h-7 stroke-white stroke-[2]" />
            </div>
            <div>
              <h3 className="font-black text-white text-base">အကောင့်မဝင်ရသေးပါ</h3>
              <p className="text-xs text-white/70">ဂိမ်းကစားပြီး ဆုကြေးများရယူရန် ဖုန်းနံပါတ် သို့မဟုတ် Google ဖြင့် အကောင့်ဝင်ပါ</p>
            </div>
            <button
              onClick={() => {
                sounds.playChip();
                onSignIn();
              }}
              className="px-6 py-2.5 rounded-2xl bg-white text-black font-black text-xs flex items-center gap-2 active:scale-95 transition-all shadow-lg"
            >
              <LogIn className="w-4 h-4 stroke-[2.5]" />
              <span>အကောင့်ဝင်ရန် / အကောင့်ဖွင့်ရန်</span>
            </button>
          </div>
        )}
      </div>

      {/* Stats Summary Grid */}
      {user && (
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-2xl dark-glass-card border border-white/15 flex flex-col gap-1">
            <span className="text-[11px] text-white/70 font-bold uppercase tracking-wider">
              စုစုပေါင်းလောင်းငွေ
            </span>
            <span className="text-lg font-black text-white font-mono">
              {formatKs(user.totalBetCumulative || 0)}
            </span>
          </div>

          <div className="p-3 rounded-2xl dark-glass-card border border-white/15 flex flex-col gap-1">
            <span className="text-[11px] text-white/70 font-bold uppercase tracking-wider">
              စုစုပေါင်း အောင်မြင်သောငွေသွင်း
            </span>
            <span className="text-lg font-black text-white font-mono">
              {formatKs(user.totalSuccessfulDeposit || 0)}
            </span>
          </div>
        </div>
      )}

      {/* Betting History Section Header & Filter Tabs */}
      <div className="flex flex-col gap-2 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-white/10 border border-white/20 text-white">
              <History className="w-4 h-4 stroke-white stroke-[2.4]" />
            </div>
            <h3 className="font-black text-white text-sm tracking-tight">လောင်းကြေးမှတ်တမ်း</h3>
          </div>

          {onRefresh && (
            <button
              onClick={() => {
                sounds.playChip();
                onRefresh();
              }}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 active:scale-95 transition-all text-xs flex items-center gap-1 font-bold"
            >
              <RefreshCw className="w-3.5 h-3.5 stroke-white" />
              <span>ပြန်လည်စစ်မည်</span>
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-black/60 border border-white/15 text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`py-1.5 rounded-xl font-bold transition-all ${
              filter === 'all' ? 'bg-white text-black font-black' : 'text-white/70'
            }`}
          >
            အားလုံး ({bets.length})
          </button>
          <button
            onClick={() => setFilter('win')}
            className={`py-1.5 rounded-xl font-bold transition-all ${
              filter === 'win' ? 'bg-white text-black font-black' : 'text-white/70'
            }`}
          >
            အနိုင် ({winCount})
          </button>
          <button
            onClick={() => setFilter('loss')}
            className={`py-1.5 rounded-xl font-bold transition-all ${
              filter === 'loss' ? 'bg-white text-black font-black' : 'text-white/70'
            }`}
          >
            အရှုံး ({lossCount})
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`py-1.5 rounded-xl font-bold transition-all ${
              filter === 'pending' ? 'bg-white text-black font-black' : 'text-white/70'
            }`}
          >
            စောင့်ဆိုင်း ({pendingCount})
          </button>
        </div>
      </div>

      {/* Bets List */}
      <div className="flex flex-col gap-2">
        {filteredBets.length === 0 ? (
          <div className="p-8 rounded-2xl dark-glass-card border border-white/10 text-center flex flex-col items-center justify-center gap-2">
            <Clock className="w-7 h-7 stroke-white/50 stroke-[2]" />
            <span className="text-xs font-bold text-white/70">လတ်တလော မှတ်တမ်းမရှိသေးပါ</span>
          </div>
        ) : (
          filteredBets.map((bet, idx) => {
            const isWin = bet.status === 'win';
            const isPending = bet.status === 'pending';

            return (
              <div
                key={`bet-${bet.betId || idx}-${idx}`}
                className="p-3 rounded-2xl dark-glass-card border border-white/15 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md font-black text-xs bg-white/15 border border-white/20 text-white font-mono">
                      #{bet.roundId}
                    </span>
                    <span className="font-black text-xs text-white">
                      {bet.selection} ({bet.multiplier}x)
                    </span>
                  </div>

                  <div className="flex items-center gap-1 font-black text-xs">
                    {isWin && (
                      <span className="flex items-center gap-1 text-white">
                        <CheckCircle2 className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                        +{formatKs(bet.payout)}
                      </span>
                    )}
                    {!isWin && !isPending && (
                      <span className="flex items-center gap-1 text-white/60">
                        <XCircle className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                        -{formatKs(bet.amount)}
                      </span>
                    )}
                    {isPending && (
                      <span className="flex items-center gap-1 text-white/90 bg-white/10 px-2 py-0.5 rounded-full border border-white/20 text-[11px]">
                        <Clock className="w-3 h-3 stroke-white stroke-[2.4] animate-spin" />
                        စောင့်ဆိုင်းဆဲ
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-white/70 font-bold border-t border-white/10 pt-1.5">
                  <span>လောင်းကြေး: {formatKs(bet.amount)}</span>
                  <span>
                    {bet.createdAt
                      ? new Date(bet.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })
                      : 'လတ်တလော'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

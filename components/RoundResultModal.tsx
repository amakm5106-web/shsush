'use client';

import React, { useEffect } from 'react';
import {
  Trophy,
  Dices,
  CheckCircle2,
  XCircle,
  X,
  Sparkles,
  TrendingUp,
  Crown,
  Flame,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { PlayerBet } from '@/lib/types';
import { formatKs, getResultClassLabel, getColorLabel } from '@/lib/constants';
import { sounds } from '@/lib/audio';

interface RoundResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  roundId: number;
  dice1: number;
  dice2: number;
  totalResult: number;
  resultClass: 'small' | 'common' | 'big';
  resultColor: 'red' | 'green' | 'violet';
  userRoundBets: PlayerBet[];
}

export function RoundResultModal({
  isOpen,
  onClose,
  roundId,
  dice1,
  dice2,
  totalResult,
  resultClass,
  resultColor,
  userRoundBets,
}: RoundResultModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      onClose();
    }, 6000);

    return () => clearTimeout(timer);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Calculate player win/loss for this settled round
  let totalBetAmount = 0;
  let totalPayout = 0;
  let wonAny = false;

  userRoundBets.forEach((b) => {
    totalBetAmount += b.amount || 0;
    if (b.status === 'win') {
      wonAny = true;
      totalPayout += b.payout || 0;
    }
  });

  const netProfit = totalPayout - totalBetAmount;
  const hasBets = userRoundBets.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-sm rounded-3xl bg-zinc-950 border border-white/20 p-5 shadow-2xl flex flex-col items-center gap-4 relative animate-scaleUp overflow-hidden">
        {/* Ambient Top Glow */}
        <div
          className={`absolute top-0 inset-x-0 h-32 blur-3xl opacity-20 pointer-events-none ${
            wonAny ? 'bg-emerald-500' : hasBets ? 'bg-red-500' : 'bg-amber-500'
          }`}
        />

        {/* Close Button */}
        <button
          onClick={() => {
            sounds.playChip();
            onClose();
          }}
          className="absolute top-4 right-4 p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-400 hover:text-white transition-all z-10"
        >
          <X className="w-4 h-4 stroke-[2.5]" />
        </button>

        {/* Header Tag */}
        <div className="flex flex-col items-center text-center pt-1 z-10">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/30 text-amber-300 text-xs font-black uppercase font-mono tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>ပွဲစဉ် #{roundId} ရလဒ်</span>
          </div>

          <h2 className="text-xl font-black text-white tracking-tight">
            ဒီ ရလဒ် ထွက်ပါပြီ!
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Round Settled · Synchronized Result
          </p>
        </div>

        {/* Dice Visual Showcase */}
        <div className="w-full p-4 rounded-2xl bg-black/70 border border-white/15 flex flex-col items-center gap-3 shadow-inner z-10">
          <div className="flex items-center justify-center gap-4">
            {/* Die 1 */}
            <div className="w-16 h-16 rounded-2xl bg-white text-slate-900 border-2 border-white/40 shadow-xl flex items-center justify-center font-black text-3xl font-mono ring-2 ring-black/40">
              {dice1}
            </div>

            <span className="text-xl font-black text-amber-400">+</span>

            {/* Die 2 */}
            <div className="w-16 h-16 rounded-2xl bg-white text-slate-900 border-2 border-white/40 shadow-xl flex items-center justify-center font-black text-3xl font-mono ring-2 ring-black/40">
              {dice2}
            </div>

            <span className="text-xl font-black text-zinc-400">=</span>

            {/* Total Sum Badge */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-black border-2 border-amber-300 shadow-xl flex items-center justify-center font-black text-3xl font-mono">
              {totalResult}
            </div>
          </div>

          {/* Outcome Category Tags */}
          <div className="flex items-center justify-center gap-2 pt-1">
            {/* Big / Small Badge */}
            <span
              className={`px-3 py-1 rounded-xl text-xs font-black border ${
                resultClass === 'small'
                  ? 'bg-blue-950/60 text-blue-300 border-blue-500/40'
                  : resultClass === 'big'
                  ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                  : 'bg-purple-950/60 text-purple-300 border-purple-500/40'
              }`}
            >
              {getResultClassLabel(resultClass)}
            </span>

            {/* Color Badge */}
            <span
              className={`px-3 py-1 rounded-xl text-xs font-black border ${
                resultColor === 'red'
                  ? 'bg-red-950/60 text-red-300 border-red-500/40'
                  : resultColor === 'green'
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                  : 'bg-purple-950/60 text-purple-300 border-purple-500/40'
              }`}
            >
              {getColorLabel(resultColor)}
            </span>
          </div>
        </div>

        {/* Player Win / Loss Summary Card */}
        {hasBets ? (
          <div
            className={`w-full p-4 rounded-2xl border flex flex-col gap-2 z-10 ${
              wonAny
                ? 'bg-emerald-950/40 border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                : 'bg-red-950/40 border-red-500/40 shadow-lg shadow-red-500/10'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                {wonAny ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 stroke-[2.5]" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400 stroke-[2.5]" />
                )}
                <span>{wonAny ? 'ဂုဏ်ယူပါတယ်! သင် နိုင်ပါသည်' : 'စိတ်မလျှော့ပါနဲ့!'}</span>
              </span>

              <span
                className={`text-sm sm:text-base font-black font-mono tabular-nums ${
                  wonAny ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {wonAny ? `+${formatKs(totalPayout)}` : `-${formatKs(totalBetAmount)}`}
              </span>
            </div>

            {wonAny && (
              <div className="flex items-center justify-between text-xs pt-1 border-t border-emerald-500/20">
                <span className="text-zinc-400 font-medium">အသားတင် အမြတ် (Net Profit)</span>
                <span className="font-mono font-black text-emerald-300">
                  +{formatKs(netProfit)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full p-3 rounded-2xl bg-white/5 border border-white/10 text-center text-xs text-zinc-400 z-10">
            ဒီပွဲတွင် လောင်းကြေး မရှိပါ။ နောက်တစ်ပွဲတွင် ပါဝင်လောင်းနိုင်ပါသည်!
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={() => {
            sounds.playChip();
            onClose();
          }}
          className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs transition-all active:scale-95 shadow-lg shadow-amber-500/10 z-10"
        >
          ဆက်လက်ကစားမည်
        </button>
      </div>
    </div>
  );
}

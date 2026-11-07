'use client';

import React, { useState } from 'react';
import {
  TrendingDown,
  TrendingUp,
  Crown,
  Coins,
  Plus,
  Minus,
  RotateCcw,
  Flame,
  CheckCircle2,
  Hash,
  Sparkles,
  Palette,
} from 'lucide-react';
import { GameSettings, PlayerBet } from '@/lib/types';
import { formatKs } from '@/lib/constants';
import { sounds } from '@/lib/audio';

interface BettingBoardProps {
  settings: GameSettings;
  userBalance: number;
  bettingOpen: boolean;
  onPlaceBet: (betKind: 'size' | 'number' | 'color', selection: string, amount: number, multiplier: number) => Promise<boolean>;
  currentRoundBets: PlayerBet[];
}

const CHIP_PRESETS = [100, 500, 1000, 5000, 10000, 50000];

export function BettingBoard({
  settings,
  userBalance,
  bettingOpen,
  onPlaceBet,
  currentRoundBets,
}: BettingBoardProps) {
  const [selectedAmount, setSelectedAmount] = useState<number>(settings.MINIMUM_BET || 100);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'quick' | 'colors' | 'numbers'>('quick');

  const handleChipClick = (amount: number) => {
    sounds.playChip();
    setSelectedAmount((prev) => Math.min(userBalance, prev + amount));
  };

  const handlePlaceBetAction = async (
    betKind: 'size' | 'number' | 'color',
    selection: string,
    multiplier: number
  ) => {
    if (!bettingOpen) return;
    if (selectedAmount < settings.MINIMUM_BET) {
      sounds.playTick();
      return;
    }
    if (selectedAmount > userBalance) {
      sounds.playTick();
      await onPlaceBet(betKind, selection, selectedAmount, multiplier);
      return;
    }

    setSubmitting(true);
    sounds.playChip();
    try {
      await onPlaceBet(betKind, selection, selectedAmount, multiplier);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-3">
      {/* 1. Category Tabs: 3 Options (Big/Small, 3 Colors, Specific Numbers) */}
      <div className="grid grid-cols-3 p-1 rounded-2xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => {
            sounds.playChip();
            setActiveTab('quick');
          }}
          className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black transition-all ${
            activeTab === 'quick'
              ? 'bg-amber-400 text-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>အကြီး/အသေး</span>
        </button>

        <button
          type="button"
          onClick={() => {
            sounds.playChip();
            setActiveTab('colors');
          }}
          className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black transition-all ${
            activeTab === 'colors'
              ? 'bg-amber-400 text-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Palette className="w-3.5 h-3.5" />
          <span>အရောင် ၃ ရောင်</span>
        </button>

        <button
          type="button"
          onClick={() => {
            sounds.playChip();
            setActiveTab('numbers');
          }}
          className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black transition-all ${
            activeTab === 'numbers'
              ? 'bg-amber-400 text-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Hash className="w-3.5 h-3.5" />
          <span>ဂဏန်း (၂-၁၂)</span>
        </button>
      </div>

      {/* 2. Main Betting Options Panel */}

      {/* TAB A: BIG / SMALL / COMMON 7 */}
      {activeTab === 'quick' && (
        <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
          {/* အသေး (Small: 2 to 6) */}
          <button
            disabled={!bettingOpen || submitting}
            onClick={() => handlePlaceBetAction('size', 'အသေး', settings.OVER_UNDER_MULTIPLIER)}
            className={`group flex flex-col items-center justify-between p-3.5 rounded-2xl border transition-all ${
              bettingOpen
                ? 'bg-zinc-950/70 hover:bg-zinc-900 border-white/10 hover:border-blue-400/40 shadow-lg active:scale-95'
                : 'opacity-40 cursor-not-allowed bg-black/40 border-white/5'
            }`}
          >
            <div className="flex items-center gap-1 text-blue-400 font-extrabold text-[11px]">
              <TrendingDown className="w-3.5 h-3.5" />
              <span>(၂ မှ ၆)</span>
            </div>

            <div className="my-2 flex flex-col items-center">
              <span className="text-xl sm:text-2xl font-black text-white tracking-tight">
                အသေး
              </span>
              <span className="text-[10px] text-zinc-400 font-mono font-bold">Small</span>
            </div>

            <div className="w-full py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 font-mono font-black text-xs text-center">
              {settings.OVER_UNDER_MULTIPLIER}x ဆ
            </div>
          </button>

          {/* ဘုံအများဆုံး ၇ (Common 7) */}
          <button
            disabled={!bettingOpen || submitting}
            onClick={() => handlePlaceBetAction('number', '7', settings.SIX_MULTIPLIER)}
            className={`group flex flex-col items-center justify-between p-3.5 rounded-2xl border transition-all ${
              bettingOpen
                ? 'bg-zinc-950/70 hover:bg-zinc-900 border-amber-500/30 hover:border-amber-400/60 shadow-lg shadow-amber-500/5 active:scale-95'
                : 'opacity-40 cursor-not-allowed bg-black/40 border-white/5'
            }`}
          >
            <div className="flex items-center gap-1 text-amber-400 font-black text-[11px]">
              <Crown className="w-3.5 h-3.5" />
              <span>အလယ်ဂဏန်း</span>
            </div>

            <div className="my-1.5 flex flex-col items-center">
              <span className="text-3xl font-black text-amber-400 tracking-tight">
                ၇
              </span>
              <span className="text-[10px] font-bold text-zinc-400 font-mono">Common 7</span>
            </div>

            <div className="w-full py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 font-mono font-black text-xs text-center">
              {settings.SIX_MULTIPLIER}x ဆ
            </div>
          </button>

          {/* အကြီး (Big: 8 to 12) */}
          <button
            disabled={!bettingOpen || submitting}
            onClick={() => handlePlaceBetAction('size', 'အကြီး', settings.OVER_UNDER_MULTIPLIER)}
            className={`group flex flex-col items-center justify-between p-3.5 rounded-2xl border transition-all ${
              bettingOpen
                ? 'bg-zinc-950/70 hover:bg-zinc-900 border-white/10 hover:border-amber-400/40 shadow-lg active:scale-95'
                : 'opacity-40 cursor-not-allowed bg-black/40 border-white/5'
            }`}
          >
            <div className="flex items-center gap-1 text-amber-400 font-extrabold text-[11px]">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>(၈ မှ ၁၂)</span>
            </div>

            <div className="my-2 flex flex-col items-center">
              <span className="text-xl sm:text-2xl font-black text-white tracking-tight">
                အကြီး
              </span>
              <span className="text-[10px] text-zinc-400 font-mono font-bold">Big</span>
            </div>

            <div className="w-full py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 font-mono font-black text-xs text-center">
              {settings.OVER_UNDER_MULTIPLIER}x ဆ
            </div>
          </button>
        </div>
      )}

      {/* TAB B: 3-COLOR BETTING (Red, Green, Violet) */}
      {activeTab === 'colors' && (
        <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
          {/* အနီ (Red: 2, 4, 8, 10, 12 - Even) */}
          <button
            disabled={!bettingOpen || submitting}
            onClick={() => handlePlaceBetAction('color', 'red', 2.0)}
            className={`group flex flex-col items-center justify-between p-3.5 rounded-2xl border transition-all ${
              bettingOpen
                ? 'bg-red-950/30 hover:bg-red-950/50 border-red-500/30 hover:border-red-500/60 shadow-lg active:scale-95'
                : 'opacity-40 cursor-not-allowed bg-black/40 border-white/5'
            }`}
          >
            <div className="w-3.5 h-3.5 rounded-full bg-red-500 shadow-sm" />

            <div className="my-2 flex flex-col items-center">
              <span className="text-xl font-black text-red-300 tracking-tight">
                အနီ
              </span>
              <span className="text-[10px] text-zinc-400 font-mono">စုံ (၂,၄,၈,၁၀,၁၂)</span>
            </div>

            <div className="w-full py-1.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-200 font-mono font-black text-xs text-center">
              2.0x ဆ
            </div>
          </button>

          {/* အစိမ်း (Green: 3, 5, 9, 11 - Odd) */}
          <button
            disabled={!bettingOpen || submitting}
            onClick={() => handlePlaceBetAction('color', 'green', 2.0)}
            className={`group flex flex-col items-center justify-between p-3.5 rounded-2xl border transition-all ${
              bettingOpen
                ? 'bg-emerald-950/30 hover:bg-emerald-950/50 border-emerald-500/30 hover:border-emerald-500/60 shadow-lg active:scale-95'
                : 'opacity-40 cursor-not-allowed bg-black/40 border-white/5'
            }`}
          >
            <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 shadow-sm" />

            <div className="my-2 flex flex-col items-center">
              <span className="text-xl font-black text-emerald-300 tracking-tight">
                အစိမ်း
              </span>
              <span className="text-[10px] text-zinc-400 font-mono">မ (၃,၅,၉,၁၁)</span>
            </div>

            <div className="w-full py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 font-mono font-black text-xs text-center">
              2.0x ဆ
            </div>
          </button>

          {/* ခရမ်း (Violet: 6, 7 - Lucky Violet) */}
          <button
            disabled={!bettingOpen || submitting}
            onClick={() => handlePlaceBetAction('color', 'violet', 4.5)}
            className={`group flex flex-col items-center justify-between p-3.5 rounded-2xl border transition-all ${
              bettingOpen
                ? 'bg-purple-950/30 hover:bg-purple-950/50 border-purple-500/30 hover:border-purple-500/60 shadow-lg active:scale-95'
                : 'opacity-40 cursor-not-allowed bg-black/40 border-white/5'
            }`}
          >
            <div className="w-3.5 h-3.5 rounded-full bg-purple-500 shadow-sm" />

            <div className="my-2 flex flex-col items-center">
              <span className="text-xl font-black text-purple-300 tracking-tight">
                ခရမ်း
              </span>
              <span className="text-[10px] text-zinc-400 font-mono">ကံထူး (၆, ၇)</span>
            </div>

            <div className="w-full py-1.5 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-200 font-mono font-black text-xs text-center">
              4.5x ဆ
            </div>
          </button>
        </div>
      )}

      {/* TAB C: SPECIFIC NUMBERS (2 to 12) */}
      {activeTab === 'numbers' && (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => {
            const isSeven = num === 7;
            const multiplier = isSeven ? settings.SIX_MULTIPLIER : settings.DEFAULT_NUM_MULTIPLIER;
            return (
              <button
                key={num}
                disabled={!bettingOpen || submitting}
                onClick={() => handlePlaceBetAction('number', String(num), multiplier)}
                className={`p-2.5 rounded-2xl border flex flex-col items-center justify-between transition-all ${
                  isSeven
                    ? 'col-span-2 sm:col-span-2 bg-amber-500/10 border-amber-500/30 hover:border-amber-400 text-amber-300'
                    : 'bg-zinc-950/70 border-white/10 hover:border-white/20 text-white'
                } ${!bettingOpen ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'}`}
              >
                <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-bold">
                  {isSeven && <Sparkles className="w-3 h-3 text-amber-400" />}
                  <span>ဂဏန်း {num}</span>
                </div>
                <span className="text-base font-black my-0.5 text-white font-mono">{num}</span>
                <span className="text-[10px] font-mono font-black text-amber-400">
                  {multiplier}x ဆ
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 3. Stake Selection & Chips Control */}
      <div className="p-4 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs font-bold text-white">
          <span className="flex items-center gap-1.5 text-zinc-300">
            <Coins className="w-4 h-4 text-amber-400" />
            <span>လောင်းကြေးပမာဏ ရွေးချယ်ပါ</span>
          </span>
          <span className="text-zinc-400">
            လက်ကျန်: <strong className="text-amber-400 font-mono">{formatKs(userBalance)}</strong>
          </span>
        </div>

        {/* Amount Input with +/- Steppers */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              sounds.playChip();
              setSelectedAmount((prev) => Math.max(settings.MINIMUM_BET, prev - 500));
            }}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white active:scale-95 transition-all flex items-center justify-center shrink-0"
            title="Minus 500"
          >
            <Minus className="w-4 h-4 stroke-[2.5]" />
          </button>

          <div className="relative flex-1">
            <input
              type="number"
              min={settings.MINIMUM_BET}
              max={userBalance}
              step={100}
              value={selectedAmount}
              onChange={(e) => setSelectedAmount(Math.max(0, Number(e.target.value)))}
              className="w-full text-center py-2.5 px-3 bg-black/60 rounded-xl border border-white/15 font-black text-white text-base font-mono focus:outline-none focus:border-amber-400"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 font-bold">
              Ks
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              sounds.playChip();
              setSelectedAmount((prev) => Math.min(userBalance, prev + 500));
            }}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white active:scale-95 transition-all flex items-center justify-center shrink-0"
            title="Plus 500"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playChip();
              setSelectedAmount(settings.MINIMUM_BET);
            }}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white active:scale-95 transition-all flex items-center justify-center shrink-0"
            title="Reset"
          >
            <RotateCcw className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        {/* Quick Chips Bar */}
        <div className="grid grid-cols-6 gap-1.5">
          {CHIP_PRESETS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => handleChipClick(chip)}
              className="py-2 px-1 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 text-[11px] font-black text-white font-mono active:scale-90 transition-all text-center"
            >
              +{chip >= 1000 ? `${chip / 1000}k` : chip}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Accepted Bets in Current Round */}
      {currentRoundBets.length > 0 && (
        <div className="p-4 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-black text-white">
            <span className="flex items-center gap-1.5 text-zinc-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>ယခုပွဲတွင် လောင်းထားသော လောင်းကြေးများ ({currentRoundBets.length})</span>
            </span>
            <span className="text-amber-400 font-mono font-black">
              စုစုပေါင်း: {formatKs(currentRoundBets.reduce((acc, b) => acc + b.amount, 0))}
            </span>
          </div>

          <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
            {currentRoundBets.map((bet, idx) => (
              <div
                key={`current-round-bet-${bet.betId || idx}-${idx}`}
                className="flex items-center justify-between py-2 px-3 rounded-xl bg-black/50 border border-white/10 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-lg font-black bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    {bet.selection === 'red'
                      ? 'အနီ (Red)'
                      : bet.selection === 'green'
                      ? 'အစိမ်း (Green)'
                      : bet.selection === 'violet'
                      ? 'ခရမ်း (Violet)'
                      : bet.selection}
                  </span>
                  <span className="text-zinc-400 font-mono text-[11px]">({bet.multiplier}x ဆ)</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-white">{formatKs(bet.amount)}</span>
                  <span className="text-emerald-400 font-mono font-black text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    +{formatKs(Math.round(bet.amount * bet.multiplier))}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

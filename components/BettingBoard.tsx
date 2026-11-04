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
} from 'lucide-react';
import { GameSettings, PlayerBet } from '@/lib/types';
import { formatKs } from '@/lib/constants';
import { sounds } from '@/lib/audio';

interface BettingBoardProps {
  settings: GameSettings;
  userBalance: number;
  bettingOpen: boolean;
  onPlaceBet: (betKind: 'size' | 'number', selection: string, amount: number, multiplier: number) => Promise<boolean>;
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
  const [activeTab, setActiveTab] = useState<'quick' | 'numbers'>('quick');

  const handleChipClick = (amount: number) => {
    sounds.playChip();
    setSelectedAmount((prev) => Math.min(userBalance, prev + amount));
  };

  const handlePlaceBetAction = async (
    betKind: 'size' | 'number',
    selection: string,
    multiplier: number
  ) => {
    if (!bettingOpen) return;
    if (selectedAmount < settings.MINIMUM_BET) {
      alert(`အနည်းဆုံးလောင်းကြေးမှာ ${formatKs(settings.MINIMUM_BET)} ဖြစ်ပါသည်။`);
      return;
    }
    if (selectedAmount > userBalance) {
      alert('လက်ကျန်ငွေ မလုံလောက်ပါ။ ကျေးဇူးပြု၍ ငွေအရင်ဖြည့်သွင်းပါ။');
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
      {/* Category Tabs: Dark Glasses with Bold White Text & Line Icons */}
      <div className="grid grid-cols-2 p-1.5 dark-glass rounded-2xl border border-white/15 bg-black/40">
        <button
          type="button"
          onClick={() => {
            sounds.playChip();
            setActiveTab('quick');
          }}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all ${
            activeTab === 'quick'
              ? 'bg-white/20 border border-white/30 text-white shadow-md'
              : 'bg-transparent border border-transparent text-white/70 hover:text-white'
          }`}
        >
          <Flame className="w-4 h-4 stroke-white stroke-[2.4]" />
          <span>အကြီး / အသေး / ၇</span>
        </button>

        <button
          type="button"
          onClick={() => {
            sounds.playChip();
            setActiveTab('numbers');
          }}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all ${
            activeTab === 'numbers'
              ? 'bg-white/20 border border-white/30 text-white shadow-md'
              : 'bg-transparent border border-transparent text-white/70 hover:text-white'
          }`}
        >
          <Hash className="w-4 h-4 stroke-white stroke-[2.4]" />
          <span>ဂဏန်းအတိအကျ (၂-၁၂)</span>
        </button>
      </div>

      {/* Main Betting Option Cards: Dark Glasses with Bold White Typography */}
      {activeTab === 'quick' ? (
        <div className="grid grid-cols-3 gap-2.5">
          {/* အသေး (Small: 2 to 6) */}
          <button
            disabled={!bettingOpen || submitting}
            onClick={() => handlePlaceBetAction('size', 'အသေး', settings.OVER_UNDER_MULTIPLIER)}
            className={`group relative flex flex-col items-center justify-between p-3.5 rounded-2xl border transition-all duration-200 ${
              bettingOpen
                ? 'dark-glass hover:bg-white/10 border-white/20 hover:border-white/40 shadow-[0_4px_20px_rgba(0,0,0,0.4)] active:scale-95'
                : 'opacity-40 cursor-not-allowed bg-white/[0.02] border-white/5'
            }`}
          >
            <div className="flex items-center gap-1 text-white font-extrabold text-[11px]">
              <TrendingDown className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
              <span>(၂ မှ ၆)</span>
            </div>

            <div className="my-2 flex flex-col items-center">
              <span className="text-xl font-black text-white tracking-tight">
                အသေး
              </span>
              <span className="text-[10px] text-white/70 font-mono font-bold">Small</span>
            </div>

            <div className="w-full py-1.5 rounded-xl bg-white/10 border border-white/20 text-white font-black text-xs text-center shadow-inner">
              {settings.OVER_UNDER_MULTIPLIER}x ဆ
            </div>
          </button>

          {/* ဘုံအများဆုံး ၇ (Common 7) */}
          <button
            disabled={!bettingOpen || submitting}
            onClick={() => handlePlaceBetAction('number', '7', settings.SIX_MULTIPLIER)}
            className={`group relative flex flex-col items-center justify-between p-3.5 rounded-2xl border transition-all duration-200 ${
              bettingOpen
                ? 'dark-glass hover:bg-white/10 border-white/30 hover:border-white/50 shadow-[0_4px_24px_rgba(255,255,255,0.08)] ring-1 ring-white/25 active:scale-95'
                : 'opacity-40 cursor-not-allowed bg-white/[0.02] border-white/5'
            }`}
          >
            <div className="flex items-center gap-1 text-white font-black text-[11px]">
              <Crown className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
              <span>အလယ်ဂဏန်း</span>
            </div>

            <div className="my-1.5 flex flex-col items-center">
              <span className="text-3xl font-black text-white tracking-tight">
                ၇
              </span>
              <span className="text-[10px] font-bold text-white/80 font-mono">Common 7</span>
            </div>

            <div className="w-full py-1.5 rounded-xl bg-white/20 border border-white/30 text-white font-black text-xs text-center shadow-md">
              {settings.SIX_MULTIPLIER}x ဆ
            </div>
          </button>

          {/* အကြီး (Big: 8 to 12) */}
          <button
            disabled={!bettingOpen || submitting}
            onClick={() => handlePlaceBetAction('size', 'အကြီး', settings.OVER_UNDER_MULTIPLIER)}
            className={`group relative flex flex-col items-center justify-between p-3.5 rounded-2xl border transition-all duration-200 ${
              bettingOpen
                ? 'dark-glass hover:bg-white/10 border-white/20 hover:border-white/40 shadow-[0_4px_20px_rgba(0,0,0,0.4)] active:scale-95'
                : 'opacity-40 cursor-not-allowed bg-white/[0.02] border-white/5'
            }`}
          >
            <div className="flex items-center gap-1 text-white font-extrabold text-[11px]">
              <TrendingUp className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
              <span>(၈ မှ ၁၂)</span>
            </div>

            <div className="my-2 flex flex-col items-center">
              <span className="text-xl font-black text-white tracking-tight">
                အကြီး
              </span>
              <span className="text-[10px] text-white/70 font-mono font-bold">Big</span>
            </div>

            <div className="w-full py-1.5 rounded-xl bg-white/10 border border-white/20 text-white font-black text-xs text-center shadow-inner">
              {settings.OVER_UNDER_MULTIPLIER}x ဆ
            </div>
          </button>
        </div>
      ) : (
        /* Specific Number Grid (2 to 12): Dark Glass & Bold White */
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => {
            const isSeven = num === 7;
            const multiplier = isSeven ? settings.SIX_MULTIPLIER : settings.DEFAULT_NUM_MULTIPLIER;
            return (
              <button
                key={num}
                disabled={!bettingOpen || submitting}
                onClick={() => handlePlaceBetAction('number', String(num), multiplier)}
                className={`p-2.5 rounded-xl border flex flex-col items-center justify-between transition-all ${
                  isSeven
                    ? 'col-span-2 sm:col-span-2 dark-glass border-white/30 hover:border-white/50 text-white shadow-md'
                    : 'dark-glass-btn text-white hover:border-white/30'
                } ${!bettingOpen ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'}`}
              >
                <div className="flex items-center gap-1 text-[11px] text-white/80 font-bold">
                  {isSeven && <Sparkles className="w-3 h-3 stroke-white stroke-[2.4]" />}
                  <span>ဂဏန်း {num}</span>
                </div>
                <span className="text-base font-black my-0.5 text-white">{num}</span>
                <span className="text-[10px] font-black text-white/90">
                  {multiplier}x ဆ
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Stake Selection & Chips Control (Dark Glasses Panel with Bold White Text) */}
      <div className="p-3.5 rounded-3xl dark-glass flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs font-bold text-white">
          <span className="flex items-center gap-1.5">
            <Coins className="w-4 h-4 stroke-white stroke-[2.2]" />
            <span>လောင်းကြေးပမာဏ ရွေးချယ်ပါ</span>
          </span>
          <span className="text-white/80 font-bold">
            လက်ကျန်: <strong className="text-white font-black">{formatKs(userBalance)}</strong>
          </span>
        </div>

        {/* Amount Input with +/- Stepper in Dark Glass */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              sounds.playChip();
              setSelectedAmount((prev) => Math.max(settings.MINIMUM_BET, prev - 500));
            }}
            className="p-2.5 rounded-xl dark-glass-btn text-white active:scale-95 transition-all flex items-center justify-center"
            title="Minus 500"
          >
            <Minus className="w-4 h-4 stroke-white stroke-[2.4]" />
          </button>

          <div className="relative flex-1">
            <input
              type="number"
              min={settings.MINIMUM_BET}
              max={userBalance}
              step={100}
              value={selectedAmount}
              onChange={(e) => setSelectedAmount(Math.max(0, Number(e.target.value)))}
              className="w-full text-center py-2 px-3 bg-black/50 rounded-xl border border-white/20 font-black text-white text-base focus:outline-none focus:border-white/50"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/70 font-black">
              Ks
            </span>
          </div>

          <button
            onClick={() => {
              sounds.playChip();
              setSelectedAmount((prev) => Math.min(userBalance, prev + 500));
            }}
            className="p-2.5 rounded-xl dark-glass-btn text-white active:scale-95 transition-all flex items-center justify-center"
            title="Plus 500"
          >
            <Plus className="w-4 h-4 stroke-white stroke-[2.4]" />
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              setSelectedAmount(settings.MINIMUM_BET);
            }}
            className="p-2.5 rounded-xl dark-glass-btn text-white/80 hover:text-white active:scale-95 transition-all flex items-center justify-center"
            title="Reset"
          >
            <RotateCcw className="w-4 h-4 stroke-white stroke-[2.4]" />
          </button>
        </div>

        {/* Quick Chips Bar: Dark Glasses with Bold White Text */}
        <div className="grid grid-cols-6 gap-1.5">
          {CHIP_PRESETS.map((chip) => (
            <button
              key={chip}
              onClick={() => handleChipClick(chip)}
              className="py-2 px-1 rounded-xl dark-glass-btn text-[11px] font-black text-white active:scale-90 transition-all text-center"
            >
              +{chip >= 1000 ? `${chip / 1000}k` : chip}
            </button>
          ))}
        </div>
      </div>

      {/* Accepted Bets in Current Round */}
      {currentRoundBets.length > 0 && (
        <div className="p-3.5 rounded-2xl dark-glass flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-black text-white">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 stroke-white stroke-[2.4]" />
              <span>ယခုပွဲတွင် လောင်းထားသော လောင်းကြေးများ ({currentRoundBets.length})</span>
            </span>
            <span className="text-white font-black">
              စုစုပေါင်း: {formatKs(currentRoundBets.reduce((acc, b) => acc + b.amount, 0))}
            </span>
          </div>

          <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
            {currentRoundBets.map((bet, idx) => (
              <div
                key={`current-round-bet-${bet.betId || idx}-${idx}`}
                className="flex items-center justify-between py-2 px-3 rounded-xl bg-black/40 border border-white/10 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md font-black bg-white/15 text-white border border-white/20">
                    {bet.selection}
                  </span>
                  <span className="text-white/70 font-bold">({bet.multiplier}x ဆ)</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-extrabold text-white">{formatKs(bet.amount)}</span>
                  <span className="text-white font-black text-[11px] bg-white/10 px-2 py-0.5 rounded border border-white/15">
                    နိုင်လျှင် +{formatKs(Math.round(bet.amount * bet.multiplier))}
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

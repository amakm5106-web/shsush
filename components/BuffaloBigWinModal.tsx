'use client';

import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, Check, Sparkles } from 'lucide-react';
import { sounds } from '@/lib/audio';

interface BuffaloBigWinModalProps {
  winAmount: number;
  betAmount: number;
  onClose: () => void;
}

export function BuffaloBigWinModal({ winAmount, betAmount, onClose }: BuffaloBigWinModalProps) {
  const [displayedAmount, setDisplayedAmount] = useState<number>(0);
  const [isCountFinished, setIsCountFinished] = useState<boolean>(false);

  // Multiplier ratio
  const ratio = betAmount > 0 ? winAmount / betAmount : 3;

  // Determine Tier with clean badges
  let tierTitle = 'BIG WIN';
  let tierBurmese = 'ဆုကြေးကြီး!';
  let badgeGradient = 'from-emerald-500/30 to-teal-500/20 border-emerald-400/40 text-emerald-300';

  if (ratio >= 12) {
    tierTitle = 'SUPER WIN';
    tierBurmese = 'စူပါဆုကြေးကြီး!';
    badgeGradient = 'from-purple-500/30 to-pink-500/20 border-purple-400/40 text-purple-200';
  } else if (ratio >= 6) {
    tierTitle = 'MEGA WIN';
    tierBurmese = 'ဆုကြေးမဟာ!';
    badgeGradient = 'from-amber-500/30 to-yellow-500/20 border-amber-400/40 text-amber-200';
  }

  // Count-up animation & Sound effects
  // Rapid tally from 0 to winAmount in ~500ms as requested (0 ကနေ လျင်မြန်စွာတက်သွားရမည်)
  useEffect(() => {
    sounds.playWin();
    confetti({
      particleCount: 90,
      spread: 80,
      origin: { y: 0.5 },
      colors: ['#ffffff', '#f59e0b', '#38bdf8', '#a855f7'],
    });

    const duration = 520; // Fast tally: 520ms
    const startTime = performance.now();

    const frame = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Fast easeOutCubic curve
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * winAmount);
      setDisplayedAmount(current);

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        setDisplayedAmount(winAmount);
        setIsCountFinished(true);
        sounds.playChip();
      }
    };

    const animId = requestAnimationFrame(frame);

    // Auto dismiss after 3.8 seconds
    const autoCloseTimer = setTimeout(() => {
      onClose();
    }, 3800);

    return () => {
      cancelAnimationFrame(animId);
      clearTimeout(autoCloseTimer);
    };
  }, [winAmount, onClose]);

  return (
    <div
      onClick={onClose}
      className="absolute inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-2xl animate-fadeIn select-none cursor-pointer overflow-hidden"
    >
      {/* Subtle Ambient Radial Glow */}
      <div className="absolute w-[280px] h-[280px] sm:w-[360px] sm:h-[360px] rounded-full bg-white/[0.04] blur-3xl pointer-events-none" />

      {/* Main Big Win Card: Premium Dark Glass, Compact Landscape Proportion, Bold White Typography */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-[340px] sm:max-w-md max-h-[92vh] py-2.5 px-3 sm:py-4 sm:px-5 rounded-2xl sm:rounded-3xl bg-zinc-950/90 backdrop-blur-2xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.95)] flex flex-col items-center gap-1.5 sm:gap-2.5 text-center animate-big-win-pop"
      >
        {/* Header: Clean Line Trophy + Tier Pill Badge */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
            <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white stroke-[1.75]" />
          </div>
          <div className={`px-3 py-0.5 sm:py-1 rounded-full bg-gradient-to-r ${badgeGradient} border backdrop-blur-md`}>
            <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-white">
              {tierTitle}
            </span>
          </div>
          <span className="text-[11px] sm:text-xs font-black text-white/90">{tierBurmese}</span>
        </div>

        {/* Rapid Counter Display: Dark Frosted Glass Box + Bold White Numbers */}
        <div className="w-full py-2 px-3 sm:py-3 sm:px-4 rounded-xl sm:rounded-2xl bg-black/70 border border-white/15 shadow-inner flex flex-col items-center">
          <span className="text-[9px] sm:text-[10px] font-bold text-white/60 uppercase tracking-widest">
            အနိုင်ရရှိငွေ (WIN AMOUNT)
          </span>
          <span className="text-2xl sm:text-4xl font-black font-mono tracking-tight text-white my-0.5 sm:my-1 drop-shadow-md">
            Ks {displayedAmount.toLocaleString()}
          </span>
          <span className="text-[10px] sm:text-xs font-bold text-white/80">
            {ratio.toFixed(1)} × လောင်းကြေး
          </span>
        </div>

        {/* Action Button: High-Contrast Crisp White Button with Line Check Icon */}
        <button
          onClick={onClose}
          className="w-full py-2 sm:py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-100 text-black font-black text-xs sm:text-sm shadow-lg active:scale-95 transition-all flex items-center justify-center gap-1.5"
        >
          <Check className="w-4 h-4 stroke-[2.5]" />
          <span>ဆုကြေးရယူမည် (Collect)</span>
        </button>

        <p className="text-[9px] sm:text-[10px] text-white/50 font-medium">
          {isCountFinished ? 'နှိပ်၍ ဆက်လက်ကစားပါ' : 'ဆုကြေးရေတွက်နေသည်...'}
        </p>
      </div>
    </div>
  );
}

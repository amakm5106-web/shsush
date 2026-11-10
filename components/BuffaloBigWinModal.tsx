'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import confetti from 'canvas-confetti';
import { Check, Sparkles, Trophy } from 'lucide-react';
import { sounds } from '@/lib/audio';
import { BuffaloDialog } from './buffalo/BuffaloDialog';

interface BuffaloBigWinModalProps {
  winAmount: number;
  betAmount: number;
  onClose: () => void;
}

export function BuffaloBigWinModal({ winAmount, betAmount, onClose }: BuffaloBigWinModalProps) {
  const [displayedAmount, setDisplayedAmount] = useState<number>(0);
  const [isCountFinished, setIsCountFinished] = useState<boolean>(false);
  const ratio = betAmount > 0 ? winAmount / betAmount : 3;

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

  useEffect(() => {
    sounds.playWin();

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      const frameId = requestAnimationFrame(() => {
        setDisplayedAmount(winAmount);
        setIsCountFinished(true);
      });
      return () => cancelAnimationFrame(frameId);
    }

    confetti({
      particleCount: 90,
      spread: 80,
      origin: { y: 0.5 },
      colors: ['#ffffff', '#f59e0b', '#38bdf8', '#a855f7'],
    });

    const duration = 900;
    const startTime = performance.now();
    let frameId = 0;

    const frame = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayedAmount(Math.round(eased * winAmount));

      if (progress < 1) {
        frameId = requestAnimationFrame(frame);
      } else {
        setDisplayedAmount(winAmount);
        setIsCountFinished(true);
        sounds.playChip();
      }
    };

    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [winAmount]);

  return (
    <BuffaloDialog
      titleId="buffalo-big-win-title"
      descriptionId="buffalo-big-win-description"
      onClose={onClose}
      backdropDismiss={false}
      panelClassName="max-w-[420px] overflow-hidden border-amber-300/30 bg-[radial-gradient(ellipse_at_50%_0%,rgba(245,158,11,.17),transparent_58%),linear-gradient(160deg,rgba(20,20,24,.98),rgba(5,6,10,.98))]"
    >
      <div className="relative flex flex-col items-center gap-3 p-4 text-center sm:gap-4 sm:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/80 to-transparent" />
        <div className="relative h-28 w-28 sm:h-36 sm:w-36">
          <div className="absolute inset-2 rounded-full bg-amber-300/25 blur-2xl" aria-hidden="true" />
          <Image
            src="/assets/slot-vfx/buffalo_super_win_crest.webp"
            alt=""
            fill
            priority
            sizes="144px"
            className="object-contain drop-shadow-[0_0_22px_rgba(245,158,11,0.35)]"
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-200/25 bg-amber-400/10">
            <Trophy className="h-4 w-4 text-amber-200" aria-hidden="true" />
          </span>
          <span className={`rounded-full border bg-gradient-to-r px-3 py-1 text-[11px] font-black tracking-[0.16em] text-white ${badgeGradient}`}>
            {tierTitle}
          </span>
          <span className="text-xs font-black text-white/90">{tierBurmese}</span>
        </div>

        <div className="w-full rounded-2xl border border-amber-200/20 bg-black/60 px-4 py-3 shadow-inner">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">အနိုင်ရငွေ</p>
          <h2 id="buffalo-big-win-title" className="my-1 font-mono text-3xl font-black tracking-tight text-amber-100 drop-shadow sm:text-4xl">
            Ks {displayedAmount.toLocaleString()}
          </h2>
          <p className="text-xs font-bold text-white/75">{ratio.toFixed(1)} × လောင်းကြေး</p>
        </div>

        <p id="buffalo-big-win-description" className="max-w-sm text-xs leading-relaxed text-white/70">
          အနိုင်ရရလဒ်ကို ပြသထားပါသည်။ လက်ကျန်ငွေကို အပေါ်ဘက် Balance တွင် စစ်ဆေးပါ။ နောက် Auto/Free Spin သည် ဤပြကွက်ကို ပိတ်ပြီးမှ ဆက်ပါမည်။
        </p>

        <button
          type="button"
          onClick={onClose}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-amber-200 to-amber-500 px-4 py-3 text-sm font-black text-black shadow-[0_8px_24px_rgba(245,158,11,0.24)] transition hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        >
          {isCountFinished ? <Check className="h-4 w-4" aria-hidden="true" /> : <Sparkles className="h-4 w-4 animate-pulse" aria-hidden="true" />}
          <span>ဆက်လက်ကစားမည်</span>
        </button>
        <p className="text-[10px] text-white/45">ဆက်လက်ကစားရန် ခလုတ်နှိပ်ပါ သို့မဟုတ် Esc ကိုနှိပ်ပါ။</p>
      </div>
    </BuffaloDialog>
  );
}

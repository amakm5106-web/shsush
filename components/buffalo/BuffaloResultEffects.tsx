'use client';

import Image from 'next/image';
import { Gift, RotateCw, Sparkles, Trophy } from 'lucide-react';

export interface BuffaloSpinFeedback {
  id: number;
  kind: 'win' | 'loss' | 'free-win' | 'free-miss' | 'bonus';
  amount: number;
  betAmount: number;
  freeSpinsAwarded?: number;
}

interface BuffaloResultEffectsProps {
  result: BuffaloSpinFeedback | null;
  isSpinning: boolean;
  isFreeSpinActive: boolean;
  betAmount: number;
  message: string;
}

export function BuffaloResultEffects({ result, isSpinning, isFreeSpinActive, betAmount, message }: BuffaloResultEffectsProps) {
  if (isSpinning) {
    return (
      <section className="buffalo-result-rail" role="status" aria-live="polite" aria-atomic="true">
        <div className="buffalo-result-card buffalo-result-card--spinning">
          <RotateCw className="h-5 w-5 shrink-0 animate-spin text-amber-300" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-black text-white">လှည့်နေပါသည်</p>
            <p className="truncate text-[10px] text-white/60">{isFreeSpinActive ? `Free Spin ကုန်ကျ Ks 0 · ဆုတွက်ရန် ${betAmount.toLocaleString()}` : `Reel ရလဒ်ကို စောင့်ကြည့်ပါ · ${betAmount.toLocaleString()}`}</p>
          </div>
        </div>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="buffalo-result-rail" aria-label="ဂိမ်းရလဒ်နေရာ">
        <div className="buffalo-result-card buffalo-result-card--idle">
          <Sparkles className="h-4 w-4 shrink-0 text-amber-300/75" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-white/80">ရလဒ်ကို ဒီနေရာတွင် ပြသပါမည်</p>
            <p className="text-[10px] text-white/45">{isFreeSpinActive ? `Free Spin ကုန်ကျ Ks 0 · ဆုတွက်ရန်အခြေခံ Ks ${betAmount.toLocaleString()}` : `လောင်းကြေး: Ks ${betAmount.toLocaleString()}`}</p>
          </div>
        </div>
      </section>
    );
  }

  const isWin = result.kind === 'win' || result.kind === 'free-win';
  const isBonus = result.kind === 'bonus';
  const Icon = isBonus ? Gift : isWin ? Trophy : RotateCw;
  const title = isBonus
    ? `FREE SPINS ${result.freeSpinsAwarded ?? ''} ကြိမ် ရရှိပါပြီ`
    : result.kind === 'free-win'
    ? 'FREE SPIN အနိုင်ရရှိပါပြီ'
    : result.kind === 'free-miss'
    ? 'ဒီ FREE SPIN မှာ ဆုမရပါ'
    : result.kind === 'win'
    ? 'ဆုကြေးရရှိပါပြီ'
    : 'ဒီလှည့်မှာ ဆုမရပါ';
  const description = isBonus
    ? 'Free Spin တစ်ကြိမ်လှည့်ရန် ကုန်ကျငွေ Ks 0 ဖြစ်ပါသည်။'
    : result.kind === 'free-win'
    ? `လှည့်ခ Ks 0 · ဆုတွက်ရန်အခြေခံ Ks ${betAmount.toLocaleString()}`
    : result.kind === 'free-miss'
    ? `လှည့်ခ Ks 0 · ဆုတွက်ရန်အခြေခံ Ks ${betAmount.toLocaleString()}`
    : result.kind === 'win'
    ? 'ရလဒ်ကို အပေါ်ဘက် Balance နှင့် အောက်ဘက် WIN တွင် စစ်ဆေးနိုင်ပါသည်။'
    : message || 'လောင်းကြေးမှာ Ks ' + result.betAmount.toLocaleString();

  return (
    <section className="buffalo-result-rail" role="status" aria-live="polite" aria-atomic="true">
      <div
        key={result.id}
        className={`buffalo-result-card ${isWin || isBonus ? 'buffalo-result-card--win' : 'buffalo-result-card--settled'}`}
      >
        {(isWin || isBonus) && (
          <div className="buffalo-result-burst" aria-hidden="true">
            <Image
              src="/assets/slot-vfx/buffalo_result_coin_burst.webp"
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, 768px"
              className="object-contain"
            />
          </div>
        )}
        <div className={`buffalo-result-icon ${isWin || isBonus ? 'text-amber-200' : 'text-white/65'}`} aria-hidden="true">
          <Icon className="h-5 w-5" />
        </div>
        <div className="relative z-10 min-w-0 flex-1">
          <p className={`truncate text-xs font-black ${isWin || isBonus ? 'text-amber-100' : 'text-white/90'}`}>{title}</p>
          <p className="truncate text-[10px] text-white/60">{description}</p>
        </div>
        {result.amount > 0 && (
          <div className="relative z-10 shrink-0 text-right">
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/50">အနိုင်ရငွေ</p>
            <p className="font-mono text-sm font-black text-amber-200">+Ks {result.amount.toLocaleString()}</p>
          </div>
        )}
      </div>
    </section>
  );
}

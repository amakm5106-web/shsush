'use client';

import React, { useEffect } from 'react';
import Image from 'next/image';
import { Sparkles, Shield, Flame } from 'lucide-react';

interface BuffaloLoadingScreenProps {
  onComplete: () => void;
}

export function BuffaloLoadingScreen({ onComplete }: BuffaloLoadingScreenProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 700);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      className="buffalo-loading-screen fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#060913] via-[#1c0f07] to-[#0a0502] p-3 text-white"
      role="status"
      aria-live="polite"
      aria-label="ဂိမ်းကို စတင်ရန် ပြင်ဆင်နေပါသည်"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(245,158,11,0.2),transparent_70%)]" />
      <div className="pointer-events-none absolute h-[420px] w-[420px] rounded-full bg-[conic-gradient(from_0deg_at_50%_50%,rgba(245,158,11,0.12)_0deg,transparent_20deg,rgba(245,158,11,0.12)_40deg,transparent_60deg,rgba(245,158,11,0.12)_80deg,transparent_100deg,rgba(245,158,11,0.12)_120deg,transparent_140deg,rgba(245,158,11,0.12)_160deg,transparent_180deg,rgba(245,158,11,0.12)_200deg,transparent_220deg,rgba(245,158,11,0.12)_240deg,transparent_260deg,rgba(245,158,11,0.12)_280deg,transparent_300deg,rgba(245,158,11,0.12)_320deg,transparent_340deg,rgba(245,158,11,0.12)_360deg)] animate-sunburst" />

      <div className="relative z-10 flex w-full max-w-xs flex-col items-center gap-3 text-center">
        <div className="relative">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-amber-300 via-yellow-500 to-amber-700 p-1 shadow-[0_0_35px_rgba(245,158,11,0.6)]">
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[14px] border border-amber-200/50 bg-black">
              <Image
                src="/assets/slot-symbols/individual/buffalo.webp"
                alt="Charge Buffalo"
                fill
                sizes="80px"
                className="scale-105 object-cover"
                onError={(event) => {
                  (event.target as HTMLImageElement).src = '/assets/slot-symbols/individual/buffalo.png';
                }}
              />
            </div>
          </div>
          <Sparkles className="absolute -right-1 -top-1 h-5 w-5 animate-spin text-amber-300" aria-hidden="true" />
          <Flame className="absolute -bottom-1 -left-1 h-5 w-5 animate-bounce text-red-500" aria-hidden="true" />
        </div>

        <div>
          <h1
            className="text-2xl font-black font-serif uppercase tracking-tight"
            style={{
              background: 'linear-gradient(180deg, #fffbeb 0%, #fbbf24 45%, #b45309 85%, #78350f 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.9))',
            }}
          >
            CHARGE BUFFALO
          </h1>
          <p className="mt-1 flex items-center justify-center gap-1 text-[11px] font-black tracking-wide text-amber-200/90">
            <Shield className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            <span>4,096 WAYS CASINO SLOT</span>
          </p>
        </div>

        <div className="w-full space-y-2 px-2">
          <div className="h-2 overflow-hidden rounded-full border border-amber-500/40 bg-black/80 p-0.5 shadow-inner">
            <div className="buffalo-loading-indicator h-full w-2/5 rounded-full bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-300 shadow-[0_0_12px_#f59e0b]" />
          </div>
          <p className="text-[11px] font-bold text-amber-100/85">ဂိမ်းခန်းကို ပြင်ဆင်နေပါသည်…</p>
        </div>
      </div>
    </div>
  );
}

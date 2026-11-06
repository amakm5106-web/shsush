'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Shield, Flame } from 'lucide-react';

interface BuffaloLoadingScreenProps {
  onComplete: () => void;
}

export function BuffaloLoadingScreen({ onComplete }: BuffaloLoadingScreenProps) {
  const [progress, setProgress] = useState<number>(10);
  const [statusText, setStatusText] = useState<string>('ဂိမ်းအချက်အလက်များ ဆွဲတင်နေသည်...');

  useEffect(() => {
    const timer1 = setTimeout(() => {
      setProgress(45);
      setStatusText('4,096 Ways Slot Matrix ပြင်ဆင်နေသည်...');
    }, 250);

    const timer2 = setTimeout(() => {
      setProgress(80);
      setStatusText('WILD Multipliers & စနစ်များ စစ်ဆေးနေသည်...');
    }, 600);

    const timer3 = setTimeout(() => {
      setProgress(100);
      setStatusText('အသင့်ဖြစ်ပါပြီ! ဂိမ်းစတင်ပါပြီ...');
    }, 950);

    const timer4 = setTimeout(() => {
      onComplete();
    }, 1150);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-3 bg-gradient-to-b from-[#060913] via-[#1c0f07] to-[#0a0502] text-white select-none overflow-hidden">
      {/* Background Radial Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(245,158,11,0.2),transparent_70%)] pointer-events-none" />

      {/* Sunburst background rays */}
      <div className="absolute w-[420px] h-[420px] rounded-full bg-[conic-gradient(from_0deg_at_50%_50%,rgba(245,158,11,0.12)_0deg,transparent_20deg,rgba(245,158,11,0.12)_40deg,transparent_60deg,rgba(245,158,11,0.12)_80deg,transparent_100deg,rgba(245,158,11,0.12)_120deg,transparent_140deg,rgba(245,158,11,0.12)_160deg,transparent_180deg,rgba(245,158,11,0.12)_200deg,transparent_220deg,rgba(245,158,11,0.12)_240deg,transparent_260deg,rgba(245,158,11,0.12)_280deg,transparent_300deg,rgba(245,158,11,0.12)_320deg,transparent_340deg,rgba(245,158,11,0.12)_360deg)] animate-sunburst pointer-events-none" />

      {/* Center Hero Emblem - compact landscape safe */}
      <div className="relative z-10 flex flex-col items-center gap-2.5 max-w-xs w-full text-center">
        {/* Buffalo Emblem */}
        <div className="relative">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl p-1 bg-gradient-to-br from-amber-300 via-yellow-500 to-amber-700 shadow-[0_0_35px_rgba(245,158,11,0.6)] animate-pulse">
            <div className="w-full h-full rounded-[14px] overflow-hidden bg-black flex items-center justify-center border border-amber-200/50">
              <img
                src="/assets/slot-symbols/individual/buffalo.png"
                alt="Charge Buffalo"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover scale-105"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/assets/slot-symbols/individual/buffalo.webp';
                }}
              />
            </div>
          </div>
          <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-amber-300 fill-amber-300 animate-spin" />
          <Flame className="absolute -bottom-1 -left-1 w-5 h-5 text-red-500 fill-red-500 animate-bounce" />
        </div>

        {/* 3D Title */}
        <div>
          <h1
            className="text-xl sm:text-2xl font-black font-serif uppercase tracking-tight"
            style={{
              background: 'linear-gradient(180deg, #fffbeb 0%, #fbbf24 45%, #b45309 85%, #78350f 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.9))',
            }}
          >
            CHARGE BUFFALO
          </h1>
          <p className="text-[11px] font-black text-amber-200/90 tracking-wide flex items-center justify-center gap-1 mt-0.5">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span>4,096 WAYS CASINO SLOT</span>
          </p>
        </div>

        {/* Progress Bar Container */}
        <div className="w-full space-y-1 px-2 mt-1">
          <div className="w-full h-2.5 bg-black/80 rounded-full border border-amber-500/50 p-0.5 overflow-hidden shadow-inner relative">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-300 shadow-[0_0_12px_#f59e0b] transition-all duration-300 ease-out relative"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] font-bold text-amber-300/80 px-1">
            <span className="truncate">{statusText}</span>
            <span className="font-mono font-black text-amber-300">{progress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

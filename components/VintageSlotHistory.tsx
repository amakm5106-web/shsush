'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  RotateCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Table as TableIcon,
  ChevronDown,
  ChevronUp,
  Gauge,
  Layers,
} from 'lucide-react';
import { GameRound } from '@/lib/types';
import { sounds } from '@/lib/audio';
import { RoundHistoryTable } from './RoundHistoryTable';

interface VintageSlotHistoryProps {
  rounds: GameRound[];
  currentRoundId?: number;
  isGameRolling?: boolean;
  latestSettledResult?: {
    roundId: number;
    dice1: number;
    dice2: number;
    total: number;
    resultClass: 'small' | 'common' | 'big';
  };
}

interface ReelItem {
  id: string;
  roundId: number;
  dice1: number;
  dice2: number;
  total: number;
  resultClass: 'small' | 'common' | 'big';
}

// Preset decorative strip items for continuous mechanical slot spin
const MOCK_STRIP: Array<{ d1: number; d2: number; total: number; cls: 'small' | 'common' | 'big' }> = [
  { d1: 1, d2: 2, total: 3, cls: 'small' },
  { d1: 2, d2: 4, total: 6, cls: 'small' },
  { d1: 3, d2: 4, total: 7, cls: 'common' },
  { d1: 4, d2: 5, total: 9, cls: 'big' },
  { d1: 5, d2: 5, total: 10, cls: 'big' },
  { d1: 6, d2: 6, total: 12, cls: 'big' },
  { d1: 1, d2: 1, total: 2, cls: 'small' },
  { d1: 2, d2: 3, total: 5, cls: 'small' },
  { d1: 3, d2: 5, total: 8, cls: 'big' },
  { d1: 5, d2: 6, total: 11, cls: 'big' },
  { d1: 4, d2: 3, total: 7, cls: 'common' },
  { d1: 2, d2: 2, total: 4, cls: 'small' },
];

export function VintageSlotHistory({
  rounds,
  currentRoundId = 101,
  isGameRolling = false,
  latestSettledResult,
}: VintageSlotHistoryProps) {
  // Mode: 'recent5' = 5 Recent Rounds | 'breakdown' = Die 1, Die 2, Sum, Size, Round
  const [viewMode, setViewMode] = useState<'recent5' | 'breakdown'>('recent5');
  const [showFullTable, setShowFullTable] = useState<boolean>(false);

  // Reel spinning states for 5 reels
  const [reelSpinning, setReelSpinning] = useState<boolean[]>([false, false, false, false, false]);
  const [settleBounce, setSettleBounce] = useState<boolean[]>([false, false, false, false, false]);

  const lastProcessedSettledId = useRef<number | null>(null);
  const spinTimeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // Prepare data for the 5 reels:
  // In 'recent5' mode: Reels 1 to 5 show the last 5 rounds from oldest to newest (Reel 5 is newest)
  const recentFiveRounds = useMemo<ReelItem[]>(() => {
    const list: ReelItem[] = [];
    const validRounds = rounds.slice(0, 5).reverse();

    for (let i = 0; i < 5; i++) {
      if (validRounds[i]) {
        const r = validRounds[i];
        const d1 = r.dice1 ?? 3;
        const d2 = r.dice2 ?? 4;
        const total = r.totalResult ?? d1 + d2;
        list.push({
          id: `reel-data-${r.roundId}-${i}`,
          roundId: r.roundId,
          dice1: d1,
          dice2: d2,
          total,
          resultClass: r.resultClass || (total === 7 ? 'common' : total >= 8 ? 'big' : 'small'),
        });
      } else {
        const fallbackId = Math.max(1, currentRoundId - (5 - i));
        const sample = MOCK_STRIP[i % MOCK_STRIP.length];
        list.push({
          id: `fallback-reel-${fallbackId}-${i}`,
          roundId: fallbackId,
          dice1: sample.d1,
          dice2: sample.d2,
          total: sample.total,
          resultClass: sample.cls,
        });
      }
    }
    return list;
  }, [rounds, currentRoundId]);

  // Master function to execute staggered mechanical slot spin
  const triggerMechanicalSpin = () => {
    spinTimeoutsRef.current.forEach(clearTimeout);
    spinTimeoutsRef.current = [];

    // All 5 reels start spinning simultaneously
    setReelSpinning([true, true, true, true, true]);
    setSettleBounce([false, false, false, false, false]);
    sounds.playReelSpin();

    // Staggered stops: Reel 1 stops first, followed sequentially by 2, 3, 4, 5
    const delays = [850, 1250, 1650, 2050, 2450];

    delays.forEach((delay, idx) => {
      const t = setTimeout(() => {
        setReelSpinning((prev) => {
          const next = [...prev];
          next[idx] = false;
          return next;
        });

        setSettleBounce((prev) => {
          const next = [...prev];
          next[idx] = true;
          return next;
        });
        sounds.playReelStop();

        const bounceClear = setTimeout(() => {
          setSettleBounce((prev) => {
            const next = [...prev];
            next[idx] = false;
            return next;
          });
        }, 320);
        spinTimeoutsRef.current.push(bounceClear);
      }, delay);

      spinTimeoutsRef.current.push(t);
    });
  };

  // Adjust spinning state when isGameRolling prop changes (React recommended pattern)
  const [prevGameRolling, setPrevGameRolling] = useState<boolean>(isGameRolling);
  if (isGameRolling !== prevGameRolling) {
    setPrevGameRolling(isGameRolling);
    if (isGameRolling) {
      setReelSpinning([true, true, true, true, true]);
      setSettleBounce([false, false, false, false, false]);
    }
  }

  // Audio feedback on rolling transition
  useEffect(() => {
    if (isGameRolling) {
      sounds.playReelSpin();
    }
  }, [isGameRolling]);

  // When a new settled result arrives from API, trigger staggered slot reel stop
  useEffect(() => {
    if (latestSettledResult && latestSettledResult.roundId) {
      if (lastProcessedSettledId.current !== latestSettledResult.roundId) {
        lastProcessedSettledId.current = latestSettledResult.roundId;
        const timer = setTimeout(() => {
          triggerMechanicalSpin();
        }, 30);
        return () => clearTimeout(timer);
      }
    }
  }, [latestSettledResult]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      spinTimeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="w-full flex flex-col gap-3">
      {/* 1. Frosted Dark Glass Slot Machine Cabinet (Zero Eye-Straining Colors, Pure Dark Glass & White Bold) */}
      <div className="relative w-full rounded-3xl p-3.5 sm:p-4 dark-glass border border-white/15 shadow-[0_16px_40px_rgba(0,0,0,0.85)] overflow-hidden">
        {/* Subtle Glass Rivets in Corners */}
        <div className="absolute top-2.5 left-2.5 w-2 h-2 rounded-full bg-white/20 border border-white/30" />
        <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-white/20 border border-white/30" />
        <div className="absolute bottom-2.5 left-2.5 w-2 h-2 rounded-full bg-white/20 border border-white/30" />
        <div className="absolute bottom-2.5 right-2.5 w-2 h-2 rounded-full bg-white/20 border border-white/30" />

        {/* Cabinet Header Bar with Line Action Icons and White Bold Text */}
        <div className="flex items-center justify-between pb-3 mb-2.5 border-b border-white/15">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-white/10 border border-white/20 text-white shadow-md">
              <Gauge className="w-4 h-4 stroke-white stroke-[2.4]" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black tracking-tight text-white uppercase">
                  Slot Reel History
                </span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-white">
                  5 Reels
                </span>
              </div>
              <p className="text-[10px] text-white/70 font-bold">
                ပွဲစဉ်ရလဒ် မှတ်တမ်း လည်ပတ်ဘီးစနစ်
              </p>
            </div>
          </div>

          {/* Action buttons: Dark Glasses background with White Bold text & Line action icons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                sounds.playChip();
                setViewMode(viewMode === 'recent5' ? 'breakdown' : 'recent5');
              }}
              className="py-1.5 px-3 rounded-xl dark-glass-btn hover:bg-white/15 border-white/20 text-white text-[11px] font-black active:scale-95 transition-all flex items-center gap-1.5"
              title="Toggle View Mode"
            >
              <Layers className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
              <span className="hidden sm:inline">
                {viewMode === 'recent5' ? '၅ ပွဲဆက်' : 'ပွဲခွဲခြမ်း'}
              </span>
            </button>

            <button
              onClick={triggerMechanicalSpin}
              disabled={reelSpinning.some(Boolean)}
              className="py-1.5 px-3 rounded-xl dark-glass-btn hover:bg-white/20 border-white/30 text-white font-black text-[11px] active:scale-95 transition-all shadow-md disabled:opacity-40 flex items-center gap-1.5"
              title="Manual Mechanical Reel Spin"
            >
              <RotateCcw
                className={`w-3.5 h-3.5 stroke-white stroke-[2.4] ${
                  reelSpinning.some(Boolean) ? 'animate-spin' : ''
                }`}
              />
              <span>စမ်းသပ်လှည့်</span>
            </button>
          </div>
        </div>

        {/* 2. The 5-Reel Physical Housing Cavity (Dark Glass Background with Deep Inset Shadow) */}
        <div className="relative w-full rounded-2xl bg-black/65 border border-white/15 p-2 sm:p-2.5 shadow-[inset_0_4px_24px_rgba(0,0,0,0.95)] backdrop-blur-xl">
          {/* Center Payline Glass Indicator Tabs (Left and Right) */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 z-30 pointer-events-none flex items-center">
            <div className="w-2.5 h-4 bg-white/20 border border-white/40 rounded-r-md shadow-[0_0_8px_rgba(255,255,255,0.3)]" />
            <div className="h-[2px] w-2 bg-white/60" />
          </div>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 z-30 pointer-events-none flex items-center">
            <div className="h-[2px] w-2 bg-white/60" />
            <div className="w-2.5 h-4 bg-white/20 border border-white/40 rounded-l-md shadow-[0_0_8px_rgba(255,255,255,0.3)]" />
          </div>

          {/* Center Payline Frosted Glass Guide Overlay */}
          <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-14 sm:h-16 pointer-events-none z-20 border-y border-white/25 bg-white/[0.05] shadow-[0_0_12px_rgba(255,255,255,0.08)] backdrop-contrast-125" />

          {/* Upper Cylindrical Curvature Shadow & Blur Vignette */}
          <div className="absolute inset-x-0 top-0 h-14 sm:h-16 pointer-events-none z-25 bg-gradient-to-b from-black/90 via-black/70 to-transparent backdrop-blur-[1.5px]" />

          {/* Lower Cylindrical Curvature Shadow & Blur Vignette */}
          <div className="absolute inset-x-0 bottom-8 h-14 sm:h-16 pointer-events-none z-25 bg-gradient-to-t from-black/90 via-black/70 to-transparent backdrop-blur-[1.5px]" />

          {/* 3. The 5 Mechanical Reels Array */}
          <div className="w-full grid grid-cols-5 gap-1.5 sm:gap-2">
            {[0, 1, 2, 3, 4].map((index) => {
              const isSpinning = reelSpinning[index];
              const isBouncing = settleBounce[index];
              const item = recentFiveRounds[index];

              const breakdownLabel =
                index === 0
                  ? `#${item.roundId}`
                  : index === 1
                  ? `${item.dice1}`
                  : index === 2
                  ? `${item.dice2}`
                  : index === 3
                  ? `${item.total}`
                  : item.resultClass === 'common'
                  ? 'ဘုံ ၇'
                  : item.resultClass === 'big'
                  ? 'အကြီး'
                  : 'အသေး';

              return (
                <div key={`slot-reel-${index}`} className="flex flex-col items-center">
                  {/* Single Reel Drum Frame (Dark Frosted Glass Cylinder) */}
                  <div className="relative w-full h-40 sm:h-44 rounded-xl overflow-hidden bg-black/60 border border-white/15 shadow-[inset_0_0_12px_rgba(0,0,0,0.8)] backdrop-blur-md flex flex-col justify-center items-center">
                    {/* Metal Spindle Edge Highlights on Left & Right */}
                    <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-r from-white/15 to-transparent opacity-60 z-10" />
                    <div className="absolute inset-y-0 right-0 w-1 bg-gradient-to-l from-white/15 to-transparent opacity-60 z-10" />

                    {/* Reel Face Content Container */}
                    <div
                      className={`w-full flex flex-col items-center justify-center transition-all duration-300 ${
                        isSpinning
                          ? 'animate-slot-spinning filter blur-[4.5px]'
                          : isBouncing
                          ? 'animate-slot-bounce filter blur-0'
                          : 'filter blur-0'
                      }`}
                    >
                      {/* Row -1: Upper Symbol (Curving away, blurred with progressive blur, White Bold) */}
                      <div className="h-12 flex flex-col items-center justify-center opacity-30 filter blur-[2px] scale-90 select-none">
                        <span className="font-mono text-xs font-black text-white/60">
                          {viewMode === 'recent5' ? `#${item.roundId - 1}` : '6'}
                        </span>
                        <span className="font-mono text-sm font-black text-white/80">
                          {((item.total + 2) % 11) + 2}
                        </span>
                      </div>

                      {/* Row 0: Center Payline Symbol (100% Crystal-Clear Focus, High Contrast White Bold) */}
                      <div className="h-14 sm:h-16 w-full flex flex-col items-center justify-center px-0.5 select-none z-10">
                        {viewMode === 'recent5' ? (
                          <>
                            {/* Round Badge */}
                            <span className="text-[10px] sm:text-[11px] font-mono font-black text-white/80 tracking-tight leading-none">
                              #{item.roundId}
                            </span>

                            {/* Dice Sum Total (High Impact Crystal-Clear White Bold Numeral) */}
                            <span className="text-xl sm:text-2xl font-black font-mono text-white leading-none drop-shadow-md my-0.5">
                              {item.total}
                            </span>

                            {/* Dice Formula & Category Pill (White Bold, Dark Glasses Tag) */}
                            <div className="flex items-center gap-1 leading-none">
                              <span className="text-[9px] font-mono font-black text-white/90">
                                {item.dice1}+{item.dice2}
                              </span>
                              <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-white/15 border border-white/25 text-white flex items-center gap-0.5">
                                {item.resultClass === 'common' ? (
                                  <>
                                    <Sparkles className="w-2.5 h-2.5 stroke-white stroke-[2.4]" />
                                    <span>၇</span>
                                  </>
                                ) : item.resultClass === 'big' ? (
                                  <>
                                    <TrendingUp className="w-2.5 h-2.5 stroke-white stroke-[2.4]" />
                                    <span>ကြီး</span>
                                  </>
                                ) : (
                                  <>
                                    <TrendingDown className="w-2.5 h-2.5 stroke-white stroke-[2.4]" />
                                    <span>သေး</span>
                                  </>
                                )}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="text-[9px] font-black text-white/70">
                              {index === 0
                                ? 'ပွဲစဉ်'
                                : index === 1
                                ? 'အံစာ ၁'
                                : index === 2
                                ? 'အံစာ ၂'
                                : index === 3
                                ? 'ပေါင်းလဒ်'
                                : 'ရလဒ်'}
                            </span>
                            <span className="text-sm sm:text-base font-black text-white my-0.5">
                              {breakdownLabel}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Row +1: Lower Symbol (Curving away, blurred with progressive blur, White Bold) */}
                      <div className="h-12 flex flex-col items-center justify-center opacity-30 filter blur-[2px] scale-90 select-none">
                        <span className="font-mono text-xs font-black text-white/60">
                          {viewMode === 'recent5' ? `#${item.roundId + 1}` : '2'}
                        </span>
                        <span className="font-mono text-sm font-black text-white/80">
                          {((item.total + 5) % 11) + 2}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 4. Bottom Bracket & Numbered Tag Plate [ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ] */}
                  {/* Dark Glass Base with Bold White Numerals */}
                  <div className="w-full mt-1.5 flex flex-col items-center">
                    {/* Dark Glass Strut Shaft */}
                    <div className="w-3 h-1 bg-white/20 rounded-t border-t border-white/30" />

                    {/* Number Tag Plate: 1, 2, 3, 4, 5 */}
                    <div className="w-full max-w-[50px] rounded-lg overflow-hidden border border-white/20 dark-glass shadow-md">
                      {/* Top Glass Accent Strip */}
                      <div className="w-full h-1.5 bg-white/20 border-b border-white/15 flex items-center justify-center">
                        <div className="w-1.5 h-0.5 rounded-full bg-white/50" />
                      </div>

                      {/* Dark Glass Number Base Plate with Bold White Numeral */}
                      <div className="w-full bg-black/60 py-1 flex items-center justify-center">
                        <span className="text-xs sm:text-sm font-black font-mono text-white leading-none">
                          {index + 1}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 5. Bottom Status & Summary Bar (Dark Glass & White Bold) */}
        <div className="mt-3 flex items-center justify-between text-xs text-white px-1">
          <div className="flex items-center gap-2 font-black">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse border border-white/40" />
            <span className="text-white font-black text-[11px] sm:text-xs">
              {reelSpinning.some(Boolean)
                ? 'စက်လည်ပတ်နေသည်...'
                : `နောက်ဆုံးရလဒ်: ${recentFiveRounds[4]?.dice1 ?? 3}+${
                    recentFiveRounds[4]?.dice2 ?? 4
                  }=${recentFiveRounds[4]?.total ?? 7} (${
                    recentFiveRounds[4]?.resultClass === 'common'
                      ? 'ဘုံ ၇'
                      : recentFiveRounds[4]?.resultClass === 'big'
                      ? 'အကြီး'
                      : 'အသေး'
                  })`}
            </span>
          </div>

          {/* Toggle Full Historical Table (Dark Glass Button with White Bold Text & Line Action Icon) */}
          <button
            onClick={() => {
              sounds.playChip();
              setShowFullTable(!showFullTable);
            }}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl dark-glass-btn hover:bg-white/20 border-white/20 text-white font-black text-[11px] active:scale-95 transition-all shadow-sm"
          >
            <TableIcon className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
            <span>{showFullTable ? 'ဇယားပိတ်' : 'ဇယားအပြည့်'}</span>
            {showFullTable ? (
              <ChevronUp className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
            )}
          </button>
        </div>
      </div>

      {/* Expandable Full History Table (When requested) */}
      {showFullTable && (
        <div className="w-full animate-in fade-in slide-in-from-top-2 duration-200">
          <RoundHistoryTable rounds={rounds} />
        </div>
      )}
    </div>
  );
}

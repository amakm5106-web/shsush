'use client';

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Dices, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { sounds } from '@/lib/audio';
import { classifyDiceTotal, getResultClassLabel } from '@/lib/constants';

interface DiceRollerProps {
  dice1: number;
  dice2: number;
  isRolling: boolean;
  totalResult?: number;
  resultClass?: 'small' | 'common' | 'big';
  showSummary?: boolean;
}

function DieFacePip({ faceNumber }: { faceNumber: number }) {
  switch (faceNumber) {
    case 1:
      return (
        <div className="flex items-center justify-center w-full h-full">
          <span className="w-6 h-6 rounded-full bg-red-600 shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)] ring-1 ring-red-400/40" />
        </div>
      );
    case 2:
      return (
        <div className="flex flex-col justify-between w-full h-full p-2.5">
          <span className="w-3.5 h-3.5 rounded-full bg-slate-900 self-start shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
          <span className="w-3.5 h-3.5 rounded-full bg-slate-900 self-end shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
        </div>
      );
    case 3:
      return (
        <div className="flex justify-between w-full h-full p-2.5 relative">
          <span className="w-3.5 h-3.5 rounded-full bg-slate-900 self-start shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
          <span className="w-3.5 h-3.5 rounded-full bg-slate-900 self-center absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
          <span className="w-3.5 h-3.5 rounded-full bg-slate-900 self-end shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
        </div>
      );
    case 4:
      return (
        <div className="flex flex-col justify-between w-full h-full p-2.5">
          <div className="flex justify-between">
            <span className="w-3.5 h-3.5 rounded-full bg-red-600 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-red-400/40" />
            <span className="w-3.5 h-3.5 rounded-full bg-red-600 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-red-400/40" />
          </div>
          <div className="flex justify-between">
            <span className="w-3.5 h-3.5 rounded-full bg-red-600 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-red-400/40" />
            <span className="w-3.5 h-3.5 rounded-full bg-red-600 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-red-400/40" />
          </div>
        </div>
      );
    case 5:
      return (
        <div className="flex flex-col justify-between w-full h-full p-2.5 relative">
          <div className="flex justify-between">
            <span className="w-3.5 h-3.5 rounded-full bg-slate-900 shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
            <span className="w-3.5 h-3.5 rounded-full bg-slate-900 shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
          </div>
          <span className="w-3.5 h-3.5 rounded-full bg-red-600 self-center absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-red-400/40" />
          <div className="flex justify-between">
            <span className="w-3.5 h-3.5 rounded-full bg-slate-900 shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
            <span className="w-3.5 h-3.5 rounded-full bg-slate-900 shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
          </div>
        </div>
      );
    case 6:
      return (
        <div className="flex flex-col justify-between w-full h-full p-2">
          <div className="flex justify-between">
            <span className="w-3 h-3 rounded-full bg-slate-900 shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
            <span className="w-3 h-3 rounded-full bg-slate-900 shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
          </div>
          <div className="flex justify-between">
            <span className="w-3 h-3 rounded-full bg-slate-900 shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
            <span className="w-3 h-3 rounded-full bg-slate-900 shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
          </div>
          <div className="flex justify-between">
            <span className="w-3 h-3 rounded-full bg-slate-900 shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
            <span className="w-3 h-3 rounded-full bg-slate-900 shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
          </div>
        </div>
      );
    default:
      return <span className="font-black text-slate-800 text-2xl">{faceNumber}</span>;
  }
}

function RealisticDieComponent({
  value,
  isRolling,
  delay = 0,
}: {
  value: number;
  isRolling: boolean;
  delay?: number;
}) {
  const getRotationClass = (val: number) => {
    switch (val) {
      case 1:
        return 'show-1';
      case 2:
        return 'show-2';
      case 3:
        return 'show-3';
      case 4:
        return 'show-4';
      case 5:
        return 'show-5';
      case 6:
        return 'show-6';
      default:
        return 'show-1';
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center shrink-0">
      {/* 3D Soft Contact Shadow */}
      <div className="absolute -bottom-2 w-16 h-3.5 bg-black/70 rounded-full blur-md pointer-events-none" />

      {isRolling ? (
        <div className="dice-scene">
          <div
            className="dice-cube dice-tumbling"
            style={{
              animationDelay: `${delay}s`,
            }}
          >
            <div className="dice-face dice-face-1"><DieFacePip faceNumber={1} /></div>
            <div className="dice-face dice-face-6"><DieFacePip faceNumber={6} /></div>
            <div className="dice-face dice-face-2"><DieFacePip faceNumber={2} /></div>
            <div className="dice-face dice-face-5"><DieFacePip faceNumber={5} /></div>
            <div className="dice-face dice-face-3"><DieFacePip faceNumber={3} /></div>
            <div className="dice-face dice-face-4"><DieFacePip faceNumber={4} /></div>
          </div>
        </div>
      ) : (
        <motion.div
          key={`settled-die-${value}`}
          initial={{ scale: 0.9, y: -6, rotate: -4 }}
          animate={{ scale: 1, y: 0, rotate: 0 }}
          transition={{ type: 'spring', damping: 15, stiffness: 300 }}
          className="realistic-die transition-transform"
        >
          <DieFacePip faceNumber={value} />
        </motion.div>
      )}
    </div>
  );
}

export function DiceRoller({
  dice1,
  dice2,
  isRolling,
  totalResult,
  resultClass,
  showSummary = true,
}: DiceRollerProps) {
  const currentTotal = totalResult ?? dice1 + dice2;
  const currentClass = resultClass ?? classifyDiceTotal(currentTotal);

  useEffect(() => {
    if (isRolling) {
      sounds.playDiceRoll();
      if (
        typeof window !== 'undefined' &&
        (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred: (style: string) => void } } } }).Telegram?.WebApp?.HapticFeedback
      ) {
        (window as unknown as { Telegram: { WebApp: { HapticFeedback: { impactOccurred: (style: string) => void } } } }).Telegram.WebApp.HapticFeedback.impactOccurred('medium');
      }
    }
  }, [isRolling]);

  return (
    <div className="w-full flex flex-col items-center justify-center py-1 select-none">
      {/* 3D Dice Stage with Dark Frosted Glass */}
      <div className="relative dark-glass p-5 rounded-3xl border border-white/20 shadow-[0_12px_40px_0_rgba(0,0,0,0.85)] flex flex-row items-center justify-center gap-7 sm:gap-10 min-h-[140px] w-full max-w-sm overflow-hidden backdrop-blur-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

        {/* Both Dice Side-by-Side (Never Wraps) */}
        <div className="flex flex-row items-center justify-center gap-7 sm:gap-10 z-10">
          <RealisticDieComponent value={dice1} isRolling={isRolling} delay={0} />
          <RealisticDieComponent value={dice2} isRolling={isRolling} delay={0.12} />
        </div>

        {isRolling && (
          <div className="absolute top-2 inset-x-0 flex items-center justify-center z-20">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-white/10 text-white border border-white/20 backdrop-blur-md animate-pulse">
              <Dices className="w-3.5 h-3.5 stroke-white stroke-[2.2] animate-spin" />
              <span>အံစာတုံး လှည့်နေပါသည်...</span>
            </span>
          </div>
        )}
      </div>

      {/* Outcome Showcase in Crisp Bold White */}
      {showSummary && !isRolling && (
        <AnimatePresence mode="wait">
          <motion.div
            key={`${dice1}-${dice2}-${currentTotal}`}
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-3 flex flex-col items-center text-center"
          >
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-white/90 tracking-tight font-sans">
                {dice1} + {dice2} =
              </span>
              <span className="text-3xl font-black text-white tracking-tight px-3 py-0.5 rounded-xl bg-white/10 border border-white/20 shadow-md font-sans">
                {currentTotal}
              </span>
            </div>

            <div className="mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black text-white bg-white/15 border border-white/25 shadow-lg backdrop-blur-md">
              {currentClass === 'common' && <Sparkles className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />}
              {currentClass === 'big' && <TrendingUp className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />}
              {currentClass === 'small' && <TrendingDown className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />}
              <span className="font-black">{getResultClassLabel(currentClass)}</span>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

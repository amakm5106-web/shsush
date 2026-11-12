'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import {
  RotateCcw,
  Sparkles,
  Coins,
  Plus,
  Flame,
  CheckCircle2,
  X,
  Volume2,
  VolumeX,
  Maximize2,
  RotateCw,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { UserProfile, GameSettings, PlayerBet } from '@/lib/types';
import { formatKs } from '@/lib/constants';
import { sounds } from '@/lib/audio';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BuffaloSymbolImage } from './BuffaloSymbolImage';
import { BuffaloLoadingScreen } from './BuffaloLoadingScreen';
import { BuffaloBigWinModal } from './BuffaloBigWinModal';
import { BuffaloDialog } from './buffalo/BuffaloDialog';
import { BuffaloResultEffects } from './buffalo/BuffaloResultEffects';
import type { BuffaloSpinFeedback } from './buffalo/BuffaloResultEffects';

interface BuffaloSlotGameProps {
  user: UserProfile | null;
  settings: GameSettings;
  onBackToLobby: () => void;
  onGoToWallet: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onUpdateUserBalance?: (newBalance: number) => void;
  onRequireAuth?: () => void;
}

// Tight House-Edge Casino Math: Lowered RTP (~80-84%), 9% Base Regular Hit Rate
// Payouts and hit rates dynamically scale down on high stakes to protect casino bankroll.
const SYMBOL_PAYOUTS: Record<string, { name: string; p3: number; p4: number; p5: number }> = {
  buffalo: { name: 'ကျွဲရွှေ (Buffalo)', p3: 0.40, p4: 0.75, p5: 1.25 },
  eagle: { name: 'လင်းယုန် (Eagle)', p3: 0.30, p4: 0.55, p5: 0.95 },
  bear: { name: 'ဝက်ဝံ (Bear)', p3: 0.20, p4: 0.40, p5: 0.70 },
  wolf: { name: 'ဝံပုလွေ (Wolf)', p3: 0.15, p4: 0.30, p5: 0.50 },
  moose: { name: 'သမင်/မုစ် (Moose)', p3: 0.10, p4: 0.20, p5: 0.35 },
};

// Available Bet Options
const BET_OPTIONS = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];

// Five reels × four rows, matching the attached Cocos scene.
const INITIAL_REELS: string[][] = [
  ['card_a', 'card_10', 'bear', 'card_k'],
  ['moose', 'card_9', 'wild', 'card_q'],
  ['card_j', 'scatter', 'buffalo', 'card_10'],
  ['eagle', 'card_k', 'card_a', 'wolf'],
  ['card_q', 'buffalo', 'card_j', 'card_9'],
];

// Continuous rolling strips for 60fps downward reel spin animation.
const COLUMN_SPIN_STRIPS: string[][] = [
  ['card_a', 'buffalo', 'card_9', 'eagle', 'card_q', 'bear', 'card_j', 'card_10'],
  ['wild', 'card_k', 'moose', 'card_10', 'scatter', 'card_a', 'bear', 'card_9'],
  ['card_q', 'wolf', 'card_j', 'wild', 'card_10', 'eagle', 'card_a', 'bear'],
  ['card_9', 'buffalo', 'card_k', 'scatter', 'card_j', 'moose', 'card_q', 'wolf'],
  ['card_10', 'eagle', 'wild', 'card_a', 'bear', 'card_9', 'moose', 'card_k'],
];

const ALL_REGULAR_SYMBOLS = ['buffalo', 'eagle', 'bear', 'wolf', 'moose'];
interface GeneratedSpin {
  reels: string[][];
  wildMultipliers: Record<string, number>;
  totalScatterCount: number;
  nearMissDescription?: string;
  isNearMiss: boolean;
  celebrate: boolean;
}

interface EngagementTelemetry {
  touchSpeed?: number; // swipe/drag speed in px/s
  dragDistance?: number; // total swipe distance in px
  responseTimeMs?: number; // response delay since last reel settled
  isHesitating?: boolean; // user hesitated > 6000ms before tapping spin
  betHikeFactor?: number; // ratio of current bet vs average previous bets
}

// Casino Math Engine: Strict Low-RTP (~82%) House-Protected Engine
// - Regular Hit Rate lowered to ~9% (91% of spins are house-wins)
// - High bet scaling: bets >= 2,000 Ks reduce hit rates and heavily taper payout multipliers
// - Streak recovery raised to 12 consecutive losses, giving only modest returns
function generateSlotOutcome(
  isFreeSpins: boolean,
  lossStreak: number = 0,
  betAmount: number = 500,
  engagement?: EngagementTelemetry
): GeneratedSpin {
  // Low-RTP base hit probability: 9% for standard spins, 18% for free spins
  let hitProbability = isFreeSpins ? 0.18 : 0.09;

  // Streak recovery: Only after 12 consecutive losses, granting a modest 14% chance
  if (!isFreeSpins && lossStreak >= 12) {
    hitProbability = 0.14;
  }

  // Stake-based Hit Rate Tapering: High bets face lower hit probability to prevent casino bleed
  if (!isFreeSpins) {
    if (betAmount >= 20000) {
      hitProbability = Math.min(hitProbability, 0.05); // 5% max for 20,000 - 50,000 Ks bets
    } else if (betAmount >= 5000) {
      hitProbability = Math.min(hitProbability, 0.065); // 6.5% max for 5,000 - 10,000 Ks bets
    } else if (betAmount >= 2000) {
      hitProbability = Math.min(hitProbability, 0.08); // 8% max for 2,000 Ks bets
    }
  }

  // Subtle churn retention: small probability for tiny return
  const isRetentionTriggered = !isFreeSpins && engagement?.isHesitating === true && Math.random() < 0.15;
  if (isRetentionTriggered) {
    hitProbability = 0.18;
  }

  // Extreme Bet Hike Control: If player rapidly multiplies bet (> 2.5x), cut hit chance heavily to shield casino
  if (engagement?.betHikeFactor && engagement.betHikeFactor >= 2.5) {
    hitProbability = Math.max(0.04, hitProbability * 0.4);
  }

  const isWinningSpin = Math.random() < hitProbability;

  const reels: string[][] = [[], [], [], [], []];
  const wildMultipliers: Record<string, number> = {};
  let totalScatterCount = 0;
  let nearMissDescription: string | undefined = undefined;
  let isNearMiss = false;
  let celebrate = false;

  if (isWinningSpin) {
    const isRecoveryBonus = !isFreeSpins && lossStreak >= 12;

    let winSym = 'moose';
    let winLength = 3;

    if (isRetentionTriggered) {
      winSym = Math.random() < 0.7 ? 'moose' : 'wolf';
      winLength = 3;
    } else if (isRecoveryBonus) {
      winSym = Math.random() < 0.6 ? 'wolf' : 'bear';
      winLength = 3;
    } else {
      // Standard spins: low-paying symbols (92% moose/wolf/bear)
      const symRand = Math.random();
      if (symRand < 0.02) winSym = 'buffalo';
      else if (symRand < 0.07) winSym = 'eagle';
      else if (symRand < 0.28) winSym = 'bear';
      else if (symRand < 0.62) winSym = 'wolf';
      else winSym = 'moose';

      const lenRand = Math.random();
      if (lenRand < 0.94) winLength = 3;
      else winLength = 4;
    }

    // Low chance for 3 Scatters Free Spins (~1.0%)
    const triggerBonus = Math.random() < 0.01;

    for (let col = 0; col < 5; col++) {
      const colSyms: string[] = [];
      const isConnectingCol = col < winLength;

      const winSymRows: number[] = [];
      if (isConnectingCol) {
        // Single row match per column to keep ways count clean and balanced
        winSymRows.push(Math.floor(Math.random() * 4));
      }

      for (let row = 0; row < 4; row++) {
        if (isConnectingCol && winSymRows.includes(row)) {
          if (col > 0 && Math.random() < (isFreeSpins ? 0.35 : 0.20)) {
            colSyms.push('wild');
            if (isFreeSpins) {
              const mRand = Math.random();
              wildMultipliers[`${col}-${row}`] = mRand < 0.5 ? 2 : mRand < 0.85 ? 3 : 5;
            }
          } else {
            colSyms.push(winSym);
          }
        } else {
          const blocked = col === winLength ? [winSym, 'wild'] : [];
          const candidates = ALL_REGULAR_SYMBOLS.filter((s) => !blocked.includes(s));
          let s = candidates[Math.floor(Math.random() * candidates.length)];

          if (triggerBonus && col < 3 && !colSyms.includes('scatter') && totalScatterCount < 3) {
            s = 'scatter';
            totalScatterCount++;
          }

          if (row > 0 && s === colSyms[row - 1]) {
            const alt = candidates.filter((c) => c !== s);
            if (alt.length > 0) s = alt[Math.floor(Math.random() * alt.length)];
          }

          colSyms.push(s);
        }
      }
      reels[col] = colSyms;
    }
  } else {
    // NON-WINNING SPINS (House-Wins)
    isNearMiss = true;
    const missTypeRand = Math.random();

    if (missTypeRand < 0.80) {
      // Reels 0 & 1 show symbol connection, Reel 2 misses connection
      const teaserSym = Math.random() < 0.65 ? 'buffalo' : 'eagle';
      nearMissDescription = 'နောက်တစ်ကြိမ် ထပ်စမ်းပါ';

      // Assign matching rows for Reel 0 and Reel 1
      const matchRow0 = Math.floor(Math.random() * 4);
      const matchRow1 = Math.floor(Math.random() * 4);

      for (let col = 0; col < 5; col++) {
        const colSyms: string[] = [];

        for (let row = 0; row < 4; row++) {
          if (col === 0 && row === matchRow0) {
            colSyms.push(teaserSym);
          } else if (col === 1 && row === matchRow1) {
            colSyms.push(teaserSym);
          } else if (col === 2) {
            // Reel 2 strictly avoids the symbol and wild
            const safeReel2Pool = ALL_REGULAR_SYMBOLS.filter(
              (s) => s !== teaserSym && s !== 'buffalo' && s !== 'wild'
            );
            let s = safeReel2Pool[Math.floor(Math.random() * safeReel2Pool.length)];
            if (row > 0 && s === colSyms[row - 1]) {
              const alt = safeReel2Pool.filter((c) => c !== s);
              if (alt.length > 0) s = alt[Math.floor(Math.random() * alt.length)];
            }
            colSyms.push(s);
          } else {
            // Other columns fill with randomized symbols
            const pool = ALL_REGULAR_SYMBOLS;
            let s = pool[Math.floor(Math.random() * pool.length)];
            if (row > 0 && s === colSyms[row - 1]) {
              const alt = pool.filter((c) => c !== s);
              if (alt.length > 0) s = alt[Math.floor(Math.random() * alt.length)];
            }
            colSyms.push(s);
          }
        }
        reels[col] = colSyms;
      }
    } else {
      nearMissDescription = 'နောက်တစ်ကြိမ် ထပ်စမ်းပါ';
      totalScatterCount = 2;
      const scatterCols = [0, 1]; // First two reels show Scatter

      for (let col = 0; col < 5; col++) {
        const colSyms: string[] = [];
        const hasScatterInCol = scatterCols.includes(col);
        const scatterRow = Math.floor(Math.random() * 4);

        for (let row = 0; row < 4; row++) {
          if (hasScatterInCol && row === scatterRow) {
            colSyms.push('scatter');
          } else {
            // Ensure col 2 doesn't have scatter or match col 0
            const pool = ALL_REGULAR_SYMBOLS.filter((s) => col === 2 ? s !== 'scatter' : true);
            let s = pool[Math.floor(Math.random() * pool.length)];
            if (row > 0 && s === colSyms[row - 1]) {
              const alt = pool.filter((c) => c !== s);
              if (alt.length > 0) s = alt[Math.floor(Math.random() * alt.length)];
            }
            colSyms.push(s);
          }
        }
        reels[col] = colSyms;
      }

      // Safety check: break any accidental 3-column match in col 2
      const firstColSyms = new Set(reels[0]);
      for (let r = 0; r < 4; r++) {
        if (firstColSyms.has(reels[2][r]) && reels[2][r] !== 'scatter') {
          const safePool = ALL_REGULAR_SYMBOLS.filter((s) => !firstColSyms.has(s));
          if (safePool.length > 0) {
            reels[2][r] = safePool[Math.floor(Math.random() * safePool.length)];
          }
        }
      }
    }
  }

  return { reels, wildMultipliers, totalScatterCount, nearMissDescription, isNearMiss, celebrate };
}

export function BuffaloSlotGame({
  user,
  settings: _settings,
  onBackToLobby,
  onGoToWallet,
  soundEnabled,
  onToggleSound,
  onUpdateUserBalance,
  onRequireAuth,
}: BuffaloSlotGameProps) {
  // Cinematic Loading Screen
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Big Win Spectacular Modal
  const [bigWinData, setBigWinData] = useState<{ amount: number; bet: number } | null>(null);

  // Winning cell positions for animated gold pulse
  const [winningCells, setWinningCells] = useState<string[]>([]);

  // Bet & Spinning State
  const [betAmount, setBetAmount] = useState<number>(200);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [spinningCols, setSpinningCols] = useState<boolean[]>([
    false,
    false,
    false,
    false,
    false,
  ]);
  const [bouncingCols, setBouncingCols] = useState<boolean[]>([
    false,
    false,
    false,
    false,
    false,
  ]);
  const [isScreenShaking, setIsScreenShaking] = useState<boolean>(false);
  const activeSpinningColsRef = useRef<boolean[]>([
    false,
    false,
    false,
    false,
    false,
  ]);
  const [isBetModalOpen, setIsBetModalOpen] = useState<boolean>(false);
  const [isBuyBonusModalOpen, setIsBuyBonusModalOpen] = useState<boolean>(false);
  const [gameToast, setGameToast] = useState<string | null>(null);

  const showGameToast = useCallback((msg: string) => {
    setGameToast(msg);
    setTimeout(() => {
      setGameToast((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  // 5 Reels x 4 Rows Matrix (the reference Cocos layout)
  const [reels, setReels] = useState<string[][]>(INITIAL_REELS);

  // Win and Multiplier States
  const [lastWinAmount, setLastWinAmount] = useState<number>(0);
  const [spinFeedback, setSpinFeedback] = useState<BuffaloSpinFeedback | null>(null);
  const [winningInfo, setWinningInfo] = useState<string>('လှည့်ရန် အဆင်သင့်');
  const [wildMultipliers, setWildMultipliers] = useState<Record<string, number>>({});
  const [lossStreak, setLossStreak] = useState<number>(0);

  // Free Spins Feature States
  const [freeSpinsLeft, setFreeSpinsLeft] = useState<number>(0);
  const [totalFreeSpinsWon, setTotalFreeSpinsWon] = useState<number>(0);
  const [freeSpinsAccumulatedWin, setFreeSpinsAccumulatedWin] = useState<number>(0);
  const [isFreeSpinsActive, setIsFreeSpinsActive] = useState<boolean>(false);
  const [showBonusTriggerModal, setShowBonusTriggerModal] = useState<boolean>(false);

  // Auto Spin State
  const [isAutoSpinning, setIsAutoSpinning] = useState<boolean>(false);
  const [autoSpinsRemaining, setAutoSpinsRemaining] = useState<number>(0);
  const [isAutoModalOpen, setIsAutoModalOpen] = useState<boolean>(false);
  const [selectedAutoCount, setSelectedAutoCount] = useState<number | null>(10);

  // Device Portrait Detection & Responsive Landscape Toggle
  const [isPortrait, setIsPortrait] = useState<boolean>(false);
  const [isSubBetCelebration, setIsSubBetCelebration] = useState<boolean>(false);

  // Behavioral & Touch Telemetry Tracking
  const lastSettledAtRef = useRef<number>(0);
  const betHistoryRef = useRef<number[]>([200]);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTelemetryRef = useRef<EngagementTelemetry>({});

  useEffect(() => {
    lastSettledAtRef.current = Date.now();
  }, []);

  // Fullscreen/orientation are requested from the parent entry tap; rotate the layout if the device stays portrait.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkOrientation = () => {
      const isMobile = window.innerWidth <= 860;
      const portrait = isMobile && window.innerHeight > window.innerWidth;
      setIsPortrait(portrait);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // Fullscreen helper
  const toggleFullScreen = () => {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Sound chime helper
  const playSlotChime = useCallback(() => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // Audio fallback
    }
  }, [soundEnabled]);

  // Staggered reel stop sound (pitch climbs with each column locked)
  const playReelStopSound = useCallback(
    (colIdx: number) => {
      if (!soundEnabled || typeof window === 'undefined') return;
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const freq = 175 + colIdx * 42; // Ascending tone for excitement
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(65, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.24, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.09);
      } catch {
        // Audio fallback
      }
    },
    [soundEnabled]
  );

  // Execute Main Spin Function with Staggered Reel Stopping & Near-Miss Engine
  const executeSpin = useCallback(
    async (isFreeSpin = false) => {
      if (isSpinning) return;

      if (!user && !isFreeSpin) {
        setIsAutoSpinning(false);
        showGameToast('ကစားရန် အကောင့်ဝင်ပါ သို့မဟုတ် အကောင့်သစ်ဖွင့်ပါ။');
        onRequireAuth?.();
        return;
      }

      const availableBalance = user?.balance || 0;
      if (!isFreeSpin && availableBalance < betAmount) {
        setIsAutoSpinning(false);
        showGameToast('လက်ကျန်ငွေ မလုံလောက်ပါ။ ကျေးဇူးပြု၍ ငွေအရင်ဖြည့်သွင်းပါ။');
        if (user) onGoToWallet();
        return;
      }

      setIsSpinning(true);
      setSpinFeedback(null);
      setLastWinAmount(0);
      setWinningCells([]);
      setWinningInfo('လည်နေသည်...');
      sounds.playChip();

      // 1. Deduct bet immediately in UI state without blocking
      let currentBalance = availableBalance;
      if (!isFreeSpin) {
        currentBalance = Math.max(0, availableBalance - betAmount);
        if (user) {
          if (onUpdateUserBalance) onUpdateUserBalance(currentBalance);
          // Background update without blocking the animation thread
          const userDocRef = doc(db, 'users', user.uid);
          updateDoc(userDocRef, {
            balance: currentBalance,
            totalBetCumulative: (user.totalBetCumulative || 0) + betAmount,
            wagerSinceLastWithdrawal: (user.wagerSinceLastWithdrawal || 0) + betAmount,
            updatedAt: Date.now(),
          }).catch((e) => console.error('Balance update error:', e));
        }
      }

      // Calculate Player Engagement Telemetry & Risk Metrics
      const now = Date.now();
      const responseTimeMs = now - (lastSettledAtRef.current || now);
      const isHesitating = !isFreeSpin && (responseTimeMs >= 6000 || (lastTelemetryRef.current.responseTimeMs || 0) >= 6000);

      const history = betHistoryRef.current;
      const avgPreviousBet = history.length > 0 ? history.reduce((a, b) => a + b, 0) / history.length : betAmount;
      const betHikeFactor = avgPreviousBet > 0 ? betAmount / avgPreviousBet : 1.0;
      betHistoryRef.current = [...history.slice(-4), betAmount];

      const engagement: EngagementTelemetry = {
        touchSpeed: lastTelemetryRef.current.touchSpeed,
        dragDistance: lastTelemetryRef.current.dragDistance,
        responseTimeMs,
        isHesitating,
        betHikeFactor,
      };

      // Generate realistic slot outcome
      const outcome = generateSlotOutcome(isFreeSpinsActive, lossStreak, betAmount, engagement);
      const finalReels = outcome.reels;
      const totalScatterCount = outcome.totalScatterCount;
      const finalWildMults = outcome.wildMultipliers;
      const nearMissText = outcome.nearMissDescription;

      // Start spinning sound
      const spinInterval = setInterval(() => {
        playSlotChime();
      }, 140);

      // Start all five source-layout reels, then stop them left to right with the same staggered motion.
      activeSpinningColsRef.current = [true, true, true, true, true];
      setSpinningCols([true, true, true, true, true]);

      // Failsafe watchdog to guarantee reels can never get stuck.
      const failsafeTimer = setTimeout(() => {
        clearInterval(spinInterval);
        setIsSpinning(false);
        setSpinningCols([false, false, false, false, false]);
        setBouncingCols([false, false, false, false, false]);
      }, 3500);

      const stopColumn = (colIdx: number) => {
        activeSpinningColsRef.current[colIdx] = false;
        setSpinningCols((prev) => prev.map((value, index) => index === colIdx ? false : value));
        setReels((prev) => prev.map((column, index) => index === colIdx ? finalReels[colIdx] : column));
        setBouncingCols((prev) => prev.map((value, index) => index === colIdx ? true : value));
        setTimeout(() => {
          setBouncingCols((prev) => prev.map((value, index) => index === colIdx ? false : value));
        }, 400);
        playReelStopSound(colIdx);
      };

      [480, 720, 960, 1200].forEach((delay, colIdx) => {
        setTimeout(() => stopColumn(colIdx), delay);
      });

      // Reel 5 is the final reel.
      setTimeout(() => {
        activeSpinningColsRef.current[4] = false;
        clearInterval(spinInterval);
        setSpinningCols([false, false, false, false, false]);
        setReels(finalReels);
        setWildMultipliers(finalWildMults);
        setBouncingCols([false, false, false, false, true]);
        setTimeout(() => setBouncingCols([false, false, false, false, false]), 420);
        playReelStopSound(4);
      }, 1440);

      // Payout evaluation and Firestore updates after all five reels have settled.
      setTimeout(async () => {
        clearTimeout(failsafeTimer);
        setIsSpinning(false);

        // 2. Evaluate five-reel, four-row ways from left to right (maximum 1,024 ways).
        const symbolTypes = ['buffalo', 'eagle', 'bear', 'wolf', 'moose'];
        let spinTotalWin = 0;
        const hitSymbols: string[] = [];
        const winningKeys: string[] = [];

        for (const targetSym of symbolTypes) {
          let consecutiveCols = 0;
          let waysCount = 1;
          let wildMultiplierProduct = 1;
          const currentMatches: string[] = [];

          for (let col = 0; col < 5; col++) {
            let symbolMatchesInCol = 0;
            for (let row = 0; row < 4; row++) {
              const current = finalReels[col][row];
              if (current === targetSym || current === 'wild') {
                symbolMatchesInCol++;
                currentMatches.push(`${col}-${row}`);
                if (current === 'wild' && isFreeSpinsActive && finalWildMults[`${col}-${row}`]) {
                  wildMultiplierProduct *= finalWildMults[`${col}-${row}`];
                }
              }
            }

            if (symbolMatchesInCol > 0) {
              consecutiveCols++;
              waysCount *= symbolMatchesInCol;
            } else {
              break;
            }
          }

          // Must match on at least 3 consecutive columns from left
          if (consecutiveCols >= 3) {
            currentMatches.forEach((k) => winningKeys.push(k));
            const payoutDef = SYMBOL_PAYOUTS[targetSym];
            let baseMult = 0;
            if (consecutiveCols === 3) baseMult = payoutDef.p3;
            else if (consecutiveCols === 4) baseMult = payoutDef.p4;
            else if (consecutiveCols >= 5) baseMult = payoutDef.p5;

            // High-Stake Payout Multiplier Dampener:
            // Inversely scales down payout multipliers as bet size increases to shield casino bankroll
            let stakeDampener = 1.0;
            if (betAmount >= 50000) stakeDampener = 0.45;
            else if (betAmount >= 20000) stakeDampener = 0.55;
            else if (betAmount >= 10000) stakeDampener = 0.65;
            else if (betAmount >= 5000) stakeDampener = 0.75;
            else if (betAmount >= 2000) stakeDampener = 0.85;

            // Clamp effective ways and wild multiplier so total multiplier remains balanced
            const effectiveWays = Math.min(waysCount, 2);
            const effectiveWildMult = isFreeSpinsActive ? Math.min(wildMultiplierProduct, 3) : 1;
            const waysMultiplier = baseMult * effectiveWays * effectiveWildMult * stakeDampener;
            const waysWinAmount = Math.round(betAmount * waysMultiplier);
            spinTotalWin += waysWinAmount;
            hitSymbols.push(`${payoutDef.name} ${consecutiveCols} ကော်လံ`);
          }
        }

        // Cap maximum multiplier per spin scaled tightly by bet size (protects house from runaway payouts)
        let maxAllowedMultiplier = isFreeSpinsActive ? 6.0 : 2.8;
        if (betAmount >= 50000) {
          maxAllowedMultiplier = isFreeSpinsActive ? 2.0 : 1.25;
        } else if (betAmount >= 20000) {
          maxAllowedMultiplier = isFreeSpinsActive ? 2.5 : 1.40;
        } else if (betAmount >= 10000) {
          maxAllowedMultiplier = isFreeSpinsActive ? 3.0 : 1.65;
        } else if (betAmount >= 5000) {
          maxAllowedMultiplier = isFreeSpinsActive ? 3.5 : 1.85;
        } else if (betAmount >= 2000) {
          maxAllowedMultiplier = isFreeSpinsActive ? 4.5 : 2.20;
        }

        const maxAllowedWin = Math.round(betAmount * maxAllowedMultiplier);
        if (spinTotalWin > maxAllowedWin) {
          spinTotalWin = maxAllowedWin;
        }

        setLastWinAmount(spinTotalWin);
        setSpinFeedback({
          id: Date.now(),
          kind: isFreeSpin
            ? spinTotalWin > 0
              ? 'free-win'
              : 'free-miss'
            : spinTotalWin > 0
            ? 'win'
            : 'loss',
          amount: spinTotalWin,
          betAmount: isFreeSpin ? 0 : betAmount,
        });

        // 3. Handle Payout & Firestore Bet Recording
        const shouldCelebrate = spinTotalWin > 0;
        outcome.celebrate = shouldCelebrate;

        if (spinTotalWin > 0) {
          setLossStreak(0);
          setWinningCells(winningKeys);

          sounds.playWin();
          setIsSubBetCelebration(true);
          setTimeout(() => setIsSubBetCelebration(false), 2400);

          // Clean, professional win message
          setWinningInfo(`ဆုကြေး Ks ${spinTotalWin.toLocaleString()} ရရှိပါသည်!`);

          // Big Win celebration trigger with screen shake physics
          if (spinTotalWin >= betAmount * 3) {
            if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
              setIsScreenShaking(true);
              setTimeout(() => setIsScreenShaking(false), 550);
            }
            setBigWinData({
              amount: spinTotalWin,
              bet: betAmount,
            });
          }

          // 1. Credit balance
          const finalBal = currentBalance + spinTotalWin;
          if (user) {
            if (onUpdateUserBalance) onUpdateUserBalance(finalBal);
            try {
              await updateDoc(doc(db, 'users', user.uid), {
                balance: finalBal,
                updatedAt: Date.now(),
              });
            } catch (balanceErr) {
              console.error('Balance credit error:', balanceErr);
            }

            // 2. Record Win Bet in Firestore
            try {
              const betId = `buffalo_${Date.now()}`;
              const newBet: PlayerBet = {
                betId,
                roundId: Math.floor(Date.now() / 1000),
                userId: user.uid,
                userName: user.fullName,
                betKind: 'slot',
                selection: 'Charge Buffalo (5x4 Ways Slot)',
                amount: isFreeSpin ? 0 : betAmount,
                multiplier: betAmount > 0 ? Number((spinTotalWin / betAmount).toFixed(2)) : 0,
                status: 'win',
                payout: spinTotalWin,
                profit: isFreeSpin ? spinTotalWin : spinTotalWin - betAmount,
                createdAt: Date.now(),
              };
              await setDoc(doc(db, 'bets', betId), newBet);
            } catch (betErr) {
              console.error('Win bet record error:', betErr);
            }
          }
        } else {
          setIsSubBetCelebration(false);
          setLossStreak((prev) => prev + 1);
          setWinningInfo(
            isFreeSpin
              ? 'Free Spin တွင် ဆုကြေးမပေါက်ပါ'
              : 'နောက်တစ်ကြိမ် ထပ်စမ်းပါ'
          );
          // Record Loss Bet if paid spin and logged in
          if (!isFreeSpin && user) {
            try {
              const betId = `buffalo_${Date.now()}`;
              const newBet: PlayerBet = {
                betId,
                roundId: Math.floor(Date.now() / 1000),
                userId: user.uid,
                userName: user.fullName,
                betKind: 'slot',
                selection: 'Charge Buffalo (5x4 Ways Slot)',
                amount: betAmount,
                multiplier: 0,
                status: 'loss',
                payout: 0,
                profit: -betAmount,
                createdAt: Date.now(),
              };
              await setDoc(doc(db, 'bets', betId), newBet);
            } catch (err) {
              console.error('Loss bet record error:', err);
            }
          }
        }

        // 4. Check Free Spins Trigger (3+ Scatters; five reels max).
        if (totalScatterCount >= 3) {
          let awardedSpins = 8;
          if (totalScatterCount === 4) awardedSpins = 15;
          else if (totalScatterCount >= 5) awardedSpins = 25;

          setSpinFeedback((previous) =>
            previous ? { ...previous, id: previous.id + 1, kind: 'bonus', freeSpinsAwarded: awardedSpins } : previous
          );

          setTotalFreeSpinsWon(awardedSpins);
          setFreeSpinsLeft((prev) => prev + awardedSpins);
          setIsFreeSpinsActive(true);
          setShowBonusTriggerModal(true);
          sounds.playWin();

          if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            confetti({
              particleCount: 150,
              spread: 100,
              origin: { y: 0.5 },
            });
          }
        }

        // 5. Update Free Spins Counter if currently in Free Spins
        if (isFreeSpin) {
          setFreeSpinsAccumulatedWin((prev) => prev + spinTotalWin);
          setFreeSpinsLeft((prev) => {
            const nextVal = prev - 1;
            if (nextVal <= 0) {
              setIsFreeSpinsActive(false);
            }
            return Math.max(0, nextVal);
          });
        }

        // Record time when round finishes so next spin response latency can be evaluated accurately
        lastSettledAtRef.current = Date.now();
      }, 2150);
    },
    [
      isSpinning,
      user,
      betAmount,
      lossStreak,
      onGoToWallet,
      onRequireAuth,
      onUpdateUserBalance,
      showGameToast,
      playSlotChime,
      playReelStopSound,
      isFreeSpinsActive,
    ]
  );

  // Auto-Spin and Free Spins Engine
  useEffect(() => {
    if (isSpinning || bigWinData) return;

    // Handle ongoing Free Spins
    if (isFreeSpinsActive && freeSpinsLeft > 0 && !showBonusTriggerModal) {
      const timer = setTimeout(() => {
        executeSpin(true);
      }, 900);
      return () => clearTimeout(timer);
    }

    // Handle Auto Spins
    if (isAutoSpinning && !isFreeSpinsActive) {
      // Balance safety stop: stop auto spin if user's balance is less than current bet
      if (user && user.balance < betAmount) {
        const stopTimer = setTimeout(() => {
          setIsAutoSpinning(false);
          setAutoSpinsRemaining(0);
          setWinningInfo('လက်ကျန်ငွေ မလုံလောက်သဖြင့် Auto Spin ရပ်တန့်ပါသည်');
        }, 0);
        return () => clearTimeout(stopTimer);
      }

      if (autoSpinsRemaining > 0) {
        const timer = setTimeout(() => {
          setAutoSpinsRemaining((prev) => prev - 1);
          executeSpin(false);
        }, 1100);
        return () => clearTimeout(timer);
      } else {
        const stopTimer = setTimeout(() => {
          setIsAutoSpinning(false);
        }, 0);
        return () => clearTimeout(stopTimer);
      }
    }
  }, [
    isSpinning,
    bigWinData,
    isFreeSpinsActive,
    freeSpinsLeft,
    showBonusTriggerModal,
    isAutoSpinning,
    autoSpinsRemaining,
    executeSpin,
    user,
    betAmount,
  ]);

  // Buy Bonus Action (100x Bet for 10 Free Spins)
  const handleConfirmBuyBonus = async () => {
    if (!user) {
      showGameToast('Bonus ဝယ်ရန် အကောင့်ဝင်ပါ။');
      setIsBuyBonusModalOpen(false);
      onRequireAuth?.();
      return;
    }
    const availableBalance = user.balance;
    const cost = betAmount * 100;
    if (availableBalance < cost) {
      showGameToast(`လက်ကျန်ငွေ မလုံလောက်ပါ။ Buy Bonus ဝယ်ယူရန် Ks ${cost.toLocaleString()} လိုအပ်ပါသည်။`);
      setIsBuyBonusModalOpen(false);
      if (user) onGoToWallet();
      return;
    }

    setIsBuyBonusModalOpen(false);
    const newBal = availableBalance - cost;
    if (user) {
      if (onUpdateUserBalance) onUpdateUserBalance(newBal);
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          balance: newBal,
          totalBetCumulative: (user.totalBetCumulative || 0) + cost,
          wagerSinceLastWithdrawal: (user.wagerSinceLastWithdrawal || 0) + cost,
          updatedAt: Date.now(),
        });
      } catch (e) {
        console.error('Buy bonus update error:', e);
      }
    }

    // Award 10 Free Spins
    setTotalFreeSpinsWon(10);
    setFreeSpinsLeft(10);
    setFreeSpinsAccumulatedWin(0);
    setIsFreeSpinsActive(true);
    setShowBonusTriggerModal(true);
    sounds.playWin();
  };

  // 1. Initial Cinematic Loading Screen
  if (isLoading) {
    return <BuffaloLoadingScreen onComplete={() => setIsLoading(false)} />;
  }

  // 2. Responsive Landscape Casino Arena Layout
  const isRotatedActive = isPortrait;
  const plannedAutoStake = (selectedAutoCount ?? 0) * betAmount;

  return (
    <div
      className={`buffalo-game-shell buffalo-original-shell fixed z-50 flex flex-col justify-between overflow-hidden text-white transition-all duration-300 select-none ${
        isRotatedActive
          ? 'buffalo-game-shell--rotated w-[100vh] h-[100vw] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 origin-center'
          : 'inset-0'
      }`}
      style={{
        backgroundImage: "url('/assets/casino/buffalo-original/canyon-background.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#04060a',
      }}
    >
      {/* Toast Notification Banner (Zero alerts, non-blocking smooth feedback) */}
      {gameToast && (
        <div role="status" aria-live="polite" className="buffalo-cocos-toast fixed top-12 left-1/2 -translate-x-1/2 z-50 rounded-full px-5 py-2 text-xs sm:text-sm font-bold flex items-center gap-2 pointer-events-none transition-all">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
          <span>{gameToast}</span>
        </div>
      )}

      <header className="buffalo-cocos-hud z-30 flex w-full shrink-0 items-center">
        <button
          type="button"
          onClick={() => {
            sounds.playChip();
            onBackToLobby();
          }}
          className="buffalo-cocos-back"
          title="အနောက်သို့ ပြန်ထွက်မည်"
          aria-label="ဂိမ်းစာရင်းသို့ ပြန်သွားရန်"
        >
          <Image src="/assets/casino/buffalo-original/back-button.png" alt="" width={91} height={57} draggable={false} />
        </button>

        <div className="buffalo-cocos-meters" role="group" aria-label="ဂိမ်းအချက်အလက်">
          <div className="buffalo-cocos-meter" aria-label={`CREDIT ${formatKs(user?.balance || 0)}`}>
            <span className="sr-only">CREDIT</span>
            <strong>{formatKs(user?.balance || 0)}</strong>
          </div>
          <div className="buffalo-cocos-meter" aria-label={`BET ${formatKs(betAmount)}`}>
            <span className="sr-only">BET</span>
            <strong>{formatKs(betAmount)}</strong>
          </div>
          <div className="buffalo-cocos-meter" aria-label={`WIN ${formatKs(lastWinAmount)}`}>
            <span className="sr-only">WIN</span>
            <strong>{formatKs(lastWinAmount)}</strong>
          </div>
        </div>

        <div className="buffalo-cocos-tools">
          <button
            type="button"
            onClick={() => {
              sounds.playChip();
              onGoToWallet();
            }}
            className="buffalo-cocos-tool buffalo-cocos-wallet"
            title="Wallet ဖွင့်ရန်"
            aria-label={`Wallet ဖွင့်ရန်၊ လက်ကျန် ${formatKs(user?.balance || 0)}`}
          >
            <Plus className="h-5 w-5 stroke-[3]" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              sounds.playChip();
              onToggleSound();
            }}
            className="buffalo-cocos-tool"
            title="အသံ ဖွင့်/ပိတ်"
            aria-label={soundEnabled ? 'အသံပိတ်ရန်' : 'အသံဖွင့်ရန်'}
            aria-pressed={soundEnabled}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={toggleFullScreen}
            className="buffalo-cocos-tool buffalo-cocos-fullscreen"
            title="မျက်နှာပြင်အပြည့်"
            aria-label="မျက်နှာပြင်အပြည့်ဖွင့်/ပိတ်ရန်"
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setIsBetModalOpen(true)}
            className="buffalo-cocos-menu"
            title="လောင်းကြေးနှင့်ဂိမ်းသတ်မှတ်ချက်များ"
            aria-label="လောင်းကြေးနှင့်ဂိမ်းသတ်မှတ်ချက်များ ဖွင့်ရန်"
          >
            <Image src="/assets/casino/buffalo-original/settings-button.png" alt="" width={91} height={57} draggable={false} />
          </button>
        </div>
      </header>

      {/* Free Spins Active Banner (during free spins) */}
      {isFreeSpinsActive && (
        <div className="buffalo-cocos-free-spin w-full py-0.5 px-3 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-400 stroke-[2]" />
            <span className="text-[11px] font-black uppercase tracking-wider text-white">
              FREE SPINS: {freeSpinsLeft} ကြိမ် ကျန်
            </span>
          </div>
          <span className="text-[11px] font-black font-mono text-white">
            စုစုပေါင်း: +Ks {freeSpinsAccumulatedWin.toLocaleString()}
          </span>
        </div>
      )}

      {/* Reference-matched African Buffalo cabinet: five reels × four rows. */}
      <main className="buffalo-cocos-arena relative flex min-h-0 w-full flex-1 items-center justify-center">
        <div
          className={`buffalo-cocos-board ${isScreenShaking ? 'animate-screen-shake' : ''} ${isSubBetCelebration ? 'buffalo-cocos-board--celebrating' : ''}`}
          aria-label="Buffalo 5 reel, 4 row slot board"
        >
          <div className="buffalo-cocos-grid" role="grid" aria-label="Five reels, four rows, 1,024 ways">
            {reels.map((columnSymbols, colIdx) => {
              const isColSpinning = spinningCols[colIdx];
              const isColBouncing = bouncingCols[colIdx];
              const spinStrip = COLUMN_SPIN_STRIPS[colIdx] || COLUMN_SPIN_STRIPS[0];

              return (
                <div
                  key={`reel-col-${colIdx}`}
                  className={`buffalo-cocos-reel ${isColBouncing ? 'buffalo-cocos-reel--bouncing' : ''}`}
                  role="rowgroup"
                  aria-label={`Reel ${colIdx + 1}`}
                >
                  {isColSpinning ? (
                    <div className="buffalo-cocos-strip animate-reel-strip-spin">
                      {spinStrip.map((symId, sIdx) => (
                        <div key={`spin-strip-${colIdx}-${sIdx}`} className="buffalo-cocos-cell" role="gridcell">
                          <BuffaloSymbolImage symbolId={symId} className="buffalo-cocos-symbol" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    columnSymbols.map((symId, rowIdx) => {
                      const wildMult = wildMultipliers[`${colIdx}-${rowIdx}`] || 1;
                      const isWinningCell = winningCells.includes(`${colIdx}-${rowIdx}`);
                      return (
                        <div
                          key={`cell-${colIdx}-${rowIdx}`}
                          className={`buffalo-cocos-cell ${isWinningCell ? 'buffalo-cocos-cell--winning' : ''}`}
                          role="gridcell"
                          aria-label={`Reel ${colIdx + 1}, row ${rowIdx + 1}`}
                        >
                          <BuffaloSymbolImage
                            symbolId={symId}
                            wildMultiplier={wildMult}
                            isWinning={isWinningCell}
                            className="buffalo-cocos-symbol"
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
          <Image
            className="buffalo-cocos-frame"
            src="/assets/casino/buffalo-original/reel-cabinet-frame.png"
            alt=""
            fill
            sizes="(max-width: 760px) 96vw, 1060px"
            aria-hidden="true"
            draggable={false}
          />
          <div className="sr-only">ဘယ်ဘက်မှ အနည်းဆုံး ၃ ကော်လံဆက်တိုက်အနိုင်၊ 1,024 WAYS</div>
        </div>
        <div className="sr-only">
          <BuffaloResultEffects
            result={spinFeedback}
            isSpinning={isSpinning}
            isFreeSpinActive={isFreeSpinsActive}
            betAmount={betAmount}
            message={winningInfo}
          />
        </div>
      </main>

      <footer className="buffalo-cocos-footer z-30 w-full shrink-0">
        <div className="buffalo-cocos-notice" role={!user ? 'status' : user.balance < betAmount ? 'alert' : undefined}>
          {!user ? (
            <>
              <span>ကစားရန် အကောင့်ဝင်ရန် လိုအပ်ပါသည်။</span>
              <button type="button" onClick={() => onRequireAuth?.()}>ဝင်ရောက်ရန်</button>
            </>
          ) : user.balance < betAmount ? (
            <>
              <span>လက်ကျန် {formatKs(user.balance)} — တစ်ကြိမ်လှည့်ရန် {formatKs(betAmount)} လိုအပ်ပါသည်။</span>
              <button type="button" onClick={onGoToWallet}>ငွေဖြည့်ရန်</button>
            </>
          ) : null}
        </div>

        <div className="buffalo-cocos-controls">
          <div className="buffalo-cocos-stake-controls" aria-label="လောင်းကြေး ထိန်းချုပ်မှု">
            <button
              type="button"
              className="buffalo-cocos-bet-step"
              onClick={() => {
                if (isSpinning || isAutoSpinning || isFreeSpinsActive) return;
                sounds.playChip();
                setBetAmount((current) => {
                  const index = BET_OPTIONS.indexOf(current);
                  return BET_OPTIONS[Math.max(0, index - 1)];
                });
              }}
              disabled={isSpinning || isAutoSpinning || isFreeSpinsActive || BET_OPTIONS.indexOf(betAmount) <= 0}
              aria-label="လောင်းကြေး လျှော့ရန်"
            >
              <Image src="/assets/casino/buffalo-original/bet-minus-button.png" alt="" width={73} height={82} draggable={false} />
            </button>
            <button
              type="button"
              className="buffalo-cocos-bet-readout"
              onClick={() => setIsBetModalOpen(true)}
              disabled={isSpinning || isAutoSpinning || isFreeSpinsActive}
              aria-label={`လောင်းကြေးရွေးရန်၊ တစ်ကြိမ် ${formatKs(betAmount)}`}
            >
              <span>{isFreeSpinsActive ? 'FREE SPIN' : 'TOTAL BET'}</span>
              <strong>{isFreeSpinsActive ? 'Ks 0' : formatKs(betAmount)}</strong>
              {isFreeSpinsActive && <small>အခြေခံ {formatKs(betAmount)}</small>}
            </button>
            <button
              type="button"
              className="buffalo-cocos-bet-step"
              onClick={() => {
                if (isSpinning || isAutoSpinning || isFreeSpinsActive) return;
                sounds.playChip();
                setBetAmount((current) => {
                  const index = BET_OPTIONS.indexOf(current);
                  return BET_OPTIONS[Math.min(BET_OPTIONS.length - 1, index + 1)];
                });
              }}
              disabled={isSpinning || isAutoSpinning || isFreeSpinsActive || BET_OPTIONS.indexOf(betAmount) >= BET_OPTIONS.length - 1}
              aria-label="လောင်းကြေး တိုးရန်"
            >
              <Image src="/assets/casino/buffalo-original/bet-plus-button.png" alt="" width={74} height={82} draggable={false} />
            </button>
          </div>

          <button
            type="button"
            className="buffalo-cocos-level-button"
            onClick={() => setIsBetModalOpen(true)}
            disabled={isSpinning || isAutoSpinning || isFreeSpinsActive}
            aria-label="1C လောင်းကြေးအဆင့် ရွေးရန်"
          >
            <Image src="/assets/casino/buffalo-original/level-1c-button.png" alt="1C" width={76} height={79} draggable={false} />
          </button>

          <button
            type="button"
            className="buffalo-cocos-max-bet"
            onClick={() => {
              if (!user) {
                onRequireAuth?.();
                return;
              }
              const affordable = BET_OPTIONS.filter((amount) => amount <= user.balance).pop();
              if (!affordable) {
                onGoToWallet();
                return;
              }
              setBetAmount(affordable);
              sounds.playChip();
            }}
            disabled={isSpinning || isAutoSpinning || isFreeSpinsActive}
            aria-label="လက်ကျန်နှင့်ကိုက်ညီသော အမြင့်ဆုံးလောင်းကြေး ရွေးရန်"
          >
            <Image src="/assets/casino/buffalo-original/max-bet-button.png" alt="" width={117} height={79} draggable={false} />
            <span>MAX</span>
          </button>

          <button
            type="button"
            onClick={() => executeSpin(false)}
            disabled={isSpinning || isAutoSpinning || isFreeSpinsActive || Boolean(user && user.balance < betAmount)}
            className="buffalo-cocos-spin"
            aria-label={isFreeSpinsActive ? `Free Spin ${freeSpinsLeft} ကြိမ် ကျန်` : `Spin တစ်ကြိမ်၊ လောင်းကြေး ${formatKs(betAmount)}`}
          >
            <Image src="/assets/casino/buffalo-original/spin-button.png" alt="" width={203} height={88} draggable={false} />
            <span>{isSpinning ? 'လည်နေသည်' : isFreeSpinsActive ? `FREE ${freeSpinsLeft}` : 'SPIN'}</span>
            {isSpinning ? <RotateCw className="buffalo-cocos-spin-icon animate-spin" aria-hidden="true" /> : <Sparkles className="buffalo-cocos-spin-icon" aria-hidden="true" />}
          </button>

          <button
            type="button"
            onClick={() => {
              if (isAutoSpinning) {
                sounds.playChip();
                setIsAutoSpinning(false);
                setAutoSpinsRemaining(0);
              } else {
                sounds.playChip();
                setSelectedAutoCount(10);
                setIsAutoModalOpen(true);
              }
            }}
            className={`buffalo-cocos-auto ${isAutoSpinning ? 'buffalo-cocos-auto--active' : ''}`}
            aria-label={isAutoSpinning ? `Auto Spin ရပ်ရန်၊ ${autoSpinsRemaining} ကြိမ် ကျန်` : 'Auto Spin အကြိမ်ရေ ရွေးရန်'}
            aria-pressed={isAutoSpinning}
            disabled={!isAutoSpinning && (isSpinning || isFreeSpinsActive)}
          >
            <Image src="/assets/casino/buffalo-original/auto-button.png" alt="" width={204} height={88} draggable={false} />
            <span>{isAutoSpinning ? `STOP ${autoSpinsRemaining}` : 'AUTO'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playChip();
              setIsBuyBonusModalOpen(true);
            }}
            className="buffalo-cocos-bonus"
            aria-label={`Buy Bonus ဖွင့်ရန်၊ ကုန်ကျငွေ ${formatKs(betAmount * 100)}`}
            disabled={isSpinning || isAutoSpinning || isFreeSpinsActive}
          >
            <Flame className="h-4 w-4" aria-hidden="true" />
            <span>BONUS</span>
          </button>

          <div className="buffalo-cocos-total-win" aria-label={`WIN ${formatKs(lastWinAmount)}`}>
            <Image src="/assets/casino/buffalo-original/footer-win-frame.png" alt="" fill sizes="(max-width: 760px) 105px, 205px" draggable={false} />
            <span>WIN · ဆုကြေး</span>
            <strong>{formatKs(lastWinAmount)}</strong>
          </div>
        </div>
      </footer>

      {/* ========================================================= */}
      {/* POPUP MODALS: Big Win, Bet Selector, Buy Bonus, Free Spins */}
      {/* ========================================================= */}

      {/* SPECTACULAR BIG WIN CELEBRATION MODAL */}
      {bigWinData && (
        <BuffaloBigWinModal
          key={`${bigWinData.amount}-${bigWinData.bet}`}
          winAmount={bigWinData.amount}
          betAmount={bigWinData.bet}
          onClose={() => setBigWinData(null)}
        />
      )}

      {/* Bet selector with current balance and per-spin stake impact. */}
      {isBetModalOpen && (
        <BuffaloDialog
          titleId="buffalo-bet-title"
          descriptionId="buffalo-bet-description"
          onClose={() => setIsBetModalOpen(false)}
          panelClassName="max-w-md border-white/15"
        >
          <div className="flex flex-col gap-3 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-amber-200" aria-hidden="true" />
                <h2 id="buffalo-bet-title" className="text-sm font-black uppercase tracking-wider text-white">
                  လောင်းကြေး ရွေးချယ်ပါ
                </h2>
              </div>
              <button type="button" onClick={() => setIsBetModalOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl text-white/65 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" aria-label="လောင်းကြေးရွေးချယ်မှု ပိတ်ရန်">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <p id="buffalo-bet-description" className="text-xs leading-relaxed text-white/65">
              ဤပမာဏသည် paid spin တစ်ကြိမ်စီအတွက် အသုံးပြုပါမည်။ Spin မစမီ အောက်တွင် ဖော်ပြထားသော လောင်းကြေးကို စစ်ဆေးပါ။
            </p>

            <div className="grid grid-cols-3 gap-2">
              {BET_OPTIONS.map((amt) => (
                <button
                  type="button"
                  key={`bet-opt-${amt}`}
                  onClick={() => {
                    setBetAmount(amt);
                    setIsBetModalOpen(false);
                    sounds.playChip();
                  }}
                  aria-pressed={betAmount === amt}
                  className={`min-h-11 rounded-xl border px-1 text-[11px] font-black font-mono transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                    betAmount === amt
                      ? 'scale-[1.02] border-amber-100 bg-gradient-to-b from-amber-100 to-amber-400 text-black shadow-md'
                      : 'border-white/15 bg-black/60 text-white/90 hover:border-amber-200/40 hover:bg-white/10'
                  }`}
                >
                  Ks {amt.toLocaleString()}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/10 bg-black/45 p-2.5 text-left">
                <p className="text-[10px] text-white/50">လက်ရှိလက်ကျန်</p>
                <p className="font-mono text-xs font-black text-white">{formatKs(user?.balance || 0)}</p>
              </div>
              <div className="rounded-xl border border-amber-200/15 bg-amber-950/20 p-2.5 text-left">
                <p className="text-[10px] text-white/50">တစ်ကြိမ်လောင်းကြေး</p>
                <p className="font-mono text-xs font-black text-amber-100">{formatKs(betAmount)}</p>
              </div>
            </div>
            <p className={`rounded-xl border px-3 py-2 text-left text-[11px] ${
              user && user.balance < betAmount
                ? 'border-rose-300/25 bg-rose-950/30 text-rose-100'
                : 'border-white/10 bg-white/[0.04] text-white/70'
            }`}>
              {!user
                ? 'လောင်းကစားရန် အကောင့်ဝင်ပါ။'
                : user.balance < betAmount
                ? `တစ်ကြိမ်လှည့်ရန် ${formatKs(betAmount)} လိုအပ်ပါသည်။`
                : `လောင်းကြေးနုတ်ပြီးနောက် ခန့်မှန်းလက်ကျန် ${formatKs(user.balance - betAmount)} ဖြစ်ပါမည် (ဆုကြေးမပါဝင်ပါ)။`}
            </p>
          </div>
        </BuffaloDialog>
      )}

      {/* Buy Bonus confirmation keeps the existing 100× price and 10-spin award. */}
      {isBuyBonusModalOpen && (
        <BuffaloDialog
          titleId="buffalo-buy-bonus-title"
          descriptionId="buffalo-buy-bonus-description"
          onClose={() => setIsBuyBonusModalOpen(false)}
          panelClassName="max-w-md border-red-300/20"
        >
          <div className="flex flex-col items-center gap-3 p-4 text-center sm:p-5">
            <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-amber-200/25 bg-black shadow-lg">
              <Image src="/assets/slot-symbols/individual/buffalo.webp" alt="" fill sizes="64px" className="object-cover" />
            </div>
            <div>
              <span className="block text-[9px] font-black uppercase tracking-widest text-red-300">SPECIAL FEATURE</span>
              <h2 id="buffalo-buy-bonus-title" className="mt-1 text-base font-black text-white">BUY BONUS (100 × BET)</h2>
              <p id="buffalo-buy-bonus-description" className="mt-1 text-xs leading-relaxed text-white/70">
                Free Spins ၁၀ ကြိမ် ရရှိပါမည်။ လက်ရှိဂိမ်းစည်းမျဉ်းအတိုင်း WILD multipliers အသုံးပြုပါမည်။
              </p>
            </div>

            <div className="grid w-full grid-cols-2 gap-2 text-left">
              <div className="rounded-xl border border-white/10 bg-black/50 p-2.5">
                <p className="text-[10px] text-white/50">တစ်ကြိမ်လောင်းကြေး</p>
                <p className="font-mono text-xs font-black text-white">{formatKs(betAmount)}</p>
              </div>
              <div className="rounded-xl border border-red-300/20 bg-red-950/25 p-2.5">
                <p className="text-[10px] text-white/55">ဝယ်ယူစရိတ် (100×)</p>
                <p className="font-mono text-xs font-black text-red-100">{formatKs(betAmount * 100)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/50 p-2.5">
                <p className="text-[10px] text-white/50">လက်ရှိလက်ကျန်</p>
                <p className="font-mono text-xs font-black text-white">{formatKs(user?.balance || 0)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/50 p-2.5">
                <p className="text-[10px] text-white/50">ဝယ်ပြီးနောက်</p>
                <p className={`font-mono text-xs font-black ${user && user.balance >= betAmount * 100 ? 'text-emerald-200' : 'text-rose-200'}`}>
                  {user && user.balance >= betAmount * 100 ? formatKs(user.balance - betAmount * 100) : 'လက်ကျန်မလုံလောက်'}
                </p>
              </div>
            </div>

            {!user || user.balance < betAmount * 100 ? (
              <p className="w-full rounded-xl border border-rose-300/20 bg-rose-950/30 px-3 py-2 text-left text-[11px] text-rose-100" role="status">
                {!user ? 'အကောင့်ဝင်ပြီးမှ Bonus ဝယ်နိုင်ပါသည်။' : 'လက်ကျန်ငွေ မလုံလောက်ပါ။ ငွေဖြည့်ရန် Wallet ကို ဖွင့်ပါ။'}
              </p>
            ) : null}

            <div className="flex w-full gap-2 pt-1">
              <button type="button" onClick={() => setIsBuyBonusModalOpen(false)} className="min-h-12 flex-1 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-bold text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                မဝယ်ပါ
              </button>
              <button type="button" onClick={handleConfirmBuyBonus} className="min-h-12 flex-1 rounded-xl bg-gradient-to-b from-amber-100 to-amber-500 px-3 text-xs font-black text-black shadow-lg transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                အတည်ပြုပြီး ဝယ်မည်
              </button>
            </div>
          </div>
        </BuffaloDialog>
      )}

      {/* Wait for Big Win dismissal before presenting the free-spin award dialog. */}
      {showBonusTriggerModal && !bigWinData && (
        <BuffaloDialog
          titleId="buffalo-free-spin-title"
          descriptionId="buffalo-free-spin-description"
          onClose={() => setShowBonusTriggerModal(false)}
          backdropDismiss={false}
          escapeDismiss={false}
          panelClassName="max-w-sm border-amber-300/25"
        >
          <div className="flex flex-col items-center gap-3 p-5 text-center">
            <div className="relative h-24 w-24">
              <Image src="/assets/slot-vfx/buffalo_super_win_crest.webp" alt="" fill sizes="96px" className="object-contain" />
              <Sparkles className="absolute -right-1 top-0 h-5 w-5 animate-pulse text-amber-200" aria-hidden="true" />
            </div>
            <div>
              <h2 id="buffalo-free-spin-title" className="text-lg font-black uppercase text-white">FREE SPINS ရရှိပါပြီ</h2>
              <p className="mt-1 text-sm font-black text-amber-100">{totalFreeSpinsWon} ကြိမ် အပိုလှည့်ခွင့်</p>
              <p id="buffalo-free-spin-description" className="mt-1 text-xs leading-relaxed text-white/65">
                Free Spin များ စတင်ရန် အောက်ပါခလုတ်ကိုနှိပ်ပါ။ ရလဒ်တိုင်းကို reel အောက်တွင် ပြသပါမည်။
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowBonusTriggerModal(false);
                sounds.playChip();
              }}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-amber-100 to-amber-500 px-4 text-xs font-black text-black shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>Free Spin စတင်မည်</span>
            </button>
          </div>
        </BuffaloDialog>
      )}

      {/* Select Auto Spin count, preview stake exposure, then explicitly start or cancel. */}
      {isAutoModalOpen && (
        <BuffaloDialog
          titleId="buffalo-auto-title"
          descriptionId="buffalo-auto-description"
          onClose={() => setIsAutoModalOpen(false)}
          panelClassName="max-w-md border-amber-200/20"
        >
          <div className="flex flex-col gap-3 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-amber-200" aria-hidden="true" />
                <h2 id="buffalo-auto-title" className="text-sm font-black uppercase tracking-wider text-white">Auto Spin သတ်မှတ်ရန်</h2>
              </div>
              <button type="button" onClick={() => setIsAutoModalOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl text-white/65 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" aria-label="Auto Spin dialog ပိတ်ရန်">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <p id="buffalo-auto-description" className="text-xs leading-relaxed text-white/65">
              ရွေးထားသောအကြိမ်ရေတစ်ကြိမ်စီတွင် လက်ရှိလောင်းကြေးကို အသုံးပြုပါမည်။ AUTO လည်နေစဉ် STOP ဖြင့် အချိန်မရွေး ရပ်နိုင်ပါသည်။
            </p>

            <div className="grid grid-cols-4 gap-2">
              {[10, 20, 50, 100].map((count) => (
                <button
                  type="button"
                  key={`auto-spin-count-${count}`}
                  onClick={() => {
                    sounds.playChip();
                    setSelectedAutoCount(count);
                  }}
                  aria-pressed={selectedAutoCount === count}
                  className={`min-h-11 rounded-xl border px-1 text-xs font-black font-mono transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                    selectedAutoCount === count
                      ? 'border-amber-100 bg-gradient-to-b from-amber-100 to-amber-400 text-black'
                      : 'border-white/15 bg-black/50 text-white hover:bg-white/10'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/10 bg-black/45 p-2.5">
                <p className="text-[10px] text-white/50">လက်ရှိလက်ကျန်</p>
                <p className="font-mono text-xs font-black text-white">{formatKs(user?.balance || 0)}</p>
              </div>
              <div className="rounded-xl border border-amber-200/15 bg-amber-950/20 p-2.5">
                <p className="text-[10px] text-white/50">တစ်ကြိမ်လောင်းကြေး</p>
                <p className="font-mono text-xs font-black text-amber-100">{formatKs(betAmount)}</p>
              </div>
            </div>

            <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[11px] leading-relaxed text-white/75" role="status">
              <div className="flex items-center justify-between gap-2">
                <span>ရွေးထားသော paid spin</span>
                <strong className="text-white">{selectedAutoCount ?? 0} ကြိမ်</strong>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>အစီအစဉ်အပြည့်အတွက် စုစုပေါင်း wager</span>
                <strong className="font-mono text-amber-100">{formatKs(plannedAutoStake)}</strong>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>လောင်းကြေးနုတ်ပြီး ခန့်မှန်းလက်ကျန် (ဆုကြေးမပါ)</span>
                <strong className="font-mono text-white">
                  {user && user.balance >= plannedAutoStake
                    ? formatKs(user.balance - plannedAutoStake)
                    : user
                    ? 'အနိုင်ရငွေ မရပါက မလောက်နိုင်'
                    : 'အကောင့်ဝင်ရန် လိုအပ်'}
                </strong>
              </div>
              <p className="pt-1 text-[10px] text-white/55">ခန့်မှန်းချက်တွင် ဆုကြေးမပါဝင်ပါ။ Paid Spin တစ်ကြိမ်စီမစမီ လက်ကျန်ကို စစ်ပြီး မလုံလောက်လျှင် AUTO ရပ်ပါမည်။</p>
            </div>

            {!user || user.balance < betAmount ? (
              <p className="rounded-xl border border-rose-300/20 bg-rose-950/30 px-3 py-2 text-[11px] text-rose-100" role="status">
                {!user ? 'AUTO မစတင်မီ အကောင့်ဝင်ပါ။' : 'လက်ကျန်ငွေ မလုံလောက်ပါ။ အရင်ငွေဖြည့်ပါ။'}
              </p>
            ) : null}

            <div className="flex gap-2">
              <button type="button" onClick={() => setIsAutoModalOpen(false)} className="min-h-12 flex-1 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-bold text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                မစတင်ပါ
              </button>
              <button
                type="button"
                disabled={!selectedAutoCount}
                onClick={() => {
                  if (!selectedAutoCount) return;
                  sounds.playChip();
                  if (!user) {
                    setIsAutoModalOpen(false);
                    showGameToast('AUTO စတင်ရန် အကောင့်ဝင်ပါ။');
                    onRequireAuth?.();
                    return;
                  }
                  if (user.balance < betAmount) {
                    setIsAutoModalOpen(false);
                    showGameToast('လက်ကျန်ငွေ မလုံလောက်ပါ။ ငွေအရင်ဖြည့်ပါ။');
                    onGoToWallet();
                    return;
                  }
                  setAutoSpinsRemaining(selectedAutoCount);
                  setIsAutoSpinning(true);
                  setIsAutoModalOpen(false);
                }}
                className="min-h-12 flex-1 rounded-xl bg-gradient-to-b from-amber-100 to-amber-500 px-3 text-xs font-black text-black shadow-lg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                AUTO စတင်မည်
              </button>
            </div>
          </div>
        </BuffaloDialog>
      )}
    </div>
  );
}

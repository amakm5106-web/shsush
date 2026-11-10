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
  ChevronLeft,
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
const SYMBOL_PAYOUTS: Record<string, { name: string; p3: number; p4: number; p5: number; p6: number }> = {
  buffalo: { name: 'ကျွဲရွှေ (Buffalo)', p3: 0.40, p4: 0.75, p5: 1.25, p6: 2.00 },
  eagle: { name: 'လင်းယုန် (Eagle)', p3: 0.30, p4: 0.55, p5: 0.95, p6: 1.50 },
  bear: { name: 'ဝက်ဝံ (Bear)', p3: 0.20, p4: 0.40, p5: 0.70, p6: 1.10 },
  wolf: { name: 'ဝံပုလွေ (Wolf)', p3: 0.15, p4: 0.30, p5: 0.50, p6: 0.80 },
  moose: { name: 'သမင်/မုစ် (Moose)', p3: 0.10, p4: 0.20, p5: 0.35, p6: 0.60 },
};

// Available Bet Options
const BET_OPTIONS = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];

// Diverse initial state (different symbols across all rows and columns)
const INITIAL_REELS: string[][] = [
  ['buffalo', 'wolf', 'moose', 'eagle'],
  ['bear', 'wild', 'buffalo', 'wolf'],
  ['eagle', 'scatter', 'moose', 'bear'],
  ['wolf', 'buffalo', 'wild', 'eagle'],
  ['moose', 'bear', 'wolf', 'buffalo'],
  ['scatter', 'eagle', 'buffalo', 'scatter'],
];

// Continuous rolling strips for 60fps downward reel spin animation
const COLUMN_SPIN_STRIPS: string[][] = [
  ['buffalo', 'wolf', 'eagle', 'bear', 'buffalo', 'wolf', 'eagle', 'bear'],
  ['wild', 'moose', 'buffalo', 'scatter', 'wild', 'moose', 'buffalo', 'scatter'],
  ['bear', 'wolf', 'wild', 'eagle', 'bear', 'wolf', 'wild', 'eagle'],
  ['moose', 'buffalo', 'scatter', 'bear', 'moose', 'buffalo', 'scatter', 'bear'],
  ['eagle', 'wild', 'wolf', 'buffalo', 'eagle', 'wild', 'wolf', 'buffalo'],
  ['scatter', 'bear', 'moose', 'eagle', 'scatter', 'bear', 'moose', 'eagle'],
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

  const reels: string[][] = [[], [], [], [], [], []];
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

    for (let col = 0; col < 6; col++) {
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

      for (let col = 0; col < 6; col++) {
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

      for (let col = 0; col < 6; col++) {
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
    false,
  ]);
  const [bouncingCols, setBouncingCols] = useState<boolean[]>([
    false,
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

  // 6 Reels x 4 Rows Matrix (Diverse symbols vertically and horizontally)
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

      // Instantly start all 6 columns rolling at 60fps
      activeSpinningColsRef.current = [true, true, true, true, true, true];
      setSpinningCols([true, true, true, true, true, true]);

      // Failsafe watchdog to guarantee reels can never get stuck
      const failsafeTimer = setTimeout(() => {
        clearInterval(spinInterval);
        setIsSpinning(false);
        setSpinningCols([false, false, false, false, false, false]);
        setBouncingCols([false, false, false, false, false, false]);
      }, 3500);

      // Staggered Reel Stopping with Dynamic Physics Bounce
      // Reel 1 (Col 0) stops at 480ms
      setTimeout(() => {
        activeSpinningColsRef.current[0] = false;
        setSpinningCols((prev) => [false, prev[1], prev[2], prev[3], prev[4], prev[5]]);
        setReels((prev) => [finalReels[0], prev[1], prev[2], prev[3], prev[4], prev[5]]);
        setBouncingCols((prev) => [true, prev[1], prev[2], prev[3], prev[4], prev[5]]);
        setTimeout(() => setBouncingCols((prev) => [false, prev[1], prev[2], prev[3], prev[4], prev[5]]), 400);
        playReelStopSound(0);
      }, 480);

      // Reel 2 (Col 1) stops at 720ms
      setTimeout(() => {
        activeSpinningColsRef.current[1] = false;
        setSpinningCols((prev) => [false, false, prev[2], prev[3], prev[4], prev[5]]);
        setReels((prev) => [prev[0], finalReels[1], prev[2], prev[3], prev[4], prev[5]]);
        setBouncingCols((prev) => [prev[0], true, prev[2], prev[3], prev[4], prev[5]]);
        setTimeout(() => setBouncingCols((prev) => [prev[0], false, prev[2], prev[3], prev[4], prev[5]]), 400);
        playReelStopSound(1);
      }, 720);

      // Reel 3 (Col 2) stops at 960ms
      setTimeout(() => {
        activeSpinningColsRef.current[2] = false;
        setSpinningCols((prev) => [false, false, false, prev[3], prev[4], prev[5]]);
        setReels((prev) => [prev[0], prev[1], finalReels[2], prev[3], prev[4], prev[5]]);
        setBouncingCols((prev) => [prev[0], prev[1], true, prev[3], prev[4], prev[5]]);
        setTimeout(() => setBouncingCols((prev) => [prev[0], prev[1], false, prev[3], prev[4], prev[5]]), 400);
        playReelStopSound(2);
      }, 960);

      // Reel 4 (Col 3) stops at 1200ms
      setTimeout(() => {
        activeSpinningColsRef.current[3] = false;
        setSpinningCols((prev) => [false, false, false, false, prev[4], prev[5]]);
        setReels((prev) => [prev[0], prev[1], prev[2], finalReels[3], prev[4], prev[5]]);
        setBouncingCols((prev) => [prev[0], prev[1], prev[2], true, prev[4], prev[5]]);
        setTimeout(() => setBouncingCols((prev) => [prev[0], prev[1], prev[2], false, prev[4], prev[5]]), 400);
        playReelStopSound(3);
      }, 1200);

      // Reel 5 (Col 4) stops at 1440ms
      setTimeout(() => {
        activeSpinningColsRef.current[4] = false;
        setSpinningCols((prev) => [false, false, false, false, false, prev[5]]);
        setReels((prev) => [prev[0], prev[1], prev[2], prev[3], finalReels[4], prev[5]]);
        setBouncingCols((prev) => [prev[0], prev[1], prev[2], prev[3], true, prev[5]]);
        setTimeout(() => setBouncingCols((prev) => [prev[0], prev[1], prev[2], prev[3], false, prev[5]]), 400);
        playReelStopSound(4);
      }, 1440);

      // Reel 6 (Col 5) stops at 1680ms - FINAL REEL
      setTimeout(() => {
        activeSpinningColsRef.current[5] = false;
        clearInterval(spinInterval);
        setSpinningCols([false, false, false, false, false, false]);
        setReels(finalReels);
        setWildMultipliers(finalWildMults);
        setBouncingCols([false, false, false, false, false, true]);
        setTimeout(() => setBouncingCols([false, false, false, false, false, false]), 420);
        playReelStopSound(5);
      }, 1680);

      // Payout Evaluation & Firestore updates after all reels have settled at 1800ms
      setTimeout(async () => {
        clearTimeout(failsafeTimer);
        setIsSpinning(false);

        // 2. Evaluate 4,096 Ways Win Math (Left to Right starting from Reel 0)
        const symbolTypes = ['buffalo', 'eagle', 'bear', 'wolf', 'moose'];
        let spinTotalWin = 0;
        const hitSymbols: string[] = [];
        const winningKeys: string[] = [];

        for (const targetSym of symbolTypes) {
          let consecutiveCols = 0;
          let waysCount = 1;
          let wildMultiplierProduct = 1;
          const currentMatches: string[] = [];

          for (let col = 0; col < 6; col++) {
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
            else if (consecutiveCols === 5) baseMult = payoutDef.p5;
            else if (consecutiveCols >= 6) baseMult = payoutDef.p6;

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
                selection: 'Charge Buffalo (6x4 Ways Slot)',
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
                selection: 'Charge Buffalo (6x4 Ways Slot)',
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

        // 4. Check Free Spins Trigger (3+ Scatters)
        if (totalScatterCount >= 3) {
          let awardedSpins = 8;
          if (totalScatterCount === 4) awardedSpins = 15;
          else if (totalScatterCount === 5) awardedSpins = 25;
          else if (totalScatterCount >= 6) awardedSpins = 100;

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
      className={`buffalo-game-shell fixed z-50 flex flex-col justify-between overflow-hidden text-white transition-all duration-300 select-none ${
        isRotatedActive
          ? 'buffalo-game-shell--rotated w-[100vh] h-[100vw] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 origin-center'
          : 'inset-0'
      }`}
      style={{
        backgroundImage: `radial-gradient(ellipse at 50% 25%, rgba(10, 15, 25, 0.72) 0%, rgba(5, 7, 12, 0.92) 75%, #030407 100%), url('/assets/casino/buffalo_canyon_bg.jpg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#04060a',
      }}
    >
      {/* Toast Notification Banner (Zero alerts, non-blocking smooth feedback) */}
      {gameToast && (
        <div role="status" aria-live="polite" className="fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-[#141822]/95 border border-amber-400/50 shadow-2xl shadow-black/80 rounded-full px-5 py-2 text-amber-200 text-xs sm:text-sm font-bold flex items-center gap-2 backdrop-blur-md pointer-events-none transition-all">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
          <span>{gameToast}</span>
        </div>
      )}

      <header className="z-30 flex w-full shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-zinc-950/85 px-2 py-1.5 backdrop-blur-xl sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              sounds.playChip();
              onBackToLobby();
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 sm:w-auto sm:gap-1 sm:px-2"
            title="အနောက်သို့ ပြန်ထွက်မည်"
            aria-label="ဂိမ်းစာရင်းသို့ ပြန်သွားရန်"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            <span className="hidden text-xs font-bold sm:inline">ထွက်မည်</span>
          </button>
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-lg border border-amber-200/25 bg-black">
              <Image src="/assets/slot-symbols/individual/buffalo.webp" alt="" fill sizes="28px" className="object-cover" />
            </div>
            <h1 className="hidden truncate text-sm font-black uppercase tracking-widest text-white sm:block">
              CHARGE BUFFALO
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <div
            role="group"
            className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/60 px-2 py-1 shadow-inner"
            aria-label={`လက်ကျန်ငွေ ${formatKs(user?.balance || 0)}`}
          >
            <span className="hidden text-[9px] font-bold text-white/50 sm:inline">လက်ကျန်</span>
            <span className="font-mono text-[11px] font-black text-white sm:text-xs">{formatKs(user?.balance || 0)}</span>
            <button
              type="button"
              onClick={() => {
                sounds.playChip();
                onGoToWallet();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-200 text-black shadow-sm transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              title="ငွေသွင်းရန်"
              aria-label="Wallet ဖွင့်ရန်၊ ငွေဖြည့်ရန်"
            >
              <Plus className="h-4 w-4 stroke-[3]" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              sounds.playChip();
              onToggleSound();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            title="အသံ ဖွင့်/ပိတ်"
            aria-label={soundEnabled ? 'အသံပိတ်ရန်' : 'အသံဖွင့်ရန်'}
            aria-pressed={soundEnabled}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4 text-white/55" aria-hidden="true" />}
          </button>

          <button
            type="button"
            onClick={toggleFullScreen}
            className="hidden h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 sm:flex"
            title="မျက်နှာပြင်အပြည့်"
            aria-label="မျက်နှာပြင်အပြည့်ဖွင့်/ပိတ်ရန်"
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Free Spins Active Banner (during free spins) */}
      {isFreeSpinsActive && (
        <div className="w-full py-0.5 px-3 bg-zinc-900/95 border-b border-white/15 flex items-center justify-between text-white shadow-lg shrink-0">
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

      {/* ========================================================================= */}
      {/* CENTER ARENA: Compact 6 Reels x 4 Rows Matrix (Neatly Proportioned)       */}
      {/* ========================================================================= */}
      <main className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-2 overflow-y-auto px-2 py-2">
        {/* Responsive Slot Grid Container: Luxury Dark Obsidian Glass with Warm Amber Sheen */}
        <div
          className={`buffalo-reel-stage relative rounded-2xl p-1.5 sm:p-2.5 md:p-3 border backdrop-blur-2xl transition-all flex flex-col justify-center w-full max-w-[420px] sm:max-w-xl md:max-w-2xl lg:max-w-3xl ${
            isScreenShaking ? 'animate-screen-shake' : ''
          } ${
            isSubBetCelebration
              ? 'border-amber-400/90 shadow-[0_0_35px_rgba(245,158,11,0.35)] bg-zinc-950/90'
              : 'border-amber-500/25 shadow-[0_16px_50px_rgba(0,0,0,0.95)] bg-zinc-950/85'
          }`}
        >
          {/* Subtle Ambient Sheen */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(245,158,11,0.03),transparent_75%)] pointer-events-none" />

          {/* 6 Columns Container with Responsive Aspect-Square Cells */}
          <div className="grid grid-cols-6 gap-1 sm:gap-1.5 md:gap-2 relative z-10 w-full">
            {reels.map((columnSymbols, colIdx) => {
              const isColSpinning = spinningCols[colIdx];
              const isColBouncing = bouncingCols[colIdx];
              const spinStrip = COLUMN_SPIN_STRIPS[colIdx] || COLUMN_SPIN_STRIPS[0];

              return (
                <div
                  key={`reel-col-${colIdx}`}
                  className="relative overflow-hidden rounded-xl bg-zinc-950/70 backdrop-blur-md p-0.5 sm:p-1 border border-white/10"
                >
                  {isColSpinning ? (
                    <div className="animate-reel-strip-spin flex flex-col gap-1 sm:gap-1.5 filter blur-[1px]">
                      {spinStrip.map((symId, sIdx) => (
                        <div
                          key={`spin-strip-${colIdx}-${sIdx}`}
                          className="buffalo-reel-cell aspect-square w-full min-h-[42px] sm:min-h-[56px] md:min-h-[68px] lg:min-h-[76px] rounded-lg overflow-hidden shrink-0"
                        >
                          <BuffaloSymbolImage
                            symbolId={symId}
                            className="w-full h-full"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      className={`flex flex-col gap-1 sm:gap-1.5 ${
                        isColBouncing ? 'animate-reel-bounce' : ''
                      }`}
                    >
                      {columnSymbols.map((symId, rowIdx) => {
                        const wildMult = wildMultipliers[`${colIdx}-${rowIdx}`] || 1;
                        const isWinningCell = winningCells.includes(`${colIdx}-${rowIdx}`);
                        return (
                          <div
                            key={`cell-${colIdx}-${rowIdx}`}
                            className={`buffalo-reel-cell aspect-square w-full min-h-[42px] sm:min-h-[56px] md:min-h-[68px] lg:min-h-[76px] rounded-lg relative overflow-hidden transition-all ${
                              isWinningCell ? 'z-20' : ''
                            }`}
                          >
                            <BuffaloSymbolImage
                              symbolId={symId}
                              wildMultiplier={wildMult}
                              isWinning={isWinningCell}
                              className="w-full h-full"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Payline Notice at bottom edge of grid */}
          <div className="mt-1 px-1.5 flex items-center justify-between text-[9px] sm:text-[10px] text-white/60 font-semibold z-10">
            <span>ဘယ်ဘက်မှ ၃ ကော်လံ ဆက်တိုက် (4,096 WAYS)</span>
            <span className="text-white font-black tracking-wider">CHARGE BUFFALO</span>
          </div>
        </div>
        <BuffaloResultEffects
          result={spinFeedback}
          isSpinning={isSpinning}
          isFreeSpinActive={isFreeSpinsActive}
          betAmount={betAmount}
          message={winningInfo}
        />
      </main>

      <footer className="z-30 w-full shrink-0 border-t border-white/10 bg-zinc-950/95 px-2 py-2 shadow-[0_-8px_25px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:px-4">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
          {!user ? (
            <div className="buffalo-user-banner flex min-h-10 items-center justify-between gap-2 rounded-xl border border-sky-300/20 bg-sky-950/35 px-3 py-1.5 text-[11px] text-sky-100" role="status">
              <span>ကစားရန် အကောင့်ဝင်ရန် လိုအပ်ပါသည်။</span>
              <button
                type="button"
                onClick={() => onRequireAuth?.()}
                className="min-h-10 shrink-0 rounded-lg bg-sky-200 px-3 font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                ဝင်ရောက်ရန်
              </button>
            </div>
          ) : user.balance < betAmount ? (
            <div className="buffalo-user-banner flex min-h-10 items-center justify-between gap-2 rounded-xl border border-rose-300/25 bg-rose-950/35 px-3 py-1.5 text-[11px] text-rose-100" role="alert">
              <span className="min-w-0 truncate">လက်ကျန် {formatKs(user.balance)} — တစ်ကြိမ်လှည့်ရန် {formatKs(betAmount)} လိုအပ်ပါသည်။</span>
              <button
                type="button"
                onClick={onGoToWallet}
                className="min-h-10 shrink-0 rounded-lg bg-rose-100 px-3 font-black text-rose-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                ငွေဖြည့်ရန်
              </button>
            </div>
          ) : null}

          <div className="buffalo-controls-row flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="buffalo-controls-summary grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <div className="flex min-h-12 min-w-0 flex-col justify-center rounded-xl border border-amber-200/15 bg-black/55 px-3 py-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-white/50">WIN · ဆုကြေး</span>
                <span className="truncate font-mono text-xs font-black text-amber-100">Ks {lastWinAmount.toLocaleString()}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isSpinning || isAutoSpinning) return;
                  sounds.playChip();
                  setIsBetModalOpen(true);
                }}
                disabled={isSpinning || isAutoSpinning || isFreeSpinsActive}
                className="flex min-h-12 min-w-0 flex-col items-start justify-center rounded-xl border border-white/20 bg-white/10 px-3 py-1 text-left transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 sm:min-w-[116px]"
                aria-label={isFreeSpinsActive ? `Free Spin လှည့်ခ Ks 0 ဖြစ်ပြီး ဆုတွက်ရန်အခြေခံ ${formatKs(betAmount)} ဖြစ်ပါသည်။ Free Spin ပြီးမှ လောင်းကြေးပြောင်းနိုင်ပါမည်။` : `လောင်းကြေးကို ပြောင်းရန်၊ တစ်ကြိမ် ${formatKs(betAmount)}`}
              >
                <span className="text-[9px] font-bold text-white/60">{isFreeSpinsActive ? 'Free Spin · ကုန်ကျငွေ' : 'တစ်ကြိမ်လောင်းကြေး'}</span>
                <span className="truncate font-mono text-xs font-black text-white" title={isFreeSpinsActive ? `Free Spin ကုန်ကျ Ks 0; ဆုတွက်ရန်အခြေခံ Ks ${betAmount.toLocaleString()}` : formatKs(betAmount)}>
                  {isFreeSpinsActive ? 'Ks 0' : formatKs(betAmount)}
                </span>
                {isFreeSpinsActive && <small className="buffalo-free-spin-basis truncate text-[8px] font-semibold text-amber-100/70">ဆုတွက်ရန် {formatKs(betAmount)}</small>}
              </button>
            </div>

            <div className="buffalo-controls-actions grid grid-cols-3 gap-2 sm:flex sm:items-center">
              <button
                type="button"
                onClick={() => executeSpin(false)}
                disabled={isSpinning || isAutoSpinning || isFreeSpinsActive || Boolean(user && user.balance < betAmount)}
                className="flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-amber-100/40 bg-gradient-to-b from-amber-100 to-amber-500 px-2 text-black shadow-[0_0_18px_rgba(245,158,11,0.25)] transition hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:grayscale disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:min-w-[108px]"
                aria-label={isFreeSpinsActive ? `အလိုအလျောက် Free Spin လည်နေပါသည်၊ ${freeSpinsLeft} ကြိမ် ကျန်` : `Spin တစ်ကြိမ် လှည့်ရန်၊ လောင်းကြေး ${formatKs(betAmount)}`}
              >
                {isSpinning ? <RotateCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                <span className="text-xs font-black">{isSpinning ? 'လည်နေသည်' : isFreeSpinsActive ? `FREE ${freeSpinsLeft}` : 'SPIN'}</span>
                {!isSpinning && !isFreeSpinsActive && <span className="hidden text-[9px] font-bold sm:inline">{formatKs(betAmount)}</span>}
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
                className={`flex min-h-12 min-w-0 items-center justify-center gap-1 rounded-xl border px-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                  isAutoSpinning
                    ? 'border-amber-200 bg-amber-300 text-black shadow-[0_0_15px_rgba(251,191,36,0.4)]'
                    : 'border-white/20 bg-white/10 text-white hover:bg-white/15'
                }`}
                aria-label={isAutoSpinning ? `Auto Spin ရပ်ရန်၊ ${autoSpinsRemaining} ကြိမ် ကျန်` : 'Auto Spin အကြိမ်ရေ ရွေးရန်'}
                aria-pressed={isAutoSpinning}
                disabled={!isAutoSpinning && (isSpinning || isFreeSpinsActive)}
              >
                <RotateCcw className={`h-4 w-4 shrink-0 ${isAutoSpinning ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span className="truncate text-[10px] font-black">{isAutoSpinning ? `STOP ${autoSpinsRemaining}` : 'AUTO'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sounds.playChip();
                  setIsBuyBonusModalOpen(true);
                }}
                className="flex min-h-12 min-w-0 items-center justify-center gap-1 rounded-xl border border-red-300/30 bg-gradient-to-b from-red-950 to-red-900 px-2 text-red-100 shadow-md transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 sm:min-w-[118px]"
                aria-label={`Buy Bonus ဖွင့်ရန်၊ ကုန်ကျငွေ ${formatKs(betAmount * 100)}`}
                disabled={isSpinning || isAutoSpinning || isFreeSpinsActive}
              >
                <Flame className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                <span className="truncate text-[9px] font-black sm:text-[10px]">BONUS 100×</span>
              </button>
            </div>
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

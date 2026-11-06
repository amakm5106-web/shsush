'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  RotateCcw,
  Sparkles,
  Coins,
  Plus,
  Flame,
  CheckCircle2,
  X,
  Smartphone,
  Volume2,
  VolumeX,
  Maximize2,
  ChevronLeft,
  Trophy,
  RotateCw,
  Zap,
  ShieldAlert,
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

interface BuffaloSlotGameProps {
  user: UserProfile | null;
  settings: GameSettings;
  onBackToLobby: () => void;
  onGoToWallet: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onUpdateUserBalance?: (newBalance: number) => void;
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

  // 6 Reels x 4 Rows Matrix (Diverse symbols vertically and horizontally)
  const [reels, setReels] = useState<string[][]>(INITIAL_REELS);

  // Win and Multiplier States
  const [lastWinAmount, setLastWinAmount] = useState<number>(0);
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

  // Device Portrait Detection & Responsive Landscape Toggle
  const [isPortrait, setIsPortrait] = useState<boolean>(false);
  const [forceLandscapeView, setForceLandscapeView] = useState<boolean>(false);
  const [dismissRotatePrompt, setDismissRotatePrompt] = useState<boolean>(true);
  const [isSubBetCelebration, setIsSubBetCelebration] = useState<boolean>(false);

  // Behavioral & Touch Telemetry Tracking
  const lastSettledAtRef = useRef<number>(0);
  const betHistoryRef = useRef<number[]>([200]);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTelemetryRef = useRef<EngagementTelemetry>({});

  useEffect(() => {
    lastSettledAtRef.current = Date.now();
  }, []);

  // Auto Fullscreen & Auto-Orientation Request upon entering Buffalo Slot Game
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Auto-request Fullscreen if supported
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {
      // Ignore fullscreen restrictions in certain iframes
    }

    // 2. Auto-request device screen orientation lock to landscape if supported
    try {
      const screenAny = window.screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } };
      if (screenAny?.orientation?.lock) {
        screenAny.orientation.lock('landscape').catch(() => {});
      }
    } catch {
      // Orientation lock fallback
    }

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

      if (!user) {
        alert('ကစားရန် အရင်ဆုံး Google ဖြင့် အကောင့်ဝင်ပေးပါ။');
        return;
      }

      // Check balance if not a free spin
      if (!isFreeSpin && user.balance < betAmount) {
        setIsAutoSpinning(false);
        alert('လက်ကျန်ငွေ မလုံလောက်ပါ။ ကျေးဇူးပြု၍ ငွေအရင်ဖြည့်သွင်းပါ။');
        onGoToWallet();
        return;
      }

      setIsSpinning(true);
      setWinningCells([]);
      setWinningInfo('လည်နေသည်...');
      sounds.playChip();

      // 1. Deduct bet immediately in UI state without blocking
      let currentBalance = user.balance;
      if (!isFreeSpin) {
        currentBalance = Math.max(0, user.balance - betAmount);
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
            setIsScreenShaking(true);
            setTimeout(() => setIsScreenShaking(false), 550);
            setBigWinData({
              amount: spinTotalWin,
              bet: betAmount,
            });
          }

          // 1. Credit balance to Firestore
          const finalBal = currentBalance + spinTotalWin;
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
        } else {
          setIsSubBetCelebration(false);
          setLossStreak((prev) => prev + 1);
          setWinningInfo(
            isFreeSpin
              ? 'Free Spin တွင် ဆုကြေးမပေါက်ပါ'
              : 'နောက်တစ်ကြိမ် ထပ်စမ်းပါ'
          );
          // Record Loss Bet if paid spin
          if (!isFreeSpin) {
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

          setTotalFreeSpinsWon(awardedSpins);
          setFreeSpinsLeft((prev) => prev + awardedSpins);
          setIsFreeSpinsActive(true);
          setShowBonusTriggerModal(true);
          sounds.playWin();

          confetti({
            particleCount: 150,
            spread: 100,
            origin: { y: 0.5 },
          });
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
      onUpdateUserBalance,
      playSlotChime,
      playReelStopSound,
      isFreeSpinsActive,
    ]
  );

  // Auto-Spin and Free Spins Engine
  useEffect(() => {
    if (isSpinning) return;

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
      alert('ကစားရန် အရင်ဆုံး အကောင့်ဝင်ပေးပါ။');
      return;
    }
    const cost = betAmount * 100;
    if (user.balance < cost) {
      alert(`လက်ကျန်ငွေ မလုံလောက်ပါ။ Buy Bonus ဝယ်ယူရန် Ks ${cost.toLocaleString()} လိုအပ်ပါသည်။`);
      setIsBuyBonusModalOpen(false);
      onGoToWallet();
      return;
    }

    setIsBuyBonusModalOpen(false);
    const newBal = user.balance - cost;
    if (onUpdateUserBalance) onUpdateUserBalance(newBal);

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        balance: newBal,
        totalBetCumulative: (user.totalBetCumulative || 0) + cost,
        wagerSinceLastWithdrawal: (user.wagerSinceLastWithdrawal || 0) + cost,
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.error(e);
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
  const isRotatedActive = isPortrait && forceLandscapeView;

  return (
    <div
      className={`fixed z-50 text-white flex flex-col justify-between select-none overflow-hidden transition-all duration-300 ${
        isRotatedActive
          ? 'w-[100vh] h-[100vw] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 origin-center'
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
      {/* Device Rotation Advisory: Prompt user to turn phone sideways if opened in portrait */}
      {isPortrait && !dismissRotatePrompt && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-4 sm:p-6 bg-black/95 backdrop-blur-2xl text-center select-none animate-fadeIn">
          <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mb-3 shadow-[0_0_30px_rgba(255,255,255,0.15)]">
            <Smartphone className="w-7 h-7 text-white animate-bounce" />
          </div>
          <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-tight mb-1.5">
            ဖုန်းကို ဘေးစောင်း (Landscape) လှည့်ပေးပါ
          </h2>
          <p className="text-xs text-white/70 max-w-xs leading-relaxed mb-5 font-medium">
            Charge Buffalo (ကျွဲဂိမ်း) ကို စစ်မှန်သော ကာစီနိုစက်ကြီးများအတိုင်း မျက်နှာပြင်ပြည့် ကွက်တိကျကျ ကစားနိုင်ရန် ဖုန်းကို ဘေးစောင်းကိုင်ပေးပါ။
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-xs">
            <button
              onClick={() => {
                sounds.playChip();
                setForceLandscapeView(true);
                setDismissRotatePrompt(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-zinc-100 text-black font-black text-xs active:scale-95 transition-all shadow-lg flex items-center gap-1.5"
            >
              <RotateCw className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>အစောင်း လှည့်မည် (Rotate 90°)</span>
            </button>
            <button
              onClick={() => {
                sounds.playChip();
                toggleFullScreen();
                setDismissRotatePrompt(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white font-bold text-xs active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>မျက်နှာပြင် အပြည့်</span>
            </button>
            <button
              onClick={() => {
                sounds.playChip();
                setDismissRotatePrompt(true);
              }}
              className="px-3 py-1.5 rounded-xl text-white/60 hover:text-white text-[11px] font-medium"
            >
              ဆက်လက်ကစားမည်
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TOP HEADER BAR: Sleek Dark Frosted Glass & Line Icons     */}
      {/* ========================================================= */}
      <header className="w-full px-2 sm:px-3 py-1 sm:py-1.5 border-b border-white/10 bg-zinc-950/80 backdrop-blur-xl flex items-center justify-between z-30 shrink-0">
        {/* Left: Back & Game Branding */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => {
              sounds.playChip();
              onBackToLobby();
            }}
            className="p-1 sm:p-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white active:scale-95 transition-all flex items-center gap-1 shadow-sm"
            title="အနောက်သို့ ပြန်ထွက်မည်"
          >
            <ChevronLeft className="w-4 h-4 text-white stroke-[2]" />
            <span className="text-xs font-bold text-white">ထွက်မည်</span>
          </button>

          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg overflow-hidden border border-white/20 bg-black flex items-center justify-center">
              <img
                src="/assets/slot-symbols/individual/buffalo.png"
                alt="Buffalo"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/assets/slot-symbols/individual/buffalo.webp';
                }}
              />
            </div>
            <h1 className="text-xs sm:text-sm font-black font-sans uppercase tracking-widest text-white">
              CHARGE BUFFALO
            </h1>
          </div>

          {/* BUY BONUS Quick Action */}
          <button
            onClick={() => {
              sounds.playChip();
              setIsBuyBonusModalOpen(true);
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-950/60 hover:bg-red-900/60 border border-red-500/40 text-red-200 font-black text-[10px] shadow-sm hover:scale-105 active:scale-95 transition-all ml-0.5"
          >
            <Flame className="w-3 h-3 text-red-400 stroke-[2]" />
            <span>BONUS 100×</span>
          </button>
        </div>

        {/* Center: Live Status or Winning Info */}
        <div className="flex items-center justify-center px-1">
          <div className="px-2.5 py-0.5 rounded-full bg-black/60 border border-white/15 shadow-inner max-w-[170px] sm:max-w-xs truncate text-center">
            <span className="text-[10px] sm:text-[11px] font-black text-white truncate">
              {winningInfo}
            </span>
          </div>
        </div>

        {/* Right: Balance, Rotate & Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Quick Balance */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-xl bg-black/60 border border-white/15 shadow-inner">
            <span className="text-[9px] text-white/50 font-bold hidden sm:inline">လက်ကျန်:</span>
            <span className="text-xs font-black font-mono text-white">
              {formatKs(user?.balance || 0)}
            </span>
            <button
              onClick={() => {
                sounds.playChip();
                onGoToWallet();
              }}
              className="w-4 h-4 rounded-full bg-white hover:bg-zinc-200 text-black font-black text-[10px] flex items-center justify-center active:scale-95 transition-all ml-0.5 shadow-sm"
              title="ငွေသွင်းရန်"
            >
              <Plus className="w-3 h-3 stroke-[3]" />
            </button>
          </div>

          {/* Rotate View Toggle Button */}
          <button
            onClick={() => {
              sounds.playChip();
              setForceLandscapeView((prev) => !prev);
            }}
            className={`p-1 sm:p-1.5 rounded-xl border transition-all ${
              forceLandscapeView
                ? 'bg-white text-black border-white shadow-sm'
                : 'bg-white/10 hover:bg-white/15 border-white/15 text-white'
            }`}
            title="မျက်နှာပြင် အစောင်း/ဒေါင်လိုက် လှည့်ရန်"
          >
            <RotateCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2]" />
          </button>

          {/* Sound Toggle */}
          <button
            onClick={() => {
              sounds.playChip();
              onToggleSound();
            }}
            className="p-1 sm:p-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white active:scale-95 transition-all"
            title="အသံ ဖွင့်/ပိတ်"
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white stroke-[2]" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/50 stroke-[2]" />
            )}
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullScreen}
            className="p-1 sm:p-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white active:scale-95 transition-all hidden sm:flex"
            title="မျက်နှာပြင် အပြည့်"
          >
            <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white stroke-[2]" />
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
      <main className="flex-1 w-full flex flex-col justify-center items-center px-1 sm:px-2 py-0.5 overflow-hidden">
        {/* Dynamic Status Message Bar */}
        <div className="w-full max-w-[420px] sm:max-w-xl md:max-w-2xl lg:max-w-3xl mb-1 px-3 py-1 rounded-xl bg-zinc-950/80 border border-white/10 backdrop-blur-md flex items-center justify-between text-center shrink-0">
          <div className="flex items-center gap-2 mx-auto">
            {isSubBetCelebration || lastWinAmount > 0 ? (
              <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
            ) : isSpinning ? (
              <RotateCw className="w-4 h-4 text-amber-400 animate-spin" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-white/50" />
            )}
            <span
              className={`text-[11px] sm:text-xs font-bold tracking-wide truncate ${
                isSubBetCelebration || lastWinAmount > 0
                  ? 'text-amber-300 animate-pulse font-black'
                  : 'text-white/80'
              }`}
            >
              {winningInfo}
            </span>
          </div>
        </div>

        {/* Responsive Slot Grid Container: Luxury Dark Obsidian Glass with Warm Amber Sheen */}
        <div
          className={`relative rounded-2xl p-1.5 sm:p-2.5 md:p-3 border backdrop-blur-2xl transition-all flex flex-col justify-center w-full max-w-[420px] sm:max-w-xl md:max-w-2xl lg:max-w-3xl ${
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
                          className="aspect-square w-full min-h-[42px] sm:min-h-[56px] md:min-h-[68px] lg:min-h-[76px] rounded-lg overflow-hidden shrink-0"
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
                            className={`aspect-square w-full min-h-[42px] sm:min-h-[56px] md:min-h-[68px] lg:min-h-[76px] rounded-lg relative overflow-hidden transition-all ${
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
      </main>

      {/* ========================================================================= */}
      {/* BOTTOM CONTROL ARENA: Dark Frosted Glass Dashboard & White Bold Buttons   */}
      {/* ========================================================================= */}
      <footer className="w-full px-2 sm:px-4 py-1.5 border-t border-white/10 bg-zinc-950/90 backdrop-blur-2xl shadow-[0_-8px_25px_rgba(0,0,0,0.9)] flex items-center justify-between z-30 shrink-0">
        <div className="w-full max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
          {/* 1. WIN DISPLAY */}
          <div className="flex flex-col items-start px-2 py-0.5 rounded-xl bg-black/60 border border-white/15 min-w-[85px] sm:min-w-[105px]">
            <span className="text-[9px] font-black tracking-widest text-white/50 uppercase">
              WIN (ဆုကြေး)
            </span>
            <span className="text-xs sm:text-sm font-black font-mono text-white">
              Ks {lastWinAmount.toLocaleString()}
            </span>
          </div>

          {/* 2. BET SELECTOR BUTTON */}
          <button
            onClick={() => {
              if (isSpinning) return;
              sounds.playChip();
              setIsBetModalOpen(true);
            }}
            disabled={isSpinning}
            className="flex flex-col items-center px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 shadow active:scale-95 transition-all min-w-[80px] sm:min-w-[100px]"
          >
            <span className="text-[9px] font-bold text-white/60 uppercase">
              လောင်းကြေး
            </span>
            <span className="text-xs font-black font-mono text-white">
              Ks {betAmount.toLocaleString()}
            </span>
          </button>

          {/* 3. CENTER COMPACT [ SPIN ] BUTTON: Modern White & Dark Frosted Disc */}
          <button
            onClick={() => executeSpin(false)}
            disabled={isSpinning || (user ? user.balance < betAmount : false)}
            className={`relative rounded-full p-1 transition-all shadow-[0_0_20px_rgba(255,255,255,0.25)] ${
              isSpinning
                ? 'scale-95 cursor-not-allowed opacity-90'
                : 'hover:scale-105 active:scale-95'
            }`}
            style={{
              width: '54px',
              height: '54px',
              background: 'linear-gradient(135deg, #ffffff 0%, #d4d4d8 60%, #71717a 100%)',
            }}
          >
            {/* Concentric Dark Core with Bold White Text / Active Spinner */}
            <div className="w-full h-full rounded-full flex flex-col items-center justify-center bg-black shadow-inner">
              {isSpinning ? (
                <RotateCw className="w-5 h-5 text-amber-400 animate-spin" />
              ) : (
                <span className="text-[12px] font-black font-sans uppercase tracking-tight text-white">
                  SPIN
                </span>
              )}
            </div>
          </button>

          {/* 4. AUTO SPIN BUTTON */}
          <button
            onClick={() => {
              if (isAutoSpinning) {
                sounds.playChip();
                setIsAutoSpinning(false);
                setAutoSpinsRemaining(0);
              } else {
                sounds.playChip();
                setIsAutoModalOpen(true);
              }
            }}
            className={`flex flex-col items-center px-2 py-1 rounded-xl border transition-all min-w-[70px] sm:min-w-[85px] ${
              isAutoSpinning
                ? 'bg-amber-400 text-black border-amber-300 font-black shadow-[0_0_15px_rgba(251,191,36,0.5)] animate-pulse'
                : 'bg-white/10 hover:bg-white/15 border-white/20 text-white active:scale-95'
            }`}
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isAutoSpinning ? 'animate-spin stroke-[2.5]' : 'stroke-[2]'}`} />
            <span className="text-[9px] font-black uppercase mt-0.5">
              {isAutoSpinning ? `STOP (${autoSpinsRemaining})` : 'AUTO'}
            </span>
          </button>

          {/* 5. BUY BONUS BUTTON */}
          <button
            onClick={() => {
              sounds.playChip();
              setIsBuyBonusModalOpen(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-950/60 hover:bg-red-900/60 border border-red-500/40 text-red-200 font-black text-[10px] sm:text-[11px] shadow-md hover:scale-105 active:scale-95 transition-all"
          >
            <Flame className="w-3 h-3 text-red-400 stroke-[2]" />
            <span>BONUS 100×</span>
          </button>
        </div>
      </footer>

      {/* ========================================================= */}
      {/* POPUP MODALS: Big Win, Bet Selector, Buy Bonus, Free Spins */}
      {/* ========================================================= */}

      {/* SPECTACULAR BIG WIN CELEBRATION MODAL */}
      {bigWinData && (
        <BuffaloBigWinModal
          winAmount={bigWinData.amount}
          betAmount={bigWinData.bet}
          onClose={() => setBigWinData(null)}
        />
      )}

      {/* MODAL 1: Bet Selector Modal: Dark Glass & Bold White Typography */}
      {isBetModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-2xl animate-fadeIn select-none">
          <div className="w-full max-w-xs rounded-2xl p-3.5 border border-white/20 bg-zinc-950/90 shadow-2xl flex flex-col gap-2.5 text-center">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-white stroke-[2]" />
                <h3 className="text-xs font-black text-white uppercase tracking-wider">
                  လောင်းကြေး ရွေးချယ်ပါ
                </h3>
              </div>
              <button
                onClick={() => setIsBetModalOpen(false)}
                className="p-1 rounded-full text-white/60 hover:text-white"
              >
                <X className="w-4 h-4 stroke-[2]" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {BET_OPTIONS.map((amt) => (
                <button
                  key={`bet-opt-${amt}`}
                  onClick={() => {
                    setBetAmount(amt);
                    setIsBetModalOpen(false);
                    sounds.playChip();
                  }}
                  className={`py-1.5 px-1 rounded-xl text-[11px] font-black font-mono border transition-all ${
                    betAmount === amt
                      ? 'bg-white text-black border-white shadow-md scale-105'
                      : 'bg-black/60 text-white/90 border-white/15 hover:border-white/30'
                  }`}
                >
                  Ks {amt.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: BUY BONUS Confirmation Modal */}
      {isBuyBonusModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-2xl animate-fadeIn select-none">
          <div className="w-full max-w-xs sm:max-w-sm rounded-2xl p-3 sm:p-4 border border-white/20 bg-zinc-950/90 shadow-2xl flex flex-col items-center gap-2.5 text-center">
            <div className="w-12 h-12 rounded-xl border border-white/20 overflow-hidden shadow-lg bg-black flex items-center justify-center">
              <img
                src="/assets/slot-symbols/individual/buffalo.webp"
                alt="Charge Buffalo"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <span className="text-[9px] uppercase font-black tracking-widest text-red-300 block">
                SPECIAL FEATURE
              </span>
              <h3 className="text-base font-black text-white">
                BUY BONUS (100 × BET)
              </h3>
              <p className="text-[11px] text-white/70 mt-0.5">
                Free Spins ၁၀ ကြိမ် ချက်ချင်းရယူပြီး WILD Multipliers ×2, ×3, ×5 ရယူပါ!
              </p>
            </div>

            <div className="py-1.5 px-3 rounded-xl bg-black/60 border border-white/15 w-full flex items-center justify-between">
              <span className="text-[11px] text-white/70">ကျသင့်ငွေ:</span>
              <span className="text-sm font-black font-mono text-white">
                Ks {(betAmount * 100).toLocaleString()}
              </span>
            </div>

            <div className="flex items-center gap-2 w-full pt-1">
              <button
                onClick={handleConfirmBuyBonus}
                className="flex-1 py-2 rounded-xl bg-white hover:bg-zinc-100 text-black font-black text-xs active:scale-95 transition-all shadow-md"
              >
                ဝယ်ယူမည်
              </button>
              <button
                onClick={() => setIsBuyBonusModalOpen(false)}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs active:scale-95 transition-all"
              >
                မဝယ်ပါ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Free Spins Trigger Celebration Modal */}
      {showBonusTriggerModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-2xl animate-fadeIn select-none">
          <div className="w-full max-w-xs rounded-2xl p-4 border border-white/20 bg-zinc-950/90 shadow-2xl flex flex-col items-center gap-2.5 text-center">
            <Sparkles className="w-8 h-8 text-white animate-spin stroke-[2]" />
            <div>
              <h3 className="text-lg font-black text-white uppercase">
                CONGRATULATIONS!
              </h3>
              <p className="text-sm font-black text-white mt-0.5">
                FREE SPINS {totalFreeSpinsWon} ကြိမ် ရရှိပါသည်!
              </p>
              <p className="text-[11px] text-white/70 mt-1">
                WILD များမှ ×2, ×3, ×5 ဆုကြေးများ ပေးအပ်ပါမည်!
              </p>
            </div>
            <button
              onClick={() => {
                setShowBonusTriggerModal(false);
                sounds.playChip();
              }}
              className="w-full py-2 rounded-xl bg-white hover:bg-zinc-100 text-black font-black text-xs active:scale-95 transition-all shadow-lg flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
              <span>စတင်လည်မည်</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL 4: AUTO SPIN COUNT SELECTION MODAL */}
      {isAutoModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-2xl animate-fadeIn select-none">
          <div className="w-full max-w-xs sm:max-w-sm rounded-2xl p-3.5 sm:p-4 border border-white/20 bg-zinc-950/95 shadow-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-white stroke-[2.5]" />
                <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                  Auto Spin အရေအတွက် ရွေးချယ်ပါ
                </h3>
              </div>
              <button
                onClick={() => setIsAutoModalOpen(false)}
                className="p-1 rounded-full text-white/60 hover:text-white"
              >
                <X className="w-4 h-4 stroke-[2]" />
              </button>
            </div>

            <p className="text-[11px] text-white/70">
              အလိုအလျောက် လှည့်မည့် အကြိမ်ရေကို ရွေးချယ်ပါ။ လှည့်နေစဉ် အချိန်မရွေး STOP နှိပ်၍ ရပ်တန့်နိုင်ပါသည်။
            </p>

            <div className="grid grid-cols-2 gap-2">
              {[10, 20, 50, 100].map((count) => (
                <button
                  key={`auto-spin-count-${count}`}
                  onClick={() => {
                    sounds.playChip();
                    if (user && user.balance < betAmount) {
                      setWinningInfo('လက်ကျန်ငွေ မလုံလောက်ပါ');
                      setIsAutoModalOpen(false);
                      return;
                    }
                    setAutoSpinsRemaining(count);
                    setIsAutoSpinning(true);
                    setIsAutoModalOpen(false);
                  }}
                  className="py-2.5 px-2 rounded-xl text-xs font-black font-mono border border-white/20 bg-zinc-900/90 hover:bg-white hover:text-black hover:border-white transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-md"
                >
                  <RotateCcw className="w-3.5 h-3.5 stroke-[2]" />
                  <span>{count} ကြိမ်</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setIsAutoModalOpen(false)}
              className="w-full py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white/80 font-bold text-[11px] transition-all"
            >
              ပိတ်မည်
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

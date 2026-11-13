'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  documentId,
  onSnapshot,
  query,
  orderBy,
  startAt,
  endAt,
  limit,
  where,
  getDocs,
  runTransaction,
} from 'firebase/firestore';
import confetti from 'canvas-confetti';
import {
  Dices,
  Wallet,
  HelpCircle,
  User,
  ShieldAlert,
  Volume2,
  VolumeX,
  Clock,
  LogIn,
  History,
  Sparkles,
  Users,
  ArrowLeft,
  Play,
  Flame,
  Megaphone,
  Crown,
  ChevronRight,
  ChevronLeft,
  Bell,
  Search,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  Gamepad2,
  ReceiptText,
  Gift,
  Star,
  X,
  Headphones,
  ArrowDownLeft,
  ArrowUpRight,
  Fish,
} from 'lucide-react';

import { db, testConnection, handleFirestoreError, OperationType } from '@/lib/firebase';
import {
  detectBotOrAutomation,
  verifyActionVelocity,
  generateEphemeralToken,
  isTokenValid,
  consumeSecurityToken,
  enforceFreshAuthToken,
} from '@/lib/security';
import {
  GameRound,
  GameSettings,
  PlayerBet,
  UserProfile,
  DepositRequest,
  WithdrawalRequest,
  ReferralMember,
  BoundBank,
  CurrentRoundData,
  UserActivitySnapshot,
} from '@/lib/types';
import {
  DEFAULT_SETTINGS,
  ADMIN_EMAIL,
  ADMIN_EMAILS,
  isAdminEmail,
  classifyDiceTotal,
  classifyDiceColor,
  getColorLabel,
  formatKs,
  TELEGRAM_CHANNEL_LINK,
  CUSTOMER_SERVICE_BOT_LINK,
  openTelegramLink,
} from '@/lib/constants';
import { sounds } from '@/lib/audio';

import { DiceRoller } from '@/components/DiceRoller';
import { BettingBoard } from '@/components/BettingBoard';
import { RulesModal } from '@/components/RulesModal';
import { ProfileModal } from '@/components/ProfileModal';
import { AdminModal } from '@/components/AdminModal';
import { HistoryModal } from '@/components/HistoryModal';
import { RoundHistoryTable } from '@/components/RoundHistoryTable';
import { VintageSlotHistory } from '@/components/VintageSlotHistory';
import { ReferralView } from '@/components/views/ReferralView';
import { WalletView } from '@/components/views/WalletView';
import { ProfileView } from '@/components/views/ProfileView';
import { BuffaloSlotGame } from '@/components/BuffaloSlotGame';
import { FishingGame } from '@/components/FishingGame';
import { AuthModal } from '@/components/AuthModal';
import { RoundResultModal } from '@/components/RoundResultModal';
import { tickRoundSystem, calculateAutoWinRoll } from '@/lib/roundEngine';

type AppSessionUser = { uid: string; email: string | null; displayName: string | null; phoneNumber: string | null };

const createFallbackUser = (uid: string, email: string, name: string): UserProfile => ({
  uid,
  email,
  fullName: name,
  role: 'user',
  balance: 0,
  referralBalance: 0,
  referralsCount: 0,
  depositedReferralsCount: 0,
  referralTotalDeposits: 0,
  referrerId: null,
  totalBetCumulative: 0,
  totalSuccessfulDeposit: 0,
  withdrawalCount: 0,
  wagerSinceLastWithdrawal: 0,
  hasSuccessfulDeposit: false,
  promoClaimedReferrals: [],
  claimedMilestones: [],
  boundBank: null,
  isHedgingFlagged: false,
  cleanTurnoverRequired: 0,
  firstDepositBonusClaimed: false,
  createdAt: 0,
  updatedAt: 0,
});

const syncToTurso = (type: 'user' | 'bet' | 'deposit' | 'withdrawal', data: any) => {
  if (typeof window === 'undefined' || !data) return;
  try {
    fetch('/api/turso/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data }),
    }).catch(() => {});
  } catch {}
};

const fetchTursoUserProfile = async (query: string): Promise<UserProfile | null> => {
  if (typeof window === 'undefined' || !query) return null;
  try {
    const res = await fetch(`/api/turso/user?query=${encodeURIComponent(query)}&t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-store' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.success && json.user) {
      return json.user as UserProfile;
    }
  } catch (err) {
    console.warn('Failed to fetch user from Turso:', err);
  }
  return null;
};

const cacheUserProfile = (profile: UserProfile | null) => {
  if (typeof window === 'undefined' || !profile) return;
  try {
    const existingRaw = localStorage.getItem(`xai_user_profile_${profile.uid}`);
    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw);
        // Protect existing valid balance & referral counts: if incoming is a fresh fallback with 0, preserve existing!
        if (
          (existing.balance > 0 || existing.referralsCount > 0 || existing.referralBalance > 0) &&
          profile.balance === 0 &&
          profile.referralsCount === 0 &&
          profile.referralBalance === 0 &&
          profile.createdAt === 0
        ) {
          return;
        }
      } catch {
        // ignore parse error
      }
    }
    // Only cache if it is a real profile (not a zeroed fallback with createdAt === 0)
    if (profile.createdAt !== 0 || !existingRaw) {
      localStorage.setItem(`xai_user_profile_${profile.uid}`, JSON.stringify(profile));
      localStorage.setItem(
        'xai_last_active_user',
        JSON.stringify({ uid: profile.uid, email: profile.email, phone: profile.phoneNumber })
      );
      // Sync real-time to Turso Cloud Database
      syncToTurso('user', profile);
    }
  } catch {
    // ignore quota storage issues
  }
};

const getCachedUserProfile = (uid: string): UserProfile | null => {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    const raw = localStorage.getItem(`xai_user_profile_${uid}`);
    if (raw) return JSON.parse(raw);

    // Look for prefix match (e.g. if phone or uid starts with same prefix)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('xai_user_profile_')) {
        const item = localStorage.getItem(key);
        if (item) {
          try {
            const parsed = JSON.parse(item);
            if (parsed && (parsed.uid === uid || uid.startsWith(parsed.uid.slice(0, 8)))) {
              return parsed;
            }
          } catch {
            // ignore
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
};

export default function Home() {
  // Auth & User Profile State
  const [currentUser, setCurrentUser] = useState<AppSessionUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // Live Settings
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  // Synchronized Live Game Round State (From Firestore /rounds/current)
  const [currentRoundDoc, setCurrentRoundDoc] = useState<CurrentRoundData | null>(null);
  const [roundId, setRoundId] = useState<number>(101);
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [bettingOpen, setBettingOpen] = useState<boolean>(true);
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [dice1, setDice1] = useState<number>(3);
  const [dice2, setDice2] = useState<number>(4);
  const [lastRoundResult, setLastRoundResult] = useState<{
    roundId: number;
    dice1: number;
    dice2: number;
    total: number;
    resultClass: 'small' | 'common' | 'big';
    resultColor: 'red' | 'green' | 'violet';
  }>({
    roundId: 100,
    dice1: 3,
    dice2: 4,
    total: 7,
    resultClass: 'common',
    resultColor: 'violet',
  });

  // Round Result Modal Popup State
  const [isResultModalOpen, setIsResultModalOpen] = useState<boolean>(false);
  const [settledModalData, setSettledModalData] = useState<{
    roundId: number;
    dice1: number;
    dice2: number;
    totalResult: number;
    resultClass: 'small' | 'common' | 'big';
    resultColor: 'red' | 'green' | 'violet';
    userBets: PlayerBet[];
  } | null>(null);

  // Recent Synchronized Rounds History & Bets
  const [recentRounds, setRecentRounds] = useState<GameRound[]>([]);
  const [currentRoundBets, setCurrentRoundBets] = useState<PlayerBet[]>([]);
  const currentRoundBetsRef = useRef<PlayerBet[]>([]);
  useEffect(() => {
    currentRoundBetsRef.current = currentRoundBets;
  }, [currentRoundBets]);
  const [myBetsHistory, setMyBetsHistory] = useState<PlayerBet[]>([]);
  const [allBets, setAllBets] = useState<PlayerBet[]>([]);
  const [referralMembers, setReferralMembers] = useState<ReferralMember[]>([]);

  // Deposits & Withdrawals
  const [pendingDeposits, setPendingDeposits] = useState<DepositRequest[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [userWithdrawals, setUserWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [userDeposits, setUserDeposits] = useState<DepositRequest[]>([]);

  // Page View Routing State
  const [activeTab, setActiveTab] = useState<'home' | 'referral' | 'wallet' | 'profile'>('home');
  const [selectedGame, setSelectedGame] = useState<'lobby' | 'dice' | 'buffalo' | 'fishing'>('lobby');
  const buffaloEntrySessionRef = useRef(0);
  const buffaloWasFullscreenRef = useRef(false);
  const buffaloOrientationLockedRef = useRef(false);

  const enterBuffaloGame = () => {
    const entrySession = ++buffaloEntrySessionRef.current;
    buffaloWasFullscreenRef.current = Boolean(document.fullscreenElement);
    buffaloOrientationLockedRef.current = false;
    setSelectedGame('buffalo');

    const requestLandscapeLock = () => {
      if (entrySession !== buffaloEntrySessionRef.current) return;
      const orientation = window.screen.orientation as ScreenOrientation & {
        lock?: (orientation: 'landscape') => Promise<void>;
      };
      if (typeof orientation?.lock !== 'function') return;

      try {
        void orientation.lock('landscape').then(() => {
          if (entrySession !== buffaloEntrySessionRef.current) {
            orientation.unlock();
            return;
          }
          buffaloOrientationLockedRef.current = true;
        }).catch(() => {
          // Unsupported orientation locks fall back to the game's CSS-rotated view.
        });
      } catch {
        // Unsupported orientation locks fall back to the game's CSS-rotated view.
      }
    };

    if (document.fullscreenElement || typeof document.documentElement.requestFullscreen !== 'function') {
      requestLandscapeLock();
      return;
    }

    try {
      void document.documentElement.requestFullscreen().then(() => {
        if (entrySession !== buffaloEntrySessionRef.current) {
          if (!buffaloWasFullscreenRef.current && document.fullscreenElement) {
            void document.exitFullscreen().catch(() => {});
          }
          return;
        }
        requestLandscapeLock();
      }).catch(() => requestLandscapeLock());
    } catch {
      requestLandscapeLock();
    }
  };

  const exitBuffaloGame = () => {
    buffaloEntrySessionRef.current += 1;
    if (buffaloOrientationLockedRef.current) {
      try {
        window.screen.orientation.unlock();
      } catch {
        // Browsers without Screen Orientation API need no cleanup.
      }
    }
    buffaloOrientationLockedRef.current = false;
    if (!buffaloWasFullscreenRef.current && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
    buffaloWasFullscreenRef.current = false;
    setSelectedGame('lobby');
  };

  const [lobbyCategory, setLobbyCategory] = useState<'all' | 'slots' | 'dice' | 'hot' | 'favorites'>('all');
  const [promoIndex, setPromoIndex] = useState<number>(0);
  const [gameSearch, setGameSearch] = useState('');
  const [favoriteGames, setFavoriteGames] = useState<string[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Array<'buffalo' | 'dice' | 'fishing' | 'sakura'>>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [walletInitialTab, setWalletInitialTab] = useState<'deposit' | 'withdraw' | 'history' | 'transfer'>('deposit');

  // Auto-advance promo carousel every 6 seconds
  useEffect(() => {
    if (activeTab !== 'home' || selectedGame !== 'lobby') return;
    const interval = setInterval(() => {
      setPromoIndex((prev) => (prev + 1) % 3);
    }, 6000);
    return () => clearInterval(interval);
  }, [activeTab, selectedGame]);

  // Modals Visibility
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [urlReferralCode, setUrlReferralCode] = useState<string>('');
  const [isWalletOpen, setIsWalletOpen] = useState<boolean>(false);
  const [isRulesOpen, setIsRulesOpen] = useState<boolean>(false);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [adminAuthRequired, setAdminAuthRequired] = useState<boolean>(false);
  const [adminOverviewRefreshToken, setAdminOverviewRefreshToken] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [globalToast, setGlobalToast] = useState<{ message: string; type?: 'info' | 'error' | 'success' } | null>(null);

  const showToast = useCallback((msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    setGlobalToast({ message: msg, type });
    setTimeout(() => {
      setGlobalToast((prev) => (prev?.message === msg ? null : prev));
    }, 3500);
  }, []);

  const lastProcessedSettledRoundRef = useRef<number | null>(null);

  // 1. Initialize Telegram WebApp viewport and settings
  useEffect(() => {
    testConnection();
    if (typeof window !== 'undefined') {
      const timer = setTimeout(() => {
        try {
          const urlParams = new URLSearchParams(window.location.search);
          const refParam = urlParams.get('ref') || urlParams.get('referral') || urlParams.get('start') || '';
          if (refParam) setUrlReferralCode(refParam);
        } catch {
          // ignore storage access errors
        }
      }, 0);

      if ((window as unknown as { Telegram?: { WebApp?: { ready: () => void; expand: () => void } } }).Telegram?.WebApp) {
        const tg = (window as unknown as { Telegram: { WebApp: { ready: () => void; expand: () => void } } }).Telegram.WebApp;
        tg.ready();
        tg.expand();
      }

      return () => clearTimeout(timer);
    }
  }, []);

  // 2. Restore the real Turso session from the httpOnly cookie.
  useEffect(() => {
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((response) => response.json())
      .then((result) => {
        if (result.success && result.user) {
          const profile = result.user as UserProfile;
          setUserProfile(profile);
          setCurrentUser({
            uid: profile.uid,
            email: profile.email || null,
            displayName: profile.fullName || null,
            phoneNumber: profile.phoneNumber || null,
          });
        }
      })
      .catch((error) => console.warn('Turso session restore failed:', error))
      .finally(() => setAuthLoading(false));
  }, []);

  // 3. Realtime User Profile Listener (Firestore mirror)
  useEffect(() => {
    if (!currentUser) return;
    const userDocRef = doc(db, 'users', currentUser.uid);
    const unsub = onSnapshot(
      userDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          setUserProfile((prev) => {
            if (prev && prev.balance > 0 && Number(data.balance || 0) === 0) {
              return { ...data, balance: prev.balance };
            }
            return data;
          });
          cacheUserProfile(data);
        }
      },
      (error) => {
        console.warn('User profile onSnapshot note:', error?.message || error);
        const cached = getCachedUserProfile(currentUser.uid);
        if (cached) {
          setUserProfile(cached);
        }
      }
    );
    return () => unsub();
  }, [currentUser]);

  // 3b. Active Real-Time Turso Poller (Every 3 seconds for instant Bot / Admin sync)
  useEffect(() => {
    const targetUid = currentUser?.uid || userProfile?.uid;
    const targetPhone = userProfile?.phoneNumber;
    if (!targetUid && !targetPhone) return;

    let isSubscribed = true;

    const pollTursoBalance = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      try {
        const queryTarget = targetUid || targetPhone || '';
        const res = await fetch(`/api/turso/user?query=${encodeURIComponent(queryTarget)}&t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-store' },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && json.user && isSubscribed) {
          const tUser = json.user as UserProfile;
          setUserProfile((prev) => {
            if (!prev) return tUser;
            // Detect balance, referral, or bank changes
            if (
              prev.balance !== tUser.balance ||
              prev.referralBalance !== tUser.referralBalance ||
              prev.referralsCount !== tUser.referralsCount ||
              (!prev.boundBank && tUser.boundBank) ||
              (tUser.updatedAt && (!prev.updatedAt || tUser.updatedAt > prev.updatedAt))
            ) {
              const updated: UserProfile = {
                ...prev,
                ...tUser,
                role: prev.role === 'admin' ? 'admin' : tUser.role,
              };
              try {
                localStorage.setItem(`xai_user_profile_${updated.uid}`, JSON.stringify(updated));
              } catch {}
              return updated;
            }
            return prev;
          });
        }
      } catch {
        // silent retry on next interval
      }
    };

    pollTursoBalance();
    const interval = setInterval(pollTursoBalance, 3000);

    const handleVisChange = () => {
      if (document.visibilityState === 'visible') {
        pollTursoBalance();
      }
    };
    document.addEventListener('visibilitychange', handleVisChange);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisChange);
    };
  }, [currentUser?.uid, userProfile?.uid, userProfile?.phoneNumber]);

  // 4. Realtime Settings Listener
  useEffect(() => {
    const settingsDocRef = doc(db, 'settings', 'config');
    const unsub = onSnapshot(
      settingsDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setSettings({ ...DEFAULT_SETTINGS, ...docSnap.data() } as GameSettings);
        }
      },
      (error) => {
        console.warn('Settings snapshot listener note:', error?.message || error);
      }
    );
    return () => unsub();
  }, []);

  // 5. Global Synchronized Round Listener (/rounds/current)
  useEffect(() => {
    const currentRoundRef = doc(db, 'rounds', 'current');
    const unsub = onSnapshot(
      currentRoundRef,
      async (snap) => {
        if (!snap.exists()) {
          // Initialize room if first time
          const now = Date.now();
          const duration = settings.ROUND_DURATION_SECONDS || 60;
          const initialRound: CurrentRoundData = {
            roundId: 101,
            status: 'betting',
            openedAt: now,
            durationSeconds: duration,
            deadline: now + duration * 1000,
            dice1: 3,
            dice2: 4,
            totalResult: 7,
            resultClass: 'common',
            resultColor: 'violet',
            settledAt: now,
            nextRoundAt: now,
            updatedAt: now,
          };
          try {
            await setDoc(currentRoundRef, initialRound);
            setCurrentRoundDoc(initialRound);
          } catch (e) {
            console.warn('Init current round error:', e);
          }
          return;
        }

        const data = snap.data() as CurrentRoundData;
        setCurrentRoundDoc(data);
        setRoundId(data.roundId);

        // Immediate 24/7 fast-forward catchup if round document is behind real-world time
        const now = Date.now();
        const roundDurSec = data.durationSeconds || settings.ROUND_DURATION_SECONDS || 60;
        const roundDurMs = roundDurSec * 1000;
        const elapsedSinceOpen = now - data.openedAt;
        if (elapsedSinceOpen > roundDurMs + 5000) {
          tickRoundSystem(db, roundDurSec);
        }

        if (data.status === 'rolling') {
          const now = Date.now();
          const elapsed = now - (data.settledAt || now);
          const rollDuration = 2500;
          if (elapsed < rollDuration) {
            setIsRolling(true);
            setTimeout(() => {
              setIsRolling(false);
            }, rollDuration - elapsed);
          } else {
            setIsRolling(false);
          }
          setBettingOpen(false);
          setDice1(data.dice1);
          setDice2(data.dice2);
          setLastRoundResult({
            roundId: data.roundId,
            dice1: data.dice1,
            dice2: data.dice2,
            total: data.totalResult,
            resultClass: data.resultClass,
            resultColor: data.resultColor || classifyDiceColor(data.totalResult),
          });
        } else if (data.status === 'betting') {
          setIsRolling(false);
          const remaining = Math.max(0, Math.ceil((data.deadline - Date.now()) / 1000));
          setTimeLeft(remaining);
          setBettingOpen(remaining > 0);
          setDice1(data.dice1 ?? 3);
          setDice2(data.dice2 ?? 4);
          setLastRoundResult({
            roundId: data.roundId - 1,
            dice1: data.dice1,
            dice2: data.dice2,
            total: data.totalResult,
            resultClass: data.resultClass,
            resultColor: data.resultColor || classifyDiceColor(data.totalResult),
          });
        }
      },
      (err) => console.warn('Rounds listener error:', err)
    );

    return () => unsub();
  }, [settings.ROUND_DURATION_SECONDS]);

  // 6. Global Synchronized Round History Listener (/round_history)
  useEffect(() => {
    const historyQuery = query(
      collection(db, 'round_history'),
      orderBy('settledAt', 'desc'),
      limit(15)
    );

    const unsub = onSnapshot(
      historyQuery,
      (snap) => {
        const rounds: GameRound[] = [];
        snap.forEach((d) => {
          rounds.push(d.data() as GameRound);
        });
        setRecentRounds(rounds);
      },
      (err) => console.warn('Round history error:', err)
    );

    return () => unsub();
  }, []);

  // 7. Atomic Settlement Transition Handler across All Users with Lowest-Pool Optimization
  const triggerGlobalSettlement = useCallback(async (activeRound: CurrentRoundData) => {
    try {
      // Step A: Read all active bets placed in this round to analyze player pools
      const activeRoundBets: PlayerBet[] = [];
      try {
        const betsQuery = query(
          collection(db, 'bets'),
          where('roundId', '==', activeRound.roundId)
        );
        const betsSnap = await getDocs(betsQuery);
        betsSnap.forEach((d) => activeRoundBets.push(d.data() as PlayerBet));
      } catch (err) {
        console.warn('Error reading active round bets for lowest-pool evaluation:', err);
      }

      // Merge with in-memory bets placed by current client (eliminates any replication delay)
      const betsMap = new Map<string, PlayerBet>();
      activeRoundBets.forEach((b) => betsMap.set(b.betId, b));
      currentRoundBetsRef.current.forEach((b) => {
        if (b.roundId === activeRound.roundId) {
          betsMap.set(b.betId, b);
        }
      });
      const allActiveBets = Array.from(betsMap.values());

      // Step B: Calculate Auto-Win roll (strictly chooses outcome with lowest bet liability/zero player payout)
      const autoRoll = calculateAutoWinRoll(allActiveBets);
      const roll1 = autoRoll.roll1;
      const roll2 = autoRoll.roll2;
      const total = autoRoll.total;
      const resClass = classifyDiceTotal(total);
      const resColor = classifyDiceColor(total);

      // Step C: Atomic Firestore transaction to transition room to rolling & record in round_history
      await runTransaction(db, async (txn) => {
        const currentRef = doc(db, 'rounds', 'current');
        const snap = await txn.get(currentRef);
        if (!snap.exists()) return;

        const cur = snap.data() as CurrentRoundData;
        // Ensure state is still 'betting' and matching the round
        if (cur.status !== 'betting' || cur.roundId !== activeRound.roundId) return;

        const now = Date.now();
        const nextRoundAt = now + 5000;

        txn.update(currentRef, {
          status: 'rolling',
          dice1: roll1,
          dice2: roll2,
          totalResult: total,
          resultClass: resClass,
          resultColor: resColor,
          settledAt: now,
          nextRoundAt,
          updatedAt: now,
        });

        const historyRef = doc(db, 'round_history', `round_${cur.roundId}`);
        txn.set(historyRef, {
          roundId: cur.roundId,
          status: 'settled',
          openedAt: cur.openedAt,
          durationSeconds: cur.durationSeconds,
          dice1: roll1,
          dice2: roll2,
          totalResult: total,
          resultClass: resClass,
          resultColor: resColor,
          settledAt: now,
        });
      });
    } catch (e) {
      console.warn('Settlement transaction skipped or handled by another peer:', e);
    }
  }, []);

  // 8. Atomic Next Round Advance Handler
  const triggerGlobalNextRound = useCallback(async (activeRound: CurrentRoundData) => {
    try {
      await runTransaction(db, async (txn) => {
        const currentRef = doc(db, 'rounds', 'current');
        const snap = await txn.get(currentRef);
        if (!snap.exists()) return;

        const cur = snap.data() as CurrentRoundData;
        if (cur.status !== 'rolling' || cur.roundId !== activeRound.roundId) return;

        const now = Date.now();
        const nextRoundId = cur.roundId + 1;
        const duration = settings.ROUND_DURATION_SECONDS || 60;

        txn.update(currentRef, {
          roundId: nextRoundId,
          status: 'betting',
          openedAt: now,
          durationSeconds: duration,
          deadline: now + duration * 1000,
          updatedAt: now,
        });
      });
    } catch (e) {
      console.warn('Next round advance handled by another peer:', e);
    }
  }, [settings.ROUND_DURATION_SECONDS]);

  // 9. Synchronized Master Timer Interval
  useEffect(() => {
    if (!currentRoundDoc) return;

    const timer = setInterval(() => {
      const now = Date.now();

      if (currentRoundDoc.status === 'betting') {
        const diff = Math.max(0, Math.ceil((currentRoundDoc.deadline - now) / 1000));
        setTimeLeft(diff);
        setBettingOpen(diff > 0);

        if (diff <= 5 && diff > 0 && soundEnabled) {
          sounds.playTick();
        }

        if (diff <= 0) {
          triggerGlobalSettlement(currentRoundDoc);
        }
      } else if (currentRoundDoc.status === 'rolling') {
        setTimeLeft(0);
        setBettingOpen(false);

        if (now >= currentRoundDoc.nextRoundAt) {
          triggerGlobalNextRound(currentRoundDoc);
        }
      }

      // Autonomous 24/7 Catchup: If round is past deadline or idle for more than 5s
      if (
        (currentRoundDoc.status === 'betting' && now > currentRoundDoc.deadline + 5000) ||
        (currentRoundDoc.status === 'rolling' && now > currentRoundDoc.nextRoundAt + 5000)
      ) {
        tickRoundSystem(db, settings.ROUND_DURATION_SECONDS || 60);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [currentRoundDoc, soundEnabled, settings.ROUND_DURATION_SECONDS, triggerGlobalNextRound, triggerGlobalSettlement]);

  // 10. Evaluate User Bets when Round Settles & Persist Settlement to Firestore
  useEffect(() => {
    if (!currentRoundDoc || currentRoundDoc.status !== 'rolling') return;
    if (lastProcessedSettledRoundRef.current === currentRoundDoc.roundId) return;

    lastProcessedSettledRoundRef.current = currentRoundDoc.roundId;

    const evaluateMyBets = async () => {
      const settledRoundId = currentRoundDoc.roundId;
      const total = currentRoundDoc.totalResult;
      const resClass = currentRoundDoc.resultClass;
      const resColor = currentRoundDoc.resultColor || classifyDiceColor(total);

      // Only evaluate & show result modal if user actually placed bets in this round!
      if (currentRoundBets.length === 0) {
        setIsResultModalOpen(false);
        return;
      }

      let totalWinnings = 0;
      let wonAny = false;

      const updatedBets = currentRoundBets.map((bet) => {
        let isWin = false;
        if (bet.betKind === 'size') {
          if (bet.selection === 'အသေး' && resClass === 'small') isWin = true;
          if (bet.selection === 'အကြီး' && resClass === 'big') isWin = true;
        } else if (bet.betKind === 'number') {
          if (Number(bet.selection) === total) isWin = true;
        } else if (bet.betKind === 'color') {
          if (bet.selection === resColor) isWin = true;
        }

        if (isWin) {
          wonAny = true;
          const payout = Math.round(bet.amount * bet.multiplier);
          totalWinnings += payout;
          return {
            ...bet,
            status: 'win' as const,
            payout,
            profit: payout - bet.amount,
          };
        } else {
          return {
            ...bet,
            status: 'loss' as const,
            payout: 0,
            profit: -bet.amount,
          };
        }
      });

      // Write settled status to Firestore for player's bets
      for (const b of updatedBets) {
        try {
          const betDocRef = doc(db, 'bets', b.betId);
          await updateDoc(betDocRef, {
            status: b.status,
            payout: b.payout,
            profit: b.profit,
            result: total,
            settledAt: Date.now(),
            updatedAt: Date.now(),
          });
        } catch (e) {
          console.error('Failed to update settled bet in firestore:', b.betId, e);
        }
      }

      setMyBetsHistory((prev) => [...updatedBets, ...prev].slice(0, 30));
      setCurrentRoundBets([]);

      // CRITICAL: Wait until the 3D dice finish rolling (~2.6s) before revealing result modal & celebrating
      const elapsed = Date.now() - (currentRoundDoc.settledAt || Date.now());
      const delayBeforeResult = Math.max(100, 2600 - elapsed);

      setTimeout(async () => {
        if (wonAny && totalWinnings > 0) {
          sounds.playWin();
          confetti({
            particleCount: 110,
            spread: 75,
            origin: { y: 0.6 },
            colors: ['#F59E0B', '#EAB308', '#10B981', '#ffffff'],
          });

          if (currentUser && userProfile) {
            const newBal = (userProfile.balance || 0) + totalWinnings;
            const winUser: UserProfile = {
              ...userProfile,
              balance: newBal,
              updatedAt: Date.now(),
            };
            setUserProfile(winUser);
            cacheUserProfile(winUser);
            syncToTurso('user', winUser);

            try {
              const userDocRef = doc(db, 'users', currentUser.uid);
              await updateDoc(userDocRef, {
                balance: newBal,
                updatedAt: Date.now(),
              });
            } catch (e) {
              console.error('Error crediting winnings to firestore:', e);
            }
          }
        }

        // Trigger Result Modal ONLY for users who placed bets in this round
        if (updatedBets.length > 0) {
          setSettledModalData({
            roundId: settledRoundId,
            dice1: currentRoundDoc.dice1,
            dice2: currentRoundDoc.dice2,
            totalResult: total,
            resultClass: resClass,
            resultColor: resColor,
            userBets: updatedBets,
          });
          setIsResultModalOpen(true);
        }
      }, delayBeforeResult);
    };

    evaluateMyBets();
  }, [currentRoundBets, currentRoundDoc, currentUser, userProfile, selectedGame]);

  // 11. Realtime Bets Listener for Current User with Auto-Settlement Self-Healing
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'bets'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(35)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const bets: PlayerBet[] = [];
        snap.forEach((d) => bets.push(d.data() as PlayerBet));
        setMyBetsHistory(bets);

        // Auto-heal any stuck pending bets whose round already finished in round_history
        bets.forEach(async (b) => {
          if (b.status === 'pending') {
            const pastRound = recentRounds.find((r) => r.roundId === b.roundId);
            if (pastRound && (pastRound.status === 'settled' || pastRound.dice1)) {
              let isWin = false;
              if (b.betKind === 'size') {
                if (b.selection === 'အသေး' && pastRound.resultClass === 'small') isWin = true;
                if (b.selection === 'အကြီး' && pastRound.resultClass === 'big') isWin = true;
              } else if (b.betKind === 'number') {
                if (Number(b.selection) === pastRound.totalResult) isWin = true;
              }
              const status = isWin ? 'win' : 'loss';
              const payout = isWin ? Math.round(b.amount * b.multiplier) : 0;
              const profit = isWin ? payout - b.amount : -b.amount;

              try {
                await updateDoc(doc(db, 'bets', b.betId), {
                  status,
                  payout,
                  profit,
                  result: pastRound.totalResult,
                  settledAt: Date.now(),
                  updatedAt: Date.now(),
                });
              } catch (e) {
                console.warn('Auto heal bet error:', e);
              }
            }
          }
        });
      },
      (err) => console.warn('User bets snapshot note:', err)
    );

    return () => unsub();
  }, [currentUser, recentRounds]);

  // Realtime Referral Members Listener for Current User with Offline Cache Recovery
  useEffect(() => {
    if (!currentUser) return;

    // Immediately restore cached referral members if available
    const cacheTimer = setTimeout(() => {
      if (typeof window !== 'undefined') {
        try {
          const cachedRaw = localStorage.getItem(`xai_ref_members_${currentUser.uid}`);
          if (cachedRaw) {
            const parsed = JSON.parse(cachedRaw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setReferralMembers(parsed);
            }
          }
        } catch {
          // ignore
        }
      }
    }, 0);

    const q = query(
      collection(db, 'users'),
      where('referrerId', '==', currentUser.uid)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: ReferralMember[] = [];
        let depCount = 0;
        let totalDep = 0;

        snapshot.forEach((d) => {
          const u = d.data() as UserProfile;
          const hasDep = !!u.hasSuccessfulDeposit;
          const userDep = u.totalSuccessfulDeposit || 0;
          if (hasDep) {
            depCount += 1;
            totalDep += userDep;
          }
          list.push({
            uid: d.id,
            fullName: u.fullName || `Member ${d.id.slice(0, 5)}`,
            email: u.email,
            joinedAt: u.createdAt || Date.now(),
            hasSuccessfulDeposit: hasDep,
            totalSuccessfulDeposit: userDep,
            totalBetCumulative: u.totalBetCumulative || 0,
          });
        });

        list.sort((a, b) => b.joinedAt - a.joinedAt);
        setReferralMembers(list);

        if (typeof window !== 'undefined' && list.length > 0) {
          try {
            localStorage.setItem(`xai_ref_members_${currentUser.uid}`, JSON.stringify(list));
          } catch {
            // ignore
          }
        }

        // Keep local userProfile in sync with latest referral counts
        setUserProfile((prev) => {
          if (!prev) return null;
          if (
            prev.depositedReferralsCount !== depCount ||
            prev.referralTotalDeposits !== totalDep ||
            prev.referralsCount !== list.length
          ) {
            const updated = {
              ...prev,
              depositedReferralsCount: depCount,
              referralTotalDeposits: totalDep,
              referralsCount: list.length,
            };
            cacheUserProfile(updated);
            return updated;
          }
          return prev;
        });
      },
      (err) => {
        console.warn('Referral members listener note:', err);
        // Fallback to local cache if network/quota is throttled
        if (typeof window !== 'undefined') {
          try {
            const cachedRaw = localStorage.getItem(`xai_ref_members_${currentUser.uid}`);
            if (cachedRaw) {
              const parsed = JSON.parse(cachedRaw);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setReferralMembers(parsed);
              }
            }
          } catch {
            // ignore
          }
        }
      }
    );

    return () => {
      clearTimeout(cacheTimer);
      unsub();
    };
  }, [currentUser]);

  // 12. Realtime Pending Deposits & Withdrawals for Admin (Turso is the only source of truth)
  useEffect(() => {
    const isUserAdmin = userProfile?.role === 'admin' || isAdminEmail(currentUser?.email);
    if (!isUserAdmin || !currentUser || !isAdminOpen) return;
    let active = true;
    const loadAdminOverview = async () => {
      try {
        const response = await fetch(`/api/admin/overview?t=${Date.now()}`, { cache: 'no-store', credentials: 'include', headers: { 'Cache-Control': 'no-store' } });
        const result = await response.json();
        if (!active) return;
        if (response.status === 401) {
          setAdminAuthRequired(true);
          return;
        }
        if (!response.ok || !result.success) {
          console.warn('Turso admin overview request failed:', response.status, result.error || 'Unknown error');
          return;
        }
        setAdminAuthRequired(false);
        setPendingDeposits((result.deposits || []).map((row: DepositRequest) => ({ ...row, id: row.id || row.depositId })));
        setPendingWithdrawals((result.withdrawals || []).map((row: WithdrawalRequest) => ({ ...row, id: row.id || row.withdrawalId })));
        setAllBets((result.bets || []) as PlayerBet[]);
      } catch (error) {
        console.warn('Turso admin overview polling note:', error);
      }
    };
    loadAdminOverview();
    const interval = window.setInterval(loadAdminOverview, 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, [currentUser, userProfile, isAdminOpen, adminOverviewRefreshToken]);
  // 13-14. User transaction history polling from Turso
  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    const loadActivity = async () => {
      try {
        const response = await fetch(`/api/turso/activity?uid=${encodeURIComponent(currentUser.uid)}&t=${Date.now()}`, { cache: 'no-store' });
        const result = await response.json();
        if (!active || !response.ok || !result.success) return;
        setUserWithdrawals((result.withdrawals || []).map((row: WithdrawalRequest) => ({ ...row, id: row.id || row.withdrawalId })));
        setUserDeposits((result.deposits || []).map((row: DepositRequest) => ({ ...row, id: row.id || row.depositId })));
      } catch (error) {
        console.warn('Turso transaction polling note:', error);
      }
    };
    loadActivity();
    const interval = window.setInterval(loadActivity, 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, [currentUser?.uid]);
  // Place Bet Handler with Anti-Hedging Enforcement
  const handlePlaceBet = async (
    betKind: 'size' | 'number' | 'color',
    selection: string,
    amount: number,
    multiplier: number
  ): Promise<boolean> => {
    if (!currentUser || !userProfile) {
      showToast('လောင်းကြေးတင်ရန် အရင်ဆုံး Google ဖြင့် အကောင့်ဝင်ပေးပါ', 'error');
      setIsAuthModalOpen(true);
      return false;
    }

    if (userProfile.balance < amount) {
      showToast('လက်ကျန်ငွေ မလုံလောက်ပါ။ ကျေးဇူးပြု၍ ငွေအရင်ဖြည့်သွင်းပါ', 'error');
      setIsWalletOpen(true);
      return false;
    }

    // 0. Anti-Bot & Automation Detection (Reject headless browsers & scrapers)
    const botCheck = detectBotOrAutomation();
    if (botCheck.isBot) {
      showToast(`⚠️ လုံခြုံရေးကာကွယ်မှု: အလိုအလျောက်ခေါ်ယူသော Bot သို့မဟုတ် Script ဖြစ်သဖြင့် ခွင့်မပြုပါ (${botCheck.reason})`, 'error');
      return false;
    }

    // 1. Rate Limiting / Velocity Shield (Prevent superhuman flood attacks)
    const velocityCheck = verifyActionVelocity();
    if (!velocityCheck.allowed) {
      showToast(`⚠️ ${velocityCheck.reason}`, 'error');
      return false;
    }

    // 2. Ephemeral Rolling Security Token (60-second strict TTL)
    const securityToken = generateEphemeralToken(currentUser.uid, 'bet');
    const tokenCheck = isTokenValid(securityToken, 'bet', currentUser.uid);
    if (!tokenCheck.valid) {
      showToast(`⚠️ လုံခြုံရေး Token အမှား: ${tokenCheck.error}`, 'error');
      return false;
    }

    // 3. Forced Fresh Firebase Auth Token Refresh
    await enforceFreshAuthToken();

    // 4. Invalidate / Consume Token to prevent replay attacks
    await consumeSecurityToken(securityToken);

    // 5. Anti-Hedging Enforcement (Cannot bet both Small & Big in the same round)
    if (betKind === 'size') {
      const hasOppositeBet = currentRoundBets.some(
        (b) =>
          b.userId === currentUser.uid &&
          b.roundId === roundId &&
          b.betKind === 'size' &&
          ((selection === 'အသေး' && b.selection === 'အကြီး') ||
            (selection === 'အကြီး' && b.selection === 'အသေး'))
      );

      if (hasOppositeBet) {
        showToast(
          'စည်းကမ်းသတိပေးချက်: အလှည့်တစ်ခုတည်းတွင် အကြီးရော အသေးပါ နှစ်ဖက်လုံးလောင်းခြင်း (Hedging) ကို တင်းကြပ်စွာ တားမြစ်ထားပါသည်',
          'error'
        );
        return false;
      }
    }

    const betId = `bet_${roundId}_${currentUser.uid}_${Date.now()}`;
    const newBet: PlayerBet = {
      betId,
      roundId,
      userId: currentUser.uid,
      userName: userProfile.fullName,
      betKind,
      selection,
      amount,
      multiplier,
      status: 'pending',
      payout: 0,
      profit: 0,
      createdAt: Date.now(),
    };

    const newBalance = userProfile.balance - amount;
    const newCumulative = (userProfile.totalBetCumulative || 0) + amount;
    const newWager = (userProfile.wagerSinceLastWithdrawal || 0) + amount;

    // Clean turnover progress for clearing any past hedging flags
    const currentCleanRequired = userProfile.cleanTurnoverRequired || 0;
    const newCleanRequired = Math.max(0, currentCleanRequired - amount);
    const isStillFlagged = newCleanRequired > 0;

    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, {
        balance: newBalance,
        totalBetCumulative: newCumulative,
        wagerSinceLastWithdrawal: newWager,
        cleanTurnoverRequired: newCleanRequired,
        isHedgingFlagged: isStillFlagged,
        updatedAt: Date.now(),
      });

      const updatedUser: UserProfile = {
        ...userProfile,
        balance: newBalance,
        totalBetCumulative: newCumulative,
        wagerSinceLastWithdrawal: newWager,
        cleanTurnoverRequired: newCleanRequired,
        isHedgingFlagged: isStillFlagged,
        updatedAt: Date.now(),
      };
      setUserProfile(updatedUser);
      cacheUserProfile(updatedUser);
      syncToTurso('user', updatedUser);

      await setDoc(doc(db, 'bets', betId), newBet);
      syncToTurso('bet', newBet);
      setCurrentRoundBets((prev) => [...prev, newBet]);

      if (userProfile.referrerId) {
        try {
          const refDocRef = doc(db, 'users', userProfile.referrerId);
          const refSnap = await getDoc(refDocRef);
          if (refSnap.exists()) {
            const refData = refSnap.data() as UserProfile;
            const commission = Math.round(amount * (settings.COMMISSION_RATE || 0.01));
            let bonusAdd = 0;
            const claimed = refData.promoClaimedReferrals || [];

            if (newCumulative >= settings.PROMO_BET_THRESHOLD && !claimed.includes(currentUser.uid)) {
              bonusAdd = settings.PROMO_BONUS_AMOUNT || 500;
              claimed.push(currentUser.uid);
            }

            await updateDoc(refDocRef, {
              referralBalance: (refData.referralBalance || 0) + commission + bonusAdd,
              promoClaimedReferrals: claimed,
              updatedAt: Date.now(),
            });
          }
        } catch (e) {
          console.error('Referral calculation error:', e);
        }
      }

      return true;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      showToast(`လောင်းကြေးတင်ခြင်း မအောင်မြင်ပါ (${errMsg.includes('permission') ? 'ခွင့်ပြုချက် မရရှိပါ' : 'ခေတ္တစောင့်ပြီး ပြန်လည်ကြိုးစားပါ'})။`, 'error');
      return false;
    }
  };

  const handleSubmitDeposit = async (
    amount: number,
    method: 'kpay' | 'wave',
    trxLast5: string
  ): Promise<boolean> => {
    if (!currentUser || !userProfile) {
      sounds.playChip();
      setIsAuthModalOpen(true);
      return false;
    }

    // 0. Anti-Bot & Automation Detection
    const botCheck = detectBotOrAutomation();
    if (botCheck.isBot) {
      alert(`လုံခြုံရေးသတိပေးချက်: တရားမဝင် Bot ခေါ်ဆိုမှုဖြစ်သဖြင့် ငြင်းပယ်ပါသည် (${botCheck.reason})။`);
      return false;
    }

    // 1. Velocity Rate Limiting
    const velocityCheck = verifyActionVelocity();
    if (!velocityCheck.allowed) {
      alert(`${velocityCheck.reason}`);
      return false;
    }

    // 2. Ephemeral Security Token (Expires in 60s)
    const securityToken = generateEphemeralToken(currentUser.uid, 'deposit');
    const tokenCheck = isTokenValid(securityToken, 'deposit', currentUser.uid);
    if (!tokenCheck.valid) {
      alert(`လုံခြုံရေး Token အမှား: ${tokenCheck.error}`);
      return false;
    }

    // 3. Forced Fresh Firebase Auth Token & Consume Token
    await enforceFreshAuthToken();
    await consumeSecurityToken(securityToken);

    const cleanTrx = trxLast5.trim();
    try {
      const response = await fetch('/api/deposits', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, method, trxLast5: cleanTrx }),
      });
      const result = await response.json();
      if (!response.ok || !result.success || !result.deposit) {
        throw new Error(result.error || 'Deposit request could not be saved');
      }

      const savedDeposit = result.deposit as DepositRequest;
      setUserDeposits((prev) => [savedDeposit, ...prev.filter((d) => d.depositId !== savedDeposit.depositId)]);
      sounds.playWin();
      return true;
    } catch (err) {
      console.error('Deposit error:', err);
      alert('ငွေသွင်းတောင်းဆိုမှုကို သိမ်းဆည်းမရပါ။ ခဏကြာပြီး ပြန်လည်ကြိုးစားပေးပါ။');
      return false;
    }
  };

  // Single Bank Account Binding Handler
  const handleBindBank = async (
    method: 'kpay' | 'wave',
    phone: string,
    accountName: string
  ): Promise<boolean> => {
    if (!currentUser || !userProfile) return false;
    if (userProfile.boundBank) {
      alert('ဘဏ်အကောင့် ၁ ခုသာ ချိတ်ဆက်ခွင့်ရှိပါသည်။ ပြောင်းလဲ၍ မရနိုင်ပါ။');
      return false;
    }
    if (!phone.trim() || !accountName.trim()) {
      alert('ဖုန်းနံပါတ်နှင့် အကောင့်အမည် ထည့်သွင်းပေးပါ။');
      return false;
    }

    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const boundBank: BoundBank = {
        method,
        phone: phone.trim(),
        accountName: accountName.trim(),
        boundAt: Date.now(),
      };
      await updateDoc(userDocRef, {
        boundBank,
        updatedAt: Date.now(),
      });
      sounds.playChip();
      alert('ဘဏ်အကောင့်ကို အောင်မြင်စွာ အတည်ပြု ချိတ်ဆက်ပြီးပါပြီ!');
      return true;
    } catch (err) {
      console.error('Bank bind error:', err);
      alert('ဘဏ်အကောင့် ချိတ်ဆက်ခြင်း မအောင်မြင်ပါ။');
      return false;
    }
  };

  // Withdrawal Submit Handler with Anti-Hedging & Single Bank Binding
  const handleSubmitWithdrawal = async (
    amount: number,
    method: 'kpay' | 'wave',
    phone: string,
    accountName: string
  ): Promise<boolean> => {
    if (!currentUser || !userProfile) return false;

    // 0. Anti-Bot & Automation Detection
    const botCheck = detectBotOrAutomation();
    if (botCheck.isBot) {
      alert(`လုံခြုံရေးသတိပေးချက်: တရားမဝင် Bot ခေါ်ဆိုမှုဖြစ်သဖြင့် ငြင်းပယ်ပါသည် (${botCheck.reason})။`);
      return false;
    }

    // 1. Velocity Rate Limiting
    const velocityCheck = verifyActionVelocity();
    if (!velocityCheck.allowed) {
      alert(`${velocityCheck.reason}`);
      return false;
    }

    // 2. Ephemeral Security Token (Expires in 60s)
    const securityToken = generateEphemeralToken(currentUser.uid, 'withdraw');
    const tokenCheck = isTokenValid(securityToken, 'withdraw', currentUser.uid);
    if (!tokenCheck.valid) {
      alert(`လုံခြုံရေး Token အမှား: ${tokenCheck.error}`);
      return false;
    }

    // 3. Forced Fresh Firebase Auth Token & Consume Token
    await enforceFreshAuthToken();
    await consumeSecurityToken(securityToken);

    // 4. Anti-Hedging Verification
    if (userProfile.isHedgingFlagged || (userProfile.cleanTurnoverRequired || 0) > 0) {
      alert(
        `အကြီး နှင့် အသေး နှစ်ဖက်လုံးလောင်းကစားမှု (Hedging) တွေ့ရှိထားသဖြင့် ငွေထုတ်ယူခွင့် ယာယီဆိုင်းငံ့ထားပါသည်။\n\nစည်းကမ်းနှင့်အညီ ပြန်လည်ကစားရမည့် လောင်းကြေးပမာဏ: ${formatKs(
          userProfile.cleanTurnoverRequired
        )} ပြည့်အောင် ကစားပြီးမှသာ ငွေထုတ်ယူနိုင်ပါမည်။`
      );
      return false;
    }

    // 5. Daily Withdrawal Limit Cap Verification
    const maxDailyLimit = settings.MAX_DAILY_WITHDRAWAL || 300000;
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const todayWithdrawn = userWithdrawals
      .filter((w) => w.createdAt >= oneDayAgo && (w.status === 'approved' || w.status === 'pending'))
      .reduce((sum, w) => sum + (w.amount || 0), 0);

    if (todayWithdrawn + amount > maxDailyLimit) {
      const remainingDaily = Math.max(0, maxDailyLimit - todayWithdrawn);
      alert(
        `တစ်ရက်လျှင် အများဆုံး ငွေထုတ်နိုင်သည့် ကန့်သတ်ပမာဏမှာ ${formatKs(maxDailyLimit)} ဖြစ်ပါသည်။\n\nယနေ့ ထုတ်ယူပြီးပမာဏ: ${formatKs(todayWithdrawn)}\nယနေ့ ထပ်မံထုတ်ယူနိုင်သည့် လက်ကျန်: ${formatKs(remainingDaily)}`
      );
      return false;
    }

    // 2. Single Bank Account Resolution
    const finalMethod = userProfile.boundBank ? userProfile.boundBank.method : method;
    const finalPhone = userProfile.boundBank ? userProfile.boundBank.phone : phone.trim();
    const finalAccountName = userProfile.boundBank ? userProfile.boundBank.accountName : accountName.trim();

    const withId = `with_${Date.now()}`;
    const newWith: WithdrawalRequest = {
      withdrawalId: withId,
      userId: currentUser.uid,
      userName: userProfile.fullName,
      amount,
      method: finalMethod,
      phone: finalPhone,
      accountName: finalAccountName,
      status: 'pending',
      createdAt: Date.now(),
    };

    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const updates: Partial<UserProfile> = {
        balance: userProfile.balance - amount,
        updatedAt: Date.now(),
      };

      // If user has not yet bound a bank account, permanently bind this first withdrawal bank
      if (!userProfile.boundBank) {
        updates.boundBank = {
          method: finalMethod,
          phone: finalPhone,
          accountName: finalAccountName,
          boundAt: Date.now(),
        };
      }

      await updateDoc(userDocRef, updates);
      await setDoc(doc(db, 'withdrawals', withId), newWith);
      syncToTurso('withdrawal', newWith);

      const afterWithUser: UserProfile = {
        ...userProfile,
        ...updates,
      };
      setUserProfile(afterWithUser);
      cacheUserProfile(afterWithUser);
      syncToTurso('user', afterWithUser);
      return true;
    } catch (err) {
      console.error('Withdrawal error:', err);
      return false;
    }
  };

  // Milestone Bonus Claim Handler
  const handleClaimMilestone = async (
    milestoneId: 'tier_2_deposited' | 'tier_5_deposited' | 'tier_10_50k'
  ): Promise<boolean> => {
    if (!currentUser || !userProfile) return false;

    // Anti-Bot & Automation Check
    const botCheck = detectBotOrAutomation();
    if (botCheck.isBot) {
      alert(`လုံခြုံရေးသတိပေးချက်: တရားမဝင် Bot ခေါ်ဆိုမှုဖြစ်သဖြင့် ငြင်းပယ်ပါသည် (${botCheck.reason})။`);
      return false;
    }

    // Ephemeral Security Token
    const securityToken = generateEphemeralToken(currentUser.uid, 'claim');
    if (!isTokenValid(securityToken, 'claim', currentUser.uid).valid) {
      alert('လုံခြုံရေး Token သက်တမ်းကုန်ဆုံးသွားပါပြီ။');
      return false;
    }
    await consumeSecurityToken(securityToken);

    const claimed = userProfile.claimedMilestones || [];
    if (claimed.includes(milestoneId)) {
      alert('ဤဆုကြေးကို ရယူပြီးဖြစ်ပါသည်။');
      return false;
    }

    const depCount = userProfile.depositedReferralsCount || 0;
    const totalDep = userProfile.referralTotalDeposits || 0;
    let rewardAmount = 0;

    if (milestoneId === 'tier_2_deposited') {
      if (depCount < 2) {
        alert('မန်ဘာ အနည်းဆုံး ၂ ယောက် ငွေသွင်းရန် လိုအပ်ပါသည်။');
        return false;
      }
      rewardAmount = 2000;
    } else if (milestoneId === 'tier_5_deposited') {
      if (depCount < 5) {
        alert('ငွေသွင်းမန်ဘာအစစ် ၅ ယောက် ပြည့်ရန် လိုအပ်ပါသည်။');
        return false;
      }
      rewardAmount = 2000;
    } else if (milestoneId === 'tier_10_50k') {
      if (totalDep < 50000) {
        alert('မန်ဘာများ သွင်းငွေစုစုပေါင်း ၅၀,၀၀၀ Ks ပြည့်ရန် လိုအပ်ပါသည်။');
        return false;
      }
      rewardAmount = 5000;
    }

    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, {
        balance: (userProfile.balance || 0) + rewardAmount,
        claimedMilestones: [...claimed, milestoneId],
        updatedAt: Date.now(),
      });
      const updatedUser: UserProfile = {
        ...userProfile,
        balance: (userProfile.balance || 0) + rewardAmount,
        claimedMilestones: [...claimed, milestoneId],
        updatedAt: Date.now(),
      };
      setUserProfile(updatedUser);
      cacheUserProfile(updatedUser);
      syncToTurso('user', updatedUser);

      sounds.playWin();
      confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#ffffff', '#cbd5e1', '#94a3b8'],
      });
      alert(`ဂုဏ်ယူပါသည်! မန်ဘာဆုကြေး ${formatKs(rewardAmount)} ကို ပင်မလက်ကျန်သို့ ထည့်သွင်းပေးပြီးပါပြီ!`);
      return true;
    } catch (err) {
      console.error('Milestone claim error:', err);
      alert('ဆုကြေးရယူခြင်း မအောင်မြင်ပါ။');
      return false;
    }
  };

  const handleTransferReferral = async (): Promise<boolean> => {
    if (!currentUser || !userProfile) return false;
    if (userProfile.referralBalance < settings.MINIMUM_TRANSFER_AMOUNT) return false;

    const amountToTransfer = Math.floor(userProfile.referralBalance);
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, {
        balance: (userProfile.balance || 0) + amountToTransfer,
        referralBalance: (userProfile.referralBalance || 0) - amountToTransfer,
        updatedAt: Date.now(),
      });

      const updatedUser: UserProfile = {
        ...userProfile,
        balance: (userProfile.balance || 0) + amountToTransfer,
        referralBalance: (userProfile.referralBalance || 0) - amountToTransfer,
        updatedAt: Date.now(),
      };
      setUserProfile(updatedUser);
      cacheUserProfile(updatedUser);
      syncToTurso('user', updatedUser);
      return true;
    } catch (e) {
      console.error('Transfer referral error:', e);
      return false;
    }
  };

  const handleApproveDeposit = async (depositId: string, userId: string, amount: number): Promise<boolean> => {
    try {
      const response = await fetch('/api/admin/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'deposit', id: depositId, decision: 'approve', note: `Approved by ${currentUser?.email || currentUser?.uid || 'admin'}` }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Deposit approval failed');
      setPendingDeposits((items) => items.filter((item) => (item.id || item.depositId) !== depositId));
      if (currentUser?.uid === userId) {
        const refreshed = await fetch(`/api/turso/user?uid=${encodeURIComponent(userId)}&t=${Date.now()}`, { cache: 'no-store' });
        const data = await refreshed.json();
        if (data.success && data.user) setUserProfile(data.user as UserProfile);
      }
      return true;
    } catch (error) {
      console.error('Deposit approval error:', error);
      return false;
    }
  };
  const handleDeclineDeposit = async (depositId: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/admin/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'deposit', id: depositId, decision: 'reject', note: 'ငွေလွှဲအထောက်အထား သို့မဟုတ် ပမာဏကို အတည်မပြုနိုင်ပါ' }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Deposit decline failed');
      setPendingDeposits((items) => items.filter((item) => (item.id || item.depositId) !== depositId));
      return true;
    } catch (error) {
      console.error('Deposit decline error:', error);
      return false;
    }
  };
  const reviewWithdrawal = async (withdrawalId: string, decision: 'approve' | 'reject', note?: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/admin/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'withdrawal', id: withdrawalId, decision, note: note || '' }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Withdrawal review failed');
      setPendingWithdrawals((items) => items.filter((item) => (item.id || item.withdrawalId) !== withdrawalId));
      return true;
    } catch (error) {
      console.error('Withdrawal review error:', error);
      return false;
    }
  };
  const handleApproveWithdrawal = async (withdrawalId: string): Promise<boolean> => reviewWithdrawal(withdrawalId, 'approve');
  const handleDeclineWithdrawal = async (withdrawalId: string, _userId: string, _amount: number, reason?: string): Promise<boolean> => reviewWithdrawal(withdrawalId, 'reject', reason);
  const handleAdjustUserBalance = async (userId: string, amount: number, isDeduct: boolean, note: string) => {
    const response = await fetch('/api/admin/balance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: userId, amount, action: isDeduct ? 'deduct' : 'topup', note }) });
    const result = await response.json();
    if (result.success) {
      setUserProfile((prev) => prev && prev.uid === userId ? { ...prev, balance: Number(result.newBalance) || prev.balance, updatedAt: Date.now() } : prev);
    }
    return result;
  };
  const handleUpdateSettings = async (newSettings: GameSettings): Promise<boolean> => {
    try {
      const response = await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: newSettings }) });
      const result = await response.json();
      if (response.ok && result.success) { setSettings({ ...DEFAULT_SETTINGS, ...newSettings }); return true; }
      return false;
    } catch { return false; }
  };
  // Admin User Explorer: exact UID lookup plus indexed prefix lookups, not first-page filtering.
  const handleSearchUsers = async (searchQuery: string): Promise<UserProfile[]> => {
    try {
      const searchTerm = searchQuery.trim();
      const usersByUid = new Map<string, UserProfile>();
      const add = (id: string, data: Record<string, unknown>) => {
        usersByUid.set(id, {
          uid: id,
          fullName: String(data.fullName || ''),
          email: String(data.email || ''),
          phoneNumber: typeof data.phoneNumber === 'string' ? data.phoneNumber : undefined,
          role: data.role === 'admin' ? 'admin' : 'user',
          balance: Number(data.balance) || 0,
          referralBalance: Number(data.referralBalance) || 0,
          referralsCount: Number(data.referralsCount) || 0,
          depositedReferralsCount: Number(data.depositedReferralsCount) || 0,
          referralTotalDeposits: Number(data.referralTotalDeposits) || 0,
          referrerId: typeof data.referrerId === 'string' ? data.referrerId : null,
          referralCode: typeof data.referralCode === 'string' ? data.referralCode : undefined,
          totalBetCumulative: Number(data.totalBetCumulative) || 0,
          totalSuccessfulDeposit: Number(data.totalSuccessfulDeposit) || 0,
          withdrawalCount: Number(data.withdrawalCount) || 0,
          wagerSinceLastWithdrawal: Number(data.wagerSinceLastWithdrawal) || 0,
          hasSuccessfulDeposit: Boolean(data.hasSuccessfulDeposit),
          promoClaimedReferrals: Array.isArray(data.promoClaimedReferrals) ? data.promoClaimedReferrals as string[] : [],
          claimedMilestones: Array.isArray(data.claimedMilestones) ? data.claimedMilestones as string[] : undefined,
          boundBank: (data.boundBank as UserProfile['boundBank']) || null,
          isHedgingFlagged: Boolean(data.isHedgingFlagged),
          cleanTurnoverRequired: Number(data.cleanTurnoverRequired) || 0,
          firstDepositBonusClaimed: Boolean(data.firstDepositBonusClaimed),
          createdAt: Number(data.createdAt) || 0,
          updatedAt: Number(data.updatedAt) || 0,
        });
      };

      if (!searchTerm) {
        const usersSnap = await getDocs(query(collection(db, 'users'), orderBy('updatedAt', 'desc'), limit(100)));
        usersSnap.forEach((d) => add(d.id, d.data()));
        return Array.from(usersByUid.values());
      }

      const lookups: Array<() => Promise<void>> = [
        async () => {
          const exactUid = await getDoc(doc(db, 'users', searchTerm));
          if (exactUid.exists()) add(exactUid.id, exactUid.data());
        },
        async () => {
          const uidPrefix = await getDocs(query(
            collection(db, 'users'), orderBy(documentId()), startAt(searchTerm), endAt(`${searchTerm}\uf8ff`), limit(50)
          ));
          uidPrefix.forEach((d) => add(d.id, d.data()));
        },
        ...(['fullName', 'email'] as const).map((field) => async () => {
          const matches = await getDocs(query(
            collection(db, 'users'), orderBy(field), startAt(searchTerm), endAt(`${searchTerm}\uf8ff`), limit(50)
          ));
          matches.forEach((d) => add(d.id, d.data()));
        }),
        async () => {
          const digits = searchTerm.replace(/[^0-9]/g, '');
          if (!digits) return;
          const phones = await getDocs(query(
            collection(db, 'users'), orderBy('phoneNumber'), startAt(digits), endAt(`${digits}\uf8ff`), limit(50)
          ));
          phones.forEach((d) => add(d.id, d.data()));
        },
      ];

      await Promise.all(lookups.map(async (lookup) => {
        try { await lookup(); } catch (error) { console.warn('A user search path was unavailable:', error); }
      }));

      const qText = searchTerm.toLowerCase();
      const phoneQuery = searchTerm.replace(/[^0-9]/g, '');
      return Array.from(usersByUid.values()).filter((u) =>
        u.uid.toLowerCase().includes(qText) ||
        (u.fullName && u.fullName.toLowerCase().includes(qText)) ||
        (phoneQuery.length > 0 && u.phoneNumber && u.phoneNumber.includes(phoneQuery)) ||
        (u.email && u.email.toLowerCase().includes(qText))
      );
    } catch (err) {
      console.warn('Search users note:', err);
      return [];
    }
  };

  const handleLoadUserActivity = async (uid: string): Promise<UserActivitySnapshot> => {
    const [depositsSnap, withdrawalsSnap, betsSnap] = await Promise.all([
      getDocs(query(collection(db, 'deposits'), where('userId', '==', uid))),
      getDocs(query(collection(db, 'withdrawals'), where('userId', '==', uid))),
      getDocs(query(collection(db, 'bets'), where('userId', '==', uid))),
    ]);
    const newestFirst = <T extends { createdAt: number }>(items: T[]) =>
      items.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));

    const depositApproved = depositsSnap.docs.reduce((sum, d) => sum + (d.data().status === 'approved' || d.data().status === 'completed' ? Number(d.data().amount) || 0 : 0), 0);
    const withdrawalApproved = withdrawalsSnap.docs.reduce((sum, d) => sum + (d.data().status === 'approved' || d.data().status === 'completed' ? Number(d.data().amount) || 0 : 0), 0);
    const bets = betsSnap.docs.map((d) => {
      const data = d.data();
      return { ...data, id: d.id, betId: String(data.betId || d.id), createdAt: Number(data.createdAt || data.placedAt) || 0 } as PlayerBet;
    });
    return {
      deposits: newestFirst(depositsSnap.docs.map((d) => {
        const data = d.data();
        return { ...data, id: d.id, depositId: String(data.depositId || d.id), createdAt: Number(data.createdAt) || 0 } as DepositRequest;
      })),
      withdrawals: newestFirst(withdrawalsSnap.docs.map((d) => {
        const data = d.data();
        return { ...data, id: d.id, withdrawalId: String(data.withdrawalId || d.id), createdAt: Number(data.createdAt) || 0 } as WithdrawalRequest;
      })),
      bets: newestFirst(bets),
      summary: {
        depositRequested: depositsSnap.docs.reduce((sum, d) => sum + (Number(d.data().amount) || 0), 0),
        depositApproved,
        withdrawalRequested: withdrawalsSnap.docs.reduce((sum, d) => sum + (Number(d.data().amount) || 0), 0),
        withdrawalApproved,
        wagered: bets.reduce((sum, b) => sum + (Number(b.amount) || 0), 0),
        payout: bets.reduce((sum, b) => sum + (Number(b.payout) || 0), 0),
        wins: bets.filter((b) => b.status === 'win').length,
        losses: bets.filter((b) => b.status === 'loss').length,
      },
    };
  };

  // Admin Toggle User Hedging / Ban Flag
  const handleToggleUserFlag = async (userId: string, isFlagged: boolean): Promise<boolean> => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        isHedgingFlagged: isFlagged,
        updatedAt: Date.now(),
      });
      return true;
    } catch (err) {
      console.error('Toggle flag error:', err);
      return false;
    }
  };

  // Admin Toggle User Role
  const handleToggleUserRole = async (userId: string, newRole: 'admin' | 'user'): Promise<boolean> => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        role: newRole,
        updatedAt: Date.now(),
      });
      return true;
    } catch (err) {
      console.error('Toggle role error:', err);
      return false;
    }
  };

  // Admin Force Next Dice Roll
  const handleForceDiceRoll = async (d1: number, d2: number): Promise<boolean> => {
    try {
      const total = d1 + d2;
      const resClass = classifyDiceTotal(total);
      const resColor = classifyDiceColor(total);
      const currentRef = doc(db, 'rounds', 'current');
      await updateDoc(currentRef, {
        forcedDice1: d1,
        forcedDice2: d2,
        dice1: d1,
        dice2: d2,
        totalResult: total,
        resultClass: resClass,
        resultColor: resColor,
        updatedAt: Date.now(),
      });
      return true;
    } catch (err) {
      console.error('Force dice roll error:', err);
      return false;
    }
  };

  const handleGoogleSignIn = async () => {
    throw new Error('Turso authentication uses phone number and password.');
  };

  const applyTursoSessionUser = (profile: UserProfile) => {
    setUserProfile(profile);
    cacheUserProfile(profile);
    const sessionUser = {
      uid: profile.uid,
      email: profile.email,
      displayName: profile.fullName,
      phoneNumber: profile.phoneNumber || null,
    };
    setCurrentUser(sessionUser);
  };

  const handlePhoneSignIn = async (
    phone: string,
    psw: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password: psw }),
      });
      const result = await response.json();
      if (!response.ok || !result.success || !result.user) {
        return { success: false, error: result.error || 'ဖုန်းနံပါတ် သို့မဟုတ် password မှားယွင်းနေပါသည်' };
      }
      applyTursoSessionUser(result.user as UserProfile);
      return { success: true };
    } catch (error) {
      console.error('Turso login error:', error);
      return { success: false, error: 'Database ချိတ်ဆက်မှု မအောင်မြင်ပါ' };
    }
  };

  const handlePhoneSignUp = async (
    phone: string,
    psw: string,
    name: string,
    refCode?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password: psw, fullName: name, referralCode: refCode || urlReferralCode || undefined }),
      });
      const result = await response.json();
      if (!response.ok || !result.success || !result.user) {
        return { success: false, error: result.error || 'အကောင့်ဖွင့်ခြင်း မအောင်မြင်ပါ' };
      }
      applyTursoSessionUser(result.user as UserProfile);
      return { success: true };
    } catch (error) {
      console.error('Turso signup error:', error);
      return { success: false, error: 'Database ချိတ်ဆက်မှု မအောင်မြင်ပါ' };
    }
  };

  const handleSignOut = async () => {
    sounds.playChip();
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      if (typeof window !== 'undefined') {
        localStorage.removeItem('xai_phone_user');
      }
      setUserProfile(null);
      setCurrentUser(null);
      setReferralMembers([]);
    } catch (e) {
      console.error(e);
    }
  };

  const timerPercent = Math.max(0, Math.min(100, (timeLeft / (settings.ROUND_DURATION_SECONDS || 60)) * 100));
  const goToWallet = (tab: 'deposit' | 'withdraw' | 'history' | 'transfer' = 'deposit') => {
    setWalletInitialTab(tab);
    setSelectedGame('lobby');
    setActiveTab('wallet');
    setMobileSidebarOpen(false);
  };
  const goToLobby = () => {
    setSelectedGame('lobby');
    setActiveTab('home');
    setMobileSidebarOpen(false);
  };
  const matchesGameSearch = (terms: string) =>
    !gameSearch.trim() || terms.toLocaleLowerCase().includes(gameSearch.trim().toLocaleLowerCase());
  const hasBuffalo = (lobbyCategory === 'favorites' ? favoriteGames.includes('buffalo') : lobbyCategory === 'all' || lobbyCategory === 'slots' || lobbyCategory === 'hot') && matchesGameSearch('charge buffalo ကျွဲ slot');
  const hasDice = (lobbyCategory === 'favorites' ? favoriteGames.includes('dice') : lobbyCategory === 'all' || lobbyCategory === 'dice' || lobbyCategory === 'hot') && matchesGameSearch('live dice 777 အံစာ');
  const hasFishing = (lobbyCategory === 'favorites' ? favoriteGames.includes('fishing') : lobbyCategory === 'all' || lobbyCategory === 'hot') && matchesGameSearch('deep sea catch fishing ငါး');
  const hasSakura = (lobbyCategory === 'favorites' ? favoriteGames.includes('sakura') : lobbyCategory === 'all' || lobbyCategory === 'slots' || lobbyCategory === 'hot') && matchesGameSearch('sakura fortune deluxe slot');
  const recentTransactions = [
    ...userDeposits.map((row) => ({ key: row.id || row.depositId, kind: 'deposit' as const, amount: row.amount, status: row.status, createdAt: Number(row.createdAt) || 0 })),
    ...userWithdrawals.map((row) => ({ key: row.id || row.withdrawalId, kind: 'withdrawal' as const, amount: row.amount, status: row.status, createdAt: Number(row.createdAt) || 0 })),
  ].sort((left, right) => right.createdAt - left.createdAt).slice(0, 4);
  const toggleFavorite = (game: string) => {
    setFavoriteGames((current) => current.includes(game) ? current.filter((item) => item !== game) : [...current, game]);
  };
  const launchGame = (game: 'buffalo' | 'dice' | 'fishing' | 'sakura') => {
    sounds.playChip();
    setRecentlyPlayed((current) => [game, ...current.filter((item) => item !== game)].slice(0, 4));
    setActiveTab('home');
    setMobileSidebarOpen(false);
    window.scrollTo(0, 0);
    if (game === 'buffalo') enterBuffaloGame();
    else if (game === 'sakura') window.location.assign('/sakura-fortune');
    else setSelectedGame(game);
  };

  return (
    <main className={`app-shell premium-portal ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''} ${selectedGame !== 'lobby' && activeTab === 'home' ? `premium-portal--game premium-portal--${selectedGame}` : ''}`}>
      {/* Global In-Game Toast Banner (Zero blocking alerts) */}
      {globalToast && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-[#141822]/95 border border-amber-400/50 shadow-2xl shadow-black/80 rounded-2xl px-5 py-2.5 text-white text-xs sm:text-sm font-bold flex items-center gap-2.5 backdrop-blur-md pointer-events-none animate-fadeIn">
          <span className={`w-2 h-2 rounded-full shrink-0 ${globalToast.type === 'error' ? 'bg-red-400' : globalToast.type === 'success' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          <span>{globalToast.message}</span>
        </div>
      )}

      {mobileSidebarOpen && <button className="premium-sidebar-scrim" aria-label="မီနူးပိတ်ရန်" onClick={() => setMobileSidebarOpen(false)} />}
      <aside className={`premium-sidebar ${sidebarCollapsed ? 'is-collapsed' : ''} ${mobileSidebarOpen ? 'is-mobile-open' : ''}`} aria-label="ပင်မလမ်းညွှန်">
        <div className="premium-sidebar__brand">
          <div className="premium-brand-mark"><Crown aria-hidden="true" /></div>
          <div className="premium-brand-copy"><strong>XSITE</strong><span>CASINOS</span></div>
          <button className="premium-sidebar__collapse" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? 'မီနူးချဲ့ရန်' : 'မီနူးကျုံ့ရန်'} title={sidebarCollapsed ? 'မီနူးချဲ့ရန်' : 'မီနူးကျုံ့ရန်'}>
            {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
        </div>
        <nav className="premium-sidebar__nav">
          <span className="premium-sidebar__label">အဓိက</span>
          <button className={`premium-nav-item ${activeTab === 'home' && selectedGame === 'lobby' ? 'is-active' : ''}`} onClick={goToLobby} title="ပင်မ">
            <LayoutDashboard /><span>ပင်မစာမျက်နှာ</span>
          </button>
          <button className={`premium-nav-item ${activeTab === 'home' && selectedGame === 'dice' ? 'is-active' : ''}`} onClick={() => launchGame('dice')} title="တိုက်ရိုက်အံစာ">
            <Dices /><span>တိုက်ရိုက်အံစာ</span>
          </button>
          <button className={`premium-nav-item ${activeTab === 'home' && selectedGame === 'buffalo' ? 'is-active' : ''}`} onClick={() => launchGame('buffalo')} title="Charge Buffalo">
            <Gamepad2 /><span>Charge Buffalo</span>
          </button>
          <button className={`premium-nav-item ${activeTab === 'home' && selectedGame === 'fishing' ? 'is-active' : ''}`} onClick={() => launchGame('fishing')} title="Deep Sea Catch">
            <Fish /><span>Deep Sea Catch</span>
          </button>
          <button className="premium-nav-item" onClick={() => launchGame('sakura')} title="Sakura Fortune">
            <Sparkles /><span>Sakura Fortune</span>
          </button>
          <span className="premium-sidebar__label premium-sidebar__label--spaced">အကောင့်</span>
          <button className={`premium-nav-item ${activeTab === 'wallet' && walletInitialTab !== 'history' ? 'is-active' : ''}`} onClick={() => goToWallet('deposit')} title="ပိုက်ဆံအိတ်">
            <Wallet /><span>ပိုက်ဆံအိတ်</span>
          </button>
          <button className={`premium-nav-item ${activeTab === 'wallet' && walletInitialTab === 'history' ? 'is-active' : ''}`} onClick={() => goToWallet('history')} title="ငွေကြေးမှတ်တမ်း">
            <ReceiptText /><span>ငွေကြေးမှတ်တမ်း</span>
          </button>
          <button className={`premium-nav-item ${activeTab === 'referral' ? 'is-active' : ''}`} onClick={() => { setSelectedGame('lobby'); setActiveTab('referral'); setMobileSidebarOpen(false); }} title="ဆုလက်ဆောင်နှင့် ဖိတ်ခေါ်မှု">
            <Gift /><span>ဆုလက်ဆောင်များ</span>
          </button>
          <button className={`premium-nav-item ${activeTab === 'profile' ? 'is-active' : ''}`} onClick={() => { setSelectedGame('lobby'); setActiveTab('profile'); setMobileSidebarOpen(false); }} title="ပရိုဖိုင်">
            <User /><span>ပရိုဖိုင်</span>
          </button>
          <button className="premium-nav-item" onClick={() => { openTelegramLink(CUSTOMER_SERVICE_BOT_LINK); setMobileSidebarOpen(false); }} title="အကူအညီ">
            <Headphones /><span>အကူအညီ</span>
          </button>
          <button className="premium-nav-item" onClick={() => { openTelegramLink(TELEGRAM_CHANNEL_LINK); setMobileSidebarOpen(false); }} title="Telegram">
            <Megaphone /><span>Telegram</span>
          </button>
          {(userProfile?.role === 'admin' || isAdminEmail(currentUser?.email)) && <button className="premium-nav-item" onClick={() => setIsAdminOpen(true)} title="အက်ဒမင်">
            <ShieldAlert /><span>အက်ဒမင်</span>
          </button>}
        </nav>
        <div className="premium-sidebar__account">
          <div className="premium-avatar">{(userProfile?.fullName || 'X').slice(0, 1).toUpperCase()}</div>
          <div className="premium-sidebar__account-copy"><strong>{userProfile?.fullName || 'ဧည့်သည်'}</strong><span>{currentUser ? 'အကောင့်ဝင်ထားသည်' : 'အကောင့်မဝင်ရသေးပါ'}</span></div>
          {!currentUser && <button className="premium-sign-in" onClick={() => setIsAuthModalOpen(true)}>ဝင်ရန်</button>}
        </div>
      </aside>

      <div className="premium-portal__main">
        <header className="premium-topbar">
          <button className="premium-mobile-menu" onClick={() => setMobileSidebarOpen(true)} aria-label="လမ်းညွှန်မီနူးဖွင့်ရန်"><Menu /></button>
          <div className="premium-search">
            <button type="button" className="premium-search-submit" aria-label="ဂိမ်းရှာရန်" onClick={() => { setActiveTab('home'); setSelectedGame('lobby'); }}><Search aria-hidden="true" /></button>
            <input aria-label="ဂိမ်းအမည်ဖြင့် ရှာရန်" type="search" value={gameSearch} placeholder="ဂိမ်းအမည်ဖြင့် ရှာရန်..." onChange={(event) => setGameSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { setActiveTab('home'); setSelectedGame('lobby'); } }} />
          </div>
          <div className="premium-topbar__actions">
            <button className="premium-icon-button premium-support-shortcut" onClick={() => openTelegramLink(CUSTOMER_SERVICE_BOT_LINK)} title="ဖောက်သည်ဝန်ဆောင်မှု" aria-label="ဖောက်သည်ဝန်ဆောင်မှု"><Headphones /></button>
            <div className="premium-notification-wrap">
              <button className="premium-icon-button" onClick={() => setNotificationsOpen((value) => !value)} aria-expanded={notificationsOpen} aria-label="အသိပေးချက်များ"><Bell /></button>
              {notificationsOpen && <div className="premium-notification-popover"><div><strong>အသိပေးချက်များ</strong><button onClick={() => setNotificationsOpen(false)} aria-label="ပိတ်ရန်"><X /></button></div><p>လတ်တလော အသိပေးချက် မရှိသေးပါ။</p></div>}
            </div>
            <button className="premium-profile-button" onClick={() => { if (currentUser) { setSelectedGame('lobby'); setActiveTab('profile'); } else setIsAuthModalOpen(true); }} title="ပရိုဖိုင်ဖွင့်ရန်">
              <span className="premium-avatar premium-avatar--small">{(userProfile?.fullName || 'X').slice(0, 1).toUpperCase()}</span>
              <span className="premium-profile-copy"><strong>{userProfile?.fullName || (currentUser ? 'အဖွဲ့ဝင်' : 'ဧည့်သည်')}</strong><small>{currentUser ? 'အဖွဲ့ဝင်အကောင့်' : 'အကောင့်ဝင်ရန်'}</small></span>
            </button>
            <div className="premium-wallet-chip"><span>လက်ကျန်ငွေ</span><strong>{currentUser ? formatKs(userProfile?.balance || 0) : '—'}</strong></div>
            <button className="premium-deposit-button" onClick={() => currentUser ? goToWallet('deposit') : setIsAuthModalOpen(true)}><span>+</span> ငွေသွင်းရန်</button>
          </div>
        </header>

      {/* 2. Full-Screen Page View Router (ပင်မ, ဖိတ်ခေါ်မှု, ငွေသွင်း/ထုတ်, ပရိုဖိုင်) */}
      <div className={`premium-portal__workspace ${selectedGame !== 'lobby' && activeTab === 'home' ? 'premium-portal__workspace--game' : ''} ${activeTab !== 'home' ? 'premium-portal__workspace--account' : ''} ${(selectedGame === 'lobby' || activeTab === 'referral' || activeTab === 'wallet' || activeTab === 'profile') ? 'max-w-4xl px-2 sm:px-4' : selectedGame === 'dice' ? 'max-w-xl px-2 sm:px-3' : selectedGame === 'fishing' ? 'max-w-3xl px-2 sm:px-3' : 'max-w-md'}`}>
        {/* VIEW 1: ပင်မ (Games Lobby or Full-Screen Game Arenas) */}
        {activeTab === 'home' && (
          <div className="w-full flex flex-col gap-3.5 animate-fadeIn pb-6">
            {/* LOBBY VIEW: VIP Header, Promo Carousel, Category Bar & 2-Column Game Posters */}
            {selectedGame === 'lobby' && (
              <div className="flex flex-col gap-3.5">
                <section className="premium-overview" aria-label="အကောင့်အကျဉ်းချုပ်">
                  <div className="premium-overview__intro">
                    <h1>{userProfile?.fullName ? `${userProfile.fullName} မင်္ဂလာပါ` : 'ကစားရန် ဂိမ်းတစ်ခု ရွေးချယ်ပါ'}</h1>
                  </div>
                  <div className="premium-metrics">
                    <article className="premium-metric premium-metric--balance"><span>လက်ကျန်ငွေ</span><strong>{currentUser ? formatKs(userProfile?.balance || 0) : '—'}</strong><Wallet /></article>
                    <article className="premium-metric"><span>ငွေသွင်းစုစုပေါင်း</span><strong>{currentUser ? formatKs(userProfile?.totalSuccessfulDeposit || 0) : '—'}</strong><ArrowDownLeft /></article>
                    <article className="premium-metric"><span>ငွေထုတ်အကြိမ်</span><strong>{currentUser ? String(userProfile?.withdrawalCount || 0) : '—'}</strong><ArrowUpRight /></article>
                  </div>
                </section>
                {/* 1. TOP LUXURY VIP APP BAR */}
                <header className="legacy-lobby-header ledger-header relative w-full flex items-center justify-between py-2.5 px-3 sm:px-4 backdrop-blur-2xl">
                  {/* Brand Wordmark */}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black shadow-md shrink-0">
                      <Crown className="w-4 h-4 fill-black stroke-black" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-black tracking-wider text-white uppercase font-sans leading-none">
                        XSITE
                      </span>
                      <span className="text-[9px] font-bold tracking-widest text-amber-400 uppercase mt-0.5">
                        CASINOS
                      </span>
                    </div>
                  </div>

                  {/* Right Zone: VIP Balance Pill or Login Action */}
                  <div className="flex items-center gap-2">
                    {userProfile ? (
                      <div className="flex items-center gap-1.5 p-1 pl-2.5 rounded-xl bg-zinc-900 border border-white/10">
                        <div className="flex flex-col text-right">
                          <span className="text-[9px] text-white/50 font-bold uppercase truncate max-w-[85px]">
                            {userProfile.fullName}
                          </span>
                          <span className="text-xs sm:text-sm font-black text-amber-300 font-mono tabular-nums">
                            {formatKs(userProfile.balance || 0)}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            sounds.playChip();
                            setActiveTab('wallet');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-black text-[11px] active:scale-95 transition-all shadow-md flex items-center gap-1"
                        >
                          <span>+</span>
                          <span>ငွေသွင်း</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          sounds.playChip();
                          setIsAuthModalOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-black font-black text-xs active:scale-95 transition-all shadow-md flex items-center gap-1.5"
                      >
                        <LogIn className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>အကောင့်ဝင်ရန်</span>
                      </button>
                    )}

                    {/* Official Telegram Channel Button */}
                    <button
                      onClick={() => {
                        sounds.playChip();
                        openTelegramLink(TELEGRAM_CHANNEL_LINK);
                        showToast('Telegram သို့ ဖွင့်နေသည်…', 'info');
                      }}
                      className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 font-bold text-xs active:scale-95 transition-all shadow-sm shrink-0"
                      title="တရားဝင် Telegram"
                    >
                      <Megaphone className="w-3.5 h-3.5 text-sky-400 stroke-[2.2]" />
                      <span>Telegram</span>
                    </button>

                    {/* Customer Service Bot Button */}
                    <button
                      onClick={() => {
                        sounds.playChip();
                        openTelegramLink(CUSTOMER_SERVICE_BOT_LINK);
                        showToast('အကူအညီကို ဖွင့်နေသည်…', 'info');
                      }}
                      className="premium-cs-action premium-cs-action--compact flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl font-bold text-xs active:scale-[.98] transition-all shrink-0"
                      title="အကူအညီ"
                    >
                      <Headphones className="premium-cs-action__glyph w-3.5 h-3.5 stroke-[2]" />
                      <span className="hidden xs:inline sm:inline">အကူအညီ</span>
                    </button>

                    {/* Audio Toggle */}
                    <button
                      onClick={() => {
                        setSoundEnabled(!soundEnabled);
                        sounds.toggleSound();
                      }}
                      className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-all active:scale-95 shrink-0"
                      title="အသံ ဖွင့်/ပိတ်"
                    >
                      {soundEnabled ? <Volume2 className="w-4 h-4 stroke-[2]" /> : <VolumeX className="w-4 h-4 stroke-[2]" />}
                    </button>
                  </div>
                </header>

                {/* 2. PROMOTIONAL SHOWCASE CAROUSEL */}
                <div className={`premium-promo-showcase ledger-panel relative w-full overflow-hidden shadow-2xl bg-zinc-950 aspect-[16/8] sm:aspect-[16/7] md:aspect-[16/6] ${promoIndex === 0 ? 'premium-promo-showcase--wallet' : ''}`}>
                  {/* Slide 1: Wallet and payment information */}
                  {promoIndex === 0 && (
                    <div className="premium-wallet-feature relative w-full h-full flex flex-col justify-end p-4 sm:p-6 animate-fadeIn">
                      <img
                        src="/assets/casino/obsidian_bg.jpg"
                        alt="Casino wallet information"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
                      <div className="relative z-10 flex flex-col gap-1 max-w-lg">
                        <h2 className="text-sm sm:text-lg md:text-xl font-black text-white leading-tight">
                          ငွေသွင်း၊ ငွေထုတ်နှင့် မှတ်တမ်း
                        </h2>
                        <div className="pt-1.5">
                          <button
                            onClick={() => {
                              sounds.playChip();
                              goToWallet('deposit');
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs active:scale-95 transition-all shadow-lg flex items-center gap-1.5 w-fit"
                          >
                            <span>ပိုက်ဆံအိတ်ဖွင့်ရန်</span>
                            <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Slide 2: Charge Buffalo Slot */}
                  {promoIndex === 1 && (
                    <div className="relative w-full h-full flex flex-col justify-end p-4 sm:p-6 animate-fadeIn">
                      <img
                        src="/assets/casino/buffalo_poster.jpg"
                        alt="Charge Buffalo Slot"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent" />
                      <div className="relative z-10 flex flex-col gap-1 max-w-lg">
                        <h2 className="text-sm sm:text-lg md:text-xl font-black text-white leading-tight">
                          Charge Buffalo
                        </h2>
                        <div className="pt-1.5">
                          <button
                            onClick={() => launchGame('buffalo')}
                            className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs active:scale-95 transition-all shadow-lg flex items-center gap-1.5 w-fit"
                          >
                            <Play className="w-3 h-3 fill-black stroke-black" />
                            <span>ချက်ချင်း ကစားမည်</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Slide 3: Live Dice Lottery */}
                  {promoIndex === 2 && (
                    <div className="relative w-full h-full flex flex-col justify-end p-4 sm:p-6 animate-fadeIn">
                      <img
                        src="/assets/casino/dice_poster.jpg"
                        alt="Live Dice"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent" />
                      <div className="relative z-10 flex flex-col gap-1 max-w-lg">
                        <h2 className="text-sm sm:text-lg md:text-xl font-black text-white leading-tight">
                          အံစာ 777
                        </h2>
                        <div className="pt-1.5">
                          <button
                            onClick={() => launchGame('dice')}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-black font-black text-xs active:scale-95 transition-all shadow-lg flex items-center gap-1.5 w-fit"
                          >
                            <Play className="w-3 h-3 fill-black stroke-black" />
                            <span>တိုက်ရိုက်ကစားမည်</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Dots pagination */}
                  <div className="absolute bottom-2.5 right-3.5 z-20 flex items-center gap-1.5">
                    {[0, 1, 2].map((idx) => (
                      <button
                        key={`promo-dot-${idx}`}
                        onClick={() => setPromoIndex(idx)}
                        className={`h-1.5 rounded-full transition-all ${
                          promoIndex === idx ? 'w-5 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'
                        }`}
                        aria-label={`Go to slide ${idx + 1}`}
                      />
                    ))}
                  </div>
                </div>

                {recentlyPlayed.length > 0 && <section className="premium-recent-games" aria-label="လတ်တလော ကစားခဲ့သောဂိမ်းများ">
                  <div className="premium-recent-games__heading"><h2>လတ်တလော ကစားခဲ့သောဂိမ်းများ</h2></div>
                  <div className="premium-recent-games__list">{recentlyPlayed.map((game) => <button type="button" className="premium-recent-game" key={game} onClick={() => launchGame(game)}>
                    <span className="premium-recent-game__icon">{game === 'dice' ? <Dices /> : game === 'fishing' ? <Fish /> : game === 'sakura' ? <Sparkles /> : <Gamepad2 />}</span>
                    <span className="premium-recent-game__copy"><small>ထပ်မံကစားရန်</small><strong>{game === 'buffalo' ? 'Charge Buffalo' : game === 'dice' ? 'Live Dice 777' : game === 'fishing' ? 'Deep Sea Catch' : 'Sakura Fortune'}</strong></span>
                    <ChevronRight />
                  </button>)}</div>
                </section>}

                {/* 2.5 PROMINENT QUICK DEPOSIT & WITHDRAW BAR */}
                <div className="premium-quick-actions grid grid-cols-2 gap-2 sm:gap-3">
                  <button
                    onClick={() => {
                      sounds.playChip();
                      goToWallet('deposit');
                    }}
                    className="p-3 sm:p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/25 via-amber-600/20 to-amber-700/25 border border-amber-400/40 hover:border-amber-400 text-amber-300 font-black text-xs sm:text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-amber-500/10 group"
                  >
                    <ArrowDownLeft className="w-4 h-4 text-amber-400 stroke-[2.8] group-hover:scale-110 transition-transform" />
                    <span>ငွေသွင်းရန်</span>
                  </button>

                  <button
                    onClick={() => {
                      sounds.playChip();
                      goToWallet('withdraw');
                    }}
                    className="p-3 sm:p-3.5 rounded-2xl bg-zinc-900/90 border border-white/15 hover:border-white/30 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg group"
                  >
                    <ArrowUpRight className="w-4 h-4 text-emerald-400 stroke-[2.8] group-hover:scale-110 transition-transform" />
                    <span>ငွေထုတ်ရန်</span>
                  </button>
                </div>

                {/* 3. CATEGORY FILTER TABS */}
                <div className="premium-categories flex items-center gap-1.5 p-1 rounded-2xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl overflow-x-auto no-scrollbar" aria-label="ဂိမ်းအမျိုးအစား ရွေးရန်">
                  <button
                    onClick={() => {
                      sounds.playChip();
                      setLobbyCategory('all');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                      lobbyCategory === 'all'
                        ? 'bg-white text-black shadow-md'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    အားလုံး
                  </button>
                  <button
                    onClick={() => {
                      sounds.playChip();
                      setLobbyCategory('slots');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                      lobbyCategory === 'slots'
                        ? 'bg-amber-400 text-black shadow-md'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    စလော့
                  </button>
                  <button
                    onClick={() => {
                      sounds.playChip();
                      setLobbyCategory('dice');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                      lobbyCategory === 'dice'
                        ? 'bg-emerald-400 text-black shadow-md'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    တိုက်ရိုက်အံစာ
                  </button>
                  <button
                    onClick={() => {
                      sounds.playChip();
                      setLobbyCategory('hot');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                      lobbyCategory === 'hot'
                        ? 'bg-red-500 text-white shadow-md'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    လူကြိုက်များ
                  </button>
                  <button
                    onClick={() => {
                      sounds.playChip();
                      setLobbyCategory('favorites');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${lobbyCategory === 'favorites' ? 'bg-amber-100 text-amber-950 shadow-md' : 'text-white/60 hover:text-white'}`}
                  >
                    စိတ်ကြိုက်
                  </button>
                </div>

                {/* 4. 2-COLUMN PORTRAIT GAME POSTERS (STAKE & PGSOFT STYLE) */}
                <div className="premium-library-heading"><h2>ဂိမ်းများ</h2></div>
                <div className="premium-games-grid grid grid-cols-2 gap-3 sm:gap-4 md:gap-5">
                  {/* GAME CARD 1: Charge Buffalo Slot */}
                  {hasBuffalo && (
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label="Charge Buffalo ကစားမည်"
                      onClick={() => launchGame('buffalo')}
                      onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); launchGame('buffalo'); } }}
                      className="premium-game-card group relative rounded-2xl sm:rounded-3xl overflow-hidden aspect-[3/4] border border-amber-500/25 hover:border-amber-400/70 transition-all duration-300 shadow-2xl cursor-pointer active:scale-[0.98] bg-zinc-950 flex flex-col justify-between"
                    >
                      {/* Cover Art */}
                      <img
                        src="/assets/casino/buffalo_poster.jpg"
                        alt="Charge Buffalo"
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="eager"
                      />

                      {/* Top Badges */}
                      <div className="relative z-10 p-2.5 sm:p-3 flex items-center justify-between">
                        <span className="text-[9px] sm:text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-500 text-black shadow-md">
                          လူကြိုက်
                        </span>
                        <div className="flex items-center gap-2"><span className="text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-amber-300 border border-amber-400/30">၄,၀၉၆ နည်း</span><button type="button" className="premium-favorite-button" aria-label={favoriteGames.includes('buffalo') ? 'Charge Buffalo ကို စိတ်ကြိုက်မှ ဖယ်ရန်' : 'Charge Buffalo ကို စိတ်ကြိုက်ထည့်ရန်'} aria-pressed={favoriteGames.includes('buffalo')} onClick={(event) => { event.stopPropagation(); toggleFavorite('buffalo'); }}><Star fill={favoriteGames.includes('buffalo') ? 'currentColor' : 'none'} /></button></div>
                      </div>

                      {/* Hover / Tap Center Play Overlay */}
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40 backdrop-blur-xs pointer-events-none">
                        <div className="w-12 h-12 rounded-full bg-amber-400 text-black flex items-center justify-center shadow-[0_0_25px_rgba(251,191,36,0.8)] transform scale-90 group-hover:scale-100 transition-transform duration-300">
                          <Play className="w-5 h-5 fill-black stroke-black ml-0.5" />
                        </div>
                        <span className="text-xs font-black uppercase text-amber-300 tracking-wider mt-2">
                          ကစားမည်
                        </span>
                      </div>

                      {/* Bottom Scrim & Info */}
                      <div className="relative z-10 p-2.5 sm:p-3 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col">
                        <span className="text-xs sm:text-sm font-black text-white tracking-tight truncate">
                          Charge Buffalo
                        </span>
                        <div className="flex items-center justify-end text-[10px] text-white/60 font-medium mt-0.5">
                          <span className="text-amber-400 font-bold">×2, ×3, ×5</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* GAME CARD 2: Live Dice 777 */}
                  {hasDice && (
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label="အံစာ 777 ကစားမည်"
                      onClick={() => launchGame('dice')}
                      onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); launchGame('dice'); } }}
                      className="premium-game-card group relative rounded-2xl sm:rounded-3xl overflow-hidden aspect-[3/4] border border-emerald-500/25 hover:border-emerald-400/70 transition-all duration-300 shadow-2xl cursor-pointer active:scale-[0.98] bg-zinc-950 flex flex-col justify-between"
                    >
                      {/* Cover Art */}
                      <img
                        src="/assets/casino/dice_poster.jpg"
                        alt="အံစာ 777"
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="eager"
                      />

                      {/* Top Badges */}
                      <div className="relative z-10 p-2.5 sm:p-3 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500 text-black shadow-md">
                          <span className="text-[9px] sm:text-[10px] font-black uppercase">
                            တိုက်ရိုက်
                          </span>
                        </div>
                        <div className="flex items-center gap-2"><span className="text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-emerald-300 border border-emerald-400/30">ဆုကြေး 32×</span><button type="button" className="premium-favorite-button" aria-label={favoriteGames.includes('dice') ? 'အံစာဂိမ်း စိတ်ကြိုက်မှ ဖယ်ရန်' : 'အံစာဂိမ်း စိတ်ကြိုက်ထည့်ရန်'} aria-pressed={favoriteGames.includes('dice')} onClick={(event) => { event.stopPropagation(); toggleFavorite('dice'); }}><Star fill={favoriteGames.includes('dice') ? 'currentColor' : 'none'} /></button></div>
                      </div>

                      {/* Hover / Tap Center Play Overlay */}
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40 backdrop-blur-xs pointer-events-none">
                        <div className="w-12 h-12 rounded-full bg-emerald-400 text-black flex items-center justify-center shadow-[0_0_25px_rgba(52,211,153,0.8)] transform scale-90 group-hover:scale-100 transition-transform duration-300">
                          <Play className="w-5 h-5 fill-black stroke-black ml-0.5" />
                        </div>
                        <span className="text-xs font-black uppercase text-emerald-300 tracking-wider mt-2">
                          ကစားမည်
                        </span>
                      </div>

                      {/* Bottom Scrim & Info */}
                      <div className="relative z-10 p-2.5 sm:p-3 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col">
                        <span className="text-xs sm:text-sm font-black text-white tracking-tight truncate">
                          အံစာ 777
                        </span>
                        <div className="flex items-center justify-between text-[10px] text-white/60 font-medium mt-0.5">
                          <span className="text-emerald-400 font-bold">စက္ကန့် ၆၀</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* GAME CARD 3: Deep Sea Catch Fishing */}
                  {hasFishing && (
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label="Deep Sea Catch ကစားမည်"
                      onClick={() => launchGame('fishing')}
                      onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); launchGame('fishing'); } }}
                      className="premium-game-card group relative cursor-pointer overflow-hidden rounded-2xl border border-white/20 bg-zinc-950 shadow-2xl transition-all duration-300 hover:border-white/60 active:scale-[0.98] sm:rounded-3xl"
                    >
                      <img src="/assets/casino/fishing_card.jpg" alt="Deep Sea Catch" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/5" />
                      <div className="relative z-10 flex aspect-[3/4] flex-col justify-between p-2.5 sm:p-3">
                        <div className="flex items-center justify-end"><button type="button" className="premium-favorite-button" aria-label={favoriteGames.includes('fishing') ? 'Deep Sea Catch ကို စိတ်ကြိုက်မှ ဖယ်ရန်' : 'Deep Sea Catch ကို စိတ်ကြိုက်ထည့်ရန်'} aria-pressed={favoriteGames.includes('fishing')} onClick={(event) => { event.stopPropagation(); toggleFavorite('fishing'); }}><Star fill={favoriteGames.includes('fishing') ? 'currentColor' : 'none'} /></button></div>
                        <div><div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-xl transition-transform group-hover:scale-105"><Fish className="h-5 w-5 fill-black stroke-black" /></div><span className="block truncate text-xs font-black tracking-tight text-white sm:text-sm">Deep Sea Catch</span><div className="mt-0.5 flex items-center justify-between text-[10px] font-medium text-white/65"><span>ငါးပစ်ဂိမ်း</span><span className="font-bold text-white">ကစားမည်</span></div></div>
                      </div>
                    </div>
                  )}
                  {/* GAME CARD 4: Sakura Fortune Deluxe */}
                  {hasSakura && (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => launchGame('sakura')}
                      onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); launchGame('sakura'); } }}
                      className="premium-game-card group relative cursor-pointer overflow-hidden rounded-2xl border border-pink-400/30 bg-[#24111e] text-left shadow-2xl transition-all duration-300 hover:border-pink-300/80 active:scale-[0.98] sm:rounded-3xl"
                      aria-label="Sakura Fortune ကစားမည်"
                    >
                      <img
                        src="/games/sakura-fortune/assets/lobby-poster.webp"
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#170b14] via-[#170b14]/55 to-[#170b14]/10" />
                      <div className="relative z-10 flex aspect-[3/4] flex-col justify-between p-2.5 sm:p-3">
                        <div className="flex items-center justify-end">
                          <button type="button" className="premium-favorite-button" aria-label={favoriteGames.includes('sakura') ? 'Sakura Fortune ကို စိတ်ကြိုက်မှ ဖယ်ရန်' : 'Sakura Fortune ကို စိတ်ကြိုက်ထည့်ရန်'} aria-pressed={favoriteGames.includes('sakura')} onClick={(event) => { event.stopPropagation(); toggleFavorite('sakura'); }}><Star fill={favoriteGames.includes('sakura') ? 'currentColor' : 'none'} /></button>
                        </div>
                        <div>
                          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-pink-200 text-[#321323] shadow-[0_0_25px_rgba(249,127,186,0.5)] transition-transform group-hover:scale-105">
                            <Sparkles className="h-5 w-5 stroke-[2.5]" />
                          </div>
                          <span className="block truncate text-xs font-black tracking-tight text-white sm:text-sm">Sakura Fortune</span>
                          <div className="mt-0.5 flex items-center justify-between text-[10px] font-medium text-white/70">
                            <span className="font-bold text-pink-200"><Sparkles className="inline h-3 w-3" aria-hidden="true" /> ကစားမည်</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {[hasBuffalo, hasDice, hasFishing, hasSakura].every((visible) => !visible) && <div className="premium-empty-state premium-empty-state--games">ဂိမ်း မတွေ့ပါ။ စကားလုံး သို့မဟုတ် အမျိုးအစားကို ပြောင်းရှာကြည့်ပါ။</div>}
                <section className="premium-activity-panel" aria-label="လတ်တလော အံစာရလဒ်များ">
                  <div className="premium-activity-panel__heading"><h2>လတ်တလော အံစာရလဒ်များ</h2><span className="premium-live-indicator"><i /> တိုက်ရိုက်</span></div>
                  <div className="premium-round-strip">
                    {recentRounds.slice(0, 4).map((round) => <article className="premium-round-item" key={round.id || round.roundId}><span>ပွဲစဉ် #{round.roundId}</span><strong>{round.totalResult ?? '—'}</strong><small>{round.resultClass === 'small' ? 'အသေး' : round.resultClass === 'big' ? 'အကြီး' : round.resultClass === 'common' ? 'အလယ်' : 'စောင့်ဆိုင်းဆဲ'}</small></article>)}
                    {recentRounds.length === 0 && <p className="premium-empty-state">အံစာရလဒ်များ မရရှိသေးပါ။</p>}
                  </div>
                </section>
                <section className="premium-activity-panel premium-transactions-panel" aria-label="လတ်တလော ငွေကြေးမှတ်တမ်း">
                  <div className="premium-activity-panel__heading"><h2>လတ်တလော ငွေကြေးမှတ်တမ်း</h2>{currentUser && <button className="premium-view-history" onClick={() => goToWallet('history')}>မှတ်တမ်းအားလုံး <ChevronRight /></button>}</div>
                  {!currentUser ? <button className="premium-empty-state premium-transactions-empty" onClick={() => setIsAuthModalOpen(true)}>အကောင့်ဝင်ပြီး သင့်ငွေကြေးမှတ်တမ်းများကို ကြည့်ပါ။</button> : recentTransactions.length === 0 ? <p className="premium-empty-state">လတ်တလော ငွေကြေးမှတ်တမ်း မရှိသေးပါ။</p> : <div className="premium-transaction-list">
                    {recentTransactions.map((transaction) => <article className="premium-transaction-row" key={transaction.key}>
                      <span className={`premium-transaction-icon ${transaction.kind === 'deposit' ? 'is-deposit' : 'is-withdrawal'}`}>{transaction.kind === 'deposit' ? <ArrowDownLeft /> : <ArrowUpRight />}</span>
                      <span className="premium-transaction-copy"><strong>{transaction.kind === 'deposit' ? 'ငွေသွင်း' : 'ငွေထုတ်'}</strong><small>{new Date(transaction.createdAt).toLocaleDateString('my-MM', { day: '2-digit', month: 'short' })}</small></span>
                      <strong className="premium-transaction-amount">{formatKs(transaction.amount)}</strong>
                      <span className={`premium-transaction-status ${transaction.status === 'approved' || transaction.status === 'completed' ? 'is-approved' : transaction.status === 'pending' ? 'is-pending' : 'is-other'}`}>{transaction.status === 'approved' || transaction.status === 'completed' ? 'အောင်မြင်' : transaction.status === 'pending' ? 'ဆိုင်းငံ့' : transaction.status === 'declined' ? 'ပယ်ချ' : 'စစ်ဆေးရန်'}</span>
                    </article>)}
                  </div>}
                </section>
              </div>
            )}

            {/* FULL-SCREEN ARENA: FISHING MINI-GAME */}
            {selectedGame === 'fishing' && (
              <FishingGame
                balance={Number(userProfile?.balance || 0)}
                isAuthenticated={Boolean(currentUser)}
                onRequireAuth={() => setIsAuthModalOpen(true)}
                onBack={() => {
                  sounds.playChip();
                  setSelectedGame('lobby');
                }}
              />
            )}

            {/* FULL-SCREEN ARENA: GAME 1 - အံစာဂိမ်း (Dice Game) */}
            {selectedGame === 'dice' && (
              <div className="flex flex-col gap-3.5">
                {/* In-Game Header: Back Button + Center Dynamic Island + Sound */}
                <div className="sticky top-2 z-40 flex items-center justify-between w-full py-1">
                  <button
                    onClick={() => {
                      sounds.playChip();
                      setSelectedGame('lobby');
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-black/80 hover:bg-white/20 border border-white/20 text-white font-black text-xs active:scale-95 transition-all shadow-xl backdrop-blur-xl"
                  >
                    <ArrowLeft className="w-4 h-4 stroke-white stroke-[2.5]" />
                    <span>ဂိမ်းများ</span>
                  </button>

                  {/* Center Dynamic Island Pill */}
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/90 border border-white/25 shadow-[0_8px_25px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
                      <span className="text-xs font-black text-white font-mono tracking-wide">
                        {formatKs(userProfile?.balance || 0)}
                      </span>
                      <button
                        onClick={() => {
                          sounds.playChip();
                          setActiveTab('wallet');
                        }}
                        className="px-2 py-0.5 rounded-full bg-white text-black font-black text-[10px] hover:bg-white/90 active:scale-95 transition-all flex items-center gap-1 shadow-sm"
                        title="ငွေသွင်း/ထုတ် သို့ သွားမည်"
                      >
                        <span>ငွေသွင်း/ထုတ်</span>
                        <span className="font-bold">+</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        sounds.playChip();
                        setIsRulesOpen(true);
                      }}
                      className="p-2 rounded-2xl bg-black/80 border border-white/20 text-white active:scale-95 transition-all shadow-xl backdrop-blur-xl"
                      title="ကစားနည်းစည်းကမ်းများ"
                    >
                      <HelpCircle className="w-4 h-4 stroke-white stroke-[2.4]" />
                    </button>
                    <button
                      onClick={() => {
                        const next = !soundEnabled;
                        setSoundEnabled(next);
                        sounds.enabled = next;
                      }}
                      className="p-2 rounded-2xl bg-black/80 border border-white/20 text-white active:scale-95 transition-all shadow-xl backdrop-blur-xl"
                      title="အသံ အဖွင့်/အပိတ်"
                    >
                      {soundEnabled ? (
                        <Volume2 className="w-4 h-4 stroke-white stroke-[2.4]" />
                      ) : (
                        <VolumeX className="w-4 h-4 stroke-white stroke-[2.4]" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Live Synchronized Round Header & Countdown Timer with Luxury Obsidian Felt */}
                <div className="relative rounded-3xl overflow-hidden border border-white/10 shadow-xl bg-zinc-950/90 p-4 flex flex-col gap-3">
                  <div
                    className="absolute inset-0 bg-cover bg-center opacity-25 pointer-events-none"
                    style={{ backgroundImage: `url('/assets/casino/obsidian_bg.jpg')` }}
                  />
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-xl text-xs font-black bg-amber-400/20 text-amber-300 border border-amber-400/30 font-mono shadow-sm">
                        ပွဲစဉ် #{roundId}
                      </span>
                      <span className="text-xs font-black text-white flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400 stroke-[2.4]" />
                        {bettingOpen ? 'လောင်းကြေးဖွင့်လှစ်ထားပါသည်' : 'လောင်းကြေးပိတ်ပါပြီ'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 font-mono text-base font-black">
                      <span className={`px-2.5 py-0.5 rounded-lg border ${timeLeft <= 10 ? 'bg-red-500/20 border-red-500/40 text-red-400 animate-pulse' : 'bg-white/5 border-white/10 text-white'}`}>
                        {timeLeft}s
                      </span>
                    </div>
                  </div>

                  {/* Smooth Progress Bar */}
                  <div className="relative z-10 w-full bg-black/60 rounded-full h-2 overflow-hidden border border-white/10 p-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${timeLeft <= 10 ? 'bg-gradient-to-r from-red-500 to-amber-400' : 'bg-gradient-to-r from-amber-500 to-amber-300'}`}
                      style={{ width: `${timerPercent}%` }}
                    />
                  </div>
                </div>

                {/* Interactive 3D Realistic Rolling Dice Arena */}
                <DiceRoller
                  dice1={dice1}
                  dice2={dice2}
                  isRolling={isRolling}
                  totalResult={lastRoundResult.total}
                  resultClass={lastRoundResult.resultClass}
                  showSummary={!isRolling}
                />

                {/* Betting Board (အသေး, Common 7, အကြီး & Exact Numbers) */}
                <BettingBoard
                  settings={settings}
                  userBalance={userProfile?.balance || 0}
                  roundId={roundId}
                  bettingOpen={bettingOpen}
                  onPlaceBet={handlePlaceBet}
                  currentRoundBets={currentRoundBets}
                />

                {/* Vintage Mechanical Slot Machine Game Results History (5 Reels with Staggered Spin & Blur) */}
                <VintageSlotHistory
                  rounds={recentRounds}
                  currentRoundId={roundId}
                  isGameRolling={isRolling}
                  latestSettledResult={lastRoundResult}
                />
              </div>
            )}

            {/* FULL-SCREEN ARENA: GAME 2 - ကျွဲဂိမ်း - Charge Buffalo (Wheel Slot) */}
            {selectedGame === 'buffalo' && (
              <BuffaloSlotGame
                user={userProfile}
                settings={settings}
                onBackToLobby={exitBuffaloGame}
                onGoToWallet={() => setActiveTab('wallet')}
                onRequireAuth={() => setIsAuthModalOpen(true)}
                soundEnabled={soundEnabled}
                onToggleSound={() => {
                  const next = !soundEnabled;
                  setSoundEnabled(next);
                  sounds.enabled = next;
                }}
                onUpdateUserBalance={(newBal) => {
                  setUserProfile((prev) => {
                    if (!prev) return null;
                    const updated = { ...prev, balance: newBal, updatedAt: Date.now() };
                    cacheUserProfile(updated);
                    // Buffalo's authenticated spin API already committed this balance transactionally.
                    return updated;
                  });
                }}
              />
            )}
          </div>
        )}

        {/* VIEW 2: ဖိတ်ခေါ်မှု (Full-Screen Referral & Team Commission View) */}
        {activeTab === 'referral' && (
          <div className="premium-account-view"><ReferralView
            user={userProfile || createFallbackUser(currentUser?.uid || 'guest', currentUser?.email || 'guest@gmail.com', currentUser?.displayName || 'မန်ဘာ')}
            settings={settings}
            referralMembers={referralMembers}
            onTransferReferral={handleTransferReferral}
            onClaimMilestone={handleClaimMilestone}
            onGoToWallet={() => goToWallet('deposit')}
          /></div>
        )}

        {/* VIEW 3: ငွေသွင်း/ထုတ် (Full-Screen Deposit, Withdrawal & Bank Binding View) */}
        {activeTab === 'wallet' && (
          <div className="premium-account-view"><WalletView
            user={userProfile || createFallbackUser(currentUser?.uid || 'guest', currentUser?.email || 'guest@gmail.com', currentUser?.displayName || 'မန်ဘာ')}
            settings={settings}
            initialTab={walletInitialTab}
            userWithdrawals={userWithdrawals}
            userDeposits={userDeposits}
            onSubmitDeposit={handleSubmitDeposit}
            onSubmitWithdrawal={handleSubmitWithdrawal}
            onTransferReferral={handleTransferReferral}
            onBindBank={handleBindBank}
            onRefreshUser={async () => {
              if (currentUser) {
                const snap = await getDoc(doc(db, 'users', currentUser.uid));
                if (snap.exists()) setUserProfile(snap.data() as UserProfile);
              }
            }}
            onRequireAuth={() => {
              sounds.playChip();
              setIsAuthModalOpen(true);
            }}
          /></div>
        )}

        {/* VIEW 4: ပရိုဖိုင် (Full-Screen User Profile & Comprehensive Betting History Records) */}
        {activeTab === 'profile' && (
          <div className="premium-account-view"><ProfileView
            user={userProfile}
            settings={settings}
            bets={myBetsHistory}
            onSignIn={() => {
              sounds.playChip();
              setIsAuthModalOpen(true);
            }}
            onSignOut={handleSignOut}
            onRefresh={async () => {
              if (currentUser) {
                const snap = await getDoc(doc(db, 'users', currentUser.uid));
                if (snap.exists()) setUserProfile(snap.data() as UserProfile);
              }
            }}
          /></div>
        )}
      </div>
      </div>

      {/* 3. Persistent Bottom Main Navigation Menu (Hidden inside Buffalo Slot for full-screen immersive landscape) */}
      {selectedGame !== 'buffalo' && selectedGame !== 'fishing' && (
        <nav className="ledger-nav fixed bottom-0 inset-x-0 z-40 px-2 py-2 flex items-center justify-around max-w-md mx-auto backdrop-blur-2xl">
          <button
            onClick={() => {
              sounds.playChip();
              goToLobby();
            }}
            className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-2xl transition-all ${
              activeTab === 'home'
                ? 'bg-white text-black font-black shadow-lg scale-105'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <Dices className={`w-5 h-5 ${activeTab === 'home' ? 'stroke-black' : 'stroke-white'} stroke-[2.4]`} />
            <span className="text-[11px] font-black">ပင်မ</span>
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              setSelectedGame('lobby');
              setActiveTab('referral');
            }}
            className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-2xl transition-all ${
              activeTab === 'referral'
                ? 'bg-white text-black font-black shadow-lg scale-105'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <Users className={`w-5 h-5 ${activeTab === 'referral' ? 'stroke-black' : 'stroke-white'} stroke-[2.4]`} />
            <span className="text-[11px] font-black">ဖိတ်ခေါ်မှု</span>
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              goToWallet('deposit');
            }}
            className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-2xl transition-all ${
              activeTab === 'wallet'
                ? 'bg-white text-black font-black shadow-lg scale-105'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <Wallet className={`w-5 h-5 ${activeTab === 'wallet' ? 'stroke-black' : 'stroke-white'} stroke-[2.4]`} />
            <span className="text-[11px] font-black">ငွေသွင်း/ထုတ်</span>
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              setSelectedGame('lobby');
              setActiveTab('profile');
            }}
            className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-2xl transition-all ${
              activeTab === 'profile'
                ? 'bg-white text-black font-black shadow-lg scale-105'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <User className={`w-5 h-5 ${activeTab === 'profile' ? 'stroke-black' : 'stroke-white'} stroke-[2.4]`} />
            <span className="text-[11px] font-black">ပရိုဖိုင်</span>
          </button>

          {(userProfile?.role === 'admin' || isAdminEmail(currentUser?.email)) && (
            <button
              onClick={() => {
                sounds.playChip();
                setIsAdminOpen(true);
              }}
              className="relative flex flex-col items-center gap-1 py-1.5 px-2.5 rounded-2xl border border-white/20 text-white/80 hover:text-white active:scale-95"
              title="အက်ဒမင် စီမံခန့်ခွဲမှု"
            >
              <ShieldAlert className="w-5 h-5 stroke-white stroke-[2.4]" />
              <span className="text-[10px] font-black">အက်ဒမင်</span>
              {(pendingDeposits.length > 0 || pendingWithdrawals.length > 0) && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center animate-pulse border border-white/40 shadow-lg">
                  {pendingDeposits.length + pendingWithdrawals.length}
                </span>
              )}
            </button>
          )}
        </nav>
      )}

      {/* Rules Modal */}
      <RulesModal
        isOpen={isRulesOpen}
        onClose={() => setIsRulesOpen(false)}
        settings={settings}
      />

      {/* User Phone & Password / Google Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        referralCodeFromUrl={urlReferralCode}
        onPhoneSignIn={handlePhoneSignIn}
        onPhoneSignUp={handlePhoneSignUp}
      />

      {/* Admin Panel Modal (for Magire34@gmail.com & primren685@gmail.com) */}
      {(userProfile?.role === 'admin' || isAdminEmail(currentUser?.email)) && (
        <AdminModal
          isOpen={isAdminOpen}
          onClose={() => setIsAdminOpen(false)}
          adminAuthRequired={adminAuthRequired}
          onAdminLogin={async (username, password) => {
            try {
              const response = await fetch('/api/admin/login', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username.trim(), password }),
              });
              const result = await response.json().catch(() => ({}));
              if (!response.ok || !result.success) {
                return { success: false, error: result.error || 'Admin login မအောင်မြင်ပါ။' };
              }
              setAdminAuthRequired(false);
              setAdminOverviewRefreshToken((value) => value + 1);
              return { success: true };
            } catch {
              return { success: false, error: 'Server ချိတ်ဆက်မှု မအောင်မြင်ပါ။ ပြန်ကြိုးစားပါ။' };
            }
          }}
          settings={settings}
          pendingDeposits={pendingDeposits}
          pendingWithdrawals={pendingWithdrawals}
          allBets={allBets}
          currentRound={currentRoundDoc}
          onApproveDeposit={handleApproveDeposit}
          onDeclineDeposit={handleDeclineDeposit}
          onApproveWithdrawal={handleApproveWithdrawal}
          onDeclineWithdrawal={handleDeclineWithdrawal}
          onUpdateSettings={handleUpdateSettings}
          onTriggerRoll={() => currentRoundDoc && triggerGlobalSettlement(currentRoundDoc)}
          onAdjustUserBalance={handleAdjustUserBalance}
          onSearchUsers={handleSearchUsers}
          onLoadUserActivity={handleLoadUserActivity}
          onToggleUserFlag={handleToggleUserFlag}
          onToggleUserRole={handleToggleUserRole}
          onForceDiceRoll={handleForceDiceRoll}
        />
      )}

      {/* Live Round Result & Profit/Loss Settlement Modal Popup (Only when user placed bets in this round) */}
      {settledModalData && settledModalData.userBets.length > 0 && (
        <RoundResultModal
          isOpen={isResultModalOpen}
          onClose={() => setIsResultModalOpen(false)}
          roundId={settledModalData.roundId}
          dice1={settledModalData.dice1}
          dice2={settledModalData.dice2}
          totalResult={settledModalData.totalResult}
          resultClass={settledModalData.resultClass}
          resultColor={settledModalData.resultColor}
          userRoundBets={settledModalData.userBets}
        />
      )}

      {/* Floating 24/7 Customer Service Bot Button (Lobby) */}
      {selectedGame === 'lobby' && activeTab === 'home' && (
        <aside aria-label="Customer Support" className="fixed bottom-20 right-3 sm:right-5 z-40 animate-fadeIn">
          <button
            onClick={() => {
              sounds.playChip();
              openTelegramLink(CUSTOMER_SERVICE_BOT_LINK);
              showToast('အကူအညီကို ဖွင့်နေသည်…', 'info');
            }}
            className="premium-cs-action premium-cs-action--floating flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-full active:scale-[.98] transition-all"
            title="အကူအညီ"
          >
            <div className="premium-cs-action__icon">
              <Headphones className="premium-cs-action__glyph w-4 h-4 stroke-[2]" />
            </div>
            <span className="premium-cs-action__label text-xs font-black tracking-wide font-sans flex items-center gap-1">
              အကူအညီ
            </span>
          </button>
        </aside>
      )}
    </main>
  );
}

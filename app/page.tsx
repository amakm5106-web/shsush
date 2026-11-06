'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
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
  Coins,
  Sparkles,
  ShieldCheck,
  Users,
  ArrowLeft,
  Play,
  Flame,
  Megaphone,
  Crown,
  ChevronRight,
  ChevronLeft,
  Trophy,
} from 'lucide-react';

import { auth, db, googleProvider, testConnection, handleFirestoreError, OperationType } from '@/lib/firebase';
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
} from '@/lib/types';
import {
  DEFAULT_SETTINGS,
  ADMIN_EMAIL,
  ADMIN_EMAILS,
  isAdminEmail,
  classifyDiceTotal,
  formatKs,
} from '@/lib/constants';
import { sounds } from '@/lib/audio';

import { DiceRoller } from '@/components/DiceRoller';
import { BettingBoard } from '@/components/BettingBoard';
import { WalletModal } from '@/components/WalletModal';
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
import { AuthModal } from '@/components/AuthModal';

interface CurrentRoundData {
  roundId: number;
  status: 'betting' | 'rolling' | 'settled';
  openedAt: number;
  durationSeconds: number;
  deadline: number;
  dice1: number;
  dice2: number;
  totalResult: number;
  resultClass: 'small' | 'common' | 'big';
  settledAt: number;
  nextRoundAt: number;
  updatedAt: number;
}

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

export default function Home() {
  // Auth & User Profile State
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
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
  }>({
    roundId: 100,
    dice1: 3,
    dice2: 4,
    total: 7,
    resultClass: 'common',
  });

  // Recent Synchronized Rounds History & Bets
  const [recentRounds, setRecentRounds] = useState<GameRound[]>([]);
  const [currentRoundBets, setCurrentRoundBets] = useState<PlayerBet[]>([]);
  const [myBetsHistory, setMyBetsHistory] = useState<PlayerBet[]>([]);
  const [allBets, setAllBets] = useState<PlayerBet[]>([]);
  const [referralMembers, setReferralMembers] = useState<ReferralMember[]>([]);

  // Deposits & Withdrawals
  const [pendingDeposits, setPendingDeposits] = useState<DepositRequest[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [userWithdrawals, setUserWithdrawals] = useState<WithdrawalRequest[]>([]);

  // Page View Routing State
  const [activeTab, setActiveTab] = useState<'home' | 'referral' | 'wallet' | 'profile'>('home');
  const [selectedGame, setSelectedGame] = useState<'lobby' | 'dice' | 'buffalo'>('lobby');
  const [lobbyCategory, setLobbyCategory] = useState<'all' | 'slots' | 'dice' | 'hot'>('all');
  const [promoIndex, setPromoIndex] = useState<number>(0);

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
  const [urlReferralCode, setUrlReferralCode] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('ref') || urlParams.get('referral') || urlParams.get('start') || '';
    }
    return '';
  });
  const [isWalletOpen, setIsWalletOpen] = useState<boolean>(false);
  const [isRulesOpen, setIsRulesOpen] = useState<boolean>(false);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const lastProcessedSettledRoundRef = useRef<number | null>(null);

  // 1. Initialize Telegram WebApp viewport and settings
  useEffect(() => {
    testConnection();
    if (typeof window !== 'undefined') {
      if ((window as unknown as { Telegram?: { WebApp?: { ready: () => void; expand: () => void } } }).Telegram?.WebApp) {
        const tg = (window as unknown as { Telegram: { WebApp: { ready: () => void; expand: () => void } } }).Telegram.WebApp;
        tg.ready();
        tg.expand();
      }
    }
  }, []);

  // 2. Auth State Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          let snap;
          try {
            snap = await getDoc(userDocRef);
          } catch (e) {
            console.warn('User profile initial fetch offline/reconnecting note:', e);
            const isUserAdmin = isAdminEmail(user.email);
            const fallbackProfile = createFallbackUser(user.uid, user.email || '', user.displayName || 'မန်ဘာ');
            if (isUserAdmin) fallbackProfile.role = 'admin';
            setUserProfile(fallbackProfile);
            setAuthLoading(false);
            return;
          }

          if (!snap.exists()) {
            let referrerUid: string | null = null;
            if (typeof window !== 'undefined') {
              const urlParams = new URLSearchParams(window.location.search);
              referrerUid = urlParams.get('ref');
            }

            const isUserAdmin = isAdminEmail(user.email);
            const newProfile: UserProfile = {
              uid: user.uid,
              email: user.email || '',
              fullName: user.displayName || `Player ${user.uid.slice(0, 5)}`,
              role: isUserAdmin ? 'admin' : 'user',
              balance: 0, // No registration bonus per admin instructions
              referralBalance: 0,
              referralsCount: 0,
              referrerId: referrerUid,
              totalBetCumulative: 0,
              totalSuccessfulDeposit: 0,
              withdrawalCount: 0,
              wagerSinceLastWithdrawal: 0,
              hasSuccessfulDeposit: false,
              isHedgingFlagged: false,
              cleanTurnoverRequired: 0,
              firstDepositBonusClaimed: false,
              promoClaimedReferrals: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };

            await setDoc(userDocRef, newProfile);
            setUserProfile(newProfile);

            if (isUserAdmin) {
              try {
                await setDoc(doc(db, 'admins', user.uid), {
                  email: user.email,
                  role: 'admin',
                  updatedAt: Date.now(),
                }, { merge: true });
              } catch (admErr) {
                console.warn('Admin record sync note:', admErr);
              }
            }

            if (referrerUid && referrerUid !== user.uid) {
              try {
                const refDocRef = doc(db, 'users', referrerUid);
                const refSnap = await getDoc(refDocRef);
                if (refSnap.exists()) {
                  const refData = refSnap.data() as UserProfile;
                  await updateDoc(refDocRef, {
                    referralsCount: (refData.referralsCount || 0) + 1,
                    updatedAt: Date.now(),
                  });
                }
              } catch (e) {
                console.error('Failed to credit referrer:', e);
              }
            }
          } else {
            const data = snap.data() as UserProfile;
            const isUserAdmin = isAdminEmail(user.email);
            if (isUserAdmin) {
              if (data.role !== 'admin') {
                data.role = 'admin';
                await updateDoc(userDocRef, { role: 'admin' });
              }
              try {
                await setDoc(doc(db, 'admins', user.uid), {
                  email: user.email,
                  role: 'admin',
                  updatedAt: Date.now(),
                }, { merge: true });
              } catch (admErr) {
                console.warn('Admin record sync note:', admErr);
              }
              try {
                const settingsRef = doc(db, 'settings', 'config');
                const setSnap = await getDoc(settingsRef);
                if (!setSnap.exists() || setSnap.data()?.KPAY_NAME !== 'Aung Khant Min') {
                  await setDoc(settingsRef, {
                    ...DEFAULT_SETTINGS,
                    ...(setSnap.exists() ? setSnap.data() : {}),
                    KPAY_PHONE: '09753499023',
                    KPAY_NAME: 'Aung Khant Min',
                    WAVE_PHONE: '09680327601',
                    WAVE_NAME: 'Phyo ko Ko',
                  }, { merge: true });
                }
              } catch (cfgErr) {
                console.warn('Config sync note:', cfgErr);
              }
            }
            setUserProfile(data);
          }
        } catch (error) {
          console.warn('Error fetching user profile:', error);
        }
      } else {
        // If not logged in via Firebase Auth, check if user is logged in via phone & password in localStorage
        try {
          const stored = typeof window !== 'undefined' ? localStorage.getItem('xai_phone_user') : null;
          if (stored) {
            const { uid } = JSON.parse(stored);
            if (uid) {
              const snap = await getDoc(doc(db, 'users', uid));
              if (snap.exists()) {
                setUserProfile(snap.data() as UserProfile);
              }
            }
          } else {
            setUserProfile(null);
          }
        } catch (phoneErr) {
          console.warn('Phone auth session restore note:', phoneErr);
          setUserProfile(null);
        }
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [settings.WELCOME_BONUS]);

  // 3. Realtime User Profile Listener
  useEffect(() => {
    if (!currentUser) return;
    const userDocRef = doc(db, 'users', currentUser.uid);
    const unsub = onSnapshot(
      userDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setUserProfile(docSnap.data() as UserProfile);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
      }
    );
    return () => unsub();
  }, [currentUser]);

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

        if (data.status === 'rolling') {
          setIsRolling(true);
          setBettingOpen(false);
          setDice1(data.dice1);
          setDice2(data.dice2);
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

  // 7. Atomic Settlement Transition Handler across All Users
  const triggerGlobalSettlement = useCallback(async (activeRound: CurrentRoundData) => {
    try {
      await runTransaction(db, async (txn) => {
        const currentRef = doc(db, 'rounds', 'current');
        const snap = await txn.get(currentRef);
        if (!snap.exists()) return;

        const cur = snap.data() as CurrentRoundData;
        // Ensure state is still 'betting' and matching the round
        if (cur.status !== 'betting' || cur.roundId !== activeRound.roundId) return;

        const roll1 = Math.floor(Math.random() * 6) + 1;
        const roll2 = Math.floor(Math.random() * 6) + 1;
        const total = roll1 + roll2;
        const resClass = classifyDiceTotal(total);
        const now = Date.now();
        const nextRoundAt = now + 5000;

        txn.update(currentRef, {
          status: 'rolling',
          dice1: roll1,
          dice2: roll2,
          totalResult: total,
          resultClass: resClass,
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

      // Safeguard: Room catchup if browser was asleep for > 15s past deadline
      if (currentRoundDoc.status === 'betting' && now > currentRoundDoc.deadline + 15000) {
        triggerGlobalSettlement(currentRoundDoc);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [currentRoundDoc, soundEnabled, triggerGlobalNextRound, triggerGlobalSettlement]);

  // 10. Evaluate User Bets when Round Settles & Persist Settlement to Firestore
  useEffect(() => {
    if (!currentRoundDoc || currentRoundDoc.status !== 'rolling') return;
    if (lastProcessedSettledRoundRef.current === currentRoundDoc.roundId) return;

    lastProcessedSettledRoundRef.current = currentRoundDoc.roundId;

    const evaluateMyBets = async () => {
      const settledRoundId = currentRoundDoc.roundId;
      const total = currentRoundDoc.totalResult;
      const resClass = currentRoundDoc.resultClass;

      let totalWinnings = 0;
      let wonAny = false;

      const updatedBets = currentRoundBets.map((bet) => {
        let isWin = false;
        if (bet.betKind === 'size') {
          if (bet.selection === 'အသေး' && resClass === 'small') isWin = true;
          if (bet.selection === 'အကြီး' && resClass === 'big') isWin = true;
        } else if (bet.betKind === 'number') {
          if (Number(bet.selection) === total) isWin = true;
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

      // Write settled status to Firestore immediately so history updates permanently!
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

      if (wonAny && totalWinnings > 0) {
        sounds.playWin();
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#ffffff', '#cbd5e1', '#94a3b8'],
        });

        if (currentUser && userProfile) {
          try {
            const userDocRef = doc(db, 'users', currentUser.uid);
            await updateDoc(userDocRef, {
              balance: (userProfile.balance || 0) + totalWinnings,
              updatedAt: Date.now(),
            });
          } catch (e) {
            console.error('Error crediting winnings:', e);
          }
        }
      }

      setMyBetsHistory((prev) => [...updatedBets, ...prev].slice(0, 30));
      setCurrentRoundBets([]);
    };

    evaluateMyBets();
  }, [currentRoundBets, currentRoundDoc, currentUser, userProfile]);

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

  // Realtime Referral Members Listener for Current User
  useEffect(() => {
    if (!currentUser) return;

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

        // Keep local userProfile in sync with latest referral counts
        setUserProfile((prev) => {
          if (!prev) return null;
          if (
            prev.depositedReferralsCount !== depCount ||
            prev.referralTotalDeposits !== totalDep ||
            prev.referralsCount !== list.length
          ) {
            return {
              ...prev,
              depositedReferralsCount: depCount,
              referralTotalDeposits: totalDep,
              referralsCount: list.length,
            };
          }
          return prev;
        });
      },
      (err) => console.warn('Referral members listener note:', err)
    );

    return () => unsub();
  }, [currentUser]);

  // 12. Realtime Pending Deposits & Withdrawals for Admin
  useEffect(() => {
    const isUserAdmin = userProfile?.role === 'admin' || isAdminEmail(currentUser?.email);
    if (!isUserAdmin || !currentUser) return;

    const unsubDep = onSnapshot(
      collection(db, 'deposits'),
      (snapshot) => {
        const deps: DepositRequest[] = [];
        snapshot.forEach((d) => {
          const item = d.data() as DepositRequest;
          if (item.status === 'pending') {
            deps.push({ ...item, id: d.id });
          }
        });
        setPendingDeposits(deps);
      },
      (err) => console.warn('Deposits listener note:', err?.message || err)
    );

    const unsubWith = onSnapshot(
      collection(db, 'withdrawals'),
      (snapshot) => {
        const withs: WithdrawalRequest[] = [];
        snapshot.forEach((d) => {
          const item = d.data() as WithdrawalRequest;
          if (item.status === 'pending') {
            withs.push({ ...item, id: d.id });
          }
        });
        setPendingWithdrawals(withs);
      },
      (err) => console.warn('Withdrawals listener note:', err?.message || err)
    );

    const unsubBets = onSnapshot(
      collection(db, 'bets'),
      (snapshot) => {
        const bets: PlayerBet[] = [];
        snapshot.forEach((d) => bets.push(d.data() as PlayerBet));
        setAllBets(bets);
      },
      (err) => console.warn('Bets listener note:', err?.message || err)
    );

    return () => {
      unsubDep();
      unsubWith();
      unsubBets();
    };
  }, [currentUser, userProfile]);

  // 13. Realtime User's Own Withdrawals Listener (for rejection notes & daily limit)
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'withdrawals'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(25)
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: WithdrawalRequest[] = [];
        snapshot.forEach((d) => list.push({ ...(d.data() as WithdrawalRequest), id: d.id }));
        setUserWithdrawals(list);
      },
      (err) => console.warn('User withdrawals listener note:', err?.message || err)
    );
    return () => unsub();
  }, [currentUser]);

  // Place Bet Handler with Anti-Hedging Enforcement
  const handlePlaceBet = async (
    betKind: 'size' | 'number',
    selection: string,
    amount: number,
    multiplier: number
  ): Promise<boolean> => {
    if (!currentUser || !userProfile) {
      alert('လောင်းကြေးတင်ရန် အရင်ဆုံး Sign In ပြုလုပ်ပေးပါ။');
      return false;
    }

    if (userProfile.balance < amount) {
      alert('လက်ကျန်ငွေ မလုံလောက်ပါ။ ကျေးဇူးပြု၍ ငွေအရင်ဖြည့်သွင်းပါ။');
      return false;
    }

    // 0. Anti-Bot & Automation Detection (Reject headless browsers & scrapers)
    const botCheck = detectBotOrAutomation();
    if (botCheck.isBot) {
      alert(`⚠️ လုံခြုံရေးကာကွယ်မှု: အလိုအလျောက်ခေါ်ယူသော Bot သို့မဟုတ် Script ဖြစ်သဖြင့် ခွင့်မပြုပါ (${botCheck.reason})။`);
      return false;
    }

    // 1. Rate Limiting / Velocity Shield (Prevent superhuman flood attacks)
    const velocityCheck = verifyActionVelocity();
    if (!velocityCheck.allowed) {
      alert(`⚠️ ${velocityCheck.reason}`);
      return false;
    }

    // 2. Ephemeral Rolling Security Token (60-second strict TTL)
    const securityToken = generateEphemeralToken(currentUser.uid, 'bet');
    const tokenCheck = isTokenValid(securityToken, 'bet', currentUser.uid);
    if (!tokenCheck.valid) {
      alert(`⚠️ လုံခြုံရေး Token အမှား: ${tokenCheck.error}`);
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
        alert(
          'စည်းကမ်းသတိပေးချက်: အလှည့်တစ်ခုတည်းတွင် အကြီးရော အသေးပါ နှစ်ဖက်လုံးလောင်းခြင်း (Hedging) ကို တင်းကြပ်စွာ တားမြစ်ထားပါသည်။ ဤလောင်းကြေးကို လက်မခံပါ။'
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

      await setDoc(doc(db, 'bets', betId), newBet);
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
      console.error('Error placing bet:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      alert(`လောင်းကြေးတင်ခြင်း မအောင်မြင်ပါ (${errMsg.includes('permission') ? 'ခွင့်ပြုချက် မရရှိပါ' : 'ခေတ္တစောင့်ပြီး ပြန်လည်ကြိုးစားပါ'})။`);
      return false;
    }
  };

  const handleSubmitDeposit = async (
    amount: number,
    method: 'kpay' | 'wave',
    receiptImage: string
  ): Promise<boolean> => {
    if (!currentUser || !userProfile) return false;

    // 0. Anti-Bot & Automation Detection
    const botCheck = detectBotOrAutomation();
    if (botCheck.isBot) {
      alert(`⚠️ လုံခြုံရေးသတိပေးချက်: တရားမဝင် Bot ခေါ်ဆိုမှုဖြစ်သဖြင့် ငြင်းပယ်ပါသည် (${botCheck.reason})။`);
      return false;
    }

    // 1. Velocity Rate Limiting
    const velocityCheck = verifyActionVelocity();
    if (!velocityCheck.allowed) {
      alert(`⚠️ ${velocityCheck.reason}`);
      return false;
    }

    // 2. Ephemeral Security Token (Expires in 60s)
    const securityToken = generateEphemeralToken(currentUser.uid, 'deposit');
    const tokenCheck = isTokenValid(securityToken, 'deposit', currentUser.uid);
    if (!tokenCheck.valid) {
      alert(`⚠️ လုံခြုံရေး Token အမှား: ${tokenCheck.error}`);
      return false;
    }

    // 3. Forced Fresh Firebase Auth Token & Consume Token
    await enforceFreshAuthToken();
    await consumeSecurityToken(securityToken);

    if (receiptImage && receiptImage.length > 800_000) {
      alert('ငွေလွှဲပြေစာ ဓာတ်ပုံ ဖိုင်ဆိုဒ် ကြီးလွန်းနေပါသည်။ ကျေးဇူးပြု၍ ဓာတ်ပုံကို ပြန်လည်ရွေးချယ်ပေးပါ။');
      return false;
    }

    const depId = `dep_${Date.now()}`;
    const newDep: DepositRequest = {
      depositId: depId,
      userId: currentUser.uid,
      userName: userProfile.fullName,
      amount,
      method,
      receiptImage,
      status: 'pending',
      isFirstDeposit: !userProfile.hasSuccessfulDeposit,
      createdAt: Date.now(),
    };

    try {
      await setDoc(doc(db, 'deposits', depId), newDep);
      sounds.playWin();
      return true;
    } catch (err) {
      console.error('Deposit error:', err);
      alert('ငွေသွင်းတောင်းဆိုမှု မအောင်မြင်ပါ။ ပြန်လည်ကြိုးစားပေးပါ။');
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
      alert(`⚠️ လုံခြုံရေးသတိပေးချက်: တရားမဝင် Bot ခေါ်ဆိုမှုဖြစ်သဖြင့် ငြင်းပယ်ပါသည် (${botCheck.reason})။`);
      return false;
    }

    // 1. Velocity Rate Limiting
    const velocityCheck = verifyActionVelocity();
    if (!velocityCheck.allowed) {
      alert(`⚠️ ${velocityCheck.reason}`);
      return false;
    }

    // 2. Ephemeral Security Token (Expires in 60s)
    const securityToken = generateEphemeralToken(currentUser.uid, 'withdraw');
    const tokenCheck = isTokenValid(securityToken, 'withdraw', currentUser.uid);
    if (!tokenCheck.valid) {
      alert(`⚠️ လုံခြုံရေး Token အမှား: ${tokenCheck.error}`);
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
      alert(`⚠️ လုံခြုံရေးသတိပေးချက်: တရားမဝင် Bot ခေါ်ဆိုမှုဖြစ်သဖြင့် ငြင်းပယ်ပါသည် (${botCheck.reason})။`);
      return false;
    }

    // Ephemeral Security Token
    const securityToken = generateEphemeralToken(currentUser.uid, 'claim');
    if (!isTokenValid(securityToken, 'claim', currentUser.uid).valid) {
      alert('⚠️ လုံခြုံရေး Token သက်တမ်းကုန်ဆုံးသွားပါပြီ။');
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
      return true;
    } catch (e) {
      console.error('Transfer referral error:', e);
      return false;
    }
  };

  const handleApproveDeposit = async (
    depositId: string,
    userId: string,
    amount: number
  ): Promise<boolean> => {
    try {
      await updateDoc(doc(db, 'deposits', depositId), {
        status: 'approved',
        reviewedAt: Date.now(),
      });

      const userDocRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userDocRef);
      if (userSnap.exists()) {
        const u = userSnap.data() as UserProfile;
        const isFirst = !u.hasSuccessfulDeposit;
        // User rule: 5000 သွင်းပြီးမှ Bonus 2000 ပေးမည်
        const firstDepositBonus = (isFirst && amount >= 5000 && !u.firstDepositBonusClaimed) ? 2000 : 0;
        const creditAmount = amount + firstDepositBonus;

        await updateDoc(userDocRef, {
          balance: (u.balance || 0) + creditAmount,
          totalSuccessfulDeposit: (u.totalSuccessfulDeposit || 0) + amount,
          hasSuccessfulDeposit: true,
          firstDepositBonusClaimed: (isFirst && amount >= 5000) ? true : !!u.firstDepositBonusClaimed,
          updatedAt: Date.now(),
        });

        // Update Referrer Stats in Realtime
        if (u.referrerId) {
          try {
            const refDocRef = doc(db, 'users', u.referrerId);
            const refSnap = await getDoc(refDocRef);
            if (refSnap.exists()) {
              const refData = refSnap.data() as UserProfile;
              const newDepositedCount = isFirst
                ? (refData.depositedReferralsCount || 0) + 1
                : (refData.depositedReferralsCount || 0);
              const newTotalDeposits = (refData.referralTotalDeposits || 0) + amount;

              await updateDoc(refDocRef, {
                depositedReferralsCount: newDepositedCount,
                referralTotalDeposits: newTotalDeposits,
                updatedAt: Date.now(),
              });
            }
          } catch (err) {
            console.error('Error updating referrer deposit stats:', err);
          }
        }
      }
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const handleDeclineDeposit = async (depositId: string): Promise<boolean> => {
    try {
      await updateDoc(doc(db, 'deposits', depositId), {
        status: 'declined',
        reviewedAt: Date.now(),
      });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const handleApproveWithdrawal = async (
    withdrawalId: string,
    userId: string,
    amount: number
  ): Promise<boolean> => {
    try {
      await updateDoc(doc(db, 'withdrawals', withdrawalId), {
        status: 'approved',
        reviewedAt: Date.now(),
      });

      const userDocRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userDocRef);
      if (userSnap.exists()) {
        const u = userSnap.data() as UserProfile;
        await updateDoc(userDocRef, {
          withdrawalCount: (u.withdrawalCount || 0) + 1,
          wagerSinceLastWithdrawal: 0,
          updatedAt: Date.now(),
        });
      }
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const handleDeclineWithdrawal = async (
    withdrawalId: string,
    userId: string,
    amount: number,
    reason?: string
  ): Promise<boolean> => {
    try {
      await updateDoc(doc(db, 'withdrawals', withdrawalId), {
        status: 'declined',
        rejectionReason: reason || 'အကြောင်းပြချက် မဖော်ပြထားပါ',
        reviewedAt: Date.now(),
      });

      const userDocRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userDocRef);
      if (userSnap.exists()) {
        const u = userSnap.data() as UserProfile;
        await updateDoc(userDocRef, {
          balance: (u.balance || 0) + amount,
          updatedAt: Date.now(),
        });
      }
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const handleUpdateSettings = async (newSettings: GameSettings): Promise<boolean> => {
    try {
      await setDoc(doc(db, 'settings', 'config'), newSettings);
      setSettings(newSettings);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const handleGoogleSignIn = async () => {
    sounds.playChip();
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Google Sign In Error:', error);
      alert('Google Sign In မအောင်မြင်ပါ။ ပြန်လည်ကြိုးစားပါ။');
    }
  };

  const handlePhoneSignIn = async (
    phone: string,
    psw: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const cleanPhone = phone.trim().replace(/[^0-9]/g, '');
      if (!cleanPhone || cleanPhone.length < 7) {
        return { success: false, error: 'ဖုန်းနံပါတ် အပြည့်အစုံ မှန်ကန်စွာ ထည့်သွင်းပေးပါ' };
      }

      const syntheticEmail = `${cleanPhone}@phone.casino`;

      // 1. Authenticate with Firebase Auth directly (works on all domains including Vercel)
      const userCredential = await signInWithEmailAndPassword(auth, syntheticEmail, psw);
      const user = userCredential.user;

      // 2. Fetch or initialize User Profile in Firestore
      const userDocRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        setUserProfile(snap.data() as UserProfile);
      } else {
        const newProfile: UserProfile = {
          uid: user.uid,
          email: syntheticEmail,
          phoneNumber: cleanPhone,
          fullName: `Player ${cleanPhone.slice(-4)}`,
          role: 'user',
          balance: 0,
          referralBalance: 0,
          referralsCount: 0,
          totalBetCumulative: 0,
          totalSuccessfulDeposit: 0,
          withdrawalCount: 0,
          wagerSinceLastWithdrawal: 0,
          hasSuccessfulDeposit: false,
          isHedgingFlagged: false,
          cleanTurnoverRequired: 0,
          firstDepositBonusClaimed: false,
          promoClaimedReferrals: [],
          claimedMilestones: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await setDoc(userDocRef, newProfile);
        setUserProfile(newProfile);
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('xai_phone_user', JSON.stringify({ uid: user.uid, phone: cleanPhone }));
      }
      return { success: true };
    } catch (err: unknown) {
      console.error('Phone Sign In Error:', err);
      const errCode = (err as { code?: string })?.code;
      if (
        errCode === 'auth/user-not-found' ||
        errCode === 'auth/invalid-credential' ||
        errCode === 'auth/wrong-password' ||
        errCode === 'auth/invalid-email'
      ) {
        return {
          success: false,
          error: 'ဖုန်းနံပါတ် သို့မဟုတ် စကားဝှက် မှားယွင်းနေပါသည် (အကောင့်မရှိသေးပါက Sign Up ပြုလုပ်ပါ)',
        };
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : 'အကောင့်ဝင်ရောက်မှု မအောင်မြင်ပါ',
      };
    }
  };

  const handlePhoneSignUp = async (
    phone: string,
    psw: string,
    name: string,
    refCode?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const cleanPhone = phone.trim().replace(/[^0-9]/g, '');
      if (!cleanPhone || cleanPhone.length < 7) {
        return { success: false, error: 'ဖုန်းနံပါတ် အပြည့်အစုံ မှန်ကန်စွာ ထည့်သွင်းပေးပါ' };
      }

      const syntheticEmail = `${cleanPhone}@phone.casino`;

      // 1. Create genuine Firebase Auth User
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(auth, syntheticEmail, psw);
      } catch (authErr: unknown) {
        const errCode = (authErr as { code?: string })?.code;
        if (errCode === 'auth/email-already-in-use') {
          return {
            success: false,
            error: 'ဤဖုန်းနံပါတ်ဖြင့် အကောင့်ဖွင့်ပြီးဖြစ်ပါသည် (Login ဝင်ရောက်ပေးပါ)',
          };
        } else if (errCode === 'auth/weak-password') {
          return {
            success: false,
            error: 'စကားဝှက်သည် အနည်းဆုံး ၆ လုံး ရှိရပါမည်',
          };
        }
        throw authErr;
      }

      const user = userCredential.user;
      const referrerCandidate = refCode || urlReferralCode || null;

      // 2. Create User Profile document in Firestore under user.uid (allowed by security rules)
      const userDocRef = doc(db, 'users', user.uid);
      const newProfile: UserProfile = {
        uid: user.uid,
        email: syntheticEmail,
        phoneNumber: cleanPhone,
        fullName: name.trim(),
        role: 'user',
        balance: 0,
        referralBalance: 0,
        referralsCount: 0,
        referrerId: referrerCandidate,
        referralCode: referrerCandidate || undefined,
        totalBetCumulative: 0,
        totalSuccessfulDeposit: 0,
        withdrawalCount: 0,
        wagerSinceLastWithdrawal: 0,
        hasSuccessfulDeposit: false,
        isHedgingFlagged: false,
        cleanTurnoverRequired: 0,
        firstDepositBonusClaimed: false,
        promoClaimedReferrals: [],
        claimedMilestones: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await setDoc(userDocRef, newProfile);
      setUserProfile(newProfile);

      // 3. Credit referrer count if valid
      if (referrerCandidate && referrerCandidate !== user.uid) {
        try {
          const refDocRef = doc(db, 'users', referrerCandidate);
          const refSnap = await getDoc(refDocRef);
          if (refSnap.exists()) {
            const refData = refSnap.data() as UserProfile;
            await updateDoc(refDocRef, {
              referralsCount: (refData.referralsCount || 0) + 1,
              updatedAt: Date.now(),
            });
          }
        } catch (refErr) {
          console.warn('Referrer credit note:', refErr);
        }
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('xai_phone_user', JSON.stringify({ uid: user.uid, phone: cleanPhone }));
      }

      return { success: true };
    } catch (err: unknown) {
      console.error('Phone Sign Up Error:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'အကောင့်ဖွင့်ခြင်း မအောင်မြင်ပါ',
      };
    }
  };

  const handleSignOut = async () => {
    sounds.playChip();
    try {
      await signOut(auth);
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

  return (
    <main className="w-full min-h-screen bg-[#060a14] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(255,255,255,0.06),rgba(0,0,0,0))] text-white flex flex-col items-center justify-between pb-24 selection:bg-white/20 selection:text-white">
      {/* 2. Full-Screen Page View Router (ပင်မ, ဖိတ်ခေါ်မှု, ငွေသွင်း/ထုတ်, ပရိုဖိုင်) */}
      <div className={`w-full flex flex-col flex-1 mt-2 transition-all ${(selectedGame === 'lobby' || activeTab === 'referral' || activeTab === 'wallet' || activeTab === 'profile') ? 'max-w-4xl px-2 sm:px-4' : 'max-w-md'}`}>
        {/* VIEW 1: ပင်မ (Games Lobby or Full-Screen Game Arenas) */}
        {activeTab === 'home' && (
          <div className="w-full flex flex-col gap-3.5 animate-fadeIn pb-6">
            {/* LOBBY VIEW: VIP Header, Promo Carousel, Category Bar & 2-Column Game Posters */}
            {selectedGame === 'lobby' && (
              <div className="flex flex-col gap-3.5">
                {/* 1. TOP LUXURY VIP APP BAR */}
                <header className="w-full flex items-center justify-between py-2 px-3 sm:px-4 rounded-2xl bg-zinc-950/80 border border-white/10 backdrop-blur-2xl shadow-xl">
                  {/* Brand Wordmark */}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black shadow-md shrink-0">
                      <Crown className="w-4 h-4 fill-black stroke-black" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-black tracking-wider text-white uppercase font-sans leading-none">
                        X-SITE
                      </span>
                      <span className="text-[9px] font-bold tracking-widest text-amber-400 uppercase mt-0.5">
                        CASINO
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
                <div className="relative w-full rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-zinc-950 aspect-[16/8] sm:aspect-[16/7] md:aspect-[16/6]">
                  {/* Slide 1: Welcome Deposit Bonus */}
                  {promoIndex === 0 && (
                    <div className="relative w-full h-full flex flex-col justify-end p-4 sm:p-6 animate-fadeIn">
                      <img
                        src="/assets/casino/promo_deposit.jpg"
                        alt="Deposit Promotion"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
                      <div className="relative z-10 flex flex-col gap-1 max-w-lg">
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                          VIP WELCOME PROMOTION
                        </span>
                        <h2 className="text-sm sm:text-lg md:text-xl font-black text-white leading-tight">
                          ၅,၀၀၀ Ks သွင်းပါက +၂,၀၀၀ Ks အပိုဆု ရယူပါ
                        </h2>
                        <p className="text-[10px] sm:text-xs text-white/70 line-clamp-1">
                          KPay & Wave ဖြင့် ၂၄ နာရီ ငွေသွင်းငွေထုတ် လျင်မြန်စွာ ဆောင်ရွက်နိုင်သည်
                        </p>
                        <div className="pt-1.5">
                          <button
                            onClick={() => {
                              sounds.playChip();
                              setActiveTab('wallet');
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs active:scale-95 transition-all shadow-lg flex items-center gap-1.5 w-fit"
                          >
                            <span>အပိုဆု ရယူရန်</span>
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
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                          FEATURED MEGA SLOT
                        </span>
                        <h2 className="text-sm sm:text-lg md:text-xl font-black text-white leading-tight">
                          Charge Buffalo (ကျွဲရွှေ ၄,၀၉၆ Ways)
                        </h2>
                        <p className="text-[10px] sm:text-xs text-white/70 line-clamp-1">
                          Wild Multipliers ×2, ×3, ×5 နှင့် Free Spins အလှည့်တိုင်း အနိုင်ယူပါ
                        </p>
                        <div className="pt-1.5">
                          <button
                            onClick={() => {
                              sounds.playChip();
                              setSelectedGame('buffalo');
                            }}
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
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                          LIVE MULTIPLAYER
                        </span>
                        <h2 className="text-sm sm:text-lg md:text-xl font-black text-white leading-tight">
                          အံစာ 777 (Live Dice Lottery)
                        </h2>
                        <p className="text-[10px] sm:text-xs text-white/70 line-clamp-1">
                          စက္ကန့် ၆၀ တိုင်း အကြီး၊ အသေး၊ နံပါတ် ၇ ဆုကြေး ၃၂ ဆ အထိ
                        </p>
                        <div className="pt-1.5">
                          <button
                            onClick={() => {
                              sounds.playChip();
                              setSelectedGame('dice');
                            }}
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

                {/* 3. CATEGORY FILTER TABS */}
                <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl overflow-x-auto no-scrollbar">
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
                    အားလုံး (All)
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
                    စလော့ (Slots)
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
                    တိုက်ရိုက်အံစာ (Live Dice)
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
                    လူကြိုက်များ (Hot)
                  </button>
                </div>

                {/* 4. 2-COLUMN PORTRAIT GAME POSTERS (STAKE & PGSOFT STYLE) */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-5">
                  {/* GAME CARD 1: Charge Buffalo Slot */}
                  {(lobbyCategory === 'all' || lobbyCategory === 'slots' || lobbyCategory === 'hot') && (
                    <div
                      onClick={() => {
                        sounds.playChip();
                        setSelectedGame('buffalo');
                      }}
                      className="group relative rounded-2xl sm:rounded-3xl overflow-hidden aspect-[3/4] border border-amber-500/25 hover:border-amber-400/70 transition-all duration-300 shadow-2xl cursor-pointer active:scale-[0.98] bg-zinc-950 flex flex-col justify-between"
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
                          HOT
                        </span>
                        <span className="text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-amber-300 border border-amber-400/30">
                          4,096 Ways
                        </span>
                      </div>

                      {/* Hover / Tap Center Play Overlay */}
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40 backdrop-blur-xs">
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
                        <div className="flex items-center justify-between text-[10px] text-white/60 font-medium mt-0.5">
                          <span>PG-Style Slot</span>
                          <span className="text-amber-400 font-bold">×2, ×3, ×5</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* GAME CARD 2: Live Dice 777 */}
                  {(lobbyCategory === 'all' || lobbyCategory === 'dice' || lobbyCategory === 'hot') && (
                    <div
                      onClick={() => {
                        sounds.playChip();
                        setSelectedGame('dice');
                      }}
                      className="group relative rounded-2xl sm:rounded-3xl overflow-hidden aspect-[3/4] border border-emerald-500/25 hover:border-emerald-400/70 transition-all duration-300 shadow-2xl cursor-pointer active:scale-[0.98] bg-zinc-950 flex flex-col justify-between"
                    >
                      {/* Cover Art */}
                      <img
                        src="/assets/casino/dice_poster.jpg"
                        alt="Live Dice 777"
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="eager"
                      />

                      {/* Top Badges */}
                      <div className="relative z-10 p-2.5 sm:p-3 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500 text-black shadow-md">
                          <div className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                          <span className="text-[9px] sm:text-[10px] font-black uppercase">
                            LIVE
                          </span>
                        </div>
                        <span className="text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-emerald-300 border border-emerald-400/30">
                          ဆုကြေး 32×
                        </span>
                      </div>

                      {/* Hover / Tap Center Play Overlay */}
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40 backdrop-blur-xs">
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
                          အံစာဂိမ်း (Dice 777)
                        </span>
                        <div className="flex items-center justify-between text-[10px] text-white/60 font-medium mt-0.5">
                          <span>Live Multiplayer</span>
                          <span className="text-emerald-400 font-bold">စက္ကန့် ၆၀</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 5. LIVE RECENT WINS TICKER (SOCIAL PROOF) */}
                <div className="w-full py-2.5 px-3.5 rounded-2xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl flex items-center gap-2 overflow-hidden shadow-lg">
                  <div className="flex items-center gap-1.5 text-amber-400 shrink-0 font-black text-xs uppercase tracking-wide">
                    <Trophy className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span className="hidden sm:inline">တိုက်ရိုက်အနိုင်ဆုများ</span>
                  </div>
                  <div className="overflow-hidden whitespace-nowrap flex-1">
                    <div className="animate-marquee inline-block text-[11px] font-bold text-white/80">
                      <span className="mx-3 text-emerald-400">Player 09***581 · Charge Buffalo +Ks 36,000</span>
                      <span className="mx-2 text-white/30">•</span>
                      <span className="mx-3 text-amber-300">Player 09***419 · အံစာဂိမ်း +Ks 19,000</span>
                      <span className="mx-2 text-white/30">•</span>
                      <span className="mx-3 text-emerald-400">Player 09***882 · Charge Buffalo +Ks 50,000</span>
                      <span className="mx-2 text-white/30">•</span>
                      <span className="mx-3 text-cyan-300">Player 09***204 · အံစာဂိမ်း +Ks 8,000</span>
                      <span className="mx-2 text-white/30">•</span>
                      <span className="mx-3 text-emerald-400">Player 09***713 · Charge Buffalo +Ks 24,000</span>
                    </div>
                  </div>
                </div>

                {/* 6. TRUST & SERVICE BADGES */}
                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="p-2 rounded-xl bg-zinc-950/60 border border-white/5 flex flex-col items-center gap-1">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 stroke-[2]" />
                    <span className="text-[10px] font-bold text-white/80">စက္ကန့် ၃၀ ငွေသွင်း/ထုတ်</span>
                  </div>
                  <div className="p-2 rounded-xl bg-zinc-950/60 border border-white/5 flex flex-col items-center gap-1">
                    <Coins className="w-4 h-4 text-amber-400 stroke-[2]" />
                    <span className="text-[10px] font-bold text-white/80">အမြင့်ဆုံး ဆုကြေးများ</span>
                  </div>
                  <div className="p-2 rounded-xl bg-zinc-950/60 border border-white/5 flex flex-col items-center gap-1">
                    <Users className="w-4 h-4 text-cyan-400 stroke-[2]" />
                    <span className="text-[10px] font-bold text-white/80">၂၄ နာရီ ဝန်ဆောင်မှု</span>
                  </div>
                </div>
              </div>
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
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
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

                {/* Live Synchronized Round Header & Countdown Timer */}
                <div className="p-4 rounded-3xl dark-glass flex flex-col gap-2.5 border border-white/15">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-white/15 text-white border border-white/25 font-mono">
                        ပွဲစဉ် #{roundId}
                      </span>
                      <span className="text-xs font-black text-white flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                        {bettingOpen ? 'လောင်းကြေးဖွင့်လှစ်ထားပါသည်' : 'လောင်းကြေးပိတ်ပါပြီ'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 font-mono text-base font-black text-white">
                      <span className={timeLeft <= 10 ? 'animate-pulse text-white' : 'text-white'}>
                        {timeLeft}s
                      </span>
                    </div>
                  </div>

                  {/* Smooth Dark Glass Progress Bar */}
                  <div className="w-full bg-black/60 rounded-full h-2 overflow-hidden border border-white/15 p-0.5">
                    <div
                      className="h-full rounded-full bg-white transition-all duration-1000"
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
                onBackToLobby={() => setSelectedGame('lobby')}
                onGoToWallet={() => setActiveTab('wallet')}
                soundEnabled={soundEnabled}
                onToggleSound={() => {
                  const next = !soundEnabled;
                  setSoundEnabled(next);
                  sounds.enabled = next;
                }}
                onUpdateUserBalance={(newBal) => {
                  setUserProfile((prev) => (prev ? { ...prev, balance: newBal } : null));
                }}
              />
            )}
          </div>
        )}

        {/* VIEW 2: ဖိတ်ခေါ်မှု (Full-Screen Referral & Team Commission View) */}
        {activeTab === 'referral' && (
          <ReferralView
            user={userProfile || createFallbackUser(currentUser?.uid || 'guest', currentUser?.email || 'guest@gmail.com', currentUser?.displayName || 'မန်ဘာ')}
            settings={settings}
            referralMembers={referralMembers}
            onTransferReferral={handleTransferReferral}
            onClaimMilestone={handleClaimMilestone}
            onGoToWallet={() => setActiveTab('wallet')}
          />
        )}

        {/* VIEW 3: ငွေသွင်း/ထုတ် (Full-Screen Deposit, Withdrawal & Bank Binding View) */}
        {activeTab === 'wallet' && (
          <WalletView
            user={userProfile || createFallbackUser(currentUser?.uid || 'guest', currentUser?.email || 'guest@gmail.com', currentUser?.displayName || 'မန်ဘာ')}
            settings={settings}
            userWithdrawals={userWithdrawals}
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
          />
        )}

        {/* VIEW 4: ပရိုဖိုင် (Full-Screen User Profile & Comprehensive Betting History Records) */}
        {activeTab === 'profile' && (
          <ProfileView
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
          />
        )}
      </div>

      {/* 3. Persistent Bottom Main Navigation Menu (Hidden inside Buffalo Slot for full-screen immersive landscape) */}
      {selectedGame !== 'buffalo' && (
        <nav className="fixed bottom-0 inset-x-0 z-40 dark-glass border-t border-white/15 px-2 py-2 flex items-center justify-around max-w-md mx-auto shadow-2xl backdrop-blur-2xl">
          <button
            onClick={() => {
              sounds.playChip();
              setActiveTab('home');
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
              if (!userProfile) {
                setIsAuthModalOpen(true);
              } else {
                setActiveTab('wallet');
              }
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
        onGoogleSignIn={handleGoogleSignIn}
        onPhoneSignIn={handlePhoneSignIn}
        onPhoneSignUp={handlePhoneSignUp}
      />

      {/* Admin Panel Modal (for Magire34@gmail.com & primren685@gmail.com) */}
      {(userProfile?.role === 'admin' || isAdminEmail(currentUser?.email)) && (
        <AdminModal
          isOpen={isAdminOpen}
          onClose={() => setIsAdminOpen(false)}
          settings={settings}
          pendingDeposits={pendingDeposits}
          pendingWithdrawals={pendingWithdrawals}
          allBets={allBets}
          currentRound={null}
          onApproveDeposit={handleApproveDeposit}
          onDeclineDeposit={handleDeclineDeposit}
          onApproveWithdrawal={handleApproveWithdrawal}
          onDeclineWithdrawal={handleDeclineWithdrawal}
          onUpdateSettings={handleUpdateSettings}
          onTriggerRoll={() => currentRoundDoc && triggerGlobalSettlement(currentRoundDoc)}
        />
      )}
    </main>
  );
}

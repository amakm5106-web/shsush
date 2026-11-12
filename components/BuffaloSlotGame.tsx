'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, LoaderCircle, Wallet } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserProfile, GameSettings } from '@/lib/types';

const BRIDGE_CHANNEL = 'xsite.buffalo.v1';
const GAME_URL = '/games/buffalo/index.html';

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

interface BuffaloSpin {
  id: string;
  requestId: string;
  requestedStake: number;
  stake: number;
  charged: number;
  payout: number;
  balance: number;
  isFreeSpin: boolean;
  freeSpinsAwarded: number;
  freeSpinsRemaining: number;
  symbols: number[];
  winningCells: number[];
  scatterPositions: number[];
  multiplier: number;
  createdAt: number;
}

interface BuffaloApiResponse {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  balance?: number;
  walletBalance?: number;
  freeSpinsRemaining?: number;
  freeSpinStake?: number;
  displayName?: string;
  spin?: BuffaloSpin;
  state?: {
    balance: number;
    freeSpinsRemaining: number;
    freeSpinStake: number;
  };
}

interface PendingBuffaloSpin {
  userId: string;
  requestId: string;
  stake: number;
}

function pendingBuffaloSpinKey(userId: string) {
  return `shsush.buffalo.pending-spin.v1.${userId}`;
}

function canUseBuffaloPendingStorage() {
  const key = '__shsush_buffalo_pending_probe__';
  try {
    const previous = localStorage.getItem(key);
    localStorage.setItem(key, 'probe');
    if (localStorage.getItem(key) !== 'probe') return false;
    if (previous === null) {
      localStorage.removeItem(key);
      if (localStorage.getItem(key) !== null) return false;
    } else {
      localStorage.setItem(key, previous);
      if (localStorage.getItem(key) !== previous) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function readPendingBuffaloSpin(userId: string): { available: boolean; operation: PendingBuffaloSpin | null } {
  try {
    const raw = localStorage.getItem(pendingBuffaloSpinKey(userId));
    if (!raw) return { available: true, operation: null };
    const pending = JSON.parse(raw) as Partial<PendingBuffaloSpin>;
    if (
      pending.userId !== userId ||
      typeof pending.requestId !== 'string' ||
      !Number.isSafeInteger(pending.stake) ||
      Number(pending.stake) <= 0
    ) return { available: false, operation: null };
    return { available: true, operation: pending as PendingBuffaloSpin };
  } catch {
    return { available: false, operation: null };
  }
}

function savePendingBuffaloSpin(userId: string, pending: PendingBuffaloSpin | null): boolean {
  try {
    const key = pendingBuffaloSpinKey(userId);
    if (pending) {
      const serialized = JSON.stringify(pending);
      localStorage.setItem(key, serialized);
      return localStorage.getItem(key) === serialized;
    }
    localStorage.removeItem(key);
    return localStorage.getItem(key) === null;
  } catch {
    return false;
  }
}

interface CocosLotteryResult {
  ResultCode: number;
  ResultData?: {
    userscore: number;
    winscore: number;
    freeCount: number;
    viewarray: {
      nHandCards: number[];
      freeAnim: number[];
      nWinCards: number[];
      nWinLinesDetail: number[][];
      fMultiple: number;
      getFreeTime: { bFlag: boolean; nFreeTime: number };
      freeSpCardPos: number[];
      coinCardList: unknown[];
    };
  };
}

function buildCocosResult(spin: BuffaloSpin): CocosLotteryResult {
  return {
    ResultCode: 1,
    ResultData: {
      userscore: spin.balance,
      winscore: spin.payout,
      freeCount: spin.freeSpinsRemaining,
      viewarray: {
        nHandCards: spin.symbols,
        freeAnim: [0, 1, 2, 3, 4],
        nWinCards: spin.winningCells,
        nWinLinesDetail: [],
        fMultiple: Math.max(1, spin.multiplier || (spin.stake > 0 ? spin.payout / spin.stake : 1)),
        getFreeTime: {
          bFlag: spin.freeSpinsAwarded > 0,
          nFreeTime: spin.freeSpinsAwarded,
        },
        freeSpCardPos: spin.scatterPositions,
        coinCardList: [],
      },
    },
  };
}

export function BuffaloSlotGame({
  user,
  onBackToLobby,
  onGoToWallet,
  onUpdateUserBalance,
  onRequireAuth,
}: BuffaloSlotGameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const userRef = useRef(user);
  const callbacksRef = useRef({ onBackToLobby, onGoToWallet, onUpdateUserBalance, onRequireAuth });
  const childReadyRef = useRef(false);
  const pendingSpinsRef = useRef(new Set<string>());
  const pendingSpinOperationRef = useRef<PendingBuffaloSpin | null>(null);
  const [balance, setBalance] = useState(user?.balance || 0);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(user));
  const [notice, setNotice] = useState('');

  useEffect(() => {
    userRef.current = user;
    callbacksRef.current = { onBackToLobby, onGoToWallet, onUpdateUserBalance, onRequireAuth };
  }, [user, onBackToLobby, onGoToWallet, onUpdateUserBalance, onRequireAuth]);

  const postToGame = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({ channel: BRIDGE_CHANNEL, ...message }, '*');
  }, []);

  const applyWallet = useCallback((nextBalance: number, freeSpinsRemaining = 0, type: 'wallet:init' | 'wallet:update' = 'wallet:update') => {
    const safeBalance = Number.isSafeInteger(nextBalance) && nextBalance >= 0 ? nextBalance : 0;
    setBalance(safeBalance);
    postToGame({
      type,
      balance: safeBalance,
      freeSpinsRemaining: Math.max(0, Math.trunc(freeSpinsRemaining || 0)),
      displayName: userRef.current?.fullName || 'Player',
    });
  }, [postToGame]);

  const refreshWallet = useCallback(async () => {
    try {
      const response = await fetch('/api/buffalo/state', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const data = (await response.json()) as BuffaloApiResponse;
      if (!response.ok || !data.success) {
        setIsAuthenticated(false);
        applyWallet(0, 0, 'wallet:init');
        if (response.status === 401) setNotice('ကစားရန် အကောင့်ဝင်ပါ။');
        return;
      }
      setIsAuthenticated(true);
      setNotice('');
      applyWallet(data.state?.balance || 0, data.state?.freeSpinsRemaining || 0, 'wallet:init');
    } catch {
      setNotice('Wallet ချိတ်ဆက်မှု မရနိုင်ပါ။ အင်တာနက်ကို စစ်ဆေးပြီး ပြန်ဖွင့်ပါ။');
      applyWallet(userRef.current?.balance || 0, 0, 'wallet:init');
    }
  }, [applyWallet]);

  const recordVisibleBet = useCallback(async (spin: BuffaloSpin, expectedUserId: string) => {
    const currentUser = userRef.current;
    if (!currentUser?.uid || currentUser.uid !== expectedUserId || !spin.id) return;
    const createdAt = Number(spin.createdAt) || Date.now();
    const docId = `buffalo_${spin.id}`;
    try {
      await setDoc(doc(db, 'bets', docId), {
        id: docId,
        betId: docId,
        roundId: createdAt,
        userId: currentUser.uid,
        userName: currentUser.fullName || 'Player',
        betKind: 'slot',
        selection: 'Buffalo',
        amount: spin.charged,
        multiplier: spin.charged > 0 ? spin.payout / spin.charged : spin.multiplier || 1,
        status: spin.payout > 0 ? 'win' : 'loss',
        payout: spin.payout,
        profit: spin.payout - spin.charged,
        result: spin.payout > 0 ? 'win' : 'loss',
        createdAt,
        settledAt: createdAt,
      });
    } catch (error) {
      // Turso is the authoritative financial ledger; this copy only feeds the existing lobby history.
      console.error('Buffalo visible history mirror failed:', error);
    }
  }, []);

  const handleSpinRequest = useCallback(async (requestId: string, stake: number) => {
    if (!requestId || pendingSpinsRef.current.has(requestId)) return;
    const userId = userRef.current?.uid || '';
    if (!userId) {
      setIsAuthenticated(false);
      setNotice('ကစားရန် အကောင့်ဝင်ပါ။');
      callbacksRef.current.onRequireAuth?.();
      postToGame({ type: 'spin-error', requestId, code: 'UNAUTHENTICATED', message: 'ကစားရန် အကောင့်ဝင်ပါ။' });
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.locks?.request) {
      setNotice('ဤ browser တွင် လုံခြုံသော tab-lock မရနိုင်ပါ။ Browser ကို update လုပ်ပြီး ပြန်စမ်းပါ။');
      postToGame({
        type: 'spin-error',
        requestId,
        code: 'CROSS_TAB_LOCK_UNAVAILABLE',
        message: 'လုံခြုံသော spin lock မရနိုင်သဖြင့် ငွေမဖြတ်ထားပါ။',
      });
      return;
    }
    if (!canUseBuffaloPendingStorage()) {
      setNotice('Spin ကို လုံခြုံစွာပြန်စစ်ရန် browser storage မရနိုင်ပါ။ Setting ကိုဖွင့်ပြီး ပြန်စမ်းပါ။');
      postToGame({
        type: 'spin-error',
        requestId,
        code: 'PENDING_STORAGE_UNAVAILABLE',
        message: 'လောင်းကြေးလုံခြုံမှုအတွက် browser storage လိုအပ်ပါသည်။',
      });
      return;
    }
    pendingSpinsRef.current.add(requestId);

    const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
    const submitSpin = async (operation: PendingBuffaloSpin, previouslyAmbiguous = false): Promise<{
      response: Response | null;
      data: BuffaloApiResponse;
      networkError: boolean;
      uncertain: boolean;
    }> => {
      let uncertain = previouslyAmbiguous;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 7_500);
        try {
          const response = await fetch('/api/buffalo/spin', {
            method: 'POST',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: operation.userId, requestId: operation.requestId, stake: operation.stake }),
            signal: controller.signal,
          });
          const payload: unknown = await response.json().catch(() => null);
          const data = payload && typeof payload === 'object' ? payload as BuffaloApiResponse : {};
          if (response.ok && data.success && data.spin) {
            return { response, data, networkError: false, uncertain };
          }
          if (response.status >= 500 || response.ok) {
            uncertain = true;
            if (attempt < 2) {
              await wait(350 * (attempt + 1));
              continue;
            }
          }
          return { response, data, networkError: false, uncertain };
        } catch {
          uncertain = true;
          if (attempt === 2) return { response: null, data: {}, networkError: true, uncertain };
          await wait(350 * (attempt + 1));
        } finally {
          window.clearTimeout(timeout);
        }
      }
      return { response: null, data: {}, networkError: true, uncertain: true };
    };

    const savePending = (operation: PendingBuffaloSpin) => {
      if (!operation.userId || !savePendingBuffaloSpin(operation.userId, operation)) return false;
      pendingSpinOperationRef.current = operation;
      return true;
    };
    const clearPending = (operation: PendingBuffaloSpin) => {
      if (!operation.userId || !savePendingBuffaloSpin(operation.userId, null)) return false;
      if (
        pendingSpinOperationRef.current?.requestId === operation.requestId &&
        pendingSpinOperationRef.current.userId === operation.userId
      ) {
        pendingSpinOperationRef.current = null;
      }
      return true;
    };
    const applySettledSpin = (
      spin: BuffaloSpin,
      expectedUserId: string,
      walletBalance = spin.balance,
      notifyRequestId?: string,
    ) => {
      if (userRef.current?.uid !== expectedUserId) return;
      const safeWalletBalance = Number.isSafeInteger(walletBalance) && walletBalance >= 0 ? walletBalance : spin.balance;
      setIsAuthenticated(true);
      setNotice('');
      applyWallet(safeWalletBalance, spin.freeSpinsRemaining);
      callbacksRef.current.onUpdateUserBalance?.(safeWalletBalance);
      void recordVisibleBet(spin, expectedUserId);
      if (notifyRequestId) {
        postToGame({
          type: 'spin-result',
          requestId: notifyRequestId,
          result: buildCocosResult({ ...spin, balance: safeWalletBalance }),
        });
      }
    };
    const runSpinUnderLock = async () => {
      try {
        if (userRef.current?.uid !== userId) {
          postToGame({ type: 'spin-error', requestId, code: 'SESSION_MISMATCH', message: 'အကောင့်ပြောင်းလဲသွားပါသည်။' });
          return;
        }
        const savedPending = readPendingBuffaloSpin(userId);
        if (!savedPending.available) {
          setNotice('ယခင် spin မှတ်တမ်းကို မဖတ်နိုင်ပါ။ ငွေမဖြတ်မီ Browser storage ကို စစ်ဆေးပါ။');
          postToGame({
            type: 'spin-error',
            requestId,
            code: 'PENDING_STORAGE_UNAVAILABLE',
            message: 'ယခင်လှည့်မှုကို စစ်ဆေးမပြီးမချင်း လောင်းကြေးအသစ် မတင်ပါ။',
          });
          return;
        }
        let unresolved = savedPending.operation;
        if (!unresolved && pendingSpinOperationRef.current?.userId === userId) {
          pendingSpinOperationRef.current = null;
        }
        if (unresolved) pendingSpinOperationRef.current = unresolved;

        if (unresolved) {
          pendingSpinOperationRef.current = unresolved;
          if (unresolved.requestId === requestId && unresolved.stake !== stake) {
            postToGame({ type: 'spin-error', requestId, code: 'IDEMPOTENCY_CONFLICT', message: 'အရင်လှည့်မှုကို စစ်ဆေးနေပါသည်။' });
            return;
          }

          const isSameRequest = unresolved.requestId === requestId;
          const recovery = await submitSpin(unresolved, true);
          if (recovery.response && recovery.data.success && recovery.data.spin) {
            clearPending(unresolved);
            const canShowRecoveredSpin = isSameRequest;
            applySettledSpin(
              recovery.data.spin,
              unresolved.userId,
              recovery.data.walletBalance,
              canShowRecoveredSpin ? requestId : undefined,
            );
            if (!canShowRecoveredSpin) {
              setNotice('အရင်လှည့်မှုကို ပြန်စစ်ပြီးပါပြီ။ ယခု spin အသစ် မတင်ထားပါ—လက်ကျန်စစ်ပြီး ထပ်နှိပ်ပါ။');
              postToGame({
                type: 'spin-error',
                requestId,
                code: 'PREVIOUS_SPIN_RECOVERED',
                message: 'အရင်လှည့်မှုကို အတည်ပြုပြီးပါပြီ။ ယခုလှည့်မှုအတွက် ငွေမဖြတ်ထားပါ။ ထပ်မံနှိပ်ပါ။',
                balance: recovery.data.walletBalance ?? recovery.data.spin.balance,
                freeSpinsRemaining: recovery.data.spin.freeSpinsRemaining,
              });
            }
            return;
          } else {
            const status = recovery.response?.status;
            if (status === 401) {
              setIsAuthenticated(false);
              callbacksRef.current.onRequireAuth?.();
              setNotice('အရင်လှည့်မှုကို စစ်ဆေးရန် အကောင့်ဝင်ပါ။');
            } else {
              setNotice('အရင်လှည့်မှုရလဒ်ကို အတည်ပြုနေဆဲပါ။ Wallet ကို စစ်ဆေးပြီးမှ ပြန်ကြိုးစားပါ။');
            }
            postToGame({
              type: 'spin-error',
              requestId,
              code: 'PREVIOUS_SPIN_UNRESOLVED',
              message: 'အရင်လှည့်မှုကို အတည်မပြုမချင်း နောက်ထပ်ငွေမဖြတ်ပါ။ ခဏကြာပြီး ပြန်ကြိုးစားပါ။',
            });
            return;
          }
        }

        const operation: PendingBuffaloSpin = { userId, requestId, stake };
        if (!savePending(operation)) {
          setNotice('Spin လောင်းကြေးအခြေအနေကို သိမ်း၍မရပါ။ ငွေမဖြတ်ထားပါ—Browser setting ကိုစစ်ပြီး ပြန်စမ်းပါ။');
          postToGame({
            type: 'spin-error',
            requestId,
            code: 'PENDING_STORAGE_UNAVAILABLE',
            message: 'ငွေမဖြတ်ထားပါ။ Browser storage မရနိုင်သဖြင့် ပြန်စမ်းပါ။',
          });
          return;
        }
        const attempt = await submitSpin(operation);
        if (attempt.response && attempt.data.success && attempt.data.spin) {
          clearPending(operation);
          applySettledSpin(attempt.data.spin, operation.userId, attempt.data.walletBalance, requestId);
          return;
        }

        const response = attempt.response;
        const data = attempt.data;
        if (
          response &&
          [400, 401, 402, 403].includes(response.status) &&
          !attempt.uncertain
        ) clearPending(operation);
        if (userRef.current?.uid !== operation.userId) {
          setNotice('အကောင့်ပြောင်းလဲသွားပါသည်။ ယခင် spin အခြေအနေကို ထပ်စစ်ဆေးပါ။');
          postToGame({
            type: 'spin-error',
            requestId,
            code: 'SESSION_MISMATCH',
            message: 'အကောင့်ပြောင်းလဲသွားပါသည်။ လက်ကျန်ကို စစ်ဆေးပါ။',
          });
          return;
        }
        if (typeof data.balance === 'number') {
          applyWallet(data.balance, data.freeSpinsRemaining || 0);
          callbacksRef.current.onUpdateUserBalance?.(data.balance);
        }
        if (response?.status === 401 || data.code === 'UNAUTHENTICATED') {
          setIsAuthenticated(false);
          callbacksRef.current.onRequireAuth?.();
          setNotice('ကစားရန် အကောင့်ဝင်ပါ။');
        } else if (response?.status === 402 || data.code === 'INSUFFICIENT_FUNDS') {
          setNotice('MMK လက်ကျန် မလုံလောက်ပါ။ ပိုက်ဆံအိတ်ကို စစ်ဆေးပါ။');
          callbacksRef.current.onBackToLobby();
          callbacksRef.current.onGoToWallet();
        } else {
          setNotice(attempt.networkError
            ? 'တုံ့ပြန်ချက် မရသေးပါ။ အရင်လှည့်မှုကို ထပ်မံစစ်ဆေးပြီးမှ နောက်ထပ်ငွေဖြတ်ပါမည်။'
            : data.error || data.message || 'လှည့်မှုကို မပြီးမြောက်နိုင်ပါ။ ပြန်ကြိုးစားပါ။');
        }
        postToGame({
          type: 'spin-error',
          requestId,
          code: data.code || (attempt.networkError ? 'SETTLEMENT_UNCERTAIN' : 'SPIN_FAILED'),
          message: data.error || data.message || 'Wallet response မရောက်သေးပါ။ အရင်လှည့်မှုကို စစ်ဆေးပြီးမှ နောက်ထပ်ငွေဖြတ်ပါမည်။',
          balance: data.balance,
          freeSpinsRemaining: data.freeSpinsRemaining,
        });
      } finally {
        pendingSpinsRef.current.delete(requestId);
      }
    };

    let lockAcquired = false;
    try {
      await navigator.locks.request(`shsush.buffalo.spin.${userId}`, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (!lock) return;
        lockAcquired = true;
        await runSpinUnderLock();
      });
      if (!lockAcquired) {
        pendingSpinsRef.current.delete(requestId);
        setNotice('အခြား tab တွင် Buffalo spin လုပ်နေပါသည်။ ပြီးဆုံးပြီးမှ ထပ်နှိပ်ပါ။');
        postToGame({
          type: 'spin-error',
          requestId,
          code: 'SPIN_IN_PROGRESS',
          message: 'အခြား tab တွင်လှည့်မှုရှိနေပါသည်။ ခဏစောင့်ပြီး ပြန်နှိပ်ပါ။',
        });
      }
    } catch {
      pendingSpinsRef.current.delete(requestId);
      setNotice('Spin lock မရနိုင်ပါ။ ငွေမဖြတ်ထားပါ—Browser ကိုစစ်ပြီး ပြန်စမ်းပါ။');
      postToGame({
        type: 'spin-error',
        requestId,
        code: 'CROSS_TAB_LOCK_UNAVAILABLE',
        message: 'Spin lock မရနိုင်သဖြင့် ငွေမဖြတ်ထားပါ။',
      });
    }
  }, [applyWallet, postToGame, recordVisibleBet]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const child = iframeRef.current?.contentWindow;
      if (!child || event.source !== child || event.origin !== 'null') return;
      const message = event.data as Record<string, unknown> | null;
      if (!message || message.channel !== BRIDGE_CHANNEL) return;

      if (message.type === 'ready') {
        childReadyRef.current = true;
        setIsLoading(false);
        void refreshWallet();
      } else if (message.type === 'spin') {
        const requestId = typeof message.requestId === 'string' ? message.requestId : '';
        const stake = Number(message.stake);
        if (!Number.isSafeInteger(stake) || stake <= 0) {
          postToGame({ type: 'spin-error', requestId, code: 'INVALID_BET', message: 'လောင်းကြေး မမှန်ကန်ပါ။' });
          return;
        }
        void handleSpinRequest(requestId, stake);
      } else if (message.type === 'exit') {
        callbacksRef.current.onBackToLobby();
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleSpinRequest, postToGame, refreshWallet]);

  useEffect(() => {
    if (!childReadyRef.current) return;
    // The authenticated server state is canonical; never overwrite it with a cached profile balance.
    void refreshWallet();
  }, [user?.uid, refreshWallet]);

  const handleIframeLoad = () => {
    setIsLoading(false);
    // The child also announces readiness. This request covers browsers that load it first.
    void refreshWallet();
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-black" aria-label="Buffalo slot game">
      <iframe
        ref={iframeRef}
        src={GAME_URL}
        title="Buffalo slot game"
        className="absolute inset-0 h-full w-full border-0 bg-black"
        sandbox="allow-scripts allow-pointer-lock"
        allow="autoplay; fullscreen"
        allowFullScreen
        onLoad={handleIframeLoad}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-2 pt-[max(.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onBackToLobby}
          className="pointer-events-auto inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-black/65 px-3 text-xs font-bold text-white shadow-lg backdrop-blur-md"
          aria-label="Lobby သို့ပြန်သွားရန်"
        >
          <ArrowLeft size={16} />
          <span>Lobby</span>
        </button>

        <button
          type="button"
          onClick={() => {
            callbacksRef.current.onBackToLobby();
            callbacksRef.current.onGoToWallet();
          }}
          className="pointer-events-auto inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-300/30 bg-black/70 px-3 text-xs font-bold text-amber-100 shadow-lg backdrop-blur-md"
          aria-label="MMK wallet ဖွင့်ရန်"
        >
          <Wallet size={15} />
          <span>{balance.toLocaleString()} MMK</span>
        </button>
      </div>

      {isLoading && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/50">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/75 px-5 py-4 text-sm font-semibold text-white backdrop-blur-md">
            <LoaderCircle className="animate-spin" size={18} />
            <span>Buffalo ဂိမ်းကို ဖွင့်နေပါသည်...</span>
          </div>
        </div>
      )}

      {notice && (
        <div className="absolute bottom-3 left-1/2 z-40 flex max-w-[min(92vw,520px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-amber-200/25 bg-black/85 px-4 py-3 text-center text-xs font-semibold text-amber-50 shadow-xl backdrop-blur-md">
          <span>{notice}</span>
          {!isAuthenticated && (
            <button
              type="button"
              onClick={() => callbacksRef.current.onRequireAuth?.()}
              className="shrink-0 rounded-lg bg-amber-300 px-3 py-2 font-black text-black"
            >
              အကောင့်ဝင်ရန်
            </button>
          )}
        </div>
      )}
    </div>
  );
}

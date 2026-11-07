import {
  doc,
  getDoc,
  runTransaction,
  collection,
  query,
  where,
  getDocs,
  setDoc,
  Firestore,
} from 'firebase/firestore';
import { CurrentRoundData, PlayerBet } from '@/lib/types';
import { classifyDiceTotal, classifyDiceColor } from '@/lib/constants';

/**
 * Auto-Win Lowest Liability Dice Roll Calculator
 * Evaluates all active bets placed in the round across Small (အသေး), Big (အကြီး),
 * Common 7 (ဘုံအများဆုံး ၇), specific numbers 2-12, and 3 colors (Red, Green, Violet).
 * Automatically selects the outcome with the lowest total payout liability (zero or minimal payout)
 * so that the house auto-wins with maximum profit!
 */
export function calculateAutoWinRoll(activeBets: PlayerBet[]): {
  roll1: number;
  roll2: number;
  total: number;
} {
  if (!activeBets || activeBets.length === 0) {
    const roll1 = Math.floor(Math.random() * 6) + 1;
    const roll2 = Math.floor(Math.random() * 6) + 1;
    return { roll1, roll2, total: roll1 + roll2 };
  }

  const candidates: {
    total: number;
    payout: number;
    winningStake: number;
    rolls: [number, number][];
  }[] = [];

  for (let t = 2; t <= 12; t++) {
    const validRolls: [number, number][] = [];
    for (let d1 = 1; d1 <= 6; d1++) {
      const d2 = t - d1;
      if (d2 >= 1 && d2 <= 6) {
        validRolls.push([d1, d2]);
      }
    }

    const tClass = classifyDiceTotal(t);
    const tColor = classifyDiceColor(t);

    let sumPayout = 0;
    let sumWinningStake = 0;

    for (const bet of activeBets) {
      let won = false;
      if (bet.betKind === 'size') {
        if (bet.selection === 'အသေး' && tClass === 'small') won = true;
        if (bet.selection === 'အကြီး' && tClass === 'big') won = true;
      } else if (bet.betKind === 'number') {
        if (Number(bet.selection) === t) won = true;
      } else if (bet.betKind === 'color') {
        if (bet.selection === tColor) won = true;
      }

      if (won) {
        sumPayout += Math.round(bet.amount * (bet.multiplier || 1.9));
        sumWinningStake += bet.amount;
      }
    }

    candidates.push({
      total: t,
      payout: sumPayout,
      winningStake: sumWinningStake,
      rolls: validRolls,
    });
  }

  // 1. Pick candidate(s) that minimize player payout (lowest liability for auto house win)
  const minPayout = Math.min(...candidates.map((c) => c.payout));
  let bestCandidates = candidates.filter((c) => c.payout === minPayout);

  // 2. Secondary tie-breaker: Pick candidates with minimum player bet stake on them
  const minStake = Math.min(...bestCandidates.map((c) => c.winningStake));
  bestCandidates = bestCandidates.filter((c) => c.winningStake === minStake);

  // 3. Random choice among best candidates for natural dice combination distribution
  const chosen = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
  const chosenRoll = chosen.rolls[Math.floor(Math.random() * chosen.rolls.length)];

  return {
    roll1: chosenRoll[0],
    roll2: chosenRoll[1],
    total: chosen.total,
  };
}

/**
 * Autonomous 24/7 Round Progression Engine
 * Guarantees rounds advance continuously every 60 seconds whether players are online or offline.
 * If clients were away overnight, it automatically calculates elapsed cycles and fast-forwards
 * to the exact real-time active round ID without missing a beat!
 */
let cachedRoundState: { data: CurrentRoundData; fetchedAt: number } | null = null;
let quotaCooldownUntil = 0;
let lastQuotaWarnTime = 0;

export async function tickRoundSystem(db: Firestore, durationSeconds: number = 60) {
  const now = Date.now();
  // If Firestore read quota was exhausted, back off until cooldown expires to avoid spamming
  if (now < quotaCooldownUntil) {
    return;
  }

  try {
    // In-memory read throttle: if round is in mid-betting and not near deadline, skip Firestore getDoc to conserve quota
    if (
      cachedRoundState &&
      now - cachedRoundState.fetchedAt < 15000 &&
      cachedRoundState.data.status === 'betting' &&
      now < cachedRoundState.data.deadline - 4000
    ) {
      return;
    }

    const currentRef = doc(db, 'rounds', 'current');
    const snap = await getDoc(currentRef);
    const durationMs = durationSeconds * 1000;

    if (!snap.exists()) {
      const initialRound: CurrentRoundData = {
        roundId: 101,
        status: 'betting',
        openedAt: now,
        durationSeconds,
        deadline: now + durationMs,
        dice1: 3,
        dice2: 4,
        totalResult: 7,
        resultClass: 'common',
        resultColor: 'violet',
        settledAt: now,
        nextRoundAt: now,
        updatedAt: now,
      };
      await setDoc(currentRef, initialRound);
      cachedRoundState = { data: initialRound, fetchedAt: now };
      return;
    }

    const cur = snap.data() as CurrentRoundData;
    cachedRoundState = { data: cur, fetchedAt: now };
    const roundDuration = cur.durationSeconds || durationSeconds;
    const roundDurationMs = roundDuration * 1000;

    if (cur.status === 'betting') {
      const elapsedSinceOpen = now - cur.openedAt;
      const roundsPassed = Math.floor(elapsedSinceOpen / roundDurationMs);

      // A: Normal deadline reached (1 cycle)
      if (now >= cur.deadline && roundsPassed <= 1) {
        // Read active bets for this round to run lowest-pool Auto-Win algorithm
        const activeBets: PlayerBet[] = [];
        try {
          const betsQuery = query(collection(db, 'bets'), where('roundId', '==', cur.roundId));
          const betsSnap = await getDocs(betsQuery);
          betsSnap.forEach((d) => activeBets.push(d.data() as PlayerBet));
        } catch (err) {
          console.warn('Active bets pool read note:', err);
        }

        const autoRoll = calculateAutoWinRoll(activeBets);
        const roll1 = autoRoll.roll1;
        const roll2 = autoRoll.roll2;
        const total = autoRoll.total;
        const resClass = classifyDiceTotal(total);
        const resColor = classifyDiceColor(total);

        await runTransaction(db, async (txn) => {
          const freshSnap = await txn.get(currentRef);
          if (!freshSnap.exists()) return;
          const freshCur = freshSnap.data() as CurrentRoundData;
          if (freshCur.status !== 'betting' || freshCur.roundId !== cur.roundId) return;

          txn.update(currentRef, {
            status: 'rolling',
            dice1: roll1,
            dice2: roll2,
            totalResult: total,
            resultClass: resClass,
            resultColor: resColor,
            settledAt: now,
            nextRoundAt: now + 5000,
            updatedAt: now,
          });

          const historyRef = doc(db, 'round_history', `round_${cur.roundId}`);
          txn.set(historyRef, {
            roundId: cur.roundId,
            status: 'settled',
            openedAt: cur.openedAt,
            durationSeconds: roundDuration,
            dice1: roll1,
            dice2: roll2,
            totalResult: total,
            resultClass: resClass,
            resultColor: resColor,
            settledAt: now,
          });
        });
      } else if (roundsPassed > 1) {
        // B: Overnight Multi-Round Time Fast-Forward Catchup!
        const targetRoundId = cur.roundId + roundsPassed;
        const targetOpenedAt = cur.openedAt + (roundsPassed * roundDurationMs);
        const targetDeadline = targetOpenedAt + roundDurationMs;
        const remainingSeconds = Math.max(0, Math.ceil((targetDeadline - now) / 1000));
        const targetStatus = remainingSeconds <= 5 ? 'rolling' : 'betting';

        const roll1 = Math.floor(Math.random() * 6) + 1;
        const roll2 = Math.floor(Math.random() * 6) + 1;
        const total = roll1 + roll2;
        const resClass = classifyDiceTotal(total);
        const resColor = classifyDiceColor(total);

        const historyRef = doc(db, 'round_history', `round_${cur.roundId}`);
        await setDoc(historyRef, {
          roundId: cur.roundId,
          status: 'settled',
          openedAt: cur.openedAt,
          durationSeconds: roundDuration,
          dice1: roll1,
          dice2: roll2,
          totalResult: total,
          resultClass: resClass,
          resultColor: resColor,
          settledAt: cur.openedAt + roundDurationMs,
        });

        await runTransaction(db, async (txn) => {
          const freshSnap = await txn.get(currentRef);
          if (!freshSnap.exists()) return;
          const freshCur = freshSnap.data() as CurrentRoundData;
          if (freshCur.roundId > cur.roundId) return;

          txn.update(currentRef, {
            roundId: targetRoundId,
            status: targetStatus,
            openedAt: targetOpenedAt,
            durationSeconds: roundDuration,
            deadline: targetDeadline,
            dice1: roll1,
            dice2: roll2,
            totalResult: total,
            resultClass: resClass,
            resultColor: resColor,
            settledAt: now,
            nextRoundAt: targetStatus === 'rolling' ? targetDeadline : now,
            updatedAt: now,
          });
        });
      }
    } else if (cur.status === 'rolling') {
      const elapsedSinceOpen = now - cur.openedAt;
      const roundsPassed = Math.floor(elapsedSinceOpen / roundDurationMs);

      if (now >= cur.nextRoundAt && roundsPassed <= 1) {
        await runTransaction(db, async (txn) => {
          const freshSnap = await txn.get(currentRef);
          if (!freshSnap.exists()) return;
          const freshCur = freshSnap.data() as CurrentRoundData;
          if (freshCur.status !== 'rolling' || freshCur.roundId !== cur.roundId) return;

          const nextRoundId = cur.roundId + 1;
          txn.update(currentRef, {
            roundId: nextRoundId,
            status: 'betting',
            openedAt: now,
            durationSeconds: roundDuration,
            deadline: now + roundDurationMs,
            updatedAt: now,
          });
        });
      } else if (roundsPassed > 1) {
        // Fast-forward from rolling state after overnight idle
        const targetRoundId = cur.roundId + roundsPassed;
        const targetOpenedAt = cur.openedAt + (roundsPassed * roundDurationMs);
        const targetDeadline = targetOpenedAt + roundDurationMs;
        const remainingSeconds = Math.max(0, Math.ceil((targetDeadline - now) / 1000));
        const targetStatus = remainingSeconds <= 5 ? 'rolling' : 'betting';

        await runTransaction(db, async (txn) => {
          const freshSnap = await txn.get(currentRef);
          if (!freshSnap.exists()) return;
          const freshCur = freshSnap.data() as CurrentRoundData;
          if (freshCur.roundId > cur.roundId) return;

          txn.update(currentRef, {
            roundId: targetRoundId,
            status: targetStatus,
            openedAt: targetOpenedAt,
            durationSeconds: roundDuration,
            deadline: targetDeadline,
            updatedAt: now,
          });
        });
      }
    }
  } catch (err: unknown) {
    const errorObj = err as { code?: string; message?: string };
    const isQuotaExceeded =
      errorObj?.code === 'resource-exhausted' ||
      errorObj?.message?.includes('Quota limit exceeded') ||
      errorObj?.message?.includes('Quota exceeded');

    if (isQuotaExceeded) {
      // Back off for 5 minutes when Firestore quota is exhausted to prevent spamming
      quotaCooldownUntil = now + 5 * 60 * 1000;
      if (now - lastQuotaWarnTime > 60000) {
        lastQuotaWarnTime = now;
        console.warn('Firestore daily read quota exhausted. Backing off tickRoundSystem ticker for 5 minutes.');
      }
      return;
    }
    console.warn('tickRoundSystem note:', err);
  }
}

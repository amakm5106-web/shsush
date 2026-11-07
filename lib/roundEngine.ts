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
 * Autonomous 24/7 Round Progression Engine
 * Guarantees rounds advance continuously every 60 seconds whether players are online or offline.
 * If clients were away overnight, it automatically calculates elapsed cycles and fast-forwards
 * to the exact real-time active round ID without missing a beat!
 */
export async function tickRoundSystem(db: Firestore, durationSeconds: number = 60) {
  try {
    const currentRef = doc(db, 'rounds', 'current');
    const snap = await getDoc(currentRef);
    const now = Date.now();
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
      return;
    }

    const cur = snap.data() as CurrentRoundData;
    const roundDuration = cur.durationSeconds || durationSeconds;
    const roundDurationMs = roundDuration * 1000;

    if (cur.status === 'betting') {
      const elapsedSinceOpen = now - cur.openedAt;
      const roundsPassed = Math.floor(elapsedSinceOpen / roundDurationMs);

      // A: Normal deadline reached (1 cycle)
      if (now >= cur.deadline && roundsPassed <= 1) {
        // Read active bets for this round to run lowest-pool algorithm
        let roll1 = Math.floor(Math.random() * 6) + 1;
        let roll2 = Math.floor(Math.random() * 6) + 1;
        let total = roll1 + roll2;

        try {
          const betsQuery = query(collection(db, 'bets'), where('roundId', '==', cur.roundId));
          const betsSnap = await getDocs(betsQuery);
          const activeBets: PlayerBet[] = [];
          betsSnap.forEach((d) => activeBets.push(d.data() as PlayerBet));

          if (activeBets.length > 0) {
            const candidates: { total: number; payout: number; rolls: [number, number][] }[] = [];
            for (let t = 2; t <= 12; t++) {
              const validRolls: [number, number][] = [];
              for (let d1 = 1; d1 <= 6; d1++) {
                const d2 = t - d1;
                if (d2 >= 1 && d2 <= 6) validRolls.push([d1, d2]);
              }
              const tClass = classifyDiceTotal(t);
              const tColor = classifyDiceColor(t);
              let sumPayout = 0;
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
                if (won) sumPayout += Math.round(bet.amount * bet.multiplier);
              }
              candidates.push({ total: t, payout: sumPayout, rolls: validRolls });
            }
            const minPayout = Math.min(...candidates.map((c) => c.payout));
            const best = candidates.filter((c) => c.payout === minPayout);
            const chosen = best[Math.floor(Math.random() * best.length)];
            const chosenRoll = chosen.rolls[Math.floor(Math.random() * chosen.rolls.length)];
            roll1 = chosenRoll[0];
            roll2 = chosenRoll[1];
            total = roll1 + roll2;
          }
        } catch (err) {
          console.warn('Active bets pool read note:', err);
        }

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
  } catch (err) {
    console.warn('tickRoundSystem note:', err);
  }
}

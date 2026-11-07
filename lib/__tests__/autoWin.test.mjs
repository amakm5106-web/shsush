import test from 'node:test';
import assert from 'node:assert/strict';

function classifyDiceTotal(total) {
  if (total <= 6) return 'small';
  if (total === 7) return 'common';
  return 'big';
}

function classifyDiceColor(total) {
  if (total === 6 || total === 7) return 'violet';
  if (total % 2 === 0) return 'red';
  return 'green';
}

function calculateAutoWinRoll(activeBets) {
  if (!activeBets || activeBets.length === 0) {
    const roll1 = Math.floor(Math.random() * 6) + 1;
    const roll2 = Math.floor(Math.random() * 6) + 1;
    return { roll1, roll2, total: roll1 + roll2 };
  }

  const candidates = [];

  for (let t = 2; t <= 12; t++) {
    const validRolls = [];
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

  // 1. Minimize player payout
  const minPayout = Math.min(...candidates.map((c) => c.payout));
  let bestCandidates = candidates.filter((c) => c.payout === minPayout);

  // 2. Secondary tie-breaker: Minimize winning stake
  const minStake = Math.min(...bestCandidates.map((c) => c.winningStake));
  bestCandidates = bestCandidates.filter((c) => c.winningStake === minStake);

  const chosen = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
  const chosenRoll = chosen.rolls[Math.floor(Math.random() * chosen.rolls.length)];

  return {
    roll1: chosenRoll[0],
    roll2: chosenRoll[1],
    total: chosen.total,
  };
}

test('Auto-Win Test: When bets are placed only on Big (အကြီး), dice rolls Small or 7 (Zero Payout)', () => {
  const bets = [
    { betId: '1', roundId: 100, userId: 'u1', userName: 'Player A', betKind: 'size', selection: 'အကြီး', amount: 50000, multiplier: 1.9 }
  ];

  for (let i = 0; i < 50; i++) {
    const outcome = calculateAutoWinRoll(bets);
    assert.ok(outcome.total <= 7, `Expected total <= 7 (Small or Common 7), but got ${outcome.total}`);
    assert.equal(outcome.roll1 + outcome.roll2, outcome.total);
    assert.ok(outcome.roll1 >= 1 && outcome.roll1 <= 6);
    assert.ok(outcome.roll2 >= 1 && outcome.roll2 <= 6);
  }
});

test('Auto-Win Test: When bets are placed only on Small (အသေး), dice rolls Big or 7 (Zero Payout)', () => {
  const bets = [
    { betId: '2', roundId: 100, userId: 'u2', userName: 'Player B', betKind: 'size', selection: 'အသေး', amount: 30000, multiplier: 1.9 }
  ];

  for (let i = 0; i < 50; i++) {
    const outcome = calculateAutoWinRoll(bets);
    assert.ok(outcome.total >= 7, `Expected total >= 7 (Big or Common 7), but got ${outcome.total}`);
    assert.equal(outcome.roll1 + outcome.roll2, outcome.total);
  }
});

test('Auto-Win Test: When bets are on both Big and Small, Common 7 is chosen (Zero Payout to both)', () => {
  const bets = [
    { betId: '3', roundId: 100, userId: 'u1', userName: 'Player A', betKind: 'size', selection: 'အကြီး', amount: 100000, multiplier: 1.9 },
    { betId: '4', roundId: 100, userId: 'u2', userName: 'Player B', betKind: 'size', selection: 'အသေး', amount: 80000, multiplier: 1.9 }
  ];

  for (let i = 0; i < 50; i++) {
    const outcome = calculateAutoWinRoll(bets);
    assert.equal(outcome.total, 7, `Expected 7 to win both pools, but got ${outcome.total}`);
  }
});

test('Auto-Win Test: When bets are on Big (20,000) and Number 7 (2,000), Small is chosen (Lower liability)', () => {
  const bets = [
    { betId: '5', roundId: 100, userId: 'u1', userName: 'Player A', betKind: 'size', selection: 'အကြီး', amount: 20000, multiplier: 1.9 }, // 38,000 liability
    { betId: '6', roundId: 100, userId: 'u2', userName: 'Player B', betKind: 'number', selection: '7', amount: 2000, multiplier: 3.9 } // 7,800 liability
  ];

  for (let i = 0; i < 50; i++) {
    const outcome = calculateAutoWinRoll(bets);
    assert.ok(outcome.total >= 2 && outcome.total <= 6, `Expected Small (2-6) with 0 payout liability, got ${outcome.total}`);
  }
});

test('Auto-Win Test: When no bets exist, roll is between 2 and 12', () => {
  for (let i = 0; i < 20; i++) {
    const outcome = calculateAutoWinRoll([]);
    assert.ok(outcome.total >= 2 && outcome.total <= 12);
  }
});

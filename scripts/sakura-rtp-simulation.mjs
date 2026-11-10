import {
  createSakuraOutcome,
  DEFAULT_SAKURA_RTP_PERCENT,
  isSakuraRtpPercent,
  SAKURA_BET_STEPS,
} from '../lib/sakuraGame.ts';

const rounds = Number(process.argv.find((arg) => arg.startsWith('--rounds='))?.split('=')[1] || 100_000);
const seedArg = Number(process.argv.find((arg) => arg.startsWith('--seed='))?.split('=')[1] || 20261110);
const rtpPercent = Number(process.argv.find((arg) => arg.startsWith('--rtp='))?.split('=')[1] || DEFAULT_SAKURA_RTP_PERCENT);
if (!Number.isSafeInteger(rounds) || rounds < 10_000 || rounds > 10_000_000) {
  throw new Error('Use --rounds between 10000 and 10000000');
}
if (!isSakuraRtpPercent(rtpPercent)) throw new Error('Use --rtp between 50 and 95');

function seededRandom(seed) {
  let state = seed >>> 0;
  return (max) => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    value = (value ^ (value >>> 14)) >>> 0;
    return Math.floor((value / 0x1_0000_0000) * max);
  };
}

for (const [stepIndex, stake] of SAKURA_BET_STEPS.entries()) {
  const random = seededRandom(seedArg + stepIndex * 100_003);
  let returned = 0;
  let paidHitCount = 0;
  let awardedFreeSpins = 0;
  const paidRoundReturns = [];

  for (let round = 0; round < rounds; round += 1) {
    const paidOutcome = createSakuraOutcome(stake, false, random, rtpPercent);
    let roundReturn = paidOutcome.payout;
    let freeSpins = paidOutcome.freeSpinsAwarded;
    awardedFreeSpins += freeSpins;
    while (freeSpins > 0) {
      freeSpins -= 1;
      roundReturn += createSakuraOutcome(stake, true, random, rtpPercent).payout;
    }
    returned += roundReturn;
    if (roundReturn > 0) paidHitCount += 1;
    paidRoundReturns.push(roundReturn);
  }

  paidRoundReturns.sort((a, b) => a - b);
  const wagers = rounds * stake;
  const rtp = returned / wagers;
  console.log(JSON.stringify({
    stakeMMK: stake,
    configuredRtpPercent: rtpPercent,
    paidRounds: rounds,
    totalPaidWagersMMK: wagers,
    totalPayoutIncludingFreeSpinsMMK: returned,
    estimatedRtp: Number((rtp * 100).toFixed(3)),
    estimatedHouseEdge: Number(((1 - rtp) * 100).toFixed(3)),
    paidRoundHitRate: Number((paidHitCount / rounds * 100).toFixed(2)),
    freeSpinsPerPaidRound: Number((awardedFreeSpins / rounds).toFixed(4)),
    p95ReturnedMMK: paidRoundReturns[Math.floor(rounds * 0.95)],
    p99ReturnedMMK: paidRoundReturns[Math.floor(rounds * 0.99)],
    maxObservedPaidRoundMMK: paidRoundReturns.at(-1),
  }));
}

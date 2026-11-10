import { randomInt } from 'node:crypto';

export const SAKURA_BET_STEPS = [20, 50, 100, 300, 500, 1000, 3000, 5000] as const;
const LEGACY_FREE_SPIN_BET_STEPS = [10, 40, 80, 160, 320] as const;
export const DEFAULT_SAKURA_RTP_PERCENT = 80;
export const MIN_SAKURA_RTP_PERCENT = 50;
export const MAX_SAKURA_RTP_PERCENT = 95;
export const SAKURA_RTP_VERSION = 'sakura-rtp-config-v2';
export const SAKURA_MAX_FREE_SPINS = 5;
export const SAKURA_MAX_CASCADES = 6;
export const SAKURA_MAX_CASCADE_MULTIPLIER = 8;
export const SAKURA_CASCADE_PAYOUT_CAP_MULTIPLIER = 65;
export const SAKURA_SPIN_PAYOUT_CAP_MULTIPLIER = 125;

// Per-stake calibration for whole-MMK rounding; validated with one million paid rounds
// per permitted stake, including cascades, multipliers, five-spin bonuses, and payouts.
export const SAKURA_PAYOUT_SCALE_BY_BET: Readonly<Record<number, number>> = {
  10: 1.095641,
  20: 1.020934,
  40: 0.989735,
  50: 0.991,
  100: 0.9925,
  80: 0.992274,
  160: 0.993591,
  300: 0.992,
  500: 0.985908,
  320: 0.991519,
  1000: 0.992,
  3000: 0.992,
  5000: 0.992,
};

const SYMBOLS = ['sushi', 'maki', 'cat', 'fan', 'coin', 'drum', 'a', 'k', 'q', 'j', '10', 'wild', 'scatter'] as const;
type SymbolName = (typeof SYMBOLS)[number];
const WEIGHTS: ReadonlyArray<readonly [SymbolName, number]> = [
  ['sushi', 16], ['maki', 16], ['cat', 10], ['fan', 13], ['coin', 9], ['drum', 11],
  ['a', 9], ['k', 10], ['q', 10], ['j', 10], ['10', 10], ['wild', 2], ['scatter', 4],
];
const TOTAL_WEIGHT = WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
const SYMBOL_BASE: Partial<Record<SymbolName, number>> = {
  cat: 1.5, coin: 1.2, sushi: 0.9, maki: 0.85, fan: 0.75, drum: 0.7,
};
const RUN_FACTOR: Record<number, number> = { 3: 0.04, 4: 0.1, 5: 0.22, 6: 0.5 };

export type SakuraCascadeStep = {
  grid: SymbolName[];
  winningIndices: number[];
  payout: number;
  multiplier: number;
  afterGrid: SymbolName[];
};

export type SakuraOutcome = {
  initialGrid: SymbolName[];
  finalGrid: SymbolName[];
  scatterCount: number;
  freeSpinsAwarded: number;
  payout: number;
  steps: SakuraCascadeStep[];
};

type RandomIndex = (max: number) => number;

function pickSymbol(random: RandomIndex): SymbolName {
  let n = random(TOTAL_WEIGHT);
  for (const [symbol, weight] of WEIGHTS) {
    n -= weight;
    if (n < 0) return symbol;
  }
  return 'sushi';
}

function randomGrid(random: RandomIndex): SymbolName[] {
  return Array.from({ length: 30 }, () => pickSymbol(random));
}

function evaluate(grid: SymbolName[], stake: number, multiplier: number, rtpPercent: number) {
  const matched = new Set<number>();
  let total = 0;

  for (const symbol of SYMBOLS) {
    if (symbol === 'wild' || symbol === 'scatter') continue;
    let ways = 1;
    let run = 0;
    const indices: number[] = [];

    for (let column = 0; column < 6; column += 1) {
      const hits: number[] = [];
      for (let row = 0; row < 5; row += 1) {
        const index = row * 6 + column;
        if (grid[index] === symbol || grid[index] === 'wild') hits.push(index);
      }
      if (hits.length === 0) break;
      ways *= hits.length;
      run += 1;
      indices.push(...hits);
    }

    if (run < 3) continue;
    const base = SYMBOL_BASE[symbol] ?? 0.55;
    const runFactor = RUN_FACTOR[run] ?? 0.5;
    const scale = SAKURA_PAYOUT_SCALE_BY_BET[stake] * (rtpPercent / DEFAULT_SAKURA_RTP_PERCENT);
    const linePayout = Math.round(stake * base * runFactor * ways * multiplier * scale);
    if (linePayout > 0) {
      total += linePayout;
      for (const index of indices) matched.add(index);
    }
  }

  return {
    payout: Math.min(stake * SAKURA_CASCADE_PAYOUT_CAP_MULTIPLIER, total),
    winningIndices: [...matched],
  };
}

function cascade(grid: SymbolName[], winningIndices: number[], random: RandomIndex): SymbolName[] {
  const next = grid.slice();
  const removed = new Set(winningIndices);
  for (let column = 0; column < 6; column += 1) {
    const retained: SymbolName[] = [];
    for (let row = 4; row >= 0; row -= 1) {
      const index = row * 6 + column;
      if (!removed.has(index)) retained.push(grid[index]);
    }
    while (retained.length < 5) retained.push(pickSymbol(random));
    for (let row = 4; row >= 0; row -= 1) {
      next[row * 6 + column] = retained[4 - row];
    }
  }
  return next;
}

export function isSakuraBet(value: unknown): value is (typeof SAKURA_BET_STEPS)[number] {
  return typeof value === 'number' && SAKURA_BET_STEPS.includes(value as (typeof SAKURA_BET_STEPS)[number]);
}

export function isSakuraRoundStake(value: unknown): value is number {
  return isSakuraBet(value) || (typeof value === 'number' && LEGACY_FREE_SPIN_BET_STEPS.includes(value as (typeof LEGACY_FREE_SPIN_BET_STEPS)[number]));
}

export function isSakuraRtpPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) &&
    value >= MIN_SAKURA_RTP_PERCENT && value <= MAX_SAKURA_RTP_PERCENT;
}

/** Generate all money-relevant outcome data on the server. `isFreeSpin` can only come from stored server state. */
export function createSakuraOutcome(
  stake: number,
  isFreeSpin: boolean,
  random: RandomIndex = randomInt,
  rtpPercent = DEFAULT_SAKURA_RTP_PERCENT,
): SakuraOutcome {
  if (!isSakuraRoundStake(stake)) throw new Error('Invalid Sakura stake');
  if (!isSakuraRtpPercent(rtpPercent)) throw new Error('Invalid Sakura RTP setting');
  let grid = randomGrid(random);
  const initialGrid = grid.slice();
  const scatterCount = grid.filter((symbol) => symbol === 'scatter').length;
  // The demo awarded 8+ spins. To limit bonus exposure, a paid spin awards no more than five;
  // free spins cannot retrigger a bonus.
  const freeSpinsAwarded = !isFreeSpin && scatterCount >= 3 ? SAKURA_MAX_FREE_SPINS : 0;
  const steps: SakuraCascadeStep[] = [];
  let totalPayout = 0;
  let multiplier = isFreeSpin ? 2 : 1;
  const spinCap = stake * SAKURA_SPIN_PAYOUT_CAP_MULTIPLIER;

  for (let cascadeIndex = 0; cascadeIndex < SAKURA_MAX_CASCADES; cascadeIndex += 1) {
    if (totalPayout >= spinCap) break;
    const result = evaluate(grid, stake, multiplier, rtpPercent);
    if (result.winningIndices.length === 0) break;

    const payout = Math.min(result.payout, spinCap - totalPayout);
    const afterGrid = cascade(grid, result.winningIndices, random);
    steps.push({ grid: grid.slice(), winningIndices: result.winningIndices, payout, multiplier, afterGrid });
    totalPayout += payout;
    grid = afterGrid;
    multiplier = Math.min(SAKURA_MAX_CASCADE_MULTIPLIER, multiplier + 1);
  }

  return {
    initialGrid,
    finalGrid: grid,
    scatterCount,
    freeSpinsAwarded,
    payout: totalPayout,
    steps,
  };
}

import { randomInt } from 'node:crypto';
import type { Client } from '@libsql/client';

export const BUFFALO_SYMBOL_IDS: Record<string, number> = {
  card_9: 1,
  card_10: 2,
  card_j: 3,
  card_q: 4,
  card_k: 5,
  card_a: 6,
  eagle: 7,
  bear: 8,
  wolf: 9,
  moose: 10,
  buffalo: 11,
  scatter: 12,
  wild: 13,
};

const REGULAR_SYMBOLS = ['buffalo', 'eagle', 'bear', 'wolf', 'moose'] as const;
type RegularSymbol = (typeof REGULAR_SYMBOLS)[number];
type ReelSymbol = RegularSymbol | 'wild' | 'scatter';

const SYMBOL_PAYOUTS: Record<RegularSymbol, { p3: number; p4: number; p5: number }> = {
  buffalo: { p3: 0.4, p4: 0.75, p5: 1.25 },
  eagle: { p3: 0.3, p4: 0.55, p5: 0.95 },
  bear: { p3: 0.2, p4: 0.4, p5: 0.7 },
  wolf: { p3: 0.15, p4: 0.3, p5: 0.5 },
  moose: { p3: 0.1, p4: 0.2, p5: 0.35 },
};

const STAKE_MULTIPLIERS = [1, 5, 10, 20, 50] as const;
const LEGAL_STAKES = new Set<number>();
for (let betLevel = 1; betLevel <= 10; betLevel += 1) {
  for (const multiplier of STAKE_MULTIPLIERS) {
    LEGAL_STAKES.add(80 * betLevel * multiplier);
  }
}

export function isBuffaloStake(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && LEGAL_STAKES.has(value) && value <= 40_000;
}

export type BuffaloOutcome = {
  reels: ReelSymbol[][];
  wildMultipliers: Record<string, number>;
  scatterCount: number;
  payout: number;
  winningCells: number[];
  symbols: number[];
  scatterPositions: number[];
  multiplier: number;
};

type RandomSource = () => number;
const secureRandom: RandomSource = () => randomInt(0, 1_000_000) / 1_000_000;

function pick<T>(items: readonly T[], random: RandomSource): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function randomRow(random: RandomSource) {
  return Math.floor(random() * 4);
}

/** Ports the existing Shsush Buffalo outcome generator, excluding all engagement telemetry. */
export function generateBuffaloOutcome(
  isFreeSpin: boolean,
  lossStreak: number,
  stake: number,
  random: RandomSource = secureRandom,
): Pick<BuffaloOutcome, 'reels' | 'wildMultipliers' | 'scatterCount'> {
  let hitProbability = isFreeSpin ? 0.18 : 0.09;
  if (!isFreeSpin && lossStreak >= 12) hitProbability = 0.14;

  if (!isFreeSpin) {
    if (stake >= 20_000) hitProbability = Math.min(hitProbability, 0.05);
    else if (stake >= 5_000) hitProbability = Math.min(hitProbability, 0.065);
    else if (stake >= 2_000) hitProbability = Math.min(hitProbability, 0.08);
  }

  const isWinningSpin = random() < hitProbability;
  const reels: ReelSymbol[][] = [[], [], [], [], []];
  const wildMultipliers: Record<string, number> = {};
  let scatterCount = 0;

  if (isWinningSpin) {
    const isRecoveryBonus = !isFreeSpin && lossStreak >= 12;
    let winSymbol: RegularSymbol;
    let winLength = 3;

    if (isRecoveryBonus) {
      winSymbol = random() < 0.6 ? 'wolf' : 'bear';
    } else {
      const symbolRoll = random();
      if (symbolRoll < 0.02) winSymbol = 'buffalo';
      else if (symbolRoll < 0.07) winSymbol = 'eagle';
      else if (symbolRoll < 0.28) winSymbol = 'bear';
      else if (symbolRoll < 0.62) winSymbol = 'wolf';
      else winSymbol = 'moose';
      winLength = random() < 0.94 ? 3 : 4;
    }

    const triggerBonus = random() < 0.01;
    for (let col = 0; col < 5; col += 1) {
      const column: ReelSymbol[] = [];
      const isConnectingColumn = col < winLength;
      const winningRows = isConnectingColumn ? [randomRow(random)] : [];

      for (let row = 0; row < 4; row += 1) {
        if (isConnectingColumn && winningRows.includes(row)) {
          if (col > 0 && random() < (isFreeSpin ? 0.35 : 0.2)) {
            column.push('wild');
            if (isFreeSpin) {
              const wildRoll = random();
              wildMultipliers[`${col}-${row}`] = wildRoll < 0.5 ? 2 : wildRoll < 0.85 ? 3 : 5;
            }
          } else {
            column.push(winSymbol);
          }
        } else {
          const blocked: string[] = col === winLength ? [winSymbol, 'wild'] : [];
          const candidates = REGULAR_SYMBOLS.filter((symbol) => !blocked.includes(symbol));
          let symbol: ReelSymbol = pick(candidates, random);

          if (triggerBonus && col < 3 && !column.includes('scatter') && scatterCount < 3) {
            symbol = 'scatter';
            scatterCount += 1;
          }

          if (row > 0 && symbol === column[row - 1]) {
            const alternatives = candidates.filter((candidate) => candidate !== symbol);
            if (alternatives.length > 0) symbol = pick(alternatives, random);
          }
          column.push(symbol);
        }
      }
      reels[col] = column;
    }
  } else {
    const missType = random();
    if (missType < 0.8) {
      const teaserSymbol: RegularSymbol = random() < 0.65 ? 'buffalo' : 'eagle';
      const matchRow0 = randomRow(random);
      const matchRow1 = randomRow(random);

      for (let col = 0; col < 5; col += 1) {
        const column: ReelSymbol[] = [];
        for (let row = 0; row < 4; row += 1) {
          if ((col === 0 && row === matchRow0) || (col === 1 && row === matchRow1)) {
            column.push(teaserSymbol);
          } else if (col === 2) {
            const safePool = REGULAR_SYMBOLS.filter(
              (symbol) => symbol !== teaserSymbol && symbol !== 'buffalo',
            );
            let symbol = pick(safePool, random);
            if (row > 0 && symbol === column[row - 1]) {
              const alternatives = safePool.filter((candidate) => candidate !== symbol);
              if (alternatives.length > 0) symbol = pick(alternatives, random);
            }
            column.push(symbol);
          } else {
            let symbol: RegularSymbol = pick(REGULAR_SYMBOLS, random);
            if (row > 0 && symbol === column[row - 1]) {
              const alternatives = REGULAR_SYMBOLS.filter((candidate) => candidate !== symbol);
              if (alternatives.length > 0) symbol = pick(alternatives, random);
            }
            column.push(symbol);
          }
        }
        reels[col] = column;
      }
    } else {
      scatterCount = 2;
      for (let col = 0; col < 5; col += 1) {
        const column: ReelSymbol[] = [];
        const scatterRow = randomRow(random);
        for (let row = 0; row < 4; row += 1) {
          if ((col === 0 || col === 1) && row === scatterRow) {
            column.push('scatter');
          } else {
            const pool = REGULAR_SYMBOLS;
            let symbol: RegularSymbol = pick(pool, random);
            if (row > 0 && symbol === column[row - 1]) {
              const alternatives = pool.filter((candidate) => candidate !== symbol);
              if (alternatives.length > 0) symbol = pick(alternatives, random);
            }
            column.push(symbol);
          }
        }
        reels[col] = column;
      }

      const firstColumnSymbols = new Set(reels[0]);
      for (let row = 0; row < 4; row += 1) {
        if (firstColumnSymbols.has(reels[2][row])) {
          const safePool = REGULAR_SYMBOLS.filter((symbol) => !firstColumnSymbols.has(symbol));
          if (safePool.length > 0) reels[2][row] = pick(safePool, random);
        }
      }
    }
  }

  return { reels, wildMultipliers, scatterCount };
}

function payoutDampener(stake: number) {
  if (stake >= 50_000) return 0.45;
  if (stake >= 20_000) return 0.55;
  if (stake >= 10_000) return 0.65;
  if (stake >= 5_000) return 0.75;
  if (stake >= 2_000) return 0.85;
  return 1;
}

function maxWinMultiplier(stake: number, isFreeSpin: boolean) {
  if (stake >= 50_000) return isFreeSpin ? 2 : 1.25;
  if (stake >= 20_000) return isFreeSpin ? 2.5 : 1.4;
  if (stake >= 10_000) return isFreeSpin ? 3 : 1.65;
  if (stake >= 5_000) return isFreeSpin ? 3.5 : 1.85;
  if (stake >= 2_000) return isFreeSpin ? 4.5 : 2.2;
  return isFreeSpin ? 6 : 2.8;
}

/** Applies the existing five-reel, four-row left-to-right ways evaluator and payout caps. */
export function evaluateBuffaloOutcome(
  reels: ReelSymbol[][],
  wildMultipliers: Record<string, number>,
  stake: number,
  isFreeSpin: boolean,
): { payout: number; winningKeys: Set<string> } {
  let totalWin = 0;
  const winningKeys = new Set<string>();

  for (const targetSymbol of REGULAR_SYMBOLS) {
    let consecutiveColumns = 0;
    let waysCount = 1;
    let wildMultiplierProduct = 1;
    const currentMatches: string[] = [];

    for (let col = 0; col < 5; col += 1) {
      let matchesInColumn = 0;
      for (let row = 0; row < 4; row += 1) {
        const current = reels[col][row];
        if (current === targetSymbol || current === 'wild') {
          matchesInColumn += 1;
          currentMatches.push(`${col}-${row}`);
          if (current === 'wild' && isFreeSpin && wildMultipliers[`${col}-${row}`]) {
            wildMultiplierProduct *= wildMultipliers[`${col}-${row}`];
          }
        }
      }
      if (matchesInColumn > 0) {
        consecutiveColumns += 1;
        waysCount *= matchesInColumn;
      } else {
        break;
      }
    }

    if (consecutiveColumns < 3) continue;
    for (const key of currentMatches) winningKeys.add(key);

    const payoutDef = SYMBOL_PAYOUTS[targetSymbol];
    const baseMultiplier = consecutiveColumns === 3
      ? payoutDef.p3
      : consecutiveColumns === 4
        ? payoutDef.p4
        : payoutDef.p5;
    const effectiveWays = Math.min(waysCount, 2);
    const effectiveWildMultiplier = isFreeSpin ? Math.min(wildMultiplierProduct, 3) : 1;
    totalWin += Math.round(stake * baseMultiplier * effectiveWays * effectiveWildMultiplier * payoutDampener(stake));
  }

  return {
    payout: Math.min(totalWin, Math.round(stake * maxWinMultiplier(stake, isFreeSpin))),
    winningKeys,
  };
}

export function createBuffaloOutcome(
  stake: number,
  isFreeSpin: boolean,
  lossStreak: number,
  random: RandomSource = secureRandom,
): BuffaloOutcome {
  const generated = generateBuffaloOutcome(isFreeSpin, lossStreak, stake, random);
  const evaluated = evaluateBuffaloOutcome(generated.reels, generated.wildMultipliers, stake, isFreeSpin);
  const winningCells = Array<number>(20).fill(0);
  const symbols = Array<number>(20).fill(0);
  const scatterPositions: number[] = [];

  // This is the original Cocos nHandCards order: n -> column n % 5, row 3 - floor(n / 5).
  for (let index = 0; index < 20; index += 1) {
    const col = index % 5;
    const row = 3 - Math.floor(index / 5);
    const symbol = generated.reels[col][row];
    symbols[index] = BUFFALO_SYMBOL_IDS[symbol];
    if (symbol === 'scatter') scatterPositions.push(index);
    if (evaluated.winningKeys.has(`${col}-${row}`)) winningCells[index] = 1;
  }

  return {
    ...generated,
    payout: evaluated.payout,
    winningCells,
    symbols,
    scatterPositions,
    multiplier: evaluated.payout > 0 ? Number((evaluated.payout / stake).toFixed(2)) : 1,
  };
}

const buffaloSchemaTasks = new WeakMap<Client, Promise<void>>();

/** Lazily provisions only the Buffalo state/settlement tables and the compatible bets table. */
export async function ensureBuffaloSchema(client: Client) {
  const pending = buffaloSchemaTasks.get(client);
  if (pending) return pending;

  const task = client.batch([
    `CREATE TABLE IF NOT EXISTS bets (
      id TEXT PRIMARY KEY,
      betId TEXT,
      roundId INTEGER NOT NULL,
      userId TEXT NOT NULL,
      userName TEXT,
      betKind TEXT,
      selection TEXT,
      amount INTEGER NOT NULL,
      multiplier REAL DEFAULT 1.0,
      status TEXT DEFAULT 'pending',
      payout INTEGER DEFAULT 0,
      profit INTEGER DEFAULT 0,
      result INTEGER,
      createdAt INTEGER,
      settledAt INTEGER
    );`,
    `CREATE TABLE IF NOT EXISTS buffalo_player_state (
      userId TEXT PRIMARY KEY,
      freeSpinsRemaining INTEGER NOT NULL DEFAULT 0,
      freeSpinStake INTEGER NOT NULL DEFAULT 0,
      lossStreak INTEGER NOT NULL DEFAULT 0,
      updatedAt INTEGER NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS buffalo_spins (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      requestId TEXT NOT NULL,
      requestedStake INTEGER NOT NULL,
      stake INTEGER NOT NULL,
      charged INTEGER NOT NULL,
      payout INTEGER NOT NULL,
      balanceAfter INTEGER NOT NULL,
      isFreeSpin INTEGER NOT NULL DEFAULT 0,
      freeSpinsAwarded INTEGER NOT NULL DEFAULT 0,
      freeSpinsRemaining INTEGER NOT NULL DEFAULT 0,
      symbolsJson TEXT NOT NULL,
      winningCellsJson TEXT NOT NULL,
      scatterPositionsJson TEXT NOT NULL,
      multiplier REAL NOT NULL,
      createdAt INTEGER NOT NULL,
      UNIQUE(userId, requestId)
    );`,
    'CREATE INDEX IF NOT EXISTS idx_buffalo_spins_user_created ON buffalo_spins(userId, createdAt DESC);',
  ], 'write').then(() => undefined);

  buffaloSchemaTasks.set(client, task);
  try {
    await task;
  } catch (error) {
    buffaloSchemaTasks.delete(client);
    throw error;
  }
}

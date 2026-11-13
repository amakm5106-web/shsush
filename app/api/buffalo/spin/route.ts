import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  BUFFALO_RTP_VERSION,
  DEFAULT_BUFFALO_RTP_PERCENT,
  createBuffaloOutcome,
  ensureBuffaloSchema,
  getBuffaloFreeSpinAward,
  isBuffaloRtpPercent,
  isBuffaloStake,
} from '@/lib/buffaloSlotServer';
import { getTursoClient } from '@/lib/turso';
import { getSessionUser } from '@/lib/tursoAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type DbRow = Record<string, unknown>;
const noStore = { 'Cache-Control': 'no-store, max-age=0' };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

function isSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  const configuredOrigin = process.env.BUFFALO_ALLOWED_ORIGIN?.trim();
  const host = req.headers.get('host')?.trim().toLowerCase();
  if (!origin || !host) return false;

  try {
    const parsedOrigin = new URL(origin);
    if (configuredOrigin) return parsedOrigin.origin === new URL(configuredOrigin).origin;
    const requestProtocol = new URL(req.url).protocol;
    return parsedOrigin.host.toLowerCase() === host &&
      (parsedOrigin.protocol === 'https:' || parsedOrigin.protocol === requestProtocol);
  } catch {
    return false;
  }
}

function storedSpin(row: DbRow) {
  return {
    id: String(row.id),
    requestId: String(row.requestId),
    requestedStake: Number(row.requestedStake),
    stake: Number(row.stake),
    charged: Number(row.charged),
    payout: Number(row.payout),
    balance: Number(row.balanceAfter),
    isFreeSpin: Boolean(Number(row.isFreeSpin)),
    freeSpinsAwarded: Number(row.freeSpinsAwarded),
    freeSpinsRemaining: Number(row.freeSpinsRemaining),
    symbols: JSON.parse(String(row.symbolsJson)) as number[],
    winningCells: JSON.parse(String(row.winningCellsJson)) as number[],
    scatterPositions: JSON.parse(String(row.scatterPositionsJson)) as number[],
    multiplier: Number(row.multiplier),
    createdAt: Number(row.createdAt),
  };
}

async function findExisting(
  client: NonNullable<ReturnType<typeof getTursoClient>>,
  userId: string,
  requestId: string,
  requestedStake: number,
) {
  const result = await client.execute({
    sql: 'SELECT * FROM buffalo_spins WHERE userId = ? AND requestId = ? LIMIT 1',
    args: [userId, requestId],
  });
  const row = result.rows[0] as DbRow | undefined;
  if (!row) return null;
  if (Number(row.requestedStake) !== requestedStake) return { conflict: true as const };
  const wallet = await client.execute({ sql: 'SELECT balance FROM users WHERE uid = ? LIMIT 1', args: [userId] });
  return {
    conflict: false as const,
    spin: storedSpin(row),
    walletBalance: Number(wallet.rows[0]?.balance || 0),
  };
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return json({ success: false, code: 'INVALID_ORIGIN', error: 'ဂိမ်းကို ယခု မစတင်နိုင်ပါ။ ပြန်ကြိုးစားပါ။' }, 403);
  }

  const user = await getSessionUser();
  if (!user) return json({ success: false, code: 'UNAUTHENTICATED', error: 'ကစားရန် အကောင့်ဝင်ပါ။' }, 401);

  let payload: Record<string, unknown>;
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid JSON body');
    payload = body as Record<string, unknown>;
  } catch {
    return json({ success: false, code: 'INVALID_REQUEST', error: 'တောင်းဆိုမှု မမှန်ကန်ပါ။' }, 400);
  }

  if (payload.userId !== user.uid) {
    return json({ success: false, code: 'SESSION_MISMATCH', error: 'အကောင့်အချက်အလက် ပြောင်းလဲသွားပါသည်။ ပြန်ဝင်ပြီး စစ်ဆေးပါ။' }, 403);
  }

  const requestId = payload.requestId;
  const requestedStake = payload.stake;
  if (
    typeof requestId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
  ) {
    return json({ success: false, code: 'INVALID_REQUEST_ID', error: 'လှည့်မှုကို မစတင်နိုင်ပါ။ ပြန်ကြိုးစားပါ။' }, 400);
  }
  if (!isBuffaloStake(requestedStake)) {
    return json({ success: false, code: 'INVALID_BET', error: 'လောင်းကြေးပမာဏ မမှန်ကန်ပါ။' }, 400);
  }

  const client = getTursoClient();
  if (!client) return json({ success: false, code: 'GAME_UNAVAILABLE', error: 'Wallet ဝန်ဆောင်မှု ယာယီမရနိုင်ပါ။' }, 503);

  let tx: Awaited<ReturnType<typeof client.transaction>> | null = null;
  try {
    await ensureBuffaloSchema(client);
    tx = await client.transaction('write');

    const duplicate = await tx.execute({
      sql: 'SELECT * FROM buffalo_spins WHERE userId = ? AND requestId = ? LIMIT 1',
      args: [user.uid, requestId],
    });
    const duplicateRow = duplicate.rows[0] as DbRow | undefined;
    if (duplicateRow) {
      const wallet = await tx.execute({ sql: 'SELECT balance FROM users WHERE uid = ? LIMIT 1', args: [user.uid] });
      await tx.rollback();
      if (Number(duplicateRow.requestedStake) !== requestedStake) {
        return json({ success: false, code: 'IDEMPOTENCY_CONFLICT', error: 'လှည့်မှုကို ပြီးမြောက်စေ၍မရပါ။ ပြန်ကြိုးစားပါ။' }, 409);
      }
      return json({
        success: true,
        spin: storedSpin(duplicateRow),
        walletBalance: Number(wallet.rows[0]?.balance || 0),
        replayed: true,
      });
    }

    const stateResult = await tx.execute({
      sql: 'SELECT freeSpinsRemaining, freeSpinStake, freeSpinRtpPercent, freeSpinFeatureId FROM buffalo_player_state WHERE userId = ? LIMIT 1',
      args: [user.uid],
    });
    const playerState = stateResult.rows[0] as DbRow | undefined;
    const freeSpinsBefore = Math.max(0, Number(playerState?.freeSpinsRemaining || 0));
    const isFreeSpin = freeSpinsBefore > 0;
    const storedFreeSpinStake = Number(playerState?.freeSpinStake || 0);
    const stake = isFreeSpin ? storedFreeSpinStake : requestedStake;
    if (!isBuffaloStake(stake)) {
      await tx.rollback();
      return json({ success: false, code: 'INVALID_SERVER_STATE', error: 'လှည့်မှုကို ယခု မစတင်နိုင်ပါ။ ပြန်ကြိုးစားပါ။' }, 409);
    }

    const storedFeatureRtp = playerState?.freeSpinRtpPercent == null
      ? DEFAULT_BUFFALO_RTP_PERCENT
      : Number(playerState.freeSpinRtpPercent);
    if (isFreeSpin && !isBuffaloRtpPercent(storedFeatureRtp)) {
      await tx.rollback();
      return json({ success: false, code: 'INVALID_SERVER_STATE', error: 'Free Spin ဆက်တင် မမှန်ကန်ပါ။ အကူအညီတောင်းပါ။' }, 409);
    }
    let configuredRtp = DEFAULT_BUFFALO_RTP_PERCENT;
    if (!isFreeSpin) {
      const rtpConfig = await tx.execute({
        sql: 'SELECT value FROM settings WHERE key = ? LIMIT 1',
        args: ['buffalo_rtp_percent'],
      });
      const savedRtpValue = rtpConfig.rows[0]?.value;
      configuredRtp = savedRtpValue == null ? DEFAULT_BUFFALO_RTP_PERCENT : Number(savedRtpValue);
      if (!isBuffaloRtpPercent(configuredRtp)) {
        await tx.rollback();
        return json({ success: false, code: 'RTP_CONFIG_INVALID', error: 'ဂိမ်းဆက်တင်ကို စစ်ဆေးပြီးမှ ပြန်ကြိုးစားပါ။' }, 503);
      }
    }
    const appliedRtpPercent = isFreeSpin ? storedFeatureRtp : configuredRtp;

    let charged = 0;
    if (!isFreeSpin) {
      const debit = await tx.execute({
        sql: `UPDATE users SET balance = balance - ?,
          totalBetCumulative = COALESCE(totalBetCumulative, 0) + ?,
          wagerSinceLastWithdrawal = COALESCE(wagerSinceLastWithdrawal, 0) + ?,
          updatedAt = ? WHERE uid = ? AND balance >= ?`,
        args: [stake, stake, stake, Date.now(), user.uid, stake],
      });
      if (debit.rowsAffected !== 1) {
        await tx.rollback();
        const latest = await client.execute({ sql: 'SELECT balance FROM users WHERE uid = ? LIMIT 1', args: [user.uid] });
        return json({
          success: false,
          code: 'INSUFFICIENT_FUNDS',
          error: 'Wallet ထဲရှိငွေ မလုံလောက်ပါ။',
          balance: Number(latest.rows[0]?.balance || 0),
        }, 402);
      }
      charged = stake;
    } else {
      await tx.execute({ sql: 'UPDATE users SET updatedAt = ? WHERE uid = ?', args: [Date.now(), user.uid] });
    }

    const outcome = createBuffaloOutcome(stake, isFreeSpin, appliedRtpPercent);
    const freeSpinsAwarded = getBuffaloFreeSpinAward(outcome.scatterCount);
    const freeSpinsRemaining = (isFreeSpin ? freeSpinsBefore - 1 : 0) + freeSpinsAwarded;
    const freeSpinStake = freeSpinsRemaining > 0
      ? (isFreeSpin ? storedFreeSpinStake : stake)
      : 0;
    const featureId = isFreeSpin
      ? String(playerState?.freeSpinFeatureId || `buffalo_feature_legacy_${randomUUID()}`)
      : freeSpinsAwarded > 0 ? `buffalo_feature_${randomUUID()}` : '';
    const nextFeatureId = freeSpinsRemaining > 0 ? featureId : '';
    const nextFeatureRtp = freeSpinsRemaining > 0 ? appliedRtpPercent : 0;
    const createdAt = Date.now();
    const spinId = `buffalo_${randomUUID()}`;

    if (outcome.payout > 0) {
      const credit = await tx.execute({
        sql: 'UPDATE users SET balance = balance + ?, updatedAt = ? WHERE uid = ?',
        args: [outcome.payout, Date.now(), user.uid],
      });
      if (credit.rowsAffected !== 1) throw new Error('Buffalo wallet credit did not update a user row');
    }

    await tx.execute({
      sql: `INSERT INTO buffalo_player_state (
        userId, freeSpinsRemaining, freeSpinStake, lossStreak, freeSpinRtpPercent, freeSpinFeatureId, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(userId) DO UPDATE SET freeSpinsRemaining = excluded.freeSpinsRemaining,
          freeSpinStake = excluded.freeSpinStake, lossStreak = excluded.lossStreak,
          freeSpinRtpPercent = excluded.freeSpinRtpPercent, freeSpinFeatureId = excluded.freeSpinFeatureId,
          updatedAt = excluded.updatedAt`,
      args: [user.uid, freeSpinsRemaining, freeSpinStake, 0, nextFeatureRtp, nextFeatureId, createdAt],
    });

    const balanceResult = await tx.execute({ sql: 'SELECT balance FROM users WHERE uid = ? LIMIT 1', args: [user.uid] });
    const balance = Number(balanceResult.rows[0]?.balance);
    if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('Buffalo wallet returned an invalid balance');

    await tx.execute({
      sql: `INSERT INTO buffalo_spins (
        id, userId, requestId, requestedStake, stake, charged, payout, balanceAfter, isFreeSpin,
        freeSpinsAwarded, freeSpinsRemaining, featureId, rtpPercent, rtpVersion,
        symbolsJson, winningCellsJson, scatterPositionsJson, multiplier, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        spinId, user.uid, requestId, requestedStake, stake, charged, outcome.payout, balance,
        isFreeSpin ? 1 : 0, freeSpinsAwarded, freeSpinsRemaining, featureId, appliedRtpPercent, BUFFALO_RTP_VERSION,
        JSON.stringify(outcome.symbols), JSON.stringify(outcome.winningCells),
        JSON.stringify(outcome.scatterPositions), outcome.multiplier, createdAt,
      ],
    });

    await tx.execute({
      sql: `INSERT INTO bets (
        id, betId, roundId, userId, userName, betKind, selection, amount, multiplier,
        status, payout, profit, result, createdAt, settledAt
      ) VALUES (?, ?, ?, ?, ?, 'slot', 'Charge Buffalo (5x4 Ways Slot)', ?, ?, ?, ?, ?, NULL, ?, ?)`,
      args: [
        spinId, spinId, Math.floor(createdAt / 1000), user.uid, user.fullName, charged,
        outcome.multiplier, outcome.payout > 0 ? 'win' : 'loss', outcome.payout,
        outcome.payout - charged, createdAt, createdAt,
      ],
    });

    await tx.commit();
    const spin = {
      id: spinId,
      requestId,
      requestedStake,
      stake,
      charged,
      payout: outcome.payout,
      balance,
      isFreeSpin,
      freeSpinsAwarded,
      freeSpinsRemaining,
      symbols: outcome.symbols,
      winningCells: outcome.winningCells,
      scatterPositions: outcome.scatterPositions,
      multiplier: outcome.multiplier,
      createdAt,
    };
    return json({ success: true, spin, walletBalance: balance, replayed: false });
  } catch (error) {
    try { if (tx && !tx.closed) await tx.rollback(); } catch {}
    console.error('Buffalo spin settlement failed:', error);

    try {
      const existing = await findExisting(client, user.uid, requestId, requestedStake);
      if (existing?.conflict) {
        return json({ success: false, code: 'IDEMPOTENCY_CONFLICT', error: 'လှည့်မှုကို ပြီးမြောက်စေ၍မရပါ။ ပြန်ကြိုးစားပါ။' }, 409);
      }
      if (existing) {
        return json({
          success: true,
          spin: existing.spin,
          walletBalance: existing.walletBalance,
          replayed: true,
        });
      }
    } catch {}

    return json({ success: false, code: 'SETTLEMENT_UNCERTAIN', error: 'လှည့်မှုကို ယခု မပြီးစီးနိုင်ပါ။ ခဏကြာပြီးမှ ပြန်ကြိုးစားပါ။' }, 503);
  } finally {
    try { tx?.close(); } catch {}
  }
}

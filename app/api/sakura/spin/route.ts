import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ensureSakuraSchema, getTursoClient } from '@/lib/turso';
import { getSessionUser } from '@/lib/tursoAuth';
import {
  createSakuraOutcome,
  DEFAULT_SAKURA_RTP_PERCENT,
  isSakuraBet,
  isSakuraRoundStake,
  isSakuraRtpPercent,
  SAKURA_RTP_VERSION,
} from '@/lib/sakuraGame';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, max-age=0' };
type DbRow = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

function isSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  const configuredOrigin = process.env.SAKURA_ALLOWED_ORIGIN?.trim();
  const host = req.headers.get('host')?.trim().toLowerCase();
  if (!origin || !host) return false;
  try {
    const parsedOrigin = new URL(origin);
    const actualOrigin = parsedOrigin.origin;
    // Configure the public canonical origin where TLS terminates at a reverse proxy.
    // Do not base this security check on client-provided x-forwarded-* headers.
    if (configuredOrigin) return actualOrigin === new URL(configuredOrigin).origin;
    const requestProtocol = new URL(req.url).protocol;
    return parsedOrigin.host.toLowerCase() === host &&
      (parsedOrigin.protocol === 'https:' || parsedOrigin.protocol === requestProtocol);
  } catch {
    return false;
  }
}

function storedSpin(row: DbRow, currentBalance?: number) {
  const initialGrid = JSON.parse(String(row.initialGridJson));
  const steps = JSON.parse(String(row.stepsJson));
  return {
    id: String(row.id),
    requestId: String(row.requestId),
    stake: Number(row.stake),
    charged: Number(row.charged),
    payout: Number(row.payout),
    balance: currentBalance ?? Number(row.balanceAfter),
    creditedPayout: Number(row.creditedPayout || 0),
    isFreeSpin: Boolean(Number(row.isFreeSpin)),
    initialGrid,
    steps,
    finalGrid: steps.length ? steps[steps.length - 1].afterGrid : initialGrid,
    scatterCount: Number(row.scatterCount),
    freeSpinsAwarded: Number(row.freeSpinsAwarded),
    freeSpinsRemaining: Number(row.freeSpinsRemaining),
    freeSpinWinTotal: Number(row.freeSpinWinTotal || 0),
    freeSpinFeatureFinished: Boolean(Number(row.freeSpinFeatureFinished || 0)),
    pendingBonusId: String(row.pendingBonusId || ''),
  };
}

async function findExisting(client: NonNullable<ReturnType<typeof getTursoClient>>, userId: string, requestId: string, requestedStake: number) {
  const result = await client.execute({
    sql: 'SELECT * FROM sakura_spins WHERE userId = ? AND requestId = ? LIMIT 1',
    args: [userId, requestId],
  });
  const row = result.rows[0] as DbRow | undefined;
  if (!row) return null;
  if (Number(row.requestedStake) !== requestedStake) return { conflict: true as const };
  const wallet = await client.execute({ sql: 'SELECT balance FROM users WHERE uid = ? LIMIT 1', args: [userId] });
  return { conflict: false as const, spin: storedSpin(row, Number(wallet.rows[0]?.balance || 0)) };
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return json({ success: false, code: 'INVALID_ORIGIN', error: 'ဂိမ်းကို ယခု မစတင်နိုင်ပါ။ ပြန်ကြိုးစားပါ။' }, 403);

  const user = await getSessionUser();
  if (!user) return json({ success: false, code: 'UNAUTHENTICATED', error: 'ကစားရန် အကောင့်ဝင်ပါ။' }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, code: 'INVALID_REQUEST', error: 'တောင်းဆိုမှု မမှန်ကန်ပါ။' }, 400);
  }
  if (!body || typeof body !== 'object') return json({ success: false, code: 'INVALID_REQUEST', error: 'တောင်းဆိုမှု မမှန်ကန်ပါ။' }, 400);
  const payload = body as Record<string, unknown>;
  const requestId = payload.requestId;
  const requestedStake = payload.stake;
  if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return json({ success: false, code: 'INVALID_REQUEST_ID', error: 'လှည့်မှုကို မစတင်နိုင်ပါ။ ပြန်ကြိုးစားပါ။' }, 400);
  }
  if (!isSakuraRoundStake(requestedStake)) return json({ success: false, code: 'INVALID_BET', error: 'လောင်းကြေးပမာဏ မမှန်ကန်ပါ။' }, 400);

  const client = getTursoClient();
  if (!client) return json({ success: false, code: 'GAME_UNAVAILABLE', error: 'Wallet ဝန်ဆောင်မှု ယာယီမရနိုင်ပါ။' }, 503);

  let tx: Awaited<ReturnType<typeof client.transaction>> | null = null;
  try {
    await ensureSakuraSchema(client);
    const existing = await findExisting(client, user.uid, requestId, requestedStake);
    if (existing?.conflict) return json({ success: false, code: 'IDEMPOTENCY_CONFLICT', error: 'လှည့်မှုကို ပြီးမြောက်စေ၍မရပါ။ ပြန်ကြိုးစားပါ။' }, 409);
    if (existing) return json({ success: true, spin: existing.spin, replayed: true });

    tx = await client.transaction('write');
    const duplicate = await tx.execute({
      sql: 'SELECT * FROM sakura_spins WHERE userId = ? AND requestId = ? LIMIT 1',
      args: [user.uid, requestId],
    });
    const duplicateRow = duplicate.rows[0] as DbRow | undefined;
    if (duplicateRow) {
      const wallet = await tx.execute({ sql: 'SELECT balance FROM users WHERE uid = ? LIMIT 1', args: [user.uid] });
      await tx.rollback();
      if (Number(duplicateRow.requestedStake) !== requestedStake) return json({ success: false, code: 'IDEMPOTENCY_CONFLICT', error: 'လှည့်မှုကို ပြီးမြောက်စေ၍မရပါ။ ပြန်ကြိုးစားပါ။' }, 409);
      return json({ success: true, spin: storedSpin(duplicateRow, Number(wallet.rows[0]?.balance || 0)), replayed: true });
    }

    const rtpConfig = await tx.execute({
      sql: 'SELECT value FROM settings WHERE key = ? LIMIT 1',
      args: ['sakura_rtp_percent'],
    });
    const savedRtpPercent = Number(rtpConfig.rows[0]?.value);
    const rtpPercent = isSakuraRtpPercent(savedRtpPercent) ? savedRtpPercent : DEFAULT_SAKURA_RTP_PERCENT;

    const stateResult = await tx.execute({
      sql: `SELECT freeSpinsRemaining, freeSpinStake, freeSpinWinPending, pendingBonusId
        FROM sakura_player_state WHERE userId = ? LIMIT 1`,
      args: [user.uid],
    });
    const playerState = stateResult.rows[0] as DbRow | undefined;
    if (String(playerState?.pendingBonusId || '')) {
      await tx.rollback();
      return json({ success: false, code: 'BONUS_PENDING', error: 'အရင်ရရှိထားသော အနိုင်ငွေကို လက်ခံပါ။' }, 409);
    }
    const freeSpinsBefore = Number(playerState?.freeSpinsRemaining || 0);
    const isFreeSpin = freeSpinsBefore > 0;
    if (!isFreeSpin && !isSakuraBet(requestedStake)) {
      await tx.rollback();
      return json({ success: false, code: 'INVALID_BET', error: 'လောင်းကြေးပမာဏ မမှန်ကန်ပါ။' }, 400);
    }
    const stake = isFreeSpin ? Number(playerState?.freeSpinStake || 0) : requestedStake;
    if (!isSakuraRoundStake(stake)) {
      await tx.rollback();
      return json({ success: false, code: 'INVALID_SERVER_STATE', error: 'လှည့်မှုကို ယခု မစတင်နိုင်ပါ။ ပြန်ကြိုးစားပါ။' }, 409);
    }

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
        return json({ success: false, code: 'INSUFFICIENT_FUNDS', error: 'Wallet ထဲရှိငွေ မလုံလောက်ပါ။', balance: Number(latest.rows[0]?.balance || 0) }, 402);
      }
      charged = stake;
    } else {
      await tx.execute({ sql: 'UPDATE users SET updatedAt = ? WHERE uid = ?', args: [Date.now(), user.uid] });
    }

    const outcome = createSakuraOutcome(stake, isFreeSpin, undefined, rtpPercent);
    const freeSpinsRemaining = isFreeSpin
      ? freeSpinsBefore - 1
      : outcome.freeSpinsAwarded;
    const originalStake = isFreeSpin ? Number(playerState?.freeSpinStake || stake) : stake;
    const freeSpinWinTotal = isFreeSpin ? Number(playerState?.freeSpinWinPending || 0) + outcome.payout : 0;
    const freeSpinFeatureFinished = isFreeSpin && freeSpinsRemaining === 0;
    const pendingBonusId = freeSpinFeatureFinished && freeSpinWinTotal > 0
      ? `sakura_bonus_${randomUUID()}`
      : '';
    const pendingBonusSpinId = pendingBonusId ? `sakura_${randomUUID()}` : '';
    const creditedPayout = isFreeSpin ? 0 : outcome.payout;
    const freeSpinWinPending = isFreeSpin && (freeSpinsRemaining > 0 || Boolean(pendingBonusId))
      ? freeSpinWinTotal
      : 0;
    const freeSpinStake = freeSpinsRemaining > 0 || Boolean(pendingBonusId) ? originalStake : 0;
    const spinId = pendingBonusSpinId || `sakura_${randomUUID()}`;
    const createdAt = Date.now();

    if (creditedPayout > 0) {
      const credit = await tx.execute({
        sql: 'UPDATE users SET balance = balance + ?, updatedAt = ? WHERE uid = ?',
        args: [creditedPayout, Date.now(), user.uid],
      });
      if (credit.rowsAffected !== 1) throw new Error('Sakura wallet credit did not update a user row');
    }
    await tx.execute({
      sql: `INSERT INTO sakura_player_state (
        userId, freeSpinsRemaining, freeSpinStake, freeSpinWinPending, pendingBonusId, pendingBonusSpinId, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(userId) DO UPDATE SET freeSpinsRemaining = excluded.freeSpinsRemaining,
          freeSpinStake = excluded.freeSpinStake, freeSpinWinPending = excluded.freeSpinWinPending,
          pendingBonusId = excluded.pendingBonusId, pendingBonusSpinId = excluded.pendingBonusSpinId,
          updatedAt = excluded.updatedAt`,
      args: [user.uid, freeSpinsRemaining, freeSpinStake, freeSpinWinPending, pendingBonusId, pendingBonusSpinId, createdAt],
    });
    const balanceResult = await tx.execute({ sql: 'SELECT balance FROM users WHERE uid = ? LIMIT 1', args: [user.uid] });
    const balanceAfter = Number(balanceResult.rows[0]?.balance);
    if (!Number.isSafeInteger(balanceAfter) || balanceAfter < 0) throw new Error('Sakura wallet returned an invalid balance');

    const appliedRtpVersion = `${SAKURA_RTP_VERSION}:${rtpPercent}`;
    await tx.execute({
      sql: `INSERT INTO sakura_spins (
        id, userId, requestId, requestedStake, stake, charged, payout, creditedPayout, balanceAfter, isFreeSpin,
        initialGridJson, stepsJson, scatterCount, freeSpinsAwarded, freeSpinsRemaining,
        freeSpinWinTotal, freeSpinFeatureFinished, pendingBonusId, rtpVersion, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [spinId, user.uid, requestId, requestedStake, stake, charged, outcome.payout, creditedPayout, balanceAfter,
        isFreeSpin ? 1 : 0, JSON.stringify(outcome.initialGrid), JSON.stringify(outcome.steps),
        outcome.scatterCount, outcome.freeSpinsAwarded, freeSpinsRemaining, freeSpinWinTotal,
        freeSpinFeatureFinished ? 1 : 0, pendingBonusId, appliedRtpVersion, createdAt],
    });
    const finalMultiplier = outcome.steps.at(-1)?.multiplier || (isFreeSpin ? 2 : 1);
    await tx.execute({
      sql: `INSERT INTO bets (
        id, betId, roundId, userId, userName, betKind, selection, amount, multiplier,
        status, payout, profit, result, createdAt, settledAt
      ) VALUES (?, ?, ?, ?, ?, 'slot', 'Sakura Fortune', ?, ?, ?, ?, ?, NULL, ?, ?)`,
      args: [spinId, spinId, createdAt, user.uid, user.fullName, charged, finalMultiplier,
        outcome.payout > 0 ? 'win' : 'loss', outcome.payout, outcome.payout - charged, createdAt, createdAt],
    });
    await tx.commit();
    const spin = {
      id: spinId,
      requestId,
      stake,
      charged,
      payout: outcome.payout,
      creditedPayout,
      balance: balanceAfter,
      isFreeSpin,
      initialGrid: outcome.initialGrid,
      finalGrid: outcome.finalGrid,
      steps: outcome.steps,
      scatterCount: outcome.scatterCount,
      freeSpinsAwarded: outcome.freeSpinsAwarded,
      freeSpinsRemaining,
      freeSpinWinTotal,
      freeSpinFeatureFinished,
      pendingBonusId,
    };
    return json({ success: true, spin, replayed: false });
  } catch (error) {
    try { if (tx && !tx.closed) await tx.rollback(); } catch {}
    try { tx?.close(); } catch {}
    console.error('Sakura spin settlement failed:', error);
    // A commit response can be lost after the write succeeded. Look up the idempotency key before asking the client to retry.
    try {
      const existing = await findExisting(client, user.uid, requestId, requestedStake);
      if (existing?.conflict) return json({ success: false, code: 'IDEMPOTENCY_CONFLICT', error: 'လှည့်မှုကို ပြီးမြောက်စေ၍မရပါ။ ပြန်ကြိုးစားပါ။' }, 409);
      if (existing) return json({ success: true, spin: existing.spin, replayed: true });
    } catch {}
    return json({ success: false, code: 'SETTLEMENT_UNCERTAIN', error: 'လှည့်မှုကို ယခု မပြီးစီးနိုင်ပါ။ ခဏကြာပြီးမှ ပြန်ကြိုးစားပါ။' }, 503);
  } finally {
    try { tx?.close(); } catch {}
  }
}

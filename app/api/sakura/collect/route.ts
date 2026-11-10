import { NextRequest, NextResponse } from 'next/server';
import type { Client } from '@libsql/client';
import { ensureSakuraSchema, getTursoClient } from '@/lib/turso';
import { getSessionUser } from '@/lib/tursoAuth';

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
    if (configuredOrigin) return parsedOrigin.origin === new URL(configuredOrigin).origin;
    return parsedOrigin.host.toLowerCase() === host &&
      (parsedOrigin.protocol === 'https:' || parsedOrigin.protocol === new URL(req.url).protocol);
  } catch {
    return false;
  }
}

async function currentBalance(client: Client, userId: string) {
  const wallet = await client.execute({ sql: 'SELECT balance FROM users WHERE uid = ? LIMIT 1', args: [userId] });
  const balance = Number(wallet.rows[0]?.balance);
  if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('Invalid wallet balance');
  return balance;
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return json({ success: false, code: 'INVALID_ORIGIN', error: 'လုပ်ဆောင်မှုကို ယခု မပြီးစီးနိုင်ပါ။' }, 403);
  const user = await getSessionUser();
  if (!user) return json({ success: false, code: 'UNAUTHENTICATED', error: 'အကောင့်ဝင်ပြီး ပြန်လုပ်ပါ။' }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, code: 'INVALID_REQUEST', error: 'တောင်းဆိုမှု မမှန်ကန်ပါ။' }, 400);
  }
  const bonusId = body && typeof body === 'object' ? (body as Record<string, unknown>).bonusId : null;
  if (typeof bonusId !== 'string' || !/^sakura_bonus_[0-9a-f-]{36}$/i.test(bonusId)) {
    return json({ success: false, code: 'INVALID_REQUEST', error: 'အနိုင်ငွေကို လက်ခံ၍မရပါ။' }, 400);
  }

  const client = getTursoClient();
  if (!client) return json({ success: false, code: 'GAME_UNAVAILABLE', error: 'အနိုင်ငွေကို ယခု လက်ခံ၍မရသေးပါ။' }, 503);

  let tx: Awaited<ReturnType<typeof client.transaction>> | null = null;
  try {
    await ensureSakuraSchema(client);
    tx = await client.transaction('write');

    const prior = await tx.execute({
      sql: 'SELECT amount FROM sakura_bonus_collections WHERE bonusId = ? AND userId = ? LIMIT 1',
      args: [bonusId, user.uid],
    });
    if (prior.rows[0]) {
      const wallet = await tx.execute({ sql: 'SELECT balance FROM users WHERE uid = ? LIMIT 1', args: [user.uid] });
      const balance = Number(wallet.rows[0]?.balance);
      if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('Invalid wallet balance');
      const amount = Number((prior.rows[0] as DbRow).amount);
      await tx.rollback();
      return json({ success: true, balance, collectedAmount: amount, replayed: true });
    }

    const stateResult = await tx.execute({
      sql: `SELECT freeSpinsRemaining, freeSpinWinPending, pendingBonusId, pendingBonusSpinId
        FROM sakura_player_state WHERE userId = ? LIMIT 1`,
      args: [user.uid],
    });
    const state = stateResult.rows[0] as DbRow | undefined;
    const amount = Number(state?.freeSpinWinPending || 0);
    const finalSpinId = String(state?.pendingBonusSpinId || '');
    if (String(state?.pendingBonusId || '') !== bonusId || Number(state?.freeSpinsRemaining || 0) !== 0 ||
        !Number.isSafeInteger(amount) || amount <= 0 || !finalSpinId) {
      await tx.rollback();
      return json({ success: false, code: 'BONUS_NOT_PENDING', error: 'အနိုင်ငွေကို လက်ခံ၍မရပါ။ ပြန်စမ်းပါ။' }, 409);
    }

    const debitOrCredit = await tx.execute({
      sql: 'UPDATE users SET balance = balance + ?, updatedAt = ? WHERE uid = ?',
      args: [amount, Date.now(), user.uid],
    });
    if (debitOrCredit.rowsAffected !== 1) throw new Error('Bonus wallet update did not affect one row');
    const wallet = await tx.execute({ sql: 'SELECT balance FROM users WHERE uid = ? LIMIT 1', args: [user.uid] });
    const balance = Number(wallet.rows[0]?.balance);
    if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('Invalid wallet balance');
    const createdAt = Date.now();

    await tx.execute({
      sql: `INSERT INTO sakura_bonus_collections (bonusId, userId, finalSpinId, amount, balanceAfter, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)`,
      args: [bonusId, user.uid, finalSpinId, amount, balance, createdAt],
    });
    const spinUpdate = await tx.execute({
      sql: `UPDATE sakura_spins SET creditedPayout = creditedPayout + ?, balanceAfter = ?
        WHERE id = ? AND userId = ?`,
      args: [amount, balance, finalSpinId, user.uid],
    });
    if (spinUpdate.rowsAffected !== 1) throw new Error('Final bonus spin record was missing');
    const stateUpdate = await tx.execute({
      sql: `UPDATE sakura_player_state SET freeSpinWinPending = 0, freeSpinStake = 0,
        pendingBonusId = '', pendingBonusSpinId = '', updatedAt = ?
        WHERE userId = ? AND pendingBonusId = ? AND freeSpinWinPending = ?`,
      args: [createdAt, user.uid, bonusId, amount],
    });
    if (stateUpdate.rowsAffected !== 1) throw new Error('Pending bonus state changed unexpectedly');

    await tx.commit();
    return json({ success: true, balance, collectedAmount: amount, replayed: false });
  } catch (error) {
    try { if (tx && !tx.closed) await tx.rollback(); } catch {}
    console.error('Sakura bonus collection failed:', error);
    try {
      const prior = await client.execute({
        sql: 'SELECT amount FROM sakura_bonus_collections WHERE bonusId = ? AND userId = ? LIMIT 1',
        args: [bonusId, user.uid],
      });
      if (prior.rows[0]) {
        const balance = await currentBalance(client, user.uid);
        return json({ success: true, balance, collectedAmount: Number((prior.rows[0] as DbRow).amount), replayed: true });
      }
    } catch {}
    return json({ success: false, code: 'COLLECTION_UNCERTAIN', error: 'အနိုင်ငွေကို ယခု လက်ခံ၍မရသေးပါ။ ပြန်လုပ်နိုင်ပါသည်။' }, 503);
  } finally {
    try { tx?.close(); } catch {}
  }
}

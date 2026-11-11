import { randomUUID } from 'node:crypto';
import type { Client } from '@libsql/client';
import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient, initTursoSchema } from '@/lib/turso';
import { requireAdmin } from '@/lib/adminAuth';

const noStore = { 'Cache-Control': 'no-store, max-age=0' };

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host')?.trim().toLowerCase();
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host.toLowerCase() === host &&
      (parsed.protocol === 'https:' || parsed.protocol === new URL(req.url).protocol);
  } catch {
    return false;
  }
}

function dailyDayKey(timestamp: number) {
  // Myanmar is UTC+06:30 year-round; use the request's day, not review time.
  return new Date(timestamp + 390 * 60 * 1000).toISOString().slice(0, 10);
}

async function approveDepositWithDailyBonus(
  client: Client,
  input: { requestId: string; userId: string; amount: number; submittedAt: number; note: string; now: number },
) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error('INVALID_DEPOSIT_AMOUNT');
  const dayKey = dailyDayKey(input.submittedAt || input.now);
  const tx = await client.transaction('write');
  try {
    const current = await tx.execute({
      sql: "SELECT status FROM deposits WHERE id = ? LIMIT 1",
      args: [input.requestId],
    });
    if (current.rows[0]?.status !== 'processing') throw new Error('DEPOSIT_REVIEW_CONFLICT');

    const setting = await tx.execute({
      sql: 'SELECT value FROM settings WHERE key = ? LIMIT 1',
      args: ['daily_deposit_bonus_percent'],
    });
    const savedPercent = Number(setting.rows[0]?.value);
    const configuredPercent = Number.isInteger(savedPercent) && savedPercent >= 0 && savedPercent <= 100
      ? savedPercent
      : 0;
    const proposedBonus = Math.floor(input.amount * configuredPercent / 100);
    if (!Number.isSafeInteger(proposedBonus) || !Number.isSafeInteger(input.amount + proposedBonus)) {
      throw new Error('INVALID_DEPOSIT_BONUS_AMOUNT');
    }

    const claim = await tx.execute({
      sql: `INSERT INTO daily_deposit_bonus_claims (
        userId, dayKey, depositId, depositAmount, bonusPercent, bonusAmount, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(userId, dayKey) DO NOTHING`,
      args: [input.userId, dayKey, input.requestId, input.amount, configuredPercent, proposedBonus, input.now],
    });
    const earnedDailyBonus = claim.rowsAffected === 1;
    const bonusPercent = earnedDailyBonus ? configuredPercent : 0;
    const bonusAmount = earnedDailyBonus ? proposedBonus : 0;
    const totalCredit = input.amount + bonusAmount;

    const balance = await tx.execute({
      sql: `UPDATE users SET balance = COALESCE(balance, 0) + ?,
        totalSuccessfulDeposit = COALESCE(totalSuccessfulDeposit, 0) + ?,
        hasSuccessfulDeposit = 1, updatedAt = ? WHERE uid = ?`,
      args: [totalCredit, input.amount, input.now, input.userId],
    });
    if (balance.rowsAffected !== 1) throw new Error('DEPOSIT_USER_NOT_FOUND');

    const finalized = await tx.execute({
      sql: `UPDATE deposits SET status = 'completed', completedAt = ?, reviewedAt = ?,
        reviewedBy = 'admin', reviewNote = ? WHERE id = ? AND status = 'processing'`,
      args: [input.now, input.now, input.note, input.requestId],
    });
    if (finalized.rowsAffected !== 1) throw new Error('DEPOSIT_REVIEW_CONFLICT');

    const auditNote = `Deposit ${input.amount} MMK; daily bonus ${bonusPercent}% = ${bonusAmount} MMK; day ${dayKey}${input.note ? `; ${input.note}` : ''}`;
    await tx.execute({
      sql: 'INSERT INTO admin_audit_logs (id, action, targetUid, amount, note, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      args: [`audit_${randomUUID()}`, 'deposit_approve', input.userId, totalCredit, auditNote, input.now],
    });
    await tx.commit();
    return { amount: input.amount, bonusAmount, bonusPercent, dailyBonusAlreadyUsed: !earnedDailyBonus, dayKey, userId: input.userId };
  } catch (error) {
    try { if (!tx.closed) await tx.rollback(); } catch {}
    throw error;
  } finally {
    try { tx.close(); } catch {}
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ success: false, error: 'တောင်းဆိုမှုကို အတည်မပြုနိုင်ပါ။' }, { status: 403, headers: noStore });
  }
  try {
    await requireAdmin();
    const { type, id, decision, note } = await req.json();
    if (!['deposit', 'withdrawal'].includes(type) || !id || !['approve', 'reject'].includes(decision)) {
      return NextResponse.json({ success: false, error: 'Invalid review request' }, { status: 400, headers: noStore });
    }
    const client = getTursoClient();
    if (!client) throw new Error('Turso is not configured');
    await initTursoSchema(client);
    const table = type === 'deposit' ? 'deposits' : 'withdrawals';
    const idColumn = type === 'deposit' ? 'depositId' : 'withdrawalId';
    const row = await client.execute({ sql: `SELECT * FROM ${table} WHERE id = ? OR ${idColumn} = ? LIMIT 1`, args: [id, id] });
    const item = row.rows[0] as Record<string, unknown> | undefined;
    if (!item || item.status !== 'pending') {
      return NextResponse.json({ success: false, error: 'Pending request မတွေ့ပါ သို့မဟုတ် စစ်ပြီးသားဖြစ်ပါသည်' }, { status: 409, headers: noStore });
    }

    const requestId = String(item.id);
    const now = Date.now();
    const claimed = await client.execute({
      sql: `UPDATE ${table} SET status = 'processing', reviewedAt = ?, reviewedBy = ?, reviewNote = ? WHERE id = ? AND status = 'pending'`,
      args: [now, 'admin', String(note || ''), requestId],
    });
    if (!claimed.rowsAffected) {
      return NextResponse.json({ success: false, error: 'ဤတောင်းဆိုမှုကို အခြား administrator က စစ်ဆေးနေပြီးဖြစ်ပါသည်' }, { status: 409, headers: noStore });
    }

    const amount = Number(item.amount) || 0;
    const userId = String(item.userId);
    const reviewNote = String(note || '');
    const releaseClaim = async () => {
      await client.execute({ sql: `UPDATE ${table} SET status = 'pending', reviewedAt = NULL, reviewedBy = NULL, reviewNote = NULL WHERE id = ? AND status = 'processing'`, args: [requestId] });
    };

    if (decision === 'approve' && type === 'deposit') {
      try {
        const result = await approveDepositWithDailyBonus(client, {
          requestId,
          userId,
          amount,
          submittedAt: Number(item.createdAt) || now,
          note: reviewNote,
          now,
        });
        return NextResponse.json({ success: true, ...result }, { headers: noStore });
      } catch (error) {
        try { await releaseClaim(); } catch {}
        if (error instanceof Error && error.message === 'DEPOSIT_REVIEW_CONFLICT') {
          return NextResponse.json({ success: false, error: 'ဤငွေသွင်းတောင်းဆိုမှုကို ပြန်လည်စစ်ဆေးပါ။' }, { status: 409, headers: noStore });
        }
        if (error instanceof Error && error.message === 'INVALID_DEPOSIT_AMOUNT') {
          return NextResponse.json({ success: false, error: 'ငွေသွင်းပမာဏ မမှန်ကန်ပါ။' }, { status: 400, headers: noStore });
        }
        throw error;
      }
    }

    if (decision === 'approve' && type === 'withdrawal') {
      const balance = await client.execute({
        sql: 'UPDATE users SET balance = balance - ?, withdrawalCount = withdrawalCount + 1, updatedAt = ? WHERE uid = ? AND balance >= ?',
        args: [amount, now, userId, amount],
      });
      if (!balance.rowsAffected) {
        await releaseClaim();
        return NextResponse.json({ success: false, error: 'User balance မလုံလောက်ပါ' }, { status: 400, headers: noStore });
      }
    }

    const status = decision === 'approve' ? 'completed' : 'declined';
    const finalized = await client.execute({
      sql: `UPDATE ${table} SET status = ?, completedAt = ?, reviewedAt = ?, reviewedBy = ?, reviewNote = ?${type === 'withdrawal' ? ', rejectionReason = ?' : ''} WHERE id = ? AND status = 'processing'`,
      args: type === 'withdrawal'
        ? [status, decision === 'approve' ? now : null, now, 'admin', reviewNote, decision === 'reject' ? reviewNote : '', requestId]
        : [status, decision === 'approve' ? now : null, now, 'admin', reviewNote, requestId],
    });
    if (!finalized.rowsAffected) {
      return NextResponse.json({ success: false, error: 'Review status update မအောင်မြင်ပါ' }, { status: 500, headers: noStore });
    }

    await client.execute({
      sql: 'INSERT INTO admin_audit_logs (id, action, targetUid, amount, note, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      args: [`audit_${now}_${Math.random().toString(36).slice(2, 10)}`, `${type}_${decision}`, userId, amount, reviewNote, now],
    });
    return NextResponse.json({ success: true, amount, userId }, { headers: noStore });
  } catch (error) {
    const status = error instanceof Error && error.message === 'ADMIN_UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ success: false, error: status === 401 ? 'Unauthorized' : 'Review မအောင်မြင်ပါ' }, { status, headers: noStore });
  }
}

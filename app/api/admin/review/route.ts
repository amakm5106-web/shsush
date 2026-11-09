import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient, initTursoSchema } from '@/lib/turso';
import { requireAdmin } from '@/lib/adminAuth';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { type, id, decision, note } = await req.json();
    if (!['deposit', 'withdrawal'].includes(type) || !id || !['approve', 'reject'].includes(decision)) {
      return NextResponse.json({ success: false, error: 'Invalid review request' }, { status: 400 });
    }
    const client = getTursoClient();
    if (!client) throw new Error('Turso is not configured');
    await initTursoSchema(client);
    const table = type === 'deposit' ? 'deposits' : 'withdrawals';
    const idColumn = type === 'deposit' ? 'depositId' : 'withdrawalId';
    const row = await client.execute({ sql: `SELECT * FROM ${table} WHERE id = ? OR ${idColumn} = ? LIMIT 1`, args: [id, id] });
    const item = row.rows[0] as Record<string, unknown> | undefined;
    if (!item || item.status !== 'pending') {
      return NextResponse.json({ success: false, error: 'Pending request မတွေ့ပါ သို့မဟုတ် စစ်ပြီးသားဖြစ်ပါသည်' }, { status: 409 });
    }

    const requestId = String(item.id);
    const now = Date.now();
    const claimed = await client.execute({
      sql: `UPDATE ${table} SET status = 'processing', reviewedAt = ?, reviewedBy = ?, reviewNote = ? WHERE id = ? AND status = 'pending'`,
      args: [now, 'admin', String(note || ''), requestId],
    });
    if (!claimed.rowsAffected) {
      return NextResponse.json({ success: false, error: 'ဤတောင်းဆိုမှုကို အခြား administrator က စစ်ဆေးနေပြီးဖြစ်ပါသည်' }, { status: 409 });
    }

    const amount = Number(item.amount) || 0;
    const userId = String(item.userId);
    const releaseClaim = async () => {
      await client.execute({ sql: `UPDATE ${table} SET status = 'pending', reviewedAt = NULL, reviewedBy = NULL, reviewNote = NULL WHERE id = ? AND status = 'processing'`, args: [requestId] });
    };

    if (decision === 'approve' && type === 'withdrawal') {
      const balance = await client.execute({
        sql: 'UPDATE users SET balance = balance - ?, withdrawalCount = withdrawalCount + 1, updatedAt = ? WHERE uid = ? AND balance >= ?',
        args: [amount, now, userId, amount],
      });
      if (!balance.rowsAffected) {
        await releaseClaim();
        return NextResponse.json({ success: false, error: 'User balance မလုံလောက်ပါ' }, { status: 400 });
      }
    }
    if (decision === 'approve' && type === 'deposit') {
      const balance = await client.execute({
        sql: 'UPDATE users SET balance = balance + ?, totalSuccessfulDeposit = totalSuccessfulDeposit + ?, hasSuccessfulDeposit = 1, updatedAt = ? WHERE uid = ?',
        args: [amount, amount, now, userId],
      });
      if (!balance.rowsAffected) {
        await releaseClaim();
        return NextResponse.json({ success: false, error: 'User မတွေ့ပါ' }, { status: 400 });
      }
    }

    const status = decision === 'approve' ? 'completed' : 'declined';
    const finalized = await client.execute({
      sql: `UPDATE ${table} SET status = ?, completedAt = ?, reviewedAt = ?, reviewedBy = ?, reviewNote = ?${type === 'withdrawal' ? ', rejectionReason = ?' : ''} WHERE id = ? AND status = 'processing'`,
      args: type === 'withdrawal'
        ? [status, decision === 'approve' ? now : null, now, 'admin', String(note || ''), decision === 'reject' ? String(note || '') : '', requestId]
        : [status, decision === 'approve' ? now : null, now, 'admin', String(note || ''), requestId],
    });
    if (!finalized.rowsAffected) {
      return NextResponse.json({ success: false, error: 'Review status update မအောင်မြင်ပါ' }, { status: 500 });
    }

    await client.execute({
      sql: 'INSERT INTO admin_audit_logs (id, action, targetUid, amount, note, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      args: [`audit_${now}_${Math.random().toString(36).slice(2, 10)}`, `${type}_${decision}`, userId, amount, String(note || ''), now],
    });
    return NextResponse.json({ success: true, amount, userId }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof Error && error.message === 'ADMIN_UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ success: false, error: status === 401 ? 'Unauthorized' : 'Review မအောင်မြင်ပါ' }, { status });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { validateBotAuth, adjustUserBalanceUnified } from '@/lib/botApi';
import { getTursoClient } from '@/lib/turso';
import { formatKs } from '@/lib/constants';

export async function POST(req: NextRequest) {
  const authCheck = validateBotAuth(req);
  if (!authCheck.authorized) return NextResponse.json({ success: false, error: authCheck.error }, { status: 401 });
  try {
    const body = await req.json();
    const type = body.type as 'deposit' | 'withdrawal';
    const id = body.id || body.depositId || body.withdrawalId;
    const action = body.action as 'approve' | 'decline';
    const reason = String(body.reason || body.note || (action === 'approve' ? 'Approved via Telegram CS Bot' : 'Declined via Telegram CS Bot'));
    if (!['deposit', 'withdrawal'].includes(type) || !id || !['approve', 'decline'].includes(action)) return NextResponse.json({ success: false, error: 'Invalid review request' }, { status: 400 });
    const turso = getTursoClient();
    if (!turso) throw new Error('Turso is not configured');
    const table = type === 'deposit' ? 'deposits' : 'withdrawals';
    const key = type === 'deposit' ? 'depositId' : 'withdrawalId';
    const found = await turso.execute({ sql: `SELECT * FROM ${table} WHERE id = ? OR ${key} = ? LIMIT 1`, args: [id, id] });
    const item = found.rows[0] as Record<string, unknown> | undefined;
    if (!item) return NextResponse.json({ success: false, error: `${type} '${id}' not found` }, { status: 404 });
    if (item.status !== 'pending') return NextResponse.json({ success: false, error: 'Request has already been reviewed' }, { status: 409 });
    const amount = Number(item.amount) || 0;
    const userId = String(item.userId);
    const now = Date.now();
    if (action === 'approve' && type === 'deposit') {
      const result = await adjustUserBalanceUnified(userId, amount, `Deposit Approved: ${id}`);
      if (!result.success) return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    if (action === 'approve' && type === 'withdrawal') {
      const result = await adjustUserBalanceUnified(userId, -amount, `Withdrawal Approved: ${id}`);
      if (!result.success) return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    if (action === 'decline' && type === 'withdrawal') {
      const result = await adjustUserBalanceUnified(userId, amount, `Withdrawal Refunded: ${id}`);
      if (!result.success) return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    const status = action === 'approve' ? 'completed' : 'declined';
    const result = await turso.execute({ sql: `UPDATE ${table} SET status = ?, reviewedAt = ?, reviewedBy = ?, reviewNote = ?, completedAt = ?${type === 'withdrawal' ? ', rejectionReason = ?' : ''} WHERE id = ? AND status = 'pending'`, args: type === 'withdrawal' ? [status, now, 'Telegram CS Bot', reason, action === 'approve' ? now : null, action === 'decline' ? reason : '', String(item.id)] : [status, now, 'Telegram CS Bot', reason, action === 'approve' ? now : null, String(item.id)] });
    if (!result.rowsAffected) return NextResponse.json({ success: false, error: 'Request was reviewed concurrently' }, { status: 409 });
    await turso.execute({ sql: 'INSERT INTO admin_audit_logs (id, action, targetUid, amount, note, createdAt) VALUES (?, ?, ?, ?, ?, ?)', args: [`audit_${now}_${Math.random().toString(36).slice(2, 8)}`, `${type}_${action}`, userId, amount, reason, now] });
    return NextResponse.json({ success: true, amount, userId, message: `${type === 'deposit' ? 'ငွေသွင်း' : 'ငွေထုတ်'} ${id} ${action === 'approve' ? 'အတည်ပြုပြီး' : 'ပယ်ချပြီး'}ပါပြီ။ ${formatKs(amount)}` });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

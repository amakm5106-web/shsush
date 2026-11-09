import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient, initTursoSchema } from '@/lib/turso';
import { requireAdmin } from '@/lib/adminAuth';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { type, id, decision, note } = await req.json();
    if (!['deposit', 'withdrawal'].includes(type) || !id || !['approve', 'reject'].includes(decision)) return NextResponse.json({ success: false, error: 'Invalid review request' }, { status: 400 });
    const client = getTursoClient(); if (!client) throw new Error('Turso is not configured'); await initTursoSchema(client);
    const table = type === 'deposit' ? 'deposits' : 'withdrawals';
    const row = await client.execute({ sql: `SELECT * FROM ${table} WHERE id = ? OR ${type === 'deposit' ? 'depositId' : 'withdrawalId'} = ? LIMIT 1`, args: [id, id] });
    const item = row.rows[0] as Record<string, unknown> | undefined;
    if (!item || item.status !== 'pending') return NextResponse.json({ success: false, error: 'Pending request မတွေ့ပါ သို့မဟုတ် စစ်ပြီးသားဖြစ်ပါသည်' }, { status: 400 });
    const now = Date.now();
    if (decision === 'approve' && type === 'withdrawal') {
      const balance = await client.execute({ sql: 'UPDATE users SET balance = balance - ?, withdrawalCount = withdrawalCount + 1, updatedAt = ? WHERE uid = ? AND balance >= ?', args: [Number(item.amount) || 0, now, String(item.userId), Number(item.amount) || 0] });
      if (!balance.rowsAffected) return NextResponse.json({ success: false, error: 'User balance မလုံလောက်ပါ' }, { status: 400 });
    }
    if (decision === 'approve' && type === 'deposit') {
      const balance = await client.execute({ sql: 'UPDATE users SET balance = balance + ?, totalSuccessfulDeposit = totalSuccessfulDeposit + ?, hasSuccessfulDeposit = 1, updatedAt = ? WHERE uid = ?', args: [Number(item.amount) || 0, Number(item.amount) || 0, now, String(item.userId)] });
      if (!balance.rowsAffected) return NextResponse.json({ success: false, error: 'User မတွေ့ပါ' }, { status: 400 });
    }
    const status = decision === 'approve' ? 'approved' : 'rejected';
    await client.execute({ sql: `UPDATE ${table} SET status = ?, reviewedAt = ?${type === 'withdrawal' ? ', rejectionReason = ?' : ''} WHERE id = ? AND status = 'pending'`, args: type === 'withdrawal' ? [status, now, decision === 'reject' ? String(note || '') : '', String(item.id)] : [status, now, String(item.id)] });
    await client.execute({ sql: 'INSERT INTO admin_audit_logs (id, action, targetUid, amount, note, createdAt) VALUES (?, ?, ?, ?, ?, ?)', args: [`audit_${Date.now()}`, `${type}_${decision}`, String(item.userId), Number(item.amount) || 0, String(note || ''), now] });
    return NextResponse.json({ success: true });
  } catch (error) {
    const status = error instanceof Error && error.message === 'ADMIN_UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ success: false, error: status === 401 ? 'Unauthorized' : 'Review မအောင်မြင်ပါ' }, { status });
  }
}

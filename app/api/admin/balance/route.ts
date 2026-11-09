import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient, initTursoSchema } from '@/lib/turso';
import { requireAdmin } from '@/lib/adminAuth';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { uid, amount, action, note } = await req.json();
    const value = Math.floor(Number(amount));
    if (!uid || !Number.isFinite(value) || value <= 0 || !['topup', 'deduct'].includes(action)) return NextResponse.json({ success: false, error: 'Invalid balance request' }, { status: 400 });
    const client = getTursoClient(); if (!client) throw new Error('Turso is not configured'); await initTursoSchema(client);
    const delta = action === 'topup' ? value : -value;
    const result = await client.execute({ sql: action === 'topup' ? 'UPDATE users SET balance = balance + ?, updatedAt = ? WHERE uid = ?' : 'UPDATE users SET balance = balance - ?, updatedAt = ? WHERE uid = ? AND balance >= ?', args: action === 'topup' ? [value, Date.now(), uid] : [value, Date.now(), uid, value] });
    if (!result.rowsAffected) return NextResponse.json({ success: false, error: 'User မတွေ့ပါ သို့မဟုတ် balance မလုံလောက်ပါ' }, { status: 400 });
    await client.execute({ sql: 'INSERT INTO admin_audit_logs (id, action, targetUid, amount, note, createdAt) VALUES (?, ?, ?, ?, ?, ?)', args: [`audit_${Date.now()}`, action, uid, delta, String(note || ''), Date.now()] });
    return NextResponse.json({ success: true });
  } catch (error) {
    const status = error instanceof Error && error.message === 'ADMIN_UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ success: false, error: status === 401 ? 'Unauthorized' : 'Balance update မအောင်မြင်ပါ' }, { status });
  }
}

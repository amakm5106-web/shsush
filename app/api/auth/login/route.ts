import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';
import { ensureAuthSchema, rowToUser, setSession, verifyPassword } from '@/lib/tursoAuth';

export async function POST(req: NextRequest) {
  try {
    const { phone, password } = await req.json();
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    if (cleanPhone.length < 7 || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ success: false, error: 'ဖုန်းနံပါတ်နှင့် password မှန်ကန်စွာ ထည့်ပါ' }, { status: 400 });
    }
    await ensureAuthSchema();
    const client = getTursoClient();
    if (!client) throw new Error('Turso is not configured');
    const result = await client.execute({ sql: 'SELECT * FROM users WHERE phoneNumber = ? LIMIT 1', args: [cleanPhone] });
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row || !(await verifyPassword(password, String(row.passwordHash || '')))) {
      return NextResponse.json({ success: false, error: 'ဖုန်းနံပါတ် သို့မဟုတ် password မှားယွင်းနေပါသည်' }, { status: 401 });
    }
    await setSession(String(row.uid));
    return NextResponse.json({ success: true, user: rowToUser(row) });
  } catch (error) {
    console.error('Turso login error:', error);
    return NextResponse.json({ success: false, error: 'Login မအောင်မြင်ပါ' }, { status: 500 });
  }
}

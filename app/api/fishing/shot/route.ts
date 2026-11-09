import { NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';
import { getSessionUser } from '@/lib/tursoAuth';

export async function POST() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ success: false, error: 'အရင်ဆုံး Login ဝင်ပေးပါ' }, { status: 401 });
    }

    const client = getTursoClient();
    if (!client) {
      return NextResponse.json({ success: false, error: 'ငွေစာရင်းဝန်ဆောင်မှု မရနိုင်သေးပါ' }, { status: 503 });
    }

    const now = Date.now();
    const result = await client.execute({
      sql: 'UPDATE users SET balance = balance - 1, updatedAt = ? WHERE uid = ? AND balance >= 1',
      args: [now, sessionUser.uid],
    });

    if (result.rowsAffected !== 1) {
      return NextResponse.json({ success: false, error: 'Balance မလုံလောက်ပါ။ အနည်းဆုံး 1 MMK လိုအပ်ပါသည်', balance: sessionUser.balance }, { status: 402 });
    }

    const updated = await client.execute({
      sql: 'SELECT balance FROM users WHERE uid = ? LIMIT 1',
      args: [sessionUser.uid],
    });
    const balance = Number(updated.rows[0]?.balance || 0);

    return NextResponse.json({ success: true, charged: 1, balance });
  } catch (error) {
    console.error('Fishing shot charge error:', error);
    return NextResponse.json({ success: false, error: 'ကျည်ဖိုးဖြတ်ရာတွင် အဆင်မပြေပါ' }, { status: 500 });
  }
}

import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ensureAuthSchema, getSessionUser } from '@/lib/tursoAuth';
import { getTursoClient } from '@/lib/turso';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'ငွေသွင်းရန် အကောင့်ဝင်ပေးပါ။' }, { status: 401 });
    }

    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin) {
      return NextResponse.json({ success: false, error: 'Invalid request origin' }, { status: 403 });
    }

    const body = await req.json();
    const amount = Number(body?.amount);
    const method = body?.method;
    const trxLast5 = typeof body?.trxLast5 === 'string' ? body.trxLast5.trim() : '';

    if (!Number.isSafeInteger(amount) || amount < 1000) {
      return NextResponse.json({ success: false, error: 'ငွေသွင်းပမာဏ မမှန်ကန်ပါ။' }, { status: 400 });
    }
    if (method !== 'kpay' && method !== 'wave') {
      return NextResponse.json({ success: false, error: 'ငွေပေးချေမှုနည်းလမ်း မမှန်ကန်ပါ။' }, { status: 400 });
    }
    if (!/^\d{5}$/.test(trxLast5)) {
      return NextResponse.json({ success: false, error: 'ငွေလွှဲ ID ၏ နောက်ဆုံးဂဏန်း ၅ လုံးကို နံပါတ်ဖြင့်သာ ထည့်ပါ။' }, { status: 400 });
    }

    await ensureAuthSchema();
    const client = getTursoClient();
    if (!client) throw new Error('Turso is not configured');

    const now = Date.now();
    const depositId = `dep_${randomUUID()}`;
    const deposit = {
      id: depositId,
      depositId,
      userId: user.uid,
      userName: user.fullName,
      amount,
      method,
      trxLast5,
      receiptImage: trxLast5,
      status: 'pending',
      isFirstDeposit: !user.hasSuccessfulDeposit,
      createdAt: now,
    };

    await client.execute({
      sql: `INSERT INTO deposits (
        id, depositId, userId, userName, amount, method, receiptImage, trxLast5,
        status, isFirstDeposit, createdAt, balanceBeforeDeposit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?);`,
      args: [
        depositId,
        depositId,
        user.uid,
        user.fullName,
        amount,
        method,
        trxLast5,
        trxLast5,
        deposit.isFirstDeposit ? 1 : 0,
        now,
        Number(user.balance) || 0,
      ],
    });

    return NextResponse.json({ success: true, deposit }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Deposit submission error:', error);
    return NextResponse.json(
      { success: false, error: 'ငွေသွင်းတောင်းဆိုမှုကို သိမ်းဆည်းမရပါ။ ခဏကြာပြီး ပြန်ကြိုးစားပါ။' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

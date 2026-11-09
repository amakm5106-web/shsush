import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';
import { ensureAuthSchema, hashPassword, newUserId, rowToUser, setSession } from '@/lib/tursoAuth';

export async function POST(req: NextRequest) {
  try {
    const { phone, password, fullName, referralCode } = await req.json();
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    const name = String(fullName || '').trim();
    if (cleanPhone.length < 7 || password.length < 8 || name.length < 2) {
      return NextResponse.json({ success: false, error: 'ဖုန်းနံပါတ်၊ နာမည်နှင့် အနည်းဆုံး ၈ လုံး password ထည့်ပါ' }, { status: 400 });
    }
    await ensureAuthSchema();
    const client = getTursoClient();
    if (!client) throw new Error('Turso is not configured');
    const existing = await client.execute({ sql: 'SELECT uid FROM users WHERE phoneNumber = ? LIMIT 1', args: [cleanPhone] });
    if (existing.rows.length) return NextResponse.json({ success: false, error: 'ဤဖုန်းနံပါတ်ဖြင့် အကောင့်ရှိပြီးဖြစ်ပါသည်' }, { status: 409 });
    const now = Date.now();
    const uid = newUserId();
    const passwordHash = await hashPassword(String(password));
    await client.execute({
      sql: `INSERT INTO users (uid, fullName, email, phoneNumber, passwordHash, role, balance, referralBalance, referralsCount, depositedReferralsCount, referralTotalDeposits, totalBetCumulative, totalSuccessfulDeposit, withdrawalCount, wagerSinceLastWithdrawal, hasSuccessfulDeposit, firstDepositBonusClaimed, referralCode, referrerId, boundBank, isHedgingFlagged, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, 'user', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?, ?, '', 0, ?, ?)`,
      args: [uid, name, `${cleanPhone}@phone.local`, cleanPhone, passwordHash, referralCode ? String(referralCode).trim() : '', referralCode ? String(referralCode).trim() : '', now, now],
    });
    await setSession(uid);
    const result = await client.execute({ sql: 'SELECT * FROM users WHERE uid = ?', args: [uid] });
    return NextResponse.json({ success: true, user: rowToUser(result.rows[0] as Record<string, unknown>) });
  } catch (error) {
    console.error('Turso signup error:', error);
    return NextResponse.json({ success: false, error: 'အကောင့်ဖွင့်ခြင်း မအောင်မြင်ပါ' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { validateBotAuth } from '@/lib/botApi';
import { getTursoClient } from '@/lib/turso';
import { formatKs } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authCheck = validateBotAuth(req);
  if (!authCheck.authorized) {
    return NextResponse.json({ success: false, error: authCheck.error }, { status: 401 });
  }

  try {
    const turso = getTursoClient();
    if (!turso) {
      return NextResponse.json({ success: false, error: 'Database client unavailable' }, { status: 500 });
    }

    const [uRes, dRes, wRes, bRes, balRes] = await Promise.all([
      turso.execute('SELECT count(*) as count FROM users;').catch(() => ({ rows: [{ count: 0 }] })),
      turso.execute("SELECT count(*) as count FROM deposits WHERE status = 'pending';").catch(() => ({ rows: [{ count: 0 }] })),
      turso.execute("SELECT count(*) as count FROM withdrawals WHERE status = 'pending';").catch(() => ({ rows: [{ count: 0 }] })),
      turso.execute('SELECT count(*) as count FROM bets;').catch(() => ({ rows: [{ count: 0 }] })),
      turso.execute('SELECT sum(balance) as totalBal FROM users;').catch(() => ({ rows: [{ totalBal: 0 }] })),
    ]);

    const usersCount = Number(uRes.rows[0].count) || 0;
    const pendingDeposits = Number(dRes.rows[0].count) || 0;
    const pendingWithdrawals = Number(wRes.rows[0].count) || 0;
    const totalBets = Number(bRes.rows[0].count) || 0;
    const totalUserBalance = Number(balRes.rows[0].totalBal) || 0;

    const formattedText = `
📊 <b>X-Site Casino Dashboard Overview</b>
━━━━━━━━━━━━━━━━━━
👥 <b>စုစုပေါင်း မန်ဘာ (Users):</b> ${usersCount} ယောက်
💰 <b>မန်ဘာ Balance စုစုပေါင်း:</b> <b>${formatKs(totalUserBalance)}</b>
📥 <b>ဆိုင်းငံ့ ငွေသွင်း (Pending Deposits):</b> <b>${pendingDeposits}</b> ခု
📤 <b>ဆိုင်းငံ့ ငွေထုတ် (Pending Withdrawals):</b> <b>${pendingWithdrawals}</b> ခု
🎲 <b>စုစုပေါင်း လောင်းကြေးအကြိမ်:</b> ${totalBets} ကြိမ်
⏰ <b>အချိန်:</b> ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Yangon' })}
━━━━━━━━━━━━━━━━━━
`.trim();

    return NextResponse.json({
      success: true,
      stats: {
        usersCount,
        pendingDeposits,
        pendingWithdrawals,
        totalBets,
        totalUserBalance,
      },
      formattedText,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || String(error),
    }, { status: 500 });
  }
}

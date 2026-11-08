import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid');

    if (!uid) {
      return NextResponse.json({ success: false, error: 'UID required' }, { status: 400 });
    }

    const turso = getTursoClient();
    if (!turso) {
      return NextResponse.json({ success: false, error: 'Turso client unavailable' }, { status: 500 });
    }

    const res = await turso.execute({
      sql: 'SELECT * FROM users WHERE uid = ? LIMIT 1;',
      args: [uid],
    });

    if (res.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'User not found in Turso' }, { status: 404 });
    }

    const row = res.rows[0];
    let boundBank = null;
    if (row.boundBank && typeof row.boundBank === 'string') {
      try {
        boundBank = JSON.parse(row.boundBank);
      } catch {}
    }

    return NextResponse.json({
      success: true,
      user: {
        uid: row.uid,
        fullName: row.fullName,
        email: row.email,
        phoneNumber: row.phoneNumber,
        role: row.role,
        balance: Number(row.balance) || 0,
        referralBalance: Number(row.referralBalance) || 0,
        referralsCount: Number(row.referralsCount) || 0,
        depositedReferralsCount: Number(row.depositedReferralsCount) || 0,
        referralTotalDeposits: Number(row.referralTotalDeposits) || 0,
        totalBetCumulative: Number(row.totalBetCumulative) || 0,
        totalSuccessfulDeposit: Number(row.totalSuccessfulDeposit) || 0,
        withdrawalCount: Number(row.withdrawalCount) || 0,
        wagerSinceLastWithdrawal: Number(row.wagerSinceLastWithdrawal) || 0,
        hasSuccessfulDeposit: Boolean(row.hasSuccessfulDeposit),
        firstDepositBonusClaimed: Boolean(row.firstDepositBonusClaimed),
        referralCode: row.referralCode,
        referrerId: row.referrerId,
        boundBank,
        isHedgingFlagged: Boolean(row.isHedgingFlagged),
        createdAt: Number(row.createdAt),
        updatedAt: Number(row.updatedAt),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || String(error) }, { status: 500 });
  }
}

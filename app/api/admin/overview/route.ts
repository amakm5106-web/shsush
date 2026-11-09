import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient, initTursoSchema } from '@/lib/turso';
import { requireAdmin } from '@/lib/adminAuth';

async function db() { const client = getTursoClient(); if (!client) throw new Error('Turso is not configured'); await initTursoSchema(client); return client; }

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const client = await db();
    const q = new URL(req.url).searchParams.get('q')?.trim() || '';
    const [users, deposits, withdrawals, bets, stats] = await Promise.all([
      client.execute({ sql: q ? 'SELECT uid, fullName, email, phoneNumber, role, balance, referralBalance, referralsCount, depositedReferralsCount, referralTotalDeposits, totalBetCumulative, totalSuccessfulDeposit, withdrawalCount, wagerSinceLastWithdrawal, hasSuccessfulDeposit, firstDepositBonusClaimed, referralCode, referrerId, boundBank, isHedgingFlagged, createdAt, updatedAt FROM users WHERE uid LIKE ? OR fullName LIKE ? OR phoneNumber LIKE ? ORDER BY updatedAt DESC LIMIT 100' : 'SELECT uid, fullName, email, phoneNumber, role, balance, referralBalance, referralsCount, depositedReferralsCount, referralTotalDeposits, totalBetCumulative, totalSuccessfulDeposit, withdrawalCount, wagerSinceLastWithdrawal, hasSuccessfulDeposit, firstDepositBonusClaimed, referralCode, referrerId, boundBank, isHedgingFlagged, createdAt, updatedAt FROM users ORDER BY updatedAt DESC LIMIT 100', args: q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [] }),
      client.execute(`SELECT d.*, u.email AS accountEmail, u.phoneNumber AS accountPhone,
        u.balance AS accountBalance, d.balanceBeforeDeposit AS accountInitialBalance,
        u.referralBalance AS accountReferralBalance, u.referralsCount AS accountReferralsCount,
        u.referralCode AS accountReferralCode, u.referrerId AS accountReferrerId,
        u.totalBetCumulative AS accountTotalBetCumulative,
        u.totalSuccessfulDeposit AS accountTotalSuccessfulDeposit,
        u.withdrawalCount AS accountWithdrawalCount,
        u.hasSuccessfulDeposit AS accountHasSuccessfulDeposit,
        u.firstDepositBonusClaimed AS accountFirstDepositBonusClaimed,
        u.boundBank AS accountBoundBank, u.createdAt AS accountCreatedAt,
        u.updatedAt AS accountUpdatedAt
        FROM deposits d LEFT JOIN users u ON u.uid = d.userId
        WHERE d.status = 'pending' ORDER BY d.createdAt DESC LIMIT 100`),
      client.execute("SELECT * FROM withdrawals WHERE status = 'pending' ORDER BY createdAt DESC LIMIT 100"),
      client.execute('SELECT * FROM bets ORDER BY createdAt DESC LIMIT 30'),
      client.execute('SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COALESCE(SUM(balance),0) FROM users) AS balance, (SELECT COUNT(*) FROM deposits WHERE status = \'pending\') AS pendingDeposits, (SELECT COUNT(*) FROM withdrawals WHERE status = \'pending\') AS pendingWithdrawals'),
    ]);
    const depositRows = deposits.rows.map((row) => {
      const normalized = { ...row } as Record<string, unknown>;
      if (typeof normalized.accountBoundBank === 'string' && normalized.accountBoundBank) {
        try { normalized.accountBoundBank = JSON.parse(normalized.accountBoundBank); } catch { normalized.accountBoundBank = null; }
      }
      normalized.trxLast5 = normalized.trxLast5 || (!String(normalized.receiptImage || '').startsWith('data:image') ? normalized.receiptImage : '');
      return normalized;
    });
    return NextResponse.json(
      { success: true, users: users.rows, deposits: depositRows, withdrawals: withdrawals.rows, bets: bets.rows, stats: stats.rows[0] },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (error) {
    const status = error instanceof Error && error.message === 'ADMIN_UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ success: false, error: status === 401 ? 'Unauthorized' : 'Admin data မဖတ်နိုင်ပါ' }, { status });
  }
}

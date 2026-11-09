import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const turso = getTursoClient();

    if (!turso) {
      return NextResponse.json({ success: false, error: 'Turso client unavailable' }, { status: 500 });
    }

    const { type, data } = body;

    if (type === 'user' && data?.uid) {
      await turso.execute({
        sql: `INSERT OR REPLACE INTO users (
          uid, fullName, email, phoneNumber, passwordHash, role, balance, referralBalance,
          referralsCount, depositedReferralsCount, referralTotalDeposits, totalBetCumulative,
          totalSuccessfulDeposit, withdrawalCount, wagerSinceLastWithdrawal, hasSuccessfulDeposit,
          firstDepositBonusClaimed, referralCode, referrerId, boundBank, isHedgingFlagged,
          createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [
          data.uid,
          data.fullName || '',
          data.email || '',
          data.phoneNumber || data.phone || '',
          data.passwordHash || '',
          data.role || 'user',
          Number(data.balance) || 0,
          Number(data.referralBalance) || 0,
          Number(data.referralsCount) || 0,
          Number(data.depositedReferralsCount) || 0,
          Number(data.referralTotalDeposits) || 0,
          Number(data.totalBetCumulative) || 0,
          Number(data.totalSuccessfulDeposit) || 0,
          Number(data.withdrawalCount) || 0,
          Number(data.wagerSinceLastWithdrawal) || 0,
          data.hasSuccessfulDeposit ? 1 : 0,
          data.firstDepositBonusClaimed ? 1 : 0,
          data.referralCode || '',
          data.referrerId || '',
          data.boundBank ? JSON.stringify(data.boundBank) : '',
          data.isHedgingFlagged ? 1 : 0,
          Number(data.createdAt) || Date.now(),
          Number(data.updatedAt) || Date.now(),
        ],
      });
      return NextResponse.json({ success: true, message: 'User synced to Turso' });
    }

    if (type === 'bet' && data?.betId) {
      await turso.execute({
        sql: `INSERT OR REPLACE INTO bets (
          id, betId, roundId, userId, userName, betKind, selection, amount,
          multiplier, status, payout, profit, result, createdAt, settledAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [
          data.id || data.betId,
          data.betId,
          Number(data.roundId) || 0,
          data.userId || '',
          data.userName || '',
          data.betKind || 'size',
          data.selection || '',
          Number(data.amount) || 0,
          Number(data.multiplier) || 1.0,
          data.status || 'pending',
          Number(data.payout) || 0,
          Number(data.profit) || 0,
          data.result !== undefined ? Number(data.result) : null,
          Number(data.createdAt) || Date.now(),
          data.settledAt ? Number(data.settledAt) : null,
        ],
      });
      return NextResponse.json({ success: true, message: 'Bet synced to Turso' });
    }

    if (type === 'deposit' && data?.depositId) {
      await turso.execute({
        sql: `INSERT OR REPLACE INTO deposits (
          id, depositId, userId, userName, amount, method, phone, accountName,
          receiptImage, trxLast5, status, isFirstDeposit, createdAt, reviewedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [
          data.id || data.depositId,
          data.depositId,
          data.userId || '',
          data.userName || '',
          Number(data.amount) || 0,
          data.method || 'kpay',
          data.phone || '',
          data.accountName || '',
          data.receiptImage || data.trxLast5 || '',
          data.trxLast5 || data.receiptImage || '',
          data.status || 'pending',
          data.isFirstDeposit ? 1 : 0,
          Number(data.createdAt) || Date.now(),
          data.reviewedAt ? Number(data.reviewedAt) : null,
        ],
      });
      return NextResponse.json({ success: true, message: 'Deposit synced to Turso' });
    }

    if (type === 'withdrawal' && data?.withdrawalId) {
      await turso.execute({
        sql: `INSERT OR REPLACE INTO withdrawals (
          id, withdrawalId, userId, userName, amount, method, phone, accountName,
          status, rejectionReason, adminNote, createdAt, reviewedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [
          data.id || data.withdrawalId,
          data.withdrawalId,
          data.userId || '',
          data.userName || '',
          Number(data.amount) || 0,
          data.method || 'kpay',
          data.phone || '',
          data.accountName || '',
          data.status || 'pending',
          data.rejectionReason || '',
          data.adminNote || '',
          Number(data.createdAt) || Date.now(),
          data.reviewedAt ? Number(data.reviewedAt) : null,
        ],
      });
      return NextResponse.json({ success: true, message: 'Withdrawal synced to Turso' });
    }

    return NextResponse.json({ success: false, error: 'Unknown sync type' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || String(error) }, { status: 500 });
  }
}

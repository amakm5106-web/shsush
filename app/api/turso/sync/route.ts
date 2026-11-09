import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const turso = getTursoClient();

    if (!turso) {
      return NextResponse.json({ success: false, error: 'Turso client unavailable' }, { status: 500 });
    }

    const { type, data } = body;

    if (type === 'user' && data?.uid) {
      // Query all existing user columns from Turso to merge safely
      const existingRes = await turso.execute({
        sql: 'SELECT * FROM users WHERE uid = ? LIMIT 1;',
        args: [data.uid],
      });

      const existing = (existingRes.rows.length > 0 ? existingRes.rows[0] : {}) as Record<string, any>;
      const existingBal = Number(existing.balance) || 0;

      let finalBalance = data.balance !== undefined ? Number(data.balance) : existingBal;
      // Never wipe out a positive database balance with 0 from an unauthenticated fresh fallback session
      if (existingBal > 0 && finalBalance === 0 && !data.isExplicitBalanceUpdate && (!data.createdAt || data.createdAt === 0)) {
        finalBalance = existingBal;
      }

      const finalFullName = data.fullName || existing.fullName || '';
      const finalEmail = data.email || existing.email || '';
      const finalPhone = data.phoneNumber || data.phone || existing.phoneNumber || '';
      const finalPasswordHash = data.passwordHash || existing.passwordHash || '';
      const finalRole = existing.role === 'admin' ? 'admin' : (data.role || existing.role || 'user');
      const finalReferralBalance = data.referralBalance !== undefined ? Number(data.referralBalance) : (Number(existing.referralBalance) || 0);
      const finalReferralsCount = data.referralsCount !== undefined ? Number(data.referralsCount) : (Number(existing.referralsCount) || 0);
      const finalDepositedCount = data.depositedReferralsCount !== undefined ? Number(data.depositedReferralsCount) : (Number(existing.depositedReferralsCount) || 0);
      const finalRefDeposits = data.referralTotalDeposits !== undefined ? Number(data.referralTotalDeposits) : (Number(existing.referralTotalDeposits) || 0);
      const finalBetCumulative = data.totalBetCumulative !== undefined ? Number(data.totalBetCumulative) : (Number(existing.totalBetCumulative) || 0);
      const finalSuccessfulDeposit = data.totalSuccessfulDeposit !== undefined ? Number(data.totalSuccessfulDeposit) : (Number(existing.totalSuccessfulDeposit) || 0);
      const finalWithdrawalCount = data.withdrawalCount !== undefined ? Number(data.withdrawalCount) : (Number(existing.withdrawalCount) || 0);
      const finalWager = data.wagerSinceLastWithdrawal !== undefined ? Number(data.wagerSinceLastWithdrawal) : (Number(existing.wagerSinceLastWithdrawal) || 0);
      const finalHasDeposit = data.hasSuccessfulDeposit !== undefined ? (data.hasSuccessfulDeposit ? 1 : 0) : (existing.hasSuccessfulDeposit ? 1 : 0);
      const finalFirstDepositBonus = data.firstDepositBonusClaimed !== undefined ? (data.firstDepositBonusClaimed ? 1 : 0) : (existing.firstDepositBonusClaimed ? 1 : 0);
      const finalReferralCode = data.referralCode || existing.referralCode || '';
      const finalReferrerId = data.referrerId || existing.referrerId || '';
      const finalBoundBank = data.boundBank
        ? (typeof data.boundBank === 'string' ? data.boundBank : JSON.stringify(data.boundBank))
        : (existing.boundBank ? String(existing.boundBank) : '');
      const finalIsHedging = data.isHedgingFlagged !== undefined ? (data.isHedgingFlagged ? 1 : 0) : (existing.isHedgingFlagged ? 1 : 0);
      const finalCreatedAt = Number(data.createdAt) || Number(existing.createdAt) || Date.now();
      const finalUpdatedAt = Date.now();

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
          finalFullName,
          finalEmail,
          finalPhone,
          finalPasswordHash,
          finalRole,
          finalBalance,
          finalReferralBalance,
          finalReferralsCount,
          finalDepositedCount,
          finalRefDeposits,
          finalBetCumulative,
          finalSuccessfulDeposit,
          finalWithdrawalCount,
          finalWager,
          finalHasDeposit,
          finalFirstDepositBonus,
          finalReferralCode,
          finalReferrerId,
          finalBoundBank,
          finalIsHedging,
          finalCreatedAt,
          finalUpdatedAt,
        ],
      });
      return NextResponse.json({
        success: true,
        message: 'User synced to Turso',
        balance: finalBalance,
        fullName: finalFullName,
        phone: finalPhone,
      });
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

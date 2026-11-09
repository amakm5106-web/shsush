import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import firebaseConfig from '@/firebase-applet-config.json';
import { getTursoClient, initTursoSchema } from '@/lib/turso';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const tursoUrl = body.url || process.env.TURSO_DATABASE_URL;
    const tursoToken = body.token || process.env.TURSO_AUTH_TOKEN;

    if (!tursoToken) {
      return NextResponse.json({
        success: false,
        error: 'Turso Auth Token မရှိသေးပါ။ Turso Dashboard သို့မဟုတ် CLI မှ Database Token အသစ်ကို ထည့်သွင်းပေးပါ။',
      }, { status: 400 });
    }

    // 1. Initialize Turso
    const turso = getTursoClient(tursoUrl, tursoToken);
    if (!turso) {
      return NextResponse.json({
        success: false,
        error: 'Turso client ဖန်တီး၍မရပါ။',
      }, { status: 500 });
    }

    try {
      await turso.execute('SELECT 1 as conn_check;');
    } catch (tursoErr: any) {
      return NextResponse.json({
        success: false,
        error: `Turso ချိတ်ဆက်မှု မအောင်မြင်ပါ (401 Unauthorized): ${tursoErr.message || String(tursoErr)}`,
        suggestion: 'Turso Dashboard -> Database (casino) -> Tokens မှ Database Auth Token အသစ်ကို ပြန်လည် generate လုပ်ပေးပါ။',
      }, { status: 401 });
    }

    // Initialize Schema
    await initTursoSchema(turso);

    // 2. Initialize Firebase
    const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

    const stats = {
      users: 0,
      deposits: 0,
      withdrawals: 0,
      bets: 0,
      settings: 0,
    };

    // 3. Migrate Users
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      for (const docSnap of usersSnap.docs) {
        const u = docSnap.data();
        await turso.execute({
          sql: `INSERT OR REPLACE INTO users (
            uid, fullName, email, phoneNumber, passwordHash, role, balance, referralBalance,
            referralsCount, depositedReferralsCount, referralTotalDeposits, totalBetCumulative,
            totalSuccessfulDeposit, withdrawalCount, wagerSinceLastWithdrawal, hasSuccessfulDeposit,
            firstDepositBonusClaimed, referralCode, referrerId, boundBank, isHedgingFlagged,
            createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          args: [
            docSnap.id,
            u.fullName || '',
            u.email || '',
            u.phoneNumber || u.phone || '',
            u.passwordHash || '',
            u.role || 'user',
            Number(u.balance) || 0,
            Number(u.referralBalance) || 0,
            Number(u.referralsCount) || 0,
            Number(u.depositedReferralsCount) || 0,
            Number(u.referralTotalDeposits) || 0,
            Number(u.totalBetCumulative) || 0,
            Number(u.totalSuccessfulDeposit) || 0,
            Number(u.withdrawalCount) || 0,
            Number(u.wagerSinceLastWithdrawal) || 0,
            u.hasSuccessfulDeposit ? 1 : 0,
            u.firstDepositBonusClaimed ? 1 : 0,
            u.referralCode || '',
            u.referrerId || '',
            u.boundBank ? JSON.stringify(u.boundBank) : '',
            u.isHedgingFlagged ? 1 : 0,
            Number(u.createdAt) || Date.now(),
            Number(u.updatedAt) || Date.now(),
          ],
        });
        stats.users++;
      }
    } catch (uErr: any) {
      if (uErr.message?.includes('Quota limit exceeded')) {
        return NextResponse.json({
          success: false,
          error: 'Firebase Firestore Daily Quota ပြည့်နေဆဲဖြစ်သဖြင့် Firebase မှ data များကို ဖတ်မရသေးပါ။ Quota reset ဖြစ်ချိန် (နေ့လယ် ၂:၃၀ MMT) သို့မဟုတ် Blaze Plan သို့ upgrade ပြီးမှ Firebase data များကို ဆွဲထုတ်နိုင်ပါမည်။',
          detail: uErr.message,
        }, { status: 429 });
      }
    }

    // 4. Migrate Deposits
    try {
      const depSnap = await getDocs(collection(db, 'deposits'));
      for (const docSnap of depSnap.docs) {
        const d = docSnap.data();
        await turso.execute({
          sql: `INSERT OR REPLACE INTO deposits (
            id, depositId, userId, userName, amount, method, phone, accountName,
            receiptImage, status, isFirstDeposit, createdAt, reviewedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          args: [
            docSnap.id,
            d.depositId || docSnap.id,
            d.userId || '',
            d.userName || '',
            Number(d.amount) || 0,
            d.method || 'kpay',
            d.phone || '',
            d.accountName || '',
            d.receiptImage || '',
            d.status || 'pending',
            d.isFirstDeposit ? 1 : 0,
            Number(d.createdAt) || Date.now(),
            d.reviewedAt ? Number(d.reviewedAt) : null,
          ],
        });
        stats.deposits++;
      }
    } catch {}

    // 5. Migrate Withdrawals
    try {
      const wSnap = await getDocs(collection(db, 'withdrawals'));
      for (const docSnap of wSnap.docs) {
        const w = docSnap.data();
        await turso.execute({
          sql: `INSERT OR REPLACE INTO withdrawals (
            id, withdrawalId, userId, userName, amount, method, phone, accountName,
            status, rejectionReason, adminNote, createdAt, reviewedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          args: [
            docSnap.id,
            w.withdrawalId || docSnap.id,
            w.userId || '',
            w.userName || '',
            Number(w.amount) || 0,
            w.method || 'kpay',
            w.phone || '',
            w.accountName || '',
            w.status || 'pending',
            w.rejectionReason || '',
            w.adminNote || '',
            Number(w.createdAt) || Date.now(),
            w.reviewedAt ? Number(w.reviewedAt) : null,
          ],
        });
        stats.withdrawals++;
      }
    } catch {}

    // 6. Migrate Bets
    try {
      const bSnap = await getDocs(collection(db, 'bets'));
      for (const docSnap of bSnap.docs) {
        const b = docSnap.data();
        await turso.execute({
          sql: `INSERT OR REPLACE INTO bets (
            id, betId, roundId, userId, userName, betKind, selection, amount,
            multiplier, status, payout, profit, result, createdAt, settledAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          args: [
            docSnap.id,
            b.betId || docSnap.id,
            Number(b.roundId) || 0,
            b.userId || '',
            b.userName || '',
            b.betKind || 'size',
            b.selection || '',
            Number(b.amount) || 0,
            Number(b.multiplier) || 1.0,
            b.status || 'pending',
            Number(b.payout) || 0,
            Number(b.profit) || 0,
            b.result !== undefined ? Number(b.result) : null,
            Number(b.createdAt) || Date.now(),
            b.settledAt ? Number(b.settledAt) : null,
          ],
        });
        stats.bets++;
      }
    } catch {}

    // 7. Migrate Settings
    try {
      const sSnap = await getDocs(collection(db, 'settings'));
      for (const docSnap of sSnap.docs) {
        const s = docSnap.data();
        await turso.execute({
          sql: `INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES (?, ?, ?);`,
          args: [
            docSnap.id,
            JSON.stringify(s),
            Date.now(),
          ],
        });
        stats.settings++;
      }
    } catch {}

    return NextResponse.json({
      success: true,
      message: 'Firebase မှ ဒေတာများကို Turso Database ပေါ်သို့ အောင်မြင်စွာ ပြောင်းရွှေ့ပြီးပါပြီ!',
      migrated: stats,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || String(error),
    }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { validateBotAuth, getFirebaseInstance } from '@/lib/botApi';
import { getTursoClient } from '@/lib/turso';
import { collection, query, where, getDocs } from 'firebase/firestore';

export async function GET(req: NextRequest) {
  const authCheck = validateBotAuth(req);
  if (!authCheck.authorized) {
    return NextResponse.json({ success: false, error: authCheck.error }, { status: 401 });
  }

  const pendingDeposits: any[] = [];
  const pendingWithdrawals: any[] = [];

  // 1. Fetch from Turso
  try {
    const turso = getTursoClient();
    if (turso) {
      const depRes = await turso.execute("SELECT * FROM deposits WHERE status = 'pending' ORDER BY createdAt DESC LIMIT 20;");
      depRes.rows.forEach((r) => pendingDeposits.push(r));

      const withRes = await turso.execute("SELECT * FROM withdrawals WHERE status = 'pending' ORDER BY createdAt DESC LIMIT 20;");
      withRes.rows.forEach((r) => pendingWithdrawals.push(r));
    }
  } catch (err) {
    console.warn('Turso pending fetch warning:', err);
  }

  // 2. Fetch from Firestore if accessible
  try {
    const { db } = getFirebaseInstance();
    const [depSnap, withSnap] = await Promise.all([
      getDocs(query(collection(db, 'deposits'), where('status', '==', 'pending'))).catch(() => null),
      getDocs(query(collection(db, 'withdrawals'), where('status', '==', 'pending'))).catch(() => null),
    ]);

    if (depSnap) {
      depSnap.forEach((d) => {
        if (!pendingDeposits.some((x) => x.id === d.id || x.depositId === d.id)) {
          pendingDeposits.push({ id: d.id, ...d.data() });
        }
      });
    }

    if (withSnap) {
      withSnap.forEach((w) => {
        if (!pendingWithdrawals.some((x) => x.id === w.id || x.withdrawalId === w.id)) {
          pendingWithdrawals.push({ id: w.id, ...w.data() });
        }
      });
    }
  } catch (err) {
    console.warn('Firestore pending fetch warning:', err);
  }

  return NextResponse.json({
    success: true,
    depositsCount: pendingDeposits.length,
    withdrawalsCount: pendingWithdrawals.length,
    deposits: pendingDeposits,
    withdrawals: pendingWithdrawals,
  });
}

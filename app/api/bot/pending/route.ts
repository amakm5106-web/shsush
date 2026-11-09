import { NextRequest, NextResponse } from 'next/server';
import { validateBotAuth, getFirebaseInstance } from '@/lib/botApi';
import { getTursoClient } from '@/lib/turso';
import { collection, query, where, getDocs } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

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

  const normalizedDeposits = pendingDeposits.map((d: any) => ({
    ...d,
    trxLast5: d.trxLast5 || d.receiptImage || '-',
  }));

  let formattedText = `📋 <b>ဆိုင်းငံ့ ငွေသွင်း/ငွေထုတ် စာရင်းများ</b>\n━━━━━━━━━━━━━━━━━━\n📥 ငွေသွင်း စစ်ဆေးရန်: <b>${normalizedDeposits.length}</b> ခု\n📤 ငွေထုတ် စစ်ဆေးရန်: <b>${pendingWithdrawals.length}</b> ခု\n\n`;

  if (normalizedDeposits.length > 0) {
    formattedText += `<b>[ငွေသွင်းတောင်းဆိုမှုများ]</b>\n`;
    for (const d of normalizedDeposits.slice(0, 8)) {
      const depId = d.depositId || d.id;
      const amt = Number(d.amount) || 0;
      const phone = d.phone || d.phoneNumber || '-';
      const trx = d.trxLast5 || '-';
      formattedText += `• <code>${depId}</code> | ${phone} | <b>${amt.toLocaleString()} Ks</b>\n  💳 ငွေလွှဲ ID (နောက်ဆုံး ၅ လုံး): <code>${trx}</code>\n  👉 အတည်ပြုရန်: <code>/approve ${depId}</code>\n\n`;
    }
  }

  if (pendingWithdrawals.length > 0) {
    formattedText += `<b>[ငွေထုတ်တောင်းဆိုမှုများ]</b>\n`;
    for (const w of pendingWithdrawals.slice(0, 8)) {
      const wId = w.withdrawalId || w.id;
      const amt = Number(w.amount) || 0;
      const name = w.accountName || '-';
      const phone = w.phone || '-';
      formattedText += `• <code>${wId}</code> | ${name} (${phone}) | <b>${amt.toLocaleString()} Ks</b>\n`;
    }
  }
  formattedText += `━━━━━━━━━━━━━━━━━━`;

  return NextResponse.json({
    success: true,
    depositsCount: normalizedDeposits.length,
    withdrawalsCount: pendingWithdrawals.length,
    deposits: normalizedDeposits,
    withdrawals: pendingWithdrawals,
    formattedText,
  });
}


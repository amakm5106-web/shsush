import { NextRequest, NextResponse } from 'next/server';
import { validateBotAuth, getFirebaseInstance, adjustUserBalanceUnified } from '@/lib/botApi';
import { getTursoClient } from '@/lib/turso';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { formatKs } from '@/lib/constants';

export async function POST(req: NextRequest) {
  const authCheck = validateBotAuth(req);
  if (!authCheck.authorized) {
    return NextResponse.json({ success: false, error: authCheck.error }, { status: 401 });
  }

  try {
    const body = await req.json();
    const type = body.type; // 'deposit' | 'withdrawal'
    const id = body.id || body.depositId || body.withdrawalId;
    const action = body.action; // 'approve' | 'decline'
    const reason = body.reason || body.note || (action === 'approve' ? 'Approved via Telegram CS Bot' : 'Declined via Telegram CS Bot');

    if (!type || !id || !action) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: type ("deposit" | "withdrawal"), id, and action ("approve" | "decline")',
      }, { status: 400 });
    }

    const now = Date.now();
    const turso = getTursoClient();
    const { db } = getFirebaseInstance();

    // 1. Handle Deposit Approval / Decline
    if (type === 'deposit') {
      let depData: any = null;

      // Look in Turso
      if (turso) {
        const res = await turso.execute({
          sql: 'SELECT * FROM deposits WHERE id = ? OR depositId = ? LIMIT 1;',
          args: [id, id],
        });
        if (res.rows.length > 0) depData = res.rows[0];
      }

      // Fallback Firestore
      if (!depData) {
        try {
          const snap = await getDoc(doc(db, 'deposits', id));
          if (snap.exists()) depData = { id: snap.id, ...snap.data() };
        } catch {}
      }

      if (!depData) {
        return NextResponse.json({ success: false, error: `Deposit ID '${id}' not found` }, { status: 404 });
      }

      const amount = Number(depData.amount) || 0;
      const userId = String(depData.userId);

      if (action === 'approve') {
        // Credit balance
        await adjustUserBalanceUnified(userId, amount, `Deposit Approved: ${id}`);

        // Update Turso
        if (turso) {
          await turso.execute({
            sql: "UPDATE deposits SET status = 'approved', reviewedAt = ? WHERE id = ? OR depositId = ?;",
            args: [now, id, id],
          });
        }

        // Update Firestore
        try {
          await updateDoc(doc(db, 'deposits', id), {
            status: 'approved',
            reviewedAt: now,
          });
        } catch {}

        return NextResponse.json({
          success: true,
          message: `ငွေသွင်းတောင်းဆိုမှု ${id} အတည်ပြုပြီးပါပြီ။ User လက်ကျန်ထဲသို့ +${formatKs(amount)} ထည့်သွင်းပြီးပါပြီ။`,
          amount,
          userId,
        });
      } else {
        // Decline
        if (turso) {
          await turso.execute({
            sql: "UPDATE deposits SET status = 'declined', reviewedAt = ? WHERE id = ? OR depositId = ?;",
            args: [now, id, id],
          });
        }
        try {
          await updateDoc(doc(db, 'deposits', id), {
            status: 'declined',
            reviewedAt: now,
          });
        } catch {}

        return NextResponse.json({
          success: true,
          message: `ငွေသွင်းတောင်းဆိုမှု ${id} ကို ပယ်ချပြီးပါပြီ (${reason})။`,
          userId,
        });
      }
    }

    // 2. Handle Withdrawal Approval / Decline
    if (type === 'withdrawal') {
      let withData: any = null;

      if (turso) {
        const res = await turso.execute({
          sql: 'SELECT * FROM withdrawals WHERE id = ? OR withdrawalId = ? LIMIT 1;',
          args: [id, id],
        });
        if (res.rows.length > 0) withData = res.rows[0];
      }

      if (!withData) {
        try {
          const snap = await getDoc(doc(db, 'withdrawals', id));
          if (snap.exists()) withData = { id: snap.id, ...snap.data() };
        } catch {}
      }

      if (!withData) {
        return NextResponse.json({ success: false, error: `Withdrawal ID '${id}' not found` }, { status: 404 });
      }

      const amount = Number(withData.amount) || 0;
      const userId = String(withData.userId);

      if (action === 'approve') {
        if (turso) {
          await turso.execute({
            sql: "UPDATE withdrawals SET status = 'approved', reviewedAt = ? WHERE id = ? OR withdrawalId = ?;",
            args: [now, id, id],
          });
        }
        try {
          await updateDoc(doc(db, 'withdrawals', id), {
            status: 'approved',
            reviewedAt: now,
          });
        } catch {}

        return NextResponse.json({
          success: true,
          message: `ငွေထုတ်တောင်းဆိုမှု ${id} အတည်ပြုပြီးပါပြီ (${formatKs(amount)})။`,
          userId,
          amount,
        });
      } else {
        // Decline: Refund balance back to user
        await adjustUserBalanceUnified(userId, amount, `Withdrawal Refunded (${id}): ${reason}`);

        if (turso) {
          await turso.execute({
            sql: "UPDATE withdrawals SET status = 'declined', rejectionReason = ?, reviewedAt = ? WHERE id = ? OR withdrawalId = ?;",
            args: [reason, now, id, id],
          });
        }
        try {
          await updateDoc(doc(db, 'withdrawals', id), {
            status: 'declined',
            rejectionReason: reason,
            reviewedAt: now,
          });
        } catch {}

        return NextResponse.json({
          success: true,
          message: `ငွေထုတ်တောင်းဆိုမှု ${id} ကို ပယ်ချပြီး User ထံသို့ +${formatKs(amount)} ပြန်လည်အမ်းငွေ ထည့်သွင်းပြီးပါပြီ။`,
          userId,
          amount,
          refunded: true,
        });
      }
    }

    return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || String(error),
    }, { status: 500 });
  }
}

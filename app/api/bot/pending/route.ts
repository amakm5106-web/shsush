import { NextRequest, NextResponse } from 'next/server';
import { validateBotAuth } from '@/lib/botApi';
import { getTursoClient } from '@/lib/turso';

export const dynamic = 'force-dynamic';

type PendingRow = Record<string, string | number | null>;

export async function GET(req: NextRequest) {
  const authCheck = validateBotAuth(req);
  if (!authCheck.authorized) return NextResponse.json({ success: false, error: authCheck.error }, { status: 401 });
  try {
    const turso = getTursoClient();
    if (!turso) throw new Error('Turso is not configured');
    const [depRes, withRes] = await Promise.all([
      turso.execute("SELECT * FROM deposits WHERE status = 'pending' ORDER BY createdAt DESC LIMIT 100"),
      turso.execute("SELECT * FROM withdrawals WHERE status = 'pending' ORDER BY createdAt DESC LIMIT 100"),
    ]);
    const deposits: PendingRow[] = depRes.rows.map((d) => ({ ...d, trxLast5: String(d.trxLast5 || d.receiptImage || '-') })) as PendingRow[];
    const withdrawals: PendingRow[] = withRes.rows as PendingRow[];
    let formattedText = `📋 <b>ဆိုင်းငံ့ ငွေသွင်း/ငွေထုတ် စာရင်းများ</b>\n━━━━━━━━━━━━━━━━━━\n📥 ငွေသွင်း စစ်ဆေးရန်: <b>${deposits.length}</b> ခု\n📤 ငွေထုတ် စစ်ဆေးရန်: <b>${withdrawals.length}</b> ခု\n\n`;
    if (deposits.length) {
      formattedText += '<b>[ငွေသွင်းတောင်းဆိုမှုများ]</b>\n';
      for (const d of deposits.slice(0, 8)) formattedText += `• <code>${d.depositId || d.id}</code> | ${d.phone || '-'} | <b>${(Number(d.amount) || 0).toLocaleString()} Ks</b>\n  💳 နောက်ဆုံး ၅ လုံး: <code>${d.trxLast5}</code>\n  👉 <code>/approve ${d.depositId || d.id}</code>\n\n`;
    }
    if (withdrawals.length) {
      formattedText += '<b>[ငွေထုတ်တောင်းဆိုမှုများ]</b>\n';
      for (const w of withdrawals.slice(0, 8)) formattedText += `• <code>${w.withdrawalId || w.id}</code> | ${w.accountName || '-'} (${w.phone || '-'}) | <b>${(Number(w.amount) || 0).toLocaleString()} Ks</b>\n`;
    }
    return NextResponse.json({ success: true, depositsCount: deposits.length, withdrawalsCount: withdrawals.length, deposits, withdrawals, formattedText: `${formattedText}━━━━━━━━━━━━━━━━━━` }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

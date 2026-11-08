import { NextRequest, NextResponse } from 'next/server';
import { validateBotAuth, findUserUnified, adjustUserBalanceUnified } from '@/lib/botApi';
import { formatKs } from '@/lib/constants';

export async function POST(req: NextRequest) {
  const authCheck = validateBotAuth(req);
  if (!authCheck.authorized) {
    return NextResponse.json({ success: false, error: authCheck.error }, { status: 401 });
  }

  try {
    const body = await req.json();
    const uid = body.uid || body.id || body.query;
    const amount = Number(body.amount);
    const action = body.action || 'topup'; // 'topup' or 'deduct'
    const note = body.note || body.reason || 'Bot Admin Manual Adjustment';
    const adminName = body.adminName || 'Telegram CS Bot';

    if (!uid) {
      return NextResponse.json({ success: false, error: 'User UID is required' }, { status: 400 });
    }

    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: 'Amount must be a positive number' }, { status: 400 });
    }

    const user = await findUserUnified(uid);
    if (!user) {
      return NextResponse.json({ success: false, error: `User with ID '${uid}' not found` }, { status: 404 });
    }

    const prevBalance = user.balance;
    const delta = action === 'deduct' ? -amount : amount;

    if (action === 'deduct' && prevBalance < amount) {
      return NextResponse.json({
        success: false,
        error: `ငွေမလုံလောက်ပါ: လက်ရှိ Balance (${formatKs(prevBalance)}) ထက် ပို၍ နုတ်ယူ၍ မရပါ`,
      }, { status: 400 });
    }

    const result = await adjustUserBalanceUnified(user.uid, delta, `${adminName}: ${note}`);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    const formattedText = `
✅ <b>Balance အောင်မြင်စွာ ပြင်ဆင်ပြီးပါပြီ</b>
━━━━━━━━━━━━━━━━━━
🆔 <b>User ID:</b> <code>${user.uid}</code>
👤 <b>အမည်:</b> ${user.fullName}
📱 <b>ဖုန်း:</b> <code>${user.phoneNumber || '-'}</code>
💵 <b>ဆောင်ရွက်မှု:</b> ${action === 'topup' ? '🟢 ငွေဖြည့်သွင်းခြင်း (+Topup)' : '🔴 ငွေနုတ်ယူခြင်း (-Deduct)'}
💰 <b>ငွေပမာဏ:</b> <b>${formatKs(amount)}</b>
📊 <b>ယခင်လက်ကျန်:</b> ${formatKs(prevBalance)}
💎 <b>လက်ကျန်အသစ်:</b> <b>${formatKs(result.newBalance || 0)}</b>
📝 <b>မှတ်ချက်:</b> ${note}
👮 <b>ဆောင်ရွက်သူ:</b> ${adminName}
━━━━━━━━━━━━━━━━━━
`.trim();

    return NextResponse.json({
      success: true,
      action,
      amount,
      previousBalance: prevBalance,
      newBalance: result.newBalance,
      user: result.user,
      formattedText,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || String(error),
    }, { status: 500 });
  }
}

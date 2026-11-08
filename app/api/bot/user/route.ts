import { NextRequest, NextResponse } from 'next/server';
import { validateBotAuth, findUserUnified } from '@/lib/botApi';
import { formatKs } from '@/lib/constants';

export async function GET(req: NextRequest) {
  const authCheck = validateBotAuth(req);
  if (!authCheck.authorized) {
    return NextResponse.json({ success: false, error: authCheck.error }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query') || searchParams.get('uid') || searchParams.get('id') || '';

  if (!query.trim()) {
    return NextResponse.json({
      success: false,
      error: 'Query parameter (uid, id, or phone) is required. Example: /api/bot/user?query=USER_ID',
    }, { status: 400 });
  }

  try {
    const user = await findUserUnified(query);
    if (!user) {
      return NextResponse.json({
        success: false,
        error: `User not found for query: ${query}`,
      }, { status: 404 });
    }

    const boundBankText = user.boundBank
      ? `${user.boundBank.method?.toUpperCase() || 'Bank'} | ${user.boundBank.accountName || '-'} | ${user.boundBank.phone || '-'}`
      : 'ချိတ်ဆက်ထားခြင်းမရှိသေးပါ';

    // Pre-formatted message ready for Telegram HTML/Markdown
    const telegramMessage = `
👤 <b>User Info / မန်ဘာအချက်အလက်</b>
━━━━━━━━━━━━━━━━━━
🆔 <b>User ID:</b> <code>${user.uid}</code>
👤 <b>အမည်:</b> ${user.fullName}
📱 <b>ဖုန်း:</b> <code>${user.phoneNumber || '-'}</code>
💰 <b>ပင်မလက်ကျန် (Balance):</b> <b>${formatKs(user.balance)}</b>
🎁 <b>မိတ်ဆက်လက်ကျန် (Ref Balance):</b> ${formatKs(user.referralBalance)}
👥 <b>မိတ်ဆက်လူဦးရေ:</b> ${user.referralsCount} ယောက်
🏦 <b>ချိတ်ဆက်ဘဏ်:</b> ${boundBankText}
🎲 <b>လောင်းကြေးစုစုပေါင်း:</b> ${formatKs(user.totalBetCumulative)}
📥 <b>ငွေသွင်းစုစုပေါင်း:</b> ${formatKs(user.totalSuccessfulDeposit)}
📤 <b>ငွေထုတ်အကြိမ်ရေ:</b> ${user.withdrawalCount} ကြိမ်
🛡 <b>Role:</b> <b>${user.role.toUpperCase()}</b> ${user.isHedgingFlagged ? '⚠️ (Flagged)' : '✅ (Normal)'}
🔗 <b>Referral Code:</b> <code>${user.referralCode || '-'}</code>
📅 <b>အကောင့်ဖွင့်ရက်:</b> ${new Date(user.createdAt || Date.now()).toLocaleString('en-GB', { timeZone: 'Asia/Yangon' })}
💾 <b>Database:</b> ${user.source.toUpperCase()}
━━━━━━━━━━━━━━━━━━
`.trim();

    return NextResponse.json({
      success: true,
      user,
      formattedText: telegramMessage,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || String(error),
    }, { status: 500 });
  }
}

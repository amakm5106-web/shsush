import { NextRequest } from 'next/server';
import { getTursoClient } from '@/lib/turso';

export function validateBotAuth(req: NextRequest): { authorized: boolean; error?: string } {
  const authHeader = req.headers.get('authorization') || '';
  const provided = (req.headers.get('x-bot-token') || (authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : '')).trim().replace(/^['"]|['"]$/g, '');
  const configured = (process.env.BOT_API_KEY || '').replace(/^['"]|['"]$/g, '').trim();
  if (!provided) return { authorized: false, error: 'Missing x-bot-token or Authorization Bearer header' };
  if (!configured || provided !== configured) return { authorized: false, error: 'Invalid Bot Token. Please check your BOT_API_KEY.' };
  return { authorized: true };
}

export interface BotUserDetail {
  uid: string; fullName: string; phoneNumber: string; email: string; role: string; balance: number;
  referralBalance: number; referralsCount: number; totalBetCumulative: number; totalSuccessfulDeposit: number;
  withdrawalCount: number; hasSuccessfulDeposit: boolean; firstDepositBonusClaimed: boolean; referralCode: string;
  referrerId: string; boundBank: { method?: string; phone?: string; accountName?: string } | null;
  isHedgingFlagged: boolean; createdAt: number; updatedAt: number; source: 'turso';
}

export let lastTursoError: string | null = null;

function rowToBotUser(row: Record<string, unknown>): BotUserDetail {
  let boundBank: BotUserDetail['boundBank'] = null;
  if (typeof row.boundBank === 'string' && row.boundBank) {
    try { boundBank = JSON.parse(row.boundBank); } catch { boundBank = null; }
  } else if (row.boundBank && typeof row.boundBank === 'object') boundBank = row.boundBank as BotUserDetail['boundBank'];
  return {
    uid: String(row.uid), fullName: String(row.fullName || ''), phoneNumber: String(row.phoneNumber || ''), email: String(row.email || ''), role: String(row.role || 'user'),
    balance: Number(row.balance) || 0, referralBalance: Number(row.referralBalance) || 0, referralsCount: Number(row.referralsCount) || 0,
    totalBetCumulative: Number(row.totalBetCumulative) || 0, totalSuccessfulDeposit: Number(row.totalSuccessfulDeposit) || 0, withdrawalCount: Number(row.withdrawalCount) || 0,
    hasSuccessfulDeposit: Boolean(row.hasSuccessfulDeposit), firstDepositBonusClaimed: Boolean(row.firstDepositBonusClaimed), referralCode: String(row.referralCode || ''), referrerId: String(row.referrerId || ''),
    boundBank, isHedgingFlagged: Boolean(row.isHedgingFlagged), createdAt: Number(row.createdAt) || 0, updatedAt: Number(row.updatedAt) || 0, source: 'turso',
  };
}

export async function findUserUnified(query: string): Promise<BotUserDetail | null> {
  const cleanQ = query.trim();
  if (!cleanQ) return null;
  const turso = getTursoClient();
  if (!turso) { lastTursoError = 'Turso is not configured'; return null; }
  try {
    const result = await turso.execute({ sql: 'SELECT * FROM users WHERE uid = ? OR phoneNumber = ? OR phoneNumber LIKE ? OR referralCode = ? OR uid LIKE ? LIMIT 1', args: [cleanQ, cleanQ, `%${cleanQ}%`, cleanQ, `${cleanQ}%`] });
    lastTursoError = result.rows.length ? null : `No Turso user found for ${cleanQ}`;
    return result.rows[0] ? rowToBotUser(result.rows[0] as Record<string, unknown>) : null;
  } catch (error) {
    lastTursoError = error instanceof Error ? error.message : String(error);
    return null;
  }
}

export async function adjustUserBalanceUnified(uid: string, delta: number, reason = 'Bot Admin Adjustment') {
  const turso = getTursoClient();
  if (!turso) return { success: false, error: 'Turso is not configured' };
  const user = await findUserUnified(uid);
  if (!user) return { success: false, error: `User ID '${uid}' မတွေ့ရှိပါ` };
  const next = user.balance + delta;
  if (next < 0) return { success: false, error: 'Balance မလုံလောက်ပါ' };
  const now = Date.now();
  const result = await turso.execute({ sql: 'UPDATE users SET balance = ?, updatedAt = ? WHERE uid = ? AND balance + ? >= 0', args: [next, now, user.uid, delta] });
  if (!result.rowsAffected) return { success: false, error: 'Balance update မအောင်မြင်ပါ' };
  await turso.execute({ sql: 'INSERT INTO admin_audit_logs (id, action, targetUid, amount, note, createdAt) VALUES (?, ?, ?, ?, ?, ?)', args: [`audit_${now}_${Math.random().toString(36).slice(2, 8)}`, 'bot_balance_adjustment', user.uid, delta, reason, now] });
  return { success: true, newBalance: next, user: { ...user, balance: next, updatedAt: now } };
}

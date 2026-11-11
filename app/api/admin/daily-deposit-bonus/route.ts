import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getTursoClient, initTursoSchema } from '@/lib/turso';

export const dynamic = 'force-dynamic';
const settingKey = 'daily_deposit_bonus_percent';
const noStore = { 'Cache-Control': 'no-store, max-age=0' };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host')?.trim().toLowerCase();
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host.toLowerCase() === host &&
      (parsed.protocol === 'https:' || parsed.protocol === new URL(req.url).protocol);
  } catch {
    return false;
  }
}

function validPercent(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100;
}

async function getClient() {
  const client = getTursoClient();
  if (!client) throw new Error('DATABASE_UNAVAILABLE');
  await initTursoSchema(client);
  return client;
}

export async function GET() {
  try {
    await requireAdmin();
    const client = await getClient();
    const result = await client.execute({
      sql: 'SELECT value FROM settings WHERE key = ? LIMIT 1',
      args: [settingKey],
    });
    const saved = Number(result.rows[0]?.value);
    const bonusPercent = validPercent(saved) ? saved : 0;
    return json({ success: true, bonusPercent });
  } catch (error) {
    const status = error instanceof Error && error.message === 'ADMIN_UNAUTHORIZED' ? 401 : 500;
    return json({ success: false, error: status === 401 ? 'စီမံခန့်ခွဲသူအဖြစ် ဝင်ရောက်ပါ။' : 'နေ့စဉ်ငွေသွင်းဘောနပ်စ်ကို မဖတ်နိုင်ပါ။' }, status);
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ success: false, error: 'တောင်းဆိုမှုကို အတည်မပြုနိုင်ပါ။' }, 403);
  try {
    await requireAdmin();
    const body = await req.json().catch(() => null) as { bonusPercent?: unknown } | null;
    if (!body || !validPercent(body.bonusPercent)) {
      return json({ success: false, error: 'ဘောနပ်စ်ရာခိုင်နှုန်းကို 0 မှ 100 အတွင်း ကိန်းပြည့်ဖြင့် ထည့်ပါ။' }, 400);
    }
    const client = await getClient();
    await client.execute({
      sql: 'INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt',
      args: [settingKey, String(body.bonusPercent), Date.now()],
    });
    return json({ success: true, bonusPercent: body.bonusPercent });
  } catch (error) {
    const status = error instanceof Error && error.message === 'ADMIN_UNAUTHORIZED' ? 401 : 500;
    return json({ success: false, error: status === 401 ? 'စီမံခန့်ခွဲသူအဖြစ် ဝင်ရောက်ပါ။' : 'နေ့စဉ်ငွေသွင်းဘောနပ်စ်ကို သိမ်း၍မရပါ။' }, status);
  }
}

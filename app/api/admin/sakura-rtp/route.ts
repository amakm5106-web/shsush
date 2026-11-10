import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { ensureSakuraSchema, getTursoClient } from '@/lib/turso';
import {
  DEFAULT_SAKURA_RTP_PERCENT,
  isSakuraRtpPercent,
} from '@/lib/sakuraGame';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, max-age=0' };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

function isSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  const configuredOrigin = process.env.SAKURA_ALLOWED_ORIGIN?.trim();
  const host = req.headers.get('host')?.trim().toLowerCase();
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    if (configuredOrigin) return parsed.origin === new URL(configuredOrigin).origin;
    return parsed.host.toLowerCase() === host &&
      (parsed.protocol === 'https:' || parsed.protocol === new URL(req.url).protocol);
  } catch {
    return false;
  }
}

async function getClient() {
  const client = getTursoClient();
  if (!client) throw new Error('DATABASE_UNAVAILABLE');
  await ensureSakuraSchema(client);
  return client;
}

export async function GET() {
  try {
    await requireAdmin();
    const client = await getClient();
    const result = await client.execute({
      sql: 'SELECT value FROM settings WHERE key = ? LIMIT 1',
      args: ['sakura_rtp_percent'],
    });
    const saved = Number(result.rows[0]?.value);
    const rtpPercent = isSakuraRtpPercent(saved) ? saved : DEFAULT_SAKURA_RTP_PERCENT;
    return json({ success: true, rtpPercent });
  } catch (error) {
    const status = error instanceof Error && error.message === 'ADMIN_UNAUTHORIZED' ? 401 : 500;
    return json({ success: false, error: status === 401 ? 'စီမံခန့်ခွဲသူအဖြစ် ဝင်ရောက်ပါ။' : 'RTP ဆက်တင်ကို မရယူနိုင်ပါ။' }, status);
  }
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return json({ success: false, error: 'တောင်းဆိုမှုကို အတည်မပြုနိုင်ပါ။' }, 403);
  try {
    await requireAdmin();
    const body = await req.json().catch(() => null) as { rtpPercent?: unknown } | null;
    if (!body || !isSakuraRtpPercent(body.rtpPercent)) {
      return json({ success: false, error: 'RTP ကို 50 မှ 95 အတွင်း ကိန်းပြည့်ဖြင့် ထည့်ပါ။' }, 400);
    }
    const client = await getClient();
    await client.execute({
      sql: 'INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt',
      args: ['sakura_rtp_percent', String(body.rtpPercent), Date.now()],
    });
    return json({ success: true, rtpPercent: body.rtpPercent });
  } catch (error) {
    const status = error instanceof Error && error.message === 'ADMIN_UNAUTHORIZED' ? 401 : 500;
    return json({ success: false, error: status === 401 ? 'စီမံခန့်ခွဲသူအဖြစ် ဝင်ရောက်ပါ။' : 'RTP ဆက်တင်ကို သိမ်း၍မရပါ။' }, status);
  }
}

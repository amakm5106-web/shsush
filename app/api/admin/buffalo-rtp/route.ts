import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import {
  DEFAULT_BUFFALO_RTP_PERCENT,
  ensureBuffaloSchema,
  isBuffaloRtpPercent,
} from '@/lib/buffaloSlotServer';
import { getTursoClient } from '@/lib/turso';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const noStore = { 'Cache-Control': 'no-store, max-age=0' };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

function isSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  const configuredOrigin = process.env.BUFFALO_ALLOWED_ORIGIN?.trim();
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
  await ensureBuffaloSchema(client);
  return client;
}

function errorStatus(error: unknown) {
  if (error instanceof Error && error.message === 'ADMIN_UNAUTHORIZED') return 401;
  if (error instanceof Error && error.message === 'DATABASE_UNAVAILABLE') return 503;
  return 500;
}

export async function GET() {
  try {
    await requireAdmin();
    const client = await getClient();
    const result = await client.execute({
      sql: 'SELECT value FROM settings WHERE key = ? LIMIT 1',
      args: ['buffalo_rtp_percent'],
    });
    const savedValue = result.rows[0]?.value;
    const rtpPercent = savedValue == null ? DEFAULT_BUFFALO_RTP_PERCENT : Number(savedValue);
    if (!isBuffaloRtpPercent(rtpPercent)) {
      console.error('Invalid saved Buffalo RTP setting');
      return json({ success: false, error: 'Buffalo RTP ဆက်တင်ကို ပြင်ဆင်ရန်လိုအပ်ပါသည်။' }, 500);
    }
    return json({ success: true, rtpPercent });
  } catch (error) {
    const status = errorStatus(error);
    return json({ success: false, error: status === 401 ? 'စီမံခန့်ခွဲသူအဖြစ် ဝင်ရောက်ပါ။' : 'Buffalo RTP ဆက်တင်ကို မရယူနိုင်ပါ။' }, status);
  }
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return json({ success: false, error: 'တောင်းဆိုမှုကို အတည်မပြုနိုင်ပါ။' }, 403);
  try {
    await requireAdmin();
    const body = await req.json().catch(() => null) as { rtpPercent?: unknown } | null;
    if (!body || !isBuffaloRtpPercent(body.rtpPercent)) {
      return json({ success: false, error: 'RTP ကို 50 မှ 95 အတွင်း ကိန်းပြည့်ဖြင့် ထည့်ပါ။' }, 400);
    }
    const client = await getClient();
    await client.execute({
      sql: 'INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt',
      args: ['buffalo_rtp_percent', String(body.rtpPercent), Date.now()],
    });
    return json({ success: true, rtpPercent: body.rtpPercent });
  } catch (error) {
    const status = errorStatus(error);
    return json({ success: false, error: status === 401 ? 'စီမံခန့်ခွဲသူအဖြစ် ဝင်ရောက်ပါ။' : 'Buffalo RTP ဆက်တင်ကို သိမ်း၍မရပါ။' }, status);
  }
}

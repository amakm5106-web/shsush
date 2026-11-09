import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getTursoClient, initTursoSchema } from '@/lib/turso';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const settings = body?.settings;
    if (!settings || typeof settings !== 'object') return NextResponse.json({ success: false, error: 'Invalid settings' }, { status: 400 });
    const client = getTursoClient();
    if (!client) throw new Error('Turso is not configured');
    await initTursoSchema(client);
    await client.execute({ sql: 'INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt', args: ['game_settings', JSON.stringify(settings), Date.now()] });
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof Error && error.message === 'ADMIN_UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status });
  }
}

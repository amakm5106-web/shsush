import { NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';

export async function GET() {
  try {
    const turso = getTursoClient();
    if (!turso) {
      return NextResponse.json({ success: false, error: 'Turso client unavailable' }, { status: 500 });
    }

    const [uRes, dRes, wRes, bRes, sRes] = await Promise.all([
      turso.execute('SELECT count(*) as count FROM users;').catch(() => ({ rows: [{ count: 0 }] })),
      turso.execute('SELECT count(*) as count FROM deposits;').catch(() => ({ rows: [{ count: 0 }] })),
      turso.execute('SELECT count(*) as count FROM withdrawals;').catch(() => ({ rows: [{ count: 0 }] })),
      turso.execute('SELECT count(*) as count FROM bets;').catch(() => ({ rows: [{ count: 0 }] })),
      turso.execute('SELECT count(*) as count FROM settings;').catch(() => ({ rows: [{ count: 0 }] })),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        users: Number(uRes.rows[0].count) || 0,
        deposits: Number(dRes.rows[0].count) || 0,
        withdrawals: Number(wRes.rows[0].count) || 0,
        bets: Number(bRes.rows[0].count) || 0,
        settings: Number(sRes.rows[0].count) || 0,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || String(error) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';
import { getSessionUser } from '@/lib/tursoAuth';
import { isAdminSession } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const requestedUid = new URL(req.url).searchParams.get('uid')?.trim();
    const sessionUser = await getSessionUser();
    const admin = await isAdminSession();
    if (!sessionUser && !admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const uid = requestedUid || sessionUser?.uid;
    if (!uid || (!admin && sessionUser?.uid !== uid)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    const client = getTursoClient();
    if (!client) throw new Error('Turso is not configured');
    const [deposits, withdrawals, bets] = await Promise.all([
      client.execute({ sql: 'SELECT * FROM deposits WHERE userId = ? ORDER BY createdAt DESC LIMIT 500', args: [uid] }),
      client.execute({ sql: 'SELECT * FROM withdrawals WHERE userId = ? ORDER BY createdAt DESC LIMIT 500', args: [uid] }),
      client.execute({ sql: 'SELECT * FROM bets WHERE userId = ? ORDER BY createdAt DESC LIMIT 500', args: [uid] }),
    ]);
    const depRows = deposits.rows as Record<string, unknown>[];
    const withRows = withdrawals.rows as Record<string, unknown>[];
    const betRows = bets.rows as Record<string, unknown>[];
    const sum = (rows: Record<string, unknown>[], field: string, predicate?: (row: Record<string, unknown>) => boolean) =>
      rows.filter((row) => !predicate || predicate(row)).reduce((total, row) => total + (Number(row[field]) || 0), 0);
    return NextResponse.json({
      success: true,
      deposits: depRows,
      withdrawals: withRows,
      bets: betRows,
      summary: {
        depositRequested: sum(depRows, 'amount'),
        depositApproved: sum(depRows, 'amount', (row) => row.status === 'approved' || row.status === 'completed'),
        withdrawalRequested: sum(withRows, 'amount'),
        withdrawalApproved: sum(withRows, 'amount', (row) => row.status === 'approved' || row.status === 'completed'),
        wagered: sum(betRows, 'amount'),
        payout: sum(betRows, 'payout'),
        wins: betRows.filter((row) => row.status === 'win').length,
        losses: betRows.filter((row) => row.status === 'loss').length,
      },
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
  } catch (error) {
    console.error('Turso activity error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

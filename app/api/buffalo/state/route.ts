import { NextRequest, NextResponse } from 'next/server';
import { ensureBuffaloSchema } from '@/lib/buffaloSlotServer';
import { getTursoClient } from '@/lib/turso';
import { getSessionUser } from '@/lib/tursoAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const noStore = { 'Cache-Control': 'no-store, max-age=0' };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

export async function GET(_req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return json({ success: false, code: 'UNAUTHENTICATED', error: 'ကစားရန် အကောင့်ဝင်ပါ။' }, 401);

  const client = getTursoClient();
  if (!client) return json({ success: false, code: 'GAME_UNAVAILABLE', error: 'Wallet ဝန်ဆောင်မှု ယာယီမရနိုင်ပါ။' }, 503);

  try {
    await ensureBuffaloSchema(client);
    const result = await client.execute({
      sql: `SELECT users.balance, buffalo_player_state.freeSpinsRemaining, buffalo_player_state.freeSpinStake
        FROM users LEFT JOIN buffalo_player_state ON buffalo_player_state.userId = users.uid
        WHERE users.uid = ? LIMIT 1`,
      args: [user.uid],
    });
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return json({ success: false, code: 'UNAUTHENTICATED', error: 'ကစားရန် အကောင့်ဝင်ပါ။' }, 401);

    return json({
      success: true,
      state: {
        balance: Number(row.balance) || 0,
        freeSpinsRemaining: Number(row.freeSpinsRemaining) || 0,
        freeSpinStake: Number(row.freeSpinStake) || 0,
      },
    });
  } catch (error) {
    console.error('Buffalo state read failed:', error);
    return json({ success: false, code: 'GAME_UNAVAILABLE', error: 'ဂိမ်းအခြေအနေ ယာယီမရနိုင်ပါ။' }, 503);
  }
}

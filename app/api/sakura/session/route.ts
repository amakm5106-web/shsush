import { NextResponse } from 'next/server';
import { ensureSakuraSchema, getTursoClient } from '@/lib/turso';
import { getSessionUser } from '@/lib/tursoAuth';
import { SAKURA_BET_STEPS, SAKURA_MAX_FREE_SPINS, SAKURA_TARGET_RTP } from '@/lib/sakuraGame';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, code: 'UNAUTHENTICATED', error: 'ကစားရန် အကောင့်ဝင်ပါ။' }, { status: 401, headers: noStore });
    }
    const client = getTursoClient();
    if (!client) {
      return NextResponse.json({ success: false, code: 'GAME_UNAVAILABLE', error: 'Wallet ဝန်ဆောင်မှု ယာယီမရနိုင်ပါ။' }, { status: 503, headers: noStore });
    }
    await ensureSakuraSchema(client);
    const result = await client.execute({
      sql: 'SELECT freeSpinsRemaining, freeSpinStake FROM sakura_player_state WHERE userId = ? LIMIT 1',
      args: [user.uid],
    });
    const state = result.rows[0];
    return NextResponse.json({
      success: true,
      player: {
        balance: user.balance,
        freeSpins: Number(state?.freeSpinsRemaining || 0),
        freeSpinStake: Number(state?.freeSpinStake || 0),
      },
      game: {
        currency: 'MMK',
        betSteps: SAKURA_BET_STEPS,
        targetRtp: SAKURA_TARGET_RTP,
        maxFreeSpins: SAKURA_MAX_FREE_SPINS,
      },
    }, { headers: noStore });
  } catch (error) {
    console.error('Sakura session load failed:', error);
    return NextResponse.json({ success: false, code: 'GAME_UNAVAILABLE', error: 'Wallet အချက်အလက်ကို မရယူနိုင်ပါ။ ပြန်လည်ကြိုးစားပါ။' }, { status: 503, headers: noStore });
  }
}

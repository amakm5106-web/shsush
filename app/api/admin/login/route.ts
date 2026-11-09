import { NextRequest, NextResponse } from 'next/server';
import { adminLogin } from '@/lib/adminAuth';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json().catch(() => ({}));
  const ok = await adminLogin(String(username || ''), String(password || ''));
  return NextResponse.json(ok ? { success: true } : { success: false, error: 'Admin username သို့မဟုတ် password မှားနေပါသည်' }, { status: ok ? 200 : 401 });
}

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/tursoAuth';

export async function GET() {
  try {
    const user = await getSessionUser();
    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error('Turso session error:', error);
    return NextResponse.json({ success: false, user: null }, { status: 500 });
  }
}

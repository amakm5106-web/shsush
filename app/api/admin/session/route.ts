import { NextResponse } from 'next/server';
import { adminLogout, isAdminSession } from '@/lib/adminAuth';

export async function GET() {
  return NextResponse.json({ authenticated: await isAdminSession() });
}

export async function DELETE() {
  await adminLogout();
  return NextResponse.json({ success: true });
}

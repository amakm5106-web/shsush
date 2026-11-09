import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE = 'phyophyolover_admin';
const TTL = 1000 * 60 * 60 * 12;

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET || process.env.AUTH_SESSION_SECRET;
  if (!value) throw new Error('ADMIN_SESSION_SECRET or AUTH_SESSION_SECRET is not configured');
  return value;
}

function sign(expiresAt: number) {
  const payload = `admin.${expiresAt}`;
  const signature = createHmac('sha256', secret()).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function valid(token?: string) {
  if (!token) return false;
  const [role, expiry, signature] = token.split('.');
  if (role !== 'admin' || !signature || Number(expiry) < Date.now()) return false;
  const expected = createHmac('sha256', secret()).update(`${role}.${expiry}`).digest('hex');
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function isAdminSession() {
  const jar = await cookies();
  return valid(jar.get(COOKIE)?.value);
}

export async function requireAdmin() {
  if (!(await isAdminSession())) throw new Error('ADMIN_UNAUTHORIZED');
}

export async function adminLogin(username: string, password: string) {
  const configuredUser = process.env.ADMIN_USERNAME?.trim();
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!configuredUser || !configuredPassword || username !== configuredUser || password !== configuredPassword) return false;
  const jar = await cookies();
  jar.set(COOKIE, sign(Date.now() + TTL), {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: TTL / 1000,
  });
  return true;
}

export async function adminLogout() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

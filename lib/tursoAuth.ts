import { createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { getTursoClient, initTursoSchema } from './turso';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'xsite_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type TursoSessionUser = {
  uid: string;
  email: string;
  phoneNumber: string;
  fullName: string;
  role: 'user' | 'admin';
  balance: number;
  referralBalance: number;
  referralsCount: number;
  depositedReferralsCount: number;
  referralTotalDeposits: number;
  totalBetCumulative: number;
  totalSuccessfulDeposit: number;
  withdrawalCount: number;
  wagerSinceLastWithdrawal: number;
  hasSuccessfulDeposit: boolean;
  firstDepositBonusClaimed: boolean;
  referralCode?: string;
  referrerId?: string;
  boundBank: unknown;
  isHedgingFlagged: boolean;
  createdAt: number;
  updatedAt: number;
};

function sessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (!secret) throw new Error('AUTH_SESSION_SECRET is not configured');
  return secret;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [, salt, encoded] = stored.split('$');
  if (!salt || !encoded) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(encoded, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function signSession(uid: string, expiresAt: number) {
  const payload = `${uid}.${expiresAt}`;
  const signature = createHmac('sha256', sessionSecret()).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function readSession(token?: string) {
  if (!token) return null;
  const [uid, expiry, signature] = token.split('.');
  const expiresAt = Number(expiry);
  if (!uid || !Number.isFinite(expiresAt) || expiresAt < Date.now() || !signature) return null;
  const expected = createHmac('sha256', sessionSecret()).update(`${uid}.${expiresAt}`).digest('hex');
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return { uid, expiresAt };
}

function rowToUser(row: Record<string, unknown>): TursoSessionUser {
  let boundBank: unknown = null;
  if (row.boundBank && typeof row.boundBank === 'string') {
    try { boundBank = JSON.parse(row.boundBank); } catch { boundBank = null; }
  }
  return {
    uid: String(row.uid), email: String(row.email || ''), phoneNumber: String(row.phoneNumber || ''),
    fullName: String(row.fullName || ''), role: row.role === 'admin' ? 'admin' : 'user',
    balance: Number(row.balance) || 0, referralBalance: Number(row.referralBalance) || 0,
    referralsCount: Number(row.referralsCount) || 0, depositedReferralsCount: Number(row.depositedReferralsCount) || 0,
    referralTotalDeposits: Number(row.referralTotalDeposits) || 0, totalBetCumulative: Number(row.totalBetCumulative) || 0,
    totalSuccessfulDeposit: Number(row.totalSuccessfulDeposit) || 0, withdrawalCount: Number(row.withdrawalCount) || 0,
    wagerSinceLastWithdrawal: Number(row.wagerSinceLastWithdrawal) || 0, hasSuccessfulDeposit: Boolean(row.hasSuccessfulDeposit),
    firstDepositBonusClaimed: Boolean(row.firstDepositBonusClaimed), referralCode: String(row.referralCode || ''),
    referrerId: String(row.referrerId || ''), boundBank, isHedgingFlagged: Boolean(row.isHedgingFlagged),
    createdAt: Number(row.createdAt) || 0, updatedAt: Number(row.updatedAt) || 0,
  };
}

export async function getUserByUid(uid: string) {
  const client = getTursoClient();
  if (!client) throw new Error('Turso is not configured');
  const result = await client.execute({ sql: 'SELECT * FROM users WHERE uid = ? LIMIT 1', args: [uid] });
  return result.rows[0] ? rowToUser(result.rows[0] as Record<string, unknown>) : null;
}

export async function setSession(uid: string) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = signSession(uid, expiresAt);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_TTL_MS / 1000 });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser() {
  const jar = await cookies();
  const session = readSession(jar.get(SESSION_COOKIE)?.value);
  return session ? getUserByUid(session.uid) : null;
}

export async function ensureAuthSchema() {
  const client = getTursoClient();
  if (!client) throw new Error('Turso is not configured');
  await initTursoSchema(client);
}

export function newUserId() {
  return `usr_${randomUUID()}`;
}

export { rowToUser };

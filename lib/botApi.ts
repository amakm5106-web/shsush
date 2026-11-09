import { NextRequest } from 'next/server';
import { getTursoClient } from '@/lib/turso';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc } from 'firebase/firestore';
import firebaseConfig from '@/firebase-applet-config.json';
import { UserProfile } from '@/lib/types';

export function validateBotAuth(req: NextRequest): { authorized: boolean; error?: string } {
  const authHeader = req.headers.get('authorization') || '';
  const xBotToken = req.headers.get('x-bot-token') || '';
  const configuredKey = (process.env.BOT_API_KEY || '').replace(/^['"]|['"]$/g, '').trim();

  let providedToken = xBotToken.trim();
  if (!providedToken && authHeader.toLowerCase().startsWith('bearer ')) {
    providedToken = authHeader.slice(7).trim();
  }
  providedToken = providedToken.replace(/^["']|["']$/g, '').trim();

  if (!providedToken) {
    return {
      authorized: false,
      error: 'Missing x-bot-token or Authorization Bearer header',
    };
  }

  if (!configuredKey || providedToken !== configuredKey) {
    return {
      authorized: false,
      error: 'Invalid Bot Token. Please check your BOT_API_KEY.',
    };
  }

  return { authorized: true };
}

export function getFirebaseInstance() {
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  return { app, db };
}

export interface BotUserDetail {
  uid: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  role: string;
  balance: number;
  referralBalance: number;
  referralsCount: number;
  totalBetCumulative: number;
  totalSuccessfulDeposit: number;
  withdrawalCount: number;
  hasSuccessfulDeposit: boolean;
  firstDepositBonusClaimed: boolean;
  referralCode: string;
  referrerId: string;
  boundBank: {
    method?: string;
    phone?: string;
    accountName?: string;
  } | null;
  isHedgingFlagged: boolean;
  createdAt: number;
  updatedAt: number;
  source: 'turso' | 'firestore';
}

/**
 * Searches for a user by UID, phone number, or referral code across Turso and Firestore
 */
export let lastTursoError: string | null = null;

export async function findUserUnified(query: string): Promise<BotUserDetail | null> {
  const cleanQ = query.trim();
  if (!cleanQ) return null;
  lastTursoError = null;

  // 1. Try Turso first (Fast & No Quota limit)
  try {
    const turso = getTursoClient();
    if (!turso) {
      lastTursoError = 'getTursoClient returned null';
    } else {
      const res = await turso.execute({
        sql: `SELECT * FROM users 
              WHERE uid = ? 
                 OR phoneNumber = ? 
                 OR phoneNumber LIKE ? 
                 OR referralCode = ? 
                 OR uid LIKE ? 
              LIMIT 1;`,
        args: [cleanQ, cleanQ, `%${cleanQ}%`, cleanQ, `${cleanQ}%`],
      });

      if (res.rows.length > 0) {
        const row = res.rows[0];
        let boundBank = null;
        if (row.boundBank && typeof row.boundBank === 'string') {
          try {
            boundBank = JSON.parse(row.boundBank);
          } catch {}
        }

        return {
          uid: String(row.uid),
          fullName: String(row.fullName || 'Unknown User'),
          phoneNumber: String(row.phoneNumber || ''),
          email: String(row.email || ''),
          role: String(row.role || 'user'),
          balance: Number(row.balance) || 0,
          referralBalance: Number(row.referralBalance) || 0,
          referralsCount: Number(row.referralsCount) || 0,
          totalBetCumulative: Number(row.totalBetCumulative) || 0,
          totalSuccessfulDeposit: Number(row.totalSuccessfulDeposit) || 0,
          withdrawalCount: Number(row.withdrawalCount) || 0,
          hasSuccessfulDeposit: Boolean(row.hasSuccessfulDeposit),
          firstDepositBonusClaimed: Boolean(row.firstDepositBonusClaimed),
          referralCode: String(row.referralCode || ''),
          referrerId: String(row.referrerId || ''),
          boundBank,
          isHedgingFlagged: Boolean(row.isHedgingFlagged),
          createdAt: Number(row.createdAt) || 0,
          updatedAt: Number(row.updatedAt) || 0,
          source: 'turso',
        };
      } else {
        lastTursoError = `0 rows returned for query ${cleanQ}`;
      }
    }
  } catch (err: any) {
    lastTursoError = err?.message || String(err);
    console.error('Turso lookup error in findUserUnified:', lastTursoError);
  }

  // 2. Fallback to Firestore
  try {
    const { db } = getFirebaseInstance();
    const snap = await getDoc(doc(db, 'users', cleanQ));
    if (snap.exists()) {
      const u = snap.data() as UserProfile;
      return {
        uid: snap.id,
        fullName: u.fullName || '',
        phoneNumber: u.phoneNumber || '',
        email: u.email || '',
        role: u.role || 'user',
        balance: Number(u.balance) || 0,
        referralBalance: Number(u.referralBalance) || 0,
        referralsCount: Number(u.referralsCount) || 0,
        totalBetCumulative: Number(u.totalBetCumulative) || 0,
        totalSuccessfulDeposit: Number(u.totalSuccessfulDeposit) || 0,
        withdrawalCount: Number(u.withdrawalCount) || 0,
        hasSuccessfulDeposit: Boolean(u.hasSuccessfulDeposit),
        firstDepositBonusClaimed: Boolean(u.firstDepositBonusClaimed),
        referralCode: u.referralCode || '',
        referrerId: u.referrerId || '',
        boundBank: u.boundBank || null,
        isHedgingFlagged: Boolean(u.isHedgingFlagged),
        createdAt: Number(u.createdAt) || 0,
        updatedAt: Number(u.updatedAt) || 0,
        source: 'firestore',
      };
    }
  } catch (err) {
    console.warn('Firestore fallback lookup error (may be quota exhausted):', err);
  }

  return null;
}

/**
 * Adjusts user balance atomically in Turso and Firestore
 */
export async function adjustUserBalanceUnified(
  uid: string,
  delta: number,
  reason: string = 'Bot Admin Adjustment'
): Promise<{ success: boolean; newBalance?: number; error?: string; user?: BotUserDetail }> {
  let user = await findUserUnified(uid);
  if (!user) {
    return { success: false, error: `User ID '${uid}' မတွေ့ရှိပါ` };
  }

  const newBalance = Math.max(0, user.balance + delta);
  const now = Date.now();

  // 1. Update Turso
  try {
    const turso = getTursoClient();
    if (turso) {
      await turso.execute({
        sql: `UPDATE users SET balance = ?, updatedAt = ? WHERE uid = ?;`,
        args: [newBalance, now, user.uid],
      });
    }
  } catch (tErr: any) {
    console.error('Failed to update balance in Turso:', tErr);
  }

  // 2. Update Firestore if accessible
  try {
    const { db } = getFirebaseInstance();
    await updateDoc(doc(db, 'users', user.uid), {
      balance: newBalance,
      updatedAt: now,
    });
  } catch (fErr: any) {
    console.warn('Failed to update balance in Firestore (offline or quota):', fErr);
  }

  user.balance = newBalance;
  user.updatedAt = now;

  return {
    success: true,
    newBalance,
    user,
  };
}

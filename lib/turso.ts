import { createClient, type Client } from '@libsql/client';

let tursoClient: Client | null = null;

export function getTursoClient(url?: string, token?: string): Client | null {
  const dbUrl = url || process.env.TURSO_DATABASE_URL;
  const authToken = token?.trim() || process.env.TURSO_AUTH_TOKEN?.trim();

  if (!dbUrl || !authToken) {
    return null;
  }

  return createClient({
    url: dbUrl,
    authToken,
  });
}

export async function initTursoSchema(client: Client) {
  await client.batch([
    `CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      fullName TEXT,
      email TEXT,
      phoneNumber TEXT,
      passwordHash TEXT,
      role TEXT DEFAULT 'user',
      balance INTEGER DEFAULT 0,
      referralBalance INTEGER DEFAULT 0,
      referralsCount INTEGER DEFAULT 0,
      depositedReferralsCount INTEGER DEFAULT 0,
      referralTotalDeposits INTEGER DEFAULT 0,
      totalBetCumulative INTEGER DEFAULT 0,
      totalSuccessfulDeposit INTEGER DEFAULT 0,
      withdrawalCount INTEGER DEFAULT 0,
      wagerSinceLastWithdrawal INTEGER DEFAULT 0,
      hasSuccessfulDeposit INTEGER DEFAULT 0,
      firstDepositBonusClaimed INTEGER DEFAULT 0,
      referralCode TEXT,
      referrerId TEXT,
      boundBank TEXT,
      isHedgingFlagged INTEGER DEFAULT 0,
      createdAt INTEGER,
      updatedAt INTEGER
    );`,
    `CREATE TABLE IF NOT EXISTS deposits (
      id TEXT PRIMARY KEY,
      depositId TEXT,
      userId TEXT NOT NULL,
      userName TEXT,
      amount INTEGER NOT NULL,
      method TEXT,
      phone TEXT,
      accountName TEXT,
      receiptImage TEXT,
      trxLast5 TEXT,
      status TEXT DEFAULT 'pending',
      isFirstDeposit INTEGER DEFAULT 0,
      createdAt INTEGER,
      reviewedAt INTEGER
    );`,
    `CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      withdrawalId TEXT,
      userId TEXT NOT NULL,
      userName TEXT,
      amount INTEGER NOT NULL,
      method TEXT,
      phone TEXT,
      accountName TEXT,
      status TEXT DEFAULT 'pending',
      rejectionReason TEXT,
      adminNote TEXT,
      createdAt INTEGER,
      reviewedAt INTEGER
    );`,
    `CREATE TABLE IF NOT EXISTS bets (
      id TEXT PRIMARY KEY,
      betId TEXT,
      roundId INTEGER NOT NULL,
      userId TEXT NOT NULL,
      userName TEXT,
      betKind TEXT,
      selection TEXT,
      amount INTEGER NOT NULL,
      multiplier REAL DEFAULT 1.0,
      status TEXT DEFAULT 'pending',
      payout INTEGER DEFAULT 0,
      profit INTEGER DEFAULT 0,
      result INTEGER,
      createdAt INTEGER,
      settledAt INTEGER
    );`,
    `CREATE TABLE IF NOT EXISTS game_rounds (
      id TEXT PRIMARY KEY,
      roundId INTEGER NOT NULL,
      status TEXT DEFAULT 'open',
      dice1 INTEGER,
      dice2 INTEGER,
      totalResult INTEGER,
      resultClass TEXT,
      resultColor TEXT,
      openedAt INTEGER,
      settledAt INTEGER
    );`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updatedAt INTEGER
    );`
  ], 'write');
}

export async function tursoGetUser(uid: string) {
  const client = getTursoClient();
  if (!client) return null;
  const res = await client.execute({
    sql: 'SELECT * FROM users WHERE uid = ? LIMIT 1;',
    args: [uid],
  });
  if (res.rows.length === 0) return null;
  return res.rows[0];
}

export async function tursoAdjustBalance(uid: string, delta: number) {
  const client = getTursoClient();
  if (!client) return null;
  await client.execute({
    sql: 'UPDATE users SET balance = balance + ?, updatedAt = ? WHERE uid = ?;',
    args: [delta, Date.now(), uid],
  });
  return tursoGetUser(uid);
}

export async function tursoGetSettings() {
  const client = getTursoClient();
  if (!client) return null;
  const res = await client.execute({
    sql: 'SELECT value FROM settings WHERE key = ? LIMIT 1;',
    args: ['game_settings'],
  });
  if (res.rows.length === 0) return null;
  try {
    return JSON.parse(res.rows[0].value as string);
  } catch {
    return null;
  }
}

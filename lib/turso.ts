import { createClient, type Client } from '@libsql/client';

let tursoClient: Client | null = null;

export function getTursoClient(url?: string, token?: string): Client | null {
  const dbUrl = url || process.env.TURSO_DATABASE_URL;
  const authToken = token?.trim() || process.env.TURSO_AUTH_TOKEN?.trim();

  if (!dbUrl || !authToken) {
    return null;
  }

  if (!url && !token && tursoClient) return tursoClient;

  const client = createClient({ url: dbUrl, authToken });
  if (!url && !token) tursoClient = client;
  return client;
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
      reviewedAt INTEGER,
      reviewedBy TEXT,
      reviewNote TEXT,
      completedAt INTEGER,
      externalReference TEXT,
      balanceMutationId TEXT,
      balanceBeforeDeposit INTEGER
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
      reviewedAt INTEGER,
      reviewedBy TEXT,
      reviewNote TEXT,
      completedAt INTEGER,
      externalReference TEXT,
      balanceMutationId TEXT
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
    );`,
    `CREATE TABLE IF NOT EXISTS daily_deposit_bonus_claims (
      userId TEXT NOT NULL,
      dayKey TEXT NOT NULL,
      depositId TEXT NOT NULL UNIQUE,
      depositAmount INTEGER NOT NULL,
      bonusPercent INTEGER NOT NULL,
      bonusAmount INTEGER NOT NULL,
      createdAt INTEGER NOT NULL,
      PRIMARY KEY (userId, dayKey)
    );`,
    `CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      targetUid TEXT,
      amount INTEGER DEFAULT 0,
      note TEXT,
      createdAt INTEGER
    );`
  ], 'write');

  // CREATE TABLE IF NOT EXISTS does not add columns to an existing table.
  // Upgrade older users tables in place before signup/login queries run.
  const existingUsersColumns = new Set(
    (await client.execute('PRAGMA table_info(users);')).rows.map((row) => String(row.name))
  );
  const missingUsersColumns: Record<string, string> = {
    passwordHash: 'TEXT', role: "TEXT DEFAULT 'user'", balance: 'INTEGER DEFAULT 0',
    referralBalance: 'INTEGER DEFAULT 0', referralsCount: 'INTEGER DEFAULT 0',
    depositedReferralsCount: 'INTEGER DEFAULT 0', referralTotalDeposits: 'INTEGER DEFAULT 0',
    totalBetCumulative: 'INTEGER DEFAULT 0', totalSuccessfulDeposit: 'INTEGER DEFAULT 0',
    withdrawalCount: 'INTEGER DEFAULT 0', wagerSinceLastWithdrawal: 'INTEGER DEFAULT 0',
    hasSuccessfulDeposit: 'INTEGER DEFAULT 0', firstDepositBonusClaimed: 'INTEGER DEFAULT 0',
    referralCode: 'TEXT', referrerId: 'TEXT', boundBank: 'TEXT',
    isHedgingFlagged: 'INTEGER DEFAULT 0', createdAt: 'INTEGER', updatedAt: 'INTEGER',
  };
  for (const [column, definition] of Object.entries(missingUsersColumns)) {
    if (!existingUsersColumns.has(column)) {
      await client.execute(`ALTER TABLE users ADD COLUMN ${column} ${definition};`);
    }
  }

  for (const table of ['deposits', 'withdrawals']) {
    const columns = new Set((await client.execute(`PRAGMA table_info(${table});`)).rows.map((row) => String(row.name)));
    const missing: Record<string, string> = { reviewedAt: 'INTEGER', reviewedBy: 'TEXT', reviewNote: 'TEXT', completedAt: 'INTEGER', externalReference: 'TEXT', balanceMutationId: 'TEXT', balanceBeforeDeposit: 'INTEGER' };
    for (const [column, definition] of Object.entries(missing)) {
      if (!columns.has(column)) await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
    }
  }
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

const sakuraSchemaTasks = new WeakMap<Client, Promise<void>>();

export async function ensureSakuraSchema(client: Client) {
  const ready = sakuraSchemaTasks.get(client);
  if (ready) return ready;

  const task = (async () => {
    await client.batch([
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updatedAt INTEGER
      );`,
      `CREATE TABLE IF NOT EXISTS sakura_player_state (
        userId TEXT PRIMARY KEY,
        freeSpinsRemaining INTEGER NOT NULL DEFAULT 0,
        freeSpinStake INTEGER NOT NULL DEFAULT 0,
        freeSpinWinPending INTEGER NOT NULL DEFAULT 0,
        pendingBonusId TEXT NOT NULL DEFAULT '',
        pendingBonusSpinId TEXT NOT NULL DEFAULT '',
        updatedAt INTEGER NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS sakura_spins (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        requestId TEXT NOT NULL,
        requestedStake INTEGER NOT NULL,
        stake INTEGER NOT NULL,
        charged INTEGER NOT NULL,
        payout INTEGER NOT NULL,
        creditedPayout INTEGER NOT NULL DEFAULT 0,
        balanceAfter INTEGER NOT NULL,
        isFreeSpin INTEGER NOT NULL DEFAULT 0,
        initialGridJson TEXT NOT NULL,
        stepsJson TEXT NOT NULL,
        scatterCount INTEGER NOT NULL DEFAULT 0,
        freeSpinsAwarded INTEGER NOT NULL DEFAULT 0,
        freeSpinsRemaining INTEGER NOT NULL DEFAULT 0,
        freeSpinWinTotal INTEGER NOT NULL DEFAULT 0,
        freeSpinFeatureFinished INTEGER NOT NULL DEFAULT 0,
        pendingBonusId TEXT NOT NULL DEFAULT '',
        rtpVersion TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        UNIQUE(userId, requestId)
      );`,
      `CREATE TABLE IF NOT EXISTS sakura_bonus_collections (
        bonusId TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        finalSpinId TEXT NOT NULL,
        amount INTEGER NOT NULL,
        balanceAfter INTEGER NOT NULL,
        createdAt INTEGER NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS sakura_schema_migrations (
        version TEXT PRIMARY KEY,
        appliedAt INTEGER NOT NULL
      );`,
      'CREATE INDEX IF NOT EXISTS idx_sakura_spins_user_created ON sakura_spins(userId, createdAt DESC);',
    ], 'write');

    const tx = await client.transaction('write');
    try {
      const migrationVersion = 'sakura-deferred-free-spin-credit-v1';
      const applied = await tx.execute({ sql: 'SELECT version FROM sakura_schema_migrations WHERE version = ? LIMIT 1', args: [migrationVersion] });
      if (!applied.rows.length) {
        const ensureColumn = async (table: string, column: string, definition: string) => {
          const columns = new Set((await tx.execute(`PRAGMA table_info(${table});`)).rows.map((row) => String(row.name)));
          if (!columns.has(column)) await tx.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
        };
        await ensureColumn('sakura_player_state', 'freeSpinWinPending', 'INTEGER NOT NULL DEFAULT 0');
        await ensureColumn('sakura_player_state', 'pendingBonusId', "TEXT NOT NULL DEFAULT ''");
        await ensureColumn('sakura_player_state', 'pendingBonusSpinId', "TEXT NOT NULL DEFAULT ''");
        await ensureColumn('sakura_spins', 'creditedPayout', 'INTEGER NOT NULL DEFAULT 0');
        await ensureColumn('sakura_spins', 'freeSpinWinTotal', 'INTEGER NOT NULL DEFAULT 0');
        await ensureColumn('sakura_spins', 'freeSpinFeatureFinished', 'INTEGER NOT NULL DEFAULT 0');
        await ensureColumn('sakura_spins', 'pendingBonusId', "TEXT NOT NULL DEFAULT ''");
        // Every existing v1 round was credited immediately, including its free spins.
        await tx.execute(`UPDATE sakura_spins SET creditedPayout = payout
          WHERE creditedPayout = 0 AND payout > 0 AND rtpVersion NOT LIKE 'sakura-rtp-config-v2:%';`);
        await tx.execute({ sql: 'INSERT INTO sakura_schema_migrations (version, appliedAt) VALUES (?, ?)', args: [migrationVersion, Date.now()] });
      }
      await tx.commit();
    } catch (error) {
      try { if (!tx.closed) await tx.rollback(); } catch {}
      throw error;
    } finally {
      try { tx.close(); } catch {}
    }
  })();

  sakuraSchemaTasks.set(client, task);
  try {
    await task;
  } catch (error) {
    sakuraSchemaTasks.delete(client);
    throw error;
  }
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

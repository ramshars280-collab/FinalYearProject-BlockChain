import crypto from 'crypto';
import { BatchRecord, BatchStatus, StudentDegreeData } from '@/types';
import { StudentAccountRecord, StudentAccountStatus } from '@/types/auth';
import { initializeDefaultBatches } from '@/lib/storage';
import { getDatabaseAdapter, IDatabaseAdapter, ITransactionalDb } from './db/index';

// Re-export adapter types for convenience
export * from './db/types';
export { getDatabaseAdapter, validateDatabaseConfig, getAdapterConfigStatus, closeDatabaseAdapter } from './db/index';

export interface DbCredentialItem {
  id: string;
  batchId: string;
  prn: string;
  fullName: string;
  degree?: string;
  branch?: string;
  cgpa?: number;
  graduationYear?: number;
  institute?: string;
  leafIndex: number;
  rawRecord: StudentDegreeData;
  createdAt: number;
  isRevoked: boolean;
  batchMetadata: {
    merkleRoot: string;
    ipfsCid: string;
    institutionName?: string;
  };
}

let isInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Initializes the database tables, indexes, backward-compatible column migrations,
 * and seeds default batches if empty. Safe to execute against both SQLite and Turso/libSQL.
 */
export async function initializeDatabaseSchema(db?: IDatabaseAdapter): Promise<void> {
  const adapter = db || getDatabaseAdapter();

  await adapter.execute(`
    CREATE TABLE IF NOT EXISTS batches (
      batchId TEXT PRIMARY KEY,
      merkleRoot TEXT NOT NULL,
      ipfsCid TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      issuer TEXT NOT NULL,
      institutionName TEXT,
      institutionCode TEXT,
      totalCredentials INTEGER NOT NULL,
      revokedIndices TEXT NOT NULL,
      records TEXT NOT NULL,
      status TEXT DEFAULT 'INSTITUTIONAL_STORED',
      txHash TEXT,
      anchoredAt INTEGER
    );
  `);

  await adapter.execute(`
    CREATE TABLE IF NOT EXISTS revocations (
      key TEXT PRIMARY KEY,
      batchId TEXT NOT NULL,
      leafIndex INTEGER NOT NULL,
      reasonCode TEXT,
      reasonTitle TEXT,
      reasonDescription TEXT,
      supersededByHash TEXT,
      revokedAt TEXT,
      officerStaffId TEXT
    );
  `);

  await adapter.execute(`
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      prn TEXT NOT NULL,
      full_name TEXT NOT NULL,
      degree TEXT,
      branch TEXT,
      cgpa REAL,
      graduation_year INTEGER,
      institute TEXT,
      leaf_index INTEGER NOT NULL,
      raw_record TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  await adapter.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_prn ON credentials(batch_id, prn);`);
  await adapter.execute(`CREATE INDEX IF NOT EXISTS idx_credentials_prn ON credentials(prn);`);
  await adapter.execute(`CREATE INDEX IF NOT EXISTS idx_credentials_leaf ON credentials(batch_id, leaf_index);`);

  await adapter.execute(`
    CREATE TABLE IF NOT EXISTS student_accounts (
      prn TEXT PRIMARY KEY,
      password_hash TEXT,
      activation_token_hash TEXT,
      activation_expires_at INTEGER,
      status TEXT DEFAULT 'PENDING_ACTIVATION',
      failed_attempts INTEGER DEFAULT 0,
      locked_until INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      activated_at INTEGER,
      last_login_at INTEGER
    );
  `);

  await adapter.execute(`CREATE INDEX IF NOT EXISTS idx_student_accounts_status ON student_accounts(status);`);

  // Ensure default demo batches exist if database is completely empty (subject to production seeding policy)
  const countRow = await adapter.get<{ count: number }>('SELECT COUNT(*) as count FROM batches');
  const count = Number(countRow?.count || 0);

  if (count === 0) {
    const isProduction = process.env.NODE_ENV === 'production';
    const allowAutoSeed = process.env.ALLOW_AUTO_SEED === 'true';

    // In production, automatic seeding is disabled by default to prevent silently masking unmounted storage
    if (!isProduction || allowAutoSeed) {
      const defaultBatches = initializeDefaultBatches();
      for (const b of defaultBatches) {
        await saveBatchInternal(adapter, b);
      }
    }
  } else {
    // Backfill credentials and student accounts if missing
    await backfillCredentialsAndAccountsIfEmpty(adapter);
  }

  isInitialized = true;
}

/**
 * Resets database initialization state in memory.
 * Used by isolated test suites and lifecycle teardown.
 */
export function resetDatabaseInitializationState(): void {
  isInitialized = false;
  initPromise = null;
}

/**
 * Ensures schema is initialized once before executing queries.
 * Concurrent initialization requests share the single in-flight initialization promise.
 * If initialization fails, the promise is cleared to allow safe retry.
 */
async function ensureDb(): Promise<IDatabaseAdapter> {
  const adapter = getDatabaseAdapter();
  if (!isInitialized) {
    if (!initPromise) {
      initPromise = initializeDatabaseSchema(adapter).catch((err) => {
        initPromise = null;
        isInitialized = false;
        throw err;
      });
    }
    await initPromise;
  }
  return adapter;
}

/**
 * Validates whether a PRN strictly follows the synthetic demo naming convention.
 * Criteria: Begins with DEMO- or DEMO followed by digits.
 * Negative guard: Never uses batch ID, filename, or institution name alone to classify an account.
 */
export function isSyntheticDemoPrn(prn: string): boolean {
  if (!prn || typeof prn !== 'string') return false;
  const clean = prn.trim().toUpperCase();
  return /^DEMO(-[A-Z0-9]+)*-\d+$/i.test(clean) || /^DEMO\d+$/i.test(clean);
}

/**
 * Generates an individual salted scrypt hash of the approved default password "student123".
 * Each call uses a fresh 16-byte random salt, guaranteeing unique hashes across accounts.
 */
export function generateDemoScryptHash(): string {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync('student123', salt, 64);
  return `scrypt:${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

/**
 * Backfills credentials and student_accounts from existing batches if credentials table is empty.
 */
async function backfillCredentialsAndAccountsIfEmpty(adapter: IDatabaseAdapter): Promise<void> {
  const credCountRow = await adapter.get<{ count: number }>('SELECT COUNT(*) as count FROM credentials');
  if (Number(credCountRow?.count || 0) === 0) {
    const batchRows = await adapter.query<any>('SELECT * FROM batches');
    for (const bRow of batchRows) {
      const parsed = parseBatchRow(bRow);
      await insertCredentialsForBatch(adapter, parsed);
    }
  }

  // Ensure all credentials have a student_accounts record
  const credPrns = await adapter.query<{ prn: string }>("SELECT DISTINCT prn FROM credentials WHERE TRIM(prn) != ''");
  const now = Date.now();
  for (const item of credPrns) {
    const cleanPrn = String(item.prn || '').trim().toUpperCase();
    if (cleanPrn) {
      if (isSyntheticDemoPrn(cleanPrn)) {
        const demoHash = generateDemoScryptHash();
        await adapter.execute(
          `INSERT OR IGNORE INTO student_accounts (
            prn, password_hash, activation_token_hash, activation_expires_at,
            status, failed_attempts, locked_until, created_at, activated_at, last_login_at
          ) VALUES (?, ?, NULL, NULL, 'ACTIVE', 0, 0, ?, ?, NULL)`,
          [cleanPrn, demoHash, now, now]
        );
      } else {
        await adapter.execute(
          `INSERT OR IGNORE INTO student_accounts (
            prn, password_hash, activation_token_hash, activation_expires_at,
            status, failed_attempts, locked_until, created_at, activated_at, last_login_at
          ) VALUES (?, NULL, NULL, NULL, 'PENDING_ACTIVATION', 0, 0, ?, NULL, NULL)`,
          [cleanPrn, now]
        );
      }
    }
  }
}

/**
 * Inserts credentials for a batch inside an atomic batch execution or transaction.
 */
async function insertCredentialsForBatch(tx: ITransactionalDb, batch: BatchRecord): Promise<void> {
  if (!Array.isArray(batch.records) || batch.records.length === 0) return;

  const credStatements: Array<{ sql: string; args?: any[] }> = [];
  const accountStatements: Array<{ sql: string; args?: any[] }> = [];
  const now = Date.now();

  batch.records.forEach((rec, idx) => {
    const prn = String(rec.prn || '').trim();
    if (!prn) return;
    const cleanPrn = prn.toUpperCase();
    const id = `${batch.batchId}_${cleanPrn}`;

    credStatements.push({
      sql: `INSERT OR REPLACE INTO credentials (
        id, batch_id, prn, full_name, degree, branch, cgpa,
        graduation_year, institute, leaf_index, raw_record, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        batch.batchId,
        cleanPrn, // strictly TEXT
        rec.fullName || '',
        rec.degree || null,
        rec.branch || null,
        typeof rec.cgpa === 'number' ? rec.cgpa : null,
        typeof rec.graduationYear === 'number' ? rec.graduationYear : null,
        rec.institute || null,
        idx,
        JSON.stringify(rec),
        batch.timestamp || now,
      ],
    });

    if (isSyntheticDemoPrn(cleanPrn)) {
      // Automatic provisioning for synthetic demo records:
      // Uses INSERT OR IGNORE so existing accounts and passwords are strictly preserved.
      const demoHash = generateDemoScryptHash();
      accountStatements.push({
        sql: `INSERT OR IGNORE INTO student_accounts (
          prn, password_hash, activation_token_hash, activation_expires_at,
          status, failed_attempts, locked_until, created_at, activated_at, last_login_at
        ) VALUES (?, ?, NULL, NULL, 'ACTIVE', 0, 0, ?, ?, NULL)`,
        args: [cleanPrn, demoHash, now, now],
      });
    } else {
      // Real or historical students: NEVER receive demo passwords.
      // Inserted with password_hash = NULL (or untouched if already present).
      accountStatements.push({
        sql: `INSERT OR IGNORE INTO student_accounts (
          prn, password_hash, activation_token_hash, activation_expires_at,
          status, failed_attempts, locked_until, created_at, activated_at, last_login_at
        ) VALUES (?, NULL, NULL, NULL, 'PENDING_ACTIVATION', 0, 0, ?, NULL, NULL)`,
        args: [cleanPrn, now],
      });
    }
  });

  if (credStatements.length > 0) {
    await tx.batch(credStatements);
  }
  if (accountStatements.length > 0) {
    await tx.batch(accountStatements);
  }
}

function parseBatchRow(row: any): BatchRecord {
  return {
    batchId: row.batchId,
    merkleRoot: row.merkleRoot,
    ipfsCid: row.ipfsCid,
    timestamp: Number(row.timestamp),
    issuer: row.issuer,
    institutionName: row.institutionName || undefined,
    institutionCode: row.institutionCode || undefined,
    totalCredentials: Number(row.totalCredentials),
    revokedIndices: typeof row.revokedIndices === 'string' ? JSON.parse(row.revokedIndices || '[]') : row.revokedIndices || [],
    records: typeof row.records === 'string' ? JSON.parse(row.records || '[]') : row.records || [],
    status: (row.status as BatchStatus) || 'INSTITUTIONAL_STORED',
    txHash: row.txHash || undefined,
    anchoredAt: typeof row.anchoredAt === 'number' || (typeof row.anchoredAt === 'string' && row.anchoredAt) ? Number(row.anchoredAt) : undefined,
  };
}

export async function getAllBatchesDb(): Promise<BatchRecord[]> {
  const db = await ensureDb();
  const rows = await db.query('SELECT * FROM batches ORDER BY timestamp DESC');
  return rows.map(parseBatchRow);
}

export async function getBatchByIdDb(batchId: string): Promise<BatchRecord | null> {
  const db = await ensureDb();
  const cleanId = String(batchId || '').trim();
  if (!cleanId) return null;
  const row = await db.get('SELECT * FROM batches WHERE LOWER(TRIM(batchId)) = LOWER(TRIM(?)) LIMIT 1', [cleanId]);
  if (!row) return null;
  return parseBatchRow(row);
}

/**
 * Internal batch persistence helper that executes directly against the provided
 * IDatabaseAdapter (or transaction), avoiding recursive calls to ensureDb().
 */
async function saveBatchInternal(db: IDatabaseAdapter, batch: BatchRecord): Promise<BatchRecord> {
  await db.transaction(async (tx: ITransactionalDb) => {
    await tx.execute(
      `INSERT OR REPLACE INTO batches (
        batchId, merkleRoot, ipfsCid, timestamp, issuer,
        institutionName, institutionCode, totalCredentials,
        revokedIndices, records, status, txHash, anchoredAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        batch.batchId,
        batch.merkleRoot,
        batch.ipfsCid,
        batch.timestamp || Date.now(),
        batch.issuer,
        batch.institutionName || null,
        batch.institutionCode || null,
        batch.totalCredentials,
        JSON.stringify(batch.revokedIndices || []),
        JSON.stringify(batch.records || []),
        batch.status || 'INSTITUTIONAL_STORED',
        batch.txHash || null,
        typeof batch.anchoredAt === 'number' ? batch.anchoredAt : null,
      ]
    );

    await insertCredentialsForBatch(tx, batch);
  });

  return batch;
}

export async function saveBatchDb(batch: BatchRecord): Promise<BatchRecord> {
  const db = await ensureDb();
  return saveBatchInternal(db, batch);
}

export async function updateBatchAnchorStatusDb(
  batchId: string,
  updates: {
    txHash: string;
    anchoredAt?: number;
    ipfsCid?: string;
    status?: BatchStatus;
  } | string,
  legacyBlockNumber?: number,
  legacyChainId?: number
): Promise<BatchRecord | null> {
  const db = await ensureDb();
  const existing = await getBatchByIdDb(batchId);
  if (!existing) return null;

  let txHash: string;
  let anchoredAt: number = Date.now();
  let ipfsCid: string | undefined = existing.ipfsCid;
  let status: BatchStatus = 'ANCHORED';

  if (typeof updates === 'string') {
    txHash = updates;
  } else {
    txHash = updates.txHash;
    anchoredAt = updates.anchoredAt || Date.now();
    if (updates.ipfsCid) ipfsCid = updates.ipfsCid;
    if (updates.status) status = updates.status;
  }

  await db.execute(
    `UPDATE batches
     SET status = ?,
         txHash = ?,
         anchoredAt = ?,
         ipfsCid = ?
     WHERE LOWER(TRIM(batchId)) = LOWER(TRIM(?))`,
    [status, txHash, anchoredAt, ipfsCid || existing.ipfsCid, batchId]
  );

  return await getBatchByIdDb(batchId);
}

export async function revokeBatchLeafDb(
  batchId: string,
  leafIndex: number,
  revocationMeta?: {
    reasonCode?: string;
    reasonTitle?: string;
    reasonDescription?: string;
    supersededByHash?: string;
    officerStaffId?: string;
  }
): Promise<BatchRecord | null> {
  const db = await ensureDb();
  const existing = await getBatchByIdDb(batchId);
  if (!existing) return null;

  const currentRevoked: number[] = existing.revokedIndices || [];
  if (!currentRevoked.includes(leafIndex)) {
    currentRevoked.push(leafIndex);
    currentRevoked.sort((a, b) => a - b);
  }

  await db.transaction(async (tx: ITransactionalDb) => {
    await tx.execute(
      'UPDATE batches SET revokedIndices = ? WHERE LOWER(TRIM(batchId)) = LOWER(TRIM(?))',
      [JSON.stringify(currentRevoked), batchId]
    );

    if (revocationMeta) {
      const key = `${batchId}_${leafIndex}`;
      await tx.execute(
        `INSERT OR REPLACE INTO revocations (
          key, batchId, leafIndex, reasonCode, reasonTitle,
          reasonDescription, supersededByHash, revokedAt, officerStaffId
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          key,
          batchId,
          leafIndex,
          revocationMeta.reasonCode || null,
          revocationMeta.reasonTitle || null,
          revocationMeta.reasonDescription || null,
          revocationMeta.supersededByHash || null,
          new Date().toISOString().slice(0, 10),
          revocationMeta.officerStaffId || 'COE-EXAM-DESK',
        ]
      );
    }
  });

  existing.revokedIndices = currentRevoked;
  return existing;
}

export async function getCredentialByPrnDb(prn: string): Promise<DbCredentialItem | null> {
  const db = await ensureDb();
  const cleanPrn = String(prn || '').trim();
  if (!cleanPrn) return null;

  const row = await db.get<any>(
    `SELECT c.*, b.merkleRoot, b.ipfsCid, b.institutionName, b.revokedIndices
     FROM credentials c
     JOIN batches b ON c.batch_id = b.batchId
     WHERE UPPER(TRIM(c.prn)) = UPPER(TRIM(?))
     LIMIT 1`,
    [cleanPrn]
  );
  if (!row) return null;

  const revokedIndices: number[] = typeof row.revokedIndices === 'string'
    ? JSON.parse(row.revokedIndices || '[]')
    : row.revokedIndices || [];
  const isRevoked = revokedIndices.includes(Number(row.leaf_index));
  const parsedRaw = typeof row.raw_record === 'string' ? JSON.parse(row.raw_record || '{}') : row.raw_record || {};

  return {
    id: row.id,
    batchId: row.batch_id,
    prn: row.prn,
    fullName: row.full_name,
    degree: row.degree || undefined,
    branch: row.branch || undefined,
    cgpa: row.cgpa !== null && row.cgpa !== undefined ? Number(row.cgpa) : undefined,
    graduationYear: row.graduation_year !== null && row.graduation_year !== undefined ? Number(row.graduation_year) : undefined,
    institute: row.institute || parsedRaw?.institute || undefined,
    leafIndex: Number(row.leaf_index),
    rawRecord: parsedRaw,
    createdAt: Number(row.created_at),
    isRevoked,
    batchMetadata: {
      merkleRoot: row.merkleRoot,
      ipfsCid: row.ipfsCid,
      institutionName: row.institutionName || undefined,
    },
  };
}

export async function getCredentialByBatchAndPrnDb(batchId: string, prn: string): Promise<DbCredentialItem | null> {
  const db = await ensureDb();
  const cleanBatchId = String(batchId || '').trim();
  const cleanPrn = String(prn || '').trim();
  if (!cleanBatchId || !cleanPrn) return null;

  const row = await db.get<any>(
    `SELECT c.*, b.merkleRoot, b.ipfsCid, b.institutionName, b.revokedIndices
     FROM credentials c
     JOIN batches b ON c.batch_id = b.batchId
     WHERE LOWER(TRIM(c.batch_id)) = LOWER(TRIM(?)) AND UPPER(TRIM(c.prn)) = UPPER(TRIM(?))
     LIMIT 1`,
    [cleanBatchId, cleanPrn]
  );
  if (!row) return null;

  const revokedIndices: number[] = typeof row.revokedIndices === 'string'
    ? JSON.parse(row.revokedIndices || '[]')
    : row.revokedIndices || [];
  const isRevoked = revokedIndices.includes(Number(row.leaf_index));
  const parsedRaw = typeof row.raw_record === 'string' ? JSON.parse(row.raw_record || '{}') : row.raw_record || {};

  return {
    id: row.id,
    batchId: row.batch_id,
    prn: row.prn,
    fullName: row.full_name,
    degree: row.degree || undefined,
    branch: row.branch || undefined,
    cgpa: row.cgpa !== null && row.cgpa !== undefined ? Number(row.cgpa) : undefined,
    graduationYear: row.graduation_year !== null && row.graduation_year !== undefined ? Number(row.graduation_year) : undefined,
    institute: row.institute || parsedRaw?.institute || undefined,
    leafIndex: Number(row.leaf_index),
    rawRecord: parsedRaw,
    createdAt: Number(row.created_at),
    isRevoked,
    batchMetadata: {
      merkleRoot: row.merkleRoot,
      ipfsCid: row.ipfsCid,
      institutionName: row.institutionName || undefined,
    },
  };
}

export async function getStudentAccountDb(prn: string): Promise<StudentAccountRecord | null> {
  const cleanPrn = String(prn || '').trim().toUpperCase();
  if (!cleanPrn) return null;
  const db = await ensureDb();
  const row = await db.get<any>('SELECT * FROM student_accounts WHERE prn = ? LIMIT 1', [cleanPrn]);
  if (!row) return null;

  return {
    prn: row.prn,
    passwordHash: row.password_hash || null,
    activationTokenHash: row.activation_token_hash || null,
    activationExpiresAt: row.activation_expires_at !== null && row.activation_expires_at !== undefined ? Number(row.activation_expires_at) : null,
    status: (row.status as StudentAccountStatus) || 'PENDING_ACTIVATION',
    failedAttempts: typeof row.failed_attempts === 'number' || (typeof row.failed_attempts === 'string' && row.failed_attempts) ? Number(row.failed_attempts) : 0,
    lockedUntil: typeof row.locked_until === 'number' || (typeof row.locked_until === 'string' && row.locked_until) ? Number(row.locked_until) : 0,
    createdAt: Number(row.created_at),
    activatedAt: row.activated_at !== null && row.activated_at !== undefined ? Number(row.activated_at) : null,
    lastLoginAt: row.last_login_at !== null && row.last_login_at !== undefined ? Number(row.last_login_at) : null,
  };
}

export interface StudentAccountListItem {
  prn: string;
  fullName: string;
  degree?: string;
  branch?: string;
  batchId?: string;
  status: StudentAccountStatus;
  hasPassword: boolean;
  createdAt: number;
  activatedAt: number | null;
  lastLoginAt: number | null;
}

export async function getAllStudentAccountsDb(): Promise<StudentAccountListItem[]> {
  const db = await ensureDb();
  const rows = await db.query<any>(`
    SELECT 
      a.prn,
      a.status,
      a.password_hash,
      a.created_at,
      a.activated_at,
      a.last_login_at,
      c.full_name,
      c.degree,
      c.branch,
      c.batch_id
    FROM student_accounts a
    LEFT JOIN credentials c ON UPPER(a.prn) = UPPER(c.prn)
    ORDER BY a.created_at DESC, a.prn ASC
  `);

  return (rows || []).map((row: any) => ({
    prn: row.prn,
    fullName: row.full_name || 'Student',
    degree: row.degree || undefined,
    branch: row.branch || undefined,
    batchId: row.batch_id || undefined,
    status: (row.status as StudentAccountStatus) || (row.password_hash ? 'ACTIVE' : 'PENDING_ACTIVATION'),
    hasPassword: Boolean(row.password_hash),
    createdAt: Number(row.created_at),
    activatedAt: row.activated_at ? Number(row.activated_at) : null,
    lastLoginAt: row.last_login_at ? Number(row.last_login_at) : null,
  }));
}

export async function setStudentPasswordDb(prn: string, passwordHash: string): Promise<void> {
  const cleanPrn = String(prn || '').trim().toUpperCase();
  if (!cleanPrn) throw new Error('Invalid PRN for password update');
  const db = await ensureDb();
  await db.execute(
    `UPDATE student_accounts
     SET password_hash = ?,
         activation_token_hash = NULL,
         activation_expires_at = NULL,
         status = 'ACTIVE',
         failed_attempts = 0,
         locked_until = 0,
         activated_at = COALESCE(activated_at, ?)
     WHERE UPPER(prn) = ?`,
    [passwordHash, Date.now(), cleanPrn]
  );
}

export async function recordStudentLoginAttemptDb(prn: string, success: boolean): Promise<void> {
  const cleanPrn = String(prn || '').trim().toUpperCase();
  if (!cleanPrn) return;
  const db = await ensureDb();

  if (success) {
    await db.execute(
      `UPDATE student_accounts
       SET failed_attempts = 0,
           locked_until = 0,
           last_login_at = ?
       WHERE UPPER(prn) = ?`,
      [Date.now(), cleanPrn]
    );
  } else {
    // Increment failed_attempts for audit logging without imposing an account lockout
    const row = await db.get<{ failed_attempts?: number }>('SELECT failed_attempts FROM student_accounts WHERE UPPER(prn) = ? LIMIT 1', [cleanPrn]);
    const currentFailed = Number(row?.failed_attempts || 0) + 1;

    await db.execute(
      `UPDATE student_accounts
       SET failed_attempts = ?,
           locked_until = 0
       WHERE UPPER(prn) = ?`,
      [currentFailed, cleanPrn]
    );
  }
}

/**
 * Returns diagnostic metadata regarding current database storage and persistence.
 */
export async function getDatabaseStatus(): Promise<{
  path: string;
  exists: boolean;
  isProduction: boolean;
  journalMode: string;
  batchCount: number;
  credentialCount: number;
}> {
  const adapter = await ensureDb();
  let batchCount = 0;
  let credentialCount = 0;
  let journalMode = adapter.backend === 'turso' ? 'libsql' : 'wal';

  try {
    const bCount = await adapter.get<{ c: number }>('SELECT COUNT(*) as c FROM batches');
    batchCount = Number(bCount?.c || 0);
    const cCount = await adapter.get<{ c: number }>('SELECT COUNT(*) as c FROM credentials');
    credentialCount = Number(cCount?.c || 0);
  } catch {
    // Return zeros if query fails
  }

  return {
    path: process.env.TURSO_DATABASE_URL ? 'turso:remote' : (process.env.DATABASE_PATH?.trim() || 'data/veritrust.db'),
    exists: true,
    isProduction: process.env.NODE_ENV === 'production',
    journalMode,
    batchCount,
    credentialCount,
  };
}

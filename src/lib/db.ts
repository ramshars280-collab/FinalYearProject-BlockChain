import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { BatchRecord, StudentDegreeData } from '@/types';
import { initializeDefaultBatches } from '@/lib/storage';

// Database storage location
const DB_PATH =
  process.env.DATABASE_PATH ||
  (process.env.VERCEL
    ? path.join('/tmp', 'veritrust.db')
    : path.join(process.cwd(), 'data', 'veritrust.db'));

// Thread-safe global singleton using globalThis to eliminate file-descriptor leaks during Next.js hot-reloading
const globalForDb = globalThis as unknown as {
  __veritrust_db?: Database.Database;
};

export interface DbCredentialItem {
  id: string;
  batchId: string;
  prn: string;
  fullName: string;
  degree?: string;
  branch?: string;
  cgpa?: number;
  graduationYear?: number;
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

/**
 * Inserts or updates credentials associated with a graduation batch.
 * Ensures the PRN column is stored strictly as TEXT to preserve leading zeros.
 */
function insertCredentialsForBatch(db: Database.Database, batch: BatchRecord): void {
  if (!Array.isArray(batch.records) || batch.records.length === 0) return;

  const insertCred = db.prepare(`
    INSERT OR REPLACE INTO credentials (
      id, batch_id, prn, full_name, degree, branch, cgpa,
      graduation_year, leaf_index, raw_record, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction((records: StudentDegreeData[]) => {
    records.forEach((rec, idx) => {
      const prn = String(rec.prn || '').trim();
      if (!prn) return;
      const id = `${batch.batchId}_${prn}`;
      insertCred.run(
        id,
        batch.batchId,
        prn, // strictly TEXT
        rec.fullName || '',
        rec.degree || null,
        rec.branch || null,
        typeof rec.cgpa === 'number' ? rec.cgpa : null,
        typeof rec.graduationYear === 'number' ? rec.graduationYear : null,
        idx,
        JSON.stringify(rec),
        batch.timestamp || Date.now()
      );
    });
  });

  tx(batch.records);
}

/**
 * Backfills the credentials table from existing batches if the credentials table is empty.
 */
function backfillCredentialsIfEmpty(db: Database.Database): void {
  const credCountStmt = db.prepare('SELECT COUNT(*) as count FROM credentials');
  const { count } = credCountStmt.get() as { count: number };
  if (count === 0) {
    const batchRows = db.prepare('SELECT * FROM batches').all();
    for (const bRow of batchRows) {
      const parsed = parseBatchRow(bRow);
      insertCredentialsForBatch(db, parsed);
    }
  }
}

/**
 * Retrieves the global SQLite singleton instance, hardening connections with WAL,
 * busy timeouts, and synchronous normal settings.
 */
export function getDatabase(): Database.Database {
  if (!globalForDb.__veritrust_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const db = new Database(DB_PATH);

    // Hardened PRAGMAs for high-concurrency read/write and zero fd leaks
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = NORMAL');

    // Create Tables with strict TEXT column for PRN and composite unique index
    db.exec(`
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
        records TEXT NOT NULL
      );

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

      CREATE TABLE IF NOT EXISTS credentials (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        prn TEXT NOT NULL,
        full_name TEXT NOT NULL,
        degree TEXT,
        branch TEXT,
        cgpa REAL,
        graduation_year INTEGER,
        leaf_index INTEGER NOT NULL,
        raw_record TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (batch_id) REFERENCES batches(batchId) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_prn ON credentials(batch_id, prn);
      CREATE INDEX IF NOT EXISTS idx_credentials_prn ON credentials(prn);
      CREATE INDEX IF NOT EXISTS idx_credentials_leaf ON credentials(batch_id, leaf_index);
    `);

    // Check if initial default demo batch needs seeding
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM batches');
    const { count } = countStmt.get() as { count: number };
    if (count === 0) {
      const defaultBatches = initializeDefaultBatches();
      const insert = db.prepare(`
        INSERT OR REPLACE INTO batches (
          batchId, merkleRoot, ipfsCid, timestamp, issuer,
          institutionName, institutionCode, totalCredentials,
          revokedIndices, records
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const b of defaultBatches) {
        insert.run(
          b.batchId,
          b.merkleRoot,
          b.ipfsCid,
          b.timestamp,
          b.issuer,
          b.institutionName || null,
          b.institutionCode || null,
          b.totalCredentials,
          JSON.stringify(b.revokedIndices || []),
          JSON.stringify(b.records || [])
        );
        insertCredentialsForBatch(db, b);
      }
    } else {
      backfillCredentialsIfEmpty(db);
    }

    globalForDb.__veritrust_db = db;
  }

  return globalForDb.__veritrust_db;
}

function parseBatchRow(row: any): BatchRecord {
  return {
    batchId: row.batchId,
    merkleRoot: row.merkleRoot,
    ipfsCid: row.ipfsCid,
    timestamp: row.timestamp,
    issuer: row.issuer,
    institutionName: row.institutionName || undefined,
    institutionCode: row.institutionCode || undefined,
    totalCredentials: row.totalCredentials,
    revokedIndices: JSON.parse(row.revokedIndices || '[]'),
    records: JSON.parse(row.records || '[]'),
  };
}

export function getAllBatchesDb(): BatchRecord[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM batches ORDER BY timestamp DESC');
  const rows = stmt.all();
  return rows.map(parseBatchRow);
}

export function getBatchByIdDb(batchId: string): BatchRecord | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM batches WHERE LOWER(TRIM(batchId)) = LOWER(TRIM(?)) LIMIT 1');
  const row = stmt.get(batchId);
  if (!row) return null;
  return parseBatchRow(row);
}

export function saveBatchDb(batch: BatchRecord): BatchRecord {
  const db = getDatabase();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO batches (
      batchId, merkleRoot, ipfsCid, timestamp, issuer,
      institutionName, institutionCode, totalCredentials,
      revokedIndices, records
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    batch.batchId,
    batch.merkleRoot,
    batch.ipfsCid,
    batch.timestamp,
    batch.issuer,
    batch.institutionName || null,
    batch.institutionCode || null,
    batch.totalCredentials,
    JSON.stringify(batch.revokedIndices || []),
    JSON.stringify(batch.records || [])
  );

  insertCredentialsForBatch(db, batch);

  return batch;
}

export function revokeBatchLeafDb(
  batchId: string,
  leafIndex: number,
  revocationMeta?: {
    reasonCode?: string;
    reasonTitle?: string;
    reasonDescription?: string;
    supersededByHash?: string;
    officerStaffId?: string;
  }
): BatchRecord | null {
  const db = getDatabase();
  const existing = getBatchByIdDb(batchId);
  if (!existing) return null;

  const currentRevoked: number[] = existing.revokedIndices || [];
  if (!currentRevoked.includes(leafIndex)) {
    currentRevoked.push(leafIndex);
    currentRevoked.sort((a, b) => a - b);
  }

  const updateStmt = db.prepare('UPDATE batches SET revokedIndices = ? WHERE LOWER(TRIM(batchId)) = LOWER(TRIM(?))');
  updateStmt.run(JSON.stringify(currentRevoked), batchId);

  if (revocationMeta) {
    const key = `${batchId}_${leafIndex}`;
    const revStmt = db.prepare(`
      INSERT OR REPLACE INTO revocations (
        key, batchId, leafIndex, reasonCode, reasonTitle,
        reasonDescription, supersededByHash, revokedAt, officerStaffId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    revStmt.run(
      key,
      batchId,
      leafIndex,
      revocationMeta.reasonCode || null,
      revocationMeta.reasonTitle || null,
      revocationMeta.reasonDescription || null,
      revocationMeta.supersededByHash || null,
      new Date().toISOString().slice(0, 10),
      revocationMeta.officerStaffId || 'COE-EXAM-DESK'
    );
  }

  existing.revokedIndices = currentRevoked;
  return existing;
}

/**
 * Direct indexed lookup of a student credential by PRN across all batches.
 */
export function getCredentialByPrnDb(prn: string): DbCredentialItem | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT c.*, b.merkleRoot, b.ipfsCid, b.institutionName, b.revokedIndices
    FROM credentials c
    JOIN batches b ON c.batch_id = b.batchId
    WHERE UPPER(TRIM(c.prn)) = UPPER(TRIM(?))
    LIMIT 1
  `);
  const row = stmt.get(prn) as any;
  if (!row) return null;

  const revokedIndices: number[] = JSON.parse(row.revokedIndices || '[]');
  const isRevoked = revokedIndices.includes(row.leaf_index);

  return {
    id: row.id,
    batchId: row.batch_id,
    prn: row.prn,
    fullName: row.full_name,
    degree: row.degree || undefined,
    branch: row.branch || undefined,
    cgpa: row.cgpa !== null ? row.cgpa : undefined,
    graduationYear: row.graduation_year !== null ? row.graduation_year : undefined,
    leafIndex: row.leaf_index,
    rawRecord: JSON.parse(row.raw_record || '{}'),
    createdAt: row.created_at,
    isRevoked,
    batchMetadata: {
      merkleRoot: row.merkleRoot,
      ipfsCid: row.ipfsCid,
      institutionName: row.institutionName || undefined,
    },
  };
}

/**
 * Direct indexed lookup of a student credential by Batch ID and PRN using idx_batch_prn.
 */
export function getCredentialByBatchAndPrnDb(batchId: string, prn: string): DbCredentialItem | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT c.*, b.merkleRoot, b.ipfsCid, b.institutionName, b.revokedIndices
    FROM credentials c
    JOIN batches b ON c.batch_id = b.batchId
    WHERE LOWER(TRIM(c.batch_id)) = LOWER(TRIM(?)) AND UPPER(TRIM(c.prn)) = UPPER(TRIM(?))
    LIMIT 1
  `);
  const row = stmt.get(batchId, prn) as any;
  if (!row) return null;

  const revokedIndices: number[] = JSON.parse(row.revokedIndices || '[]');
  const isRevoked = revokedIndices.includes(row.leaf_index);

  return {
    id: row.id,
    batchId: row.batch_id,
    prn: row.prn,
    fullName: row.full_name,
    degree: row.degree || undefined,
    branch: row.branch || undefined,
    cgpa: row.cgpa !== null ? row.cgpa : undefined,
    graduationYear: row.graduation_year !== null ? row.graduation_year : undefined,
    leafIndex: row.leaf_index,
    rawRecord: JSON.parse(row.raw_record || '{}'),
    createdAt: row.created_at,
    isRevoked,
    batchMetadata: {
      merkleRoot: row.merkleRoot,
      ipfsCid: row.ipfsCid,
      institutionName: row.institutionName || undefined,
    },
  };
}


import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { BatchRecord } from '@/types';
import { initializeDefaultBatches } from '@/lib/storage';

// Database storage location
const DB_PATH =
  process.env.DATABASE_PATH ||
  (process.env.VERCEL
    ? path.join('/tmp', 'veritrust.db')
    : path.join(process.cwd(), 'data', 'veritrust.db'));

let dbInstance: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!dbInstance) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    dbInstance = new Database(DB_PATH);
    dbInstance.pragma('journal_mode = WAL');

    // Create batches table
    dbInstance.exec(`
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
    `);

    // Check if initial default demo batch needs seeding
    const countStmt = dbInstance.prepare('SELECT COUNT(*) as count FROM batches');
    const { count } = countStmt.get() as { count: number };
    if (count === 0) {
      const defaultBatches = initializeDefaultBatches();
      const insert = dbInstance.prepare(`
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
      }
    }
  }

  return dbInstance;
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

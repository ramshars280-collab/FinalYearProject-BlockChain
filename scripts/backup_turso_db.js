/**
 * SOET VeriTrust - Remote Turso Backup Utility
 *
 * Connects directly to the remote Turso database over network wire protocol,
 * extracts all schema DDL and table records in deterministic sorted order,
 * computes canonical SHA-256 fingerprints, and generates a structured
 * JSON snapshot and companion integrity manifest.
 *
 * Safety Rules:
 * - Strictly operates against: libsql://soet-veritrust-test-ramsha12.aws-ap-south-1.turso.io
 * - Reads credentials strictly from process memory ($env:TURSO_TEST_AUTH_TOKEN)
 * - Zero access to local SQLite (data/veritrust.db is never touched)
 * - Zero credentials logged, printed, or saved
 * - Clean event-loop exit (no process.exit(0) libuv race on Windows)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@libsql/client');

const EXPECTED_TEST_DB_URL = 'libsql://soet-veritrust-test-ramsha12.aws-ap-south-1.turso.io';
const REQUIRED_TABLES = ['batches', 'credentials', 'revocations', 'student_accounts'];

function sanitizeErrorMessage(msg) {
  if (!msg || typeof msg !== 'string') return 'Unknown error';
  return msg
    .replace(/Bearer\s+[A-Za-z0-9\-_\.]+/gi, 'Bearer [REDACTED]')
    .replace(/authToken=[^&\s]+/gi, 'authToken=[REDACTED]')
    .replace(/token=[^&\s]+/gi, 'token=[REDACTED]');
}

function computeSha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function canonicalTableFingerprint(records, pkField) {
  const sorted = [...records].sort((a, b) => {
    const aVal = String(a[pkField] || '');
    const bVal = String(b[pkField] || '');
    return aVal.localeCompare(bVal);
  });

  const canonicalJson = JSON.stringify(sorted, (key, value) => {
    if (value === undefined) return null;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const sortedObj = {};
      Object.keys(value).sort().forEach((k) => {
        sortedObj[k] = value[k];
      });
      return sortedObj;
    }
    return value;
  });

  return computeSha256(canonicalJson);
}

/**
 * Creates a remote Turso database backup and manifest.
 *
 * @param {Object} options
 * @param {string} options.url - Turso database URL.
 * @param {string} options.authToken - Turso authentication token.
 * @param {string} options.outputDir - Directory to store backup files.
 * @param {string} [options.prefix='turso_backup'] - Filename prefix.
 * @param {boolean} [options.silent=false] - Suppress console logs.
 * @returns {Promise<Object>} Backup metadata and file paths.
 */
async function createTursoBackup(options = {}) {
  const { url, authToken, outputDir, prefix = 'turso_backup', silent = false } = options;
  const log = (...args) => {
    if (!silent) console.log(...args);
  };

  if (!url || url.toLowerCase() !== EXPECTED_TEST_DB_URL.toLowerCase()) {
    throw new Error(`CRITICAL SAFETY ERROR: Invalid or unexpected Turso URL: ${url}`);
  }
  if (!authToken) {
    throw new Error('TURSO_AUTH_TOKEN is missing or empty.');
  }
  if (!outputDir) {
    throw new Error('outputDir is required.');
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const timestampStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const baseFilename = `${prefix}_${timestampStr}_${Math.random().toString(36).substring(2, 6)}`;
  const backupJsonPath = path.resolve(outputDir, `${baseFilename}.json`);
  const manifestPath = path.resolve(outputDir, `${baseFilename}.manifest.json`);

  if (fs.existsSync(backupJsonPath) || fs.existsSync(manifestPath)) {
    throw new Error(`EEXIST: Refusing to overwrite existing backup file: ${backupJsonPath}`);
  }

  let client = null;
  try {
    log(`[Backup] Connecting to remote Turso database: ${url}...`);
    client = createClient({ url, authToken });

    // 1. Extract Schema DDL
    log('[Backup] Extracting schema DDL (tables & indexes)...');
    const ddlRes = await client.execute(`
      SELECT type, name, tbl_name, sql
      FROM sqlite_master
      WHERE name NOT LIKE 'sqlite_%'
      ORDER BY CASE WHEN type='table' THEN 1 ELSE 2 END, name ASC
    `);
    const ddlStatements = (ddlRes.rows || []).map((r) => ({
      type: String(r.type),
      name: String(r.name),
      tableName: String(r.tbl_name),
      sql: String(r.sql),
    }));

    // 2. Extract Data from all 4 tables
    log('[Backup] Extracting table records and computing fingerprints...');
    const tablesData = {};
    const rowCounts = {};
    const fingerprints = {};

    const pkMap = {
      batches: 'batchId',
      credentials: 'id',
      revocations: 'key',
      student_accounts: 'prn',
    };

    for (const tbl of REQUIRED_TABLES) {
      const pk = pkMap[tbl];
      const rowsRes = await client.execute(`SELECT * FROM ${tbl} ORDER BY ${pk} ASC`);
      const records = (rowsRes.rows || []).map((r) => ({ ...r }));
      tablesData[tbl] = records;
      rowCounts[tbl] = records.length;
      fingerprints[tbl] = canonicalTableFingerprint(records, pk);
      log(`  - Table '${tbl}': ${records.length} records, fp=${fingerprints[tbl].slice(0, 12)}...`);
    }

    // 3. Assemble Snapshot Data Object
    const snapshotData = {
      format: 'soet-veritrust-turso-snapshot-v1',
      metadata: {
        sourceDatabaseUrl: url,
        databaseName: 'soet-veritrust-test',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        tableCounts: rowCounts,
        canonicalFingerprints: fingerprints,
      },
      schema: ddlStatements,
      data: tablesData,
    };

    const snapshotJsonString = JSON.stringify(snapshotData, null, 2);
    const backupFileSha256 = computeSha256(snapshotJsonString);

    // 4. Assemble Companion Manifest
    const manifest = {
      manifestVersion: '1.0.0',
      system: 'SOET VeriTrust Blockchain Degree Verification',
      backupType: 'remote-turso-export',
      sourceDatabase: {
        provider: 'turso-libsql',
        databaseName: 'soet-veritrust-test',
        url: url,
      },
      backupArtifact: {
        filename: path.basename(backupJsonPath),
        sha256: backupFileSha256,
        sizeBytes: Buffer.byteLength(snapshotJsonString, 'utf8'),
        createdAt: snapshotData.metadata.exportedAt,
      },
      schema: {
        tableCount: ddlStatements.filter((d) => d.type === 'table').length,
        indexCount: ddlStatements.filter((d) => d.type === 'index').length,
        requiredTablesPresent: REQUIRED_TABLES.every((t) =>
          ddlStatements.some((d) => d.type === 'table' && d.name === t)
        ),
      },
      metrics: {
        rowCounts,
        canonicalFingerprints: fingerprints,
      },
      security: {
        tokenRedacted: true,
        credentialsEncryptedAtRest: false,
        recommendedStorage: 'Encrypted offsite S3/GCS with AES-256-GCM',
      },
    };

    // 5. Atomic write of backup file and manifest
    fs.writeFileSync(backupJsonPath, snapshotJsonString, 'utf8');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    log(`[Backup] Successfully created backup snapshot: ${backupJsonPath}`);
    log(`[Backup] Successfully created companion manifest: ${manifestPath}`);
    log(`[Backup] Backup SHA-256: ${backupFileSha256}`);

    return {
      success: true,
      backupJsonPath,
      manifestPath,
      sha256: backupFileSha256,
      rowCounts,
      fingerprints,
    };
  } catch (err) {
    // Cleanup incomplete files on error
    if (fs.existsSync(backupJsonPath)) {
      try {
        fs.unlinkSync(backupJsonPath);
      } catch {}
    }
    if (fs.existsSync(manifestPath)) {
      try {
        fs.unlinkSync(manifestPath);
      } catch {}
    }
    const safeError = sanitizeErrorMessage(err.message);
    log(`[Backup ERROR]: ${safeError}`);
    throw new Error(safeError);
  } finally {
    if (client) {
      try {
        if (!client.closed) client.close();
      } catch {}
      client = null;
    }
  }
}

module.exports = {
  createTursoBackup,
  canonicalTableFingerprint,
  EXPECTED_TEST_DB_URL,
  REQUIRED_TABLES,
};


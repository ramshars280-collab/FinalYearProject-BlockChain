/**
 * SOET VeriTrust - Remote Turso Restore Utility
 *
 * Restores a remote Turso backup snapshot into an isolated destination SQLite database,
 * validates against its companion integrity manifest, and independently verifies
 * schema, row counts, constraints, and cryptographic fingerprints.
 *
 * Critical Safety Rules:
 * - Never overwrite, replace, or modify the live database (data/veritrust.db).
 * - Source backup is validated against manifest SHA-256 before restoration begins.
 * - Restores into an isolated SQLite destination.
 * - Atomic rollback and cleanup of incomplete destination files on failure.
 * - Rejects any corrupted or tampered backup files.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { canonicalTableFingerprint, REQUIRED_TABLES } = require('./backup_turso_db');

function sanitizeErrorMessage(msg) {
  if (!msg || typeof msg !== 'string') return 'Unknown error';
  return msg
    .replace(/Bearer\s+[A-Za-z0-9\-_\.]+/gi, 'Bearer [REDACTED]')
    .replace(/authToken=[^&\s]+/gi, 'authToken=[REDACTED]')
    .replace(/token=[^&\s]+/gi, 'token=[REDACTED]');
}

function computeFileSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Restores a Turso JSON backup snapshot into a target SQLite database.
 *
 * @param {Object} options
 * @param {string} options.backupJsonPath - Path to backup .json file.
 * @param {string} options.manifestPath - Path to companion .manifest.json file.
 * @param {string} options.destDbPath - Destination path for restored SQLite database.
 * @param {boolean} [options.silent=false] - Suppress console output.
 * @returns {Promise<Object>} Restore summary and validation results.
 */
async function restoreTursoBackup(options = {}) {
  const { backupJsonPath, manifestPath, destDbPath, silent = false } = options;
  const log = (...args) => {
    if (!silent) console.log(...args);
  };

  // Safety checks on destination path
  const canonicalDest = path.resolve(destDbPath).toLowerCase();
  const liveDbPath = path.resolve(__dirname, '../data/veritrust.db').toLowerCase();

  if (canonicalDest === liveDbPath || canonicalDest.includes('data/veritrust.db') || canonicalDest.includes('data\\veritrust.db')) {
    throw new Error(`CRITICAL SAFETY ERROR: Refusing to restore into live database path: ${destDbPath}`);
  }

  if (fs.existsSync(destDbPath)) {
    throw new Error(`EEXIST: Destination file already exists: ${destDbPath}`);
  }

  if (!fs.existsSync(backupJsonPath)) {
    throw new Error(`Backup file not found: ${backupJsonPath}`);
  }
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }

  let db = null;
  try {
    // 1. Verify Manifest and Backup SHA-256 Checksum
    log('[Restore] Reading manifest and verifying backup file checksum...');
    const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);

    const actualFileSha256 = computeFileSha256(backupJsonPath);
    if (actualFileSha256 !== manifest.backupArtifact?.sha256) {
      throw new Error(
        `INTEGRITY FAILURE: Backup file SHA-256 (${actualFileSha256}) does not match manifest (${manifest.backupArtifact?.sha256})`
      );
    }
    log('  ✓ Backup file SHA-256 matches manifest checksum.');

    // 2. Parse Snapshot JSON
    log('[Restore] Parsing backup snapshot JSON...');
    const snapshotRaw = fs.readFileSync(backupJsonPath, 'utf8');
    const snapshot = JSON.parse(snapshotRaw);

    if (snapshot.format !== 'soet-veritrust-turso-snapshot-v1') {
      throw new Error(`Unsupported backup format: ${snapshot.format}`);
    }

    // 3. Initialize Target SQLite Database
    log(`[Restore] Initializing target database at: ${destDbPath}...`);
    db = new Database(destDbPath);
    db.pragma('journal_mode = WAL');

    // 4. Execute Schema DDL (Tables first, then Indexes)
    log('[Restore] Executing schema DDL statements...');
    const tables = snapshot.schema.filter((s) => s.type === 'table');
    const indexes = snapshot.schema.filter((s) => s.type === 'index');

    for (const t of tables) {
      db.exec(t.sql);
      log(`  + Created table: ${t.name}`);
    }
    for (const idx of indexes) {
      db.exec(idx.sql);
      log(`  + Created index: ${idx.name}`);
    }

    // 5. Restore Records in strict relational dependency order inside a Transaction
    log('[Restore] Replaying table records inside an atomic transaction...');
    const restoreTx = db.transaction(() => {
      // 5a. Batches
      if (snapshot.data.batches) {
        const stmt = db.prepare(`
          INSERT INTO batches (
            batchId, merkleRoot, ipfsCid, timestamp, issuer,
            institutionName, institutionCode, totalCredentials,
            revokedIndices, records, status, txHash, anchoredAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const b of snapshot.data.batches) {
          stmt.run(
            b.batchId, b.merkleRoot, b.ipfsCid, b.timestamp, b.issuer,
            b.institutionName || null, b.institutionCode || null, b.totalCredentials,
            typeof b.revokedIndices === 'string' ? b.revokedIndices : JSON.stringify(b.revokedIndices || []),
            typeof b.records === 'string' ? b.records : JSON.stringify(b.records || []),
            b.status || 'INSTITUTIONAL_STORED', b.txHash || null, b.anchoredAt || null
          );
        }
      }

      // 5b. Credentials
      if (snapshot.data.credentials) {
        const stmt = db.prepare(`
          INSERT INTO credentials (
            id, batch_id, prn, full_name, degree, branch,
            cgpa, graduation_year, institute, leaf_index, raw_record, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const c of snapshot.data.credentials) {
          stmt.run(
            c.id, c.batch_id, c.prn, c.full_name, c.degree || null, c.branch || null,
            c.cgpa !== undefined ? c.cgpa : null, c.graduation_year !== undefined ? c.graduation_year : null,
            c.institute || null, c.leaf_index,
            typeof c.raw_record === 'string' ? c.raw_record : JSON.stringify(c.raw_record || {}),
            c.created_at
          );
        }
      }

      // 5c. Revocations
      if (snapshot.data.revocations) {
        const stmt = db.prepare(`
          INSERT INTO revocations (
            key, batchId, leafIndex, reasonCode, reasonTitle,
            reasonDescription, supersededByHash, revokedAt, officerStaffId
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const r of snapshot.data.revocations) {
          stmt.run(
            r.key, r.batchId, r.leafIndex, r.reasonCode || null, r.reasonTitle || null,
            r.reasonDescription || null, r.supersededByHash || null, r.revokedAt || null, r.officerStaffId || null
          );
        }
      }

      // 5d. Student Accounts
      if (snapshot.data.student_accounts) {
        const stmt = db.prepare(`
          INSERT INTO student_accounts (
            prn, password_hash, activation_token_hash, activation_expires_at,
            status, failed_attempts, locked_until, created_at, activated_at, last_login_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const a of snapshot.data.student_accounts) {
          stmt.run(
            a.prn, a.password_hash || null, a.activation_token_hash || null,
            a.activation_expires_at || null, a.status || 'PENDING_ACTIVATION',
            a.failed_attempts || 0, a.locked_until || 0, a.created_at,
            a.activated_at || null, a.last_login_at || null
          );
        }
      }
    });

    restoreTx();
    log('  ✓ Records replayed atomically.');

    // 6. Independent Post-Restore Integrity Verification
    log('[Restore] Running independent SQLite PRAGMA integrity_check...');
    const integrityRes = db.pragma('integrity_check');
    if (!integrityRes || integrityRes[0]?.integrity_check !== 'ok') {
      throw new Error(`Corrupted database restored: integrity_check returned ${JSON.stringify(integrityRes)}`);
    }
    log('  ✓ PRAGMA integrity_check: ok');

    // 7. Verify Row Counts and Canonical Fingerprints
    log('[Restore] Verifying restored row counts and canonical fingerprints against manifest...');
    const restoredRowCounts = {};
    const restoredFingerprints = {};
    const pkMap = {
      batches: 'batchId',
      credentials: 'id',
      revocations: 'key',
      student_accounts: 'prn',
    };

    for (const tbl of REQUIRED_TABLES) {
      const records = db.prepare(`SELECT * FROM ${tbl} ORDER BY ${pkMap[tbl]} ASC`).all();
      restoredRowCounts[tbl] = records.length;
      restoredFingerprints[tbl] = canonicalTableFingerprint(records, pkMap[tbl]);

      const expectedCount = manifest.metrics?.rowCounts?.[tbl] ?? 0;
      if (records.length !== expectedCount) {
        throw new Error(
          `Row count mismatch on restored table '${tbl}': expected ${expectedCount}, got ${records.length}`
        );
      }

      const expectedFp = manifest.metrics?.canonicalFingerprints?.[tbl];
      if (expectedFp && restoredFingerprints[tbl] !== expectedFp) {
        throw new Error(
          `Canonical fingerprint mismatch on restored table '${tbl}': expected ${expectedFp}, got ${restoredFingerprints[tbl]}`
        );
      }

      log(`  - Table '${tbl}': ${records.length} records, fingerprint verified.`);
    }

    log('[Restore] RESTORATION AND VERIFICATION COMPLETED SUCCESSFULLY.');

    return {
      success: true,
      destDbPath,
      restoredRowCounts,
      restoredFingerprints,
      integrityCheck: 'ok',
    };
  } catch (err) {
    if (db) {
      try {
        db.close();
      } catch {}
      db = null;
    }
    // Cleanup destination file on failure
    if (fs.existsSync(destDbPath)) {
      try {
        fs.unlinkSync(destDbPath);
      } catch {}
    }
    const safeError = sanitizeErrorMessage(err.message);
    log(`[Restore ERROR]: ${safeError}`);
    throw new Error(safeError);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
      db = null;
    }
  }
}

module.exports = {
  restoreTursoBackup,
};


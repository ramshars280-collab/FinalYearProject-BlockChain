/**
 * SOET VeriTrust - Standalone SQLite Backup Utility
 *
 * Safely creates consistent, verified SQLite backups using better-sqlite3's
 * Online Backup API (db.backup()) and generates a companion integrity manifest.
 *
 * Features:
 * - Read-only access to source database
 * - Checkpoints committed WAL data into destination database
 * - Unique timestamped filenames with strict overwrite protection
 * - Independent read-only verification of the backup
 * - SQLite PRAGMA integrity_check verification
 * - 4-table schema verification (batches, credentials, revocations, student_accounts)
 * - Row count parity verification
 * - Primary key parity verification
 * - Foreign-key / relational integrity verification
 * - Cryptographic SHA-256 fingerprint verification of credential records and authentication data
 * - Companion JSON integrity manifest generation (no secrets or sensitive data exposed)
 * - Automatic cleanup of partial files on failure
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Standard project table names
const REQUIRED_TABLES = ['batches', 'credentials', 'revocations', 'student_accounts'];

/**
 * Computes SHA-256 hash of a file on disk.
 */
function computeFileSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Computes SHA-256 hash of a string or returns 'NULL' if value is null/undefined.
 */
function computeHashFp(val) {
  if (val === null || val === undefined) {
    return 'NULL';
  }
  return crypto.createHash('sha256').update(String(val)).digest('hex');
}

/**
 * Generates a clean timestamp string in YYYYMMDD_HHMMSS format.
 */
function getTimestampString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

/**
 * Checks whether all required tables exist in a given SQLite database.
 */
function getExistingTables(db) {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  return rows.map((r) => r.name);
}

/**
 * Extracts verification metrics and cryptographic fingerprints from an open SQLite connection.
 * Zero plaintext passwords, hashes, tokens, or personal identities are logged or exposed.
 */
function extractDatabaseMetrics(db) {
  const tables = getExistingTables(db);
  const missingTables = REQUIRED_TABLES.filter((t) => !tables.includes(t));
  if (missingTables.length > 0) {
    throw new Error(`Missing required table(s): ${missingTables.join(', ')}`);
  }

  // 1. Batches
  const batches = db.prepare('SELECT batchId, merkleRoot, ipfsCid, timestamp, totalCredentials FROM batches ORDER BY batchId ASC').all();
  const batchPks = batches.map((b) => b.batchId);
  const batchDigest = crypto.createHash('sha256').update(JSON.stringify(batches)).digest('hex');

  // 2. Credentials
  const credentials = db.prepare('SELECT id, batch_id, prn, leaf_index, raw_record, created_at FROM credentials ORDER BY id ASC').all();
  const credentialPks = credentials.map((c) => c.id);
  const credentialFingerprints = credentials.map((c) => ({
    id: c.id,
    batchId: c.batch_id,
    prn: c.prn,
    leafIndex: c.leaf_index,
    rawRecordHash: computeHashFp(c.raw_record),
  }));
  const credentialDigest = crypto.createHash('sha256').update(JSON.stringify(credentialFingerprints)).digest('hex');

  // 3. Revocations
  const revocations = db.prepare('SELECT key, batchId, leafIndex FROM revocations ORDER BY key ASC').all();
  const revocationPks = revocations.map((r) => r.key);
  const revocationDigest = crypto.createHash('sha256').update(JSON.stringify(revocations)).digest('hex');

  // 4. Student Accounts (zero sensitive data exposed: only SHA-256 of stored hashes)
  const accounts = db.prepare('SELECT prn, password_hash, activation_token_hash, status, failed_attempts, locked_until, created_at FROM student_accounts ORDER BY prn ASC').all();
  const accountPks = accounts.map((a) => a.prn);
  const accountFingerprints = accounts.map((a) => ({
    prn: a.prn,
    status: a.status,
    passwordHashFp: computeHashFp(a.password_hash),
    activationTokenHashFp: computeHashFp(a.activation_token_hash),
  }));
  const accountDigest = crypto.createHash('sha256').update(JSON.stringify(accountFingerprints)).digest('hex');

  return {
    tables,
    rowCounts: {
      batches: batches.length,
      credentials: credentials.length,
      revocations: revocations.length,
      student_accounts: accounts.length,
    },
    primaryKeys: {
      batches: batchPks,
      credentials: credentialPks,
      revocations: revocationPks,
      student_accounts: accountPks,
    },
    fingerprints: {
      batchesDigest: batchDigest,
      credentialsDigest: credentialDigest,
      revocationsDigest: revocationDigest,
      accountsDigest: accountDigest,
      credentialItems: credentialFingerprints,
      accountItems: accountFingerprints,
    },
    relational: {
      credentialsBatchIds: [...new Set(credentials.map((c) => c.batch_id))],
      revocationsBatchIds: [...new Set(revocations.map((r) => r.batchId))],
    },
  };
}

/**
 * Creates and verifies an isolated SQLite backup.
 *
 * @param {Object} options
 * @param {string} [options.sourcePath] - Path to source SQLite database.
 * @param {string} [options.destDir] - Destination directory for backup and manifest.
 * @param {string} [options.prefix='veritrust_backup'] - Filename prefix.
 * @param {boolean} [options.refuseOverwrite=true] - Refuse to overwrite existing files.
 * @param {boolean} [options.silent=false] - Suppress console output.
 * @returns {Promise<Object>} Backup result with verification details and paths.
 */
async function createBackup(options = {}) {
  const silent = Boolean(options.silent);
  const log = (...args) => {
    if (!silent) console.log(...args);
  };
  const logError = (...args) => {
    if (!silent) console.error(...args);
  };

  const defaultSourcePath = process.env.DATABASE_PATH?.trim() || path.resolve(process.cwd(), 'data', 'veritrust.db');
  const sourcePath = path.resolve(options.sourcePath || defaultSourcePath);
  const defaultDestDir = path.resolve(process.cwd(), 'backups');
  const destDir = path.resolve(options.destDir || defaultDestDir);
  const prefix = options.prefix || 'veritrust_backup';
  const refuseOverwrite = options.refuseOverwrite !== false;

  log('===========================================================');
  log('   SOET VeriTrust - Standalone SQLite Backup Utility');
  log('===========================================================');
  log(`Timestamp:       ${new Date().toISOString()}`);
  log(`Source Database: ${sourcePath}`);
  log(`Destination Dir: ${destDir}`);

  // 1. Validate source database existence and accessibility
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source database file does not exist: ${sourcePath}`);
  }

  const sourceStats = fs.statSync(sourcePath);
  if (sourceStats.size === 0) {
    throw new Error(`Source database file is empty (0 bytes): ${sourcePath}`);
  }

  // 2. Prepare destination directory and unique filenames
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const timestampStr = options.timestamp || getTimestampString();
  const backupFileName = `${prefix}_${timestampStr}.db`;
  const manifestFileName = `${prefix}_${timestampStr}.manifest.json`;
  const backupFilePath = path.join(destDir, backupFileName);
  const manifestFilePath = path.join(destDir, manifestFileName);

  if (refuseOverwrite) {
    if (fs.existsSync(backupFilePath)) {
      throw new Error(`Target backup file already exists (refuseOverwrite=true): ${backupFilePath}`);
    }
    if (fs.existsSync(manifestFilePath)) {
      throw new Error(`Target manifest file already exists (refuseOverwrite=true): ${manifestFilePath}`);
    }
  }

  let sourceDb = null;
  let backupDb = null;
  let backupCreated = false;
  let manifestCreated = false;

  try {
    // 3. Inspect source database (strictly read-only)
    log('\n[Step 1/5] Inspecting source database in read-only mode...');
    sourceDb = new Database(sourcePath, { readonly: true });

    const sourceIntegrity = sourceDb.pragma('integrity_check');
    const isSourceIntegrityOk =
      Array.isArray(sourceIntegrity) &&
      sourceIntegrity.length === 1 &&
      sourceIntegrity[0].integrity_check === 'ok';

    if (!isSourceIntegrityOk) {
      throw new Error(`Source database failed integrity check: ${JSON.stringify(sourceIntegrity)}`);
    }

    const sourceMetrics = extractDatabaseMetrics(sourceDb);
    log(`  - Source integrity: ok`);
    log(`  - Batches:          ${sourceMetrics.rowCounts.batches}`);
    log(`  - Credentials:      ${sourceMetrics.rowCounts.credentials}`);
    log(`  - Revocations:      ${sourceMetrics.rowCounts.revocations}`);
    log(`  - Student Accounts: ${sourceMetrics.rowCounts.student_accounts}`);

    // 4. Execute SQLite Online Backup API
    log('\n[Step 2/5] Performing online backup via better-sqlite3 db.backup()...');
    await sourceDb.backup(backupFilePath);
    backupCreated = true;

    // Safely close source connection
    sourceDb.close();
    sourceDb = null;

    if (!fs.existsSync(backupFilePath)) {
      throw new Error(`Backup file was not created: ${backupFilePath}`);
    }

    const backupStats = fs.statSync(backupFilePath);
    if (backupStats.size === 0) {
      throw new Error(`Backup file is empty (0 bytes): ${backupFilePath}`);
    }
    log(`  - Backup file created: ${backupFileName} (${backupStats.size} bytes)`);

    // 5. Open backup independently in read-only mode and verify
    log('\n[Step 3/5] Verifying backup integrity and parity independently...');
    backupDb = new Database(backupFilePath, { readonly: true });

    // 5a. Integrity check
    const backupIntegrity = backupDb.pragma('integrity_check');
    const isBackupIntegrityOk =
      Array.isArray(backupIntegrity) &&
      backupIntegrity.length === 1 &&
      backupIntegrity[0].integrity_check === 'ok';

    if (!isBackupIntegrityOk) {
      throw new Error(`Backup database failed integrity check: ${JSON.stringify(backupIntegrity)}`);
    }
    log(`  - PRAGMA integrity_check: ok`);

    // 5b. Extract backup metrics
    const backupMetrics = extractDatabaseMetrics(backupDb);

    // 5c. Row count parity
    const rowCountsMatch =
      backupMetrics.rowCounts.batches === sourceMetrics.rowCounts.batches &&
      backupMetrics.rowCounts.credentials === sourceMetrics.rowCounts.credentials &&
      backupMetrics.rowCounts.revocations === sourceMetrics.rowCounts.revocations &&
      backupMetrics.rowCounts.student_accounts === sourceMetrics.rowCounts.student_accounts;

    if (!rowCountsMatch) {
      throw new Error(
        `Row count mismatch! Source: ${JSON.stringify(sourceMetrics.rowCounts)}, Backup: ${JSON.stringify(backupMetrics.rowCounts)}`
      );
    }
    log(`  - Row count parity: matched across all 4 tables`);

    // 5d. Primary key parity
    const pksMatch =
      JSON.stringify(backupMetrics.primaryKeys.batches) === JSON.stringify(sourceMetrics.primaryKeys.batches) &&
      JSON.stringify(backupMetrics.primaryKeys.credentials) === JSON.stringify(sourceMetrics.primaryKeys.credentials) &&
      JSON.stringify(backupMetrics.primaryKeys.revocations) === JSON.stringify(sourceMetrics.primaryKeys.revocations) &&
      JSON.stringify(backupMetrics.primaryKeys.student_accounts) === JSON.stringify(sourceMetrics.primaryKeys.student_accounts);

    if (!pksMatch) {
      throw new Error('Primary key parity mismatch between source and backup!');
    }
    log(`  - Primary key parity: matched across all 4 tables`);

    // 5e. Relational integrity
    const batchIdSet = new Set(backupMetrics.primaryKeys.batches);
    const orphanCredentials = backupMetrics.relational.credentialsBatchIds.filter((bId) => !batchIdSet.has(bId));
    const orphanRevocations = backupMetrics.relational.revocationsBatchIds.filter((bId) => !batchIdSet.has(bId));

    if (orphanCredentials.length > 0 || orphanRevocations.length > 0) {
      throw new Error(
        `Relational integrity violation: orphan credentials batchIds: ${orphanCredentials}, orphan revocations batchIds: ${orphanRevocations}`
      );
    }
    log(`  - Relational integrity: verified (all credential and revocation references exist in batches)`);

    // 5f. Cryptographic fingerprint parity
    const digestsMatch =
      backupMetrics.fingerprints.batchesDigest === sourceMetrics.fingerprints.batchesDigest &&
      backupMetrics.fingerprints.credentialsDigest === sourceMetrics.fingerprints.credentialsDigest &&
      backupMetrics.fingerprints.revocationsDigest === sourceMetrics.fingerprints.revocationsDigest &&
      backupMetrics.fingerprints.accountsDigest === sourceMetrics.fingerprints.accountsDigest;

    if (!digestsMatch) {
      throw new Error('Cryptographic fingerprint digest mismatch between source and backup!');
    }
    log(`  - Cryptographic fingerprint parity: verified (credentials records & authentication data intact)`);

    // Close backup connection
    backupDb.close();
    backupDb = null;

    // 6. Compute backup file SHA-256 checksum
    log('\n[Step 4/5] Computing backup file SHA-256 checksum...');
    const backupFileSha256 = computeFileSha256(backupFilePath);
    log(`  - Backup SHA-256: ${backupFileSha256}`);

    // 7. Generate companion integrity manifest
    log('\n[Step 5/5] Generating companion verification manifest...');
    const manifest = {
      manifestVersion: '1.0.0',
      timestamp: new Date().toISOString(),
      source: {
        path: sourcePath,
        sizeBytes: sourceStats.size,
      },
      backup: {
        filename: backupFileName,
        path: backupFilePath,
        sizeBytes: backupStats.size,
        sha256: backupFileSha256,
      },
      verification: {
        sqliteIntegrityCheck: 'ok',
        tablesExist: {
          batches: true,
          credentials: true,
          revocations: true,
          student_accounts: true,
        },
        rowCounts: backupMetrics.rowCounts,
        rowCountParity: true,
        primaryKeyParity: true,
        relationalIntegrity: true,
        fingerprintParity: {
          batches: true,
          credentials: true,
          revocations: true,
          student_accounts: true,
        },
        status: 'VERIFIED',
      },
      tableFingerprints: {
        batches: {
          count: backupMetrics.rowCounts.batches,
          pkCount: backupMetrics.primaryKeys.batches.length,
          digest: backupMetrics.fingerprints.batchesDigest,
        },
        credentials: {
          count: backupMetrics.rowCounts.credentials,
          pkCount: backupMetrics.primaryKeys.credentials.length,
          digest: backupMetrics.fingerprints.credentialsDigest,
        },
        revocations: {
          count: backupMetrics.rowCounts.revocations,
          pkCount: backupMetrics.primaryKeys.revocations.length,
          digest: backupMetrics.fingerprints.revocationsDigest,
        },
        student_accounts: {
          count: backupMetrics.rowCounts.student_accounts,
          pkCount: backupMetrics.primaryKeys.student_accounts.length,
          digest: backupMetrics.fingerprints.accountsDigest,
        },
      },
    };

    fs.writeFileSync(manifestFilePath, JSON.stringify(manifest, null, 2), 'utf8');
    manifestCreated = true;
    log(`  - Manifest created: ${manifestFileName}`);

    log('\n===========================================================');
    log('   BACKUP COMPLETED & VERIFIED SUCCESSFULLY');
    log('===========================================================');
    log(`Status:        VERIFIED`);
    log(`Backup File:   ${backupFilePath}`);
    log(`Manifest File: ${manifestFilePath}`);

    return {
      success: true,
      status: 'VERIFIED',
      backupFilePath,
      manifestFilePath,
      manifest,
    };
  } catch (err) {
    logError('\n❌ [BACKUP FAILURE]:', err.message);

    // Clean up partial artifacts on failure
    if (backupCreated && fs.existsSync(backupFilePath)) {
      try {
        log('Cleaning up incomplete backup file:', backupFilePath);
        fs.unlinkSync(backupFilePath);
      } catch (cleanErr) {
        logError('Warning: Failed to clean up backup file:', cleanErr.message);
      }
    }

    if (manifestCreated && fs.existsSync(manifestFilePath)) {
      try {
        log('Cleaning up manifest file:', manifestFilePath);
        fs.unlinkSync(manifestFilePath);
      } catch (cleanErr) {
        logError('Warning: Failed to clean up manifest file:', cleanErr.message);
      }
    }

    throw err;
  } finally {
    if (sourceDb) {
      try {
        sourceDb.close();
      } catch {}
    }
    if (backupDb) {
      try {
        backupDb.close();
      } catch {}
    }
  }
}

/**
 * CLI Entrypoint
 */
async function main() {
  const args = process.argv.slice(2);
  let sourcePath = undefined;
  let destDir = undefined;
  let prefix = 'veritrust_backup';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--source' || arg === '-s') {
      sourcePath = args[++i];
    } else if (arg === '--dest' || arg === '-d') {
      destDir = args[++i];
    } else if (arg === '--prefix' || arg === '-p') {
      prefix = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node scripts/backup_db.js [options]

Options:
  -s, --source <path>   Path to source SQLite database (default: data/veritrust.db)
  -d, --dest <dir>      Destination directory for backup (default: backups/)
  -p, --prefix <name>   Filename prefix (default: veritrust_backup)
  -h, --help            Show this help message
`);
      process.exit(0);
    }
  }

  try {
    await createBackup({ sourcePath, destDir, prefix });
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  createBackup,
  extractDatabaseMetrics,
  REQUIRED_TABLES,
};

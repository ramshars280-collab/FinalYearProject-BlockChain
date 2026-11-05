/**
 * SOET VeriTrust - Standalone SQLite Restore Utility
 *
 * Safely restores a previously verified SQLite backup into an isolated destination,
 * validates against its companion integrity manifest, and independently verifies
 * database integrity, schema, row counts, and cryptographic fingerprints.
 *
 * Critical Safety Rules:
 * - Never overwrite, replace, or modify the live database (data/veritrust.db).
 * - Canonical path resolution prevents alias / symlink bypass.
 * - Source backup is opened strictly in read-only mode.
 * - Full SHA-256 checksum verification against manifest prior to restore.
 * - Independent post-restore verification of all 4 tables and sensitive hash fingerprints.
 * - Strict cleanup of incomplete destination files on failure.
 * - Zero plaintext secrets, hashes, or personal identities exposed.
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { extractDatabaseMetrics, REQUIRED_TABLES } = require('./backup_db');

/**
 * Computes SHA-256 hash of a file on disk.
 */
function computeFileSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Normalizes and resolves a path to a canonical string for safe comparison.
 */
function toCanonicalPath(targetPath) {
  const resolved = path.resolve(targetPath);
  try {
    if (fs.existsSync(resolved)) {
      return fs.realpathSync(resolved).toLowerCase();
    }
  } catch {}
  return resolved.toLowerCase();
}

/**
 * Restores and independently verifies a SQLite backup against its companion manifest.
 *
 * @param {Object} options
 * @param {string} options.sourcePath - Path to backup .db file.
 * @param {string} options.manifestPath - Path to companion .manifest.json file.
 * @param {string} options.destPath - Destination path for restored database.
 * @param {boolean} [options.silent=false] - Suppress standard output.
 * @returns {Promise<Object>} Restore execution and verification summary.
 */
async function restoreDatabase(options = {}) {
  const silent = Boolean(options.silent);
  const log = (...args) => {
    if (!silent) console.log(...args);
  };
  const logError = (...args) => {
    if (!silent) console.error(...args);
  };

  log('===========================================================');
  log('   SOET VeriTrust - Standalone SQLite Restore Utility');
  log('===========================================================');
  log(`Timestamp: ${new Date().toISOString()}`);

  let currentStatus = 'INITIALIZING';
  let createdDestinationFile = false;

  // 1. Mandatory Arguments Validation
  if (!options.sourcePath) {
    throw new Error('Missing required argument: --source <backup-file>');
  }
  if (!options.manifestPath) {
    throw new Error('Missing required argument: --manifest <manifest-file>');
  }
  if (!options.destPath) {
    throw new Error('Missing required argument: --dest <restore-database-file>. Destination must be explicit.');
  }

  const sourcePath = path.resolve(options.sourcePath);
  const manifestPath = path.resolve(options.manifestPath);
  const destPath = path.resolve(options.destPath);

  log(`Source Backup:   ${sourcePath}`);
  log(`Manifest File:   ${manifestPath}`);
  log(`Destination DB:  ${destPath}`);

  // 2. Strict Live Database Protection Check
  const liveDbDefault = process.env.DATABASE_PATH?.trim() || path.resolve(process.cwd(), 'data', 'veritrust.db');
  const canonicalLivePath = toCanonicalPath(liveDbDefault);
  const canonicalDestPath = toCanonicalPath(destPath);

  if (canonicalDestPath === canonicalLivePath) {
    throw new Error(
      `CRITICAL SAFETY VIOLATION: Cannot restore into live database path (${destPath}). Direct modification of live database is strictly prohibited.`
    );
  }

  // 3. Destination Overwrite Protection Check
  if (fs.existsSync(destPath)) {
    throw new Error(`Destination file already exists: ${destPath}. Overwriting is strictly prohibited.`);
  }

  // 4. Source Backup File Existence and Non-Empty Check
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source backup file not found: ${sourcePath}`);
  }
  const sourceStats = fs.statSync(sourcePath);
  if (sourceStats.size === 0) {
    throw new Error(`Source backup file is empty (0 bytes): ${sourcePath}`);
  }

  // 5. Manifest Existence and Schema Validation
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }

  let manifest;
  try {
    const rawManifest = fs.readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(rawManifest);
  } catch (err) {
    throw new Error(`Malformed manifest file: failed to parse JSON: ${err.message}`);
  }

  if (
    !manifest ||
    !manifest.manifestVersion ||
    !manifest.backup ||
    !manifest.backup.sha256 ||
    !manifest.verification ||
    !manifest.verification.rowCounts ||
    !manifest.tableFingerprints
  ) {
    throw new Error('Malformed manifest: missing required top-level manifest structure or verification metadata.');
  }

  let sourceDb = null;
  let restoredDb = null;

  try {
    // 6. Pre-Restore Checksum Verification
    log('\n[Step 1/4] Verifying source backup SHA-256 against manifest...');
    const actualSourceSha256 = computeFileSha256(sourcePath);
    if (actualSourceSha256 !== manifest.backup.sha256) {
      throw new Error(
        `Source backup checksum mismatch! Expected (manifest): ${manifest.backup.sha256}, Actual: ${actualSourceSha256}`
      );
    }
    log(`  - SHA-256 verified: ${actualSourceSha256}`);

    // 7. Pre-Restore Source Backup Integrity & Schema Check
    log('\n[Step 2/4] Verifying source backup SQLite integrity and schema...');
    sourceDb = new Database(sourcePath, { readonly: true });

    const sourceIntegrity = sourceDb.pragma('integrity_check');
    const isSourceIntegrityOk =
      Array.isArray(sourceIntegrity) &&
      sourceIntegrity.length === 1 &&
      sourceIntegrity[0].integrity_check === 'ok';

    if (!isSourceIntegrityOk) {
      throw new Error(`Source backup failed SQLite integrity check: ${JSON.stringify(sourceIntegrity)}`);
    }

    const sourceMetrics = extractDatabaseMetrics(sourceDb);
    log(`  - Source PRAGMA integrity_check: ok`);
    log(`  - Source row counts: batches=${sourceMetrics.rowCounts.batches}, credentials=${sourceMetrics.rowCounts.credentials}, revocations=${sourceMetrics.rowCounts.revocations}, student_accounts=${sourceMetrics.rowCounts.student_accounts}`);

    // Verify source metrics match manifest expectations
    const manifestRowCounts = manifest.verification.rowCounts;
    const sourceMatchesManifest =
      sourceMetrics.rowCounts.batches === manifestRowCounts.batches &&
      sourceMetrics.rowCounts.credentials === manifestRowCounts.credentials &&
      sourceMetrics.rowCounts.revocations === manifestRowCounts.revocations &&
      sourceMetrics.rowCounts.student_accounts === manifestRowCounts.student_accounts;

    if (!sourceMatchesManifest) {
      throw new Error(
        `Source backup metrics do not match manifest row counts! Source: ${JSON.stringify(sourceMetrics.rowCounts)}, Manifest: ${JSON.stringify(manifestRowCounts)}`
      );
    }

    // 8. Execute Restoration via Online Backup API
    log('\n[Step 3/4] Restoring database to target location...');
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Begin restore
    await sourceDb.backup(destPath);
    createdDestinationFile = true;
    currentStatus = 'RESTORE_CREATED';

    // Safely close source connection
    sourceDb.close();
    sourceDb = null;

    if (!fs.existsSync(destPath)) {
      throw new Error(`Restoration failed: destination file was not created: ${destPath}`);
    }

    const destStats = fs.statSync(destPath);
    if (destStats.size === 0) {
      throw new Error(`Restoration failed: destination file is empty (0 bytes): ${destPath}`);
    }
    log(`  - Destination database written: ${destPath} (${destStats.size} bytes)`);
    log(`  - Status: ${currentStatus}`);

    // 9. Independent Post-Restore Verification
    log('\n[Step 4/4] Independently verifying restored database...');
    restoredDb = new Database(destPath, { readonly: true });

    // 9a. Restored SQLite integrity check
    const restoredIntegrity = restoredDb.pragma('integrity_check');
    const isRestoredIntegrityOk =
      Array.isArray(restoredIntegrity) &&
      restoredIntegrity.length === 1 &&
      restoredIntegrity[0].integrity_check === 'ok';

    if (!isRestoredIntegrityOk) {
      throw new Error(`Restored database failed SQLite integrity check: ${JSON.stringify(restoredIntegrity)}`);
    }
    log(`  - PRAGMA integrity_check: ok`);

    // 9b. Restored 4-table metrics extraction
    const restoredMetrics = extractDatabaseMetrics(restoredDb);

    // 9c. Row count parity against manifest
    const countsMatch =
      restoredMetrics.rowCounts.batches === manifestRowCounts.batches &&
      restoredMetrics.rowCounts.credentials === manifestRowCounts.credentials &&
      restoredMetrics.rowCounts.revocations === manifestRowCounts.revocations &&
      restoredMetrics.rowCounts.student_accounts === manifestRowCounts.student_accounts;

    if (!countsMatch) {
      throw new Error(
        `Restored row count mismatch! Restored: ${JSON.stringify(restoredMetrics.rowCounts)}, Manifest: ${JSON.stringify(manifestRowCounts)}`
      );
    }
    log(`  - Row count parity: matched across all 4 tables`);

    // 9d. Primary key parity against source
    const pksMatch =
      JSON.stringify(restoredMetrics.primaryKeys.batches) === JSON.stringify(sourceMetrics.primaryKeys.batches) &&
      JSON.stringify(restoredMetrics.primaryKeys.credentials) === JSON.stringify(sourceMetrics.primaryKeys.credentials) &&
      JSON.stringify(restoredMetrics.primaryKeys.revocations) === JSON.stringify(sourceMetrics.primaryKeys.revocations) &&
      JSON.stringify(restoredMetrics.primaryKeys.student_accounts) === JSON.stringify(sourceMetrics.primaryKeys.student_accounts);

    if (!pksMatch) {
      throw new Error('Primary key parity mismatch between source and restored database!');
    }
    log(`  - Primary key parity: matched across all 4 tables`);

    // 9e. Referential integrity
    const batchIdSet = new Set(restoredMetrics.primaryKeys.batches);
    const orphanCredentials = restoredMetrics.relational.credentialsBatchIds.filter((bId) => !batchIdSet.has(bId));
    const orphanRevocations = restoredMetrics.relational.revocationsBatchIds.filter((bId) => !batchIdSet.has(bId));

    if (orphanCredentials.length > 0 || orphanRevocations.length > 0) {
      throw new Error(
        `Relational integrity violation in restored database: orphan credentials: ${orphanCredentials}, orphan revocations: ${orphanRevocations}`
      );
    }
    log(`  - Relational integrity: verified (all credential and revocation references exist in batches)`);

    // 9f. Cryptographic fingerprint digest match against manifest
    const manifestTf = manifest.tableFingerprints;
    const digestsMatch =
      restoredMetrics.fingerprints.batchesDigest === manifestTf.batches.digest &&
      restoredMetrics.fingerprints.credentialsDigest === manifestTf.credentials.digest &&
      restoredMetrics.fingerprints.revocationsDigest === manifestTf.revocations.digest &&
      restoredMetrics.fingerprints.accountsDigest === manifestTf.student_accounts.digest;

    if (!digestsMatch) {
      throw new Error('Cryptographic table digest mismatch between restored database and manifest!');
    }
    log(`  - Cryptographic fingerprint parity: verified (credential records & student authentication hashes match manifest)`);

    // Close restored connection
    restoredDb.close();
    restoredDb = null;

    currentStatus = 'RESTORE_VERIFIED';

    log('\n===========================================================');
    log('   RESTORE COMPLETED & VERIFIED SUCCESSFULLY');
    log('===========================================================');
    log(`Final Status:   ${currentStatus}`);
    log(`Restored DB:    ${destPath}`);
    log(`Source Backup:  ${sourcePath}`);
    log(`Manifest File:  ${manifestPath}`);

    return {
      success: true,
      status: currentStatus,
      destPath,
      sourcePath,
      manifestPath,
      rowCounts: restoredMetrics.rowCounts,
      checksum: actualSourceSha256,
    };
  } catch (err) {
    currentStatus = 'RESTORE_FAILED';
    logError('\n❌ [RESTORE FAILURE]:', err.message);
    logError(`Status: ${currentStatus}`);

    // Clean up partial destination file if created during this attempt
    if (createdDestinationFile && fs.existsSync(destPath)) {
      try {
        log('Cleaning up incomplete restored file:', destPath);
        fs.unlinkSync(destPath);
      } catch (cleanErr) {
        logError('Warning: Failed to clean up incomplete restored file:', cleanErr.message);
      }
    }

    throw err;
  } finally {
    if (sourceDb) {
      try {
        sourceDb.close();
      } catch {}
    }
    if (restoredDb) {
      try {
        restoredDb.close();
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
  let manifestPath = undefined;
  let destPath = undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--source' || arg === '-s') {
      sourcePath = args[++i];
    } else if (arg === '--manifest' || arg === '-m') {
      manifestPath = args[++i];
    } else if (arg === '--dest' || arg === '-d') {
      destPath = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node scripts/restore_db.js [options]

Options:
  -s, --source <backup-file>     Path to source SQLite backup file (required)
  -m, --manifest <manifest-file> Path to companion verification manifest file (required)
  -d, --dest <destination-file>  Path for restored database file (required, cannot be live DB)
  -h, --help                     Show this help message
`);
      process.exit(0);
    }
  }

  if (!sourcePath || !manifestPath || !destPath) {
    console.error('Error: Arguments --source, --manifest, and --dest are all required.\nUse --help for usage information.');
    process.exit(1);
  }

  try {
    await restoreDatabase({ sourcePath, manifestPath, destPath });
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  restoreDatabase,
  toCanonicalPath,
};


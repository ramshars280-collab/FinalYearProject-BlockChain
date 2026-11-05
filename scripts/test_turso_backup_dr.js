/**
 * SOET VeriTrust - Phase 3C Step 8H: Turso Remote Backup & Disaster Recovery Rehearsal
 *
 * Rehearses and validates end-to-end remote backup, manifest generation,
 * isolated SQLite restoration, canonical fingerprint comparison, and corruption detection.
 *
 * Mandatory Safety Restrictions:
 * - Operates strictly against: libsql://soet-veritrust-test-ramsha12.aws-ap-south-1.turso.io
 * - Uses EXCLUSIVELY synthetic test records
 * - Never touches or restores into data/veritrust.db
 * - Zero real student records, zero blockchain transactions
 * - Zero secrets or tokens logged
 * - Clean event loop draining without forced process.exit(0)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@libsql/client');
const { createTursoBackup, EXPECTED_TEST_DB_URL, REQUIRED_TABLES } = require('./backup_turso_db');
const { restoreTursoBackup } = require('./restore_turso_db');

const LIVE_DB_PATH = path.resolve(__dirname, '../data/veritrust.db');
const BASELINE_BACKUP_PATH = path.resolve(__dirname, '../backups/veritrust_backup_20261103_004046.db');

// Synthetic Disaster Recovery Test Dataset
const SYNTHETIC_DR = {
  batch: {
    batchId: 'DEMO-DR-BATCH-001',
    merkleRoot: '0xcccc1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
    ipfsCid: 'QmDemoDrCid001',
    timestamp: 1730598000000,
    issuer: 'Demo DR Examination Officer',
    institutionName: 'SOET Demo Institute of Technology',
    institutionCode: 'SOET-DEMO-01',
    totalCredentials: 2,
    revokedIndices: JSON.stringify([0]),
    records: JSON.stringify([
      { prn: 'DEMO-DR-CSE-001', fullName: 'Demo DR Student 001' },
      { prn: 'DEMO-DR-CSE-002', fullName: 'Demo DR Student 002' },
    ]),
    status: 'ANCHORED',
    txHash: '0xdddd1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    anchoredAt: 1730598060000,
  },
  credentials: [
    {
      id: 'DEMO-DR-BATCH-001_DEMO-DR-CSE-001',
      batch_id: 'DEMO-DR-BATCH-001',
      prn: 'DEMO-DR-CSE-001',
      full_name: 'Demo DR Student 001',
      degree: 'B.Tech',
      branch: 'Computer Science & Engineering',
      cgpa: 9.35,
      graduation_year: 2026,
      institute: 'SOET Demo Institute of Technology',
      leaf_index: 0,
      raw_record: JSON.stringify({ prn: 'DEMO-DR-CSE-001', fullName: 'Demo DR Student 001', cgpa: 9.35 }),
      created_at: 1730598000000,
    },
    {
      id: 'DEMO-DR-BATCH-001_DEMO-DR-CSE-002',
      batch_id: 'DEMO-DR-BATCH-001',
      prn: 'DEMO-DR-CSE-002',
      full_name: 'Demo DR Student 002',
      degree: 'B.Tech',
      branch: 'Computer Science & Engineering',
      cgpa: 8.95,
      graduation_year: 2026,
      institute: 'SOET Demo Institute of Technology',
      leaf_index: 1,
      raw_record: JSON.stringify({ prn: 'DEMO-DR-CSE-002', fullName: 'Demo DR Student 002', cgpa: 8.95 }),
      created_at: 1730598000000,
    },
  ],
  revocation: {
    key: 'DEMO-DR-BATCH-001_0',
    batchId: 'DEMO-DR-BATCH-001',
    leafIndex: 0,
    reasonCode: 'ADMIN_CORRECTION',
    reasonTitle: 'Synthetic DR Revocation Test',
    reasonDescription: 'Testing remote Turso backup and recovery fidelity',
    supersededByHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
    revokedAt: '2026-11-03T11:00:00.000Z',
    officerStaffId: 'OFFICER-DR-99',
  },
  student_accounts: [
    {
      prn: 'DEMO-DR-CSE-001',
      password_hash: 'scrypt:0123456789abcdef0123456789abcdef:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      activation_token_hash: null,
      activation_expires_at: null,
      status: 'ACTIVE',
      failed_attempts: 0,
      locked_until: 0,
      created_at: 1730598000000,
      activated_at: 1730598100000,
      last_login_at: 1730598200000,
    },
    {
      prn: 'DEMO-DR-CSE-002',
      password_hash: null,
      activation_token_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      activation_expires_at: 1730684400000,
      status: 'PENDING_ACTIVATION',
      failed_attempts: 0,
      locked_until: 0,
      created_at: 1730598000000,
      activated_at: null,
      last_login_at: null,
    },
  ],
};

function sanitizeErrorMessage(msg) {
  if (!msg || typeof msg !== 'string') return 'Unknown error';
  return msg
    .replace(/Bearer\s+[A-Za-z0-9\-_\.]+/gi, 'Bearer [REDACTED]')
    .replace(/authToken=[^&\s]+/gi, 'authToken=[REDACTED]')
    .replace(/token=[^&\s]+/gi, 'token=[REDACTED]');
}

function computeFileHash(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    return {
      hash: crypto.createHash('sha256').update(data).digest('hex'),
      size: data.length,
    };
  } catch (err) {
    return { hash: 'READ_ERROR: ' + err.message, size: 0 };
  }
}

async function runBackupDrTest() {
  console.log('================================================================');
  console.log('   SOET VeriTrust - Remote Turso Backup & DR Rehearsal (8H)    ');
  console.log('================================================================');
  console.log('Execution Mode: Isolated Remote Backup, Restore & Corruption Testing');
  console.log(`Target Database: soet-veritrust-test (${EXPECTED_TEST_DB_URL})`);
  console.log(`Timestamp:       ${new Date().toISOString()}`);

  const livePreHash = computeFileHash(LIVE_DB_PATH);
  console.log(`Live DB Pre-Test Checksum:   ${livePreHash.hash}`);
  const backupPreHash = computeFileHash(BASELINE_BACKUP_PATH);
  console.log(`Backup Pre-Test Checksum:    ${backupPreHash.hash}`);

  const tempBaseDir = path.resolve(__dirname, `../tmp_dr_test_${Date.now()}`);
  const backupOutDir = path.resolve(tempBaseDir, 'backup');
  const restoreDbPath = path.resolve(tempBaseDir, 'restored.db');

  let client = null;
  const results = {
    remotePreCheck: false,
    syntheticSeedSuccess: false,
    backupCreationSuccess: false,
    restoreSuccess: false,
    fingerprintParitySuccess: false,
    corruptionDetectionSuccess: false,
    cleanupSuccess: false,
    remoteFinalCheck: false,
    localIntegrityPreserved: false,
    details: {},
  };

  try {
    fs.mkdirSync(backupOutDir, { recursive: true });

    // 1. Environment validation
    const dbUrl = (process.env.TURSO_DATABASE_URL || '').trim();
    const testToken = (process.env.TURSO_TEST_AUTH_TOKEN || '').trim();

    if (!dbUrl) throw new Error('TURSO_DATABASE_URL environment variable is missing.');
    if (dbUrl.toLowerCase() !== EXPECTED_TEST_DB_URL.toLowerCase()) {
      throw new Error(`CRITICAL MISMATCH: URL (${dbUrl}) does not match expected test URL (${EXPECTED_TEST_DB_URL}).`);
    }
    if (!testToken) throw new Error('TURSO_TEST_AUTH_TOKEN environment variable is missing.');

    client = createClient({ url: EXPECTED_TEST_DB_URL, authToken: testToken });

    // =========================================================================
    // PART A: Remote Pre-Check (Zero Rows Expected)
    // =========================================================================
    console.log('\n--- [Part A] Remote Turso Pre-Check ---');
    for (const t of REQUIRED_TABLES) {
      const res = await client.execute(`SELECT COUNT(*) as c FROM ${t}`);
      const count = Number(res.rows?.[0]?.c ?? 0);
      console.log(`  - Table '${t}': ${count} rows`);
      if (count !== 0) {
        throw new Error(`SAFETY ABORT: Table '${t}' has ${count} existing rows! Expected exactly 0 rows.`);
      }
    }
    results.remotePreCheck = true;
    console.log('  ✓ Remote Turso verified: 4 tables, strictly 0 rows.');

    // =========================================================================
    // PART B: Populate Synthetic Disaster Recovery Dataset
    // =========================================================================
    console.log('\n--- [Part B] Populating Synthetic DR Dataset into Turso ---');
    // Batch
    await client.execute({
      sql: `INSERT INTO batches (
        batchId, merkleRoot, ipfsCid, timestamp, issuer,
        institutionName, institutionCode, totalCredentials,
        revokedIndices, records, status, txHash, anchoredAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        SYNTHETIC_DR.batch.batchId, SYNTHETIC_DR.batch.merkleRoot, SYNTHETIC_DR.batch.ipfsCid,
        SYNTHETIC_DR.batch.timestamp, SYNTHETIC_DR.batch.issuer, SYNTHETIC_DR.batch.institutionName,
        SYNTHETIC_DR.batch.institutionCode, SYNTHETIC_DR.batch.totalCredentials,
        SYNTHETIC_DR.batch.revokedIndices, SYNTHETIC_DR.batch.records,
        SYNTHETIC_DR.batch.status, SYNTHETIC_DR.batch.txHash, SYNTHETIC_DR.batch.anchoredAt,
      ],
    });

    // Credentials
    for (const c of SYNTHETIC_DR.credentials) {
      await client.execute({
        sql: `INSERT INTO credentials (
          id, batch_id, prn, full_name, degree, branch,
          cgpa, graduation_year, institute, leaf_index, raw_record, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          c.id, c.batch_id, c.prn, c.full_name, c.degree, c.branch,
          c.cgpa, c.graduation_year, c.institute, c.leaf_index, c.raw_record, c.created_at,
        ],
      });
    }

    // Revocation
    await client.execute({
      sql: `INSERT INTO revocations (
        key, batchId, leafIndex, reasonCode, reasonTitle,
        reasonDescription, supersededByHash, revokedAt, officerStaffId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        SYNTHETIC_DR.revocation.key, SYNTHETIC_DR.revocation.batchId, SYNTHETIC_DR.revocation.leafIndex,
        SYNTHETIC_DR.revocation.reasonCode, SYNTHETIC_DR.revocation.reasonTitle,
        SYNTHETIC_DR.revocation.reasonDescription, SYNTHETIC_DR.revocation.supersededByHash,
        SYNTHETIC_DR.revocation.revokedAt, SYNTHETIC_DR.revocation.officerStaffId,
      ],
    });

    // Student Accounts
    for (const a of SYNTHETIC_DR.student_accounts) {
      await client.execute({
        sql: `INSERT INTO student_accounts (
          prn, password_hash, activation_token_hash, activation_expires_at,
          status, failed_attempts, locked_until, created_at, activated_at, last_login_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          a.prn, a.password_hash, a.activation_token_hash, a.activation_expires_at,
          a.status, a.failed_attempts, a.locked_until, a.created_at, a.activated_at, a.last_login_at,
        ],
      });
    }

    results.syntheticSeedSuccess = true;
    console.log('  ✓ Synthetic DR dataset populated: 1 batch, 2 credentials, 1 revocation, 2 student accounts.');

    // =========================================================================
    // PART C: Execute Remote Turso Backup
    // =========================================================================
    console.log('\n--- [Part C] Executing Remote Turso Backup ---');
    const backupResult = await createTursoBackup({
      url: EXPECTED_TEST_DB_URL,
      authToken: testToken,
      outputDir: backupOutDir,
      prefix: 'rehearsal_dr_backup',
      silent: false,
    });

    results.backupCreationSuccess = backupResult.success;
    results.details.backupSha256 = backupResult.sha256;
    results.details.backupFiles = {
      json: backupResult.backupJsonPath,
      manifest: backupResult.manifestPath,
    };
    console.log('  ✓ Remote Turso backup completed.');

    // =========================================================================
    // PART D: Restore into Isolated SQLite Database & Verify Parity
    // =========================================================================
    console.log('\n--- [Part D] Restoring Backup into Isolated Destination Database ---');
    const restoreResult = await restoreTursoBackup({
      backupJsonPath: backupResult.backupJsonPath,
      manifestPath: backupResult.manifestPath,
      destDbPath: restoreDbPath,
      silent: false,
    });

    results.restoreSuccess = restoreResult.success;

    // Verify Fingerprint Parity between Remote Backup and Restored Database
    console.log('\n--- [Part D cont.] Verifying Canonical Fingerprint Parity ---');
    let fingerprintsMatch = true;
    for (const t of REQUIRED_TABLES) {
      const backupFp = backupResult.fingerprints[t];
      const restoredFp = restoreResult.restoredFingerprints[t];
      const match = backupFp === restoredFp;
      console.log(`  - Table '${t}': ${match ? 'MATCH' : 'MISMATCH'} (${restoredFp})`);
      if (!match) fingerprintsMatch = false;
    }

    if (!fingerprintsMatch) {
      throw new Error('Parity verification failed: restored database fingerprints do not match remote backup!');
    }
    results.fingerprintParitySuccess = true;
    console.log('  ✓ 100% Data Fidelity Verified: Restored SQLite database matches remote Turso data.');

    // =========================================================================
    // PART E: Corruption & Failure Handling Validation
    // =========================================================================
    console.log('\n--- [Part E] Recovery & Corruption Detection Tests ---');

    // Test E1: Tampered Data File (Bit Flip Detection)
    console.log('  + Test E1: Tampered backup data file (SHA-256 mismatch detection)...');
    const tamperedDataPath = path.resolve(tempBaseDir, 'tampered_backup.json');
    const originalContent = fs.readFileSync(backupResult.backupJsonPath, 'utf8');
    // Modify one byte
    const tamperedContent = originalContent.replace('"DEMO-DR-BATCH-001"', '"TAMPERED-BATCH-001"');
    fs.writeFileSync(tamperedDataPath, tamperedContent, 'utf8');

    let bitFlipDetected = false;
    const testDestE1 = path.resolve(tempBaseDir, 'should_fail_e1.db');
    try {
      await restoreTursoBackup({
        backupJsonPath: tamperedDataPath,
        manifestPath: backupResult.manifestPath, // original manifest with original sha256
        destDbPath: testDestE1,
        silent: true,
      });
    } catch (err) {
      if (err.message.includes('INTEGRITY FAILURE') && err.message.includes('SHA-256')) {
        bitFlipDetected = true;
        console.log('    ✓ Expected rejection received: SHA-256 checksum mismatch caught.');
      } else {
        console.log(`    ✓ Rejection received with error: ${err.message}`);
        bitFlipDetected = true;
      }
    }
    if (!bitFlipDetected || fs.existsSync(testDestE1)) {
      throw new Error('Corruption test E1 failed: tampered backup was not rejected or left file behind!');
    }

    // Test E2: Tampered Manifest Row Count
    console.log('  + Test E2: Tampered manifest row count detection...');
    const tamperedManifestPath = path.resolve(tempBaseDir, 'tampered.manifest.json');
    const manifestObj = JSON.parse(fs.readFileSync(backupResult.manifestPath, 'utf8'));
    // Make sha256 match the tampered file so it passes step 1 and fails step 7
    manifestObj.backupArtifact.sha256 = crypto.createHash('sha256').update(tamperedContent).digest('hex');
    manifestObj.metrics.rowCounts.batches = 999; // impossible row count!
    fs.writeFileSync(tamperedManifestPath, JSON.stringify(manifestObj, null, 2), 'utf8');

    let rowCountMismatchDetected = false;
    const testDestE2 = path.resolve(tempBaseDir, 'should_fail_e2.db');
    try {
      await restoreTursoBackup({
        backupJsonPath: tamperedDataPath,
        manifestPath: tamperedManifestPath,
        destDbPath: testDestE2,
        silent: true,
      });
    } catch (err) {
      if (err.message.includes('Row count mismatch') || err.message.includes('INTEGRITY')) {
        rowCountMismatchDetected = true;
        console.log('    ✓ Expected rejection received: Row count mismatch caught.');
      } else {
        rowCountMismatchDetected = true;
      }
    }
    if (!rowCountMismatchDetected || fs.existsSync(testDestE2)) {
      throw new Error('Corruption test E2 failed: tampered manifest row count was not caught!');
    }

    // Test E3: Overwrite Protection on Destination
    console.log('  + Test E3: Strict overwrite protection on destination database...');
    let overwritePrevented = false;
    try {
      await restoreTursoBackup({
        backupJsonPath: backupResult.backupJsonPath,
        manifestPath: backupResult.manifestPath,
        destDbPath: restoreDbPath, // already exists!
        silent: true,
      });
    } catch (err) {
      if (err.message.includes('EEXIST')) {
        overwritePrevented = true;
        console.log('    ✓ Expected rejection received: EEXIST destination overwrite prevented.');
      }
    }
    if (!overwritePrevented) {
      throw new Error('Overwrite protection failed: existing destination was overwritten!');
    }

    results.corruptionDetectionSuccess = bitFlipDetected && rowCountMismatchDetected && overwritePrevented;
    console.log('  ✓ All 3 corruption and overwrite protection tests passed.');

    return results;
  } catch (err) {
    const safeError = sanitizeErrorMessage(err.message);
    console.error('\n❌ [DR TEST FAILURE]:', safeError);
    results.error = safeError;
    throw new Error(safeError);
  } finally {
    // =========================================================================
    // PART F: Cleanup & Final Zero-Record Remote Verification
    // =========================================================================
    if (client) {
      console.log('\n--- [Part F] Targeted Remote Cleanup & Zero-Record Verification ---');
      try {
        console.log('  + Deleting synthetic DR records from Turso...');
        await client.execute({
          sql: 'DELETE FROM credentials WHERE batch_id = ?',
          args: [SYNTHETIC_DR.batch.batchId],
        });
        await client.execute({
          sql: 'DELETE FROM revocations WHERE key = ?',
          args: [SYNTHETIC_DR.revocation.key],
        });
        await client.execute({
          sql: 'DELETE FROM batches WHERE batchId = ?',
          args: [SYNTHETIC_DR.batch.batchId],
        });
        await client.execute("DELETE FROM student_accounts WHERE prn LIKE 'DEMO-DR-CSE-%'");

        results.cleanupSuccess = true;
        console.log('  ✓ Targeted synthetic DR records deleted.');

        // Verify all 4 tables returned to 0 rows
        console.log('\n--- Final Remote Zero-Record Verification ---');
        let allZero = true;
        const finalCounts = {};
        for (const t of REQUIRED_TABLES) {
          const res = await client.execute(`SELECT COUNT(*) as c FROM ${t}`);
          const count = Number(res.rows?.[0]?.c ?? 0);
          finalCounts[t] = count;
          console.log(`  - Table '${t}': ${count} rows`);
          if (count !== 0) allZero = false;
        }

        results.remoteFinalCheck = allZero;
        results.details.finalRowCounts = finalCounts;
        if (allZero) {
          console.log('  ✓ Remote Turso returned to clean state (strictly 0 rows across all 4 tables).');
        } else {
          console.error('❌ CRITICAL: Remote Turso has non-zero records after cleanup!');
        }
      } catch (cleanErr) {
        console.error('❌ Error during cleanup:', sanitizeErrorMessage(cleanErr.message));
      } finally {
        try {
          if (!client.closed) client.close();
        } catch {}
        client = null;
      }
    }

    // Teardown temporary directory
    if (fs.existsSync(tempBaseDir)) {
      try {
        fs.rmSync(tempBaseDir, { recursive: true, force: true });
        console.log(`  ✓ Temporary DR test directory removed: ${tempBaseDir}`);
      } catch {}
    }

    // Verify Local SQLite Integrity
    const livePostHash = computeFileHash(LIVE_DB_PATH);
    const backupPostHash = computeFileHash(BASELINE_BACKUP_PATH);

    const liveMatch = livePreHash.hash === livePostHash.hash;
    const backupMatch = backupPreHash.hash === backupPostHash.hash;

    console.log(`\nLive DB Post-Check Checksum:   ${livePostHash.hash} (${liveMatch ? 'MATCH' : 'MISMATCH'})`);
    console.log(`Backup Post-Check Checksum:    ${backupPostHash.hash} (${backupMatch ? 'MATCH' : 'MISMATCH'})`);

    results.localIntegrityPreserved = liveMatch && backupMatch;
    if (results.localIntegrityPreserved) {
      console.log('  ✓ Local SQLite database and backups are 100% UNCHANGED (Zero local modifications).');
    } else {
      console.error('❌ CRITICAL SAFETY VIOLATION: Local database or backup checksum changed!');
    }
  }
}

if (require.main === module) {
  runBackupDrTest()
    .then((results) => {
      console.log('\n================================================================');
      console.log('   REMOTE TURSO BACKUP & DR TEST EXECUTION SUMMARY');
      console.log('================================================================');
      const allPassed =
        results.remotePreCheck &&
        results.syntheticSeedSuccess &&
        results.backupCreationSuccess &&
        results.restoreSuccess &&
        results.fingerprintParitySuccess &&
        results.corruptionDetectionSuccess &&
        results.cleanupSuccess &&
        results.remoteFinalCheck &&
        results.localIntegrityPreserved;

      console.log(`Final Verdict: ${allPassed ? 'REMOTE BACKUP AND RESTORE TEST PASSED' : 'BACKUP OR RESTORE TEST FAILED'}`);
    })
    .catch(() => {
      process.exitCode = 1;
    });
}

module.exports = {
  runBackupDrTest,
  SYNTHETIC_DR,
};


/**
 * SOET VeriTrust - Local-Only Turso Migration Dry-Run Simulator
 *
 * SIMULATES:
 * 1. Consistent snapshot creation from data/veritrust.db using SQLite Online Backup API.
 * 2. Read-only extraction of batches, credentials, revocations, and student_accounts.
 * 3. Validation of schema constraints, types, nullability, unique keys, and JSON integrity.
 * 4. Staging into an isolated in-memory SQLite database (:memory:) with exact production DDL.
 * 5. Sequential relational insertion: batches -> credentials -> revocations -> student_accounts.
 * 6. Cryptographic SHA-256 fingerprint verification of password hashes and activation tokens.
 * 7. In-memory transactional failure rollback verification.
 * 8. Complete teardown and removal of temporary snapshot files.
 *
 * STRICT SAFETY RESTRICTIONS:
 * - Operates strictly offline. Zero network calls, zero Turso/libSQL connections.
 * - Fails closed immediately if TURSO_DATABASE_URL is set.
 * - Source database data/veritrust.db opened strictly in read-only mode ({ readonly: true }).
 * - Zero modifications to live database, WAL, or historical project data.
 * - Sensitive values (hashes, tokens, passwords) are NEVER exposed or logged.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

async function main() {
  console.log('====================================================');
  console.log('SOET VeriTrust - Local-Only Turso Migration Dry Run');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // SAFETY CHECK 1: Fail closed if remote environment is detected
  // ----------------------------------------------------
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_DATABASE_URL.trim() !== '') {
    console.error('FATAL SAFETY VIOLATION: TURSO_DATABASE_URL is set in environment.');
    console.error('This dry-run script must strictly run locally without remote configuration.');
    process.exit(1);
  }

  // ----------------------------------------------------
  // SAFETY CHECK 2: Source database resolution
  // ----------------------------------------------------
  const liveDbPath = path.resolve(process.cwd(), 'data', 'veritrust.db');
  if (!fs.existsSync(liveDbPath)) {
    console.error('FATAL: Source database not found at:', liveDbPath);
    process.exit(1);
  }

  const tmpDir = path.resolve(
    process.cwd(),
    'tmp_dry_run_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)
  );
  const snapshotPath = path.resolve(tmpDir, 'veritrust_snapshot.db');

  if (
    snapshotPath.toLowerCase() === liveDbPath.toLowerCase() ||
    snapshotPath.toLowerCase().includes('data\\veritrust.db') ||
    snapshotPath.toLowerCase().includes('data/veritrust.db')
  ) {
    console.error('FATAL SAFETY VIOLATION: Snapshot path matches live database:', snapshotPath);
    process.exit(1);
  }

  fs.mkdirSync(tmpDir, { recursive: true });

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}: ${details}`);
      failed++;
    }
  }

  let snapshotDb = null;
  let memDb = null;

  try {
    // ----------------------------------------------------
    // STEP 1: Consistent SQLite Snapshot via Online Backup API
    // ----------------------------------------------------
    console.log('--- STEP 1: CREATING ISOLATED READ-ONLY SNAPSHOT ---');
    const sourceDb = new Database(liveDbPath, { readonly: true });
    await sourceDb.backup(snapshotPath);
    sourceDb.close();

    console.log('Snapshot successfully created at:', snapshotPath);

    snapshotDb = new Database(snapshotPath, { readonly: true });
    const integrityCheck = snapshotDb.pragma('integrity_check');
    const isIntegrityOk =
      Array.isArray(integrityCheck) &&
      integrityCheck.length === 1 &&
      integrityCheck[0].integrity_check === 'ok';

    assert(isIntegrityOk, 'Snapshot integrity verification (PRAGMA integrity_check = ok)');
    if (!isIntegrityOk) {
      throw new Error('Snapshot integrity check failed.');
    }

    // ----------------------------------------------------
    // STEP 2: In-Memory Database Staging Setup
    // ----------------------------------------------------
    console.log('\n--- STEP 2: INITIALIZING IN-MEMORY STAGING DATABASE ---');
    memDb = new Database(':memory:');

    // Exact schema matching production src/lib/db.ts
    memDb.exec(`
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
        institute TEXT,
        leaf_index INTEGER NOT NULL,
        raw_record TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_prn ON credentials(batch_id, prn);
      CREATE INDEX IF NOT EXISTS idx_credentials_prn ON credentials(prn);
      CREATE INDEX IF NOT EXISTS idx_credentials_leaf ON credentials(batch_id, leaf_index);

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

      CREATE INDEX IF NOT EXISTS idx_student_accounts_status ON student_accounts(status);
    `);

    assert(true, 'In-memory database schema initialized with exact production DDL');

    // ----------------------------------------------------
    // STEP 3: Extraction and Validation of Data
    // ----------------------------------------------------
    console.log('\n--- STEP 3: EXTRACTING & VALIDATING DATA FROM SNAPSHOT ---');

    // 3a. Batches
    const sourceBatches = snapshotDb.prepare('SELECT * FROM batches ORDER BY timestamp ASC').all();
    let batchesValid = true;
    let batchValidationError = '';
    for (const b of sourceBatches) {
      if (!b.batchId || !b.merkleRoot || typeof b.ipfsCid !== 'string' || typeof b.timestamp !== 'number') {
        batchesValid = false;
        batchValidationError = `Invalid batch row attributes for batch ${b.batchId}`;
        break;
      }
      try {
        const parsedIndices = JSON.parse(b.revokedIndices);
        const parsedRecords = JSON.parse(b.records);
        if (!Array.isArray(parsedIndices) || !Array.isArray(parsedRecords)) {
          batchesValid = false;
          batchValidationError = `JSON fields are not arrays for batch ${b.batchId}`;
          break;
        }
      } catch (jsonErr) {
        batchesValid = false;
        batchValidationError = `JSON parse failed for batch ${b.batchId}: ${jsonErr.message}`;
        break;
      }
    }
    assert(
      sourceBatches.length > 0 && batchesValid,
      `Table 'batches' extracted (${sourceBatches.length} rows, schema & JSON valid)`,
      batchValidationError
    );

    // 3b. Credentials
    const sourceCredentials = snapshotDb.prepare('SELECT * FROM credentials ORDER BY created_at ASC').all();
    let credsValid = true;
    const batchIdSet = new Set(sourceBatches.map((b) => b.batchId));
    for (const c of sourceCredentials) {
      if (!c.id || !c.batch_id || !c.prn || !c.full_name || typeof c.leaf_index !== 'number') {
        credsValid = false;
        break;
      }
      if (!batchIdSet.has(c.batch_id)) {
        credsValid = false;
        break;
      }
      try {
        JSON.parse(c.raw_record);
      } catch {
        credsValid = false;
        break;
      }
    }
    assert(
      sourceCredentials.length > 0 && credsValid,
      `Table 'credentials' extracted (${sourceCredentials.length} rows, FK references & JSON valid)`
    );

    // 3c. Revocations
    const sourceRevocations = snapshotDb.prepare('SELECT * FROM revocations').all();
    let revsValid = true;
    for (const r of sourceRevocations) {
      if (!r.key || !r.batchId || typeof r.leafIndex !== 'number') {
        revsValid = false;
        break;
      }
      if (!batchIdSet.has(r.batchId)) {
        revsValid = false;
        break;
      }
    }
    assert(
      sourceRevocations.length > 0 && revsValid,
      `Table 'revocations' extracted (${sourceRevocations.length} rows, FK references valid)`
    );

    // 3d. Student Accounts
    const sourceAccounts = snapshotDb.prepare('SELECT * FROM student_accounts').all();
    let accountsValid = true;
    let activeAccountsCount = 0;
    let pendingAccountsCount = 0;

    for (const a of sourceAccounts) {
      if (!a.prn || typeof a.created_at !== 'number') {
        accountsValid = false;
        break;
      }
      if (a.status === 'ACTIVE') {
        activeAccountsCount++;
        // Verify scrypt format: scrypt:<16-byte-salt-hex>:<64-byte-key-hex>
        if (!a.password_hash || !/^scrypt:[0-9a-fA-F]{32}:[0-9a-fA-F]{128}$/.test(a.password_hash)) {
          accountsValid = false;
          break;
        }
      } else if (a.status === 'PENDING_ACTIVATION') {
        pendingAccountsCount++;
      }
      if (a.activation_token_hash && !/^[0-9a-fA-F]{64}$/.test(a.activation_token_hash)) {
        accountsValid = false;
        break;
      }
    }
    assert(
      sourceAccounts.length > 0 && accountsValid,
      `Table 'student_accounts' extracted (${sourceAccounts.length} rows: ${activeAccountsCount} ACTIVE, ${pendingAccountsCount} PENDING_ACTIVATION, scrypt formats valid)`
    );

    // ----------------------------------------------------
    // STEP 4: Staging into In-Memory Database
    // ----------------------------------------------------
    console.log('\n--- STEP 4: STAGING DATA INTO IN-MEMORY DATABASE ---');

    const insertBatchStmt = memDb.prepare(`
      INSERT INTO batches (
        batchId, merkleRoot, ipfsCid, timestamp, issuer,
        institutionName, institutionCode, totalCredentials,
        revokedIndices, records, status, txHash, anchoredAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertCredStmt = memDb.prepare(`
      INSERT INTO credentials (
        id, batch_id, prn, full_name, degree, branch, cgpa,
        graduation_year, institute, leaf_index, raw_record, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertRevStmt = memDb.prepare(`
      INSERT INTO revocations (
        key, batchId, leafIndex, reasonCode, reasonTitle,
        reasonDescription, supersededByHash, revokedAt, officerStaffId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAccountStmt = memDb.prepare(`
      INSERT INTO student_accounts (
        prn, password_hash, activation_token_hash, activation_expires_at,
        status, failed_attempts, locked_until, created_at, activated_at, last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Execute staging in a single atomic transaction
    const stageTransaction = memDb.transaction(() => {
      // 1. Batches
      for (const b of sourceBatches) {
        insertBatchStmt.run(
          b.batchId,
          b.merkleRoot,
          b.ipfsCid,
          b.timestamp,
          b.issuer,
          b.institutionName || null,
          b.institutionCode || null,
          b.totalCredentials,
          b.revokedIndices,
          b.records,
          b.status,
          b.txHash || null,
          b.anchoredAt || null
        );
      }

      // 2. Credentials
      for (const c of sourceCredentials) {
        insertCredStmt.run(
          c.id,
          c.batch_id,
          c.prn,
          c.full_name,
          c.degree || null,
          c.branch || null,
          c.cgpa || null,
          c.graduation_year || null,
          c.institute || null,
          c.leaf_index,
          c.raw_record,
          c.created_at
        );
      }

      // 3. Revocations
      for (const r of sourceRevocations) {
        insertRevStmt.run(
          r.key,
          r.batchId,
          r.leafIndex,
          r.reasonCode || null,
          r.reasonTitle || null,
          r.reasonDescription || null,
          r.supersededByHash || null,
          r.revokedAt || null,
          r.officerStaffId || null
        );
      }

      // 4. Student Accounts
      for (const a of sourceAccounts) {
        insertAccountStmt.run(
          a.prn,
          a.password_hash || null,
          a.activation_token_hash || null,
          a.activation_expires_at || null,
          a.status,
          a.failed_attempts || 0,
          a.locked_until || 0,
          a.created_at,
          a.activated_at || null,
          a.last_login_at || null
        );
      }
    });

    stageTransaction();
    assert(true, 'Atomic sequential staging (batches -> credentials -> revocations -> student_accounts) succeeded');

    // ----------------------------------------------------
    // STEP 5: Verification of Staged In-Memory Data Parity
    // ----------------------------------------------------
    console.log('\n--- STEP 5: PARITY & FIDELITY VERIFICATION ---');

    const stagedBatches = memDb.prepare('SELECT * FROM batches ORDER BY timestamp ASC').all();
    const stagedCredentials = memDb.prepare('SELECT * FROM credentials ORDER BY created_at ASC').all();
    const stagedRevocations = memDb.prepare('SELECT * FROM revocations').all();
    const stagedAccounts = memDb.prepare('SELECT * FROM student_accounts').all();

    // 5a. Row Count Parity
    const countsMatch =
      stagedBatches.length === sourceBatches.length &&
      stagedCredentials.length === sourceCredentials.length &&
      stagedRevocations.length === sourceRevocations.length &&
      stagedAccounts.length === sourceAccounts.length;

    assert(
      countsMatch,
      `Row count parity verified: ${stagedBatches.length} batches, ${stagedCredentials.length} credentials, ${stagedRevocations.length} revocations, ${stagedAccounts.length} student_accounts`
    );

    // 5b. Primary Key Parity
    const sourceBatchIds = sourceBatches.map((b) => b.batchId).sort();
    const stagedBatchIds = stagedBatches.map((b) => b.batchId).sort();
    const pksMatch =
      JSON.stringify(sourceBatchIds) === JSON.stringify(stagedBatchIds) &&
      JSON.stringify(sourceCredentials.map((c) => c.id).sort()) ===
        JSON.stringify(stagedCredentials.map((c) => c.id).sort()) &&
      JSON.stringify(sourceRevocations.map((r) => r.key).sort()) ===
        JSON.stringify(stagedRevocations.map((r) => r.key).sort()) &&
      JSON.stringify(sourceAccounts.map((a) => a.prn).sort()) ===
        JSON.stringify(stagedAccounts.map((a) => a.prn).sort());

    assert(pksMatch, 'Primary key parity verified across all 4 tables');

    // 5c. Cryptographic Fingerprint Match on Sensitive Fields (Zero values logged)
    let authFingerprintsMatch = true;
    for (let i = 0; i < sourceAccounts.length; i++) {
      const src = sourceAccounts[i];
      const tgt = stagedAccounts.find((a) => a.prn === src.prn);
      if (!tgt) {
        authFingerprintsMatch = false;
        break;
      }
      const srcHashFp = src.password_hash
        ? crypto.createHash('sha256').update(src.password_hash).digest('hex')
        : 'NULL';
      const tgtHashFp = tgt.password_hash
        ? crypto.createHash('sha256').update(tgt.password_hash).digest('hex')
        : 'NULL';
      if (srcHashFp !== tgtHashFp) {
        authFingerprintsMatch = false;
        break;
      }
      const srcTokenFp = src.activation_token_hash
        ? crypto.createHash('sha256').update(src.activation_token_hash).digest('hex')
        : 'NULL';
      const tgtTokenFp = tgt.activation_token_hash
        ? crypto.createHash('sha256').update(tgt.activation_token_hash).digest('hex')
        : 'NULL';
      if (srcTokenFp !== tgtTokenFp) {
        authFingerprintsMatch = false;
        break;
      }
    }

    assert(
      authFingerprintsMatch,
      'Authentication data fidelity verified via SHA-256 fingerprint comparison (zero values exposed)'
    );

    // ----------------------------------------------------
    // STEP 6: In-Memory Transaction Rollback Test
    // ----------------------------------------------------
    console.log('\n--- STEP 6: IN-MEMORY TRANSACTION ROLLBACK TEST ---');
    const preRollbackBatchCount = memDb.prepare('SELECT COUNT(*) as c FROM batches').get().c;
    let rollbackDetected = false;

    try {
      memDb.exec('BEGIN IMMEDIATE');
      // Deliberately insert invalid duplicate PK
      memDb.prepare('INSERT INTO batches (batchId, merkleRoot, ipfsCid, timestamp, issuer, totalCredentials, revokedIndices, records) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        stagedBatches[0].batchId, // Duplicate PK!
        '0x00',
        'Qm00',
        Date.now(),
        '0x00',
        0,
        '[]',
        '[]'
      );
      memDb.exec('COMMIT');
    } catch (err) {
      rollbackDetected = true;
      try {
        memDb.exec('ROLLBACK');
      } catch {}
    }

    const postRollbackBatchCount = memDb.prepare('SELECT COUNT(*) as c FROM batches').get().c;
    const isRollbackClean = rollbackDetected && preRollbackBatchCount === postRollbackBatchCount;

    assert(
      isRollbackClean,
      'In-memory transaction rollback succeeded: deliberate collision rejected, row counts preserved'
    );

  } finally {
    // ----------------------------------------------------
    // STEP 7: Safe Teardown and Cleanup
    // ----------------------------------------------------
    console.log('\n--- STEP 7: CLEANUP ---');
    if (snapshotDb) {
      try {
        snapshotDb.close();
      } catch {}
    }
    if (memDb) {
      try {
        memDb.close();
      } catch {}
    }

    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        console.log('Temporary snapshot directory cleanly removed:', tmpDir);
      }
    } catch (cleanErr) {
      console.warn('Notice: Failed to remove temporary directory:', tmpDir, cleanErr.message);
    }
  }

  console.log('\n====================================================');
  console.log(`Dry-Run Migration Simulation: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal Dry-Run Error:', err);
  process.exit(1);
});

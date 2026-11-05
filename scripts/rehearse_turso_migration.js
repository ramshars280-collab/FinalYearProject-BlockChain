/**
 * SOET VeriTrust - Phase 3C Step 8F: Controlled SQLite-to-Turso Migration Rehearsal
 *
 * Performs an end-to-end migration rehearsal from an isolated, purely SYNTHETIC
 * SQLite source database into the remote Turso test database (soet-veritrust-test).
 *
 * Mandatory Safety Restrictions:
 * - Operates strictly against: libsql://soet-veritrust-test-ramsha12.aws-ap-south-1.turso.io
 * - ZERO access to live records in data/veritrust.db (never read, copied, or uploaded)
 * - Source data is 100% synthetic, generated on-the-fly in a temporary isolated SQLite database
 * - Passwords and activation tokens are fake, non-sensitive hashes
 * - Zero blockchain transactions
 * - Zero credentials logged, printed, or saved
 * - Clean event loop draining without forced process.exit(0)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { createClient } = require('@libsql/client');

const EXPECTED_TEST_DB_URL = 'libsql://soet-veritrust-test-ramsha12.aws-ap-south-1.turso.io';
const LIVE_DB_PATH = path.resolve(__dirname, '../data/veritrust.db');
const BASELINE_BACKUP_PATH = path.resolve(__dirname, '../backups/veritrust_backup_20261103_004046.db');

const REQUIRED_TABLES = ['batches', 'credentials', 'revocations', 'student_accounts'];

// 100% Synthetic Rehearsal Dataset
const SYNTHETIC_DATASET = {
  batches: [
    {
      batchId: 'DEMO-MIGRATION-BATCH-001',
      merkleRoot: '0x1111aaaaaaaa2222bbbb3333cccc4444dddd5555eeee6666ffff777700008888',
      ipfsCid: 'QmDemoMigrationCid001',
      timestamp: 1730592000000,
      issuer: 'Demo Examination Officer',
      institutionName: 'SOET Demo Institute of Technology',
      institutionCode: 'SOET-DEMO-01',
      totalCredentials: 3,
      revokedIndices: JSON.stringify([0]),
      records: JSON.stringify([
        { prn: 'DEMO-MIGRATION-CSE-001', fullName: 'Demo Migration Student 001', degree: 'B.Tech', branch: 'CSE' },
        { prn: 'DEMO-MIGRATION-CSE-002', fullName: 'Demo Migration Student 002', degree: 'B.Tech', branch: 'CSE' },
        { prn: 'DEMO-MIGRATION-CSE-003', fullName: 'Demo Migration Student 003', degree: 'B.Tech', branch: 'CSE' },
      ]),
      status: 'ANCHORED',
      txHash: '0xaaaa1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      anchoredAt: 1730592060000,
    },
    {
      batchId: 'DEMO-MIGRATION-BATCH-002',
      merkleRoot: '0x2222bbbb3333cccc4444dddd5555eeee6666ffff7777aaaa8888bbbb9999cccc',
      ipfsCid: 'QmDemoMigrationCid002',
      timestamp: 1730595600000,
      issuer: 'Demo Examination Officer',
      institutionName: 'SOET Demo Institute of Technology',
      institutionCode: 'SOET-DEMO-01',
      totalCredentials: 2,
      revokedIndices: JSON.stringify([]),
      records: JSON.stringify([
        { prn: 'DEMO-MIGRATION-CSE-004', fullName: 'Demo Migration Student 004', degree: 'M.Tech', branch: 'CSE' },
        { prn: 'DEMO-MIGRATION-CSE-005', fullName: 'Demo Migration Student 005', degree: 'M.Tech', branch: 'CSE' },
      ]),
      status: 'INSTITUTIONAL_STORED',
      txHash: null,
      anchoredAt: null,
    },
  ],
  credentials: [
    {
      id: 'DEMO-MIGRATION-BATCH-001_DEMO-MIGRATION-CSE-001',
      batch_id: 'DEMO-MIGRATION-BATCH-001',
      prn: 'DEMO-MIGRATION-CSE-001',
      full_name: 'Demo Migration Student 001',
      degree: 'B.Tech',
      branch: 'Computer Science & Engineering',
      cgpa: 9.15,
      graduation_year: 2026,
      institute: 'SOET Demo Institute of Technology',
      leaf_index: 0,
      raw_record: JSON.stringify({ prn: 'DEMO-MIGRATION-CSE-001', fullName: 'Demo Migration Student 001', cgpa: 9.15 }),
      created_at: 1730592000000,
    },
    {
      id: 'DEMO-MIGRATION-BATCH-001_DEMO-MIGRATION-CSE-002',
      batch_id: 'DEMO-MIGRATION-BATCH-001',
      prn: 'DEMO-MIGRATION-CSE-002',
      full_name: 'Demo Migration Student 002',
      degree: 'B.Tech',
      branch: 'Computer Science & Engineering',
      cgpa: 8.7,
      graduation_year: 2026,
      institute: 'SOET Demo Institute of Technology',
      leaf_index: 1,
      raw_record: JSON.stringify({ prn: 'DEMO-MIGRATION-CSE-002', fullName: 'Demo Migration Student 002', cgpa: 8.7 }),
      created_at: 1730592000000,
    },
    {
      id: 'DEMO-MIGRATION-BATCH-001_DEMO-MIGRATION-CSE-003',
      batch_id: 'DEMO-MIGRATION-BATCH-001',
      prn: 'DEMO-MIGRATION-CSE-003',
      full_name: 'Demo Migration Student 003',
      degree: 'B.Tech',
      branch: 'Computer Science & Engineering',
      cgpa: 9.4,
      graduation_year: 2026,
      institute: 'SOET Demo Institute of Technology',
      leaf_index: 2,
      raw_record: JSON.stringify({ prn: 'DEMO-MIGRATION-CSE-003', fullName: 'Demo Migration Student 003', cgpa: 9.4 }),
      created_at: 1730592000000,
    },
    {
      id: 'DEMO-MIGRATION-BATCH-002_DEMO-MIGRATION-CSE-004',
      batch_id: 'DEMO-MIGRATION-BATCH-002',
      prn: 'DEMO-MIGRATION-CSE-004',
      full_name: 'Demo Migration Student 004',
      degree: 'M.Tech',
      branch: 'Computer Science & Engineering',
      cgpa: 9.55,
      graduation_year: 2026,
      institute: 'SOET Demo Institute of Technology',
      leaf_index: 0,
      raw_record: JSON.stringify({ prn: 'DEMO-MIGRATION-CSE-004', fullName: 'Demo Migration Student 004', cgpa: 9.55 }),
      created_at: 1730595600000,
    },
    {
      id: 'DEMO-MIGRATION-BATCH-002_DEMO-MIGRATION-CSE-005',
      batch_id: 'DEMO-MIGRATION-BATCH-002',
      prn: 'DEMO-MIGRATION-CSE-005',
      full_name: 'Demo Migration Student 005',
      degree: 'M.Tech',
      branch: 'Computer Science & Engineering',
      cgpa: 8.9,
      graduation_year: 2026,
      institute: 'SOET Demo Institute of Technology',
      leaf_index: 1,
      raw_record: JSON.stringify({ prn: 'DEMO-MIGRATION-CSE-005', fullName: 'Demo Migration Student 005', cgpa: 8.9 }),
      created_at: 1730595600000,
    },
  ],
  revocations: [
    {
      key: 'DEMO-MIGRATION-BATCH-001_0',
      batchId: 'DEMO-MIGRATION-BATCH-001',
      leafIndex: 0,
      reasonCode: 'ADMIN_CORRECTION',
      reasonTitle: 'Synthetic Rehearsal Revocation',
      reasonDescription: 'Testing end-to-end migration rehearsal record transfer',
      supersededByHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      revokedAt: '2026-11-03T10:00:00.000Z',
      officerStaffId: 'OFFICER-DEMO-01',
    },
  ],
  student_accounts: [
    {
      prn: 'DEMO-MIGRATION-CSE-001',
      password_hash: 'scrypt:0123456789abcdef0123456789abcdef:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      activation_token_hash: null,
      activation_expires_at: null,
      status: 'ACTIVE',
      failed_attempts: 0,
      locked_until: 0,
      created_at: 1730592000000,
      activated_at: 1730592100000,
      last_login_at: 1730592200000,
    },
    {
      prn: 'DEMO-MIGRATION-CSE-002',
      password_hash: null,
      activation_token_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      activation_expires_at: 1730678400000,
      status: 'PENDING_ACTIVATION',
      failed_attempts: 0,
      locked_until: 0,
      created_at: 1730592000000,
      activated_at: null,
      last_login_at: null,
    },
    {
      prn: 'DEMO-MIGRATION-CSE-003',
      password_hash: null,
      activation_token_hash: 'c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855e3b0',
      activation_expires_at: 1730678400000,
      status: 'PENDING_ACTIVATION',
      failed_attempts: 0,
      locked_until: 0,
      created_at: 1730592000000,
      activated_at: null,
      last_login_at: null,
    },
    {
      prn: 'DEMO-MIGRATION-CSE-004',
      password_hash: 'scrypt:abcdef0123456789abcdef0123456789:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      activation_token_hash: null,
      activation_expires_at: null,
      status: 'ACTIVE',
      failed_attempts: 0,
      locked_until: 0,
      created_at: 1730595600000,
      activated_at: 1730595700000,
      last_login_at: 1730595800000,
    },
    {
      prn: 'DEMO-MIGRATION-CSE-005',
      password_hash: null,
      activation_token_hash: '9afbf4c8996fb92427ae41e4649b934ca495991b7852b855e3b0c44298fc1c14',
      activation_expires_at: 1730682000000,
      status: 'PENDING_ACTIVATION',
      failed_attempts: 0,
      locked_until: 0,
      created_at: 1730595600000,
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

/**
 * Computes deterministic canonical SHA-256 fingerprint of a table's records.
 */
function canonicalTableFingerprint(records, pkField) {
  const sorted = [...records].sort((a, b) => {
    const aVal = String(a[pkField] || '');
    const bVal = String(b[pkField] || '');
    return aVal.localeCompare(bVal);
  });

  const canonicalJson = JSON.stringify(sorted, (key, value) => {
    // Treat undefined as null, sort object keys if object
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

  return crypto.createHash('sha256').update(canonicalJson).digest('hex');
}

/**
 * Creates and populates an isolated temporary SQLite source database.
 */
function createSyntheticSourceDatabase(tempDbPath) {
  const db = new Database(tempDbPath);
  db.pragma('journal_mode = WAL');

  // Exact DDL matching local SQLite
  db.exec(`
    CREATE TABLE batches (
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

    CREATE TABLE revocations (
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

    CREATE TABLE credentials (
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
      institute TEXT,
      FOREIGN KEY (batch_id) REFERENCES batches(batchId) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX idx_batch_prn ON credentials(batch_id, prn);
    CREATE INDEX idx_credentials_prn ON credentials(prn);
    CREATE INDEX idx_credentials_leaf ON credentials(batch_id, leaf_index);

    CREATE TABLE student_accounts (
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

    CREATE INDEX idx_student_accounts_status ON student_accounts(status);
  `);

  // Insert synthetic records
  const insertBatch = db.prepare(`
    INSERT INTO batches (
      batchId, merkleRoot, ipfsCid, timestamp, issuer,
      institutionName, institutionCode, totalCredentials,
      revokedIndices, records, status, txHash, anchoredAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCred = db.prepare(`
    INSERT INTO credentials (
      id, batch_id, prn, full_name, degree, branch,
      cgpa, graduation_year, leaf_index, raw_record, created_at, institute
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRev = db.prepare(`
    INSERT INTO revocations (
      key, batchId, leafIndex, reasonCode, reasonTitle,
      reasonDescription, supersededByHash, revokedAt, officerStaffId
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAcc = db.prepare(`
    INSERT INTO student_accounts (
      prn, password_hash, activation_token_hash, activation_expires_at,
      status, failed_attempts, locked_until, created_at, activated_at, last_login_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const b of SYNTHETIC_DATASET.batches) {
      insertBatch.run(
        b.batchId, b.merkleRoot, b.ipfsCid, b.timestamp, b.issuer,
        b.institutionName, b.institutionCode, b.totalCredentials,
        b.revokedIndices, b.records, b.status, b.txHash, b.anchoredAt
      );
    }
    for (const c of SYNTHETIC_DATASET.credentials) {
      insertCred.run(
        c.id, c.batch_id, c.prn, c.full_name, c.degree, c.branch,
        c.cgpa, c.graduation_year, c.leaf_index, c.raw_record, c.created_at, c.institute
      );
    }
    for (const r of SYNTHETIC_DATASET.revocations) {
      insertRev.run(
        r.key, r.batchId, r.leafIndex, r.reasonCode, r.reasonTitle,
        r.reasonDescription, r.supersededByHash, r.revokedAt, r.officerStaffId
      );
    }
    for (const a of SYNTHETIC_DATASET.student_accounts) {
      insertAcc.run(
        a.prn, a.password_hash, a.activation_token_hash, a.activation_expires_at,
        a.status, a.failed_attempts, a.locked_until, a.created_at, a.activated_at, a.last_login_at
      );
    }
  })();

  return db;
}

async function runMigrationRehearsal() {
  console.log('================================================================');
  console.log('   SOET VeriTrust - Controlled Migration Rehearsal (Step 8F)   ');
  console.log('================================================================');
  console.log('Mode: Isolated End-to-End Migration Rehearsal (Synthetic Dataset)');
  console.log(`Remote Target:   ${EXPECTED_TEST_DB_URL}`);
  console.log(`Timestamp:       ${new Date().toISOString()}`);

  // Safety Pre-Checks
  const livePreHash = computeFileHash(LIVE_DB_PATH);
  console.log(`Live DB Pre-Check Checksum:   ${livePreHash.hash}`);
  const backupPreHash = computeFileHash(BASELINE_BACKUP_PATH);
  console.log(`Backup Pre-Check Checksum:    ${backupPreHash.hash}`);

  const tempDir = path.resolve(__dirname, `../tmp_migration_rehearsal_${Date.now()}`);
  const tempSourceDbPath = path.resolve(tempDir, 'synthetic_source.db');

  let sourceDb = null;
  let tursoClient = null;

  const results = {
    sourceIntegrity: false,
    remotePreCheck: false,
    migrationSuccess: false,
    parityCheck: false,
    rollbackSafety: false,
    cleanupSuccess: false,
    remoteFinalCheck: false,
    localIntegrityPreserved: false,
    details: {},
  };

  try {
    fs.mkdirSync(tempDir, { recursive: true });

    // Validate Environment
    const dbUrl = (process.env.TURSO_DATABASE_URL || '').trim();
    const testToken = (process.env.TURSO_TEST_AUTH_TOKEN || '').trim();

    if (!dbUrl) throw new Error('TURSO_DATABASE_URL environment variable is missing.');
    if (dbUrl.toLowerCase() !== EXPECTED_TEST_DB_URL.toLowerCase()) {
      throw new Error(`CRITICAL MISMATCH: TURSO_DATABASE_URL does not match expected test URL (${EXPECTED_TEST_DB_URL}).`);
    }
    if (!testToken) throw new Error('TURSO_TEST_AUTH_TOKEN environment variable is missing.');

    // ----------------------------------------------------
    // PART B & C: Synthetic Source Database Setup & Fingerprints
    // ----------------------------------------------------
    console.log('\n--- [Part B & C] Creating & Validating Synthetic Source Database ---');
    sourceDb = createSyntheticSourceDatabase(tempSourceDbPath);
    console.log(`  ✓ Synthetic source database created at: ${tempSourceDbPath}`);

    // Verify Source Counts
    const sourceBatches = sourceDb.prepare('SELECT * FROM batches').all();
    const sourceCredentials = sourceDb.prepare('SELECT * FROM credentials').all();
    const sourceRevocations = sourceDb.prepare('SELECT * FROM revocations').all();
    const sourceAccounts = sourceDb.prepare('SELECT * FROM student_accounts').all();

    console.log(`  - Source row counts: batches=${sourceBatches.length}, credentials=${sourceCredentials.length}, revocations=${sourceRevocations.length}, student_accounts=${sourceAccounts.length}`);

    if (
      sourceBatches.length !== 2 ||
      sourceCredentials.length !== 5 ||
      sourceRevocations.length !== 1 ||
      sourceAccounts.length !== 5
    ) {
      throw new Error('Source dataset row counts do not match expected rehearsal configuration (2, 5, 1, 5).');
    }

    // Source Fingerprints
    const sourceFps = {
      batches: canonicalTableFingerprint(sourceBatches, 'batchId'),
      credentials: canonicalTableFingerprint(sourceCredentials, 'id'),
      revocations: canonicalTableFingerprint(sourceRevocations, 'key'),
      student_accounts: canonicalTableFingerprint(sourceAccounts, 'prn'),
    };
    results.details.sourceFingerprints = sourceFps;
    console.log('  ✓ Source dataset fingerprints calculated:');
    console.log(`    - batches:          ${sourceFps.batches}`);
    console.log(`    - credentials:      ${sourceFps.credentials}`);
    console.log(`    - revocations:      ${sourceFps.revocations}`);
    console.log(`    - student_accounts: ${sourceFps.student_accounts}`);
    results.sourceIntegrity = true;

    // ----------------------------------------------------
    // PART D: Remote Turso Pre-Check
    // ----------------------------------------------------
    console.log('\n--- [Part D] Remote Turso Pre-Check ---');
    tursoClient = createClient({
      url: EXPECTED_TEST_DB_URL,
      authToken: testToken,
    });

    const preRemoteCounts = {};
    for (const t of REQUIRED_TABLES) {
      const res = await tursoClient.execute(`SELECT COUNT(*) as c FROM ${t}`);
      const count = Number(res.rows?.[0]?.c ?? 0);
      preRemoteCounts[t] = count;
      console.log(`  - Remote table '${t}': ${count} rows`);
      if (count !== 0) {
        throw new Error(`SAFETY ABORT: Remote table '${t}' has ${count} existing rows! Expected 0 rows.`);
      }
    }
    results.remotePreCheck = true;
    console.log('  ✓ Remote Turso verified: 4 tables, strictly 0 rows.');

    // ----------------------------------------------------
    // PART D (cont.): Sequential Relational Migration Transfer
    // ----------------------------------------------------
    console.log('\n--- [Part D cont.] Transferring Synthetic Dataset to Remote Turso ---');

    // 1. Batches
    console.log(`  + Migrating ${sourceBatches.length} batches...`);
    for (const b of sourceBatches) {
      await tursoClient.execute({
        sql: `INSERT INTO batches (
          batchId, merkleRoot, ipfsCid, timestamp, issuer,
          institutionName, institutionCode, totalCredentials,
          revokedIndices, records, status, txHash, anchoredAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          b.batchId, b.merkleRoot, b.ipfsCid, b.timestamp, b.issuer,
          b.institutionName, b.institutionCode, b.totalCredentials,
          b.revokedIndices, b.records, b.status, b.txHash, b.anchoredAt,
        ],
      });
    }

    // 2. Credentials (Explicit Column Mapping: accounting for column position parity)
    console.log(`  + Migrating ${sourceCredentials.length} credentials...`);
    for (const c of sourceCredentials) {
      await tursoClient.execute({
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

    // 3. Revocations
    console.log(`  + Migrating ${sourceRevocations.length} revocations...`);
    for (const r of sourceRevocations) {
      await tursoClient.execute({
        sql: `INSERT INTO revocations (
          key, batchId, leafIndex, reasonCode, reasonTitle,
          reasonDescription, supersededByHash, revokedAt, officerStaffId
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          r.key, r.batchId, r.leafIndex, r.reasonCode, r.reasonTitle,
          r.reasonDescription, r.supersededByHash, r.revokedAt, r.officerStaffId,
        ],
      });
    }

    // 4. Student Accounts
    console.log(`  + Migrating ${sourceAccounts.length} student accounts...`);
    for (const a of sourceAccounts) {
      await tursoClient.execute({
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

    results.migrationSuccess = true;
    console.log('  ✓ Sequential relational transfer completed successfully.');

    // ----------------------------------------------------
    // PART E: Remote Data Verification & Canonical Parity Check
    // ----------------------------------------------------
    console.log('\n--- [Part E] Remote Data Verification & Canonical Parity ---');
    const remoteBatchesRes = await tursoClient.execute('SELECT * FROM batches ORDER BY timestamp ASC');
    const remoteCredsRes = await tursoClient.execute('SELECT * FROM credentials ORDER BY created_at ASC');
    const remoteRevsRes = await tursoClient.execute('SELECT * FROM revocations');
    const remoteAccsRes = await tursoClient.execute('SELECT * FROM student_accounts');

    const remoteBatches = (remoteBatchesRes.rows || []).map((r) => ({ ...r }));
    const remoteCredentials = (remoteCredsRes.rows || []).map((r) => ({ ...r }));
    const remoteRevocations = (remoteRevsRes.rows || []).map((r) => ({ ...r }));
    const remoteAccounts = (remoteAccsRes.rows || []).map((r) => ({ ...r }));

    console.log(`  - Remote row counts: batches=${remoteBatches.length}, credentials=${remoteCredentials.length}, revocations=${remoteRevocations.length}, student_accounts=${remoteAccounts.length}`);

    if (
      remoteBatches.length !== 2 ||
      remoteCredentials.length !== 5 ||
      remoteRevocations.length !== 1 ||
      remoteAccounts.length !== 5
    ) {
      throw new Error('Remote row counts do not match expected migration dataset (2, 5, 1, 5).');
    }

    // Remote Fingerprints
    const remoteFps = {
      batches: canonicalTableFingerprint(remoteBatches, 'batchId'),
      credentials: canonicalTableFingerprint(remoteCredentials, 'id'),
      revocations: canonicalTableFingerprint(remoteRevocations, 'key'),
      student_accounts: canonicalTableFingerprint(remoteAccounts, 'prn'),
    };
    results.details.remoteFingerprints = remoteFps;

    console.log('  - Comparing Source vs. Destination Canonical Fingerprints:');
    let allFpsMatch = true;
    for (const tbl of REQUIRED_TABLES) {
      const match = sourceFps[tbl] === remoteFps[tbl];
      console.log(`    - Table '${tbl}': ${match ? 'MATCH' : 'MISMATCH'} (${remoteFps[tbl]})`);
      if (!match) allFpsMatch = false;
    }

    if (!allFpsMatch) {
      throw new Error('Canonical fingerprint mismatch between source and destination records!');
    }
    results.parityCheck = true;
    console.log('  ✓ 100% Data Fidelity Verified: Source and destination canonical fingerprints match identically.');

    // ----------------------------------------------------
    // PART F: Failure & Rollback Safety in Isolated Transaction
    // ----------------------------------------------------
    console.log('\n--- [Part F] Transaction Rollback Safety Verification ---');
    let rollbackSuccess = false;
    try {
      const txFail = await tursoClient.transaction('write');
      await txFail.execute({
        sql: `INSERT INTO batches (
          batchId, merkleRoot, ipfsCid, timestamp, issuer,
          totalCredentials, revokedIndices, records
        ) VALUES ('DEMO-REHEARSAL-FAIL-BATCH', '0x999', 'QmFail', 1234, 'Officer', 1, '[]', '[]')`,
      });
      await txFail.execute({
        sql: `INSERT INTO credentials (
          id, batch_id, prn, full_name, leaf_index, raw_record, created_at
        ) VALUES ('DEMO-REHEARSAL-FAIL-CRED', 'DEMO-REHEARSAL-FAIL-BATCH', 'PRN-FAIL', 'Fail Student', 0, '{}', 1234)`,
      });

      // Deliberately trigger rollback
      await txFail.rollback();

      // Check whether aborted records exist
      const checkFailBatch = await tursoClient.execute({
        sql: "SELECT batchId FROM batches WHERE batchId = 'DEMO-REHEARSAL-FAIL-BATCH'",
      });
      const checkFailCred = await tursoClient.execute({
        sql: "SELECT id FROM credentials WHERE id = 'DEMO-REHEARSAL-FAIL-CRED'",
      });

      // Confirm migrated dataset is intact
      const confirmBatches = await tursoClient.execute('SELECT COUNT(*) as c FROM batches');
      const confirmCreds = await tursoClient.execute('SELECT COUNT(*) as c FROM credentials');

      if (
        checkFailBatch.rows.length === 0 &&
        checkFailCred.rows.length === 0 &&
        Number(confirmBatches.rows[0].c) === 2 &&
        Number(confirmCreds.rows[0].c) === 5
      ) {
        rollbackSuccess = true;
        console.log('  ✓ Rollback verified: Failed transaction left 0 records; migrated dataset remains 100% intact.');
      } else {
        throw new Error('Rollback safety verification failed: records leaked or migrated data corrupted.');
      }
    } catch (err) {
      if (!rollbackSuccess) throw err;
    }
    results.rollbackSafety = rollbackSuccess;

    return results;
  } catch (err) {
    const safeError = sanitizeErrorMessage(err.message);
    console.error('\n❌ [REHEARSAL FAILURE]:', safeError);
    results.error = safeError;
    throw new Error(safeError);
  } finally {
    // ----------------------------------------------------
    // PART G & H: Cleanup and Final Zero-Record State
    // ----------------------------------------------------
    if (tursoClient) {
      console.log('\n--- [Part G & H] Rehearsal Cleanup & Zero-Record Verification ---');
      try {
        // Delete dependent records first, then parent batches
        console.log('  + Cleaning up synthetic rehearsal records from Turso...');
        await tursoClient.execute("DELETE FROM credentials WHERE batch_id LIKE 'DEMO-MIGRATION-BATCH-%'");
        await tursoClient.execute("DELETE FROM credentials WHERE id = 'DEMO-REHEARSAL-FAIL-CRED'");
        await tursoClient.execute("DELETE FROM revocations WHERE batchId LIKE 'DEMO-MIGRATION-BATCH-%'");
        await tursoClient.execute("DELETE FROM batches WHERE batchId LIKE 'DEMO-MIGRATION-BATCH-%'");
        await tursoClient.execute("DELETE FROM batches WHERE batchId = 'DEMO-REHEARSAL-FAIL-BATCH'");
        await tursoClient.execute("DELETE FROM student_accounts WHERE prn LIKE 'DEMO-MIGRATION-CSE-%'");

        results.cleanupSuccess = true;
        console.log('  ✓ Targeted synthetic records removed.');

        // Verify zero records
        console.log('\n--- Final Zero-Record Remote Verification ---');
        const finalCounts = {};
        let allZero = true;
        for (const t of REQUIRED_TABLES) {
          const res = await tursoClient.execute(`SELECT COUNT(*) as c FROM ${t}`);
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
          if (!tursoClient.closed) {
            tursoClient.close();
          }
        } catch {}
        tursoClient = null;
      }
    }

    // Close and remove temporary SQLite source database
    if (sourceDb) {
      try {
        sourceDb.close();
      } catch {}
      sourceDb = null;
    }
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(`  ✓ Temporary source database directory removed: ${tempDir}`);
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
  runMigrationRehearsal()
    .then((results) => {
      console.log('\n================================================================');
      console.log('   MIGRATION REHEARSAL EXECUTION SUMMARY');
      console.log('================================================================');
      const allPassed =
        results.sourceIntegrity &&
        results.remotePreCheck &&
        results.migrationSuccess &&
        results.parityCheck &&
        results.rollbackSafety &&
        results.cleanupSuccess &&
        results.remoteFinalCheck &&
        results.localIntegrityPreserved;

      console.log(`Final Verdict: ${allPassed ? 'MIGRATION REHEARSAL PASSED' : 'MIGRATION REHEARSAL FAILED'}`);
    })
    .catch(() => {
      process.exitCode = 1;
    });
}

module.exports = {
  runMigrationRehearsal,
  canonicalTableFingerprint,
  SYNTHETIC_DATASET,
  EXPECTED_TEST_DB_URL,
};


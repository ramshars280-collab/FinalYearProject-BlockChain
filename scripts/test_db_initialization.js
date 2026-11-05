/**
 * SOET VeriTrust - Database Initialization & Concurrency Regression Test Suite
 *
 * Verifies:
 * 1. Empty database initializes successfully without circular deadlocks.
 * 2. All tables (batches, revocations, credentials, student_accounts) and indexes are created.
 * 3. Default batches and credentials are seeded deterministically.
 * 4. Credentials and student accounts follow exact application security rules.
 * 5. Idempotent re-initialization does not duplicate records.
 * 6. Concurrent initialization calls share the operation without race conditions or deadlocks.
 * 7. Populated database initialization remains backward-compatible.
 * 8. SQLite PRAGMA integrity_check passes.
 *
 * STRICT SAFETY: Operates exclusively on isolated temporary SQLite databases.
 * Aborts immediately if pointed at production or project database.
 */

// If run directly with plain 'node', transparently execute via 'tsx' for TS module resolution
if (!process.env.TSX_RUNNING) {
  const { spawnSync } = require('child_process');
  const isWin = process.platform === 'win32';
  const npxCmd = isWin ? 'npx.cmd' : 'npx';
  const result = spawnSync(npxCmd, ['tsx', __filename], {
    stdio: 'inherit',
    env: { ...process.env, TSX_RUNNING: '1' },
    shell: true,
  });
  process.exit(result.status !== null ? result.status : 1);
}

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Enforce strict test timeout so execution cannot hang indefinitely
const TEST_TIMEOUT_MS = 10000;

async function runWithTimeout(fn, timeoutMs = TEST_TIMEOUT_MS) {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Test timed out after ${timeoutMs}ms (potential deadlock)`)), timeoutMs)
    ),
  ]);
}

async function main() {
  console.log('====================================================');
  console.log('SOET VeriTrust - Database Initialization Regression Suite');
  console.log('====================================================\n');

  const tmpDir = path.resolve(process.cwd(), 'tmp_test_init_' + Date.now());
  const testDbPath = path.resolve(tmpDir, 'test_init.db');
  const realDbPath = path.resolve(process.cwd(), 'data', 'veritrust.db');

  // Safety guard
  if (
    testDbPath.toLowerCase() === realDbPath.toLowerCase() ||
    testDbPath.toLowerCase().includes('data\\veritrust.db') ||
    testDbPath.toLowerCase().includes('data/veritrust.db') ||
    testDbPath.toLowerCase().includes('.bak')
  ) {
    console.error('FATAL SAFETY VIOLATION: Test database resolves to real project database:', testDbPath);
    process.exit(1);
  }

  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  // Set environment variable so getDatabaseAdapter uses isolated database
  process.env.DATABASE_PATH = testDbPath;
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;

  let passed = 0;
  let failed = 0;

  function assert(condition, name, details = '') {
    if (condition) {
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${name}: ${details}`);
      failed++;
    }
  }

  // Import TypeScript db module cleanly
  const dbModule = await import('../src/lib/db.ts');
  const {
    getDatabaseAdapter,
    closeDatabaseAdapter,
    initializeDatabaseSchema,
    resetDatabaseInitializationState,
    getAllBatchesDb,
    getCredentialByPrnDb,
    getStudentAccountDb,
  } = dbModule;

  try {
    // ----------------------------------------------------
    // TEST 1: Empty Database Initializes Successfully Without Deadlock
    // ----------------------------------------------------
    await runWithTimeout(async () => {
      try {
        const adapter = getDatabaseAdapter();
        await initializeDatabaseSchema(adapter);
        assert(true, 'Test 1: Empty database initializes successfully without deadlock');
      } catch (err) {
        assert(false, 'Test 1: Empty database initialization', err.message);
      }
    });

    // ----------------------------------------------------
    // TEST 2: All Required Tables and Indexes Created
    // ----------------------------------------------------
    await runWithTimeout(async () => {
      try {
        const rawDb = new Database(testDbPath, { readonly: true });
        const tables = rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
        const indexes = rawDb.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((i) => i.name);
        rawDb.close();

        const hasBatches = tables.includes('batches');
        const hasRevs = tables.includes('revocations');
        const hasCreds = tables.includes('credentials');
        const hasAccounts = tables.includes('student_accounts');

        const hasIdxBatchPrn = indexes.includes('idx_batch_prn');
        const hasIdxCredsPrn = indexes.includes('idx_credentials_prn');
        const hasIdxCredsLeaf = indexes.includes('idx_credentials_leaf');
        const hasIdxAccountsStatus = indexes.includes('idx_student_accounts_status');

        assert(
          hasBatches && hasRevs && hasCreds && hasAccounts &&
          hasIdxBatchPrn && hasIdxCredsPrn && hasIdxCredsLeaf && hasIdxAccountsStatus,
          'Test 2: All required tables and indexes are created'
        );
      } catch (err) {
        assert(false, 'Test 2: Table and index inspection', err.message);
      }
    });

    // ----------------------------------------------------
    // TEST 3: Default Batches Seeded Correctly
    // ----------------------------------------------------
    await runWithTimeout(async () => {
      try {
        const batches = await getAllBatchesDb();
        const mgmBatch = batches.find((b) => b.batchId === 'MGM-2024-BTECH-BATCH01');
        assert(
          batches.length >= 1 && mgmBatch && mgmBatch.totalCredentials === 4 && mgmBatch.records.length === 4,
          'Test 3: Default batches are seeded correctly'
        );
      } catch (err) {
        assert(false, 'Test 3: Default batch seeding verification', err.message);
      }
    });

    // ----------------------------------------------------
    // TEST 4: Credentials and Student Accounts Seeded Consistently
    // ----------------------------------------------------
    await runWithTimeout(async () => {
      try {
        const cred01 = await getCredentialByPrnDb('PRN20200101');
        const cred02 = await getCredentialByPrnDb('PRN20200102');
        const account01 = await getStudentAccountDb('PRN20200101');
        const account02 = await getStudentAccountDb('PRN20200102');

        assert(
          cred01 !== null && cred02 !== null &&
          account01 !== null && account01.status === 'PENDING_ACTIVATION' && account01.passwordHash === null &&
          account02 !== null && account02.status === 'PENDING_ACTIVATION',
          'Test 4: Credentials and student accounts follow application rules'
        );
      } catch (err) {
        assert(false, 'Test 4: Credential and account seeding rules', err.message);
      }
    });

    // ----------------------------------------------------
    // TEST 5: Repeated Initialization Idempotency
    // ----------------------------------------------------
    await runWithTimeout(async () => {
      try {
        const adapter = getDatabaseAdapter();
        // Force another initialization call
        await initializeDatabaseSchema(adapter);

        const batchesAfter = await getAllBatchesDb();
        const cred01 = await getCredentialByPrnDb('PRN20200101');

        assert(
          batchesAfter.length === 1 && cred01 !== null,
          'Test 5: Repeated initialization does not duplicate batches or credentials'
        );
      } catch (err) {
        assert(false, 'Test 5: Repeated initialization idempotency', err.message);
      }
    });

    // ----------------------------------------------------
    // TEST 6: Concurrent Initialization Does Not Deadlock
    // ----------------------------------------------------
    await runWithTimeout(async () => {
      try {
        // Create another isolated test db to test pure concurrency from scratch
        const concurrentDbPath = path.resolve(tmpDir, 'test_concurrent.db');
        const { SqliteAdapter } = await import('../src/lib/db/SqliteAdapter.ts');
        const rawDb = new Database(concurrentDbPath);
        const concurrentAdapter = new SqliteAdapter(rawDb);

        // Fire 10 concurrent initialization requests simultaneously
        await Promise.all([
          initializeDatabaseSchema(concurrentAdapter),
          initializeDatabaseSchema(concurrentAdapter),
          initializeDatabaseSchema(concurrentAdapter),
          initializeDatabaseSchema(concurrentAdapter),
          initializeDatabaseSchema(concurrentAdapter),
          initializeDatabaseSchema(concurrentAdapter),
          initializeDatabaseSchema(concurrentAdapter),
          initializeDatabaseSchema(concurrentAdapter),
          initializeDatabaseSchema(concurrentAdapter),
          initializeDatabaseSchema(concurrentAdapter),
        ]);

        await concurrentAdapter.close();

        const rawVerify = new Database(concurrentDbPath, { readonly: true });
        const batchCount = rawVerify.prepare('SELECT COUNT(*) as c FROM batches').get().c;
        const credCount = rawVerify.prepare('SELECT COUNT(*) as c FROM credentials').get().c;
        rawVerify.close();

        assert(
          batchCount === 1 && credCount === 4,
          'Test 6: Concurrent initialization does not deadlock or duplicate records'
        );
      } catch (err) {
        assert(false, 'Test 6: Concurrent initialization', err.message);
      }
    });

    // ----------------------------------------------------
    // TEST 7: Populated Database Backward Compatibility
    // ----------------------------------------------------
    await runWithTimeout(async () => {
      try {
        const populatedDbPath = path.resolve(tmpDir, 'test_populated.db');
        const rawPop = new Database(populatedDbPath);
        // Pre-create tables and pre-populate an existing custom batch
        rawPop.exec(`
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
        `);
        rawPop.prepare(`
          INSERT INTO batches (batchId, merkleRoot, ipfsCid, timestamp, issuer, totalCredentials, revokedIndices, records)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run('EXISTING-BATCH-001', '0x1234', 'Qm123', Date.now(), '0xIssuer', 1, '[]', JSON.stringify([{ prn: 'PRN-EXISTING-01', fullName: 'Existing Student' }]));

        const { SqliteAdapter } = await import('../src/lib/db/SqliteAdapter.ts');
        const popAdapter = new SqliteAdapter(rawPop);

        // Initialize schema over existing populated database
        await initializeDatabaseSchema(popAdapter);

        // Verify existing batch preserved and credentials/accounts backfilled
        const credRow = rawPop.prepare('SELECT * FROM credentials WHERE prn = ?').get('PRN-EXISTING-01');
        const accountRow = rawPop.prepare('SELECT * FROM student_accounts WHERE prn = ?').get('PRN-EXISTING-01');
        await popAdapter.close();

        assert(
          credRow !== undefined && accountRow !== undefined && accountRow.status === 'PENDING_ACTIVATION',
          'Test 7: Populated database initialization remains fully backward-compatible'
        );
      } catch (err) {
        assert(false, 'Test 7: Populated database compatibility', err.message);
      }
    });

    // ----------------------------------------------------
    // TEST 8: Database Integrity Check Passes
    // ----------------------------------------------------
    await runWithTimeout(async () => {
      try {
        const rawDb = new Database(testDbPath, { readonly: true });
        const integrity = rawDb.pragma('integrity_check');
        rawDb.close();

        assert(
          Array.isArray(integrity) && integrity.length === 1 && integrity[0].integrity_check === 'ok',
          'Test 8: Database integrity check passes with ok'
        );
      } catch (err) {
        assert(false, 'Test 8: Database integrity check', err.message);
      }
    });

  } finally {
    // Teardown and clean up
    try {
      await closeDatabaseAdapter();
    } catch {}
    resetDatabaseInitializationState();
    delete process.env.DATABASE_PATH;

    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (cleanupErr) {
      console.warn('Notice: Temporary directory will be cleaned on exit:', tmpDir);
    }
  }

  console.log('\n====================================================');
  console.log(`Database Initialization Suite: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});

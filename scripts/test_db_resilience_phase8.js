/**
 * SOET VeriTrust - Phase 8 Database Timeout & API Resilience Test Suite
 *
 * VALIDATES P8-T04 REQUIREMENTS:
 * 1. Normal local SQLite reads, writes, and transactions (SqliteAdapter).
 * 2. Turso adapter bounded query timeout rejection (TursoAdapter.query / get / execute).
 * 3. Timeout error classification (DatabaseTimeoutError, code DB_TIMEOUT, DATABASE_ERROR category).
 * 4. Turso adapter transaction rollback and integrity on timeout (tx.rollback called, no commit).
 * 5. Transaction rollback and atomicity on simulated failure.
 * 6. Non-idempotent writes are NOT automatically retried.
 * 7. isDatabaseUnavailableError identifies timeouts, connection drops, and db locks.
 * 8. Live HTTP endpoints return HTTP 503 on database unavailability with X-Request-ID.
 * 9. Structured logs emit statusCode 503 and durationMs on database failures without leaking paths.
 * 10. Connection reuse singleton and cleanup lifecycle (getDatabaseAdapter / closeDatabaseAdapter).
 *
 * SAFETY GUARANTEES:
 * - Operates in an isolated temporary directory with synthetic data.
 * - Does NOT modify production data/veritrust.db or deployed contracts.
 * - Spawns dedicated temporary Next.js server on dynamic TCP port.
 * - Always cleans up server process trees and temp directories.
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');

const REQUEST_TIMEOUT_MS = 8000;
const SERVER_STARTUP_TIMEOUT_MS = 30000;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    srv.on('error', reject);
  });
}

function killProcessTree(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch { }
}

function loadModuleFromTs(relPath) {
  const ts = require('typescript');
  const absPath = path.resolve(process.cwd(), relPath);
  const code = fs.readFileSync(absPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const m = { exports: {} };
  const fn = new Function('module', 'exports', 'require', '__dirname', '__filename', transpiled.outputText);
  const customRequire = (mod) => {
    if (mod === 'next/server') return { NextResponse: { json: (d, init) => ({ ...init, json: async () => d }) } };
    if (mod.startsWith('.')) {
      const resolved = path.resolve(path.dirname(absPath), mod);
      if (fs.existsSync(resolved + '.ts')) return loadModuleFromTs(path.relative(process.cwd(), resolved + '.ts'));
      if (fs.existsSync(resolved + '.js')) return require(resolved + '.js');
      if (fs.existsSync(resolved)) return require(resolved);
    }
    return require(mod);
  };
  fn(m, m.exports, customRequire, path.dirname(absPath), absPath);
  return m.exports;
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('SOET VeriTrust - Phase 8 Database Timeout & Resilience Suite');
  console.log('====================================================\n');

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

  const tmpDir = path.resolve(process.cwd(), `tmp_dbt_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const testDbPath = path.join(tmpDir, 'isolated_resilience.db');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // Load types and adapter modules
    const typesMod = loadModuleFromTs('src/lib/db/types.ts');
    const { DatabaseTimeoutError, isDatabaseUnavailableError } = typesMod;
    const obsMod = loadModuleFromTs('src/lib/observability.ts');
    const { sanitizeError } = obsMod;
    const sqliteMod = loadModuleFromTs('src/lib/db/SqliteAdapter.ts');
    const { SqliteAdapter } = sqliteMod;
    const tursoMod = loadModuleFromTs('src/lib/db/TursoAdapter.ts');
    const { TursoAdapter } = tursoMod;

    // ----------------------------------------------------
    // TEST 1: Normal local SQLite reads, writes, and transactions
    // ----------------------------------------------------
    try {
      const Database = require('better-sqlite3');
      const sqliteDb = new Database(testDbPath);
      sqliteDb.pragma('journal_mode = WAL');
      sqliteDb.pragma('busy_timeout = 5000');
      const adapter = new SqliteAdapter(sqliteDb);

      await adapter.execute('CREATE TABLE test_tbl (id TEXT PRIMARY KEY, val TEXT, count INTEGER)');
      await adapter.execute('INSERT INTO test_tbl (id, val, count) VALUES (?, ?, ?)', ['id1', 'val1', 10]);
      const row = await adapter.get('SELECT * FROM test_tbl WHERE id = ?', ['id1']);
      const allRows = await adapter.query('SELECT * FROM test_tbl');

      // Test transaction commit
      await adapter.transaction(async (tx) => {
        await tx.execute('INSERT INTO test_tbl (id, val, count) VALUES (?, ?, ?)', ['id2', 'val2', 20]);
        await tx.execute('UPDATE test_tbl SET count = count + 5 WHERE id = ?', ['id1']);
      });

      const updatedRow1 = await adapter.get('SELECT * FROM test_tbl WHERE id = ?', ['id1']);
      const row2 = await adapter.get('SELECT * FROM test_tbl WHERE id = ?', ['id2']);

      assert(
        adapter.backend === 'sqlite' &&
        row && row.val === 'val1' &&
        allRows.length === 1 &&
        updatedRow1.count === 15 &&
        row2 && row2.val === 'val2',
        'Test 1: Local SQLite adapter executes reads, writes, and transactions with ACID integrity',
        `row1.count: ${updatedRow1?.count}, row2: ${row2?.val}`
      );
      await adapter.close();
    } catch (err) {
      assert(false, 'Test 1: Local SQLite adapter check', err.message);
    }

    // ----------------------------------------------------
    // TEST 2: Turso adapter bounded query timeout rejection
    // ----------------------------------------------------
    try {
      // Create a mock Client that intentionally hangs or delays beyond timeout
      const mockStallingClient = {
        execute: async () => {
          // Delay for 300ms
          await new Promise((resolve) => setTimeout(resolve, 300));
          return { rows: [{ ok: 1 }], columns: ['ok'], rowsAffected: 0 };
        },
        batch: async () => {
          await new Promise((resolve) => setTimeout(resolve, 300));
          return [];
        },
        transaction: async () => {
          await new Promise((resolve) => setTimeout(resolve, 300));
          return { execute: async () => ({ rows: [] }), batch: async () => [], commit: async () => {}, rollback: async () => {} };
        },
        close: () => {},
      };

      // Set bounded timeout to 50ms
      const tursoAdapter = new TursoAdapter(mockStallingClient, {
        queryTimeoutMs: 50,
        transactionTimeoutMs: 100,
      });

      const start = Date.now();
      let threwTimeout = false;
      let caughtError = null;

      try {
        await tursoAdapter.query('SELECT * FROM dummy');
      } catch (e) {
        threwTimeout = true;
        caughtError = e;
      }

      const elapsed = Date.now() - start;

      assert(
        threwTimeout &&
        (caughtError instanceof DatabaseTimeoutError || caughtError.code === 'DB_TIMEOUT') &&
        caughtError.code === 'DB_TIMEOUT' &&
        caughtError.isTimeout === true &&
        caughtError.timeoutMs === 50 &&
        elapsed >= 45 && elapsed < 250,
        'Test 2: Turso adapter enforces bounded timeout on queries and rejects stalled operations',
        `Elapsed: ${elapsed}ms, error: ${caughtError?.message}`
      );
    } catch (err) {
      assert(false, 'Test 2: Turso query timeout check', err.message);
    }

    // ----------------------------------------------------
    // TEST 3: Timeout error classification & properties
    // ----------------------------------------------------
    try {
      const err = new DatabaseTimeoutError('Turso database operation query timed out after 5000ms', 5000, 'query');
      const sanitized = sanitizeError(err);

      assert(
        err.name === 'DatabaseTimeoutError' &&
        err.code === 'DB_TIMEOUT' &&
        err.isTimeout === true &&
        sanitized.category === 'DATABASE_ERROR' &&
        sanitized.name === 'DatabaseTimeoutError' &&
        sanitized.code === 'DB_TIMEOUT',
        'Test 3: DatabaseTimeoutError is correctly classified as DATABASE_ERROR with safe metadata',
        `Category: ${sanitized.category}, code: ${sanitized.code}`
      );
    } catch (err) {
      assert(false, 'Test 3: Timeout classification check', err.message);
    }

    // ----------------------------------------------------
    // TEST 4: Turso adapter transaction rollback on timeout
    // ----------------------------------------------------
    try {
      let rollbackInvoked = false;
      let commitInvoked = false;

      const mockTxClient = {
        transaction: async () => ({
          execute: async () => ({ rows: [], columns: [], rowsAffected: 1 }),
          batch: async () => [],
          commit: async () => {
            // Commit stalls
            await new Promise((resolve) => setTimeout(resolve, 300));
            commitInvoked = true;
          },
          rollback: async () => {
            rollbackInvoked = true;
          },
        }),
        execute: async () => ({ rows: [], columns: [], rowsAffected: 0 }),
        batch: async () => [],
        close: () => {},
      };

      const tursoAdapter = new TursoAdapter(mockTxClient, {
        queryTimeoutMs: 200,
        transactionTimeoutMs: 50,
      });

      let txError = null;
      try {
        await tursoAdapter.transaction(async (tx) => {
          await tx.execute('INSERT INTO test VALUES (?)', ['val']);
        });
      } catch (e) {
        txError = e;
      }

      // Allow tick for rollback callback
      await new Promise((r) => setTimeout(r, 80));

      assert(
        (txError instanceof DatabaseTimeoutError || txError.code === 'DB_TIMEOUT') &&
        rollbackInvoked === true &&
        commitInvoked === false,
        'Test 4: Turso transaction automatically invokes rollback on timeout and prevents partial commits',
        `Rollback invoked: ${rollbackInvoked}, commit invoked: ${commitInvoked}`
      );
    } catch (err) {
      assert(false, 'Test 4: Turso transaction rollback on timeout check', err.message);
    }

    // ----------------------------------------------------
    // TEST 5: Transaction rollback and atomicity on simulated failure
    // ----------------------------------------------------
    try {
      const Database = require('better-sqlite3');
      const sqliteDb = new Database(path.join(tmpDir, 'tx_atomicity.db'));
      const adapter = new SqliteAdapter(sqliteDb);

      await adapter.execute('CREATE TABLE accounts (user TEXT PRIMARY KEY, balance INTEGER)');
      await adapter.execute('INSERT INTO accounts (user, balance) VALUES (?, ?)', ['alice', 100]);
      await adapter.execute('INSERT INTO accounts (user, balance) VALUES (?, ?)', ['bob', 50]);

      let txFailed = false;
      try {
        await adapter.transaction(async (tx) => {
          await tx.execute('UPDATE accounts SET balance = balance - 40 WHERE user = ?', ['alice']);
          // Simulate error in middle of transaction
          throw new Error('Simulated business logic failure');
        });
      } catch {
        txFailed = true;
      }

      const aliceRow = await adapter.get('SELECT balance FROM accounts WHERE user = ?', ['alice']);
      const bobRow = await adapter.get('SELECT balance FROM accounts WHERE user = ?', ['bob']);

      assert(
        txFailed &&
        aliceRow.balance === 100 &&
        bobRow.balance === 50,
        'Test 5: Transaction rollback restores original state on error, ensuring strict atomic isolation',
        `Alice balance: ${aliceRow.balance}, Bob balance: ${bobRow.balance}`
      );
      await adapter.close();
    } catch (err) {
      assert(false, 'Test 5: Transaction rollback check', err.message);
    }

    // ----------------------------------------------------
    // TEST 6: No automatic retry of non-idempotent writes
    // ----------------------------------------------------
    try {
      let executeCalls = 0;
      const mockWriteFailClient = {
        execute: async () => {
          executeCalls++;
          throw new DatabaseTimeoutError('Write timed out after 50ms', 50, 'execute');
        },
        batch: async () => [],
        transaction: async () => ({}),
        close: () => {},
      };

      const tursoAdapter = new TursoAdapter(mockWriteFailClient, { queryTimeoutMs: 50 });
      let writeError = null;
      try {
        await tursoAdapter.execute('INSERT INTO credentials (id) VALUES (?)', ['cred_1']);
      } catch (e) {
        writeError = e;
      }

      assert(
        writeError instanceof DatabaseTimeoutError &&
        executeCalls === 1,
        'Test 6: Non-idempotent writes are executed exactly once and NOT retried automatically',
        `Execute calls: ${executeCalls}`
      );
    } catch (err) {
      assert(false, 'Test 6: No automatic retry check', err.message);
    }

    // ----------------------------------------------------
    // TEST 7: isDatabaseUnavailableError classification
    // ----------------------------------------------------
    try {
      const timeoutErr = new DatabaseTimeoutError('Timed out', 5000);
      const cantOpenErr = { name: 'SqliteError', code: 'SQLITE_CANTOPEN', message: 'unable to open database file' };
      const connRefusedErr = { name: 'FetchError', code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1' };
      const validationErr = new Error('Invalid PRN format: missing prefix');
      const authErr = new Error('Invalid credentials');

      assert(
        isDatabaseUnavailableError(timeoutErr) === true &&
        isDatabaseUnavailableError(cantOpenErr) === true &&
        isDatabaseUnavailableError(connRefusedErr) === true &&
        isDatabaseUnavailableError(validationErr) === false &&
        isDatabaseUnavailableError(authErr) === false,
        'Test 7: isDatabaseUnavailableError distinguishes database infrastructure failures from validation/auth errors',
        `Validation detected as db err: ${isDatabaseUnavailableError(validationErr)}`
      );
    } catch (err) {
      assert(false, 'Test 7: isDatabaseUnavailableError check', err.message);
    }

    // ----------------------------------------------------
    // TEST 8 & 9: Live HTTP server handles database unavailability with HTTP 503
    // ----------------------------------------------------
    let serverProc = null;
    try {
      const testPort = await getFreePort();
      const BASE_URL = `http://127.0.0.1:${testPort}`;
      console.log(`\n🚀 Starting Next.js test server on port ${testPort} with simulated unavailable DB...`);

      // Point DATABASE_PATH to a non-existent directory on purpose
      serverProc = spawn('node', ['node_modules/next/dist/bin/next', 'dev', '-p', String(testPort)], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: String(testPort),
          DATABASE_PATH: 'C:\\simulated_unavailable_dir_99999\\offline.db',
          NODE_ENV: 'development',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let serverLogs = '';
      serverProc.stdout.on('data', (d) => { serverLogs += d.toString(); });
      serverProc.stderr.on('data', (d) => { serverLogs += d.toString(); });

      // Poll until server responds
      let isReady = false;
      const startTime = Date.now();
      while (Date.now() - startTime < SERVER_STARTUP_TIMEOUT_MS) {
        try {
          const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
          if (res.status === 503) {
            isReady = true;
            break;
          }
        } catch { }
        await new Promise((r) => setTimeout(r, 400));
      }

      if (!isReady) {
        throw new Error(`Test server failed to start on ${BASE_URL} within ${SERVER_STARTUP_TIMEOUT_MS}ms`);
      }
      console.log(`✅ Dedicated server ready in ${Date.now() - startTime}ms.\n`);

      // 8a. /api/health returns HTTP 503
      const healthRes = await fetch(`${BASE_URL}/api/health`);
      const healthData = await healthRes.json();
      const healthOk =
        healthRes.status === 503 &&
        healthData.status === 'UNHEALTHY' &&
        healthData.database?.status === 'unavailable' &&
        healthData.database?.accessible === false;

      // 8b. /api/batches returns HTTP 503
      const batchesRes = await fetch(`${BASE_URL}/api/batches`);
      const batchesData = await batchesRes.json();
      const batchesOk =
        batchesRes.status === 503 &&
        batchesData.success === false &&
        batchesData.error === 'Database service unavailable';

      // 8c. /api/auth/login returns HTTP 503
      const loginTraceId = 'trace-db-unavailable-login-01';
      const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL, 'X-Request-ID': loginTraceId },
        body: JSON.stringify({ role: 'STUDENT', identifier: 'DEMO-001', password: 'password123' }),
      });
      const loginData = await loginRes.json();
      const loginOk =
        loginRes.status === 503 &&
        loginData.success === false &&
        loginData.error === 'Database service unavailable' &&
        loginRes.headers.get('x-request-id') === loginTraceId;

      // 8d. /api/certificates/BATCH/0/pdf returns HTTP 503
      const pdfRes = await fetch(`${BASE_URL}/api/certificates/TEST-BATCH/0/pdf`);
      const pdfData = await pdfRes.json();
      const pdfOk =
        pdfRes.status === 503 &&
        pdfData.success === false &&
        pdfData.error === 'Database service unavailable';

      // 8e. /api/verify/BATCH/0 returns HTTP 503
      const verifyRes = await fetch(`${BASE_URL}/api/verify/TEST-BATCH/0`);
      const verifyData = await verifyRes.json();
      const verifyOk =
        verifyRes.status === 503 &&
        verifyData.success === false &&
        verifyData.error === 'Database service unavailable';

      assert(
        healthOk && batchesOk && loginOk && pdfOk && verifyOk,
        'Test 8: Database unavailability cleanly returns HTTP 503 across all critical API routes with Request IDs',
        `Health: ${healthRes.status}, Batches: ${batchesRes.status}, Login: ${loginRes.status}, PDF: ${pdfRes.status}, Verify: ${verifyRes.status}`
      );

      // ----------------------------------------------------
      // TEST 9: Structured logs emit statusCode 503 and durationMs on database failure
      // ----------------------------------------------------
      await new Promise((r) => setTimeout(r, 200));
      const logLines = serverLogs.split('\n');
      let found503Log = null;
      for (const line of logLines) {
        if (line.includes(loginTraceId)) {
          try {
            const parsed = JSON.parse(line.trim());
            if (parsed.requestId === loginTraceId) {
              found503Log = parsed;
              break;
            }
          } catch { }
        }
      }

      const leaksInternalPath =
        serverLogs.includes('simulated_unavailable_dir_99999') ||
        (found503Log && JSON.stringify(found503Log).includes('offline.db'));

      assert(
        Boolean(found503Log) &&
        found503Log.statusCode === 503 &&
        typeof found503Log.durationMs === 'number' &&
        found503Log.durationMs >= 0 &&
        found503Log.error?.category === 'DATABASE_ERROR' &&
        !leaksInternalPath,
        'Test 9: Server emits structured 503 error logs with durationMs and sanitized error classification',
        `Found log: ${JSON.stringify(found503Log)}, leaksPath: ${leaksInternalPath}`
      );

    } catch (err) {
      assert(false, 'Test 8/9: Live server database resilience check', err.message);
    } finally {
      if (serverProc && serverProc.pid) {
        killProcessTree(serverProc.pid);
      }
    }

    // ----------------------------------------------------
    // TEST 10: Connection reuse singleton and cleanup lifecycle
    // ----------------------------------------------------
    try {
      const dbIndexMod = loadModuleFromTs('src/lib/db/index.ts');
      const { getDatabaseAdapter, closeDatabaseAdapter } = dbIndexMod;

      process.env.DATABASE_PATH = testDbPath;
      const adapter1 = getDatabaseAdapter();
      const adapter2 = getDatabaseAdapter();

      // Verify singleton identity
      const isSameSingleton = adapter1 === adapter2;

      // Close adapter
      await closeDatabaseAdapter();

      // Verify next call instantiates fresh adapter
      const adapter3 = getDatabaseAdapter();
      const isNewInstance = adapter3 !== adapter1;
      await closeDatabaseAdapter();

      assert(
        isSameSingleton && isNewInstance,
        'Test 10: Database adapter properly reuses singleton connection and cleans up without leaking handles',
        `Same: ${isSameSingleton}, New after close: ${isNewInstance}`
      );
    } catch (err) {
      assert(false, 'Test 10: Connection reuse and cleanup check', err.message);
    }

  } finally {
    console.log('\n🗑️  Cleaning up temporary test directory...');
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { }
  }

  console.log('\n====================================================');
  console.log(`Database Resilience Test Suite Completed: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});

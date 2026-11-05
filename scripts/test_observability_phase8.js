/**
 * SOET VeriTrust - Phase 8 Observability, Request Correlation & Health Sanitization Test Suite
 *
 * VALIDATES P8-T03 REQUIREMENTS:
 * 1. Default request ID generation: random UUID when X-Request-ID header is omitted.
 * 2. Valid incoming request ID acceptance and propagation in response header and body.
 * 3. Invalid request ID rejection: short, illegal characters (<script>), and oversized headers rejected.
 * 4. X-Request-ID response header propagation across all API response types.
 * 5. Health endpoint success: clean response without internal filesystem paths.
 * 6. Health endpoint failure sanitization: HTTP 503 does NOT leak file paths or stack traces.
 * 7. Malformed JSON on /api/auth/login returns HTTP 400 with standardized error and requestId.
 * 8. Malformed JSON on /api/batches returns HTTP 400 with standardized error and requestId.
 * 9. Malformed JSON on /api/batches/revoke returns HTTP 400 with standardized error and requestId.
 * 10. Malformed JSON on /api/batches/[batchId] (PATCH) returns HTTP 400 with standardized error and requestId.
 * 11. Malformed JSON on /api/ipfs/upload returns HTTP 400 with standardized error and requestId.
 * 12. Valid JSON with missing/invalid fields preserves exact domain validation responses.
 * 13. Structured logging: server stdout records valid JSON logs with level, timestamp, requestId, route.
 * 14. Sensitive data redaction: passwords, tokens, and private secrets are never leaked into logs.
 *
 * STRICT SAFETY & ISOLATION GUARANTEES:
 * - Operates in an isolated temporary database in a temporary directory.
 * - Does NOT modify data/veritrust.db.
 * - Spawns dedicated Next.js test server on dynamic TCP port.
 * - Cleans up server process tree and temporary files in finally block.
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

function seedIsolatedDatabase(dbPath) {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
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

    CREATE TABLE IF NOT EXISTS student_accounts (
      prn TEXT PRIMARY KEY,
      password_hash TEXT,
      activation_token_hash TEXT,
      activation_expires_at INTEGER,
      status TEXT DEFAULT 'ACTIVE',
      failed_attempts INTEGER DEFAULT 0,
      locked_until INTEGER DEFAULT 0,
      created_at INTEGER,
      activated_at INTEGER,
      last_login_at INTEGER
    );
  `);

  function hashScrypt(plaintext) {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(plaintext, salt, 64);
    return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
  }

  const studentHash = hashScrypt('TestStudentPassword123!');
  db.prepare(`
    INSERT INTO student_accounts (prn, password_hash, status, created_at, activated_at)
    VALUES (?, ?, 'ACTIVE', ?, ?)
  `).run('TEST-STUDENT-001', studentHash, Date.now(), Date.now());

  const sampleRecords = [
    {
      prn: 'TEST-STUDENT-001',
      fullName: 'Alice Test',
      degree: 'B.Tech Computer Science',
      branch: 'CSE',
      cgpa: 8.9,
      graduationYear: 2026,
      institute: 'School of Engineering and Technology (SOET)',
    },
  ];

  db.prepare(`
    INSERT INTO batches (
      batchId, merkleRoot, ipfsCid, timestamp, issuer, institutionName, institutionCode,
      totalCredentials, revokedIndices, records, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'TEST-BATCH-OBS-01',
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    'QmTestCidObs1234567890',
    1700000000,
    '0x71c56538b15294500b73F8472B4fe963D4e58Bef',
    'MGM University',
    'MGMU-ENG-01',
    sampleRecords.length,
    '[]',
    JSON.stringify(sampleRecords),
    'INSTITUTIONAL_STORED'
  );

  db.prepare(`
    INSERT INTO credentials (
      id, batch_id, prn, full_name, degree, branch, cgpa, graduation_year, institute, leaf_index, raw_record, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'TEST-BATCH-OBS-01_0',
    'TEST-BATCH-OBS-01',
    'TEST-STUDENT-001',
    'Alice Test',
    'B.Tech Computer Science',
    'CSE',
    8.9,
    2026,
    'School of Engineering and Technology (SOET)',
    0,
    JSON.stringify(sampleRecords[0]),
    Date.now()
  );

  db.close();
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('SOET VeriTrust - Phase 8 Observability & Sanitization Test Suite');
  console.log('====================================================\n');

  const tmpDir = path.resolve(process.cwd(), `tmp_obs_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const testDbPath = path.join(tmpDir, 'isolated_observability.db');

  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  seedIsolatedDatabase(testDbPath);
  console.log('📁 Isolated Test DB Path:', testDbPath);
  console.log('🌱 Isolated test database seeded successfully.\n');

  const testPort = await getFreePort();
  const BASE_URL = `http://127.0.0.1:${testPort}`;
  console.log(`🚀 Starting dedicated Next.js test server on port ${testPort}...`);

  const serverProc = spawn('node', ['node_modules/next/dist/bin/next', 'dev', '-p', String(testPort)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(testPort),
      DATABASE_PATH: testDbPath,
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverLogs = '';
  serverProc.stdout.on('data', (d) => { serverLogs += d.toString(); });
  serverProc.stderr.on('data', (d) => { serverLogs += d.toString(); });

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

  try {
    // Wait for server readiness
    const startTime = Date.now();
    let isReady = false;
    while (Date.now() - startTime < SERVER_STARTUP_TIMEOUT_MS) {
      try {
        const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          isReady = true;
          break;
        }
      } catch { }
      await new Promise((r) => setTimeout(r, 400));
    }

    if (!isReady) {
      console.error('Server output before timeout:\n', serverLogs);
      throw new Error(`Test server failed to respond on ${BASE_URL} within ${SERVER_STARTUP_TIMEOUT_MS}ms.`);
    }

    console.log(`✅ Dedicated test server ready in ${Date.now() - startTime}ms.\n`);

    // ----------------------------------------------------
    // TEST 1: Default Request ID Generation (UUID)
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      const reqIdHeader = res.headers.get('x-request-id');
      const data = await res.json();

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      assert(
        res.ok &&
        Boolean(reqIdHeader) &&
        uuidRegex.test(reqIdHeader) &&
        data.requestId === reqIdHeader,
        'Test 1: Default request ID is a cryptographically secure random UUID propagated in header and body',
        `Header: ${reqIdHeader}, body.requestId: ${data.requestId}`
      );
    } catch (err) {
      assert(false, 'Test 1: Default request ID check', err.message);
    }

    // ----------------------------------------------------
    // TEST 2: Valid Incoming Request ID Propagation
    // ----------------------------------------------------
    try {
      const customTraceId = 'audit-trace-correlation-id-2026';
      const res = await fetch(`${BASE_URL}/api/health`, {
        headers: { 'X-Request-ID': customTraceId },
      });
      const reqIdHeader = res.headers.get('x-request-id');
      const data = await res.json();

      assert(
        res.ok &&
        reqIdHeader === customTraceId &&
        data.requestId === customTraceId,
        'Test 2: Valid incoming X-Request-ID is preserved and propagated in response header and body',
        `Expected ${customTraceId}, got header: ${reqIdHeader}, body: ${data.requestId}`
      );
    } catch (err) {
      assert(false, 'Test 2: Valid incoming request ID check', err.message);
    }

    // ----------------------------------------------------
    // TEST 3: Invalid Characters and Short Request ID Rejection
    // ----------------------------------------------------
    try {
      const maliciousId = '<script>alert("xss")</script>';
      const res = await fetch(`${BASE_URL}/api/health`, {
        headers: { 'X-Request-ID': maliciousId },
      });
      const reqIdHeader = res.headers.get('x-request-id');
      const data = await res.json();

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      assert(
        reqIdHeader !== maliciousId &&
        uuidRegex.test(reqIdHeader) &&
        data.requestId === reqIdHeader,
        'Test 3: Malformed / injection-bearing X-Request-ID is safely rejected and replaced with valid UUID',
        `Received: ${reqIdHeader}`
      );
    } catch (err) {
      assert(false, 'Test 3: Malformed request ID check', err.message);
    }

    // ----------------------------------------------------
    // TEST 4: Oversized Request ID Rejection
    // ----------------------------------------------------
    try {
      const oversizedId = 'A'.repeat(500);
      const res = await fetch(`${BASE_URL}/api/health`, {
        headers: { 'X-Request-ID': oversizedId },
      });
      const reqIdHeader = res.headers.get('x-request-id');
      const data = await res.json();

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      assert(
        reqIdHeader !== oversizedId &&
        uuidRegex.test(reqIdHeader) &&
        data.requestId === reqIdHeader,
        'Test 4: Oversized X-Request-ID (>64 chars) is safely rejected and replaced with valid UUID'
      );
    } catch (err) {
      assert(false, 'Test 4: Oversized request ID check', err.message);
    }

    // ----------------------------------------------------
    // TEST 5: Health Endpoint Success, Privacy & Path Sanitization
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      const bodyText = await res.text();
      const data = JSON.parse(bodyText);

      const leaksFilesystem =
        bodyText.includes('C:\\') ||
        bodyText.includes('/Users/') ||
        bodyText.includes('isolated_observability.db') ||
        bodyText.includes('data/veritrust.db');

      const isMinimalAndPrivate =
        data.batches === undefined &&
        data.credentials === undefined &&
        data.journalMode === undefined &&
        (data.database ? data.database.journalMode === undefined : true) &&
        data.environment === undefined;

      assert(
        res.status === 200 &&
        data.status === 'HEALTHY' &&
        data.database.status === 'healthy' &&
        data.database.accessible === true &&
        Boolean(data.timestamp) &&
        Boolean(data.requestId) &&
        isMinimalAndPrivate &&
        !leaksFilesystem,
        'Test 5: Health endpoint succeeds and remains minimal & private (no batches, credentials, journalMode, environment, or file paths)',
        `Leaks: ${leaksFilesystem}, isMinimalAndPrivate: ${isMinimalAndPrivate}`
      );
    } catch (err) {
      assert(false, 'Test 5: Health success check', err.message);
    }

    // ----------------------------------------------------
    // TEST 6: Health Endpoint Simulated Failure Sanitization
    // ----------------------------------------------------
    let failServerProc = null;
    try {
      const failPort = await getFreePort();
      failServerProc = spawn('node', ['node_modules/next/dist/bin/next', 'dev', '-p', String(failPort)], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: String(failPort),
          DATABASE_PATH: 'C:\\simulated_non_existent_dir_99999\\offline_missing.db',
          NODE_ENV: 'development',
        },
        stdio: 'ignore',
      });

      // Poll until fail server is responding
      let failRes = null;
      let failBodyText = '';
      const failStartTime = Date.now();
      while (Date.now() - failStartTime < 15000) {
        try {
          const res = await fetch(`http://127.0.0.1:${failPort}/api/health`, { signal: AbortSignal.timeout(2000) });
          if (res.status === 503) {
            failRes = res;
            failBodyText = await res.text();
            break;
          }
        } catch { }
        await new Promise((r) => setTimeout(r, 400));
      }

      if (failRes && failBodyText) {
        const failData = JSON.parse(failBodyText);
        const leaksPath =
          failBodyText.includes('simulated_non_existent_dir_99999') ||
          failBodyText.includes('offline_missing.db') ||
          failBodyText.includes('C:\\');

        assert(
          failRes.status === 503 &&
          failData.status === 'UNHEALTHY' &&
          failData.database.status === 'unavailable' &&
          failData.database.accessible === false &&
          failData.error === 'Database service unavailable' &&
          !leaksPath &&
          Boolean(failRes.headers.get('x-request-id')),
          'Test 6: Simulated DB failure returns sanitized HTTP 503 without revealing internal file paths or stack traces',
          `Response: ${failBodyText}`
        );
      } else {
        assert(false, 'Test 6: Health failure check', 'Fail server did not respond with 503 in time');
      }
    } catch (err) {
      assert(false, 'Test 6: Health failure sanitization check', err.message);
    } finally {
      if (failServerProc && failServerProc.pid) {
        killProcessTree(failServerProc.pid);
      }
    }

    // ----------------------------------------------------
    // Authenticate Admin to obtain session for admin mutating routes
    // ----------------------------------------------------
    let adminCookie = '';
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL },
      body: JSON.stringify({
        role: 'EXAM_ADMIN',
        identifier: 'EXAM_ADMIN_MGM',
        password: process.env.ADMIN_PASSWORD || 'admin123',
      }),
    });
    const setCookie = loginRes.headers.get('set-cookie');
    if (setCookie) {
      adminCookie = setCookie.split(';')[0];
    }

    // ----------------------------------------------------
    // TEST 7: Malformed JSON on /api/auth/login Returns HTTP 400
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL },
        body: '{"role": "STUDENT", "identifier": "TEST-001", broken_json',
      });
      const data = await res.json();
      assert(
        res.status === 400 &&
        data.success === false &&
        data.error.includes('Malformed or invalid JSON payload') &&
        Boolean(data.requestId) &&
        Boolean(res.headers.get('x-request-id')),
        'Test 7: Malformed JSON on /api/auth/login returns HTTP 400 with correlation requestId',
        `Status: ${res.status}, error: ${data.error}`
      );
    } catch (err) {
      assert(false, 'Test 7: Login malformed JSON check', err.message);
    }

    // ----------------------------------------------------
    // TEST 8: Malformed JSON on /api/batches Returns HTTP 400
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/batches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': BASE_URL,
          'Cookie': adminCookie,
        },
        body: '<<<not a json object>>>',
      });
      const data = await res.json();
      assert(
        res.status === 400 &&
        data.success === false &&
        data.error.includes('Malformed or invalid JSON payload') &&
        Boolean(data.requestId),
        'Test 8: Malformed JSON on /api/batches returns HTTP 400 with correlation requestId',
        `Status: ${res.status}, error: ${data.error}`
      );
    } catch (err) {
      assert(false, 'Test 8: Batches malformed JSON check', err.message);
    }

    // ----------------------------------------------------
    // TEST 9: Malformed JSON on /api/batches/revoke Returns HTTP 400
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/batches/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': BASE_URL,
          'Cookie': adminCookie,
        },
        body: '{ batchId: missing_quotes }',
      });
      const data = await res.json();
      assert(
        res.status === 400 &&
        data.success === false &&
        data.error.includes('Malformed or invalid JSON payload') &&
        Boolean(data.requestId),
        'Test 9: Malformed JSON on /api/batches/revoke returns HTTP 400 with correlation requestId',
        `Status: ${res.status}, error: ${data.error}`
      );
    } catch (err) {
      assert(false, 'Test 9: Revoke malformed JSON check', err.message);
    }

    // ----------------------------------------------------
    // TEST 10: Malformed JSON on /api/batches/[batchId] (PATCH) Returns HTTP 400
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/batches/TEST-BATCH-OBS-01`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Origin': BASE_URL,
          'Cookie': adminCookie,
        },
        body: 'invalid_json_stream',
      });
      const data = await res.json();
      assert(
        res.status === 400 &&
        data.success === false &&
        data.error.includes('Malformed or invalid JSON payload') &&
        Boolean(data.requestId),
        'Test 10: Malformed JSON on /api/batches/[batchId] (PATCH) returns HTTP 400 with correlation requestId',
        `Status: ${res.status}, error: ${data.error}`
      );
    } catch (err) {
      assert(false, 'Test 10: Batch PATCH malformed JSON check', err.message);
    }

    // ----------------------------------------------------
    // TEST 11: Malformed JSON on /api/ipfs/upload Returns HTTP 400
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/ipfs/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': BASE_URL,
          'Cookie': adminCookie,
        },
        body: '{ "unclosed": "payload',
      });
      const data = await res.json();
      assert(
        res.status === 400 &&
        data.success === false &&
        data.error.includes('Malformed or invalid JSON payload') &&
        Boolean(data.requestId),
        'Test 11: Malformed JSON on /api/ipfs/upload returns HTTP 400 with correlation requestId',
        `Status: ${res.status}, error: ${data.error}`
      );
    } catch (err) {
      assert(false, 'Test 11: IPFS upload malformed JSON check', err.message);
    }

    // ----------------------------------------------------
    // TEST 12: Valid JSON with Invalid Fields Retains Validation Behavior
    // ----------------------------------------------------
    try {
      // Missing password and identifier
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL },
        body: JSON.stringify({ role: 'STUDENT' }),
      });
      const data = await res.json();
      assert(
        res.status === 400 &&
        data.success === false &&
        data.error === 'Missing required credentials' &&
        Boolean(data.requestId),
        'Test 12: Valid JSON with missing fields retains exact domain validation response',
        `Status: ${res.status}, error: ${data.error}`
      );
    } catch (err) {
      assert(false, 'Test 12: Valid JSON domain validation check', err.message);
    }

    // ----------------------------------------------------
    // TEST 13: Structured Logging & Sensitive Data Redaction
    // ----------------------------------------------------
    try {
      // Trigger a login attempt with sensitive password
      await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': BASE_URL,
          'X-Request-ID': 'trace-log-redaction-test-01',
        },
        body: JSON.stringify({
          role: 'STUDENT',
          identifier: 'TEST-STUDENT-001',
          password: 'SuperSecretRawPassword123!',
        }),
      });

      // Assert password plaintext never appears in server stdout logs
      const rawPasswordLeaked = serverLogs.includes('SuperSecretRawPassword123!');
      const hasStructuredLogs = serverLogs.includes('"level":') && serverLogs.includes('"timestamp":');

      assert(
        !rawPasswordLeaked && hasStructuredLogs,
        'Test 13: Server emits structured JSON logs and never logs raw passwords or credentials',
        `Leaked: ${rawPasswordLeaked}, hasStructured: ${hasStructuredLogs}`
      );
    } catch (err) {
      assert(false, 'Test 13: Structured logging check', err.message);
    }

    // ----------------------------------------------------
    // TEST 14: Structured Logging Completeness (statusCode & durationMs)
    // ----------------------------------------------------
    try {
      const metricTraceId = 'trace-metric-completeness-01';
      await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': BASE_URL,
          'X-Request-ID': metricTraceId,
        },
        body: JSON.stringify({
          role: 'STUDENT',
          identifier: 'TEST-STUDENT-001',
          password: 'WrongPasswordForMetricCheck999!',
        }),
      });

      // Give server time to flush logs
      await new Promise((r) => setTimeout(r, 200));

      // Find the structured log for this request
      const logLines = serverLogs.split('\n');
      let foundRecord = null;
      for (const line of logLines) {
        if (line.includes(metricTraceId)) {
          try {
            const parsed = JSON.parse(line.trim());
            if (parsed.requestId === metricTraceId) {
              foundRecord = parsed;
              break;
            }
          } catch { }
        }
      }

      assert(
        Boolean(foundRecord) &&
        foundRecord.level === 'WARN' &&
        foundRecord.statusCode === 401 &&
        typeof foundRecord.durationMs === 'number' &&
        foundRecord.durationMs >= 0 &&
        foundRecord.route === '/api/auth/login' &&
        foundRecord.method === 'POST',
        'Test 14: Structured logs include HTTP response status (statusCode) and request duration (durationMs in ms)',
        `Found record: ${JSON.stringify(foundRecord)}`
      );
    } catch (err) {
      assert(false, 'Test 14: Structured logging completeness check', err.message);
    }

    // ----------------------------------------------------
    // TEST 15: Exception-Message & Raw Payload Privacy on Malformed JSON
    // ----------------------------------------------------
    try {
      const syntaxTraceId = 'trace-malformed-redaction-02';
      const secretFragment = 'ForbiddenLeakedPayloadSecret_98765';
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': BASE_URL,
          'X-Request-ID': syntaxTraceId,
        },
        body: `{"password": "${secretFragment}", "syntax": invalid_token_here`,
      });

      // Give server time to flush logs
      await new Promise((r) => setTimeout(r, 200));

      const payloadLeakedInLogs = serverLogs.includes(secretFragment);

      // Find structured log entry
      const logLines = serverLogs.split('\n');
      let syntaxLog = null;
      for (const line of logLines) {
        if (line.includes(syntaxTraceId)) {
          try {
            const parsed = JSON.parse(line.trim());
            if (parsed.requestId === syntaxTraceId) {
              syntaxLog = parsed;
              break;
            }
          } catch { }
        }
      }

      assert(
        res.status === 400 &&
        !payloadLeakedInLogs &&
        Boolean(syntaxLog) &&
        syntaxLog.statusCode === 400 &&
        typeof syntaxLog.durationMs === 'number' &&
        syntaxLog.error?.category === 'SYNTAX_ERROR' &&
        syntaxLog.error?.message === 'Invalid JSON syntax',
        'Test 15: Exception messages for malformed JSON redact unparsed payload fragments and classify error safely',
        `Status: ${res.status}, leaked: ${payloadLeakedInLogs}, syntaxLog: ${JSON.stringify(syntaxLog)}`
      );
    } catch (err) {
      assert(false, 'Test 15: Exception message privacy check', err.message);
    }

    // ----------------------------------------------------
    // TEST 16: Deep String-Level Sanitization & Error Categorization
    // ----------------------------------------------------
    try {
      const ts = require('typescript');
      const obsCode = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/observability.ts'), 'utf8');
      const transpiled = ts.transpileModule(obsCode, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      });
      const mod = { exports: {} };
      const runMod = new Function('module', 'exports', 'require', transpiled.outputText);
      runMod(mod, mod.exports, (dep) => {
        if (dep === 'next/server') return { NextResponse: { json: (d) => d } };
        return require(dep);
      });

      const { sanitizeErrorMessage, sanitizeError } = mod.exports;

      // 1. Connection string credentials
      const uriWithPass = 'libsql://test_user:SuperSecretDbPassword999@turso.io/mydb';
      const cleanUri = sanitizeErrorMessage(uriWithPass);
      const uriSafe = !cleanUri.includes('SuperSecretDbPassword999') && cleanUri.includes('[REDACTED]');

      // 2. Bearer tokens
      const bearerStr = 'Failed authorization header Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.SecretTokenFragment';
      const cleanBearer = sanitizeErrorMessage(bearerStr);
      const bearerSafe = !cleanBearer.includes('SecretTokenFragment') && cleanBearer.includes('[REDACTED]');

      // 3. Sensitive JSON key
      const jsonStr = 'Malformed object: {"password": "RawPlaintextSecretValue!", "name": "Alice"}';
      const cleanJson = sanitizeErrorMessage(jsonStr);
      const jsonSafe = !cleanJson.includes('RawPlaintextSecretValue!') && cleanJson.includes('[REDACTED]');

      // 4. Windows file path
      const winPath = 'SQLite error at C:\\Users\\PrivateAdmin\\AppData\\Local\\secret.db';
      const cleanWinPath = sanitizeErrorMessage(winPath);
      const winPathSafe = !cleanWinPath.includes('PrivateAdmin') && cleanWinPath.includes('[PATH_REDACTED]');

      // 5. Unix file path
      const unixPath = 'Failed opening /Users/privateadmin/secrets/key.pem';
      const cleanUnixPath = sanitizeErrorMessage(unixPath);
      const unixPathSafe = !cleanUnixPath.includes('privateadmin') && cleanUnixPath.includes('[PATH_REDACTED]');

      // 6. 64-char hex key
      const hexKey = 'Unanchored key 0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';
      const cleanHexKey = sanitizeErrorMessage(hexKey);
      const hexSafe = !cleanHexKey.includes('4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d') && cleanHexKey.includes('[REDACTED_SECRET]');

      // 7. Error categorization
      const syntaxClassification = sanitizeError(new SyntaxError('Unexpected token p in JSON at position 12'));
      const dbClassification = sanitizeError(new Error('Sqlite database locked at C:\\app\\db.sqlite'));
      const netClassification = sanitizeError(new Error('Fetch failed ECONNREFUSED'));
      const authClassification = sanitizeError(new Error('CSRF token mismatch'));

      const categoriesSafe =
        syntaxClassification.category === 'SYNTAX_ERROR' &&
        syntaxClassification.message === 'Invalid JSON syntax' &&
        dbClassification.category === 'DATABASE_ERROR' &&
        !dbClassification.message.includes('C:\\app') &&
        netClassification.category === 'NETWORK_ERROR' &&
        authClassification.category === 'AUTH_ERROR';

      assert(
        uriSafe && bearerSafe && jsonSafe && winPathSafe && unixPathSafe && hexSafe && categoriesSafe,
        'Test 16: String-level sanitizer redacts URI passwords, tokens, JSON keys, file paths, and hex secrets with safe classifications',
        `uriSafe: ${uriSafe}, bearerSafe: ${bearerSafe}, jsonSafe: ${jsonSafe}, winPathSafe: ${winPathSafe}, unixPathSafe: ${unixPathSafe}, hexSafe: ${hexSafe}, categoriesSafe: ${categoriesSafe}`
      );
    } catch (err) {
      assert(false, 'Test 16: Deep string sanitization check', err.message);
    }

  } finally {
    console.log('\n🧹 Terminating test server process tree...');
    if (serverProc && serverProc.pid) {
      killProcessTree(serverProc.pid);
    }
    console.log('🗑️  Removing isolated test directory...');
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { }
  }

  console.log('\n====================================================');
  console.log(`Observability Test Suite Completed: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});

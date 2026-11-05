/**
 * SOET VeriTrust - Phase 8 API Resilience, Rate Limiting & CSRF Test Suite
 *
 * VALIDATES:
 * 1. Admin authentication & session creation.
 * 2. IPFS upload rejects unauthorized requests (HTTP 401).
 * 3. IPFS upload rejects cross-origin request forgery (CSRF rejection with HTTP 403).
 * 4. IPFS upload accepts valid authenticated admin request with matching CSRF origin.
 * 5. IPFS upload rate limit: 10 requests/min enforced with HTTP 429 and Retry-After headers.
 * 6. Dynamic PDF download rate limit: 30 requests/min enforced with HTTP 429 and Retry-After headers.
 * 7. Batch creation rate limit: 20 requests/min enforced with HTTP 429 and Retry-After headers.
 * 8. Batch revocation rate limit: 20 requests/min enforced with HTTP 429 and Retry-After headers.
 * 9. Batch listing rate limit: 30 requests/min enforced with HTTP 429.
 * 10. Single batch query rate limit: 60 requests/min enforced with HTTP 429.
 * 11. Batch anchor update rate limit: 20 requests/min enforced with HTTP 429.
 * 12. Existing login rate limit remains strictly 10 requests/min with HTTP 429.
 * 13. Trusted proxy spoofing defense: client-supplied headers ignored when proxy trust is inactive.
 *
 * STRICT SAFETY & ISOLATION GUARANTEES:
 * - Operates in an isolated temporary database in a temporary directory.
 * - Does NOT modify data/veritrust.db.
 * - Spawns dedicated Next.js test server on dynamic TCP port.
 * - Cleans up server process tree and deletes temporary files in finally block.
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
      created_at INTEGER NOT NULL,
      activated_at INTEGER,
      last_login_at INTEGER
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_prn ON credentials(batch_id, prn);
    CREATE INDEX IF NOT EXISTS idx_credentials_prn ON credentials(prn);
  `);

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
    {
      prn: 'TEST-STUDENT-002',
      fullName: 'Bob Test',
      degree: 'B.Tech Computer Science',
      branch: 'CSE',
      cgpa: 8.4,
      graduationYear: 2026,
      institute: 'School of Engineering and Technology (SOET)',
    },
  ];

  const now = Date.now();

  db.prepare(`
    INSERT INTO batches (
      batchId, merkleRoot, ipfsCid, timestamp, issuer, institutionName, institutionCode,
      totalCredentials, revokedIndices, records, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'TEST-BATCH-RES-01',
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    'QmTestCid1234567890',
    1700000000,
    '0x71c56538b15294500b73F8472B4fe963D4e58Bef',
    'MGM University',
    'MGMU-ENG-01',
    sampleRecords.length,
    '[]',
    JSON.stringify(sampleRecords),
    'INSTITUTIONAL_STORED'
  );

  sampleRecords.forEach((rec, idx) => {
    db.prepare(`
      INSERT INTO credentials (
        id, batch_id, prn, full_name, degree, branch, cgpa,
        graduation_year, institute, leaf_index, raw_record, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `TEST-BATCH-RES-01_${rec.prn}`,
      'TEST-BATCH-RES-01',
      rec.prn,
      rec.fullName,
      rec.degree,
      rec.branch,
      rec.cgpa,
      rec.graduationYear,
      rec.institute,
      idx,
      JSON.stringify(rec),
      now
    );
  });

  // Seed student account with valid scrypt hash: scrypt:<salt_hex>:<hash_hex>
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync('student123', salt, 64);
  const scryptHash = `scrypt:${salt.toString('hex')}:${derivedKey.toString('hex')}`;

  db.prepare(`
    INSERT INTO student_accounts (
      prn, password_hash, activation_token_hash, activation_expires_at,
      status, failed_attempts, locked_until, created_at, activated_at, last_login_at
    ) VALUES (?, ?, NULL, NULL, 'ACTIVE', 0, 0, ?, ?, NULL)
  `).run('TEST-STUDENT-001', scryptHash, now, now);

  db.close();
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('SOET VeriTrust - Phase 8 API Resilience & CSRF Test Suite');
  console.log('====================================================\n');

  const tmpDir = path.resolve(process.cwd(), `tmp_res_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const testDbPath = path.join(tmpDir, 'isolated_resilience.db');

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
    // TEST 1: Admin Login and Session Creation
    // ----------------------------------------------------
    let adminCookie = '';
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': BASE_URL,
        },
        body: JSON.stringify({
          role: 'EXAM_ADMIN',
          identifier: 'EXAM_ADMIN_MGM',
          password: process.env.ADMIN_PASSWORD || 'admin123',
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const data = await res.json();
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) adminCookie = setCookie.split(';')[0];

      assert(
        res.status === 200 && data.success && Boolean(adminCookie),
        'Test 1: Admin logs in successfully and receives session cookie'
      );
    } catch (err) {
      assert(false, 'Test 1: Admin login', err.message);
    }

    // ----------------------------------------------------
    // TEST 2: IPFS Upload Rejects Unauthorized Access
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/ipfs/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': BASE_URL,
        },
        body: JSON.stringify({ batchId: 'TEST-BATCH-RES-01' }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const data = await res.json();

      assert(
        res.status === 401 && !data.success && data.error.includes('Unauthorized'),
        'Test 2: IPFS upload rejects unauthenticated requests with HTTP 401'
      );
    } catch (err) {
      assert(false, 'Test 2: IPFS unauthorized check', err.message);
    }

    // ----------------------------------------------------
    // TEST 3: IPFS Upload CSRF Rejection
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/ipfs/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': adminCookie,
          'Origin': 'https://malicious-cross-origin.com',
        },
        body: JSON.stringify({ batchId: 'TEST-BATCH-RES-01' }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const data = await res.json();

      assert(
        res.status === 403 && data.error && data.error.includes('CSRF'),
        'Test 3: IPFS upload rejects cross-origin request forgery (CSRF) with HTTP 403'
      );
    } catch (err) {
      assert(false, 'Test 3: IPFS CSRF rejection', err.message);
    }

    // ----------------------------------------------------
    // TEST 4: IPFS Upload Accepts Valid CSRF & Authenticated Session
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/ipfs/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': adminCookie,
          'Origin': BASE_URL,
        },
        body: JSON.stringify({ batchId: 'TEST-BATCH-RES-01' }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      // In test mode without PINATA credentials, returns 500 Pinata unconfigured, NOT 401 or 403!
      const data = await res.json();
      assert(
        res.status !== 401 && res.status !== 403,
        'Test 4: IPFS upload with valid CSRF and admin session passes security gate'
      );
    } catch (err) {
      assert(false, 'Test 4: IPFS valid session check', err.message);
    }

    // ----------------------------------------------------
    // TEST 5: IPFS Upload Rate Limiting (10 req/min)
    // ----------------------------------------------------
    try {
      let blockedRes = null;
      // We already made 1 valid IPFS request in Test 4. Make 12 rapid calls to exceed 10.
      for (let i = 0; i < 12; i++) {
        const res = await fetch(`${BASE_URL}/api/ipfs/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': adminCookie,
            'Origin': BASE_URL,
          },
          body: JSON.stringify({ batchId: 'TEST-BATCH-RES-01' }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.status === 429) {
          blockedRes = res;
          break;
        }
      }

      assert(
        blockedRes &&
        blockedRes.status === 429 &&
        Boolean(blockedRes.headers.get('retry-after')) &&
        blockedRes.headers.get('x-ratelimit-limit') === '10',
        'Test 5: IPFS upload enforces 10 req/min rate limit with HTTP 429 and Retry-After header'
      );
    } catch (err) {
      assert(false, 'Test 5: IPFS rate limit check', err.message);
    }

    // ----------------------------------------------------
    // TEST 6: Dynamic PDF Download Rate Limiting (30 req/min)
    // ----------------------------------------------------
    try {
      let blockedRes = null;
      for (let i = 0; i < 35; i++) {
        const res = await fetch(`${BASE_URL}/api/certificates/TEST-BATCH-RES-01/0/pdf`, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.status === 429) {
          blockedRes = res;
          break;
        }
      }

      assert(
        blockedRes &&
        blockedRes.status === 429 &&
        Boolean(blockedRes.headers.get('retry-after')) &&
        blockedRes.headers.get('x-ratelimit-limit') === '30',
        'Test 6: Dynamic PDF download enforces 30 req/min rate limit with HTTP 429 and Retry-After header'
      );
    } catch (err) {
      assert(false, 'Test 6: PDF download rate limit check', err.message);
    }

    // ----------------------------------------------------
    // TEST 7: Batch Creation Rate Limiting (20 req/min)
    // ----------------------------------------------------
    try {
      let blockedRes = null;
      for (let i = 0; i < 25; i++) {
        const res = await fetch(`${BASE_URL}/api/batches`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': adminCookie,
            'Origin': BASE_URL,
          },
          body: JSON.stringify({
            batchId: `TEST-RATE-BATCH-${i}`,
            merkleRoot: '0x1111111111111111111111111111111111111111111111111111111111111111',
            records: [{ prn: `PRN-RATE-${i}`, fullName: `Student ${i}` }],
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.status === 429) {
          blockedRes = res;
          break;
        }
      }

      assert(
        blockedRes &&
        blockedRes.status === 429 &&
        Boolean(blockedRes.headers.get('retry-after')) &&
        blockedRes.headers.get('x-ratelimit-limit') === '20',
        'Test 7: Batch creation enforces 20 req/min rate limit with HTTP 429 and Retry-After header'
      );
    } catch (err) {
      assert(false, 'Test 7: Batch creation rate limit check', err.message);
    }

    // ----------------------------------------------------
    // TEST 8: Batch Revocation Rate Limiting (20 req/min)
    // ----------------------------------------------------
    try {
      let blockedRes = null;
      for (let i = 0; i < 25; i++) {
        const res = await fetch(`${BASE_URL}/api/batches/revoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': adminCookie,
            'Origin': BASE_URL,
          },
          body: JSON.stringify({
            batchId: 'TEST-BATCH-RES-01',
            leafIndex: 0,
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.status === 429) {
          blockedRes = res;
          break;
        }
      }

      assert(
        blockedRes &&
        blockedRes.status === 429 &&
        Boolean(blockedRes.headers.get('retry-after')) &&
        blockedRes.headers.get('x-ratelimit-limit') === '20',
        'Test 8: Batch revocation enforces 20 req/min rate limit with HTTP 429 and Retry-After header'
      );
    } catch (err) {
      assert(false, 'Test 8: Batch revocation rate limit check', err.message);
    }

    // ----------------------------------------------------
    // TEST 9: Batch Listing Rate Limiting (30 req/min)
    // ----------------------------------------------------
    try {
      let blockedRes = null;
      for (let i = 0; i < 35; i++) {
        const res = await fetch(`${BASE_URL}/api/batches`, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.status === 429) {
          blockedRes = res;
          break;
        }
      }

      assert(
        blockedRes &&
        blockedRes.status === 429 &&
        blockedRes.headers.get('x-ratelimit-limit') === '30',
        'Test 9: Batch listing enforces 30 req/min rate limit with HTTP 429'
      );
    } catch (err) {
      assert(false, 'Test 9: Batch list rate limit check', err.message);
    }

    // ----------------------------------------------------
    // TEST 10: Single Batch Detail Rate Limiting (60 req/min)
    // ----------------------------------------------------
    try {
      let blockedRes = null;
      for (let i = 0; i < 65; i++) {
        const res = await fetch(`${BASE_URL}/api/batches/TEST-BATCH-RES-01`, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.status === 429) {
          blockedRes = res;
          break;
        }
      }

      assert(
        blockedRes &&
        blockedRes.status === 429 &&
        blockedRes.headers.get('x-ratelimit-limit') === '60',
        'Test 10: Single batch detail query enforces 60 req/min rate limit with HTTP 429'
      );
    } catch (err) {
      assert(false, 'Test 10: Batch detail rate limit check', err.message);
    }

    // ----------------------------------------------------
    // TEST 11: Batch Anchor Update Rate Limiting (20 req/min)
    // ----------------------------------------------------
    try {
      let blockedRes = null;
      for (let i = 0; i < 25; i++) {
        const res = await fetch(`${BASE_URL}/api/batches/TEST-BATCH-RES-01`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': adminCookie,
            'Origin': BASE_URL,
          },
          body: JSON.stringify({
            txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.status === 429) {
          blockedRes = res;
          break;
        }
      }

      assert(
        blockedRes &&
        blockedRes.status === 429 &&
        blockedRes.headers.get('x-ratelimit-limit') === '20',
        'Test 11: Batch anchor update enforces 20 req/min rate limit with HTTP 429'
      );
    } catch (err) {
      assert(false, 'Test 11: Batch patch rate limit check', err.message);
    }

    // ----------------------------------------------------
    // TEST 12: Login Rate Limit Strictly Remains 10 req/min
    // ----------------------------------------------------
    try {
      // Prior Test 1 used 1 login attempt. Send 12 rapid login attempts to reach 10 limit.
      let blockedRes = null;
      for (let i = 0; i < 12; i++) {
        const res = await fetch(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': BASE_URL,
          },
          body: JSON.stringify({
            role: 'STUDENT',
            identifier: 'TEST-STUDENT-001',
            password: 'wrong_password',
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.status === 429) {
          blockedRes = res;
          break;
        }
      }

      assert(
        blockedRes &&
        blockedRes.status === 429 &&
        Boolean(blockedRes.headers.get('retry-after')) &&
        blockedRes.headers.get('x-ratelimit-limit') === '10',
        'Test 12: Existing login rate limit strictly preserved at 10 req/min with HTTP 429'
      );
    } catch (err) {
      assert(false, 'Test 12: Login rate limit check', err.message);
    }

    // ----------------------------------------------------
    // TEST 13: Trusted Proxy Spoofing Defense
    // ----------------------------------------------------
    try {
      // In local development without TRUST_PROXY set, passing a spoofed X-Forwarded-For must NOT bypass rate limits
      // The login limiter is already at capacity (429) on 127.0.0.1 from Test 12.
      // Attempt login with spoofed X-Forwarded-For: 203.0.113.195
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': BASE_URL,
          'X-Forwarded-For': '203.0.113.195',
          'CF-Connecting-IP': '203.0.113.195',
        },
        body: JSON.stringify({
          role: 'STUDENT',
          identifier: 'TEST-STUDENT-001',
          password: 'probe',
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      // Since proxy trust is not active, spoofed header is ignored and request remains 429 blocked on socket IP
      assert(
        res.status === 429,
        'Test 13: Spoofed X-Forwarded-For cannot bypass rate limits when proxy trust is inactive'
      );
    } catch (err) {
      assert(false, 'Test 13: Proxy spoofing defense check', err.message);
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
  console.log(`Resilience Test Suite Completed: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});

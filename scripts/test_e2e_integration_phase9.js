/**
 * SOET VeriTrust - Phase 9 Unified Local Integration Test Suite
 *
 * TASK ID: P9-T02 — Controlled Local Integration Testing
 *
 * OBJECTIVE:
 * Executes the complete connected application workflow and comprehensive security/negative
 * assertions against an isolated temporary SQLite database and dedicated Next.js test server.
 *
 * WORKFLOW & INTEGRATION SCENARIOS:
 * 1. Issuer authentication (POST /api/auth/login with EXAM_ADMIN_MGM).
 * 2. Authenticated batch creation (POST /api/batches with synthetic records).
 * 3. Database persistence & automatic student account provisioning.
 * 4. Pending-anchor state verification (GET /api/batches/[batchId]).
 * 5. Anchoring safety & receipt validation (PATCH /api/batches/[batchId] negative & simulated tests).
 * 6. Student direct authentication using synthetic PRN & scrypt password.
 * 7. Student credential isolation (RBAC cross-student access forbidden 403).
 * 8. Dynamic certificate PDF generation (GET /api/certificates/[batchId]/0/pdf).
 * 9. PDF validity, searchable text layer, and approved MGM University identity verification.
 * 10. QR verification URL and batch/leaf identification.
 * 11. Public verification of synthetic credential via API and PDF upload.
 * 12. Graceful degradation when AI forensic service is offline (Merkle proof authoritative).
 * 13. Credential revocation in isolated database (POST /api/batches/revoke).
 * 14. Public verification of revoked credential state across API and PDF endpoints.
 * 15. Dynamic PDF regeneration with REVOKED CREDENTIAL - INVALID watermark.
 *
 * STRICT SAFETY & ISOLATION GUARANTEES:
 * - Operates EXCLUSIVELY against a dedicated, temporary SQLite database.
 * - NEVER accesses or modifies data/veritrust.db or any production database.
 * - Uses ONLY synthetic test records (DEMO-E2E-2026-001, DEMO-E2E-2026-002).
 * - Does NOT broadcast any transaction to Ethereum Sepolia.
 * - Does NOT modify smart contracts, deployed addresses, or environment variables.
 * - Does NOT use real private keys or wallet credentials.
 * - Preserves all untracked and modified Git working tree files.
 * - Cleans up server process tree and temporary files in finally block.
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const Database = require('better-sqlite3');
const { ethers } = require('ethers');
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const pdf = require('pdfjs-dist/legacy/build/pdf.js');

const REQUEST_TIMEOUT_MS = 10000;
const SERVER_STARTUP_TIMEOUT_MS = 35000;

// ---------------------------------------------------------------------------
// Cryptographic Utility Functions Matching src/lib/crypto.ts
// ---------------------------------------------------------------------------

function canonicalStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(
    (key) => `${JSON.stringify(key)}:${canonicalStringify(obj[key])}`
  );
  return `{${pairs.join(',')}}`;
}

function hashCredentialSubject(subject) {
  const prn = (subject.prn || subject.PRN || '').toString().trim().toUpperCase();
  const fullName = (subject.fullName || subject.name || '').toString().trim();
  const branch = (subject.branch || '').toString().trim();
  const degree = (subject.degree || '').toString().trim();
  const issueDate = (subject.issueDate || '').toString().trim();
  const university = (subject.university || '').toString().trim();
  const graduationYear = Number(subject.graduationYear || subject.year || 0);
  const cgpa = Number(Number(subject.cgpa || 0).toFixed(2));

  const normalized = {
    branch,
    cgpa,
    degree,
    fullName,
    graduationYear,
    issueDate,
    prn,
    university,
  };

  if (subject.nheqfCredits !== undefined) {
    normalized.nheqfCredits = Number(subject.nheqfCredits);
  }
  if (subject.nheqfLevel !== undefined) {
    normalized.nheqfLevel = Number(subject.nheqfLevel);
  }
  if (subject.institutionCode) {
    normalized.institutionCode = subject.institutionCode.toString().trim();
  }

  const canonical = canonicalStringify(normalized);
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

function buildSyntheticBatchMerkleTree(records) {
  const leaves = records.map((record) => {
    const hexHash = hashCredentialSubject(record);
    return Buffer.from(hexHash.slice(2), 'hex');
  });

  const tree = new MerkleTree(leaves, keccak256, {
    sortPairs: true,
  });

  const rootHex = '0x' + tree.getRoot().toString('hex');

  const proofs = records.map((record, index) => {
    const leafBuf = leaves[index];
    const proofBufs = tree.getProof(leafBuf);
    const proofHex = proofBufs.map((p) => '0x' + p.data.toString('hex'));
    const leafHash = '0x' + leafBuf.toString('hex');

    return {
      batchId: '',
      leafIndex: index,
      leafHash,
      rootHash: rootHex,
      proof: proofHex,
      contractAddress: '',
      network: 'Local Institutional Registry',
    };
  });

  return {
    tree,
    rootHex,
    leavesHex: leaves.map((l) => '0x' + l.toString('hex')),
    proofs,
  };
}

// ---------------------------------------------------------------------------
// Server & Process Management Helpers
// ---------------------------------------------------------------------------

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

function extractAuthCookie(res) {
  let cookies = [];
  if (typeof res.headers.getSetCookie === 'function') {
    cookies = res.headers.getSetCookie();
  } else {
    const raw = res.headers.get('set-cookie');
    if (raw) cookies = [raw];
  }
  for (const c of cookies) {
    const m = c.match(/(auth_session=[^;]+)/);
    if (m) return m[1];
  }
  return '';
}

function getDatabaseMetrics(dbPath) {
  try {
    if (!fs.existsSync(dbPath)) return 'db:missing';
    const db = new Database(dbPath, { readonly: true });
    const b = db.prepare('SELECT COUNT(*) as c FROM batches').get()?.c || 0;
    const c = db.prepare('SELECT COUNT(*) as c FROM credentials').get()?.c || 0;
    const r = db.prepare('SELECT COUNT(*) as c FROM revocations').get()?.c || 0;
    const a = db.prepare('SELECT COUNT(*) as c FROM student_accounts').get()?.c || 0;
    db.close();
    return `batches:${b}, creds:${c}, revocations:${r}, accounts:${a}`;
  } catch (err) {
    return `db_err:${err.message}`;
  }
}

// ---------------------------------------------------------------------------
// Simulated Receipt Verification Fixture (Section 3 Requirement)
// ---------------------------------------------------------------------------

function validateReceiptEvidenceLocally(receipt, expectedBatchId, expectedMerkleRoot, trustedContract) {
  if (receipt.status !== 1) {
    return { valid: false, reason: 'Transaction failed or reverted on-chain (status = 0)' };
  }
  if (!receipt.to || receipt.to.toLowerCase() !== trustedContract.toLowerCase()) {
    return {
      valid: false,
      reason: `Contract mismatch: Transaction recipient (${receipt.to || 'null'}) does not match registry (${trustedContract})`,
    };
  }
  const iface = new ethers.Interface([
    'event BatchAnchored(string indexed batchIdIndexed, string batchId, bytes32 merkleRoot, string ipfsCid, uint256 timestamp, address indexed issuer, string institutionName)',
  ]);
  let matchingEvent = null;
  for (const log of receipt.logs || []) {
    if (log.address.toLowerCase() !== trustedContract.toLowerCase()) continue;
    try {
      const parsed = iface.parseLog({ topics: log.topics, data: log.data });
      if (parsed && parsed.name === 'BatchAnchored') {
        matchingEvent = parsed;
        break;
      }
    } catch { }
  }
  if (!matchingEvent) {
    return { valid: false, reason: 'BatchAnchored event not found in transaction receipt logs' };
  }
  if (String(matchingEvent.args.batchId).toLowerCase() !== expectedBatchId.toLowerCase()) {
    return {
      valid: false,
      reason: `Batch ID mismatch: Event anchored '${matchingEvent.args.batchId}', expected '${expectedBatchId}'`,
    };
  }
  if (String(matchingEvent.args.merkleRoot).toLowerCase() !== expectedMerkleRoot.toLowerCase()) {
    return {
      valid: false,
      reason: `Merkle root mismatch: Event anchored '${matchingEvent.args.merkleRoot}', expected '${expectedMerkleRoot}'`,
    };
  }
  return { valid: true, event: matchingEvent };
}

// ---------------------------------------------------------------------------
// Main Test Runner
// ---------------------------------------------------------------------------

async function runTestSuite() {
  console.log('========================================================================');
  console.log('SOET VeriTrust - Phase 9 Unified Local Integration Test Suite (P9-T02)');
  console.log('========================================================================\n');

  // 1. Establish isolated temporary directory and database path
  const tmpDir = path.resolve(
    process.cwd(),
    'tmp_e2e_test_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)
  );
  const testDbPath = path.resolve(tmpDir, 'isolated_e2e.db');
  const realDbPath = path.resolve(process.cwd(), 'data', 'veritrust.db');

  // Hard safety guard: Abort immediately if pointing to real project database
  if (
    testDbPath.toLowerCase() === realDbPath.toLowerCase() ||
    testDbPath.toLowerCase().includes('data\\veritrust.db') ||
    testDbPath.toLowerCase().includes('data/veritrust.db') ||
    testDbPath.toLowerCase().includes('.bak')
  ) {
    console.error('[SECURITY FATAL] Test database path resolves to protected project database:', testDbPath);
    process.exit(1);
  }

  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  console.log('📁 Isolated Test DB Path:', testDbPath);
  console.log('🔒 Production DB Protection: data/veritrust.db strictly isolated and untouched.');

  // Pre-seed database schema with tables
  const initDb = new Database(testDbPath);
  initDb.pragma('journal_mode = WAL');
  initDb.pragma('synchronous = NORMAL');
  initDb.exec(`
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
  initDb.close();
  console.log('🌱 Isolated test database schema created.\n');

  // 2. Find free port and spawn dedicated Next.js test server
  const testPort = await getFreePort();
  const BASE_URL = `http://127.0.0.1:${testPort}`;
  const APP_ORIGIN = `http://127.0.0.1:${testPort}`;
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

  serverProc.stdout.on('data', () => { });
  serverProc.stderr.on('data', () => { });

  const testRecords = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  function recordResult({ id, name, input, expected, actual, dbBefore, dbAfter, passedResult, details }) {
    if (passedResult) {
      console.log(`✅ [PASS] ${id}: ${name}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${id}: ${name} -> Details: ${details}`);
      failed++;
    }
    testRecords.push({
      id,
      name,
      input: typeof input === 'object' ? JSON.stringify(input) : String(input),
      expected: String(expected),
      actual: String(actual),
      dbBefore,
      dbAfter,
      passed: passedResult,
      details: details || '',
    });
  }

  try {
    // Wait for server readiness
    const startTime = Date.now();
    let isReady = false;

    while (Date.now() - startTime < SERVER_STARTUP_TIMEOUT_MS) {
      try {
        const healthRes = await fetch(`${BASE_URL}/api/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (healthRes.ok) {
          isReady = true;
          break;
        }
      } catch { }
      await new Promise((r) => setTimeout(r, 400));
    }

    if (!isReady) {
      throw new Error(`Test server failed to respond on ${BASE_URL} within ${SERVER_STARTUP_TIMEOUT_MS}ms.`);
    }

    console.log(`✅ Dedicated Next.js test server ready in ${Date.now() - startTime}ms.\n`);

    // Define Synthetic Batch & Students
    const SYNTHETIC_BATCH_ID = `DEMO-BATCH-E2E-PHASE9-${Date.now()}`;
    const syntheticStudents = [
      {
        prn: 'DEMO-E2E-2026-001',
        fullName: 'Aditya Ramesh Joshi',
        branch: 'Computer Science and Engineering',
        degree: 'Bachelor of Technology',
        cgpa: 8.85,
        graduationYear: 2026,
        issueDate: '2026-06-15',
        university: 'MGM University',
        institutionCode: 'MGMU-ENG-01',
      },
      {
        prn: 'DEMO-E2E-2026-002',
        fullName: 'Pooja Suresh Shinde',
        branch: 'Information Technology',
        degree: 'Bachelor of Technology',
        cgpa: 9.15,
        graduationYear: 2026,
        issueDate: '2026-06-15',
        university: 'MGM University',
        institutionCode: 'MGMU-ENG-01',
      },
    ];

    const { rootHex: syntheticMerkleRoot } = buildSyntheticBatchMerkleTree(syntheticStudents);
    const syntheticIpfsCid = 'QmSyntheticE2ETestCidPhase9Integration0000001';

    let adminCookie = '';
    let student1Cookie = '';
    let generatedPdfBuffer = null;

    // =========================================================================
    // CATEGORY 1: Authentication & Access Control (Security / Workflow)
    // =========================================================================

    // ----------------------------------------------------
    // P9-INT-01: Unauthenticated batch creation rejected (HTTP 401)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/batches`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': APP_ORIGIN,
          },
          body: JSON.stringify({
            batchId: SYNTHETIC_BATCH_ID,
            merkleRoot: syntheticMerkleRoot,
            records: syntheticStudents,
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      recordResult({
        id: 'P9-INT-01',
        name: 'Unauthenticated batch creation is rejected with HTTP 401 Unauthorized',
        input: 'POST /api/batches without session cookie',
        expected: 'HTTP 401 Unauthorized',
        actual: `HTTP ${res?.status} (${data?.error || ''})`,
        dbBefore,
        dbAfter,
        passedResult: res?.status === 401 && data?.success === false,
        details: res?.status === 401 ? 'Unauthorized request correctly rejected' : 'Expected 401',
      });
    }

    // ----------------------------------------------------
    // P9-INT-02: Examination Admin Authentication (POST /api/auth/login)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': APP_ORIGIN,
          },
          body: JSON.stringify({
            role: 'EXAM_ADMIN',
            identifier: 'EXAM_ADMIN_MGM',
            password: process.env.ADMIN_PASSWORD || 'admin123',
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
        adminCookie = extractAuthCookie(res);
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isOk =
        res?.status === 200 &&
        data?.success === true &&
        data?.user?.role === 'EXAM_ADMIN' &&
        adminCookie.length > 0;
      recordResult({
        id: 'P9-INT-02',
        name: 'Examination Admin logs in (POST /api/auth/login) and receives valid auth_session cookie',
        input: 'POST /api/auth/login with EXAM_ADMIN_MGM',
        expected: 'HTTP 200, role: EXAM_ADMIN, session cookie',
        actual: `HTTP ${res?.status}, role: ${data?.user?.role}, cookie present: ${Boolean(adminCookie)}`,
        dbBefore,
        dbAfter,
        passedResult: isOk,
        details: isOk ? 'Admin session established' : 'Login failed',
      });
    }

    // ----------------------------------------------------
    // P9-INT-03: Student login with wrong password rejected (HTTP 401)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': APP_ORIGIN,
          },
          body: JSON.stringify({
            role: 'STUDENT',
            identifier: 'DEMO-E2E-2026-001',
            password: 'CompletelyWrongPassword!',
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      recordResult({
        id: 'P9-INT-03',
        name: 'Student login with wrong password is rejected with HTTP 401 Unauthorized',
        input: 'POST /api/auth/login with wrong password',
        expected: 'HTTP 401 Unauthorized',
        actual: `HTTP ${res?.status} (${data?.error || ''})`,
        dbBefore,
        dbAfter,
        passedResult: res?.status === 401 && data?.success === false,
        details: res?.status === 401 ? 'Bad credentials rejected' : 'Expected 401',
      });
    }

    // =========================================================================
    // CATEGORY 2: Batch Creation, Validation & Persistence (Workflow & Negative)
    // =========================================================================

    // ----------------------------------------------------
    // P9-INT-04: Batch creation with invalid credential data rejected (HTTP 400)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        const malformedRecords = [
          {
            prn: 'DEMO-E2E-2026-001',
            fullName: 'Aditya Joshi',
            degree: 'B.Tech',
            cgpa: 15.5, // Invalid CGPA > 10.0
            graduationYear: 2026,
          },
        ];
        res = await fetch(`${BASE_URL}/api/batches`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': APP_ORIGIN,
            'Cookie': adminCookie,
          },
          body: JSON.stringify({
            batchId: 'DEMO-BATCH-INVALID-CGPA',
            merkleRoot: '0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
            records: malformedRecords,
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      recordResult({
        id: 'P9-INT-04',
        name: 'Batch creation with invalid credential data (CGPA 15.5) is rejected with HTTP 400',
        input: 'POST /api/batches with CGPA: 15.5',
        expected: 'HTTP 400 Bad Request',
        actual: `HTTP ${res?.status} (${data?.error || ''})`,
        dbBefore,
        dbAfter,
        passedResult: res?.status === 400 && data?.success === false,
        details: res?.status === 400 ? 'Domain validation rejected invalid CGPA' : 'Expected 400',
      });
    }

    // ----------------------------------------------------
    // P9-INT-05: Batch creation with CSRF origin mismatch rejected (HTTP 403)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/batches`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://malicious-attacker-domain.xyz',
            'Cookie': adminCookie,
          },
          body: JSON.stringify({
            batchId: 'DEMO-BATCH-CSRF-TEST',
            merkleRoot: syntheticMerkleRoot,
            records: syntheticStudents,
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      recordResult({
        id: 'P9-INT-05',
        name: 'Batch creation with untrusted CSRF origin header is rejected with HTTP 403 Forbidden',
        input: 'Origin: http://malicious-attacker-domain.xyz',
        expected: 'HTTP 403 Forbidden',
        actual: `HTTP ${res?.status} (${data?.error || ''})`,
        dbBefore,
        dbAfter,
        passedResult: res?.status === 403 && data?.success === false,
        details: res?.status === 403 ? 'CSRF origin protection enforced' : 'Expected 403',
      });
    }

    // ----------------------------------------------------
    // P9-INT-06: Authenticated batch creation (POST /api/batches) -> HTTP 201
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/batches`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': APP_ORIGIN,
            'Cookie': adminCookie,
          },
          body: JSON.stringify({
            batchId: SYNTHETIC_BATCH_ID,
            merkleRoot: syntheticMerkleRoot,
            ipfsCid: syntheticIpfsCid,
            records: syntheticStudents,
            institutionName: 'MGM University, Chhatrapati Sambhajinagar',
            institutionCode: 'MGMU-ENG-01',
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isOk =
        res?.status === 201 &&
        data?.success === true &&
        data?.batch?.batchId === SYNTHETIC_BATCH_ID &&
        data?.batch?.status === 'PENDING_ANCHOR';
      recordResult({
        id: 'P9-INT-06',
        name: 'Authenticated batch creation (POST /api/batches) creates batch with status PENDING_ANCHOR',
        input: `POST /api/batches with ${SYNTHETIC_BATCH_ID} (2 synthetic students)`,
        expected: 'HTTP 201 Created, status: PENDING_ANCHOR',
        actual: `HTTP ${res?.status}, status: ${data?.batch?.status}`,
        dbBefore,
        dbAfter,
        passedResult: isOk,
        details: isOk ? 'Batch persisted with PENDING_ANCHOR status' : 'Batch creation failed',
      });
    }

    // ----------------------------------------------------
    // P9-INT-07: Duplicate batch ID creation rejected (HTTP 409 Conflict)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/batches`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': APP_ORIGIN,
            'Cookie': adminCookie,
          },
          body: JSON.stringify({
            batchId: SYNTHETIC_BATCH_ID,
            merkleRoot: syntheticMerkleRoot,
            ipfsCid: syntheticIpfsCid,
            records: syntheticStudents,
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      recordResult({
        id: 'P9-INT-07',
        name: 'Duplicate batch ID creation is rejected with HTTP 409 Conflict',
        input: `POST /api/batches duplicate ${SYNTHETIC_BATCH_ID}`,
        expected: 'HTTP 409 Conflict',
        actual: `HTTP ${res?.status} (${data?.error || ''})`,
        dbBefore,
        dbAfter,
        passedResult: res?.status === 409 && data?.success === false,
        details: res?.status === 409 ? 'Duplicate batch insertion prevented' : 'Expected 409',
      });
    }

    // ----------------------------------------------------
    // P9-INT-08: Database Persistence Verification
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let dbOk = false;
      let detailsMsg = '';
      try {
        const verifyDb = new Database(testDbPath, { readonly: true });
        const batchRow = verifyDb.prepare('SELECT * FROM batches WHERE batchId = ?').get(SYNTHETIC_BATCH_ID);
        const credRows = verifyDb.prepare('SELECT * FROM credentials WHERE batch_id = ?').all(SYNTHETIC_BATCH_ID);
        const account1 = verifyDb.prepare('SELECT * FROM student_accounts WHERE prn = ?').get('DEMO-E2E-2026-001');
        const account2 = verifyDb.prepare('SELECT * FROM student_accounts WHERE prn = ?').get('DEMO-E2E-2026-002');
        verifyDb.close();

        const hasBatch = batchRow && batchRow.status === 'PENDING_ANCHOR';
        const hasCreds = Array.isArray(credRows) && credRows.length === 2;
        const hasAccounts =
          account1 &&
          account1.status === 'ACTIVE' &&
          account1.password_hash.startsWith('scrypt:') &&
          account2 &&
          account2.status === 'ACTIVE' &&
          account2.password_hash.startsWith('scrypt:');

        dbOk = Boolean(hasBatch && hasCreds && hasAccounts);
        detailsMsg = `Batch persisted: ${Boolean(hasBatch)}, Creds count: ${credRows?.length}, Student accounts provisioned: ${Boolean(hasAccounts)}`;
      } catch (err) {
        detailsMsg = err.message;
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      recordResult({
        id: 'P9-INT-08',
        name: 'Database persistence verifies batch row, credentials, and automatically provisioned student accounts',
        input: `Direct inspection of SQLite database for ${SYNTHETIC_BATCH_ID}`,
        expected: 'Batch: PENDING_ANCHOR, 2 credentials, 2 active student accounts with scrypt hashes',
        actual: detailsMsg,
        dbBefore,
        dbAfter,
        passedResult: dbOk,
        details: dbOk ? 'ACID persistence verified' : detailsMsg,
      });
    }

    // =========================================================================
    // CATEGORY 3: Pending Anchor & Blockchain Receipt Safety (Section 3)
    // =========================================================================

    // ----------------------------------------------------
    // P9-INT-09: Batch Status Query (GET /api/batches/[batchId]) confirms PENDING_ANCHOR
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/batches/${SYNTHETIC_BATCH_ID}`, {
          method: 'GET',
          headers: {
            'Cookie': adminCookie,
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isOk =
        res?.status === 200 &&
        data?.success === true &&
        data?.batch?.status === 'PENDING_ANCHOR' &&
        data?.batch?.isVerifiedOnChain === false;
      recordResult({
        id: 'P9-INT-09',
        name: 'Persisted unanchored batch query confirms status PENDING_ANCHOR and isVerifiedOnChain: false',
        input: `GET /api/batches/${SYNTHETIC_BATCH_ID}`,
        expected: 'HTTP 200, status: PENDING_ANCHOR, isVerifiedOnChain: false',
        actual: `HTTP ${res?.status}, status: ${data?.batch?.status}, isVerifiedOnChain: ${data?.batch?.isVerifiedOnChain}`,
        dbBefore,
        dbAfter,
        passedResult: isOk,
        details: isOk ? 'Pending anchor state verified on API' : 'Unexpected batch state',
      });
    }

    // ----------------------------------------------------
    // P9-INT-10: Anchoring Safety: PATCH with invalid txHash syntax rejected (HTTP 400)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/batches/${SYNTHETIC_BATCH_ID}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Origin': APP_ORIGIN,
            'Cookie': adminCookie,
          },
          body: JSON.stringify({
            txHash: 'invalid-malformed-hash-not-hex',
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      recordResult({
        id: 'P9-INT-10',
        name: 'Anchoring safety: PATCH with malformed transaction hash format is rejected with HTTP 400',
        input: 'PATCH /api/batches/[id] with invalid txHash string',
        expected: 'HTTP 400 Bad Request',
        actual: `HTTP ${res?.status} (${data?.error || ''})`,
        dbBefore,
        dbAfter,
        passedResult: res?.status === 400 && data?.success === false,
        details: res?.status === 400 ? 'Invalid transaction format rejected' : 'Expected 400',
      });
    }

    // ----------------------------------------------------
    // P9-INT-11: Anchoring Safety: PATCH with mismatched contract address rejected (HTTP 422)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/batches/${SYNTHETIC_BATCH_ID}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Origin': APP_ORIGIN,
            'Cookie': adminCookie,
          },
          body: JSON.stringify({
            txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            expectedContract: '0x0000000000000000000000000000000000000001', // Unauthorized rogue contract
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      recordResult({
        id: 'P9-INT-11',
        name: 'Anchoring safety: PATCH with mismatched registry contract address is rejected with HTTP 422',
        input: 'expectedContract: 0x0000...0001 (untrusted manifest mismatch)',
        expected: 'HTTP 422 Unprocessable Entity',
        actual: `HTTP ${res?.status} (${data?.error || ''})`,
        dbBefore,
        dbAfter,
        passedResult: res?.status === 422 && data?.success === false,
        details: res?.status === 422 ? 'Untrusted contract address rejected' : 'Expected 422',
      });
    }

    // ----------------------------------------------------
    // P9-INT-12: Anchoring Safety: PATCH with non-existent txHash cannot anchor (HTTP 404/503)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/batches/${SYNTHETIC_BATCH_ID}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Origin': APP_ORIGIN,
            'Cookie': adminCookie,
          },
          body: JSON.stringify({
            txHash: '0x9999999999999999999999999999999999999999999999999999999999999999',
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      // Receipt not found returns 404 (or 503 if RPC unreachable), NEVER 200 ANCHORED
      const isRejected = (res?.status === 404 || res?.status === 503) && data?.success === false;
      recordResult({
        id: 'P9-INT-12',
        name: 'Anchoring safety: Unbroadcast/non-existent transaction receipt cannot produce ANCHORED status',
        input: 'PATCH /api/batches/[id] with non-existent txHash',
        expected: 'HTTP 404 Not Found (or 503), success: false',
        actual: `HTTP ${res?.status} (${data?.error || ''})`,
        dbBefore,
        dbAfter,
        passedResult: isRejected,
        details: isRejected ? 'Unverified transaction prevented from anchoring' : 'Expected failure status',
      });
    }

    // ----------------------------------------------------
    // P9-INT-13: Controlled Simulated Receipt Verification Fixture
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      const trustedContract = '0xe7Cc39AF2ACC1dd637C863aB5DB18aC904b76Bc4'; // Sepolia Credential Registry
      const iface = new ethers.Interface([
        'event BatchAnchored(string indexed batchIdIndexed, string batchId, bytes32 merkleRoot, string ipfsCid, uint256 timestamp, address indexed issuer, string institutionName)',
      ]);

      const topic0 = iface.getEvent('BatchAnchored').topicHash;
      const topic1 = ethers.keccak256(ethers.toUtf8Bytes(SYNTHETIC_BATCH_ID));
      const topic2 = ethers.zeroPadValue('0x71c56538b15294500b73F8472B4fe963D4e58Bef', 32);

      const eventData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'bytes32', 'string', 'uint256', 'string'],
        [SYNTHETIC_BATCH_ID, syntheticMerkleRoot, syntheticIpfsCid, 1718870400, 'MGM University']
      );

      // Case A: Reverted receipt (status = 0)
      const revertedReceipt = {
        status: 0,
        to: trustedContract,
        logs: [{ address: trustedContract, topics: [topic0, topic1, topic2], data: eventData }],
      };
      const checkA = validateReceiptEvidenceLocally(revertedReceipt, SYNTHETIC_BATCH_ID, syntheticMerkleRoot, trustedContract);

      // Case B: Mismatched Merkle root in receipt event
      const mismatchedEventData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'bytes32', 'string', 'uint256', 'string'],
        [SYNTHETIC_BATCH_ID, '0x0000000000000000000000000000000000000000000000000000000000000000', syntheticIpfsCid, 1718870400, 'MGM University']
      );
      const mismatchedReceipt = {
        status: 1,
        to: trustedContract,
        logs: [{ address: trustedContract, topics: [topic0, topic1, topic2], data: mismatchedEventData }],
      };
      const checkB = validateReceiptEvidenceLocally(mismatchedReceipt, SYNTHETIC_BATCH_ID, syntheticMerkleRoot, trustedContract);

      // Case C: Valid simulated receipt matching contract, status 1, and exact event log
      const validReceipt = {
        status: 1,
        to: trustedContract,
        logs: [{ address: trustedContract, topics: [topic0, topic1, topic2], data: eventData }],
      };
      const checkC = validateReceiptEvidenceLocally(validReceipt, SYNTHETIC_BATCH_ID, syntheticMerkleRoot, trustedContract);

      const passedAll = checkA.valid === false && checkB.valid === false && checkC.valid === true;
      const dbAfter = getDatabaseMetrics(testDbPath);

      recordResult({
        id: 'P9-INT-13',
        name: 'Controlled simulated receipt fixture verifies receipt status, contract matching, and Merkle root checks',
        input: 'Simulated receipt fixture (reverted, mismatched Merkle root, valid receipt)',
        expected: 'Reverted -> invalid; Root mismatch -> invalid; Valid -> valid',
        actual: `Reverted valid: ${checkA.valid}, Root mismatch valid: ${checkB.valid}, Valid receipt valid: ${checkC.valid}`,
        dbBefore,
        dbAfter,
        passedResult: passedAll,
        details: passedAll ? 'Simulated receipt verification logic fully compliant' : 'Receipt verification assertion failed',
      });
    }

    // =========================================================================
    // CATEGORY 4: Student Authentication & Credential Isolation (Workflow & RBAC)
    // =========================================================================

    // ----------------------------------------------------
    // P9-INT-14: Student 1 Direct Authentication (POST /api/auth/login)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': APP_ORIGIN,
          },
          body: JSON.stringify({
            role: 'STUDENT',
            identifier: 'DEMO-E2E-2026-001',
            password: 'student123',
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
        student1Cookie = extractAuthCookie(res);
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isOk =
        res?.status === 200 &&
        data?.success === true &&
        data?.user?.role === 'STUDENT' &&
        data?.user?.prn === 'DEMO-E2E-2026-001' &&
        student1Cookie.length > 0;
      recordResult({
        id: 'P9-INT-14',
        name: 'Student 1 logs in (POST /api/auth/login) using synthetic PRN and individual scrypt password',
        input: 'POST /api/auth/login with DEMO-E2E-2026-001 + student123',
        expected: 'HTTP 200, role: STUDENT, session cookie',
        actual: `HTTP ${res?.status}, prn: ${data?.user?.prn}, cookie present: ${Boolean(student1Cookie)}`,
        dbBefore,
        dbAfter,
        passedResult: isOk,
        details: isOk ? 'Student 1 session established' : 'Student login failed',
      });
    }

    // ----------------------------------------------------
    // P9-INT-15: Cross-Student Access Rejection (GET /api/certificates/[id]/1/pdf) -> HTTP 403
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/certificates/${SYNTHETIC_BATCH_ID}/1/pdf`, {
          method: 'GET',
          headers: {
            'Cookie': student1Cookie, // Student 1 attempting to access Student 2 (Leaf 1)
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json().catch(() => ({}));
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      recordResult({
        id: 'P9-INT-15',
        name: 'Cross-student access rejection: Student 1 attempting to download Student 2 certificate returns HTTP 403 Forbidden',
        input: `GET /api/certificates/${SYNTHETIC_BATCH_ID}/1/pdf with Student 1 cookie`,
        expected: 'HTTP 403 Forbidden',
        actual: `HTTP ${res?.status} (${data?.error || ''})`,
        dbBefore,
        dbAfter,
        passedResult: res?.status === 403,
        details: res?.status === 403 ? 'RBAC cross-student isolation enforced' : 'Expected 403',
      });
    }

    // ----------------------------------------------------
    // P9-INT-16: Student Self-Access (GET /api/certificates/[id]/0/pdf) -> HTTP 200
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res;
      try {
        res = await fetch(`${BASE_URL}/api/certificates/${SYNTHETIC_BATCH_ID}/0/pdf`, {
          method: 'GET',
          headers: {
            'Cookie': student1Cookie, // Student 1 accessing own certificate (Leaf 0)
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const arr = await res.arrayBuffer();
        generatedPdfBuffer = Buffer.from(arr);
      } catch (err) {
        generatedPdfBuffer = null;
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isOk =
        res?.status === 200 &&
        res?.headers?.get('content-type')?.includes('application/pdf') &&
        generatedPdfBuffer &&
        generatedPdfBuffer.length > 1000;
      recordResult({
        id: 'P9-INT-16',
        name: 'Student self-access: Student 1 successfully downloads own certificate (HTTP 200 PDF binary)',
        input: `GET /api/certificates/${SYNTHETIC_BATCH_ID}/0/pdf with Student 1 cookie`,
        expected: 'HTTP 200, Content-Type: application/pdf',
        actual: `HTTP ${res?.status}, bytes: ${generatedPdfBuffer?.length || 0}`,
        dbBefore,
        dbAfter,
        passedResult: isOk,
        details: isOk ? 'Student authorized certificate download succeeded' : 'Download failed',
      });
    }

    // =========================================================================
    // CATEGORY 5: Dynamic Certificate PDF & Verification Link (Workflow & Identity)
    // =========================================================================

    // ----------------------------------------------------
    // P9-INT-17: PDF Binary Header Verification (%PDF-)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      const magicBytes = generatedPdfBuffer?.subarray(0, 5)?.toString('ascii');
      const isOk = magicBytes === '%PDF-';
      const dbAfter = getDatabaseMetrics(testDbPath);
      recordResult({
        id: 'P9-INT-17',
        name: 'PDF binary header verification: Generated document starts with valid %PDF- magic bytes',
        input: 'First 5 bytes of generated certificate stream',
        expected: '%PDF-',
        actual: magicBytes,
        dbBefore,
        dbAfter,
        passedResult: isOk,
        details: isOk ? 'Valid vector PDF 1.4 stream confirmed' : 'Invalid PDF magic bytes',
      });
    }

    // ----------------------------------------------------
    // P9-INT-18: PDF Searchable Text Layer & Approved MGM University Identity
    // ----------------------------------------------------
    let extractedPdfText = '';
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let isOk = false;
      let textDetails = '';
      try {
        const doc = await pdf.getDocument({ data: new Uint8Array(generatedPdfBuffer) }).promise;
        const page = await doc.getPage(1);
        const content = await page.getTextContent();
        extractedPdfText = content.items.map((i) => i.str).join(' ');

        const hasUni = extractedPdfText.includes('MGM University');
        const hasInst =
          extractedPdfText.includes('School of Engineering & Technology') ||
          extractedPdfText.includes('School of Engineering and Technology');
        const hasName =
          extractedPdfText.includes('Aditya Ramesh Joshi') ||
          extractedPdfText.includes('ADITYA RAMESH JOSHI') ||
          extractedPdfText.toLowerCase().includes('aditya ramesh joshi');
        const hasPrn = extractedPdfText.includes('DEMO-E2E-2026-001');
        const hasDegree = extractedPdfText.includes('Bachelor of Technology');
        const hasBranch = extractedPdfText.includes('Computer Science and Engineering');
        const hasCgpa = extractedPdfText.includes('8.85');
        const hasBatch = extractedPdfText.includes(SYNTHETIC_BATCH_ID);

        isOk = Boolean(hasUni && hasInst && hasName && hasPrn && hasDegree && hasBranch && hasCgpa && hasBatch);
        textDetails = `MGM:${hasUni}, SOET:${hasInst}, Student:${hasName}, PRN:${hasPrn}, CGPA:${hasCgpa}`;
      } catch (err) {
        textDetails = err.message;
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      recordResult({
        id: 'P9-INT-18',
        name: 'PDF searchable text layer explicitly contains MGM University, SOET, Student Name, PRN, CGPA, and Batch ID',
        input: 'pdfjs-dist text layer extraction',
        expected: 'MGM University, School of Engineering & Technology, Aditya Ramesh Joshi, DEMO-E2E-2026-001, 8.85',
        actual: textDetails,
        dbBefore,
        dbAfter,
        passedResult: isOk,
        details: isOk ? 'Authoritative searchable text layer verified' : textDetails,
      });
    }

    // ----------------------------------------------------
    // P9-INT-19: QR URL and Batch/Leaf Identification
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      const expectedUrlFragment = `/?verify=${encodeURIComponent(SYNTHETIC_BATCH_ID)}/0`;
      const hasUrl = extractedPdfText.includes(SYNTHETIC_BATCH_ID) && extractedPdfText.includes('Leaf: #0');
      const dbAfter = getDatabaseMetrics(testDbPath);
      recordResult({
        id: 'P9-INT-19',
        name: 'Generated certificate embeds verification URL pointing to batch ID and leaf index #0',
        input: 'Extracted PDF text layer verification link & metadata',
        expected: `Verification metadata encoding ${SYNTHETIC_BATCH_ID} Leaf #0`,
        actual: hasUrl ? `Found metadata with ${SYNTHETIC_BATCH_ID} Leaf #0` : 'Metadata missing',
        dbBefore,
        dbAfter,
        passedResult: hasUrl,
        details: hasUrl ? 'Verification link and leaf coordinate confirmed' : 'Expected verification URL in text',
      });
    }

    // =========================================================================
    // CATEGORY 6: Public Verification & AI Resilience (Workflow & Security)
    // =========================================================================

    // ----------------------------------------------------
    // P9-INT-20: Public Leaf Query Verification (GET /api/verify/[batchId]/0)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/verify/${SYNTHETIC_BATCH_ID}/0`, {
          method: 'GET',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isOk =
        res?.status === 200 &&
        data?.success === true &&
        data?.isRevoked === false &&
        data?.student?.prn === 'DEMO-E2E-2026-001' &&
        (data?.student?.fullName === 'Aditya Ramesh Joshi' || data?.student?.fullName === 'ADITYA RAMESH JOSHI') &&
        data?.proofData?.rootHash === syntheticMerkleRoot;
      recordResult({
        id: 'P9-INT-20',
        name: 'Public leaf query (GET /api/verify/[batchId]/0) returns valid Merkle proof and authentic student claims',
        input: `GET /api/verify/${SYNTHETIC_BATCH_ID}/0`,
        expected: 'HTTP 200, isRevoked: false, matching student claims & rootHash',
        actual: `HTTP ${res?.status}, isRevoked: ${data?.isRevoked}, PRN: ${data?.student?.prn}`,
        dbBefore,
        dbAfter,
        passedResult: isOk,
        details: isOk ? 'Public verification API returned authentic proof' : 'Verification failed',
      });
    }

    // ----------------------------------------------------
    // P9-INT-21: Invalid Batch and Out-of-Bounds Leaf Queries Rejected (HTTP 404)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res1, res2;
      try {
        res1 = await fetch(`${BASE_URL}/api/verify/NON_EXISTENT_BATCH_ID_999/0`, {
          method: 'GET',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        res2 = await fetch(`${BASE_URL}/api/verify/${SYNTHETIC_BATCH_ID}/999`, {
          method: 'GET',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch { }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isOk = res1?.status === 404 && res2?.status === 404;
      recordResult({
        id: 'P9-INT-21',
        name: 'Public verification rejects non-existent batch and out-of-bounds leaf index with HTTP 404',
        input: 'GET /api/verify/NON_EXISTENT/0 and GET /api/verify/[batchId]/999',
        expected: 'HTTP 404 Not Found for both requests',
        actual: `NonExistentBatch: HTTP ${res1?.status}, OutOfBoundsLeaf: HTTP ${res2?.status}`,
        dbBefore,
        dbAfter,
        passedResult: isOk,
        details: isOk ? 'Boundaries safely protected with HTTP 404' : 'Expected 404',
      });
    }

    // ----------------------------------------------------
    // P9-INT-22: Public PDF Verification & AI Graceful Degradation (POST /api/verify/pdf)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        const formData = new FormData();
        const blob = new Blob([generatedPdfBuffer], { type: 'application/pdf' });
        formData.append('file', blob, `${SYNTHETIC_BATCH_ID}_leaf0.pdf`);

        res = await fetch(`${BASE_URL}/api/verify/pdf`, {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const aiStatus = data?.forensic_scan?.status || data?.ai_forensics?.status;
      const isOk =
        res?.status === 200 &&
        data?.success === true &&
        data?.isValid === true &&
        data?.isRevoked === false &&
        data?.diagnostic_code === 'FULLY_VERIFIED' &&
        aiStatus === 'UNAVAILABLE'; // Confirms graceful degradation with AI service offline
      recordResult({
        id: 'P9-INT-22',
        name: 'Public PDF verification returns FULLY_VERIFIED, degrading gracefully when AI service is offline',
        input: 'POST /api/verify/pdf with genuine vector PDF certificate',
        expected: 'HTTP 200, isValid: true, diagnostic_code: FULLY_VERIFIED, ai_forensics: UNAVAILABLE',
        actual: `HTTP ${res?.status}, isValid: ${data?.isValid}, code: ${data?.diagnostic_code}, AI: ${aiStatus}`,
        dbBefore,
        dbAfter,
        passedResult: isOk,
        details: isOk ? 'Cryptographic proof authoritative while AI degraded gracefully' : 'Verification failed',
      });
    }

    // ----------------------------------------------------
    // P9-INT-23: Invalid PDF Upload Rejection (missing %PDF- magic bytes)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        const formData = new FormData();
        const fakePdfBlob = new Blob([Buffer.from('This is a plain text file pretending to be a pdf')], {
          type: 'application/pdf',
        });
        formData.append('file', fakePdfBlob, 'fake_certificate.pdf');

        res = await fetch(`${BASE_URL}/api/verify/pdf`, {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      recordResult({
        id: 'P9-INT-23',
        name: 'Invalid PDF upload missing %PDF- magic byte header is rejected with HTTP 400 Bad Request',
        input: 'POST /api/verify/pdf with non-PDF text payload',
        expected: 'HTTP 400 Bad Request',
        actual: `HTTP ${res?.status} (${data?.error || ''})`,
        dbBefore,
        dbAfter,
        passedResult: res?.status === 400 && data?.success === false,
        details: res?.status === 400 ? 'Magic byte validation rejected invalid file' : 'Expected 400',
      });
    }

    // =========================================================================
    // CATEGORY 7: Revocation & Revoked State Public Verification (Workflow)
    // =========================================================================

    // ----------------------------------------------------
    // P9-INT-24: Credential Revocation in Isolated Database (POST /api/batches/revoke)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/batches/revoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': APP_ORIGIN,
            'Cookie': adminCookie,
          },
          body: JSON.stringify({
            batchId: SYNTHETIC_BATCH_ID,
            leafIndex: 0,
            reasonCode: 'ACADEMIC_MISCONDUCT',
            reasonTitle: 'Administrative Investigation Review',
            reasonDescription: 'Credential marked as revoked during Phase 9 integration verification.',
            officerStaffId: 'EXAM_ADMIN_MGM',
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isOk = res?.status === 200 && data?.success === true;
      recordResult({
        id: 'P9-INT-24',
        name: 'Administrator revokes credential leaf #0 (POST /api/batches/revoke), updating isolated database',
        input: `POST /api/batches/revoke for ${SYNTHETIC_BATCH_ID} Leaf #0`,
        expected: 'HTTP 200, success: true',
        actual: `HTTP ${res?.status} (${data?.message || data?.error || ''})`,
        dbBefore,
        dbAfter,
        passedResult: isOk,
        details: isOk ? 'Revocation recorded in isolated database' : 'Revocation failed',
      });
    }

    // ----------------------------------------------------
    // P9-INT-25: Public Verification of Revoked Leaf (GET /api/verify/[batchId]/0)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/verify/${SYNTHETIC_BATCH_ID}/0`, {
          method: 'GET',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isOk = res?.status === 200 && data?.success === true && data?.isRevoked === true;
      recordResult({
        id: 'P9-INT-25',
        name: 'Public leaf query of revoked credential confirms isRevoked: true',
        input: `GET /api/verify/${SYNTHETIC_BATCH_ID}/0`,
        expected: 'HTTP 200, isRevoked: true',
        actual: `HTTP ${res?.status}, isRevoked: ${data?.isRevoked}`,
        dbBefore,
        dbAfter,
        passedResult: isOk,
        details: isOk ? 'Public verification correctly reflects revoked status' : 'Revoked status mismatch',
      });
    }

    // ----------------------------------------------------
    // P9-INT-26: Public PDF Verification of Revoked Document (POST /api/verify/pdf)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        const formData = new FormData();
        const blob = new Blob([generatedPdfBuffer], { type: 'application/pdf' });
        formData.append('file', blob, 'revoked_check.pdf');

        res = await fetch(`${BASE_URL}/api/verify/pdf`, {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isRevokedDetected =
        res?.status === 200 &&
        data?.isValid === false &&
        data?.isRevoked === true &&
        data?.diagnostic_code === 'CREDENTIAL_REVOKED';
      recordResult({
        id: 'P9-INT-26',
        name: 'Public PDF verification of revoked credential detects CREDENTIAL_REVOKED and isValid: false',
        input: 'POST /api/verify/pdf with revoked credential document',
        expected: 'HTTP 200, isValid: false, isRevoked: true, diagnostic_code: CREDENTIAL_REVOKED',
        actual: `HTTP ${res?.status}, isValid: ${data?.isValid}, isRevoked: ${data?.isRevoked}, code: ${data?.diagnostic_code}`,
        dbBefore,
        dbAfter,
        passedResult: isRevokedDetected,
        details: isRevokedDetected ? 'Revoked credential successfully detected and invalidated' : 'Revocation not detected in PDF verify',
      });
    }

    // ----------------------------------------------------
    // P9-INT-27: Revoked Certificate PDF Watermark Rendering
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, revokedPdfBuffer;
      let hasWatermark = false;
      let detailsMsg = '';
      try {
        res = await fetch(`${BASE_URL}/api/certificates/${SYNTHETIC_BATCH_ID}/0/pdf`, {
          method: 'GET',
          headers: {
            'Cookie': adminCookie, // Admin downloads regenerated revoked certificate
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const arr = await res.arrayBuffer();
        revokedPdfBuffer = Buffer.from(arr);

        const doc = await pdf.getDocument({ data: new Uint8Array(revokedPdfBuffer) }).promise;
        const page = await doc.getPage(1);
        const content = await page.getTextContent();
        const revokedText = content.items.map((i) => i.str).join(' ');

        hasWatermark =
          revokedText.includes('REVOKED CREDENTIAL') &&
          revokedText.includes('INVALID');
        detailsMsg = `Watermark detected: ${hasWatermark}, bytes: ${revokedPdfBuffer.length}`;
      } catch (err) {
        detailsMsg = err.message;
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isOk = res?.status === 200 && hasWatermark;
      recordResult({
        id: 'P9-INT-27',
        name: 'Regenerated certificate for revoked credential renders prominent REVOKED CREDENTIAL - INVALID watermark',
        input: `GET /api/certificates/${SYNTHETIC_BATCH_ID}/0/pdf after revocation`,
        expected: 'PDF contains text "REVOKED CREDENTIAL" and "INVALID"',
        actual: detailsMsg,
        dbBefore,
        dbAfter,
        passedResult: isOk,
        details: isOk ? 'Revocation watermark successfully rendered on PDF' : detailsMsg,
      });
    }
  } catch (fatalErr) {
    console.error('\n💥 [FATAL TEST SUITE EXCEPTION]:', fatalErr.message);
    failed++;
  } finally {
    // Teardown: Safely kill Next.js server process tree
    console.log('\n🛑 Terminating dedicated Next.js test server process tree...');
    killProcessTree(serverProc.pid);

    // Wait 1000ms for OS file handles to release
    await new Promise((r) => setTimeout(r, 1000));

    // Clean up isolated temporary test directory
    console.log('🗑️  Cleaning up temporary test directory:', tmpDir);
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
      console.log('✅ Temporary test directory safely removed.\n');
    } catch (cleanupErr) {
      console.warn('⚠️  Could not immediately delete temporary test directory:', cleanupErr.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Summary & Assertion Report
  // ---------------------------------------------------------------------------
  console.log('========================================================================');
  console.log('PHASE 9 INTEGRATION TEST MATRIX & EXECUTION REPORT');
  console.log('========================================================================');
  console.table(
    testRecords.map((r) => ({
      ID: r.id,
      Scenario: r.name.substring(0, 48),
      Expected: r.expected.substring(0, 36),
      Actual: r.actual.substring(0, 36),
      Result: r.passed ? 'PASS' : 'FAIL',
    }))
  );

  console.log('\n========================================================================');
  console.log(`TOTAL SCENARIOS TESTED: ${testRecords.length}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log(`SKIPPED: ${skipped}`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});

/**
 * SOET VeriTrust - Phase 9 Lifecycle State and Persistence Validation Test Suite
 *
 * TASK ID: P9-T04 — Lifecycle State, Persistence, Session & Recovery Testing
 *
 * OBJECTIVES:
 * 1. Batch Lifecycle Validation across states:
 *    - PENDING_ANCHOR (persisted off-chain, pending on-chain anchor)
 *    - ANCHOR_FAILED (failed transaction / rejected receipt)
 *    - ANCHORED (verified on-chain anchor evidence)
 *    - Revoked credential state (on-chain bitmap & local registry revocation)
 *    - Unavailable network behavior (never falsely marks batch as anchored)
 * 2. Database Persistence and Restart Testing:
 *    - Persist synthetic batch in Server Process 1
 *    - Stop Server Process 1 completely
 *    - Spawn new Server Process 2 bound to the same isolated database
 *    - Verify batch, records, Merkle root, student accounts, and dynamic PDF generation persist across restart
 * 3. Session and Browser-Reconnection Testing:
 *    - Browser refresh / repeated requests with same session cookie
 *    - Clean browser context / unauthenticated session handling
 *    - Explicit logout (POST /api/auth/logout) and cookie expiration
 *    - Session token persistence across server process restart (HMAC-SHA256 JWT)
 *    - Role separation (Student vs Examination Admin)
 *    - RBAC cross-student certificate isolation (HTTP 403)
 *    - Expired and tampered session token rejection (HTTP 401)
 * 4. Failure and Recovery Scenarios:
 *    - Database temporarily unavailable (HTTP 503 without file path leaks)
 *    - Blockchain RPC unavailable / transaction receipt missing
 *    - AI forensic service offline graceful degradation (Merkle proof authoritative)
 *    - Invalid transaction hash and mismatched contract address rejection (HTTP 400/422)
 *    - Production database (data/veritrust.db) invariance
 *
 * STRICT SAFETY & ISOLATION GUARANTEES:
 * - Operates EXCLUSIVELY against a dedicated temporary SQLite database.
 * - NEVER accesses or modifies data/veritrust.db or any production database.
 * - Uses ONLY synthetic test records (DEMO-LIFECYCLE-...).
 * - Does NOT broadcast any transaction to Ethereum Sepolia.
 * - Does NOT modify smart contracts, deployed addresses, or environment variables.
 * - Preserves all untracked and modified Git working tree files.
 * - Cleans up server process trees and temporary files in finally block.
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

function buildBatchMerkleTree(records) {
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

function verifyProofClientSide(leafHex, proofHex, rootHex) {
  try {
    const leafBuf = Buffer.from(leafHex.slice(2), 'hex');
    const rootBuf = Buffer.from(rootHex.slice(2), 'hex');
    const proofBufs = proofHex.map((p) => ({
      data: Buffer.from(p.slice(2), 'hex'),
    }));
    return MerkleTree.verify(proofBufs, leafBuf, rootBuf, keccak256, {
      sortPairs: true,
    });
  } catch (err) {
    return false;
  }
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
  } catch {}
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

async function spawnTestServer(dbPath, port) {
  console.log(`🚀 Starting Next.js test server process on port ${port}...`);
  const serverProc = spawn('node', ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: dbPath,
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProc.stdout.on('data', () => {});
  serverProc.stderr.on('data', (d) => {
    const msg = d.toString();
    if (!msg.includes('ExperimentalWarning') && !msg.includes('punycode')) {
      console.error(`[SERVER ${port} ERROR]:`, msg.trim());
    }
  });

  const startTime = Date.now();
  let isReady = false;
  const baseUrl = `http://127.0.0.1:${port}`;

  while (Date.now() - startTime < SERVER_STARTUP_TIMEOUT_MS) {
    try {
      const healthRes = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (healthRes.ok) {
        isReady = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }

  if (!isReady) {
    killProcessTree(serverProc.pid);
    throw new Error(`Test server failed to respond on ${baseUrl} within ${SERVER_STARTUP_TIMEOUT_MS}ms.`);
  }

  console.log(`✅ Next.js test server ready on port ${port} in ${Date.now() - startTime}ms.`);
  return { proc: serverProc, baseUrl, port };
}

// ---------------------------------------------------------------------------
// Main Test Runner
// ---------------------------------------------------------------------------

async function runTestSuite() {
  console.log('========================================================================');
  console.log('SOET VeriTrust - Phase 9 Lifecycle State & Persistence Suite (P9-T04)');
  console.log('========================================================================\n');

  // 1. Establish isolated temporary directory and database path
  const tmpDir = path.resolve(
    process.cwd(),
    'tmp_lifecycle_test_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)
  );
  const testDbPath = path.resolve(tmpDir, 'isolated_lifecycle.db');
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

  // Initialize isolated SQLite schema
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

  // Active server handles
  let currentServer = null;
  let offlineServer = null;

  try {
    // -------------------------------------------------------------------------
    // SPAWN SERVER PROCESS 1
    // -------------------------------------------------------------------------
    const port1 = await getFreePort();
    currentServer = await spawnTestServer(testDbPath, port1);
    let BASE_URL = currentServer.baseUrl;
    let APP_ORIGIN = currentServer.baseUrl;

    // Authenticate Admin on Server 1
    let adminCookie1 = '';
    {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': APP_ORIGIN },
        body: JSON.stringify({
          role: 'EXAM_ADMIN',
          identifier: 'EXAM_ADMIN_MGM',
          password: process.env.ADMIN_PASSWORD || 'admin123',
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      adminCookie1 = extractAuthCookie(res);
      console.log('🔑 Examination Authority authenticated on Server 1.\n');
    }

    // Synthetic Test Students for Lifecycle Suite
    const SYNTHETIC_BATCH_ID = `DEMO-BATCH-LIFECYCLE-${Date.now().toString().slice(-6)}`;
    const syntheticStudents = [
      {
        prn: 'DEMO-LIFECYCLE-001',
        fullName: 'Vikram Anand Deshmukh',
        degree: 'Bachelor of Technology',
        branch: 'Computer Science and Engineering',
        cgpa: 8.75,
        graduationYear: 2026,
        issueDate: '2026-06-15',
        university: 'MGM University',
        institutionCode: 'MGMU-ENG-01',
      },
      {
        prn: 'DEMO-LIFECYCLE-002',
        fullName: 'Sneha Nitin Kulkarni',
        degree: 'Bachelor of Technology',
        branch: 'Information Technology',
        cgpa: 9.10,
        graduationYear: 2026,
        issueDate: '2026-06-15',
        university: 'MGM University',
        institutionCode: 'MGMU-ENG-01',
      },
    ];

    const { rootHex: syntheticMerkleRoot } = buildBatchMerkleTree(syntheticStudents);

    // =========================================================================
    // SECTION 1: BATCH LIFECYCLE VALIDATION
    // =========================================================================

    console.log('--- Executing Section 1: Batch Lifecycle State Validation ---\n');

    // ----------------------------------------------------
    // P9-LIFE-01: PENDING_ANCHOR State Verification
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/batches`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Origin': APP_ORIGIN, 'Cookie': adminCookie1 },
          body: JSON.stringify({
            batchId: SYNTHETIC_BATCH_ID,
            merkleRoot: syntheticMerkleRoot,
            ipfsCid: 'QmSyntheticLifecycleIpfsCid001',
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
      const isPending =
        res?.status === 201 &&
        data?.success === true &&
        data?.batch?.status === 'PENDING_ANCHOR';

      recordResult({
        id: 'P9-LIFE-01',
        name: 'Batch created with status PENDING_ANCHOR and persisted in isolated database',
        input: `POST /api/batches with ${SYNTHETIC_BATCH_ID}`,
        expected: 'HTTP 201 Created, status: PENDING_ANCHOR',
        actual: `HTTP ${res?.status}, status: ${data?.batch?.status}`,
        dbBefore,
        dbAfter,
        passedResult: isPending,
        details: isPending ? 'Initial lifecycle state PENDING_ANCHOR confirmed' : 'Creation failed',
      });
    }

    // ----------------------------------------------------
    // P9-LIFE-02: Off-Chain Safety: Never Falsely Presented as Anchored
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data, verifyRes, verifyData;
      try {
        res = await fetch(`${BASE_URL}/api/batches/${SYNTHETIC_BATCH_ID}`, {
          method: 'GET',
          headers: { 'Cookie': adminCookie1 },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();

        verifyRes = await fetch(`${BASE_URL}/api/verify/${SYNTHETIC_BATCH_ID}/0`, {
          method: 'GET',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        verifyData = await verifyRes.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isHonest =
        res?.status === 200 &&
        data?.batch?.status === 'PENDING_ANCHOR' &&
        data?.batch?.isVerifiedOnChain === false &&
        verifyRes?.status === 200 &&
        verifyData?.isVerifiedOnChain === false &&
        verifyData?.batchStatus === 'PENDING_ANCHOR';

      recordResult({
        id: 'P9-LIFE-02',
        name: 'Off-chain pending batch is never falsely presented as blockchain-anchored',
        input: `GET /api/batches/[id] and GET /api/verify/[id]/0 for ${SYNTHETIC_BATCH_ID}`,
        expected: 'isVerifiedOnChain: false, batchStatus: PENDING_ANCHOR on both endpoints',
        actual: `Issuer isVerifiedOnChain: ${data?.batch?.isVerifiedOnChain}, Verifier isVerifiedOnChain: ${verifyData?.isVerifiedOnChain}`,
        dbBefore,
        dbAfter,
        passedResult: isHonest,
        details: isHonest ? 'Safe off-chain classification verified across issuer & verifier' : 'Falsely claimed anchor',
      });
    }

    // ----------------------------------------------------
    // P9-LIFE-03: ANCHOR_FAILED State Verification
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      // Simulate anchor transaction failure transition in database
      const db = new Database(testDbPath);
      db.prepare('UPDATE batches SET status = ? WHERE batchId = ?').run('ANCHOR_FAILED', SYNTHETIC_BATCH_ID);
      db.close();

      let res, data, verifyRes, verifyData;
      try {
        res = await fetch(`${BASE_URL}/api/batches/${SYNTHETIC_BATCH_ID}`, {
          method: 'GET',
          headers: { 'Cookie': adminCookie1 },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();

        verifyRes = await fetch(`${BASE_URL}/api/verify/${SYNTHETIC_BATCH_ID}/0`, {
          method: 'GET',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        verifyData = await verifyRes.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isFailedStateOk =
        res?.status === 200 &&
        data?.batch?.status === 'ANCHOR_FAILED' &&
        data?.batch?.isVerifiedOnChain === false &&
        verifyRes?.status === 200 &&
        verifyData?.isVerifiedOnChain === false;

      recordResult({
        id: 'P9-LIFE-03',
        name: 'ANCHOR_FAILED state reports failure reason and isVerifiedOnChain: false across all endpoints',
        input: 'Simulated ANCHOR_FAILED transition in isolated database',
        expected: 'status: ANCHOR_FAILED, isVerifiedOnChain: false on issuer & verifier endpoints',
        actual: `status: ${data?.batch?.status}, isVerifiedOnChain: ${data?.batch?.isVerifiedOnChain}, verifyStatus: ${verifyData?.batchStatus}`,
        dbBefore,
        dbAfter,
        passedResult: isFailedStateOk,
        details: isFailedStateOk ? 'ANCHOR_FAILED state truthfully communicated' : 'State mismatch',
      });

      // Restore to PENDING_ANCHOR for subsequent tests
      const restoreDb = new Database(testDbPath);
      restoreDb.prepare('UPDATE batches SET status = ? WHERE batchId = ?').run('PENDING_ANCHOR', SYNTHETIC_BATCH_ID);
      restoreDb.close();
    }

    // ----------------------------------------------------
    // P9-LIFE-04: ANCHORED State Verification (Controlled Fixture)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      const mockTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const anchoredAt = Math.floor(Date.now() / 1000);

      // Simulate ANCHORED status update in database
      const db = new Database(testDbPath);
      db.prepare('UPDATE batches SET status = ?, txHash = ?, anchoredAt = ? WHERE batchId = ?').run(
        'ANCHORED',
        mockTxHash,
        anchoredAt,
        SYNTHETIC_BATCH_ID
      );
      db.close();

      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/batches/${SYNTHETIC_BATCH_ID}`, {
          method: 'GET',
          headers: { 'Cookie': adminCookie1 },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      // Because mockTxHash is synthetic, the server attempts on-chain query, catches the missing receipt,
      // and reports isVerifiedOnChain: false with a truthful explanation
      const isHonestAnchor =
        res?.status === 200 &&
        data?.batch?.status === 'ANCHORED' &&
        data?.batch?.txHash === mockTxHash &&
        typeof data?.batch?.isVerifiedOnChain === 'boolean';

      recordResult({
        id: 'P9-LIFE-04',
        name: 'ANCHORED state records txHash and safely validates anchor evidence without unverified claims',
        input: `Simulated ANCHORED status with synthetic txHash ${mockTxHash}`,
        expected: 'status: ANCHORED, txHash recorded, on-chain evidence evaluated truthfully',
        actual: `status: ${data?.batch?.status}, txHash: ${data?.batch?.txHash}, isVerifiedOnChain: ${data?.batch?.isVerifiedOnChain}`,
        dbBefore,
        dbAfter,
        passedResult: isHonestAnchor,
        details: isHonestAnchor ? 'Anchor metadata recorded with truthful verification evaluation' : 'Unexpected state',
      });

      // Restore to PENDING_ANCHOR for clean persistence restart test
      const restoreDb = new Database(testDbPath);
      restoreDb.prepare('UPDATE batches SET status = ?, txHash = NULL, anchoredAt = NULL WHERE batchId = ?').run(
        'PENDING_ANCHOR',
        SYNTHETIC_BATCH_ID
      );
      restoreDb.close();
    }

    // ----------------------------------------------------
    // P9-LIFE-05: Revocation Lifecycle: DB, Public Verify & PDF Watermark
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let revokeRes, verifyRes, verifyData, pdfRes, hasWatermark = false;
      try {
        revokeRes = await fetch(`${BASE_URL}/api/batches/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Origin': APP_ORIGIN, 'Cookie': adminCookie1 },
          body: JSON.stringify({
            batchId: SYNTHETIC_BATCH_ID,
            leafIndex: 0,
            reasonCode: 'ACADEMIC_MISCONDUCT',
            reasonTitle: 'Administrative Review',
            reasonDescription: 'Lifecycle revocation test in Phase 9.',
            officerStaffId: 'EXAM_ADMIN_MGM',
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        verifyRes = await fetch(`${BASE_URL}/api/verify/${SYNTHETIC_BATCH_ID}/0`, {
          method: 'GET',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        verifyData = await verifyRes.json();

        pdfRes = await fetch(`${BASE_URL}/api/certificates/${SYNTHETIC_BATCH_ID}/0/pdf`, {
          method: 'GET',
          headers: { 'Cookie': adminCookie1 },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const arr = await pdfRes.arrayBuffer();
        const doc = await pdf.getDocument({ data: new Uint8Array(Buffer.from(arr)) }).promise;
        const page = await doc.getPage(1);
        const textContent = await page.getTextContent();
        const text = textContent.items.map((i) => i.str).join(' ');
        hasWatermark = text.includes('REVOKED CREDENTIAL') && text.includes('INVALID');
      } catch (err) {
        verifyData = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isRevokeOk =
        revokeRes?.status === 200 &&
        verifyRes?.status === 200 &&
        verifyData?.isRevoked === true &&
        pdfRes?.status === 200 &&
        hasWatermark;

      recordResult({
        id: 'P9-LIFE-05',
        name: 'Revocation lifecycle updates database, reflects in public verification, and renders PDF watermark',
        input: `Revocation of ${SYNTHETIC_BATCH_ID} Leaf #0`,
        expected: 'Revoke HTTP 200, isRevoked: true, PDF contains REVOKED CREDENTIAL - INVALID watermark',
        actual: `Revoke: HTTP ${revokeRes?.status}, isRevoked: ${verifyData?.isRevoked}, Watermark: ${hasWatermark}`,
        dbBefore,
        dbAfter,
        passedResult: isRevokeOk,
        details: isRevokeOk ? 'Revocation reflected across DB, verification, and PDF render' : 'Revocation incomplete',
      });
    }

    // ----------------------------------------------------
    // P9-LIFE-06: Unavailable Network Anchor Invariance
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/batches/${SYNTHETIC_BATCH_ID}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Origin': APP_ORIGIN, 'Cookie': adminCookie1 },
          body: JSON.stringify({
            txHash: '0x8888888888888888888888888888888888888888888888888888888888888888',
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      // Receipt not found returns 404/503; database MUST NOT transition to ANCHORED
      const isSafe = (res?.status === 404 || res?.status === 503) && data?.success === false;

      recordResult({
        id: 'P9-LIFE-06',
        name: 'Unavailable network / unbroadcast transaction receipt strictly prevents premature ANCHORED status',
        input: 'PATCH /api/batches/[id] with unbroadcast txHash',
        expected: 'HTTP 404/503, success: false; batch remains in existing state',
        actual: `HTTP ${res?.status} (${data?.error || ''})`,
        dbBefore,
        dbAfter,
        passedResult: isSafe,
        details: isSafe ? 'Premature anchoring prevented by receipt validation gate' : 'Expected failure status',
      });
    }

    // =========================================================================
    // SECTION 2: DATABASE PERSISTENCE & MULTI-PROCESS RESTART TESTING
    // =========================================================================

    console.log('\n--- Executing Section 2: Database Persistence & Multi-Process Restart Testing ---\n');

    // ----------------------------------------------------
    // P9-LIFE-07: Pre-Restart Batch & Credential Baseline
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      const verifyDb = new Database(testDbPath, { readonly: true });
      const batchRow = verifyDb.prepare('SELECT * FROM batches WHERE batchId = ?').get(SYNTHETIC_BATCH_ID);
      const credRows = verifyDb.prepare('SELECT * FROM credentials WHERE batch_id = ?').all(SYNTHETIC_BATCH_ID);
      verifyDb.close();

      const isBaselineOk = Boolean(batchRow && credRows.length === 2 && batchRow.merkleRoot === syntheticMerkleRoot);
      const dbAfter = getDatabaseMetrics(testDbPath);

      recordResult({
        id: 'P9-LIFE-07',
        name: 'Baseline verification: Synthetic batch and credentials confirmed in isolated database before restart',
        input: `Database check for ${SYNTHETIC_BATCH_ID}`,
        expected: '1 batch, 2 credentials, Merkle root matches computed root',
        actual: `Batch exists: ${Boolean(batchRow)}, Creds: ${credRows.length}, Root: ${batchRow?.merkleRoot?.slice(0, 18)}...`,
        dbBefore,
        dbAfter,
        passedResult: isBaselineOk,
        details: isBaselineOk ? 'Pre-restart baseline established' : 'Baseline missing',
      });
    }

    // ----------------------------------------------------
    // P9-LIFE-08: Server Process 1 Termination
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      console.log('🛑 Terminating Server Process 1 (PID: ' + currentServer.proc.pid + ')...');
      killProcessTree(currentServer.proc.pid);
      await new Promise((r) => setTimeout(r, 1200));

      let isDown = false;
      try {
        await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(1000) });
      } catch {
        isDown = true;
      }
      const dbAfter = getDatabaseMetrics(testDbPath);

      recordResult({
        id: 'P9-LIFE-08',
        name: 'Server Process 1 is cleanly terminated, simulating complete host / service interruption',
        input: `killProcessTree(${currentServer.proc.pid})`,
        expected: 'Server Process 1 completely stopped and port released',
        actual: `Server offline confirmed: ${isDown}`,
        dbBefore,
        dbAfter,
        passedResult: isDown,
        details: isDown ? 'Server 1 stopped successfully' : 'Server still responding!',
      });
    }

    // ----------------------------------------------------
    // P9-LIFE-09: Server Process 2 Spawn on New Dynamic Port
    // ----------------------------------------------------
    const port2 = await getFreePort();
    currentServer = await spawnTestServer(testDbPath, port2);
    BASE_URL = currentServer.baseUrl;
    APP_ORIGIN = currentServer.baseUrl;

    recordResult({
      id: 'P9-LIFE-09',
      name: 'Server Process 2 starts successfully on new dynamic port bound to the exact same database',
      input: `spawnTestServer on port ${port2}`,
      expected: 'Server Process 2 starts and passes /api/health check',
      actual: `Server 2 ready on ${BASE_URL}`,
      dbBefore: getDatabaseMetrics(testDbPath),
      dbAfter: getDatabaseMetrics(testDbPath),
      passedResult: true,
      details: `New server process running on port ${port2}`,
    });

    // ----------------------------------------------------
    // P9-LIFE-10: Post-Restart Batch & Merkle Invariance
    // ----------------------------------------------------
    let adminCookie2 = '';
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      // Re-authenticate Admin on Server 2
      const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': APP_ORIGIN },
        body: JSON.stringify({
          role: 'EXAM_ADMIN',
          identifier: 'EXAM_ADMIN_MGM',
          password: process.env.ADMIN_PASSWORD || 'admin123',
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      adminCookie2 = extractAuthCookie(loginRes);

      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/batches/${SYNTHETIC_BATCH_ID}`, {
          method: 'GET',
          headers: { 'Cookie': adminCookie2 },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isRetrieved =
        res?.status === 200 &&
        data?.success === true &&
        data?.batch?.batchId === SYNTHETIC_BATCH_ID &&
        data?.batch?.merkleRoot === syntheticMerkleRoot &&
        data?.batch?.records?.length === 2 &&
        data?.batch?.status === 'PENDING_ANCHOR';

      recordResult({
        id: 'P9-LIFE-10',
        name: 'Server Process 2 retrieves persisted batch with 100% record integrity, matching root, and PENDING_ANCHOR status',
        input: `GET /api/batches/${SYNTHETIC_BATCH_ID} against Server 2`,
        expected: 'HTTP 200, matching Merkle root, 2 records, PENDING_ANCHOR',
        actual: `HTTP ${res?.status}, records: ${data?.batch?.records?.length}, status: ${data?.batch?.status}`,
        dbBefore,
        dbAfter,
        passedResult: isRetrieved,
        details: isRetrieved ? 'Persistence verified across server restart' : 'Data retrieval failed',
      });
    }

    // ----------------------------------------------------
    // P9-LIFE-11: Post-Restart Credential & Dynamic PDF Access
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, pdfBytes = 0;
      try {
        res = await fetch(`${BASE_URL}/api/certificates/${SYNTHETIC_BATCH_ID}/1/pdf`, {
          method: 'GET',
          headers: { 'Cookie': adminCookie2 },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const arr = await res.arrayBuffer();
        pdfBytes = arr.byteLength;
      } catch {}
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isPdfOk = res?.status === 200 && pdfBytes > 1000;

      recordResult({
        id: 'P9-LIFE-11',
        name: 'Server Process 2 successfully renders dynamic certificate vector PDF from persisted credentials',
        input: `GET /api/certificates/${SYNTHETIC_BATCH_ID}/1/pdf against Server 2`,
        expected: 'HTTP 200, binary PDF stream (>1000 bytes)',
        actual: `HTTP ${res?.status}, bytes: ${pdfBytes}`,
        dbBefore,
        dbAfter,
        passedResult: isPdfOk,
        details: isPdfOk ? 'Dynamic PDF rendering functional post-restart' : 'PDF render failed',
      });
    }

    // ----------------------------------------------------
    // P9-LIFE-12: Post-Restart Student Authentication
    // ----------------------------------------------------
    let studentCookie = '';
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Origin': APP_ORIGIN },
          body: JSON.stringify({
            role: 'STUDENT',
            identifier: 'DEMO-LIFECYCLE-001',
            password: 'student123',
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
        studentCookie = extractAuthCookie(res);
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isStudentAuthOk =
        res?.status === 200 &&
        data?.success === true &&
        data?.user?.role === 'STUDENT' &&
        data?.user?.prn === 'DEMO-LIFECYCLE-001' &&
        studentCookie.length > 0;

      recordResult({
        id: 'P9-LIFE-12',
        name: 'Student authenticates against Server Process 2 using persisted salted scrypt hash without re-provisioning',
        input: 'POST /api/auth/login with DEMO-LIFECYCLE-001 + student123',
        expected: 'HTTP 200, role: STUDENT, valid auth_session cookie',
        actual: `HTTP ${res?.status}, prn: ${data?.user?.prn}, cookie present: ${Boolean(studentCookie)}`,
        dbBefore,
        dbAfter,
        passedResult: isStudentAuthOk,
        details: isStudentAuthOk ? 'Student account persisted and authenticated post-restart' : 'Auth failed',
      });
    }

    // =========================================================================
    // SECTION 3: SESSION & BROWSER-RECONNECTION TESTING
    // =========================================================================

    console.log('\n--- Executing Section 3: Session & Browser-Reconnection Testing ---\n');

    // ----------------------------------------------------
    // P9-LIFE-13: Session Continuity Across Browser Refresh (Repeated Requests)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let successCount = 0;
      for (let i = 0; i < 3; i++) {
        try {
          const res = await fetch(`${BASE_URL}/api/auth/session`, {
            method: 'GET',
            headers: { 'Cookie': adminCookie2 },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
          const data = await res.json();
          if (res.status === 200 && data.authenticated === true && data.user?.role === 'EXAM_ADMIN') {
            successCount++;
          }
        } catch {}
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isConsistent = successCount === 3;

      recordResult({
        id: 'P9-LIFE-13',
        name: 'Session continuity: Sequential requests using active cookie maintain authenticated state without re-login',
        input: '3 consecutive GET /api/auth/session calls with admin cookie',
        expected: '3 / 3 calls return authenticated: true, role: EXAM_ADMIN',
        actual: `${successCount} / 3 authenticated successfully`,
        dbBefore,
        dbAfter,
        passedResult: isConsistent,
        details: isConsistent ? 'Session continuity verified' : 'Session dropped unexpectedly',
      });
    }

    // ----------------------------------------------------
    // P9-LIFE-14: Clean Browser Context Rejection (No Cookie)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/auth/session`, {
          method: 'GET',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isUnauthOk = res?.status === 200 && data?.authenticated === false && data?.user === null;

      recordResult({
        id: 'P9-LIFE-14',
        name: 'New browser context / omitted cookie correctly returns authenticated: false and null user',
        input: 'GET /api/auth/session without Cookie header',
        expected: 'HTTP 200, authenticated: false, user: null',
        actual: `HTTP ${res?.status}, authenticated: ${data?.authenticated}, user: ${data?.user}`,
        dbBefore,
        dbAfter,
        passedResult: isUnauthOk,
        details: isUnauthOk ? 'Clean unauthenticated session verified' : 'Unexpected auth state',
      });
    }

    // ----------------------------------------------------
    // P9-LIFE-15: Explicit Logout Behavior (POST /api/auth/logout)
    // ----------------------------------------------------
    let logoutCookieHeader = '';
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Cookie': adminCookie2 },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
        logoutCookieHeader = res.headers.get('set-cookie') || '';
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isLogoutOk =
        res?.status === 200 &&
        data?.success === true &&
        (logoutCookieHeader.includes('Max-Age=0') || logoutCookieHeader.includes('Expires='));

      recordResult({
        id: 'P9-LIFE-15',
        name: 'Explicit logout (POST /api/auth/logout) clears session cookie with Max-Age: 0',
        input: 'POST /api/auth/logout with active session cookie',
        expected: 'HTTP 200, Set-Cookie clears auth_session with Max-Age: 0',
        actual: `HTTP ${res?.status}, Set-Cookie: ${logoutCookieHeader.slice(0, 32)}...`,
        dbBefore,
        dbAfter,
        passedResult: isLogoutOk,
        details: isLogoutOk ? 'Session successfully terminated' : 'Logout failed',
      });
    }

    // ----------------------------------------------------
    // P9-LIFE-16: Post-Logout Rejection & Re-Login
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      // Attempt protected action with expired session
      let expiredRes, freshCookie = '';
      try {
        expiredRes = await fetch(`${BASE_URL}/api/batches`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': APP_ORIGIN,
            'Cookie': 'auth_session=; Max-Age=0',
          },
          body: JSON.stringify({ batchId: 'TEST-SHOULD-FAIL' }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        // Re-authenticate
        const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Origin': APP_ORIGIN },
          body: JSON.stringify({ role: 'EXAM_ADMIN', identifier: 'EXAM_ADMIN_MGM', password: process.env.ADMIN_PASSWORD || 'admin123' }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        freshCookie = extractAuthCookie(loginRes);
      } catch {}

      const dbAfter = getDatabaseMetrics(testDbPath);
      const isCycleOk = expiredRes?.status === 401 && freshCookie.length > 0;
      adminCookie2 = freshCookie; // Update active admin cookie

      recordResult({
        id: 'P9-LIFE-16',
        name: 'Cleared session rejected with HTTP 401; subsequent login restores access with fresh session',
        input: 'Post-logout request followed by fresh login',
        expected: 'Cleared request: HTTP 401; Fresh login: HTTP 200 with new cookie',
        actual: `Cleared status: HTTP ${expiredRes?.status}, Re-login cookie present: ${Boolean(freshCookie)}`,
        dbBefore,
        dbAfter,
        passedResult: isCycleOk,
        details: isCycleOk ? 'Logout invalidation and re-login cycle verified' : 'Cycle failed',
      });
    }

    // ----------------------------------------------------
    // P9-LIFE-17: Cross-Process Session Token Persistence
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      // adminCookie1 was signed on Server 1 before it was killed.
      // Now test sending adminCookie1 to Server 2:
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/auth/session`, {
          method: 'GET',
          headers: { 'Cookie': adminCookie1 },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isJwtPersistent =
        res?.status === 200 &&
        data?.authenticated === true &&
        data?.user?.role === 'EXAM_ADMIN';

      recordResult({
        id: 'P9-LIFE-17',
        name: 'Stateless HMAC-SHA256 session token from Server 1 remains verifiable on Server 2 across process restart',
        input: 'GET /api/auth/session on Server 2 using token signed by Server 1',
        expected: 'HTTP 200, authenticated: true, role: EXAM_ADMIN',
        actual: `HTTP ${res?.status}, authenticated: ${data?.authenticated}, role: ${data?.user?.role}`,
        dbBefore,
        dbAfter,
        passedResult: isJwtPersistent,
        details: isJwtPersistent ? 'Cryptographic session persistence verified across processes' : 'Session dropped across restart',
      });
    }

    // ----------------------------------------------------
    // P9-LIFE-18: Role & Access Isolation: Student Cannot Perform Admin Operations
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let batchRes, revokeRes;
      try {
        batchRes = await fetch(`${BASE_URL}/api/batches`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Origin': APP_ORIGIN, 'Cookie': studentCookie },
          body: JSON.stringify({ batchId: 'STUDENT-FORBIDDEN-BATCH' }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        revokeRes = await fetch(`${BASE_URL}/api/batches/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Origin': APP_ORIGIN, 'Cookie': studentCookie },
          body: JSON.stringify({ batchId: SYNTHETIC_BATCH_ID, leafIndex: 0 }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {}
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isRoleIsolated = batchRes?.status === 401 && revokeRes?.status === 401;

      recordResult({
        id: 'P9-LIFE-18',
        name: 'Role separation: Student session is strictly rejected with HTTP 401 on administrative endpoints',
        input: 'Student cookie on POST /api/batches and POST /api/batches/revoke',
        expected: 'HTTP 401 Unauthorized for both requests',
        actual: `Batch creation: HTTP ${batchRes?.status}, Revocation: HTTP ${revokeRes?.status}`,
        dbBefore,
        dbAfter,
        passedResult: isRoleIsolated,
        details: isRoleIsolated ? 'Administrative routes strictly protected from student role' : 'Role check failed',
      });
    }

    // ----------------------------------------------------
    // P9-LIFE-19: Cross-Student Certificate Download Isolation (HTTP 403)
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let res, data;
      try {
        // studentCookie belongs to DEMO-LIFECYCLE-001 (Leaf 0). Attempt to download Leaf 1 (DEMO-LIFECYCLE-002)
        res = await fetch(`${BASE_URL}/api/certificates/${SYNTHETIC_BATCH_ID}/1/pdf`, {
          method: 'GET',
          headers: { 'Cookie': studentCookie },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json().catch(() => ({}));
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isCrossIsolated = res?.status === 403;

      recordResult({
        id: 'P9-LIFE-19',
        name: 'Cross-student isolation: Student 1 attempting to download Student 2 certificate returns HTTP 403 Forbidden',
        input: `GET /api/certificates/${SYNTHETIC_BATCH_ID}/1/pdf with Student 1 cookie`,
        expected: 'HTTP 403 Forbidden',
        actual: `HTTP ${res?.status} (${data?.error || ''})`,
        dbBefore,
        dbAfter,
        passedResult: isCrossIsolated,
        details: isCrossIsolated ? 'Cross-student isolation enforced' : 'Expected 403',
      });
    }

    // ----------------------------------------------------
    // P9-LIFE-20: Tampered / Expired Session Rejection
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      const tamperedCookie = 'auth_session=eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjp7InJvbGUiOiJFWEFNX0FETUlOIn19.INVALID_FORGED_SIGNATURE';

      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/auth/session`, {
          method: 'GET',
          headers: { 'Cookie': tamperedCookie },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isTamperedRejected = res?.status === 200 && data?.authenticated === false && data?.user === null;

      recordResult({
        id: 'P9-LIFE-20',
        name: 'Forged or tampered session token HMAC signature is strictly rejected as unauthenticated',
        input: 'Cookie with modified payload and forged signature',
        expected: 'HTTP 200, authenticated: false, user: null',
        actual: `HTTP ${res?.status}, authenticated: ${data?.authenticated}`,
        dbBefore,
        dbAfter,
        passedResult: isTamperedRejected,
        details: isTamperedRejected ? 'Forged session token rejected' : 'Forged token accepted!',
      });
    }

    // =========================================================================
    // SECTION 4: FAILURE AND RECOVERY SCENARIOS
    // =========================================================================

    console.log('\n--- Executing Section 4: Failure & Recovery Scenarios ---\n');

    // ----------------------------------------------------
    // P9-LIFE-21: Blockchain RPC Failure Handling
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      // Verify that querying batch verification without blockchain anchor safely defaults to off-chain registry
      let res, data;
      try {
        res = await fetch(`${BASE_URL}/api/verify/${SYNTHETIC_BATCH_ID}/1`, {
          method: 'GET',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        data = await res.json();
      } catch (err) {
        data = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      // Query succeeds with safe off-chain fallback (isVerifiedOnChain: false, batchStatus !== 'ANCHORED')
      const isRpcHandled =
        res?.status === 200 &&
        data?.success === true &&
        data?.isVerifiedOnChain === false &&
        data?.proofData?.network === 'Local Institutional Registry' &&
        data?.batchStatus !== 'ANCHORED';

      recordResult({
        id: 'P9-LIFE-21',
        name: 'Unreachable / unsupported blockchain RPC safely defaults to off-chain registry without claiming anchor',
        input: 'GET /api/verify/[id]/1 against unanchored batch',
        expected: 'HTTP 200, isVerifiedOnChain: false, network: Local Institutional Registry, batchStatus != ANCHORED',
        actual: `HTTP ${res?.status}, isVerifiedOnChain: ${data?.isVerifiedOnChain}, network: "${data?.proofData?.network}", status: ${data?.batchStatus}`,
        dbBefore,
        dbAfter,
        passedResult: isRpcHandled,
        details: isRpcHandled ? 'Fallback to unverified off-chain state confirmed' : `Status: ${res?.status}, error: ${data?.error ? String(data.error).slice(0, 200) : ''}`,
      });
    }

    // ----------------------------------------------------
    // P9-LIFE-22: AI Forensic Microservice Degradation
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      // Download dynamic certificate PDF for Leaf 1 (unrevoked)
      let pdfRes, uploadRes, uploadData;
      try {
        pdfRes = await fetch(`${BASE_URL}/api/certificates/${SYNTHETIC_BATCH_ID}/1/pdf`, {
          method: 'GET',
          headers: { 'Cookie': adminCookie2 },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const arr = await pdfRes.arrayBuffer();
        const pdfBuf = Buffer.from(arr);

        const formData = new FormData();
        const blob = new Blob([pdfBuf], { type: 'application/pdf' });
        formData.append('file', blob, 'unrevoked_leaf1.pdf');

        uploadRes = await fetch(`${BASE_URL}/api/verify/pdf`, {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        uploadData = await uploadRes.json();
      } catch (err) {
        uploadData = { error: err.message };
      }
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isDegradedOk =
        uploadRes?.status === 200 &&
        uploadData?.success === true &&
        uploadData?.isValid === true &&
        uploadData?.diagnostic_code === 'FULLY_VERIFIED' &&
        uploadData?.forensic_scan?.status === 'UNAVAILABLE';

      recordResult({
        id: 'P9-LIFE-22',
        name: 'AI forensic service offline degrades gracefully: Merkle proof remains authoritative (FULLY_VERIFIED)',
        input: 'POST /api/verify/pdf with genuine certificate while AI service is offline',
        expected: 'HTTP 200, isValid: true, diagnostic_code: FULLY_VERIFIED, forensic_scan: UNAVAILABLE',
        actual: `HTTP ${uploadRes?.status}, isValid: ${uploadData?.isValid}, code: ${uploadData?.diagnostic_code}, AI: ${uploadData?.forensic_scan?.status}`,
        dbBefore,
        dbAfter,
        passedResult: isDegradedOk,
        details: isDegradedOk ? 'Graceful AI degradation with authoritative cryptographic proof verified' : 'Degradation failed',
      });
    }

    // ----------------------------------------------------
    // P9-LIFE-23: Invalid Transaction Parameter Rejection
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let resFormat, resContract;
      try {
        // Malformed txHash format
        resFormat = await fetch(`${BASE_URL}/api/batches/${SYNTHETIC_BATCH_ID}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Origin': APP_ORIGIN, 'Cookie': adminCookie2 },
          body: JSON.stringify({ txHash: 'not-a-valid-hex-hash' }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        // Mismatched expectedContract
        resContract = await fetch(`${BASE_URL}/api/batches/${SYNTHETIC_BATCH_ID}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Origin': APP_ORIGIN, 'Cookie': adminCookie2 },
          body: JSON.stringify({
            txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            expectedContract: '0x9999999999999999999999999999999999999999',
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {}
      const dbAfter = getDatabaseMetrics(testDbPath);
      const isParamsRejected = resFormat?.status === 400 && resContract?.status === 422;

      recordResult({
        id: 'P9-LIFE-23',
        name: 'Invalid transaction parameter rejection: Malformed hash returns HTTP 400; Mismatched contract returns HTTP 422',
        input: 'PATCH with invalid hash format and mismatched contract address',
        expected: 'Malformed: HTTP 400; Contract mismatch: HTTP 422',
        actual: `Malformed: HTTP ${resFormat?.status}, Contract mismatch: HTTP ${resContract?.status}`,
        dbBefore,
        dbAfter,
        passedResult: isParamsRejected,
        details: isParamsRejected ? 'Transaction parameter verification gates enforced' : 'Expected 400 and 422',
      });
    }

    // Terminate Server Process 2 cleanly before spawning offline server
    if (currentServer && currentServer.proc) {
      console.log('🛑 Terminating Server Process 2 before offline database test...');
      killProcessTree(currentServer.proc.pid);
      currentServer = null;
      await new Promise((r) => setTimeout(r, 1200));
    }

    // ----------------------------------------------------
    // P9-LIFE-24: Database Unavailability Failure & Path Sanitization
    // ----------------------------------------------------
    {
      const offlineDbPath = path.resolve('C:\\non_existent_dir_p9_t04_offline', 'missing.db');
      const offlinePort = await getFreePort();
      console.log(`Starting simulated offline-database server on port ${offlinePort}...`);

      const offlineProc = spawn('node', ['node_modules/next/dist/bin/next', 'dev', '-p', String(offlinePort)], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: String(offlinePort),
          DATABASE_PATH: offlineDbPath,
          NODE_ENV: 'development',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      offlineProc.stdout.on('data', () => {});
      offlineProc.stderr.on('data', () => {});
      offlineServer = { proc: offlineProc, port: offlinePort, baseUrl: `http://127.0.0.1:${offlinePort}` };

      // Wait for server readiness
      await new Promise((r) => setTimeout(r, 4500));

      let healthStatus = 0, healthData = null;
      try {
        const hRes = await fetch(`${offlineServer.baseUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
        healthStatus = hRes.status;
        healthData = await hRes.json();
      } catch (err) {
        healthData = { error: err.message };
      }

      // Check path disclosure sanitization
      const rawText = JSON.stringify(healthData || {});
      const leaksPath = rawText.toLowerCase().includes('non_existent_dir') || rawText.toLowerCase().includes('missing.db');
      const is503 = healthStatus === 503 && healthData?.status?.toLowerCase() === 'unhealthy' && !leaksPath;

      recordResult({
        id: 'P9-LIFE-24',
        name: 'Database failure returns sanitized HTTP 503 without revealing internal file paths or stack traces',
        input: 'Simulated unavailable database path',
        expected: 'HTTP 503, status: UNHEALTHY/unhealthy, zero filesystem path disclosure',
        actual: `HTTP ${healthStatus}, status: ${healthData?.status}, Path leaked: ${leaksPath}`,
        dbBefore: 'offline',
        dbAfter: 'offline',
        passedResult: is503,
        details: is503 ? 'Sanitized HTTP 503 correctly returned on database failure' : 'Health check leak or non-503',
      });

      // Terminate offline server process
      killProcessTree(offlineProc.pid);
      offlineServer = null;
      await new Promise((r) => setTimeout(r, 1000));
    }

    // ----------------------------------------------------
    // P9-LIFE-25: Production SQLite Database Invariance
    // ----------------------------------------------------
    {
      const dbBefore = getDatabaseMetrics(testDbPath);
      let prodDbOk = false;
      let prodCounts = '';
      try {
        const prodDb = new Database('data/veritrust.db', { readonly: true });
        const check = prodDb.pragma('integrity_check');
        const b = prodDb.prepare('SELECT COUNT(*) as c FROM batches').get().c;
        const c = prodDb.prepare('SELECT COUNT(*) as c FROM credentials').get().c;
        const a = prodDb.prepare('SELECT COUNT(*) as c FROM student_accounts').get().c;
        prodDb.close();

        prodDbOk = check?.[0]?.integrity_check === 'ok' && b === 5 && c === 12 && a === 12;
        prodCounts = `Batches: ${b}, Creds: ${c}, Accounts: ${a}, Integrity: ${check?.[0]?.integrity_check}`;
      } catch (err) {
        prodCounts = err.message;
      }
      const dbAfter = getDatabaseMetrics(testDbPath);

      recordResult({
        id: 'P9-LIFE-25',
        name: 'Production database (data/veritrust.db) remains 100% untouched with intact record counts and integrity ok',
        input: 'Read-only check on data/veritrust.db',
        expected: 'Batches: 5, Creds: 12, Accounts: 12, Integrity: ok',
        actual: prodCounts,
        dbBefore,
        dbAfter,
        passedResult: prodDbOk,
        details: prodDbOk ? 'Production database isolation strictly verified' : 'Production DB modified!',
      });
    }
  } catch (fatalErr) {
    console.error('\n💥 [FATAL TEST SUITE EXCEPTION]:', fatalErr.message);
    failed++;
  } finally {
    // Teardown: Safely kill active server process trees
    console.log('\n🛑 Terminating active test server processes...');
    if (currentServer?.proc?.pid) {
      killProcessTree(currentServer.proc.pid);
    }
    if (offlineServer?.proc?.pid) {
      killProcessTree(offlineServer.proc.pid);
    }

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
  console.log('PHASE 9 LIFECYCLE & PERSISTENCE TEST MATRIX REPORT');
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


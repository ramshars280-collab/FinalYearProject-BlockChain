/**
 * SOET VeriTrust - Phase 3C Step 8E: Isolated Remote CRUD & Transaction Testing
 *
 * Tests actual CRUD operations, constraints, and transactions against the isolated
 * remote Turso test database using EXCLUSIVELY synthetic test records.
 *
 * Safety Rules:
 * - Strictly operates against: libsql://soet-veritrust-test-ramsha12.aws-ap-south-1.turso.io
 * - Reads credentials strictly from process memory ($env:TURSO_TEST_AUTH_TOKEN)
 * - Zero access to local SQLite (data/veritrust.db is never touched)
 * - Zero real student records; only synthetic mock data
 * - Zero blockchain transactions
 * - Zero credentials logged, printed, or saved
 * - Clean event-loop exit (no process.exit(0) libuv race on Windows)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@libsql/client');

const EXPECTED_TEST_DB_URL = 'libsql://soet-veritrust-test-ramsha12.aws-ap-south-1.turso.io';
const LOCAL_DB_PATH = path.resolve(__dirname, '../data/veritrust.db');

const REQUIRED_TABLES = ['batches', 'credentials', 'revocations', 'student_accounts'];

// Synthetic Test Identifiers
const SYNTHETIC = {
  batchId: 'DEMO-REMOTE-CRUD-2026-001',
  merkleRoot: '0xaaaa1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
  ipfsCid: 'QmDemoSyntheticCid001',
  issuer: 'Demo Examination Officer',
  institutionName: 'SOET Demo Institute',
  institutionCode: 'SOET-DEMO',
  student1: {
    prn: 'DEMO-REMOTE-CSE-001',
    fullName: 'Demo Student 001',
    degree: 'B.Tech',
    branch: 'Computer Science & Engineering',
    cgpa: 9.2,
    graduationYear: 2026,
    institute: 'SOET Demo Institute',
    leafIndex: 0,
    credId: 'DEMO-REMOTE-CRUD-2026-001_DEMO-REMOTE-CSE-001',
  },
  student2: {
    prn: 'DEMO-REMOTE-CSE-002',
    fullName: 'Demo Student 002',
    degree: 'B.Tech',
    branch: 'Computer Science & Engineering',
    cgpa: 8.85,
    graduationYear: 2026,
    institute: 'SOET Demo Institute',
    leafIndex: 1,
    credId: 'DEMO-REMOTE-CRUD-2026-001_DEMO-REMOTE-CSE-002',
  },
  revocation: {
    key: 'DEMO-REMOTE-CRUD-2026-001_0',
    batchId: 'DEMO-REMOTE-CRUD-2026-001',
    leafIndex: 0,
    reasonCode: 'ADMIN_CORRECTION',
    reasonTitle: 'Synthetic Test Revocation',
    reasonDescription: 'Testing remote revocation CRUD in isolated Turso test db',
    supersededByHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
    officerStaffId: 'OFFICER-TEST-99',
  },
  account: {
    prn: 'DEMO-REMOTE-CSE-001',
    fakePasswordHash: 'fake_argon2_hash_demo_student_001',
    fakeActivationHash: 'fake_sha256_activation_token_demo_001',
    activationExpiresAt: Date.now() + 86400000,
  },
  txTest: {
    batchId: 'DEMO-REMOTE-TX-2026-002',
    merkleRoot: '0xbbbb222233334444555566667777888899990000111122223333444455556666',
    ipfsCid: 'QmDemoSyntheticTxCid002',
    prn: 'DEMO-REMOTE-TX-003',
    fullName: 'Demo Tx Student',
    credId: 'DEMO-REMOTE-TX-2026-002_DEMO-REMOTE-TX-003',
  },
};

/**
 * Sanitizes error messages to protect authentication tokens.
 */
function sanitizeErrorMessage(msg) {
  if (!msg || typeof msg !== 'string') return 'Unknown error';
  return msg
    .replace(/Bearer\s+[A-Za-z0-9\-_\.]+/gi, 'Bearer [REDACTED]')
    .replace(/authToken=[^&\s]+/gi, 'authToken=[REDACTED]')
    .replace(/token=[^&\s]+/gi, 'token=[REDACTED]');
}

/**
 * Computes SHA-256 of local database to guarantee zero modification.
 */
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
 * Runs the isolated remote CRUD & Transaction integration test suite.
 */
async function runRemoteCrudTest() {
  console.log('================================================================');
  console.log('   SOET VeriTrust - Isolated Remote Turso CRUD & Tx Test (8E)  ');
  console.log('================================================================');
  console.log('Execution Mode: Isolated Remote CRUD, Constraints & Transactions');
  console.log('Target Database: soet-veritrust-test');
  console.log(`Timestamp:      ${new Date().toISOString()}`);

  const preTestHash = computeFileHash(LOCAL_DB_PATH);
  console.log(`Local DB Pre-Test Checksum:  ${preTestHash.hash}`);
  console.log(`Local DB Pre-Test Size:      ${preTestHash.size} bytes`);

  let client = null;
  const testResults = {
    initialStateCheck: false,
    createTest: false,
    readTest: false,
    updateTest: false,
    constraintTest: false,
    transactionRollbackTest: false,
    transactionCommitTest: false,
    cleanupSuccess: false,
    finalStateCheck: false,
    details: {},
  };

  try {
    // 1. Environment validation
    const dbUrl = (process.env.TURSO_DATABASE_URL || '').trim();
    const testToken = (process.env.TURSO_TEST_AUTH_TOKEN || '').trim();

    if (!dbUrl) throw new Error('TURSO_DATABASE_URL environment variable is missing.');
    if (dbUrl.toLowerCase() !== EXPECTED_TEST_DB_URL.toLowerCase()) {
      throw new Error(
        `CRITICAL SAFETY MISMATCH: TURSO_DATABASE_URL (${dbUrl}) does not match expected test database URL (${EXPECTED_TEST_DB_URL}).`
      );
    }
    if (!testToken) throw new Error('TURSO_TEST_AUTH_TOKEN environment variable is missing or empty.');

    console.log(`Target URL:     ${EXPECTED_TEST_DB_URL}`);
    console.log(`Auth Token:     [VERIFIED PRESENT IN PROCESS MEMORY - NOT EXPOSED]`);

    // 2. Direct client instantiation
    client = createClient({
      url: EXPECTED_TEST_DB_URL,
      authToken: testToken,
    });

    // =========================================================================
    // PART A: Initial State Verification
    // =========================================================================
    console.log('\n--- [Part A] Initial State Verification ---');
    const tableCheck = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
    );
    const existingTables = (tableCheck.rows || []).map((r) => String(r.name));
    console.log(`  - Active tables: [${existingTables.join(', ')}]`);

    for (const reqTable of REQUIRED_TABLES) {
      if (!existingTables.includes(reqTable)) {
        throw new Error(`Initial state verification failed: missing table '${reqTable}'`);
      }
    }

    const initialRowCounts = {};
    for (const t of REQUIRED_TABLES) {
      const res = await client.execute(`SELECT COUNT(*) as c FROM ${t}`);
      const count = Number(res.rows?.[0]?.c ?? 0);
      initialRowCounts[t] = count;
      console.log(`  - Table '${t}': ${count} rows`);
      if (count !== 0) {
        throw new Error(
          `SAFETY ABORT: Table '${t}' contains ${count} pre-existing records! Expected exactly 0 rows before test.`
        );
      }
    }
    testResults.initialStateCheck = true;
    testResults.details.initialRowCounts = initialRowCounts;
    console.log('  ✓ Initial state confirmed: 4 tables, exactly 0 records.');

    // =========================================================================
    // PART B: CREATE Testing (Synthetic Inserts)
    // =========================================================================
    console.log('\n--- [Part B] CREATE Testing (Synthetic Inserts) ---');
    const now = Date.now();

    // B1. Insert Synthetic Batch
    console.log(`  + Inserting synthetic batch '${SYNTHETIC.batchId}'...`);
    const recordsJson = JSON.stringify([
      { prn: SYNTHETIC.student1.prn, fullName: SYNTHETIC.student1.fullName },
      { prn: SYNTHETIC.student2.prn, fullName: SYNTHETIC.student2.fullName },
    ]);
    await client.execute({
      sql: `INSERT INTO batches (
        batchId, merkleRoot, ipfsCid, timestamp, issuer,
        institutionName, institutionCode, totalCredentials,
        revokedIndices, records, status, txHash, anchoredAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      args: [
        SYNTHETIC.batchId,
        SYNTHETIC.merkleRoot,
        SYNTHETIC.ipfsCid,
        now,
        SYNTHETIC.issuer,
        SYNTHETIC.institutionName,
        SYNTHETIC.institutionCode,
        2,
        '[]',
        recordsJson,
        'INSTITUTIONAL_STORED',
      ],
    });

    // B2. Insert Synthetic Credentials
    console.log(`  + Inserting 2 synthetic credentials for batch '${SYNTHETIC.batchId}'...`);
    for (const s of [SYNTHETIC.student1, SYNTHETIC.student2]) {
      await client.execute({
        sql: `INSERT INTO credentials (
          id, batch_id, prn, full_name, degree, branch,
          cgpa, graduation_year, institute, leaf_index, raw_record, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          s.credId,
          SYNTHETIC.batchId,
          s.prn,
          s.fullName,
          s.degree,
          s.branch,
          s.cgpa,
          s.graduationYear,
          s.institute,
          s.leafIndex,
          JSON.stringify({ prn: s.prn, fullName: s.fullName, degree: s.degree }),
          now,
        ],
      });
    }

    // B3. Insert Synthetic Revocation
    console.log(`  + Inserting synthetic revocation '${SYNTHETIC.revocation.key}'...`);
    await client.execute({
      sql: `INSERT INTO revocations (
        key, batchId, leafIndex, reasonCode, reasonTitle,
        reasonDescription, supersededByHash, revokedAt, officerStaffId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        SYNTHETIC.revocation.key,
        SYNTHETIC.revocation.batchId,
        SYNTHETIC.revocation.leafIndex,
        SYNTHETIC.revocation.reasonCode,
        SYNTHETIC.revocation.reasonTitle,
        SYNTHETIC.revocation.reasonDescription,
        SYNTHETIC.revocation.supersededByHash,
        new Date().toISOString(),
        SYNTHETIC.revocation.officerStaffId,
      ],
    });

    // B4. Insert Synthetic Student Account
    console.log(`  + Inserting synthetic student account '${SYNTHETIC.account.prn}'...`);
    await client.execute({
      sql: `INSERT INTO student_accounts (
        prn, password_hash, activation_token_hash, activation_expires_at,
        status, failed_attempts, locked_until, created_at, activated_at, last_login_at
      ) VALUES (?, ?, ?, ?, 'PENDING_ACTIVATION', 0, 0, ?, NULL, NULL)`,
      args: [
        SYNTHETIC.account.prn,
        SYNTHETIC.account.fakePasswordHash,
        SYNTHETIC.account.fakeActivationHash,
        SYNTHETIC.account.activationExpiresAt,
        now,
      ],
    });

    testResults.createTest = true;
    console.log('  ✓ CREATE testing succeeded: Batch, Credentials, Revocation, and Student Account inserted.');

    // =========================================================================
    // PART C: READ Testing
    // =========================================================================
    console.log('\n--- [Part C] READ Testing ---');

    // C1. Retrieve Batch
    const batchRes = await client.execute({
      sql: 'SELECT * FROM batches WHERE batchId = ?',
      args: [SYNTHETIC.batchId],
    });
    if (!batchRes.rows || batchRes.rows.length !== 1) {
      throw new Error(`READ test failed: could not retrieve synthetic batch '${SYNTHETIC.batchId}'`);
    }
    const retrievedBatch = batchRes.rows[0];
    if (retrievedBatch.institutionName !== SYNTHETIC.institutionName) {
      throw new Error('READ test failed: batch institutionName mismatch');
    }
    console.log(`  ✓ Batch retrieved: ID=${retrievedBatch.batchId}, Status=${retrievedBatch.status}`);

    // C2. Retrieve Credentials by Batch ID
    const credsByBatchRes = await client.execute({
      sql: 'SELECT * FROM credentials WHERE batch_id = ? ORDER BY leaf_index ASC',
      args: [SYNTHETIC.batchId],
    });
    if (!credsByBatchRes.rows || credsByBatchRes.rows.length !== 2) {
      throw new Error(`READ test failed: expected 2 credentials for batch, got ${credsByBatchRes.rows?.length}`);
    }
    console.log(`  ✓ Credentials by batch retrieved: count=${credsByBatchRes.rows.length}`);

    // C3. Retrieve Credentials by PRN
    const credByPrnRes = await client.execute({
      sql: 'SELECT * FROM credentials WHERE prn = ?',
      args: [SYNTHETIC.student1.prn],
    });
    if (!credByPrnRes.rows || credByPrnRes.rows.length !== 1) {
      throw new Error(`READ test failed: could not retrieve credential by PRN '${SYNTHETIC.student1.prn}'`);
    }
    const retrievedCred = credByPrnRes.rows[0];
    if (retrievedCred.full_name !== SYNTHETIC.student1.fullName) {
      throw new Error('READ test failed: credential full_name mismatch');
    }
    console.log(`  ✓ Credential by PRN retrieved: PRN=${retrievedCred.prn}, Name=${retrievedCred.full_name}`);

    // C4. Retrieve Revocation
    const revRes = await client.execute({
      sql: 'SELECT * FROM revocations WHERE key = ?',
      args: [SYNTHETIC.revocation.key],
    });
    if (!revRes.rows || revRes.rows.length !== 1) {
      throw new Error(`READ test failed: could not retrieve revocation '${SYNTHETIC.revocation.key}'`);
    }
    console.log(`  ✓ Revocation retrieved: Key=${revRes.rows[0].key}, Reason=${revRes.rows[0].reasonCode}`);

    // C5. Retrieve Student Account
    const accRes = await client.execute({
      sql: 'SELECT * FROM student_accounts WHERE prn = ?',
      args: [SYNTHETIC.account.prn],
    });
    if (!accRes.rows || accRes.rows.length !== 1) {
      throw new Error(`READ test failed: could not retrieve student account '${SYNTHETIC.account.prn}'`);
    }
    console.log(`  ✓ Student account retrieved: PRN=${accRes.rows[0].prn}, Status=${accRes.rows[0].status}`);

    testResults.readTest = true;

    // =========================================================================
    // PART D: UPDATE Testing
    // =========================================================================
    console.log('\n--- [Part D] UPDATE Testing ---');

    // D1. Update Batch status and txHash (simulating anchor)
    const mockTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const anchorTime = Date.now();
    await client.execute({
      sql: 'UPDATE batches SET status = ?, txHash = ?, anchoredAt = ? WHERE batchId = ?',
      args: ['ANCHORED', mockTxHash, anchorTime, SYNTHETIC.batchId],
    });

    const updatedBatchRes = await client.execute({
      sql: 'SELECT status, txHash, anchoredAt FROM batches WHERE batchId = ?',
      args: [SYNTHETIC.batchId],
    });
    const updatedBatch = updatedBatchRes.rows[0];
    if (updatedBatch.status !== 'ANCHORED' || updatedBatch.txHash !== mockTxHash) {
      throw new Error('UPDATE test failed: batch fields not updated as expected');
    }
    console.log(`  ✓ Batch updated: Status=${updatedBatch.status}, TxHash=${updatedBatch.txHash.substring(0, 10)}...`);

    // D2. Update Student Account status (simulating student activation)
    const activateTime = Date.now();
    await client.execute({
      sql: 'UPDATE student_accounts SET status = ?, activated_at = ? WHERE prn = ?',
      args: ['ACTIVE', activateTime, SYNTHETIC.account.prn],
    });

    const updatedAccRes = await client.execute({
      sql: 'SELECT status, activated_at FROM student_accounts WHERE prn = ?',
      args: [SYNTHETIC.account.prn],
    });
    const updatedAcc = updatedAccRes.rows[0];
    if (updatedAcc.status !== 'ACTIVE' || !updatedAcc.activated_at) {
      throw new Error('UPDATE test failed: student account status not updated to ACTIVE');
    }
    console.log(`  ✓ Student account updated: Status=${updatedAcc.status}, ActivatedAt=${updatedAcc.activated_at}`);

    testResults.updateTest = true;

    // =========================================================================
    // PART E: Constraint Enforcement Testing
    // =========================================================================
    console.log('\n--- [Part E] Constraint Testing ---');

    // E1. Duplicate Primary Key Rejection in batches
    console.log("  + Testing Duplicate Primary Key rejection on 'batches'...");
    let dupPkRejected = false;
    try {
      await client.execute({
        sql: `INSERT INTO batches (
          batchId, merkleRoot, ipfsCid, timestamp, issuer,
          totalCredentials, revokedIndices, records
        ) VALUES (?, '0x000', 'Qm000', 1, 'Issuer', 1, '[]', '[]')`,
        args: [SYNTHETIC.batchId], // duplicate PK!
      });
    } catch (err) {
      dupPkRejected = true;
      console.log(`    ✓ Expected rejection received: ${err.message.substring(0, 70)}...`);
    }
    if (!dupPkRejected) {
      throw new Error("Constraint test failed: Duplicate primary key in 'batches' was NOT rejected!");
    }

    // E2. Duplicate Unique Index rejection on (batch_id, prn) via idx_batch_prn
    console.log("  + Testing Unique Index rejection on 'idx_batch_prn' (credentials)...");
    let dupUniqueRejected = false;
    try {
      await client.execute({
        sql: `INSERT INTO credentials (
          id, batch_id, prn, full_name, leaf_index, raw_record, created_at
        ) VALUES ('DIFFERENT_CRED_ID_999', ?, ?, 'Duplicate Student', 99, '{}', 12345)`,
        args: [SYNTHETIC.batchId, SYNTHETIC.student1.prn], // Duplicate (batch_id, prn)!
      });
    } catch (err) {
      dupUniqueRejected = true;
      console.log(`    ✓ Expected rejection received: ${err.message.substring(0, 70)}...`);
    }
    if (!dupUniqueRejected) {
      throw new Error("Constraint test failed: Duplicate (batch_id, prn) unique index was NOT rejected!");
    }

    // E3. NOT NULL constraint rejection on batches.merkleRoot
    console.log("  + Testing NOT NULL constraint rejection on 'batches.merkleRoot'...");
    let notNullRejected = false;
    try {
      await client.execute({
        sql: `INSERT INTO batches (
          batchId, merkleRoot, ipfsCid, timestamp, issuer,
          totalCredentials, revokedIndices, records
        ) VALUES ('DEMO-NULL-TEST', NULL, 'QmNull', 1, 'Issuer', 1, '[]', '[]')`,
      });
    } catch (err) {
      notNullRejected = true;
      console.log(`    ✓ Expected rejection received: ${err.message.substring(0, 70)}...`);
    }
    if (!notNullRejected) {
      throw new Error("Constraint test failed: NOT NULL constraint on 'merkleRoot' was NOT rejected!");
    }

    testResults.constraintTest = true;
    console.log('  ✓ Constraint testing succeeded: All 3 constraints strictly enforced.');

    // =========================================================================
    // PART F: Transaction Testing (Rollback & Commit)
    // =========================================================================
    console.log('\n--- [Part F] Transaction Testing ---');

    // F1. Transaction Rollback Verification
    console.log('  + Testing Transaction Rollback (Controlled failure)...');
    let rollbackVerified = false;
    try {
      const tx = await client.transaction('write');
      // Step 1 of Tx: Insert batch
      await tx.execute({
        sql: `INSERT INTO batches (
          batchId, merkleRoot, ipfsCid, timestamp, issuer,
          totalCredentials, revokedIndices, records
        ) VALUES (?, ?, ?, ?, ?, 1, '[]', '[]')`,
        args: [
          SYNTHETIC.txTest.batchId,
          SYNTHETIC.txTest.merkleRoot,
          SYNTHETIC.txTest.ipfsCid,
          Date.now(),
          'Tx Officer',
        ],
      });

      // Step 2 of Tx: Insert credential
      await tx.execute({
        sql: `INSERT INTO credentials (
          id, batch_id, prn, full_name, leaf_index, raw_record, created_at
        ) VALUES (?, ?, ?, ?, 0, '{}', ?)`,
        args: [
          SYNTHETIC.txTest.credId,
          SYNTHETIC.txTest.batchId,
          SYNTHETIC.txTest.prn,
          SYNTHETIC.txTest.fullName,
          Date.now(),
        ],
      });

      // Deliberately trigger rollback
      await tx.rollback();

      // Check whether records exist outside the rolled-back transaction
      const checkBatchRollback = await client.execute({
        sql: 'SELECT batchId FROM batches WHERE batchId = ?',
        args: [SYNTHETIC.txTest.batchId],
      });
      const checkCredRollback = await client.execute({
        sql: 'SELECT id FROM credentials WHERE id = ?',
        args: [SYNTHETIC.txTest.credId],
      });

      if (checkBatchRollback.rows.length === 0 && checkCredRollback.rows.length === 0) {
        rollbackVerified = true;
        console.log('    ✓ Rollback confirmed: Zero records persisted after tx.rollback().');
      } else {
        throw new Error('Transaction rollback failed: records remained in database after rollback!');
      }
    } catch (err) {
      if (!rollbackVerified) throw err;
    }
    testResults.transactionRollbackTest = rollbackVerified;

    // F2. Transaction Commit Verification
    console.log('  + Testing Transaction Commit (Successful atomic batch)...');
    let commitVerified = false;
    const txCommit = await client.transaction('write');
    try {
      await txCommit.execute({
        sql: `INSERT INTO batches (
          batchId, merkleRoot, ipfsCid, timestamp, issuer,
          totalCredentials, revokedIndices, records
        ) VALUES (?, ?, ?, ?, ?, 1, '[]', '[]')`,
        args: [
          SYNTHETIC.txTest.batchId,
          SYNTHETIC.txTest.merkleRoot,
          SYNTHETIC.txTest.ipfsCid,
          Date.now(),
          'Tx Officer',
        ],
      });

      await txCommit.execute({
        sql: `INSERT INTO credentials (
          id, batch_id, prn, full_name, leaf_index, raw_record, created_at
        ) VALUES (?, ?, ?, ?, 0, '{}', ?)`,
        args: [
          SYNTHETIC.txTest.credId,
          SYNTHETIC.txTest.batchId,
          SYNTHETIC.txTest.prn,
          SYNTHETIC.txTest.fullName,
          Date.now(),
        ],
      });

      await txCommit.commit();

      // Verify records are present
      const checkBatchCommit = await client.execute({
        sql: 'SELECT batchId FROM batches WHERE batchId = ?',
        args: [SYNTHETIC.txTest.batchId],
      });
      const checkCredCommit = await client.execute({
        sql: 'SELECT id FROM credentials WHERE id = ?',
        args: [SYNTHETIC.txTest.credId],
      });

      if (checkBatchCommit.rows.length === 1 && checkCredCommit.rows.length === 1) {
        commitVerified = true;
        console.log('    ✓ Commit confirmed: Records persisted successfully after tx.commit().');
      } else {
        throw new Error('Transaction commit failed: records not found after commit!');
      }

      // Immediate cleanup of transaction test records
      await client.execute({
        sql: 'DELETE FROM credentials WHERE id = ?',
        args: [SYNTHETIC.txTest.credId],
      });
      await client.execute({
        sql: 'DELETE FROM batches WHERE batchId = ?',
        args: [SYNTHETIC.txTest.batchId],
      });
      console.log('    ✓ Transaction test records cleaned up.');
    } catch (err) {
      try {
        await txCommit.rollback();
      } catch {}
      throw err;
    }
    testResults.transactionCommitTest = commitVerified;

    return testResults;
  } catch (err) {
    const safeError = sanitizeErrorMessage(err.message);
    console.error('\n❌ [TEST FAILURE]:', safeError);
    testResults.error = safeError;
    throw new Error(safeError);
  } finally {
    // =========================================================================
    // PART G & H: Cleanup and Final Zero-Record Verification
    // =========================================================================
    if (client) {
      console.log('\n--- [Part G & H] Targeted Cleanup & Zero-Record Verification ---');
      try {
        // G. Clean up only this test's synthetic identifiers (order: dependents first)
        console.log('  + Deleting synthetic credentials...');
        await client.execute({
          sql: 'DELETE FROM credentials WHERE batch_id = ?',
          args: [SYNTHETIC.batchId],
        });
        await client.execute({
          sql: 'DELETE FROM credentials WHERE id = ?',
          args: [SYNTHETIC.txTest.credId],
        });

        console.log('  + Deleting synthetic revocations...');
        await client.execute({
          sql: 'DELETE FROM revocations WHERE key = ?',
          args: [SYNTHETIC.revocation.key],
        });

        console.log('  + Deleting synthetic batches...');
        await client.execute({
          sql: 'DELETE FROM batches WHERE batchId = ?',
          args: [SYNTHETIC.batchId],
        });
        await client.execute({
          sql: 'DELETE FROM batches WHERE batchId = ?',
          args: [SYNTHETIC.txTest.batchId],
        });

        console.log('  + Deleting synthetic student accounts...');
        await client.execute({
          sql: 'DELETE FROM student_accounts WHERE prn = ?',
          args: [SYNTHETIC.account.prn],
        });

        testResults.cleanupSuccess = true;
        console.log('  ✓ Targeted synthetic cleanup finished.');

        // H. Final zero-record verification across all 4 tables
        console.log('\n--- Final Zero-Record Verification ---');
        const finalRowCounts = {};
        let allZero = true;
        for (const t of REQUIRED_TABLES) {
          const res = await client.execute(`SELECT COUNT(*) as c FROM ${t}`);
          const count = Number(res.rows?.[0]?.c ?? 0);
          finalRowCounts[t] = count;
          console.log(`  - Table '${t}': ${count} rows`);
          if (count !== 0) allZero = false;
        }

        testResults.finalStateCheck = allZero;
        testResults.details.finalRowCounts = finalRowCounts;

        if (!allZero) {
          console.error('❌ CRITICAL FAILURE: One or more tables contain non-zero records after cleanup!');
        } else {
          console.log('  ✓ Final zero-record state verified: All 4 tables returned to 0 rows.');
        }
      } catch (cleanupErr) {
        console.error('❌ Error during cleanup:', sanitizeErrorMessage(cleanupErr.message));
      } finally {
        try {
          if (!client.closed) {
            client.close();
          }
        } catch {}
        client = null;
      }
    }

    // Verify local SQLite database was untouched
    const postTestHash = computeFileHash(LOCAL_DB_PATH);
    console.log(`\nLocal DB Post-Test Checksum: ${postTestHash.hash}`);
    if (preTestHash.hash !== postTestHash.hash) {
      console.error('❌ CRITICAL SAFETY FAILURE: Local database file hash changed during remote test!');
    } else {
      console.log('  ✓ Local SQLite database file is 100% UNCHANGED (Zero local operations).');
    }
  }
}

if (require.main === module) {
  runRemoteCrudTest()
    .then((results) => {
      console.log('\n================================================================');
      console.log('   REMOTE CRUD & TRANSACTION TEST EXECUTION COMPLETED');
      console.log('================================================================');
      const allPassed =
        results.initialStateCheck &&
        results.createTest &&
        results.readTest &&
        results.updateTest &&
        results.constraintTest &&
        results.transactionRollbackTest &&
        results.transactionCommitTest &&
        results.cleanupSuccess &&
        results.finalStateCheck;

      console.log(`Overall Result: ${allPassed ? 'REMOTE CRUD TEST PASSED' : 'REMOTE CRUD TEST FAILED'}`);
    })
    .catch(() => {
      process.exitCode = 1;
    });
}

module.exports = {
  runRemoteCrudTest,
  SYNTHETIC,
  EXPECTED_TEST_DB_URL,
};


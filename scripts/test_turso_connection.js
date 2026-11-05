/**
 * SOET VeriTrust - Phase 3C Step 8B: Isolated Turso Connection Test
 *
 * Strictly connection-only, read-only diagnostic script.
 * Verifies connectivity to the isolated Turso test database without:
 * - Using the global database singleton
 * - Accessing or modifying local SQLite databases
 * - Executing any write, DDL, or DML operations
 * - Printing, logging, or exposing authentication tokens
 */

const { createClient } = require('@libsql/client');

const EXPECTED_TEST_DB_URL = 'libsql://soet-veritrust-test-ramsha12.aws-ap-south-1.turso.io';

/**
 * Sanitizes error messages to prevent accidental credential leakage in exception strings.
 */
function sanitizeErrorMessage(msg) {
  if (!msg || typeof msg !== 'string') return 'Unknown error';
  return msg
    .replace(/Bearer\s+[A-Za-z0-9\-_\.]+/gi, 'Bearer [REDACTED]')
    .replace(/authToken=[^&\s]+/gi, 'authToken=[REDACTED]')
    .replace(/token=[^&\s]+/gi, 'token=[REDACTED]');
}

async function runConnectionTest() {
  console.log('===========================================================');
  console.log('   SOET VeriTrust - Isolated Turso Connection Test');
  console.log('===========================================================');
  console.log(`Execution Mode: Strictly Read-Only Connection Diagnostic`);
  console.log(`Timestamp:      ${new Date().toISOString()}`);

  let client = null;

  try {
    // 1. Validate environment variables
    const dbUrl = (process.env.TURSO_DATABASE_URL || '').trim();
    const testToken = (process.env.TURSO_TEST_AUTH_TOKEN || '').trim();

    if (!dbUrl) {
      throw new Error('TURSO_DATABASE_URL environment variable is missing.');
    }

    if (dbUrl.toLowerCase() !== EXPECTED_TEST_DB_URL.toLowerCase()) {
      throw new Error(
        `CRITICAL SAFETY MISMATCH: TURSO_DATABASE_URL (${dbUrl}) does not match expected isolated test database URL (${EXPECTED_TEST_DB_URL}).`
      );
    }

    if (!testToken) {
      throw new Error(
        'TURSO_TEST_AUTH_TOKEN environment variable is missing or empty. Please set it in process memory.'
      );
    }

    console.log(`Target URL:     ${EXPECTED_TEST_DB_URL}`);
    console.log(`Auth Token:     [VERIFIED PRESENT IN MEMORY - NOT EXPOSED]`);

    // 2. Direct client instantiation (isolated from app singleton and local SQLite)
    console.log('\n[Step 1/3] Establishing connection via @libsql/client...');
    client = createClient({
      url: EXPECTED_TEST_DB_URL,
      authToken: testToken,
    });

    // 3. Harmless read-only ping query
    console.log('[Step 2/3] Executing harmless read-only ping query...');
    const pingStart = Date.now();
    const pingResult = await client.execute("SELECT 1 AS connected, datetime('now') AS server_time;");
    const latencyMs = Date.now() - pingStart;

    if (!pingResult.rows || pingResult.rows.length === 0 || pingResult.rows[0].connected !== 1) {
      throw new Error('Unexpected response to connectivity check query.');
    }

    const serverTime = pingResult.rows[0].server_time;
    console.log(`  - Connection Status: CONNECTED`);
    console.log(`  - Round-trip Latency: ${latencyMs} ms`);
    console.log(`  - Remote Server Time: ${serverTime}`);

    // 4. Schema inspection on sqlite_master (strictly read-only)
    console.log('\n[Step 3/3] Inspecting remote sqlite_master for user schema objects...');
    const schemaResult = await client.execute(
      "SELECT type, name, tbl_name FROM sqlite_master WHERE type IN ('table', 'view', 'index') AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
    );

    const userObjects = schemaResult.rows || [];
    console.log(`  - Total User Schema Objects: ${userObjects.length}`);

    if (userObjects.length === 0) {
      console.log('  - Schema State: CLEAN / COMPLETELY EMPTY');
      console.log('  - Confirmation: No tables, views, or indexes exist in the remote database.');
    } else {
      console.log('  - Detected Objects:');
      userObjects.forEach((obj) => {
        console.log(`      * [${obj.type}] ${obj.name} (on ${obj.tbl_name})`);
      });
    }

    // 5. Explicit check for project tables
    const projectCheck = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('batches', 'credentials', 'revocations', 'student_accounts')"
    );

    const projectTables = projectCheck.rows || [];
    if (projectTables.length === 0) {
      console.log('  - Project Tables: ZERO (batches, credentials, revocations, student_accounts do not exist yet)');
      console.log('  - Record Status: ZERO project records present');
    } else {
      console.log(`  - Warning: Found ${projectTables.length} project tables already existing: ${projectTables.map((r) => r.name).join(', ')}`);
    }

    console.log('\n===========================================================');
    console.log('   TURSO CONNECTION TEST COMPLETED SUCCESSFULLY');
    console.log('===========================================================');
    console.log(`Result:                 SUCCESS`);
    console.log(`Database Name:          soet-veritrust-test`);
    console.log(`Remote Region:          AWS AP South 1 (Mumbai)`);
    console.log(`Schema State:           ${userObjects.length === 0 ? 'EMPTY (Ready for Schema Init)' : 'POPULATED'}`);
    console.log(`Local Database State:   UNTOUCHED`);
    console.log(`Credentials Protection: 100% PRESERVED (Zero tokens logged or stored)`);

    return {
      success: true,
      latencyMs,
      serverTime,
      userObjectCount: userObjects.length,
      projectTableCount: projectTables.length,
    };
  } catch (err) {
    const safeError = sanitizeErrorMessage(err.message);
    console.error('\n❌ [CONNECTION FAILED]:', safeError);
    throw new Error(safeError);
  } finally {
    if (client) {
      try {
        if (!client.closed) {
          client.close();
        }
      } catch {}
      client = null;
    }
  }
}

if (require.main === module) {
  runConnectionTest().catch(() => {
    process.exitCode = 1;
  });
}

module.exports = {
  runConnectionTest,
  EXPECTED_TEST_DB_URL,
};

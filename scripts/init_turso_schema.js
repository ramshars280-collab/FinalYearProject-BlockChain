/**
 * SOET VeriTrust - Phase 3C Step 8C: Isolated Remote Schema Initialization
 *
 * Connects directly to the isolated Turso test database using @libsql/client.
 * Creates the exact four SOET VeriTrust application tables and indexes.
 * Does NOT insert default batches, demo credentials, or any records.
 *
 * Safety Rules:
 * - Strictly operates against: libsql://soet-veritrust-test-ramsha12.aws-ap-south-1.turso.io
 * - Reads credentials strictly from process memory ($env:TURSO_TEST_AUTH_TOKEN)
 * - Zero access to local SQLite (data/veritrust.db is never touched)
 * - Zero credentials logged, printed, or exposed
 * - Clean event-loop exit (no process.exit(0) libuv race)
 */

const { createClient } = require('@libsql/client');

const EXPECTED_TEST_DB_URL = 'libsql://soet-veritrust-test-ramsha12.aws-ap-south-1.turso.io';
const REQUIRED_TABLES = ['batches', 'credentials', 'revocations', 'student_accounts'];
const REQUIRED_INDEXES = [
  'idx_batch_prn',
  'idx_credentials_prn',
  'idx_credentials_leaf',
  'idx_student_accounts_status',
];

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

// Exact DDL matching src/lib/db.ts
const DDL_STATEMENTS = [
  {
    type: 'table',
    name: 'batches',
    sql: `
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
    `,
  },
  {
    type: 'table',
    name: 'revocations',
    sql: `
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
    `,
  },
  {
    type: 'table',
    name: 'credentials',
    sql: `
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
    `,
  },
  {
    type: 'index',
    name: 'idx_batch_prn',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_prn ON credentials(batch_id, prn);`,
  },
  {
    type: 'index',
    name: 'idx_credentials_prn',
    sql: `CREATE INDEX IF NOT EXISTS idx_credentials_prn ON credentials(prn);`,
  },
  {
    type: 'index',
    name: 'idx_credentials_leaf',
    sql: `CREATE INDEX IF NOT EXISTS idx_credentials_leaf ON credentials(batch_id, leaf_index);`,
  },
  {
    type: 'table',
    name: 'student_accounts',
    sql: `
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
    `,
  },
  {
    type: 'index',
    name: 'idx_student_accounts_status',
    sql: `CREATE INDEX IF NOT EXISTS idx_student_accounts_status ON student_accounts(status);`,
  },
];

async function runSchemaInit() {
  console.log('===========================================================');
  console.log('   SOET VeriTrust - Isolated Remote Schema Initialization');
  console.log('===========================================================');
  console.log(`Execution Mode: Isolated Remote DDL Only (Zero Records)`);
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

    // 2. Direct client instantiation
    console.log('\n[Step 1/4] Establishing direct connection via @libsql/client...');
    client = createClient({
      url: EXPECTED_TEST_DB_URL,
      authToken: testToken,
    });

    // 3. Pre-initialization safety check on sqlite_master
    console.log('[Step 2/4] Performing pre-initialization safety check...');
    const preCheck = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    const existingTables = (preCheck.rows || []).map((r) => r.name);
    console.log(`  - Existing user tables before init: ${existingTables.length} (${existingTables.join(', ') || 'none'})`);

    const unexpectedTables = existingTables.filter((t) => !REQUIRED_TABLES.includes(t));
    if (unexpectedTables.length > 0) {
      throw new Error(
        `PRE-CHECK ABORTED: Found unexpected tables in remote database: ${unexpectedTables.join(', ')}`
      );
    }

    // 4. Execute DDL statements
    console.log('\n[Step 3/4] Executing schema DDL statements...');
    for (const item of DDL_STATEMENTS) {
      await client.execute(item.sql);
      console.log(`  + Created ${item.type}: ${item.name}`);
    }

    // 5. Post-initialization verification
    console.log('\n[Step 4/4] Verifying initialized remote schema...');

    // 5a. Table verification
    const postTablesCheck = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
    );
    const currentTables = (postTablesCheck.rows || []).map((r) => r.name);
    console.log(`  - Active tables: [${currentTables.join(', ')}]`);

    const missingTables = REQUIRED_TABLES.filter((t) => !currentTables.includes(t));
    if (missingTables.length > 0) {
      throw new Error(`Schema initialization verification failed: missing table(s): ${missingTables.join(', ')}`);
    }

    // 5b. Index verification
    const postIndexCheck = await client.execute(
      "SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
    );
    const currentIndexes = (postIndexCheck.rows || []).map((r) => r.name);
    console.log(`  - Active indexes: [${currentIndexes.join(', ')}]`);

    const missingIndexes = REQUIRED_INDEXES.filter((i) => !currentIndexes.includes(i));
    if (missingIndexes.length > 0) {
      throw new Error(`Schema initialization verification failed: missing index(es): ${missingIndexes.join(', ')}`);
    }

    // 5c. Row count verification (Must be strictly ZERO rows in all tables)
    console.log('\n--- Row Count Verification (Zero-Record Guarantee) ---');
    const rowCounts = {};
    for (const table of REQUIRED_TABLES) {
      const res = await client.execute(`SELECT COUNT(*) as c FROM ${table}`);
      const count = Number(res.rows?.[0]?.c || 0);
      rowCounts[table] = count;
      console.log(`  - Table '${table}': ${count} rows`);
      if (count !== 0) {
        throw new Error(`CRITICAL INTEGRITY FAILURE: Table '${table}' contains ${count} rows! Expected 0 rows.`);
      }
    }

    console.log('\n===========================================================');
    console.log('   REMOTE SCHEMA INITIALIZATION COMPLETED SUCCESSFULLY');
    console.log('===========================================================');
    console.log(`Result:                 SCHEMA_INITIALIZED_EMPTY`);
    console.log(`Database Name:          soet-veritrust-test`);
    console.log(`Tables Created:         ${REQUIRED_TABLES.join(', ')} (All 4 verified)`);
    console.log(`Indexes Created:        ${REQUIRED_INDEXES.join(', ')} (All 4 verified)`);
    console.log(`Row Counts:             batches=0, credentials=0, revocations=0, student_accounts=0`);
    console.log(`Default Batches Seeded: NONE (0 records)`);
    console.log(`Local Database State:   UNTOUCHED`);

    return {
      success: true,
      tables: currentTables,
      indexes: currentIndexes,
      rowCounts,
    };
  } catch (err) {
    const safeError = sanitizeErrorMessage(err.message);
    console.error('\n❌ [SCHEMA INITIALIZATION FAILED]:', safeError);
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
  runSchemaInit().catch(() => {
    process.exitCode = 1;
  });
}

module.exports = {
  runSchemaInit,
  REQUIRED_TABLES,
  REQUIRED_INDEXES,
  EXPECTED_TEST_DB_URL,
};


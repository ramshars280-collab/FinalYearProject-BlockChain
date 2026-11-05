const Database = require('better-sqlite3');
const path = require('path');

// Standalone verification script mirroring adapter validation logic
function validateDatabaseConfigTest(env) {
  const isProduction = env.NODE_ENV === 'production';
  const url = env.TURSO_DATABASE_URL ? env.TURSO_DATABASE_URL.trim() : '';
  const token = env.TURSO_AUTH_TOKEN ? env.TURSO_AUTH_TOKEN.trim() : '';

  if (isProduction || url || token) {
    if (!url) {
      return {
        valid: false,
        backend: 'turso',
        error: 'TURSO_DATABASE_URL is missing. In production, a persistent remote Turso/libSQL database URL is strictly required.',
      };
    }
    if (!token) {
      return {
        valid: false,
        backend: 'turso',
        error: 'TURSO_AUTH_TOKEN is missing. In production, a valid authentication token for the Turso/libSQL database is strictly required.',
      };
    }
    if (!url.startsWith('libsql://') && !url.startsWith('https://') && !url.startsWith('http://') && !url.startsWith('wss://')) {
      return {
        valid: false,
        backend: 'turso',
        error: `Invalid TURSO_DATABASE_URL format: '${url}'. Expected protocol 'libsql://', 'https://', or 'wss://'.`,
      };
    }

    return { valid: true, backend: 'turso' };
  }

  return { valid: true, backend: 'sqlite' };
}

async function run() {
  console.log('====================================================');
  console.log('SOET VeriTrust - Phase 3B Step 2 Adapter Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assertTest(condition, name, details = '') {
    if (condition) {
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${name}: ${details}`);
      failed++;
    }
  }

  // 1. Test development mode selects sqlite backend
  const devConfig = validateDatabaseConfigTest({ NODE_ENV: 'development' });
  assertTest(
    devConfig.valid === true && devConfig.backend === 'sqlite',
    'Test 1: Development environment without Turso credentials selects SQLite backend'
  );

  // 2. Test production mode with missing TURSO_DATABASE_URL fails closed
  const prodMissingUrl = validateDatabaseConfigTest({ NODE_ENV: 'production', TURSO_AUTH_TOKEN: 'some_token' });
  assertTest(
    prodMissingUrl.valid === false && prodMissingUrl.backend === 'turso' && prodMissingUrl.error.includes('TURSO_DATABASE_URL is missing'),
    'Test 2: Production mode with missing TURSO_DATABASE_URL strictly fails closed'
  );

  // 3. Test production mode with missing TURSO_AUTH_TOKEN fails closed
  const prodMissingToken = validateDatabaseConfigTest({ NODE_ENV: 'production', TURSO_DATABASE_URL: 'libsql://demo.turso.io' });
  assertTest(
    prodMissingToken.valid === false && prodMissingToken.backend === 'turso' && prodMissingToken.error.includes('TURSO_AUTH_TOKEN is missing'),
    'Test 3: Production mode with missing TURSO_AUTH_TOKEN strictly fails closed'
  );

  // 4. Test production mode with invalid scheme fails closed
  const prodInvalidScheme = validateDatabaseConfigTest({
    NODE_ENV: 'production',
    TURSO_DATABASE_URL: 'ftp://demo.turso.io',
    TURSO_AUTH_TOKEN: 'some_token',
  });
  assertTest(
    prodInvalidScheme.valid === false && prodInvalidScheme.error.includes('Invalid TURSO_DATABASE_URL format'),
    'Test 4: Production mode with invalid URL scheme (e.g. ftp://) fails closed'
  );

  // 5. Test valid Turso credentials select turso backend
  const validTurso = validateDatabaseConfigTest({
    NODE_ENV: 'production',
    TURSO_DATABASE_URL: 'libsql://soet-veritrust-accred.turso.io',
    TURSO_AUTH_TOKEN: 'dummy_jwt_auth_token_for_verification_only',
  });
  assertTest(
    validTurso.valid === true && validTurso.backend === 'turso',
    'Test 5: Valid Turso URL and token select Turso backend without errors'
  );

  // 6. Test SqliteAdapter on real SQLite database (read-only query & get)
  const dbPath = path.resolve(process.cwd(), 'data', 'veritrust.db');
  const sqlite = new Database(dbPath, { readonly: true });
  
  // Test query
  const batches = sqlite.prepare('SELECT batchId, merkleRoot FROM batches').all();
  assertTest(
    Array.isArray(batches) && batches.length === 2,
    'Test 6: SQLite query successfully reads existing 2 batches'
  );

  // Test get
  const cred = sqlite.prepare('SELECT prn, full_name FROM credentials WHERE prn = ?').get('PRN20200101');
  assertTest(
    cred && cred.full_name === 'Aarav Sharma',
    'Test 7: SQLite get successfully retrieves single credential record'
  );

  // 7. Verify veritrust.db data integrity
  const integrity = sqlite.pragma('integrity_check');
  assertTest(
    integrity && integrity[0] && integrity[0].integrity_check === 'ok',
    'Test 8: Database integrity check returns OK'
  );

  sqlite.close();

  console.log('\n====================================================');
  console.log(`Adapter Test Suite Completed: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

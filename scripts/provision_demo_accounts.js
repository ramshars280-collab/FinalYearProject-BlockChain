const sqlite3 = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'veritrust.db');
const db = new sqlite3(dbPath);

const APPROVED_DEMO_PRNS = [
  'DEMO-CSE-2026-001',
  'DEMO-CSE-2026-002',
  'DEMO-CSE-2026-003',
  'DEMO001',
  'DEMO002',
  'DEMO003',
  'DEMO004',
  'DEMO170',
];

function generateScryptHash(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

console.log('=== BEFORE PROVISIONING STATE ===');
const beforeRows = db
  .prepare(
    'SELECT prn, status, password_hash IS NOT NULL as has_password, failed_attempts, last_login_at FROM student_accounts ORDER BY prn ASC'
  )
  .all();

for (const r of beforeRows) {
  console.log(
    `PRN: ${r.prn.padEnd(20)} | Status: ${r.status.padEnd(20)} | HasPassword: ${String(Boolean(r.has_password)).padEnd(5)}`
  );
}

console.log('\n=== PROVISIONING 8 APPROVED DEMO ACCOUNTS WITH INDIVIDUAL SCRYPT HASHES ===');
const updateStmt = db.prepare(`
  UPDATE student_accounts
  SET password_hash = ?,
      status = 'ACTIVE',
      activated_at = COALESCE(activated_at, ?),
      activation_token_hash = NULL,
      activation_expires_at = NULL,
      failed_attempts = 0,
      locked_until = 0
  WHERE UPPER(prn) = ?
`);

const now = Date.now();
const provisionedHashes = {};

db.transaction(() => {
  for (const prn of APPROVED_DEMO_PRNS) {
    const hash = generateScryptHash('student123');
    provisionedHashes[prn] = hash;
    const result = updateStmt.run(hash, now, prn.toUpperCase());
    console.log(`Provisioned ${prn}: updated rows = ${result.changes}`);
  }
})();

console.log('\n=== AFTER PROVISIONING STATE ===');
const afterRows = db
  .prepare(
    'SELECT prn, status, password_hash IS NOT NULL as has_password, failed_attempts, last_login_at FROM student_accounts ORDER BY prn ASC'
  )
  .all();

for (const r of afterRows) {
  console.log(
    `PRN: ${r.prn.padEnd(20)} | Status: ${r.status.padEnd(20)} | HasPassword: ${String(Boolean(r.has_password)).padEnd(5)}`
  );
}

// Verification checks
console.log('\n=== VERIFYING INDIVIDUAL HASH UNIQUENESS ===');
const hashesList = Object.values(provisionedHashes);
const uniqueHashes = new Set(hashesList);
console.log(`Generated hashes count: ${hashesList.length}, Unique hashes count: ${uniqueHashes.size}`);
if (hashesList.length === uniqueHashes.size) {
  console.log('PASS: Every demo account received a distinct cryptographic salt and scrypt hash!');
} else {
  console.error('FAIL: Duplicate hashes detected!');
}

console.log('\n=== VERIFYING HISTORICAL ACCOUNTS WERE NOT TOUCHED ===');
const historicalPrns = ['PRN20200101', 'PRN20200102', 'PRN20200103', 'PRN20200104'];
for (const prn of historicalPrns) {
  const row = db.prepare('SELECT prn, status, password_hash IS NOT NULL as has_password FROM student_accounts WHERE prn = ?').get(prn);
  console.log(`Historical ${prn}: status=${row.status}, hasPassword=${Boolean(row.has_password)}`);
}

db.close();
console.log('\nProvisioning complete.');


const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(process.cwd(), 'data', 'veritrust.db');
const db = new Database(dbPath);

console.log('Running migration on:', dbPath);

db.exec(`
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

const selectCredPrns = db.prepare("SELECT DISTINCT prn FROM credentials WHERE TRIM(prn) != ''");
const credPrns = selectCredPrns.all();
console.log(`Found ${credPrns.length} distinct credentials in database:`, credPrns);

const insertAccount = db.prepare(`
  INSERT OR IGNORE INTO student_accounts (
    prn, password_hash, activation_token_hash, activation_expires_at,
    status, failed_attempts, locked_until, created_at, activated_at, last_login_at
  ) VALUES (?, NULL, NULL, NULL, 'PENDING_ACTIVATION', 0, 0, ?, NULL, NULL)
`);

const now = Date.now();
for (const item of credPrns) {
  const cleanPrn = String(item.prn || '').trim().toUpperCase();
  if (cleanPrn) {
    insertAccount.run(cleanPrn, now);
  }
}

const rows = db.prepare("SELECT * FROM student_accounts").all();
console.log('student_accounts table successfully migrated with rows:', rows);
db.close();


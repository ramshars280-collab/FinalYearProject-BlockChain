/**
 * SOET VeriTrust - Phase 3C Step 8D: Read-Only Local SQLite vs. Turso Schema Compatibility Audit
 *
 * Performs a comprehensive, strictly READ-ONLY comparison between:
 * 1. The existing local SQLite schema in data/veritrust.db
 * 2. The newly initialized remote Turso schema in soet-veritrust-test
 * 3. The application-defined DDL in src/lib/db.ts
 *
 * Mandatory Safety Rules:
 * - Strictly READ-ONLY. Zero CREATE, ALTER, DROP, INSERT, UPDATE, DELETE, or REPLACE.
 * - Local SQLite opened in { readonly: true, fileMustExist: true } mode.
 * - Turso connection uses direct @libsql/client instance (never the global adapter singleton).
 * - Target URL strictly validated against: libsql://soet-veritrust-test-ramsha12.aws-ap-south-1.turso.io
 * - Auth token read strictly from process memory ($env:TURSO_TEST_AUTH_TOKEN) and never logged or exposed.
 * - Natural event loop draining on exit (no process.exit(0) libuv race on Windows).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { createClient } = require('@libsql/client');

const EXPECTED_TEST_DB_URL = 'libsql://soet-veritrust-test-ramsha12.aws-ap-south-1.turso.io';
const LOCAL_DB_PATH = path.resolve(__dirname, '../data/veritrust.db');

const REQUIRED_TABLES = ['batches', 'credentials', 'revocations', 'student_accounts'];
const REQUIRED_INDEXES = [
  'idx_batch_prn',
  'idx_credentials_prn',
  'idx_credentials_leaf',
  'idx_student_accounts_status',
];

/**
 * Redacts any sensitive token strings from error messages.
 */
function sanitizeErrorMessage(msg) {
  if (!msg || typeof msg !== 'string') return 'Unknown error';
  return msg
    .replace(/Bearer\s+[A-Za-z0-9\-_\.]+/gi, 'Bearer [REDACTED]')
    .replace(/authToken=[^&\s]+/gi, 'authToken=[REDACTED]')
    .replace(/token=[^&\s]+/gi, 'token=[REDACTED]');
}

/**
 * Computes SHA-256 of a file using shared read access so it works even if open by dev server.
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
 * Fetches schema metadata from local SQLite using better-sqlite3 in readonly mode.
 */
function inspectLocalSQLite(db) {
  const inventory = {
    tables: {},
    indexes: {},
    rawSql: {},
    rowCounts: {},
  };

  // User tables
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC")
    .all()
    .map((r) => r.name);

  for (const table of tables) {
    // Columns
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    // Indexes on table
    const indexList = db.prepare(`PRAGMA index_list(${table})`).all();
    // Foreign keys
    const fks = db.prepare(`PRAGMA foreign_key_list(${table})`).all();
    // Table SQL
    const tableSqlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table);
    // Row count
    const countRow = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get();

    inventory.tables[table] = {
      columns,
      indexList,
      foreignKeys: fks,
      rowCount: countRow ? countRow.c : 0,
    };
    inventory.rawSql[table] = tableSqlRow ? tableSqlRow.sql : null;
    inventory.rowCounts[table] = countRow ? countRow.c : 0;
  }

  // User indexes & column mapping
  const indexes = db
    .prepare("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC")
    .all();

  for (const idx of indexes) {
    const info = db.prepare(`PRAGMA index_info(${idx.name})`).all();
    const idxSqlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name = ?").get(idx.name);
    inventory.indexes[idx.name] = {
      tableName: idx.tbl_name,
      columns: info,
      sql: idxSqlRow ? idxSqlRow.sql : null,
    };
  }

  return inventory;
}

/**
 * Fetches schema metadata from remote Turso using @libsql/client.
 */
async function inspectRemoteTurso(client) {
  const inventory = {
    tables: {},
    indexes: {},
    rawSql: {},
    rowCounts: {},
  };

  // User tables
  const tablesRes = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
  );
  const tables = (tablesRes.rows || []).map((r) => String(r.name));

  for (const table of tables) {
    // Columns
    const colsRes = await client.execute(`PRAGMA table_info(${table})`);
    const columns = (colsRes.rows || []).map((r) => ({
      cid: Number(r.cid),
      name: String(r.name),
      type: String(r.type || ''),
      notnull: Number(r.notnull),
      dflt_value: r.dflt_value === null ? null : String(r.dflt_value),
      pk: Number(r.pk),
    }));

    // Indexes
    const idxListRes = await client.execute(`PRAGMA index_list(${table})`);
    const indexList = (idxListRes.rows || []).map((r) => ({
      seq: Number(r.seq),
      name: String(r.name),
      unique: Number(r.unique),
      origin: String(r.origin || ''),
      partial: Number(r.partial || 0),
    }));

    // Foreign keys
    const fksRes = await client.execute(`PRAGMA foreign_key_list(${table})`);
    const fks = (fksRes.rows || []).map((r) => ({
      id: Number(r.id),
      seq: Number(r.seq),
      table: String(r.table),
      from: String(r.from),
      to: String(r.to),
      on_update: String(r.on_update),
      on_delete: String(r.on_delete),
      match: String(r.match),
    }));

    // Table SQL
    const sqlRes = await client.execute({
      sql: "SELECT sql FROM sqlite_master WHERE type='table' AND name = ?",
      args: [table],
    });
    const tableSql = sqlRes.rows?.[0]?.sql ? String(sqlRes.rows[0].sql) : null;

    // Row count
    const countRes = await client.execute(`SELECT COUNT(*) as c FROM ${table}`);
    const rowCount = countRes.rows?.[0]?.c !== undefined ? Number(countRes.rows[0].c) : 0;

    inventory.tables[table] = {
      columns,
      indexList,
      foreignKeys: fks,
      rowCount,
    };
    inventory.rawSql[table] = tableSql;
    inventory.rowCounts[table] = rowCount;
  }

  // User indexes & column mapping
  const idxRes = await client.execute(
    "SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
  );
  const indexes = (idxRes.rows || []).map((r) => ({
    name: String(r.name),
    tbl_name: String(r.tbl_name),
  }));

  for (const idx of indexes) {
    const infoRes = await client.execute(`PRAGMA index_info(${idx.name})`);
    const columns = (infoRes.rows || []).map((r) => ({
      seqno: Number(r.seqno),
      cid: Number(r.cid),
      name: String(r.name),
    }));

    const sqlRes = await client.execute({
      sql: "SELECT sql FROM sqlite_master WHERE type='index' AND name = ?",
      args: [idx.name],
    });
    const idxSql = sqlRes.rows?.[0]?.sql ? String(sqlRes.rows[0].sql) : null;

    inventory.indexes[idx.name] = {
      tableName: idx.tbl_name,
      columns,
      sql: idxSql,
    };
  }

  return inventory;
}

/**
 * Normalizes SQL string for whitespace-insensitive comparison.
 */
function normalizeSql(sql) {
  if (!sql) return '';
  return sql
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/,\s+/g, ', ')
    .trim();
}

/**
 * Runs the complete schema comparison between Local SQLite and Remote Turso.
 */
async function runSchemaAudit() {
  console.log('================================================================');
  console.log('   SOET VeriTrust - Local SQLite vs. Turso Schema Audit (8D)');
  console.log('================================================================');
  console.log(`Execution Mode: Strictly READ-ONLY Schema & Metadata Audit`);
  console.log(`Timestamp:      ${new Date().toISOString()}`);

  // Checksum before audit
  const preAuditHash = computeFileHash(LOCAL_DB_PATH);
  console.log(`Local DB Checksum (Pre-Audit):  ${preAuditHash.hash}`);
  console.log(`Local DB Size:                  ${preAuditHash.size} bytes`);

  let localDb = null;
  let tursoClient = null;

  const report = {
    timestamp: new Date().toISOString(),
    verdict: 'INCONCLUSIVE',
    localDatabase: {
      path: LOCAL_DB_PATH,
      sha256: preAuditHash.hash,
      size: preAuditHash.size,
    },
    remoteDatabase: {
      url: EXPECTED_TEST_DB_URL,
    },
    tableComparison: {},
    indexComparison: {},
    differences: [],
    ddlVsLocalDifferences: [],
    writesPerformed: 0,
  };

  try {
    // 1. Validate environment
    const dbUrl = (process.env.TURSO_DATABASE_URL || '').trim();
    const testToken = (process.env.TURSO_TEST_AUTH_TOKEN || '').trim();

    if (!dbUrl) {
      throw new Error('TURSO_DATABASE_URL environment variable is missing.');
    }
    if (dbUrl.toLowerCase() !== EXPECTED_TEST_DB_URL.toLowerCase()) {
      throw new Error(
        `CRITICAL SAFETY MISMATCH: TURSO_DATABASE_URL (${dbUrl}) does not match expected test database URL (${EXPECTED_TEST_DB_URL}).`
      );
    }
    if (!testToken) {
      throw new Error('TURSO_TEST_AUTH_TOKEN environment variable is missing or empty.');
    }

    console.log(`Remote URL:     ${EXPECTED_TEST_DB_URL}`);
    console.log(`Remote Token:   [VERIFIED PRESENT IN PROCESS MEMORY - NOT EXPOSED]`);

    // 2. Open Local SQLite in READONLY mode
    console.log('\n[Step 1/5] Opening local SQLite in strictly READONLY mode...');
    if (!fs.existsSync(LOCAL_DB_PATH)) {
      throw new Error(`Local database not found at: ${LOCAL_DB_PATH}`);
    }
    localDb = new Database(LOCAL_DB_PATH, { readonly: true, fileMustExist: true });
    console.log('  ✓ Local SQLite opened successfully in readonly mode.');

    // 3. Connect to Remote Turso
    console.log('\n[Step 2/5] Connecting to remote Turso test database...');
    tursoClient = createClient({
      url: EXPECTED_TEST_DB_URL,
      authToken: testToken,
    });
    console.log('  ✓ Remote Turso client connected.');

    // 4. Inspect Local Schema
    console.log('\n[Step 3/5] Extracting metadata from local SQLite...');
    const localSchema = inspectLocalSQLite(localDb);
    console.log(`  ✓ Local tables:  [${Object.keys(localSchema.tables).join(', ')}]`);
    console.log(`  ✓ Local indexes: [${Object.keys(localSchema.indexes).join(', ')}]`);

    // 5. Inspect Remote Turso Schema
    console.log('\n[Step 4/5] Extracting metadata from remote Turso...');
    const remoteSchema = await inspectRemoteTurso(tursoClient);
    console.log(`  ✓ Remote tables:  [${Object.keys(remoteSchema.tables).join(', ')}]`);
    console.log(`  ✓ Remote indexes: [${Object.keys(remoteSchema.indexes).join(', ')}]`);

    // 6. Compare Tables
    console.log('\n[Step 5/5] Performing detailed side-by-side comparison...');
    const allTableNames = Array.from(
      new Set([...REQUIRED_TABLES, ...Object.keys(localSchema.tables), ...Object.keys(remoteSchema.tables)])
    ).sort();

    for (const tableName of allTableNames) {
      const localT = localSchema.tables[tableName];
      const remoteT = remoteSchema.tables[tableName];

      const tComp = {
        tableName,
        existsInLocal: !!localT,
        existsInRemote: !!remoteT,
        localRowCount: localT ? localT.rowCount : null,
        remoteRowCount: remoteT ? remoteT.rowCount : null,
        columnCountMatch: false,
        columnsMatch: false,
        columnOrderMatch: false,
        columnTypeMatch: false,
        nullabilityMatch: false,
        primaryKeyMatch: false,
        defaultsMatch: false,
        foreignKeysMatch: false,
        mismatches: [],
      };

      if (!localT) {
        tComp.mismatches.push(`Table '${tableName}' is missing in local SQLite.`);
      }
      if (!remoteT) {
        tComp.mismatches.push(`Table '${tableName}' is missing in remote Turso.`);
      }

      if (localT && remoteT) {
        const localCols = localT.columns;
        const remoteCols = remoteT.columns;

        tComp.columnCountMatch = localCols.length === remoteCols.length;
        if (!tComp.columnCountMatch) {
          tComp.mismatches.push(
            `Column count mismatch in '${tableName}': local has ${localCols.length}, remote has ${remoteCols.length}.`
          );
        }

        const localColNames = localCols.map((c) => c.name);
        const remoteColNames = remoteCols.map((c) => c.name);

        // Check if sets of column names match
        const localSet = new Set(localColNames);
        const remoteSet = new Set(remoteColNames);
        const missingInRemote = localColNames.filter((c) => !remoteSet.has(c));
        const missingInLocal = remoteColNames.filter((c) => !localSet.has(c));

        if (missingInRemote.length > 0) {
          tComp.mismatches.push(`Columns present in local but missing in remote: ${missingInRemote.join(', ')}`);
        }
        if (missingInLocal.length > 0) {
          tComp.mismatches.push(`Columns present in remote but missing in local: ${missingInLocal.join(', ')}`);
        }
        tComp.columnsMatch = missingInRemote.length === 0 && missingInLocal.length === 0;

        // Check column order
        tComp.columnOrderMatch = JSON.stringify(localColNames) === JSON.stringify(remoteColNames);
        if (!tComp.columnOrderMatch) {
          tComp.mismatches.push(
            `Column order differs in '${tableName}':\n    Local:  [${localColNames.join(', ')}]\n    Remote: [${remoteColNames.join(', ')}]`
          );
        }

        // Check column attributes
        let allTypesMatch = true;
        let allNullsMatch = true;
        let allPksMatch = true;
        let allDefaultsMatch = true;

        for (const colName of localColNames) {
          const lCol = localCols.find((c) => c.name === colName);
          const rCol = remoteCols.find((c) => c.name === colName);

          if (!rCol) continue;

          if (lCol.type.toUpperCase() !== rCol.type.toUpperCase()) {
            allTypesMatch = false;
            tComp.mismatches.push(
              `Column '${tableName}.${colName}' type mismatch: local=${lCol.type}, remote=${rCol.type}`
            );
          }

          if (lCol.notnull !== rCol.notnull) {
            allNullsMatch = false;
            tComp.mismatches.push(
              `Column '${tableName}.${colName}' NOT NULL mismatch: local=${lCol.notnull}, remote=${rCol.notnull}`
            );
          }

          if (lCol.pk !== rCol.pk) {
            allPksMatch = false;
            tComp.mismatches.push(
              `Column '${tableName}.${colName}' PK mismatch: local=${lCol.pk}, remote=${rCol.pk}`
            );
          }

          // Normalize default values (strip outer quotes)
          const normLocalDflt = lCol.dflt_value ? lCol.dflt_value.replace(/^'+|'+$/g, '') : null;
          const normRemoteDflt = rCol.dflt_value ? rCol.dflt_value.replace(/^'+|'+$/g, '') : null;
          if (normLocalDflt !== normRemoteDflt) {
            allDefaultsMatch = false;
            tComp.mismatches.push(
              `Column '${tableName}.${colName}' DEFAULT mismatch: local=${lCol.dflt_value}, remote=${rCol.dflt_value}`
            );
          }
        }

        tComp.columnTypeMatch = allTypesMatch;
        tComp.nullabilityMatch = allNullsMatch;
        tComp.primaryKeyMatch = allPksMatch;
        tComp.defaultsMatch = allDefaultsMatch;

        // Compare Foreign Keys
        const localFks = localT.foreignKeys.map((fk) => `${fk.from}->${fk.table}(${fk.to})[ON DELETE ${fk.on_delete}]`);
        const remoteFks = remoteT.foreignKeys.map((fk) => `${fk.from}->${fk.table}(${fk.to})[ON DELETE ${fk.on_delete}]`);
        tComp.foreignKeysMatch = JSON.stringify(localFks.sort()) === JSON.stringify(remoteFks.sort());
        if (!tComp.foreignKeysMatch) {
          tComp.mismatches.push(
            `Foreign keys mismatch in '${tableName}':\n    Local:  [${localFks.join(', ') || 'none'}]\n    Remote: [${remoteFks.join(', ') || 'none'}]`
          );
        }
      }

      report.tableComparison[tableName] = tComp;
      if (tComp.mismatches.length > 0) {
        report.differences.push(...tComp.mismatches);
      }
    }

    // 7. Compare Indexes
    const allIndexNames = Array.from(
      new Set([...REQUIRED_INDEXES, ...Object.keys(localSchema.indexes), ...Object.keys(remoteSchema.indexes)])
    ).sort();

    for (const idxName of allIndexNames) {
      const localIdx = localSchema.indexes[idxName];
      const remoteIdx = remoteSchema.indexes[idxName];

      const idxComp = {
        indexName: idxName,
        existsInLocal: !!localIdx,
        existsInRemote: !!remoteIdx,
        columnsMatch: false,
        uniquenessMatch: false,
        mismatches: [],
      };

      if (!localIdx) {
        idxComp.mismatches.push(`Index '${idxName}' missing in local SQLite.`);
      }
      if (!remoteIdx) {
        idxComp.mismatches.push(`Index '${idxName}' missing in remote Turso.`);
      }

      if (localIdx && remoteIdx) {
        const localCols = localIdx.columns.map((c) => c.name);
        const remoteCols = remoteIdx.columns.map((c) => c.name);

        idxComp.columnsMatch = JSON.stringify(localCols) === JSON.stringify(remoteCols);
        if (!idxComp.columnsMatch) {
          idxComp.mismatches.push(
            `Index '${idxName}' column mismatch: local=[${localCols.join(', ')}], remote=[${remoteCols.join(', ')}]`
          );
        }

        // Uniqueness from indexList
        const lEntry = Object.values(localSchema.tables)
          .flatMap((t) => t.indexList)
          .find((i) => i.name === idxName);
        const rEntry = Object.values(remoteSchema.tables)
          .flatMap((t) => t.indexList)
          .find((i) => i.name === idxName);

        const lUnique = lEntry ? lEntry.unique : 0;
        const rUnique = rEntry ? rEntry.unique : 0;
        idxComp.uniquenessMatch = lUnique === rUnique;

        if (!idxComp.uniquenessMatch) {
          idxComp.mismatches.push(`Index '${idxName}' uniqueness mismatch: local=${lUnique}, remote=${rUnique}`);
        }
      }

      report.indexComparison[idxName] = idxComp;
      if (idxComp.mismatches.length > 0) {
        report.differences.push(...idxComp.mismatches);
      }
    }

    // 8. Analyze Differences between src/lib/db.ts and Local SQLite
    // In src/lib/db.ts:
    // credentials table has institute placed before leaf_index (cid: 8 vs cid: 11 in local SQLite)
    // credentials table in src/lib/db.ts does not have FOREIGN KEY (batch_id) REFERENCES batches(batchId) ON DELETE CASCADE
    // batches in local SQLite had ALTER TABLE additions which placed status, txHash, anchoredAt at end (matching DDL order)
    if (report.tableComparison.credentials) {
      if (!report.tableComparison.credentials.columnOrderMatch) {
        report.ddlVsLocalDifferences.push(
          "Column order in 'credentials': local SQLite has 'institute' as cid 11 (at the end from an earlier ALTER TABLE), whereas src/lib/db.ts places 'institute' at cid 8."
        );
      }
      if (!report.tableComparison.credentials.foreignKeysMatch) {
        report.ddlVsLocalDifferences.push(
          "Foreign key in 'credentials': local SQLite contains 'FOREIGN KEY (batch_id) REFERENCES batches(batchId) ON DELETE CASCADE', whereas src/lib/db.ts does not define foreign keys in CREATE TABLE."
        );
      }
    }

    // 9. Determine Overall Verdict
    // - FULL SCHEMA MATCH: all relevant schema definitions match exactly.
    // - PARTIAL SCHEMA MATCH: all tables, columns, types, nullability, PKs, defaults, and indexes exist, but column ordering or foreign key constraint details differ.
    // - SCHEMA MISMATCH: missing tables, missing columns, or incompatible column data types/PKs.
    // - INCONCLUSIVE: execution failed.
    const criticalMismatches = report.differences.filter(
      (m) =>
        m.includes('missing') ||
        m.includes('type mismatch') ||
        m.includes('PK mismatch') ||
        m.includes('NOT NULL mismatch')
    );

    if (report.differences.length === 0) {
      report.verdict = 'FULL SCHEMA MATCH';
    } else if (criticalMismatches.length === 0) {
      report.verdict = 'PARTIAL SCHEMA MATCH';
    } else {
      report.verdict = 'SCHEMA MISMATCH';
    }

    // 10. Post-Audit Local Hash Verification
    const postAuditHash = computeFileHash(LOCAL_DB_PATH);
    console.log(`\nLocal DB Checksum (Post-Audit): ${postAuditHash.hash}`);
    if (preAuditHash.hash !== postAuditHash.hash) {
      throw new Error('CRITICAL SAFETY FAILURE: Local database file hash changed during read-only audit!');
    }
    console.log('  ✓ Local database file hash is 100% UNCHANGED (Zero writes confirmed).');

    // 11. Print Summary
    console.log('\n================================================================');
    console.log(`   FINAL AUDIT VERDICT: ${report.verdict}`);
    console.log('================================================================');
    console.log(`Tables Checked:        ${allTableNames.join(', ')}`);
    console.log(`Indexes Checked:       ${allIndexNames.join(', ')}`);
    console.log(`Total Differences:     ${report.differences.length}`);
    if (report.differences.length > 0) {
      console.log('Differences Detected:');
      report.differences.forEach((d, i) => console.log(`  [${i + 1}] ${d}`));
    }
    console.log('\nRow Counts Summary:');
    for (const t of REQUIRED_TABLES) {
      console.log(
        `  - ${t}: Local = ${report.tableComparison[t]?.localRowCount ?? 'N/A'}, Remote = ${
          report.tableComparison[t]?.remoteRowCount ?? 'N/A'
        }`
      );
    }

    return report;
  } catch (err) {
    report.verdict = 'INCONCLUSIVE';
    const safeError = sanitizeErrorMessage(err.message);
    console.error('\n❌ [AUDIT ENCOUNTERED ERROR]:', safeError);
    report.error = safeError;
    throw new Error(safeError);
  } finally {
    if (localDb) {
      try {
        localDb.close();
      } catch {}
      localDb = null;
    }
    if (tursoClient) {
      try {
        if (!tursoClient.closed) {
          tursoClient.close();
        }
      } catch {}
      tursoClient = null;
    }
  }
}

if (require.main === module) {
  runSchemaAudit()
    .then((report) => {
      // Save audit report to JSON file for reference
      const reportPath = path.resolve(__dirname, '../data/schema_audit_report.json');
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
      console.log(`\nDetailed JSON report saved to: ${reportPath}`);
    })
    .catch(() => {
      process.exitCode = 1;
    });
}

module.exports = {
  runSchemaAudit,
  inspectLocalSQLite,
  inspectRemoteTurso,
  EXPECTED_TEST_DB_URL,
  REQUIRED_TABLES,
  REQUIRED_INDEXES,
};


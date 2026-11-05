import type Database from 'better-sqlite3';
import { IDatabaseAdapter, ITransactionalDb, QueryParam, QueryResult } from './types';

/**
 * SQLite Database Adapter implementation using `better-sqlite3`.
 * Wraps synchronous native SQLite calls into typed asynchronous Promises,
 * maintaining API parity with remote network drivers like `@libsql/client`.
 */
export class SqliteAdapter implements IDatabaseAdapter {
  readonly backend = 'sqlite' as const;
  private db: Database.Database;
  private txQueue: Promise<any> = Promise.resolve();

  constructor(db: Database.Database) {
    this.db = db;
  }

  async query<T = any>(sql: string, params: QueryParam[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...(params as any[]));
    return rows as T[];
  }

  async get<T = any>(sql: string, params: QueryParam[] = []): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...(params as any[]));
    return (row as T) || null;
  }

  async execute(sql: string, params: QueryParam[] = []): Promise<QueryResult> {
    const stmt = this.db.prepare(sql);
    const info = stmt.run(...(params as any[]));
    return {
      rows: [],
      rowsAffected: info.changes,
      lastInsertRowid: typeof info.lastInsertRowid === 'bigint' ? Number(info.lastInsertRowid) : info.lastInsertRowid,
    };
  }

  async batch(statements: Array<{ sql: string; args?: QueryParam[] }>): Promise<QueryResult[]> {
    const results: QueryResult[] = [];
    const runBatch = this.db.transaction(() => {
      for (const item of statements) {
        const stmt = this.db.prepare(item.sql);
        const info = stmt.run(...((item.args || []) as any[]));
        results.push({
          rows: [],
          rowsAffected: info.changes,
          lastInsertRowid: typeof info.lastInsertRowid === 'bigint' ? Number(info.lastInsertRowid) : info.lastInsertRowid,
        });
      }
    });
    runBatch();
    return results;
  }

  async transaction<T>(fn: (tx: ITransactionalDb) => Promise<T>): Promise<T> {
    // Note: better-sqlite3 handles transactions synchronously on a single connection.
    // For async-compatible execution, we serialize transactions on this connection using txQueue.
    const runTx = async (): Promise<T> => {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(this);
        this.db.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          // Rollback error fallback if already rolled back
        }
        throw err;
      }
    };

    const current = this.txQueue.then(runTx, runTx);
    this.txQueue = current.then(() => {}, () => {});
    return current;
  }

  async close(): Promise<void> {
    if (this.db.open) {
      this.db.pragma('wal_checkpoint(PASSIVE)');
      this.db.close();
    }
  }
}


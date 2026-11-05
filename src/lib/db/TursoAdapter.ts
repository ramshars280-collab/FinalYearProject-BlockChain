import type { Client, Transaction } from '@libsql/client';
import { IDatabaseAdapter, ITransactionalDb, QueryParam, QueryResult, DatabaseTimeoutError } from './types';

export interface TursoAdapterOptions {
  queryTimeoutMs?: number;
  transactionTimeoutMs?: number;
}

/**
 * Turso / libSQL Database Adapter implementation using `@libsql/client`.
 * Operates natively asynchronously over HTTP/WebSockets, supporting serverless execution.
 *
 * RESILIENCE GUARANTEES:
 * - Bounded query/read timeouts prevent network calls from hanging indefinitely.
 * - Bounded transaction timeouts safeguard batch writes and commit operations.
 * - Automatic rollback on transaction timeout/failure ensures atomicity.
 * - Non-idempotent writes are NOT automatically retried, avoiding duplication.
 * - Zero silent conversions of failures into false successes.
 */
export class TursoAdapter implements IDatabaseAdapter {
  readonly backend = 'turso' as const;
  private client: Client;
  private queryTimeoutMs: number;
  private transactionTimeoutMs: number;

  constructor(client: Client, options?: TursoAdapterOptions) {
    this.client = client;
    this.queryTimeoutMs =
      options?.queryTimeoutMs ??
      parseInt(process.env.TURSO_QUERY_TIMEOUT_MS || '5000', 10);
    this.transactionTimeoutMs =
      options?.transactionTimeoutMs ??
      parseInt(process.env.TURSO_TRANSACTION_TIMEOUT_MS || '15000', 10);
  }

  /**
   * Helper that bounds an asynchronous operation with an explicit timer.
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operation: string,
    onTimeout?: () => void
  ): Promise<T> {
    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        if (onTimeout) {
          try {
            onTimeout();
          } catch { }
        }
        reject(
          new DatabaseTimeoutError(
            `Turso database operation '${operation}' timed out after ${timeoutMs}ms`,
            timeoutMs,
            operation
          )
        );
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async query<T = any>(sql: string, params: QueryParam[] = []): Promise<T[]> {
    return this.withTimeout(
      (async () => {
        const res = await this.client.execute({ sql, args: params as any });
        return res.rows as unknown as T[];
      })(),
      this.queryTimeoutMs,
      'query'
    );
  }

  async get<T = any>(sql: string, params: QueryParam[] = []): Promise<T | null> {
    return this.withTimeout(
      (async () => {
        const res = await this.client.execute({ sql, args: params as any });
        if (!res.rows || res.rows.length === 0) {
          return null;
        }
        return res.rows[0] as unknown as T;
      })(),
      this.queryTimeoutMs,
      'get'
    );
  }

  async execute(sql: string, params: QueryParam[] = []): Promise<QueryResult> {
    return this.withTimeout(
      (async () => {
        const res = await this.client.execute({ sql, args: params as any });
        return {
          rows: res.rows as any[],
          columns: res.columns,
          rowsAffected: res.rowsAffected,
          lastInsertRowid: typeof res.lastInsertRowid === 'bigint' ? Number(res.lastInsertRowid) : res.lastInsertRowid,
        };
      })(),
      this.queryTimeoutMs,
      'execute'
    );
  }

  async batch(statements: Array<{ sql: string; args?: QueryParam[] }>): Promise<QueryResult[]> {
    return this.withTimeout(
      (async () => {
        const batchStatements = statements.map((s) => ({ sql: s.sql, args: (s.args || []) as any }));
        const results = await this.client.batch(batchStatements, 'write');
        return results.map((res) => ({
          rows: res.rows as any[],
          columns: res.columns,
          rowsAffected: res.rowsAffected,
          lastInsertRowid: typeof res.lastInsertRowid === 'bigint' ? Number(res.lastInsertRowid) : res.lastInsertRowid,
        }));
      })(),
      this.transactionTimeoutMs,
      'batch'
    );
  }

  async transaction<T>(fn: (tx: ITransactionalDb) => Promise<T>): Promise<T> {
    let tx: Transaction | null = null;
    let isFinished = false;

    return this.withTimeout(
      (async () => {
        tx = await this.client.transaction('write');
        const txWrapper: ITransactionalDb = {
          query: async <R = any>(sql: string, params: QueryParam[] = []): Promise<R[]> => {
            return this.withTimeout(
              (async () => {
                const res = await tx!.execute({ sql, args: params as any });
                return res.rows as unknown as R[];
              })(),
              this.queryTimeoutMs,
              'tx:query'
            );
          },
          get: async <R = any>(sql: string, params: QueryParam[] = []): Promise<R | null> => {
            return this.withTimeout(
              (async () => {
                const res = await tx!.execute({ sql, args: params as any });
                if (!res.rows || res.rows.length === 0) return null;
                return res.rows[0] as unknown as R;
              })(),
              this.queryTimeoutMs,
              'tx:get'
            );
          },
          execute: async (sql: string, params: QueryParam[] = []): Promise<QueryResult> => {
            return this.withTimeout(
              (async () => {
                const res = await tx!.execute({ sql, args: params as any });
                return {
                  rows: res.rows as any[],
                  columns: res.columns,
                  rowsAffected: res.rowsAffected,
                  lastInsertRowid: typeof res.lastInsertRowid === 'bigint' ? Number(res.lastInsertRowid) : res.lastInsertRowid,
                };
              })(),
              this.queryTimeoutMs,
              'tx:execute'
            );
          },
          batch: async (statements: Array<{ sql: string; args?: QueryParam[] }>): Promise<QueryResult[]> => {
            return this.withTimeout(
              (async () => {
                const batchStatements = statements.map((s) => ({ sql: s.sql, args: (s.args || []) as any }));
                const results = await tx!.batch(batchStatements);
                return results.map((res) => ({
                  rows: res.rows as any[],
                  columns: res.columns,
                  rowsAffected: res.rowsAffected,
                  lastInsertRowid: typeof res.lastInsertRowid === 'bigint' ? Number(res.lastInsertRowid) : res.lastInsertRowid,
                }));
              })(),
              this.transactionTimeoutMs,
              'tx:batch'
            );
          },
        };

        try {
          const result = await fn(txWrapper);
          await tx.commit();
          isFinished = true;
          return result;
        } catch (err) {
          isFinished = true;
          try {
            await tx.rollback();
          } catch {
            // Rollback error fallback if network dropped
          }
          throw err;
        }
      })(),
      this.transactionTimeoutMs,
      'transaction',
      () => {
        // Rollback hook if outer transaction timeout fires
        if (tx && !isFinished) {
          try {
            tx.rollback().catch(() => {});
          } catch {}
        }
      }
    );
  }

  async close(): Promise<void> {
    this.client.close();
  }
}


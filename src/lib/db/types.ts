/**
 * Database Adapter Core Types & Interfaces
 *
 * Defines the vendor-neutral database interface supporting both:
 * 1. Local development SQLite via `better-sqlite3` (wrapped in Promise-based operations)
 * 2. Remote production serverless libSQL via `@libsql/client` (natively asynchronous)
 */

export interface QueryResult<T = any> {
  rows: T[];
  columns?: string[];
  rowsAffected: number;
  lastInsertRowid?: number | bigint;
}

export type QueryParam = string | number | bigint | boolean | Uint8Array | null | undefined;

export interface ITransactionalDb {
  query<T = any>(sql: string, params?: QueryParam[]): Promise<T[]>;
  get<T = any>(sql: string, params?: QueryParam[]): Promise<T | null>;
  execute(sql: string, params?: QueryParam[]): Promise<QueryResult>;
  batch(statements: Array<{ sql: string; args?: QueryParam[] }>): Promise<QueryResult[]>;
}

export interface IDatabaseAdapter extends ITransactionalDb {
  readonly backend: 'sqlite' | 'turso';
  transaction<T>(fn: (tx: ITransactionalDb) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Controlled database timeout error class for bounded operations.
 */
export class DatabaseTimeoutError extends Error {
  readonly code: string = 'DB_TIMEOUT';
  readonly isTimeout: boolean = true;

  constructor(
    message: string,
    public readonly timeoutMs?: number,
    public readonly operation?: string
  ) {
    super(message);
    this.name = 'DatabaseTimeoutError';
    Object.setPrototypeOf(this, DatabaseTimeoutError.prototype);
  }
}

/**
 * Determines if an error represents an infrastructure database failure
 * (connection dropped, timeout exceeded, file locked/inaccessible, network down).
 */
export function isDatabaseUnavailableError(err: any): boolean {
  if (!err) return false;
  if (err instanceof DatabaseTimeoutError || err?.code === 'DB_TIMEOUT' || err?.isTimeout === true) {
    return true;
  }

  const name = String(err?.name || '');
  const msg = String(err?.message || '');
  const code = String(err?.code || '');
  const lowerMsg = msg.toLowerCase();

  if (code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ECONNRESET') {
    return true;
  }
  if (
    name === 'DatabaseTimeoutError' ||
    name === 'TimeoutError' ||
    lowerMsg.includes('timed out') ||
    lowerMsg.includes('timeout')
  ) {
    return true;
  }
  if (
    lowerMsg.includes('database service unavailable') ||
    lowerMsg.includes('database unavailable') ||
    lowerMsg.includes('unable to open database') ||
    lowerMsg.includes('cannot open database') ||
    lowerMsg.includes('directory does not exist') ||
    lowerMsg.includes('disk i/o error') ||
    lowerMsg.includes('database is locked') ||
    lowerMsg.includes('database is busy')
  ) {
    return true;
  }
  if (
    code.startsWith('SQLITE_CANTOPEN') ||
    code.startsWith('SQLITE_IOERR') ||
    code.startsWith('SQLITE_CORRUPT') ||
    code.startsWith('SQLITE_NOTADB') ||
    code.startsWith('SQLITE_BUSY') ||
    code.startsWith('SQLITE_LOCKED')
  ) {
    return true;
  }
  if (
    name.includes('LibsqlError') &&
    (code === 'SERVER_ERROR' || code === 'CANNOT_CONNECT' || code === 'TIMEOUT' || lowerMsg.includes('connect'))
  ) {
    return true;
  }

  return false;
}


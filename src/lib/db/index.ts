import { IDatabaseAdapter } from './types';
import { SqliteAdapter } from './SqliteAdapter';
import { TursoAdapter } from './TursoAdapter';

// Global singleton to prevent connection leaks across Next.js fast-refresh / module reloads
const globalForAdapter = globalThis as unknown as {
  __veritrust_db_adapter?: IDatabaseAdapter;
  __veritrust_adapter_backend?: 'sqlite' | 'turso';
};

export * from './types';
export { SqliteAdapter } from './SqliteAdapter';
export { TursoAdapter } from './TursoAdapter';

export interface DatabaseConfigurationStatus {
  backend: 'sqlite' | 'turso';
  isProduction: boolean;
  isTursoConfigured: boolean;
  databaseUrl?: string;
  tursoError?: string;
}

/**
 * Validates database environment configuration according to deployment mode.
 * In production mode (`NODE_ENV === 'production'`):
 * - TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are strictly required.
 * - Missing or invalid credentials fail closed immediately.
 * - Silent fallback to ephemeral local SQLite in production is strictly prohibited.
 */
export function validateDatabaseConfig(): {
  valid: boolean;
  backend: 'sqlite' | 'turso';
  error?: string;
} {
  const isProduction = process.env.NODE_ENV === 'production';
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const token = process.env.TURSO_AUTH_TOKEN?.trim();

  // Explicit Turso backend requested or running in production
  if (isProduction || url || token) {
    if (!url) {
      return {
        valid: false,
        backend: 'turso',
        error:
          'TURSO_DATABASE_URL is missing. In production, a persistent remote Turso/libSQL database URL is strictly required. ' +
          'Silent fallback to ephemeral local SQLite is prohibited on serverless deployments.',
      };
    }
    if (!token) {
      return {
        valid: false,
        backend: 'turso',
        error:
          'TURSO_AUTH_TOKEN is missing. In production, a valid authentication token for the Turso/libSQL database is strictly required.',
      };
    }
    // Basic scheme validation (libsql://, https://, or wss://)
    if (!url.startsWith('libsql://') && !url.startsWith('https://') && !url.startsWith('http://') && !url.startsWith('wss://')) {
      return {
        valid: false,
        backend: 'turso',
        error: `Invalid TURSO_DATABASE_URL format: '${url}'. Expected protocol 'libsql://', 'https://', or 'wss://'.`,
      };
    }

    return { valid: true, backend: 'turso' };
  }

  // Development mode without Turso credentials -> Use local SQLite
  return { valid: true, backend: 'sqlite' };
}

/**
 * Returns diagnostic metadata regarding current database adapter configuration.
 */
export function getAdapterConfigStatus(): DatabaseConfigurationStatus {
  const isProduction = process.env.NODE_ENV === 'production';
  const validation = validateDatabaseConfig();
  const rawUrl = process.env.TURSO_DATABASE_URL?.trim();

  return {
    backend: validation.backend,
    isProduction,
    isTursoConfigured: Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN),
    databaseUrl: rawUrl ? rawUrl.replace(/:\/\/.*@/, '://***@') : undefined,
    tursoError: validation.valid ? undefined : validation.error,
  };
}

/**
 * Factory that returns the active singleton IDatabaseAdapter.
 * Initializes either TursoAdapter or SqliteAdapter based on verified environment configuration.
 */
export function getDatabaseAdapter(): IDatabaseAdapter {
  if (globalForAdapter.__veritrust_db_adapter) {
    return globalForAdapter.__veritrust_db_adapter;
  }

  const validation = validateDatabaseConfig();
  if (!validation.valid) {
    console.error('[VeriTrust Database Adapter FATAL]:', validation.error);
    throw new Error(`[VeriTrust Database Adapter FATAL] ${validation.error}`);
  }

  if (validation.backend === 'turso') {
    const url = process.env.TURSO_DATABASE_URL!.trim();
    const authToken = process.env.TURSO_AUTH_TOKEN!.trim();
    const queryTimeoutMs = parseInt(process.env.TURSO_QUERY_TIMEOUT_MS || '5000', 10);
    const transactionTimeoutMs = parseInt(process.env.TURSO_TRANSACTION_TIMEOUT_MS || '15000', 10);

    const { createClient } = require('@libsql/client');

    // Create a custom fetch that bounds low-level HTTP requests with an AbortSignal timeout
    const fetchWithTimeout = async (input: any, init?: any) => {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new Error(`Database HTTP transport timed out after ${queryTimeoutMs}ms`)),
        queryTimeoutMs
      );
      try {
        return await globalThis.fetch(input, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    };

    const client = createClient({
      url,
      authToken,
      fetch: fetchWithTimeout,
    });

    const adapter = new TursoAdapter(client, { queryTimeoutMs, transactionTimeoutMs });
    globalForAdapter.__veritrust_db_adapter = adapter;
    globalForAdapter.__veritrust_adapter_backend = 'turso';
    return adapter;
  }

  // Backend is 'sqlite' (local development mode)
  // Safely instantiate local SQLite adapter
  const Database = require('better-sqlite3');
  const path = require('path');
  const dbPath = process.env.DATABASE_PATH?.trim() || path.resolve(process.cwd(), 'data', 'veritrust.db');
  const sqliteDb = new Database(dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('busy_timeout = 5000');
  sqliteDb.pragma('synchronous = NORMAL');
  const adapter = new SqliteAdapter(sqliteDb);

  globalForAdapter.__veritrust_db_adapter = adapter;
  globalForAdapter.__veritrust_adapter_backend = 'sqlite';
  return adapter;
}

/**
 * Closes the active database adapter connection and resets the singleton instance.
 */
export async function closeDatabaseAdapter(): Promise<void> {
  if (globalForAdapter.__veritrust_db_adapter) {
    try {
      await globalForAdapter.__veritrust_db_adapter.close();
    } catch (err: any) {
      console.warn('[VeriTrust Database Adapter] Warning during adapter shutdown:', err.message);
    } finally {
      globalForAdapter.__veritrust_db_adapter = undefined;
      globalForAdapter.__veritrust_adapter_backend = undefined;
    }
  }
}


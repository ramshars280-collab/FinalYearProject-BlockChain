import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * SOET VeriTrust - Request Correlation, Privacy & Structured Logging Utility
 *
 * ARCHITECTURAL SPECIFICATION:
 * 1. Request Correlation:
 *    - Validates incoming `X-Request-ID` against strict pattern: 8 to 64 alphanumeric,
 *      hyphen, or underscore characters (`^[a-zA-Z0-9_-]{8,64}$`).
 *    - Rejects malformed, oversized, or injection-bearing IDs, falling back to a cryptographically
 *      secure random UUID (`crypto.randomUUID()`).
 *    - Guarantees `X-Request-ID` response header propagation across all API endpoints.
 *
 * 2. Structured JSON Logging:
 *    - Standardized JSON log records: timestamp, level, requestId, route, method, statusCode,
 *      durationMs, message, details, and sanitized error categories.
 *    - Durations are consistently recorded in milliseconds (`durationMs`).
 *    - Automated multi-layer sanitization:
 *      * Metadata dictionary key redaction (passwords, tokens, cookies, secrets).
 *      * Message-level regex redaction (URI credentials, bearer tokens, filesystem paths).
 *      * Safe error classification (SYNTAX_ERROR, DATABASE_ERROR, NETWORK_ERROR, AUTH_ERROR).
 *      * No raw request or response bodies are dumped to logs.
 *
 * 3. Safe JSON Body Parsing:
 *    - Catches malformed JSON payloads and returns HTTP 400 with consistent diagnostics,
 *      without leaking unparseable payload snippets into logs.
 */

const REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;

/**
 * Validates whether an incoming candidate string conforms to safe request ID constraints.
 */
export function isValidRequestId(id: unknown): id is string {
  return typeof id === 'string' && REQUEST_ID_REGEX.test(id.trim());
}

/**
 * Resolves or generates a correlation request ID for an incoming HTTP request.
 */
export function getRequestId(
  request?: Request | NextRequest | { headers?: Headers | { get(name: string): string | null } }
): string {
  try {
    if (request && 'headers' in request && request.headers) {
      const headerId = request.headers.get('x-request-id');
      if (headerId && isValidRequestId(headerId)) {
        return headerId.trim();
      }
    }
  } catch {
    // Fall back to newly generated UUID on any inspection failure
  }
  return crypto.randomUUID();
}

/**
 * Keys whose values must always be redacted from structured log records.
 */
const SENSITIVE_KEY_PATTERNS = [
  'password',
  'passwd',
  'token',
  'secret',
  'auth_session',
  'cookie',
  'privatekey',
  'private_key',
  'credential',
  'pinata_jwt',
  'pinata_api_key',
  'pinata_secret',
  'turso_auth_token',
];

/**
 * Recursively redacts sensitive keys from log metadata dictionaries.
 */
export function sanitizeLogDetails(details?: Record<string, any>): Record<string, any> | undefined {
  if (!details || typeof details !== 'object') return undefined;

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(details)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => lowerKey.includes(pattern));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeLogDetails(value);
    } else if (Array.isArray(value)) {
      // Don't dump arbitrary massive arrays into logs
      if (value.length > 20) {
        sanitized[key] = `[Array(${value.length})]`;
      } else {
        sanitized[key] = value.map((item) =>
          typeof item === 'object' && item !== null ? sanitizeLogDetails(item) : item
        );
      }
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitizes an error message string to prevent accidental leakage of
 * passwords, auth tokens, connection URIs, database paths, and system paths.
 */
export function sanitizeErrorMessage(rawMessage?: string): string {
  if (!rawMessage || typeof rawMessage !== 'string') return 'Unknown error';

  let sanitized = rawMessage;

  // 1. Redact URI credentials (e.g. libsql://user:password@host or http://user:pass@host)
  sanitized = sanitized.replace(/(https?|libsql|postgres|mysql|sqlite):\/\/[^\s:@/]+:[^\s:@/]+@/gi, '$1://[REDACTED]:[REDACTED]@');

  // 2. Redact Authorization Bearer tokens
  sanitized = sanitized.replace(/(bearer\s+)[a-zA-Z0-9_\-.~+/=]+/gi, '$1[REDACTED]');

  // 3. Redact JSON key-value pairs matching sensitive names
  sanitized = sanitized.replace(
    /"(password|passwd|token|secret|privatekey|private_key|pinata_jwt|turso_auth_token)"\s*:\s*"[^"]*"/gi,
    '"$1":"[REDACTED]"'
  );

  // 4. Redact Windows absolute filesystem paths (e.g. C:\Users\... or D:\project\...)
  sanitized = sanitized.replace(/[a-zA-Z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*/g, '[PATH_REDACTED]');

  // 5. Redact Unix absolute filesystem paths (e.g. /Users/..., /home/..., /var/...)
  sanitized = sanitized.replace(/(?:\/(?:Users|home|var|tmp|etc|app|workspace|root))\/[^\s'"]+/g, '[PATH_REDACTED]');

  // 6. Redact potential private keys or unanchored hex secrets (64 hex characters)
  sanitized = sanitized.replace(/\b(?:0x)?[0-9a-fA-F]{64}\b/g, '[REDACTED_SECRET]');

  return sanitized;
}

/**
 * Categorizes and sanitizes an error object for structured logging.
 * Replaces unparseable payload snippets and leaks with safe classifications.
 */
export function sanitizeError(err: any): { category: string; name: string; message: string; code?: string | number } | undefined {
  if (!err) return undefined;

  const rawName = typeof err?.name === 'string' ? err.name : 'Error';
  const rawMsg = typeof err?.message === 'string' ? err.message : String(err);
  const code = err?.code;

  let category = 'SYSTEM_ERROR';
  if (rawName === 'SyntaxError' || rawMsg.includes('JSON')) {
    category = 'SYNTAX_ERROR';
  } else if (
    rawName.includes('Sqlite') ||
    rawName.includes('Database') ||
    rawName.includes('Libsql') ||
    rawMsg.includes('SQL') ||
    rawMsg.includes('database') ||
    code === 'DB_TIMEOUT'
  ) {
    category = 'DATABASE_ERROR';
  } else if (rawName.includes('Fetch') || rawMsg.includes('fetch') || rawMsg.includes('ECONN') || rawMsg.includes('ENOTFOUND')) {
    category = 'NETWORK_ERROR';
  } else if (rawName.includes('Auth') || rawMsg.includes('auth') || rawMsg.includes('CSRF')) {
    category = 'AUTH_ERROR';
  }

  // For SyntaxError, never echo payload fragments that failed JSON parsing
  const cleanMsg = category === 'SYNTAX_ERROR'
    ? 'Invalid JSON syntax'
    : sanitizeErrorMessage(rawMsg);

  return {
    category,
    name: rawName,
    message: cleanMsg,
    ...(code !== undefined ? { code } : {}),
  };
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface StructuredLogRecord {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  details?: Record<string, any>;
  error?: {
    category: string;
    name: string;
    message: string;
    code?: string | number;
  };
}

export interface LogContext {
  requestId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  details?: Record<string, any>;
  error?: any;
}

/**
 * Server-side structured JSON logging utility.
 */
export const logger = {
  info(message: string, context?: LogContext): void {
    const record: StructuredLogRecord = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: sanitizeErrorMessage(message),
      requestId: context?.requestId,
      route: context?.route,
      method: context?.method,
      statusCode: context?.statusCode,
      durationMs: context?.durationMs,
      details: sanitizeLogDetails(context?.details),
    };
    console.log(JSON.stringify(record));
  },

  warn(message: string, context?: LogContext): void {
    const record: StructuredLogRecord = {
      timestamp: new Date().toISOString(),
      level: 'WARN',
      message: sanitizeErrorMessage(message),
      requestId: context?.requestId,
      route: context?.route,
      method: context?.method,
      statusCode: context?.statusCode,
      durationMs: context?.durationMs,
      details: sanitizeLogDetails(context?.details),
      error: context?.error ? sanitizeError(context.error) : undefined,
    };
    console.warn(JSON.stringify(record));
  },

  error(message: string, error?: any, context?: LogContext): void {
    const record: StructuredLogRecord = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message: sanitizeErrorMessage(message),
      requestId: context?.requestId,
      route: context?.route,
      method: context?.method,
      statusCode: context?.statusCode,
      durationMs: context?.durationMs,
      details: sanitizeLogDetails(context?.details),
      error: sanitizeError(error ?? context?.error),
    };
    console.error(JSON.stringify(record));
  },
};

/**
 * Creates a standard NextResponse with X-Request-ID guaranteed in headers.
 */
export function jsonResponse(
  data: any,
  init?: {
    status?: number;
    headers?: Record<string, string> | Headers;
  },
  requestId?: string
): NextResponse {
  const headers = new Headers(init?.headers || {});
  if (requestId) {
    headers.set('X-Request-ID', requestId);
  }

  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers,
  });
}

/**
 * Safely parses the JSON body of a request.
 * If JSON parsing fails (SyntaxError), returns HTTP 400 with structured diagnostics
 * without leaking raw payload fragments to logs.
 */
export async function parseJsonBody<T = any>(
  request: Request | NextRequest,
  requestId: string,
  routeContext?: { route?: string; method?: string; startTime?: number }
): Promise<{ success: true; data: T } | { success: false; response: NextResponse }> {
  try {
    const data = (await request.json()) as T;
    return { success: true, data };
  } catch (err: any) {
    const durationMs = routeContext?.startTime ? Date.now() - routeContext.startTime : undefined;
    logger.warn('Malformed or unparseable JSON payload in request body', {
      requestId,
      route: routeContext?.route,
      method: routeContext?.method || 'POST',
      statusCode: 400,
      durationMs,
      error: err,
    });

    return {
      success: false,
      response: jsonResponse(
        {
          success: false,
          error: 'Malformed or invalid JSON payload in request body',
          requestId,
        },
        { status: 400 },
        requestId
      ),
    };
  }
}

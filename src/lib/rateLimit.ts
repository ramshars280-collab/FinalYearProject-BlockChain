/**
 * In-Memory Sliding-Window Rate Limiter for Next.js API Routes.
 *
 * ARCHITECTURAL NOTICE / MULTI-INSTANCE LIMITATION:
 * 1. Process-Local State: This rate limiter stores request timestamps in memory local to the
 *    individual Node.js process runtime. In multi-instance or serverless cluster deployments
 *    (e.g., horizontally scaled Kubernetes pods, AWS ECS tasks, or multi-region serverless
 *    functions), each process maintains an isolated tracking window.
 * 2. Enterprise Cluster Recommendation: For distributed production deployments requiring globally
 *    synchronized rate-limit enforcement across multiple nodes, replace or augment this in-memory
 *    store with a distributed Redis cluster (e.g., Upstash or Redis Cloud).
 *
 * PROXY TRUST & HEADER SECURITY ARCHITECTURE:
 * To prevent malicious clients from bypassing rate limits by spoofing HTTP headers (e.g., rotating
 * arbitrary values in X-Forwarded-For or CF-Connecting-IP), forwarding headers are NEVER trusted
 * by default. Forwarding headers are ONLY processed when TRUST_PROXY="true" (or "1") is explicitly
 * established in the deployment environment. When TRUST_PROXY is false/unset, the rate limiter falls
 * back to the direct socket connection identity provided by the runtime, neutralizing header spoofing.
 */

export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetTime: number; // Unix timestamp in ms when window expires
  totalLimit: number;
}

// In-memory store: key -> array of request timestamps in milliseconds
const rateLimitStore = new Map<string, number[]>();

// Maximum number of distinct tracking keys to prevent unbounded memory growth
const MAX_STORE_KEYS = 10000;

/**
 * Periodically clears expired entries if store grows too large.
 */
function pruneStore(now: number, windowMs: number): void {
  if (rateLimitStore.size > MAX_STORE_KEYS) {
    for (const [key, timestamps] of rateLimitStore.entries()) {
      const active = timestamps.filter((t) => now - t < windowMs);
      if (active.length === 0) {
        rateLimitStore.delete(key);
      } else {
        rateLimitStore.set(key, active);
      }
    }
  }
}

/**
 * Determines whether the current deployment explicitly trusts reverse proxy headers.
 * Supported platforms:
 * 1. Explicit TRUST_PROXY="true" or "1" (for Nginx, AWS CloudFront, Cloudflare).
 * 2. VERCEL="1" (automatically provided by Vercel Edge runtime).
 */
export function isTrustedProxyConfigured(): boolean {
  return process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1' || process.env.VERCEL === '1';
}

/**
 * Validates whether a candidate string is a well-formed IPv4 or IPv6 address.
 * Rejects malformed strings, injection payloads, and excessive lengths.
 */
export function isValidIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string' || ip.length > 45) return false;
  const trimmed = ip.trim();
  // IPv4 regex (0.0.0.0 to 255.255.255.255)
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (ipv4Regex.test(trimmed)) return true;
  // IPv6 regex (including compressed forms like ::1)
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^::1$|^([0-9a-fA-F]{1,4}:)+:[0-9a-fA-F]{1,4}$|^([0-9a-fA-F]{1,4}:)+:(:[0-9a-fA-F]{1,4})+$/;
  return ipv6Regex.test(trimmed);
}

/**
 * Normalizes an IP address string, converting IPv6 loopbacks to standard IPv4 loopback format.
 */
export function normalizeIp(ip: string): string {
  const cleaned = ip.trim().toLowerCase();
  if (cleaned === '::1' || cleaned === '::ffff:127.0.0.1') {
    return '127.0.0.1';
  }
  return cleaned;
}

/**
 * Checks whether an incoming request key exceeds the configured rate limit.
 * Implements a sliding-window algorithm that tracks exact request timestamps.
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions
): RateLimitResult {
  const { maxRequests, windowMs } = options;
  const now = Date.now();
  const windowStart = now - windowMs;

  pruneStore(now, windowMs);

  const timestamps = rateLimitStore.get(key) || [];
  // Filter out timestamps outside the sliding window
  const activeTimestamps = timestamps.filter((ts) => ts > windowStart);

  if (activeTimestamps.length >= maxRequests) {
    // Oldest active request inside the window determines when the next slot frees up
    const oldest = activeTimestamps[0];
    const retryAfterMs = Math.max(0, oldest + windowMs - now);
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    const resetTime = oldest + windowMs;

    rateLimitStore.set(key, activeTimestamps);

    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
      resetTime,
      totalLimit: maxRequests,
    };
  }

  // Request is allowed: record timestamp
  activeTimestamps.push(now);
  rateLimitStore.set(key, activeTimestamps);

  const remaining = Math.max(0, maxRequests - activeTimestamps.length);
  const oldest = activeTimestamps[0];
  const resetTime = oldest + windowMs;

  return {
    allowed: true,
    remaining,
    retryAfterSeconds: 0,
    resetTime,
    totalLimit: maxRequests,
  };
}

/**
 * Extracts client IP address with proxy-trust awareness.
 *
 * Security Rules:
 * 1. If TRUST_PROXY is NOT enabled (default):
 *    Client-supplied headers (x-forwarded-for, cf-connecting-ip, x-real-ip) are strictly IGNORED.
 *    The function uses the runtime socket IP (request.ip) or falls back to '127.0.0.1'.
 * 2. If TRUST_PROXY is enabled:
 *    Headers are inspected in priority order and strictly validated with isValidIp().
 *    Malformed or injection payloads are rejected.
 */
/**
 * Extracts client IP address with proxy-trust awareness.
 *
 * Security Rules:
 * 1. Vercel Platform Trust (when process.env.VERCEL === '1'):
 *    - Strictly checks Vercel's platform-managed header: 'x-vercel-forwarded-for'.
 *    - Falls back to Vercel edge-managed 'x-forwarded-for' (first hop).
 *    - Never trusts arbitrary client-supplied 'cf-connecting-ip' or 'x-real-ip' unless TRUST_PROXY is explicitly enabled.
 * 2. Explicit Reverse Proxy Trust (TRUST_PROXY === 'true' or '1'):
 *    - Operator explicitly configured trust for Cloudflare / Nginx / ALB.
 *    - Priority: cf-connecting-ip -> x-forwarded-for (first hop) -> x-real-ip.
 * 3. Default / Local / Untrusted (TRUST_PROXY unset & VERCEL unset):
 *    - Client-supplied forwarding headers are strictly IGNORED to prevent header spoofing.
 *    - Falls back to runtime socket IP (request.ip) or '127.0.0.1'.
 */
export function getClientIp(
  request: Request | { headers?: Headers | { get(name: string): string | null }; ip?: string }
): string {
  try {
    // Check runtime-level socket IP first (if provided by Next.js / Node.js HTTP server)
    const runtimeIp = 'ip' in request && typeof (request as any).ip === 'string'
      ? (request as any).ip
      : null;

    const headers = 'headers' in request ? request.headers : null;

    // Case 1: Running on Vercel platform
    if (process.env.VERCEL === '1' && headers) {
      // Vercel edge platform-managed header (cannot be spoofed by incoming client)
      const vercelForwarded = headers.get('x-vercel-forwarded-for');
      if (vercelForwarded) {
        const clientCandidate = vercelForwarded.split(',')[0].trim();
        if (isValidIp(clientCandidate)) {
          return normalizeIp(clientCandidate);
        }
      }

      // Vercel edge-managed standard x-forwarded-for (first hop)
      const forwarded = headers.get('x-forwarded-for');
      if (forwarded) {
        const clientCandidate = forwarded.split(',')[0].trim();
        if (isValidIp(clientCandidate)) {
          return normalizeIp(clientCandidate);
        }
      }
    }

    // Case 2: Explicitly configured reverse proxy trust (e.g., Cloudflare, Nginx, ALB)
    if ((process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1') && headers) {
      // 1. Cloudflare Connecting IP (when operator explicitly enables proxy trust)
      const cfIp = headers.get('cf-connecting-ip');
      if (cfIp && isValidIp(cfIp)) {
        return normalizeIp(cfIp);
      }

      // 2. Standard X-Forwarded-For header (first hop)
      const forwarded = headers.get('x-forwarded-for');
      if (forwarded) {
        const clientCandidate = forwarded.split(',')[0].trim();
        if (isValidIp(clientCandidate)) {
          return normalizeIp(clientCandidate);
        }
      }

      // 3. X-Real-IP header
      const realIp = headers.get('x-real-ip');
      if (realIp && isValidIp(realIp)) {
        return normalizeIp(realIp);
      }
    }

    // Case 3: When reverse proxy is not explicitly trusted, do NOT use client-supplied headers.
    if (runtimeIp && isValidIp(runtimeIp)) {
      return normalizeIp(runtimeIp);
    }
  } catch {
    // fallback safely
  }

  return '127.0.0.1';
}

/**
 * Clears the in-memory rate limit store. Useful for unit testing.
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}

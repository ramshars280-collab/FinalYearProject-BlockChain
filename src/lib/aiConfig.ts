/**
 * AI Forensic Microservice Configuration & Endpoint Resolution
 *
 * Resolves process.env.AI_FORENSIC_SERVICE_URL with fallback to http://127.0.0.1:8000.
 * Safely handles trailing slashes, path normalization, and URL validation.
 */

export const DEFAULT_AI_FORENSIC_URL = 'http://127.0.0.1:8000';

/**
 * Resolves the target endpoint URL for the Python FastAPI Error Level Analysis (ELA) microservice.
 * Reads process.env.AI_FORENSIC_SERVICE_URL with fallback to http://127.0.0.1:8000.
 * Safely strips trailing slashes and appends /detect-tampering without duplication.
 */
export function getAIForensicEndpoint(customUrl?: string): string {
  const rawUrl = (customUrl || process.env.AI_FORENSIC_SERVICE_URL || DEFAULT_AI_FORENSIC_URL).trim();
  const sanitizedBase = rawUrl.replace(/\/+$/, '');

  // Prevent duplicating /detect-tampering if already supplied in environment variable
  if (sanitizedBase.endsWith('/detect-tampering')) {
    return sanitizedBase;
  }
  return `${sanitizedBase}/detect-tampering`;
}

/**
 * Resolves the health diagnostic endpoint URL for the Python FastAPI microservice.
 * Strips /detect-tampering if present and appends /health without duplication.
 */
export function getAIForensicHealthEndpoint(customUrl?: string): string {
  const rawUrl = (customUrl || process.env.AI_FORENSIC_SERVICE_URL || DEFAULT_AI_FORENSIC_URL).trim();
  let sanitizedBase = rawUrl.replace(/\/+$/, '');
  if (sanitizedBase.endsWith('/detect-tampering')) {
    sanitizedBase = sanitizedBase.replace(/\/detect-tampering$/, '');
  }
  if (sanitizedBase.endsWith('/health')) {
    return sanitizedBase;
  }
  return `${sanitizedBase}/health`;
}

/**
 * Validates the resolved AI Forensic microservice endpoint URL format and protocol.
 */
export function validateAIForensicUrl(endpoint: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        valid: false,
        error: `Invalid AI forensic URL protocol: '${parsed.protocol}'. Expected 'http:' or 'https:'.`,
      };
    }
    return { valid: true };
  } catch (err: any) {
    return {
      valid: false,
      error: `Malformed AI forensic service URL: '${endpoint}'. ${err?.message || ''}`,
    };
  }
}


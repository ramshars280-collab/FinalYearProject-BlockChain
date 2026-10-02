import crypto from "crypto";

/**
 * Normalizes an academic Permanent Registration Number (PRN):
 * 1. Strips invisible unicode (zero-width spaces \u200B-\u200D, \uFEFF, soft hyphens \u00AD,
 *    word joiners \u2060, and bidirectional control characters).
 * 2. Normalizes non-breaking spaces (\u00A0, \u202F, etc.) and collapses redundant whitespace.
 * 3. Removes internal whitespace to unify formatting (e.g. "PRN 2020 0101" -> "PRN20200101").
 * 4. Enforces uppercase canonical formatting to eliminate false-negative Keccak-256
 *    hash mismatches between batch issuance and PDF text-extraction.
 *
 * @param prn Raw PRN string from user input, OCR, or PDF text stream.
 * @returns Canonical uppercase sanitized PRN string.
 */
export function normalizePRN(prn: string): string {
  if (!prn || typeof prn !== "string") {
    return "";
  }

  return prn
    // Remove invisible unicode characters:
    // \u200B: Zero-width space
    // \u200C: Zero-width non-joiner
    // \u200D: Zero-width joiner
    // \uFEFF: Zero-width no-break space / Byte Order Mark (BOM)
    // \u00AD: Soft hyphen
    // \u2060: Word joiner
    // \u200E, \u200F: Left-to-right and right-to-left marks
    // \u202A-\u202E, \u2066-\u2069: Directional embeddings, isolates, and overrides
    .replace(
      /[\u200B-\u200D\uFEFF\u00AD\u2060\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,
      ""
    )
    // Replace all Unicode whitespace variants (non-breaking space, thin space, etc.) with standard space
    .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, " ")
    // Trim leading/trailing whitespace
    .trim()
    // Remove all internal whitespace characters (PRNs are contiguous alphanumeric tokens)
    .replace(/\s+/g, "")
    // Enforce uppercase canonical formatting
    .toUpperCase();
}

/**
 * Windows reserved device names that cause fatal OS filesystem errors:
 * CON, PRN, AUX, NUL, COM1-COM9, LPT1-LPT9.
 */
const WINDOWS_RESERVED_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

/**
 * Generates an OS-safe filename for credential files and generated PDF certificates.
 *
 * Prevents operating system reserved device collisions on Windows (PRN, CON, AUX, etc.)
 * and path traversal / filesystem corruption caused by invalid characters (\ / : * ? " < > |).
 *
 * Output format: `doc_${sanitizedPRN}_${hash}.${ext}`
 *
 * @param prn Student Permanent Registration Number.
 * @param extension File extension without dot (defaults to "pdf").
 * @returns Safe filesystem-compliant filename string.
 */
export function safePRNFilename(prn: string, extension = "pdf"): string {
  const normalized = normalizePRN(prn);

  // Sanitize for safe filesystem usage: keep only alphanumeric, dashes, and underscores
  let sanitizedPRN = normalized.replace(/[^A-Z0-9_-]/g, "_");

  // Fallback if PRN is empty or completely stripped
  if (!sanitizedPRN) {
    sanitizedPRN = "UNIDENTIFIED";
  }

  // Derive a deterministic 8-character hex hash from the normalized input
  const hash = crypto
    .createHash("sha256")
    .update(normalized || "empty")
    .digest("hex")
    .slice(0, 8);

  // Clean extension (strip leading dots and invalid characters)
  const cleanExt = extension.replace(/^\.+/, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "pdf";

  // Explicit prefix `doc_` guarantees immunity from Windows reserved device names (e.g. PRN.pdf)
  return `doc_${sanitizedPRN}_${hash}.${cleanExt}`;
}

/**
 * Validates whether a normalized string adheres to valid university PRN formats.
 * Accepts formats like "PRN20200101", "PRN20240002", or custom alphanumeric PRN codes.
 */
export function isValidPRNFormat(prn: string): boolean {
  const normalized = normalizePRN(prn);
  if (!normalized || normalized.length < 4 || normalized.length > 32) {
    return false;
  }
  // Must be alphanumeric, with optional hyphens or underscores
  return /^[A-Z0-9_-]+$/.test(normalized);
}

/**
 * Checks if a candidate filename or stem collides with Windows OS reserved names.
 */
export function isWindowsReservedName(name: string): boolean {
  if (!name) return false;
  const stem = name.split(".")[0].toUpperCase().trim();
  return WINDOWS_RESERVED_NAMES.has(stem);
}

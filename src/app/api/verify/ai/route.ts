import { NextRequest } from "next/server";
import { getAIForensicEndpoint, validateAIForensicUrl } from "@/lib/aiConfig";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getRequestId, jsonResponse, logger } from "@/lib/observability";

export const dynamic = "force-dynamic";

/** Maximum permitted PDF upload size: 10MB */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg"];
const AI_INFERENCE_TIMEOUT_MS = 25000; // Dedicated 25-second server timeout for heavy inference

export interface AIScanResponse {
  success: boolean;
  forensic_scan: {
    status: "COMPLETED" | "UNAVAILABLE";
    ai_confidence_score?: number;
    verdict?: "LOW ANOMALY" | "SUSPICIOUS" | "HIGH ANOMALY" | "AUTHENTIC" | "TAMPERED" | string;
    heatmap_base64?: string;
    metadata?: any;
    reason?: string;
  };
  error?: string;
  requestId: string;
}

/**
 * Dedicated AI Forensic Analysis Proxy Route
 *
 * Accepts degree certificate document uploads independently from cryptographic on-chain checks.
 * Forwards binary payloads in-memory to the Python FastAPI microservice without disk persistence.
 * Enforces a dedicated 25000ms timeout matching the microservice physical admission controller.
 */
export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const startTime = Date.now();
  const clientIp = getClientIp(request);

  // Rate limit: 30 requests per minute per IP to protect the physical inference worker
  const rateLimit = checkRateLimit(`verify_ai:${clientIp}`, { maxRequests: 30, windowMs: 60 * 1000 });
  if (!rateLimit.allowed) {
    logger.warn("AI verification rate limit exceeded", {
      requestId,
      route: "/api/verify/ai",
      method: "POST",
      statusCode: 429,
      durationMs: Date.now() - startTime,
      details: { clientIp },
    });
    return jsonResponse(
      {
        success: false,
        error: "Too many AI verification requests. Please try again later.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
        requestId,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
          "X-RateLimit-Limit": String(rateLimit.totalLimit),
          "X-RateLimit-Remaining": "0",
        },
      },
      requestId
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return jsonResponse(
        {
          success: false,
          error: "No certificate file uploaded for AI forensic analysis.",
          requestId,
        },
        { status: 400 },
        requestId
      );
    }

    const fileName = (file.name || "document.pdf").toLowerCase();
    const isAllowedExt = ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext));
    if (!isAllowedExt) {
      return jsonResponse(
        {
          success: false,
          error: `Unsupported file format. Allowed formats: ${ALLOWED_EXTENSIONS.join(", ")}`,
          requestId,
        },
        { status: 400 },
        requestId
      );
    }

    if (file.size === 0) {
      return jsonResponse(
        {
          success: false,
          error: "Uploaded file is empty (0 bytes).",
          requestId,
        },
        { status: 400 },
        requestId
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return jsonResponse(
        {
          success: false,
          error: `File size exceeds the 10MB limit (received ${(file.size / (1024 * 1024)).toFixed(2)} MB).`,
          requestId,
        },
        { status: 413 },
        requestId
      );
    }

    // Resolve AI forensic endpoint
    const endpoint = getAIForensicEndpoint();
    const validation = validateAIForensicUrl(endpoint);

    if (!validation.valid) {
      logger.error("AI forensic service configuration invalid", new Error(validation.error), {
        requestId,
        route: "/api/verify/ai",
      });
      return jsonResponse(
        {
          success: true,
          forensic_scan: {
            status: "UNAVAILABLE",
            reason: "AI forensic service configuration invalid",
          },
          requestId,
        },
        { status: 200 },
        requestId
      );
    }

    // Read binary in-memory without saving to disk
    const arrayBuffer = await file.arrayBuffer();
    const proxyFormData = new FormData();
    const blob = new Blob([Buffer.from(arrayBuffer)], { type: file.type || "application/pdf" });
    proxyFormData.append("file", blob, file.name || "document.pdf");

    // Enforce 25-second server-side timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_INFERENCE_TIMEOUT_MS);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: proxyFormData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle HTTP 503 (Physical worker queue full or queue wait timeout)
      if (res.status === 503) {
        return jsonResponse(
          {
            success: true,
            forensic_scan: {
              status: "UNAVAILABLE",
              reason: "AI forensic microservice queue is at capacity or busy (HTTP 503). Please retry shortly.",
            },
            requestId,
          },
          { status: 200 },
          requestId
        );
      }

      if (!res.ok) {
        return jsonResponse(
          {
            success: true,
            forensic_scan: {
              status: "UNAVAILABLE",
              reason: `AI microservice returned HTTP status ${res.status}`,
            },
            requestId,
          },
          { status: 200 },
          requestId
        );
      }

      let data: any;
      try {
        data = await res.json();
      } catch (parseErr) {
        return jsonResponse(
          {
            success: true,
            forensic_scan: {
              status: "UNAVAILABLE",
              reason: "Malformed JSON response from AI forensic microservice",
            },
            requestId,
          },
          { status: 200 },
          requestId
        );
      }

      // Normalize forensic verdict to standard categories
      const normalizedVerdict =
        data.verdict === "AUTHENTIC"
          ? "LOW ANOMALY"
          : data.verdict === "TAMPERED"
          ? "HIGH ANOMALY"
          : data.verdict || "UNKNOWN";

      // Ensure metadata includes HEURISTIC_BASELINE_UNTRAINED disclosure
      const metadata = {
        ...(data.metadata || {}),
        forensic_mode: data.metadata?.forensic_mode || "HEURISTIC_BASELINE_UNTRAINED",
        model_trained: Boolean(data.metadata?.model_trained),
      };

      return jsonResponse(
        {
          success: true,
          forensic_scan: {
            status: "COMPLETED",
            ai_confidence_score: typeof data.ai_confidence_score === "number" ? data.ai_confidence_score : 0,
            verdict: normalizedVerdict,
            heatmap_base64: data.heatmap_base64 || undefined,
            metadata,
          },
          requestId,
        },
        { status: 200 },
        requestId
      );
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      const isTimeout = fetchErr?.name === "AbortError";
      return jsonResponse(
        {
          success: true,
          forensic_scan: {
            status: "UNAVAILABLE",
            reason: isTimeout
              ? `AI forensic microservice timed out (>${AI_INFERENCE_TIMEOUT_MS / 1000}s)`
              : "AI forensic microservice unavailable or connection refused",
          },
          requestId,
        },
        { status: 200 },
        requestId
      );
    }
  } catch (err: any) {
    logger.error("Error processing AI verification request", err, {
      requestId,
      route: "/api/verify/ai",
      durationMs: Date.now() - startTime,
    });
    return jsonResponse(
      {
        success: false,
        error: "Internal error processing AI forensic verification request.",
        requestId,
      },
      { status: 500 },
      requestId
    );
  }
}


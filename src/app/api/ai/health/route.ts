import { NextRequest } from "next/server";
import { getAIForensicHealthEndpoint, validateAIForensicUrl } from "@/lib/aiConfig";
import { getRequestId, jsonResponse, logger } from "@/lib/observability";

export const dynamic = "force-dynamic";

/**
 * Server-Side AI Forensic Health Proxy
 *
 * Proxies health status from the Python FastAPI microservice to the browser.
 * Protects internal network topologies, ports, and environment variables.
 * Enforces a strict 2000ms timeout with non-blocking error handling.
 */
export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const endpoint = getAIForensicHealthEndpoint();
  const validation = validateAIForensicUrl(endpoint);

  if (!validation.valid) {
    return jsonResponse(
      {
        status: "offline",
        reason: "Invalid AI service configuration",
        requestId,
      },
      { status: 200 },
      requestId
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch(endpoint, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return jsonResponse(
        {
          status: "offline",
          reason: `AI service returned HTTP ${res.status}`,
          requestId,
        },
        { status: 200 },
        requestId
      );
    }

    const data = await res.json();
    const isPhysicallyBusy = Boolean(data?.concurrency_control?.is_physically_busy);
    const waitingInQueue = Number(data?.concurrency_control?.waiting_in_queue || 0);

    return jsonResponse(
      {
        status: "online",
        service: data.service || "AI Forensic Microservice",
        engine: data.engine || "ELAForgeryCNN",
        device: data.device || "cpu",
        model_trained: Boolean(data.model_trained),
        forensic_mode: data.forensic_mode || "HEURISTIC_BASELINE_UNTRAINED",
        is_busy: isPhysicallyBusy,
        waiting_in_queue: waitingInQueue,
        concurrency_control: data.concurrency_control || null,
        requestId,
      },
      { status: 200 },
      requestId
    );
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err?.name === "AbortError";
    return jsonResponse(
      {
        status: "offline",
        reason: isTimeout ? "Timeout querying AI service" : "AI service unavailable",
        requestId,
      },
      { status: 200 },
      requestId
    );
  }
}

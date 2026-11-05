import { NextRequest } from "next/server";
import { buildBatchMerkleTree, createW3CCredential } from "@/lib/crypto";
import {
  INITIAL_STUDENTS_MGM,
  INITIAL_STUDENTS_MGM_BATCH2,
  initializeDefaultBatches,
} from "@/lib/storage";
import { getBatchByIdDb, isDatabaseUnavailableError } from "@/lib/db";
import { BatchRecord } from "@/types";
import { verifyBatchAnchorEvidence } from "@/lib/contracts";
import { getNetworkConfig } from "@/contracts";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getRequestId, jsonResponse, logger } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { batchId: string; leafIndex: string } }
) {
  const requestId = getRequestId(request);
  const startTime = Date.now();

  try {
    const clientIp = getClientIp(request);
    // Rate limit: 60 requests per minute per IP for credential verification queries
    const rateLimit = checkRateLimit(`verify_leaf:${clientIp}`, { maxRequests: 60, windowMs: 60 * 1000 });
    if (!rateLimit.allowed) {
      logger.warn('Leaf verification rate limit exceeded', {
        requestId,
        route: `/api/verify/${params.batchId}/${params.leafIndex}`,
        method: 'GET',
        statusCode: 429,
        durationMs: Date.now() - startTime,
        details: { clientIp },
      });
      return jsonResponse(
        {
          success: false,
          error: "Too many verification requests. Please try again later.",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
          requestId,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
            "X-RateLimit-Limit": String(rateLimit.totalLimit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetTime / 1000)),
          },
        },
        requestId
      );
    }
    const rawBatchId = params.batchId ? decodeURIComponent(params.batchId).trim() : "";
    const rawIndex = params.leafIndex ? decodeURIComponent(params.leafIndex).trim() : "";

    const leafIndex = parseInt(rawIndex, 10);
    if (isNaN(leafIndex) || leafIndex < 0) {
      return jsonResponse(
        { success: false, error: `Invalid leafIndex '${rawIndex}'. Must be a non-negative integer.`, requestId },
        { status: 400 },
        requestId
      );
    }

    // 1. Query database first
    let matchedBatch: BatchRecord | null | undefined = await getBatchByIdDb(rawBatchId);

    // 2. Fall back to hardcoded demo batches only if not in database
    if (!matchedBatch) {
      const defaultBatches = initializeDefaultBatches();
      matchedBatch = defaultBatches.find(
        (b) => b.batchId.toLowerCase() === rawBatchId.toLowerCase()
      );
    }

    // 3. Fall back to second sample batch (MGM-2024-BTECH-BATCH02)
    if (!matchedBatch && rawBatchId.toLowerCase().includes("batch02")) {
      const { rootHex } = buildBatchMerkleTree(INITIAL_STUDENTS_MGM_BATCH2);
      matchedBatch = {
        batchId: "MGM-2024-BTECH-BATCH02",
        merkleRoot: rootHex,
        ipfsCid: "QmYoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
        timestamp: 1718870400,
        issuer: "0x71c56538b15294500b73F8472B4fe963D4e58Bef",
        institutionName: "MGM University, Chhatrapati Sambhajinagar",
        institutionCode: "MGMU-ENG-01",
        totalCredentials: INITIAL_STUDENTS_MGM_BATCH2.length,
        revokedIndices: [],
        records: INITIAL_STUDENTS_MGM_BATCH2,
      };
    }

    if (!matchedBatch) {
      return jsonResponse(
        { success: false, error: `Batch '${rawBatchId}' not found.`, requestId },
        { status: 404 },
        requestId
      );
    }

    if (leafIndex >= matchedBatch.records.length) {
      return jsonResponse(
        {
          success: false,
          error: `Leaf index ${leafIndex} out of bounds for batch '${rawBatchId}' (total: ${matchedBatch.records.length}).`,
          requestId,
        },
        { status: 404 },
        requestId
      );
    }

    const student = matchedBatch.records[leafIndex];
    const treeData = buildBatchMerkleTree(matchedBatch.records);

    let isVerifiedOnChain = false;
    let verifiedEvidence: any = null;
    let resolvedChainId: number | undefined = undefined;

    if (matchedBatch.status === "ANCHORED" && matchedBatch.txHash) {
      try {
        const reqChainId = request.nextUrl.searchParams.get("chainId");
        const chainIdNum = reqChainId && !isNaN(Number(reqChainId)) ? Number(reqChainId) : undefined;
        verifiedEvidence = await verifyBatchAnchorEvidence(
          matchedBatch.batchId,
          matchedBatch.merkleRoot,
          matchedBatch.txHash,
          undefined,
          undefined,
          chainIdNum
        );
        isVerifiedOnChain = verifiedEvidence.isVerifiedOnChain;
        resolvedChainId = verifiedEvidence.chainId;
      } catch (err) {
        isVerifiedOnChain = false;
      }
    }

    const netConfig = getNetworkConfig(resolvedChainId || 11155111);

    const proofData = {
      ...treeData.proofs[leafIndex],
      batchId: matchedBatch.batchId,
      contractAddress: isVerifiedOnChain ? (verifiedEvidence?.contractAddress || netConfig.credentialRegistry) : "",
      network: isVerifiedOnChain ? netConfig.name : "Local Institutional Registry",
      ...(isVerifiedOnChain ? { chainId: resolvedChainId } : {}),
    };

    const credential = createW3CCredential(
      student,
      proofData,
      matchedBatch.issuer,
      matchedBatch.institutionName,
      matchedBatch.institutionCode
    );

    const isRevoked = Array.isArray(matchedBatch.revokedIndices) && matchedBatch.revokedIndices.includes(leafIndex);

    return jsonResponse(
      {
        success: true,
        batchId: matchedBatch.batchId,
        leafIndex,
        isRevoked,
        student,
        proofData,
        credential,
        batchStatus: isVerifiedOnChain
          ? "ANCHORED"
          : (matchedBatch.status === "PENDING_ANCHOR" ? "PENDING_ANCHOR" : "INSTITUTIONAL_STORED"),
        txHash: matchedBatch.txHash || null,
        anchoredAt: matchedBatch.anchoredAt || null,
        isVerifiedOnChain,
        requestId,
      },
      { status: 200 },
      requestId
    );
  } catch (error: any) {
    const isDbDown = isDatabaseUnavailableError(error);
    const statusCode = isDbDown ? 503 : 500;
    logger.error("Public verification API error", error, {
      requestId,
      route: `/api/verify/${params.batchId}/${params.leafIndex}`,
      method: "GET",
      statusCode,
      durationMs: Date.now() - startTime,
    });
    return jsonResponse(
      { success: false, error: isDbDown ? "Database service unavailable" : "Internal server error resolving credential verification", requestId },
      { status: statusCode },
      requestId
    );
  }
}

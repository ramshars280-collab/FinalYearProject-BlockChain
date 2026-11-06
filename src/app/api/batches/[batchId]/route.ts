import { NextRequest } from "next/server";
import { getBatchByIdDb, updateBatchAnchorStatusDb, isDatabaseUnavailableError } from "@/lib/db";
import { initializeDefaultBatches, INITIAL_STUDENTS_MGM_BATCH2 } from "@/lib/storage";
import { buildBatchMerkleTree } from "@/lib/crypto";
import {
  CREDENTIAL_REGISTRY_ABI,
  getProviderForChain,
  verifyBatchAnchorEvidence,
  clearAnchorEvidenceCache,
  verifyContractBytecode,
} from "@/lib/contracts";
import { getNetworkConfig, isSupportedChainId, SupportedChainId } from "@/contracts";
import { verifySessionToken, validateCsrfProtection } from "@/lib/serverAuth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getRequestId, jsonResponse, logger, parseJsonBody } from "@/lib/observability";
import { ethers } from "ethers";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const startTime = Date.now();
  const requestId = getRequestId(request);

  try {
    const clientIp = getClientIp(request);
    // Rate limit: 60 requests per minute per IP for single batch metadata queries
    const rateLimit = checkRateLimit(`batch_get:${clientIp}`, { maxRequests: 60, windowMs: 60 * 1000 });
    if (!rateLimit.allowed) {
      logger.warn('Batch query rate limit exceeded', {
        requestId,
        route: `/api/batches/${params.batchId}`,
        method: 'GET',
        statusCode: 429,
        durationMs: Date.now() - startTime,
        details: { clientIp },
      });
      return jsonResponse(
        {
          success: false,
          error: "Too many batch query requests. Please try again later.",
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
    if (!rawBatchId) {
      return jsonResponse(
        { success: false, error: "Missing required batchId", requestId },
        { status: 400 },
        requestId
      );
    }

    // 1. Check SQLite database
    let batch = await getBatchByIdDb(rawBatchId);

    // 2. Fall back to demo fixtures only if not found in DB
    if (!batch) {
      const defaultBatches = initializeDefaultBatches();
      batch = defaultBatches.find(
        (b) => b.batchId.toLowerCase() === rawBatchId.toLowerCase()
      ) || null;
    }

    if (!batch && rawBatchId.toLowerCase().includes("batch02")) {
      const { rootHex } = buildBatchMerkleTree(INITIAL_STUDENTS_MGM_BATCH2);
      batch = {
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

    if (!batch) {
      return jsonResponse(
        { success: false, error: `Batch "${rawBatchId}" not found in institutional batch registry.`, requestId },
        { status: 404 },
        requestId
      );
    }

    const sessionCookie = request?.cookies?.get("auth_session")?.value;
    const user = sessionCookie ? verifySessionToken(sessionCookie) : null;

    let isVerifiedOnChain = false;
    let onChainReason: string | undefined = undefined;

    if (batch.status === "ANCHORED" && batch.txHash) {
      try {
        const reqChainId = request.nextUrl.searchParams.get("chainId");
        const chainIdNum = reqChainId && !isNaN(Number(reqChainId)) ? Number(reqChainId) : undefined;
        const evidence = await verifyBatchAnchorEvidence(
          batch.batchId,
          batch.merkleRoot,
          batch.txHash,
          undefined,
          undefined,
          chainIdNum
        );
        isVerifiedOnChain = evidence.isVerifiedOnChain;
        onChainReason = evidence.reason;
      } catch (err: any) {
        isVerifiedOnChain = false;
        onChainReason = err?.message || "Verification failed";
      }
    } else {
      isVerifiedOnChain = false;
      onChainReason = batch.status === "PENDING_ANCHOR" ? "Pending blockchain anchoring" : "Institutional storage only";
    }

    // Enforce RBAC filtering on batch records:
    // 1. EXAM_ADMIN: full access to records
    // 2. STUDENT: can only view their own record matching their PRN
    // 3. Unauthenticated / other: records array is redacted ([]), returning only batch-level metadata
    let filteredRecords: any[] = [];
    if (user?.role === "EXAM_ADMIN") {
      const adminInstCode = ((user as any).institutionCode || 'MGMU-ENG-01').trim().toUpperCase();
      const adminWallet = ((user as any).authorizedWallet || '0x8D0cC3553e9d812797B986F15427835A2930a301').trim().toLowerCase();
      const batchInstCode = (batch.institutionCode || '').trim().toUpperCase();
      const batchIssuer = (batch.issuer || '').trim().toLowerCase();
      const isAuthorized = (batchInstCode && batchInstCode === adminInstCode) || (batchIssuer && batchIssuer === adminWallet);
      if (!isAuthorized) {
        return jsonResponse(
          { success: false, error: "Forbidden: You are not authorized to view batches belonging to another institution.", requestId },
          { status: 403 },
          requestId
        );
      }
      filteredRecords = batch.records || [];
    } else if (user?.role === "STUDENT" && user.prn) {
      const studentPrn = user.prn.trim().toUpperCase();
      filteredRecords = (batch.records || []).filter(
        (r: any) => r.prn?.trim().toUpperCase() === studentPrn
      );
    } else {
      filteredRecords = [];
    }

    const verifiedBatch = {
      ...batch,
      records: filteredRecords,
      isVerifiedOnChain,
      onChainReason,
    };

    return jsonResponse({ success: true, batch: verifiedBatch, requestId }, { status: 200 }, requestId);
  } catch (error: any) {
    const isDbDown = isDatabaseUnavailableError(error);
    const statusCode = isDbDown ? 503 : 500;
    logger.error("GET /api/batches/[batchId] error", error, {
      requestId,
      route: `/api/batches/${params.batchId}`,
      method: "GET",
      statusCode,
      durationMs: Date.now() - startTime,
    });
    return jsonResponse(
      { success: false, error: isDbDown ? "Database service unavailable" : "Failed to retrieve batch", requestId },
      { status: statusCode },
      requestId
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const startTime = Date.now();
  const requestId = getRequestId(request);

  try {
    const clientIp = getClientIp(request);
    // Rate limit: 20 requests per minute per IP for on-chain anchor verification and status updates
    const rateLimit = checkRateLimit(`batch_patch:${clientIp}`, { maxRequests: 20, windowMs: 60 * 1000 });
    if (!rateLimit.allowed) {
      logger.warn('Batch patch rate limit exceeded', {
        requestId,
        route: `/api/batches/${params.batchId}`,
        method: 'PATCH',
        statusCode: 429,
        durationMs: Date.now() - startTime,
        details: { clientIp },
      });
      return jsonResponse(
        {
          success: false,
          error: "Too many batch anchor update requests. Please try again later.",
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

    // 1. Verify CSRF
    const csrfCheck = validateCsrfProtection(request);
    if (!csrfCheck.valid) {
      logger.warn('Batch patch failed CSRF validation', {
        requestId,
        route: `/api/batches/${params.batchId}`,
        method: 'PATCH',
        statusCode: 403,
        durationMs: Date.now() - startTime,
        details: { reason: csrfCheck.reason },
      });
      return jsonResponse(
        { success: false, error: "CSRF validation failed: " + csrfCheck.reason, requestId },
        { status: 403 },
        requestId
      );
    }

    // 2. Authenticate Examination Admin
    const sessionCookie = request.cookies.get("auth_session")?.value;
    const user = sessionCookie ? verifySessionToken(sessionCookie) : null;

    if (!user || user.role !== "EXAM_ADMIN") {
      logger.warn('Unauthorized batch patch attempt', {
        requestId,
        route: `/api/batches/${params.batchId}`,
        method: 'PATCH',
        statusCode: 401,
        durationMs: Date.now() - startTime,
      });
      return jsonResponse(
        {
          success: false,
          error: "Unauthorized: Only Examination Authority (EXAM_ADMIN) can verify on-chain anchors and update batch status.",
          requestId,
        },
        { status: 401 },
        requestId
      );
    }

    // 2. Validate batchId
    const rawBatchId = params.batchId ? decodeURIComponent(params.batchId).trim() : "";
    if (!rawBatchId) {
      return jsonResponse(
        { success: false, error: "Missing required batchId parameter", requestId },
        { status: 400 },
        requestId
      );
    }

    // 3. Load existing batch from SQLite
    const existingBatch = await getBatchByIdDb(rawBatchId);
    if (!existingBatch) {
      return jsonResponse(
        { success: false, error: `Batch "${rawBatchId}" not found in institutional database registry.`, requestId },
        { status: 404 },
        requestId
      );
    }

    // Enforce institutional authorization
    const adminInstCode = ((user as any).institutionCode || 'MGMU-ENG-01').trim().toUpperCase();
    const adminWallet = ((user as any).authorizedWallet || '0x8D0cC3553e9d812797B986F15427835A2930a301').trim().toLowerCase();
    const batchInstCode = (existingBatch.institutionCode || '').trim().toUpperCase();
    const batchIssuer = (existingBatch.issuer || '').trim().toLowerCase();
    const isAuthorized = (batchInstCode && batchInstCode === adminInstCode) || (batchIssuer && batchIssuer === adminWallet);
    if (!isAuthorized) {
      return jsonResponse(
        { success: false, error: "Forbidden: You cannot modify batches belonging to another institution.", requestId },
        { status: 403 },
        requestId
      );
    }

    // 4. Parse request body and validate transaction hash
    const parsedBody = await parseJsonBody<{
      txHash?: string;
      expectedChainId?: number;
      expectedContract?: string;
    }>(request, requestId, { route: `/api/batches/${rawBatchId}`, method: "PATCH", startTime });

    if (!parsedBody.success) {
      return parsedBody.response;
    }

    const { txHash, expectedChainId, expectedContract } = parsedBody.data;

    if (!txHash || typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash.trim())) {
      return jsonResponse(
        {
          success: false,
          error: "Invalid transaction hash: Must be a valid 66-character 0x-prefixed hexadecimal transaction hash.",
          requestId,
        },
        { status: 400 },
        requestId
      );
    }

    const cleanTxHash = txHash.trim();

    // 5. Idempotent check for already anchored batch
    if (existingBatch.status === "ANCHORED") {
      if (existingBatch.txHash && existingBatch.txHash.toLowerCase() === cleanTxHash.toLowerCase()) {
        return jsonResponse(
          {
            success: true,
            batch: existingBatch,
            message: `Batch "${rawBatchId}" is already anchored with this transaction hash (idempotent repeat).`,
            requestId,
          },
          { status: 200 },
          requestId
        );
      }

      if (existingBatch.txHash && existingBatch.txHash.toLowerCase() !== cleanTxHash.toLowerCase()) {
        return jsonResponse(
          {
            success: false,
            error: `Conflicting Anchor: Batch "${rawBatchId}" is already anchored with transaction ${existingBatch.txHash}. Cannot overwrite with conflicting transaction ${cleanTxHash}.`,
            requestId,
          },
          { status: 409 },
          requestId
        );
      }
    }

    // 6. Network and provider resolution (Server-controlled only: arbitrary client RPCs disallowed)
    const targetChainId = Number(expectedChainId || process.env.NEXT_PUBLIC_CHAIN_ID || 11155111);
    if (!isSupportedChainId(targetChainId)) {
      return jsonResponse(
        {
          success: false,
          error: `Unsupported chain ID: ${targetChainId}. Supported networks are Hardhat Localhost (31337) and Ethereum Sepolia (11155111).`,
          requestId,
        },
        { status: 400 },
        requestId
      );
    }

    const netConfig = getNetworkConfig(targetChainId);
    const trustedContract = netConfig.credentialRegistry.toLowerCase();

    // Never trust client-supplied contract address without verifying against trusted manifest
    if (expectedContract && expectedContract.trim().toLowerCase() !== trustedContract) {
      return jsonResponse(
        {
          success: false,
          error: `Contract address mismatch: Provided contract (${expectedContract}) does not match trusted ${netConfig.name} registry manifest (${netConfig.credentialRegistry}).`,
          requestId,
        },
        { status: 422 },
        requestId
      );
    }

    let provider: ethers.JsonRpcProvider;
    let network: ethers.Network;

    try {
      provider = getProviderForChain(targetChainId);
      network = await provider.getNetwork();
    } catch (rpcErr: any) {
      logger.error(`RPC connection failure to ${netConfig.name} during anchor verification`, rpcErr, {
        requestId,
        route: `/api/batches/${rawBatchId}`,
        method: "PATCH",
      });
      return jsonResponse(
        {
          success: false,
          error: `RPC Connection Error: Unable to connect to ${netConfig.name} RPC at ${netConfig.rpcUrl}. ${rpcErr?.message || ""}`,
          requestId,
        },
        { status: 503 },
        requestId
      );
    }

    // Verify chain ID matches target network
    if (Number(network.chainId) !== targetChainId) {
      return jsonResponse(
        {
          success: false,
          error: `Network mismatch: Transaction must be on chain ID ${targetChainId} (${netConfig.name}), but connected RPC returned chain ID ${network.chainId}.`,
          requestId,
        },
        { status: 422 },
        requestId
      );
    }

    // Pre-flight check: Verify bytecode at target contract address
    const code = await provider.getCode(trustedContract);
    if (!code || code === "0x" || code.length <= 2) {
      return jsonResponse(
        {
          success: false,
          error: `No deployed smart contract bytecode exists at ${netConfig.credentialRegistry} on ${netConfig.name} (Chain ID ${targetChainId}).`,
          requestId,
        },
        { status: 422 },
        requestId
      );
    }

    // 7. Query transaction receipt
    let receipt: ethers.TransactionReceipt | null = null;
    try {
      receipt = await provider.getTransactionReceipt(cleanTxHash);
    } catch (err: any) {
      return jsonResponse(
        {
          success: false,
          error: `Error querying transaction receipt from ${netConfig.name} RPC: ${err?.message || ""}`,
          requestId,
        },
        { status: 503 },
        requestId
      );
    }

    if (!receipt) {
      return jsonResponse(
        {
          success: false,
          error: `Transaction receipt not found on ${netConfig.name} for hash ${cleanTxHash}. The transaction may still be pending, was not broadcast, or belongs to a different network.`,
          retryable: true,
          requestId,
        },
        { status: 404 },
        requestId
      );
    }

    // 8. Verify receipt status (reverted vs success)
    if (receipt.status !== 1) {
      return jsonResponse(
        {
          success: false,
          error: `Transaction failed or reverted on-chain (status = 0). Batch cannot be marked as ANCHORED.`,
          requestId,
        },
        { status: 422 },
        requestId
      );
    }

    // 9. Verify target contract address
    const targetContract = trustedContract;
    if (!receipt.to || receipt.to.toLowerCase() !== targetContract) {
      return jsonResponse(
        {
          success: false,
          error: `Contract address mismatch: Transaction recipient (${receipt.to || "null"}) does not match expected Credential Registry (${targetContract}).`,
          requestId,
        },
        { status: 422 },
        requestId
      );
    }

    // 10. Decode BatchAnchored event from receipt logs
    const iface = new ethers.Interface(CREDENTIAL_REGISTRY_ABI);
    let matchingEvent: ethers.LogDescription | null = null;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== targetContract) continue;
      try {
        const parsed = iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed && parsed.name === "BatchAnchored") {
          matchingEvent = parsed;
          break;
        }
      } catch {
        // Log is not BatchAnchored or not matching ABI, continue search
      }
    }

    if (!matchingEvent) {
      return jsonResponse(
        {
          success: false,
          error: `BatchAnchored event not found in transaction receipt logs for ${cleanTxHash}.`,
          requestId,
        },
        { status: 422 },
        requestId
      );
    }

    const eventBatchId = String(matchingEvent.args.batchId || "");
    const eventMerkleRoot = String(matchingEvent.args.merkleRoot || "");
    const eventIpfsCid = String(matchingEvent.args.ipfsCid || "");
    let eventTimestamp = Number(matchingEvent.args.timestamp || 0);

    // 11. Verify batch ID
    if (eventBatchId.toLowerCase() !== rawBatchId.toLowerCase()) {
      return jsonResponse(
        {
          success: false,
          error: `Batch ID mismatch: Transaction anchored batch '${eventBatchId}', but requested batch is '${rawBatchId}'.`,
          requestId,
        },
        { status: 422 },
        requestId
      );
    }

    // 12. Verify Merkle root
    if (eventMerkleRoot.toLowerCase() !== existingBatch.merkleRoot.toLowerCase()) {
      return jsonResponse(
        {
          success: false,
          error: `Merkle Root mismatch: Transaction anchored root '${eventMerkleRoot}', but database batch root is '${existingBatch.merkleRoot}'.`,
          requestId,
        },
        { status: 422 },
        requestId
      );
    }

    // 13. Obtain verified block timestamp
    if (receipt.blockNumber) {
      try {
        const block = await provider.getBlock(receipt.blockNumber);
        if (block && typeof block.timestamp === "number") {
          eventTimestamp = block.timestamp;
        }
      } catch {
        // Fall back to event timestamp
      }
    }

    // 14. Update SQLite database status atomically
    const updated = await updateBatchAnchorStatusDb(rawBatchId, {
      txHash: cleanTxHash,
      anchoredAt: eventTimestamp || Math.floor(Date.now() / 1000),
      ipfsCid: eventIpfsCid || existingBatch.ipfsCid,
      status: "ANCHORED",
    });

    clearAnchorEvidenceCache();

    logger.info('Batch successfully verified on-chain and transitioned to ANCHORED', {
      requestId,
      route: `/api/batches/${rawBatchId}`,
      method: "PATCH",
      statusCode: 200,
      durationMs: Date.now() - startTime,
      details: { batchId: rawBatchId, txHash: cleanTxHash },
    });

    return jsonResponse(
      {
        success: true,
        batch: updated,
        message: `Batch "${rawBatchId}" successfully verified on-chain and transitioned to ANCHORED.`,
        requestId,
      },
      { status: 200 },
      requestId
    );
  } catch (error: any) {
    const isDbDown = isDatabaseUnavailableError(error);
    const statusCode = isDbDown ? 503 : 500;
    logger.error("PATCH /api/batches/[batchId] error", error, {
      requestId,
      route: `/api/batches/${params.batchId}`,
      method: "PATCH",
      statusCode,
      durationMs: Date.now() - startTime,
    });
    return jsonResponse(
      { success: false, error: isDbDown ? "Database service unavailable" : "Failed to update batch anchor status", requestId },
      { status: statusCode },
      requestId
    );
  }
}

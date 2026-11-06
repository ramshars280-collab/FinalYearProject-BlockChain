import { NextRequest } from 'next/server';
import { getAllBatchesDb, getBatchByIdDb, saveBatchDb, isDatabaseUnavailableError } from '@/lib/db';
import { verifySessionToken, validateCsrfProtection } from '@/lib/serverAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { BatchRecord } from '@/types';
import { hashCredentialSubject } from '@/lib/crypto';
import { verifyBatchAnchorEvidence, clearAnchorEvidenceCache } from '@/lib/contracts';
import { getRequestId, jsonResponse, logger, parseJsonBody } from '@/lib/observability';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = getRequestId(request);

  try {
    const clientIp = getClientIp(request);
    // Rate limit: 30 requests per minute per IP for batch listings with on-chain verification
    const rateLimit = checkRateLimit(`batches_list:${clientIp}`, { maxRequests: 30, windowMs: 60 * 1000 });
    if (!rateLimit.allowed) {
      logger.warn('Batch listing rate limit exceeded', {
        requestId,
        route: '/api/batches',
        method: 'GET',
        statusCode: 429,
        durationMs: Date.now() - startTime,
        details: { clientIp },
      });
      return jsonResponse(
        {
          success: false,
          error: 'Too many batch list requests. Please try again later.',
          retryAfterSeconds: rateLimit.retryAfterSeconds,
          requestId,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
            'X-RateLimit-Limit': String(rateLimit.totalLimit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetTime / 1000)),
          },
        },
        requestId
      );
    }
    const sessionCookie = request?.cookies?.get('auth_session')?.value;
    const user = sessionCookie ? verifySessionToken(sessionCookie) : null;

    let batches = await getAllBatchesDb();

    // Enforce server-side institutional ownership for EXAM_ADMIN:
    // An issuer must only access batches belonging to their own institution.
    if (user?.role === 'EXAM_ADMIN') {
      const adminInstCode = ((user as any).institutionCode || 'MGMU-ENG-01').trim().toUpperCase();
      const adminWallet = ((user as any).authorizedWallet || '0x8D0cC3553e9d812797B986F15427835A2930a301').trim().toLowerCase();
      batches = batches.filter((b) => {
        const batchInstCode = (b.institutionCode || '').trim().toUpperCase();
        const batchIssuer = (b.issuer || '').trim().toLowerCase();
        return (batchInstCode && batchInstCode === adminInstCode) || (batchIssuer && batchIssuer === adminWallet);
      });
    }
    const verifiedBatches = await Promise.all(
      batches.map(async (b) => {
        // Enforce RBAC filtering on student records:
        // 1. EXAM_ADMIN: full access to all records in the batch
        // 2. STUDENT: can only access their own record matching their PRN
        // 3. Unauthenticated / other: records array is redacted ([]), returning only batch-level metadata
        let records: any[] = [];
        if (user?.role === 'EXAM_ADMIN') {
          records = b.records || [];
        } else if (user?.role === 'STUDENT' && user.prn) {
          const studentPrn = user.prn.trim().toUpperCase();
          records = (b.records || []).filter(
            (r: any) => r.prn?.trim().toUpperCase() === studentPrn
          );
        } else {
          records = [];
        }

        const batchWithFilteredRecords = {
          ...b,
          records,
        };

        if (b.status === 'ANCHORED' && b.txHash) {
          try {
            const evidence = await verifyBatchAnchorEvidence(
              b.batchId,
              b.merkleRoot,
              b.txHash
            );
            return {
              ...batchWithFilteredRecords,
              isVerifiedOnChain: evidence.isVerifiedOnChain,
              onChainReason: evidence.reason,
            };
          } catch (err: any) {
            return {
              ...batchWithFilteredRecords,
              isVerifiedOnChain: false,
              onChainReason: err?.message || 'Verification failed',
            };
          }
        }
        return {
          ...batchWithFilteredRecords,
          isVerifiedOnChain: false,
          onChainReason:
            b.status === 'PENDING_ANCHOR'
              ? 'Pending blockchain anchoring'
              : 'Institutional storage only',
        };
      })
    );
    return jsonResponse({ success: true, batches: verifiedBatches, requestId }, { status: 200 }, requestId);
  } catch (error: any) {
    const isDbDown = isDatabaseUnavailableError(error);
    const statusCode = isDbDown ? 503 : 500;
    logger.error('Error fetching batches from database', error, {
      requestId,
      route: '/api/batches',
      method: 'GET',
      statusCode,
      durationMs: Date.now() - startTime,
    });
    return jsonResponse(
      { success: false, error: isDbDown ? 'Database service unavailable' : 'Failed to retrieve batches', requestId },
      { status: statusCode },
      requestId
    );
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = getRequestId(request);

  try {
    const clientIp = getClientIp(request);
    // Rate limit: 20 batch creation requests per minute per IP (conservative administrative limit)
    const rateLimit = checkRateLimit(`batch_create:${clientIp}`, { maxRequests: 20, windowMs: 60 * 1000 });
    if (!rateLimit.allowed) {
      logger.warn('Batch creation rate limit exceeded', {
        requestId,
        route: '/api/batches',
        method: 'POST',
        statusCode: 429,
        durationMs: Date.now() - startTime,
        details: { clientIp },
      });
      return jsonResponse(
        {
          success: false,
          error: 'Too many batch creation requests. Please try again later.',
          retryAfterSeconds: rateLimit.retryAfterSeconds,
          requestId,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
            'X-RateLimit-Limit': String(rateLimit.totalLimit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetTime / 1000)),
          },
        },
        requestId
      );
    }

    // 1. Verify CSRF
    const csrfCheck = validateCsrfProtection(request);
    if (!csrfCheck.valid) {
      logger.warn('Batch creation failed CSRF validation', {
        requestId,
        route: '/api/batches',
        method: 'POST',
        statusCode: 403,
        durationMs: Date.now() - startTime,
        details: { reason: csrfCheck.reason },
      });
      return jsonResponse(
        { success: false, error: 'CSRF validation failed: ' + csrfCheck.reason, requestId },
        { status: 403 },
        requestId
      );
    }

    const sessionCookie = request.cookies.get('auth_session')?.value;
    const user = sessionCookie ? verifySessionToken(sessionCookie) : null;

    if (!user || user.role !== 'EXAM_ADMIN') {
      logger.warn('Unauthorized batch creation attempt', {
        requestId,
        route: '/api/batches',
        method: 'POST',
        statusCode: 401,
        durationMs: Date.now() - startTime,
      });
      return jsonResponse(
        { success: false, error: 'Unauthorized', requestId },
        { status: 401 },
        requestId
      );
    }

    // Safe JSON body parsing: malformed syntax returns HTTP 400
    const parsedBody = await parseJsonBody<{
      batchId?: string;
      merkleRoot?: string;
      ipfsCid?: string;
      timestamp?: number;
      issuer?: string;
      institutionName?: string;
      institutionCode?: string;
      totalCredentials?: number;
      revokedIndices?: number[];
      records?: any[];
      status?: string;
    }>(request, requestId, { route: '/api/batches', method: 'POST', startTime });

    if (!parsedBody.success) {
      return parsedBody.response;
    }

    const {
      batchId,
      merkleRoot,
      ipfsCid,
      timestamp,
      issuer,
      institutionName,
      institutionCode,
      totalCredentials,
      revokedIndices,
      records,
      status,
    } = parsedBody.data;

    if (!batchId || typeof batchId !== 'string' || !batchId.trim()) {
      return jsonResponse(
        { success: false, error: 'Missing or invalid required field: batchId', requestId },
        { status: 400 },
        requestId
      );
    }

    if (!merkleRoot || typeof merkleRoot !== 'string' || !merkleRoot.trim()) {
      return jsonResponse(
        { success: false, error: 'Missing or invalid required field: merkleRoot', requestId },
        { status: 400 },
        requestId
      );
    }

    if (!records || !Array.isArray(records) || records.length === 0) {
      return jsonResponse(
        { success: false, error: 'Missing or invalid required field: records (must be non-empty array)', requestId },
        { status: 400 },
        requestId
      );
    }

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (!r || typeof r !== 'object') {
        return jsonResponse(
          { success: false, error: `Invalid credential record at index ${i}`, requestId },
          { status: 400 },
          requestId
        );
      }
      if (!r.prn || typeof r.prn !== 'string' || !r.prn.trim()) {
        return jsonResponse(
          { success: false, error: `Missing or invalid PRN in record at index ${i}`, requestId },
          { status: 400 },
          requestId
        );
      }
      if (!r.fullName || typeof r.fullName !== 'string' || !r.fullName.trim()) {
        return jsonResponse(
          { success: false, error: `Missing or invalid fullName in record for PRN '${r.prn}'`, requestId },
          { status: 400 },
          requestId
        );
      }
      if (!r.degree || typeof r.degree !== 'string' || !r.degree.trim()) {
        return jsonResponse(
          { success: false, error: `Missing or invalid degree in record for PRN '${r.prn}'`, requestId },
          { status: 400 },
          requestId
        );
      }
      const numCgpa = Number(r.cgpa);
      if (isNaN(numCgpa) || numCgpa < 0 || numCgpa > 10) {
        return jsonResponse(
          { success: false, error: `Invalid CGPA in record for PRN '${r.prn}'. Must be between 0.0 and 10.0`, requestId },
          { status: 400 },
          requestId
        );
      }
      const numYear = Number(r.graduationYear);
      if (isNaN(numYear) || numYear < 1950 || numYear > 2100) {
        return jsonResponse(
          { success: false, error: `Invalid graduationYear in record for PRN '${r.prn}'`, requestId },
          { status: 400 },
          requestId
        );
      }
    }

    const cleanBatchId = batchId.trim();

    // Check for duplicate batchId
    const existing = await getBatchByIdDb(cleanBatchId);
    if (existing) {
      return jsonResponse(
        { success: false, error: `Batch with ID '${cleanBatchId}' already exists in the database.`, requestId },
        { status: 409 },
        requestId
      );
    }

    // Verify Merkle Root consistency: recalculate Merkle root from the submitted records
    try {
      const leaves = records.map((r) => hashCredentialSubject(r));
      const { MerkleTree } = await import('merkletreejs');
      const keccak256 = (await import('keccak256')).default;
      const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
      const computedRoot = tree.getHexRoot();

      if (computedRoot.toLowerCase() !== merkleRoot.trim().toLowerCase()) {
        return jsonResponse(
          {
            success: false,
            error: `Merkle root mismatch: provided '${merkleRoot.trim()}', but computed from records is '${computedRoot}'.`,
            requestId,
          },
          { status: 400 },
          requestId
        );
      }
    } catch (rootErr: any) {
      return jsonResponse(
        { success: false, error: `Failed to verify Merkle root integrity: ${rootErr?.message || 'unknown error'}`, requestId },
        { status: 400 },
        requestId
      );
    }

    const userInstCode = ((user as any).institutionCode || institutionCode || 'MGMU-ENG-01').trim();
    const userInstName = ((user as any).institutionName || institutionName || 'MGM University, Chhatrapati Sambhajinagar').trim();
    const userIssuer = ((user as any).authorizedWallet || issuer || '0x8D0cC3553e9d812797B986F15427835A2930a301').trim();

    const newBatch: BatchRecord = {
      batchId: cleanBatchId,
      merkleRoot: merkleRoot.trim(),
      ipfsCid: typeof ipfsCid === 'string' ? ipfsCid.trim() : '',
      timestamp: timestamp || Math.floor(Date.now() / 1000),
      issuer: userIssuer,
      institutionName: userInstName,
      institutionCode: userInstCode,
      totalCredentials: totalCredentials || records.length,
      revokedIndices: Array.isArray(revokedIndices) ? revokedIndices : [],
      records,
      status: 'PENDING_ANCHOR',
    };

    const saved = await saveBatchDb(newBatch);
    clearAnchorEvidenceCache();

    logger.info('New batch successfully created and persisted', {
      requestId,
      route: '/api/batches',
      method: 'POST',
      statusCode: 201,
      durationMs: Date.now() - startTime,
      details: { batchId: cleanBatchId, recordCount: records.length },
    });

    return jsonResponse(
      {
        success: true,
        batch: saved,
        message: 'Batch and credentials persisted successfully (PENDING_ANCHOR).',
        requestId,
      },
      { status: 201 },
      requestId
    );
  } catch (error: any) {
    const isDbDown = isDatabaseUnavailableError(error);
    const statusCode = isDbDown ? 503 : 500;
    logger.error('Error creating batch in database', error, {
      requestId,
      route: '/api/batches',
      method: 'POST',
      statusCode,
      durationMs: Date.now() - startTime,
    });
    return jsonResponse(
      { success: false, error: isDbDown ? 'Database service unavailable' : 'Failed to save batch in database', requestId },
      { status: statusCode },
      requestId
    );
  }
}

import { NextRequest } from 'next/server';
import { verifySessionToken, validateCsrfProtection } from '@/lib/serverAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getRequestId, jsonResponse, logger, parseJsonBody } from '@/lib/observability';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = getRequestId(request);

  try {
    // 1. Verify CSRF protection for mutating IPFS pin requests
    const csrfCheck = validateCsrfProtection(request);
    if (!csrfCheck.valid) {
      logger.warn('IPFS upload failed CSRF validation', {
        requestId,
        route: '/api/ipfs/upload',
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

    // 2. Session verification: Only authenticated Examination Authorities can pin credentials
    const sessionCookie = request.cookies.get('auth_session')?.value;
    const user = sessionCookie ? verifySessionToken(sessionCookie) : null;

    if (!user || user.role !== 'EXAM_ADMIN') {
      logger.warn('Unauthorized IPFS upload attempt', {
        requestId,
        route: '/api/ipfs/upload',
        method: 'POST',
        statusCode: 401,
        durationMs: Date.now() - startTime,
      });
      return jsonResponse(
        { success: false, error: 'Unauthorized: Examination Authority login required.', requestId },
        { status: 401 },
        requestId
      );
    }

    // 3. Rate limit: 10 requests per minute per IP for resource-intensive IPFS pinning
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(`ipfs_upload:${clientIp}`, { maxRequests: 10, windowMs: 60 * 1000 });
    if (!rateLimit.allowed) {
      logger.warn('IPFS upload rate limit exceeded', {
        requestId,
        route: '/api/ipfs/upload',
        method: 'POST',
        statusCode: 429,
        durationMs: Date.now() - startTime,
        details: { clientIp },
      });
      return jsonResponse(
        {
          success: false,
          error: 'Too many IPFS upload requests. Please try again later.',
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

    // 4. Request payload validation using safe JSON parsing
    const parsedBody = await parseJsonBody<{
      batchId?: string;
      records?: any[];
      merkleRoot?: string;
      institutionName?: string;
      customPayload?: any;
    }>(request, requestId, { route: '/api/ipfs/upload', method: 'POST', startTime });

    if (!parsedBody.success) {
      return parsedBody.response;
    }

    const { batchId, records, merkleRoot, institutionName, customPayload } = parsedBody.data;

    if (!batchId || typeof batchId !== 'string') {
      return jsonResponse(
        { success: false, error: 'Missing required field: batchId', requestId },
        { status: 400 },
        requestId
      );
    }

    // 5. Server credentials check
    const pinataJwt = process.env.PINATA_JWT?.trim();
    const pinataApiKey = process.env.PINATA_API_KEY?.trim();
    const pinataSecretApiKey = process.env.PINATA_SECRET_API_KEY?.trim();

    const hasJwt = Boolean(pinataJwt);
    const hasApiKeyPair = Boolean(pinataApiKey && pinataSecretApiKey);

    if (!hasJwt && !hasApiKeyPair) {
      return jsonResponse(
        {
          success: false,
          error:
            'PINATA_API_KEY or PINATA_JWT is not configured in the server environment (.env). Real IPFS pinning requires valid Pinata credentials.',
          requestId,
        },
        { status: 500 },
        requestId
      );
    }

    // Prepare JSON payload for Pinata
    const pinataContent = customPayload || {
      batchId,
      merkleRoot: merkleRoot || '',
      institutionName: institutionName || 'MGM University',
      recordCount: Array.isArray(records) ? records.length : 0,
      records: records || [],
      pinnedAt: new Date().toISOString(),
      standard: 'W3C-Verifiable-Credentials-EIP712-Merkle',
    };

    const pinataPayload = {
      pinataContent,
      pinataMetadata: {
        name: `TrueCred_Batch_${batchId}`,
        keyvalues: {
          batchId: String(batchId),
          network: 'Ethereum Sepolia',
          application: 'TrueCred',
        },
      },
    };

    // 6. Set headers based on available auth scheme
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (hasJwt) {
      headers['Authorization'] = `Bearer ${pinataJwt}`;
    } else {
      headers['pinata_api_key'] = pinataApiKey!;
      headers['pinata_secret_api_key'] = pinataSecretApiKey!;
    }

    // 7. Upload to Pinata pinJSONToIPFS
    const pinataResponse = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers,
      body: JSON.stringify(pinataPayload),
    });

    const pinataData = await pinataResponse.json();

    if (!pinataResponse.ok || !pinataData.IpfsHash) {
      const errorMsg =
        pinataData.error?.details ||
        pinataData.error ||
        pinataData.message ||
        `Pinata returned status code ${pinataResponse.status}`;
      return jsonResponse(
        { success: false, error: `Pinata IPFS Pinning Error: ${errorMsg}`, requestId },
        { status: pinataResponse.status >= 400 && pinataResponse.status < 500 ? pinataResponse.status : 502 },
        requestId
      );
    }

    const cid = pinataData.IpfsHash;

    logger.info('Batch payload pinned to IPFS successfully', {
      requestId,
      route: '/api/ipfs/upload',
      method: 'POST',
      statusCode: 200,
      durationMs: Date.now() - startTime,
      details: { batchId, cid },
    });

    return jsonResponse(
      {
        success: true,
        cid,
        ipfsUri: `ipfs://${cid}`,
        gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}`,
        pinSize: pinataData.PinSize,
        timestamp: pinataData.Timestamp,
        requestId,
      },
      { status: 200 },
      requestId
    );
  } catch (error: any) {
    logger.error('Unexpected error during IPFS upload', error, {
      requestId,
      route: '/api/ipfs/upload',
      method: 'POST',
      statusCode: 500,
      durationMs: Date.now() - startTime,
    });
    return jsonResponse(
      { success: false, error: 'Unexpected server error during IPFS upload', requestId },
      { status: 500 },
      requestId
    );
  }
}

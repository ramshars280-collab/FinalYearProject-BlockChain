import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. Session verification: Only authenticated Examination Authorities can pin credentials
    const sessionCookie = request.cookies.get('auth_session')?.value;
    const user = sessionCookie ? verifySessionToken(sessionCookie) : null;

    if (!user || user.role !== 'EXAM_ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Examination Authority login required.' },
        { status: 401 }
      );
    }

    // 2. Server credentials check
    const pinataJwt = process.env.PINATA_JWT?.trim();
    const pinataApiKey = process.env.PINATA_API_KEY?.trim();
    const pinataSecretApiKey = process.env.PINATA_SECRET_API_KEY?.trim();

    const hasJwt = Boolean(pinataJwt);
    const hasApiKeyPair = Boolean(pinataApiKey && pinataSecretApiKey);

    if (!hasJwt && !hasApiKeyPair) {
      return NextResponse.json(
        {
          success: false,
          error:
            'PINATA_API_KEY or PINATA_JWT is not configured in the server environment (.env). Real IPFS pinning requires valid Pinata credentials.',
        },
        { status: 500 }
      );
    }

    // 3. Request payload validation
    const body = await request.json();
    const { batchId, records, merkleRoot, institutionName, customPayload } = body;

    if (!batchId || typeof batchId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing required field: batchId' },
        { status: 400 }
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
        name: `SOET_Batch_${batchId}`,
        keyvalues: {
          batchId: String(batchId),
          network: 'Ethereum Sepolia',
          application: 'SOET VeriTrust',
        },
      },
    };

    // 4. Set headers based on available auth scheme
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (hasJwt) {
      headers['Authorization'] = `Bearer ${pinataJwt}`;
    } else {
      headers['pinata_api_key'] = pinataApiKey!;
      headers['pinata_secret_api_key'] = pinataSecretApiKey!;
    }

    // 5. Upload to Pinata pinJSONToIPFS
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
      return NextResponse.json(
        { success: false, error: `Pinata IPFS Pinning Error: ${errorMsg}` },
        { status: pinataResponse.status >= 400 && pinataResponse.status < 500 ? pinataResponse.status : 502 }
      );
    }

    const cid = pinataData.IpfsHash;

    return NextResponse.json({
      success: true,
      cid,
      ipfsUri: `ipfs://${cid}`,
      gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}`,
      pinSize: pinataData.PinSize,
      timestamp: pinataData.Timestamp,
    });
  } catch (error: any) {
    console.error('[Pinata IPFS Route Error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Unexpected server error during IPFS upload' },
      { status: 500 }
    );
  }
}

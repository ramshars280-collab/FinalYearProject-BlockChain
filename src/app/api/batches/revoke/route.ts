import { NextRequest, NextResponse } from 'next/server';
import { revokeBatchLeafDb, getBatchByIdDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      batchId,
      leafIndex,
      reasonCode,
      reasonTitle,
      reasonDescription,
      supersededByHash,
      officerStaffId,
    } = body;

    if (!batchId || typeof batchId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing required field: batchId' },
        { status: 400 }
      );
    }

    const numIndex = Number(leafIndex);
    if (isNaN(numIndex) || numIndex < 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid leafIndex. Must be a non-negative integer.' },
        { status: 400 }
      );
    }

    const existing = getBatchByIdDb(batchId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Batch '${batchId}' not found in database.` },
        { status: 404 }
      );
    }

    const updatedBatch = revokeBatchLeafDb(batchId, numIndex, {
      reasonCode,
      reasonTitle,
      reasonDescription,
      supersededByHash,
      officerStaffId,
    });

    return NextResponse.json({
      success: true,
      message: `Credential index ${numIndex} in batch '${batchId}' revoked successfully.`,
      batch: updatedBatch,
    });
  } catch (error: any) {
    console.error('Error in batch revocation API:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to revoke credential in database' },
      { status: 500 }
    );
  }
}

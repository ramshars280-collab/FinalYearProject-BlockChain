import { NextRequest, NextResponse } from 'next/server';
import { getAllBatchesDb, getBatchByIdDb, saveBatchDb } from '@/lib/db';
import { BatchRecord } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const batches = getAllBatchesDb();
    return NextResponse.json({ success: true, batches });
  } catch (error: any) {
    console.error('Error fetching batches from database:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to retrieve batches' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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
    } = body;

    if (!batchId || typeof batchId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid required field: batchId' },
        { status: 400 }
      );
    }

    if (!merkleRoot || typeof merkleRoot !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid required field: merkleRoot' },
        { status: 400 }
      );
    }

    if (!records || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid required field: records (must be non-empty array)' },
        { status: 400 }
      );
    }

    const cleanBatchId = batchId.trim();
    const existing = getBatchByIdDb(cleanBatchId);
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: `Duplicate Batch ID: A batch with ID '${cleanBatchId}' already exists in the database.`,
        },
        { status: 409 }
      );
    }

    const newBatch: BatchRecord = {
      batchId: cleanBatchId,
      merkleRoot,
      ipfsCid: ipfsCid || `ipfs://bafybeig${cleanBatchId.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      timestamp: timestamp || Math.floor(Date.now() / 1000),
      issuer: issuer || '0x71C56538b15294500B73f8472B4fE963D4e58bEf',
      institutionName: institutionName || 'MGM University, Chhatrapati Sambhajinagar',
      institutionCode: institutionCode || 'MGMU-ENG-01',
      totalCredentials: totalCredentials || records.length,
      revokedIndices: Array.isArray(revokedIndices) ? revokedIndices : [],
      records,
    };

    const saved = saveBatchDb(newBatch);

    return NextResponse.json({ success: true, batch: saved }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating batch in database:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to save batch in database' },
      { status: 500 }
    );
  }
}

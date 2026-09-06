import { NextRequest, NextResponse } from "next/server";
import { getBatchByIdDb } from "@/lib/db";
import { initializeDefaultBatches, INITIAL_STUDENTS_MGM_BATCH2 } from "@/lib/storage";
import { buildBatchMerkleTree } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { batchId: string } }
) {
  try {
    const rawBatchId = params.batchId ? decodeURIComponent(params.batchId).trim() : "";
    if (!rawBatchId) {
      return NextResponse.json(
        { success: false, error: "Missing required batchId" },
        { status: 400 }
      );
    }

    // 1. Check SQLite database
    let batch = getBatchByIdDb(rawBatchId);

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
        issuer: "0x71C56538b15294500B73f8472B4fE963D4e58bEf",
        institutionName: "MGM University, Chhatrapati Sambhajinagar",
        institutionCode: "MGMU-ENG-01",
        totalCredentials: INITIAL_STUDENTS_MGM_BATCH2.length,
        revokedIndices: [],
        records: INITIAL_STUDENTS_MGM_BATCH2,
      };
    }

    if (!batch) {
      return NextResponse.json(
        { success: false, error: `Batch "${rawBatchId}" not found in institutional batch registry.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, batch });
  } catch (error: any) {
    console.error("GET /api/batches/[batchId] error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to retrieve batch" },
      { status: 500 }
    );
  }
}

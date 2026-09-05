import { NextRequest, NextResponse } from "next/server";
import { buildBatchMerkleTree, createW3CCredential } from "@/lib/crypto";
import {
  INITIAL_STUDENTS_MGM,
  INITIAL_STUDENTS_MGM_BATCH2,
  initializeDefaultBatches,
  getSepoliaConfig,
} from "@/lib/storage";
import { getBatchByIdDb } from "@/lib/db";
import { BatchRecord } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { batchId: string; leafIndex: string } }
) {
  try {
    const rawBatchId = params.batchId ? decodeURIComponent(params.batchId).trim() : "";
    const rawIndex = params.leafIndex ? decodeURIComponent(params.leafIndex).trim() : "";

    const leafIndex = parseInt(rawIndex, 10);
    if (isNaN(leafIndex) || leafIndex < 0) {
      return NextResponse.json(
        { success: false, error: `Invalid leafIndex '${rawIndex}'. Must be a non-negative integer.` },
        { status: 400 }
      );
    }

    // 1. Query database first
    let matchedBatch: BatchRecord | null | undefined = getBatchByIdDb(rawBatchId);

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
        issuer: "0x71C56538b15294500B73f8472B4fE963D4e58bEf",
        institutionName: "MGM University, Chhatrapati Sambhajinagar",
        institutionCode: "MGMU-ENG-01",
        totalCredentials: INITIAL_STUDENTS_MGM_BATCH2.length,
        revokedIndices: [],
        records: INITIAL_STUDENTS_MGM_BATCH2,
      };
    }

    if (!matchedBatch || !matchedBatch.records || matchedBatch.records.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Batch not found: '${rawBatchId}'. Ensure the batch has been anchored and registered.`,
        },
        { status: 404 }
      );
    }

    if (leafIndex >= matchedBatch.records.length) {
      return NextResponse.json(
        {
          success: false,
          error: `Leaf index ${leafIndex} is out of bounds for batch '${matchedBatch.batchId}' (contains ${matchedBatch.records.length} records, valid range 0 to ${matchedBatch.records.length - 1}).`,
        },
        { status: 404 }
      );
    }

    const student = matchedBatch.records[leafIndex];
    const treeData = buildBatchMerkleTree(matchedBatch.records);
    const config = getSepoliaConfig();

    const proofData = {
      ...treeData.proofs[leafIndex],
      batchId: matchedBatch.batchId,
      contractAddress: config.credentialRegistryAddress,
      network: "Ethereum Sepolia",
    };

    const credential = createW3CCredential(
      student,
      proofData,
      matchedBatch.issuer,
      matchedBatch.institutionName,
      matchedBatch.institutionCode
    );

    const isRevoked = Array.isArray(matchedBatch.revokedIndices) && matchedBatch.revokedIndices.includes(leafIndex);

    return NextResponse.json({
      success: true,
      batchId: matchedBatch.batchId,
      leafIndex,
      isRevoked,
      student,
      proofData,
      credential,
    });
  } catch (error: any) {
    console.error("Public verification API error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error resolving credential verification" },
      { status: 500 }
    );
  }
}

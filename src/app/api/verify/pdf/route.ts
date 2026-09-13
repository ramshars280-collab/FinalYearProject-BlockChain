import { NextRequest, NextResponse } from "next/server";
import { getBatchByIdDb, getAllBatchesDb } from "@/lib/db";
import {
  INITIAL_STUDENTS_MGM,
  INITIAL_STUDENTS_MGM_BATCH2,
  initializeDefaultBatches,
  getSepoliaConfig,
} from "@/lib/storage";
import { buildBatchMerkleTree, createW3CCredential } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file uploaded. Please select a valid degree certificate PDF." },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    const isPdf = fileName.endsWith(".pdf") || file.type === "application/pdf";

    if (!isPdf) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid file format. Only official degree certificate documents in PDF format (.pdf) are supported in this tab.",
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    if (data.length === 0) {
      return NextResponse.json(
        { success: false, error: "The uploaded PDF file is empty." },
        { status: 400 }
      );
    }

    // Parse PDF text with pdfjs-dist
    let text = "";
    try {
      const pdfjsLib = require("pdfjs-dist/build/pdf.js");
      const doc = await pdfjsLib.getDocument({ data }).promise;
      if (doc.numPages < 1) {
        return NextResponse.json(
          { success: false, error: "The uploaded PDF has no readable pages." },
          { status: 400 }
        );
      }
      const page = await doc.getPage(1);
      const tc = await page.getTextContent();
      text = tc.items.map((i: any) => i.str).join(" ");
    } catch (parseErr: any) {
      console.error("PDF parsing error:", parseErr);
      return NextResponse.json(
        { success: false, error: "Unable to parse PDF content. Please ensure the document is a valid PDF file." },
        { status: 400 }
      );
    }

    // Extract academic degree and blockchain verification metadata
    const batchMatch = text.match(/Batch ID:\s*([A-Za-z0-9_-]+)/i);
    const leafMatch = text.match(/Leaf:\s*#?(\d+)/i);
    const prnMatch =
      text.match(/(PRN\d+)/i) ||
      text.match(/Permanent Reg\. No\.\s*([A-Za-z0-9_-]+)/i) ||
      text.match(/PRN[:\s]+([A-Za-z0-9_-]+)/i);
    const cgpaMatch = text.match(/CUMULATIVE CGPA\s*([\d.]+)/i) || text.match(/CGPA[:\s]+([\d.]+)/i);

    const isWatermarkedTampered = /TAMPERED|FRAUD|ALTERED/i.test(text);
    const isWatermarkedFake = /COUNTERFEIT|UNREGISTERED|FORGED/i.test(text);
    const isWatermarkedRevoked = /REVOKED BY EXAM AUTHORITY|REVOKED/i.test(text);

    // If neither batch ID nor leaf index nor academic markers are found:
    if (!batchMatch && !leafMatch && !prnMatch) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid certificate format: The uploaded PDF is not an official university degree certificate. No verifiable academic Merkle proofs or student registration records were found.",
        },
        { status: 400 }
      );
    }

    const batchId = batchMatch ? batchMatch[1].trim() : null;
    const leafIndex = leafMatch ? parseInt(leafMatch[1], 10) : null;
    const extractedPrn = prnMatch ? prnMatch[1].trim() : null;
    const extractedCgpa = cgpaMatch ? parseFloat(cgpaMatch[1]) : undefined;

    if (!batchId || leafIndex === null || isNaN(leafIndex)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Incomplete cryptographic metadata: This PDF lacks an on-chain Batch ID or Merkle Leaf index required for zero-knowledge verification.",
        },
        { status: 400 }
      );
    }

    // Check database first
    let matchedBatch: import("@/types").BatchRecord | null | undefined = getBatchByIdDb(batchId);

    // Fall back to default batches if not in DB
    if (!matchedBatch) {
      const defaultBatches = initializeDefaultBatches();
      matchedBatch = defaultBatches.find(
        (b) => b.batchId.toLowerCase() === batchId.toLowerCase()
      );
    }

    // Fall back to secondary sample batch
    if (!matchedBatch && batchId.toLowerCase().includes("batch02")) {
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

    // If batch does not exist on blockchain / registry (e.g. MGM-2024-FAKE-BATCH99)
    if (!matchedBatch) {
      return NextResponse.json({
        success: true,
        isUnregistered: true,
        isValid: false,
        isRevoked: false,
        tamperDetected: true,
        tamperReason: `Counterfeit / Unregistered Degree: Batch '${batchId}' was never anchored on the Ethereum Sepolia blockchain registry.`,
        pdfExtracted: {
          batchId,
          leafIndex,
          prn: extractedPrn,
          cgpa: extractedCgpa,
          isFake: true,
        },
      });
    }

    if (leafIndex < 0 || leafIndex >= matchedBatch.records.length) {
      return NextResponse.json({
        success: true,
        isValid: false,
        isRevoked: false,
        tamperDetected: true,
        tamperReason: `Merkle Index Out of Bounds: Leaf #${leafIndex} does not exist in batch '${matchedBatch.batchId}' (contains ${matchedBatch.records.length} records).`,
        pdfExtracted: {
          batchId,
          leafIndex,
          prn: extractedPrn,
          cgpa: extractedCgpa,
        },
      });
    }

    const genuineStudent = matchedBatch.records[leafIndex];
    const treeData = buildBatchMerkleTree(matchedBatch.records);
    const config = getSepoliaConfig();

    const proofData = {
      ...treeData.proofs[leafIndex],
      batchId: matchedBatch.batchId,
      contractAddress: config.credentialRegistryAddress,
      network: "Ethereum Sepolia",
    };

    const credential = createW3CCredential(
      genuineStudent,
      proofData,
      matchedBatch.issuer,
      matchedBatch.institutionName,
      matchedBatch.institutionCode
    );

    const isRevoked =
      (Array.isArray(matchedBatch.revokedIndices) && matchedBatch.revokedIndices.includes(leafIndex)) ||
      isWatermarkedRevoked;

    // Check for CGPA or data tampering
    let tamperDetected = false;
    let tamperReason: string | undefined = undefined;

    if (extractedCgpa !== undefined && genuineStudent.cgpa !== undefined) {
      const genuineCgpa = parseFloat(String(genuineStudent.cgpa));
      if (Math.abs(extractedCgpa - genuineCgpa) > 0.01) {
        tamperDetected = true;
        tamperReason = `Cryptographic Data Tampering Detected: Document displays CGPA ${extractedCgpa}, but genuine on-chain Merkle root anchors CGPA ${genuineCgpa}.`;
      }
    }

    if (isWatermarkedTampered && !tamperDetected) {
      tamperDetected = true;
      tamperReason = "Document contains official tampering warning: CGPA was altered from certified record.";
    }

    return NextResponse.json({
      success: true,
      credential,
      isRevoked,
      tamperDetected,
      tamperReason,
      pdfExtracted: {
        batchId: matchedBatch.batchId,
        leafIndex,
        prn: extractedPrn || genuineStudent.prn,
        cgpa: extractedCgpa,
      },
    });
  } catch (err: any) {
    console.error("PDF verification API route error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error verifying PDF certificate" },
      { status: 500 }
    );
  }
}

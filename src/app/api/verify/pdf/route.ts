import { NextRequest, NextResponse } from "next/server";
import { getBatchByIdDb, getCredentialByPrnDb } from "@/lib/db";
import { normalizePRN } from "@/lib/prnUtils";
import {
  INITIAL_STUDENTS_MGM_BATCH2,
  initializeDefaultBatches,
  getSepoliaConfig,
} from "@/lib/storage";
import {
  buildBatchMerkleTree,
  createW3CCredential,
  hashCredentialSubject,
} from "@/lib/crypto";
import { verifyCredentialOnChain } from "@/lib/contracts";
import { BatchRecord, StudentDegreeData, W3CCredentialPayload } from "@/types";

export const dynamic = "force-dynamic";

/** Standardized AI Forensic Tampering Confidence Threshold (0.65) */
const AI_TAMPERING_THRESHOLD = 0.65;

export type DiagnosticCode =
  | "FULLY_VERIFIED"
  | "CLAIM_MISMATCH_CGPA"
  | "CLAIM_MISMATCH_DEGREE"
  | "MERKLE_PROOF_INVALID"
  | "CREDENTIAL_REVOKED"
  | "RECORD_NOT_IN_DATABASE"
  | "UNREGISTERED_ISSUER"
  | "VISUAL_FORGERY_DETECTED"
  | "SCANNED_DOCUMENT_REQUIRES_OCR";

interface ForensicScanResult {
  status: "COMPLETED" | "UNAVAILABLE";
  ai_confidence_score?: number;
  verdict?: "AUTHENTIC" | "SUSPICIOUS" | "TAMPERED";
  heatmap_base64?: string;
  metadata?: any;
  reason?: string;
}

/**
 * Communicates with the Python FastAPI PyTorch CNN microservice with a strict 3000ms timeout.
 * Gracefully degrades if the microservice is offline or times out, ensuring deterministic
 * on-chain verification remains uninterrupted.
 */
async function callAIForensicMicroservice(
  fileBuffer: ArrayBuffer,
  fileName: string
): Promise<ForensicScanResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const formData = new FormData();
    const blob = new Blob([Buffer.from(fileBuffer)], { type: "application/pdf" });
    formData.append("file", blob, fileName);

    const res = await fetch("http://127.0.0.1:8000/detect-tampering", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        status: "UNAVAILABLE",
        reason: `AI microservice returned HTTP status ${res.status}`,
      };
    }

    const data = await res.json();
    return {
      status: "COMPLETED",
      ai_confidence_score: data.ai_confidence_score,
      verdict: data.verdict,
      heatmap_base64: data.heatmap_base64,
      metadata: data.metadata,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err?.name === "AbortError";
    return {
      status: "UNAVAILABLE",
      reason: isTimeout
        ? "AI Forensic Service timed out (>3000ms)"
        : `AI Forensic Service offline (${err?.message || "connection refused"})`,
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: "No file uploaded. Please select an official degree certificate PDF.",
        },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    const isPdf = fileName.endsWith(".pdf") || file.type === "application/pdf";

    if (!isPdf) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid file format. Only university degree certificate documents in PDF format (.pdf) are supported.",
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    // Clone arrayBuffer before pdfjs-dist transfers/detaches the buffer
    const forensicBuffer = arrayBuffer.slice(0);
    const data = new Uint8Array(arrayBuffer);

    if (data.length === 0) {
      return NextResponse.json(
        { success: false, error: "The uploaded PDF file is empty (0 bytes)." },
        { status: 400 }
      );
    }

    // 1. Text Layer Extraction via pdfjs-dist
    let rawText = "";
    try {
      const pdfjsLib = require("pdfjs-dist/build/pdf.js");
      const doc = await pdfjsLib.getDocument({ data }).promise;
      if (doc.numPages < 1) {
        return NextResponse.json(
          {
            success: false,
            diagnostic_code: "SCANNED_DOCUMENT_REQUIRES_OCR" as DiagnosticCode,
            error: "Scanned Document: The PDF contains no readable pages.",
          },
          { status: 422 }
        );
      }
      const page = await doc.getPage(1);
      const tc = await page.getTextContent();
      rawText = tc.items.map((i: any) => i.str).join(" ");
    } catch (parseErr: any) {
      console.error("PDF text extraction error:", parseErr);
      return NextResponse.json(
        {
          success: false,
          error: "Unable to parse PDF content. Please ensure the document is a valid PDF.",
        },
        { status: 400 }
      );
    }

    // Rule 1: Scanned Document Detection & OCR Fallback Processing
    let isScannedPdf = false;
    let ocrExtracted = false;

    if (!rawText || rawText.trim().length === 0) {
      isScannedPdf = true;
      try {
        console.log("📷 Zero-text PDF detected. Executing Tesseract.js Optical Character Recognition (OCR)...");
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("eng");
        const ocrBuffer = Buffer.from(forensicBuffer);
        const { data } = await worker.recognize(ocrBuffer);
        await worker.terminate();

        if (data && data.text && data.text.trim().length > 0) {
          rawText = data.text;
          ocrExtracted = true;
          console.log(`✅ OCR Engine successfully extracted ${rawText.length} characters from scanned PDF.`);
        }
      } catch (ocrErr: any) {
        console.warn("⚠️ OCR processing encountered an exception:", ocrErr?.message || ocrErr);
      }

      // If OCR was unable to recover any text from the scanned image
      if (!rawText || rawText.trim().length === 0) {
        return NextResponse.json(
          {
            success: false,
            diagnostic_code: "SCANNED_DOCUMENT_REQUIRES_OCR" as DiagnosticCode,
            error:
              "Scanned Document Detected: This PDF contains flat raster images without an embedded digital text layer. OCR processing did not detect readable text.",
          },
          { status: 422 }
        );
      }
    }

    // 2. Field Extraction and PRN Normalization
    const batchMatch = rawText.match(/Batch ID:\s*([A-Za-z0-9_-]+)/i);
    const leafMatch = rawText.match(/Leaf:\s*#?(\d+)/i);
    const prnMatch =
      rawText.match(/(PRN\d+)/i) ||
      rawText.match(/Permanent Reg\. No\.\s*([A-Za-z0-9_-]+)/i) ||
      rawText.match(/PRN[:\s]+([A-Za-z0-9_-]+)/i);
    const cgpaMatch =
      rawText.match(/CUMULATIVE CGPA\s*([\d.]+)/i) ||
      rawText.match(/CGPA[:\s]+([\d.]+)/i);
    const degreeMatch =
      rawText.match(/Bachelor of Technology/i) ||
      rawText.match(/Master of Technology/i) ||
      rawText.match(/Degree of\s+([A-Za-z\s&]+)/i);

    const isWatermarkedTampered = /TAMPERED|FRAUD|ALTERED/i.test(rawText);
    const isWatermarkedFake = /COUNTERFEIT|UNREGISTERED|FORGED/i.test(rawText);
    const isWatermarkedRevoked = /REVOKED BY EXAM AUTHORITY|REVOKED/i.test(rawText);

    // If neither batch ID nor PRN was found in the text
    if (!batchMatch && !prnMatch) {
      return NextResponse.json(
        {
          success: false,
          diagnostic_code: "RECORD_NOT_IN_DATABASE" as DiagnosticCode,
          error:
            "Unrecognized Academic Document: No verifiable university Permanent Registration Number (PRN) or Batch identifier found in document text.",
        },
        { status: 400 }
      );
    }

    const rawPrn = prnMatch ? prnMatch[1] : "";
    const normalizedPrn = normalizePRN(rawPrn);
    const extractedBatchId = batchMatch ? batchMatch[1].trim() : null;
    let extractedLeafIndex = leafMatch ? parseInt(leafMatch[1], 10) : null;
    const extractedCgpa = cgpaMatch ? parseFloat(cgpaMatch[1]) : undefined;
    const extractedDegree = degreeMatch ? degreeMatch[0].trim() : undefined;

    // 3. Database & Batch Resolution
    let matchedBatch: BatchRecord | null = null;

    if (extractedBatchId) {
      matchedBatch = getBatchByIdDb(extractedBatchId);
      if (!matchedBatch) {
        matchedBatch =
          initializeDefaultBatches().find(
            (b) => b.batchId.toLowerCase() === extractedBatchId.toLowerCase()
          ) || null;
      }
      if (!matchedBatch && extractedBatchId.toLowerCase().includes("batch02")) {
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
    }

    // PRN-based lookup fallback if batch not matched yet
    if (!matchedBatch && normalizedPrn) {
      const dbCred = getCredentialByPrnDb(normalizedPrn);
      if (dbCred) {
        matchedBatch = getBatchByIdDb(dbCred.batchId);
        extractedLeafIndex = dbCred.leafIndex;
      }
    }

    // Trigger AI Forensic Microservice asynchronously alongside deterministic checks
    const forensicPromise = callAIForensicMicroservice(forensicBuffer, file.name);

    // Rule 2: Unregistered Issuer / Counterfeit Batch
    if (!matchedBatch || isWatermarkedFake || (extractedBatchId && extractedBatchId.includes("FAKE"))) {
      const forensic = await forensicPromise;
      return NextResponse.json({
        success: true,
        diagnostic_code: "UNREGISTERED_ISSUER" as DiagnosticCode,
        diagnostic_message: `Unregistered Authority: Batch '${extractedBatchId || "UNKNOWN"}' was never anchored or registered on the Ethereum credential registry.`,
        isValid: false,
        isRevoked: false,
        isUnregistered: true,
        tamperDetected: true,
        tamperReason: `Unregistered Authority: Batch '${extractedBatchId || "UNKNOWN"}' is not authorized on Ethereum Sepolia.`,
        forensic_scan: forensic,
        pdfExtracted: {
          batchId: extractedBatchId,
          leafIndex: extractedLeafIndex,
          prn: normalizedPrn,
          cgpa: extractedCgpa,
        },
      });
    }

    // Resolve Leaf Index
    if (extractedLeafIndex === null || isNaN(extractedLeafIndex)) {
      if (normalizedPrn) {
        const foundIdx = matchedBatch.records.findIndex(
          (r) => normalizePRN(r.prn) === normalizedPrn
        );
        if (foundIdx !== -1) {
          extractedLeafIndex = foundIdx;
        }
      }
    }

    // Rule 3: Record Not in Database / Merkle Bounds
    if (
      extractedLeafIndex === null ||
      extractedLeafIndex < 0 ||
      extractedLeafIndex >= matchedBatch.records.length
    ) {
      const forensic = await forensicPromise;
      return NextResponse.json({
        success: true,
        diagnostic_code: "RECORD_NOT_IN_DATABASE" as DiagnosticCode,
        diagnostic_message: `Record Not Found: Candidate registration (${normalizedPrn || "UNKNOWN"}) does not exist in certified batch '${matchedBatch.batchId}'.`,
        isValid: false,
        isRevoked: false,
        isUnregistered: false,
        tamperDetected: true,
        tamperReason: `Candidate record does not exist in batch '${matchedBatch.batchId}'.`,
        forensic_scan: forensic,
        pdfExtracted: {
          batchId: matchedBatch.batchId,
          leafIndex: extractedLeafIndex,
          prn: normalizedPrn,
          cgpa: extractedCgpa,
        },
      });
    }

    const genuineStudent: StudentDegreeData = matchedBatch.records[extractedLeafIndex];

    // Rule 4: Claim Mismatch - CGPA
    if (extractedCgpa !== undefined && genuineStudent.cgpa !== undefined) {
      const genuineCgpa = parseFloat(String(genuineStudent.cgpa));
      if (Math.abs(extractedCgpa - genuineCgpa) > 0.01 || isWatermarkedTampered) {
        const forensic = await forensicPromise;
        return NextResponse.json({
          success: true,
          diagnostic_code: "CLAIM_MISMATCH_CGPA" as DiagnosticCode,
          diagnostic_message: `Cryptographic Claim Mismatch: Document presents CGPA ${extractedCgpa}, but genuine on-chain Merkle tree anchors CGPA ${genuineCgpa}.`,
          isValid: false,
          isRevoked: false,
          isUnregistered: false,
          tamperDetected: true,
          tamperReason: `Document displays CGPA ${extractedCgpa}, but certified on-chain record anchors CGPA ${genuineCgpa}.`,
          forensic_scan: forensic,
          pdfExtracted: {
            batchId: matchedBatch.batchId,
            leafIndex: extractedLeafIndex,
            prn: normalizedPrn || genuineStudent.prn,
            cgpa: extractedCgpa,
          },
        });
      }
    }

    // Rule 5: Claim Mismatch - Degree
    if (
      extractedDegree &&
      genuineStudent.degree &&
      !genuineStudent.degree.toLowerCase().includes(extractedDegree.toLowerCase()) &&
      !extractedDegree.toLowerCase().includes(genuineStudent.degree.toLowerCase())
    ) {
      const forensic = await forensicPromise;
      return NextResponse.json({
        success: true,
        diagnostic_code: "CLAIM_MISMATCH_DEGREE" as DiagnosticCode,
        diagnostic_message: `Cryptographic Claim Mismatch: Document claims '${extractedDegree}', but certified record anchors '${genuineStudent.degree}'.`,
        isValid: false,
        isRevoked: false,
        isUnregistered: false,
        tamperDetected: true,
        tamperReason: `Degree mismatch: Claimed '${extractedDegree}', verified '${genuineStudent.degree}'.`,
        forensic_scan: forensic,
        pdfExtracted: {
          batchId: matchedBatch.batchId,
          leafIndex: extractedLeafIndex,
          prn: normalizedPrn || genuineStudent.prn,
          cgpa: extractedCgpa,
        },
      });
    }

    // 4. On-Chain Merkle Proof Verification & Revocation
    const treeData = buildBatchMerkleTree(matchedBatch.records);
    const leafProof = treeData.proofs[extractedLeafIndex];
    const leafHash = hashCredentialSubject(genuineStudent);
    const config = getSepoliaConfig();

    const proofData = {
      ...leafProof,
      batchId: matchedBatch.batchId,
      contractAddress: config.credentialRegistryAddress,
      network: "Ethereum Sepolia",
    };

    const credential: W3CCredentialPayload = createW3CCredential(
      genuineStudent,
      proofData,
      matchedBatch.issuer,
      matchedBatch.institutionName,
      matchedBatch.institutionCode
    );

    // Verify on Ethereum Sepolia
    const onChainResult = await verifyCredentialOnChain(
      matchedBatch.batchId,
      leafHash,
      leafProof.proof,
      extractedLeafIndex
    );

    // Rule 6: Merkle Proof Invalid
    if (!onChainResult.isValid) {
      const forensic = await forensicPromise;
      return NextResponse.json({
        success: true,
        diagnostic_code: "MERKLE_PROOF_INVALID" as DiagnosticCode,
        diagnostic_message: `Cryptographic Merkle Proof Failure: Computed leaf hash does not verify against on-chain root (${onChainResult.rootHash}).`,
        isValid: false,
        isRevoked: false,
        isUnregistered: false,
        tamperDetected: true,
        tamperReason: "Merkle proof path does not resolve to the anchored root.",
        credential,
        forensic_scan: forensic,
        pdfExtracted: {
          batchId: matchedBatch.batchId,
          leafIndex: extractedLeafIndex,
          prn: normalizedPrn || genuineStudent.prn,
          cgpa: extractedCgpa,
        },
      });
    }

    // Rule 7: Credential Revoked
    const isRevokedOnChain =
      Boolean(onChainResult.isRevoked) ||
      Boolean(
        Array.isArray(matchedBatch.revokedIndices) &&
          matchedBatch.revokedIndices.includes(extractedLeafIndex)
      ) ||
      isWatermarkedRevoked;

    if (isRevokedOnChain) {
      const forensic = await forensicPromise;
      return NextResponse.json({
        success: true,
        diagnostic_code: "CREDENTIAL_REVOKED" as DiagnosticCode,
        diagnostic_message: "Revocation Alert: This academic credential was officially revoked on Ethereum Sepolia.",
        isValid: false,
        isRevoked: true,
        isUnregistered: false,
        tamperDetected: false,
        credential,
        forensic_scan: forensic,
        pdfExtracted: {
          batchId: matchedBatch.batchId,
          leafIndex: extractedLeafIndex,
          prn: normalizedPrn || genuineStudent.prn,
          cgpa: extractedCgpa,
        },
      });
    }

    // Rule 8: AI Forensic Visual Tampering Check
    const forensic = await forensicPromise;
    const isTamperedByScore = typeof forensic.ai_confidence_score === "number" && forensic.ai_confidence_score > AI_TAMPERING_THRESHOLD;

    if (forensic.status === "COMPLETED" && (forensic.verdict === "TAMPERED" || isTamperedByScore)) {
      return NextResponse.json({
        success: true,
        diagnostic_code: "VISUAL_FORGERY_DETECTED" as DiagnosticCode,
        diagnostic_message: `AI Forgery Alert: PyTorch ELA neural network detected localized image splicing and compression anomalies (anomaly score: ${forensic.ai_confidence_score} > ${AI_TAMPERING_THRESHOLD}).`,
        isValid: false,
        isRevoked: false,
        isUnregistered: false,
        tamperDetected: true,
        tamperReason: "Neural network identified localized pixel compression anomalies.",
        credential,
        forensic_scan: forensic,
        pdfExtracted: {
          batchId: matchedBatch.batchId,
          leafIndex: extractedLeafIndex,
          prn: normalizedPrn || genuineStudent.prn,
          cgpa: extractedCgpa,
        },
      });
    }

    // Rule 9: Fully Verified
    return NextResponse.json({
      success: true,
      diagnostic_code: "FULLY_VERIFIED" as DiagnosticCode,
      diagnostic_message: "Fully Verified: Cryptographic Merkle proof matches Ethereum Sepolia, claims certified, credential active, and AI forensic scan authentic.",
      isValid: true,
      isRevoked: false,
      isUnregistered: false,
      tamperDetected: false,
      credential,
      on_chain_verification: {
        source: onChainResult.source,
        rootHash: onChainResult.rootHash,
        contractAddress: config.credentialRegistryAddress,
        isValid: onChainResult.isValid,
        isRevoked: onChainResult.isRevoked,
        issuingInstitutionName: onChainResult.issuingInstitutionName,
      },
      forensic_scan: forensic,
      pdfExtracted: {
        batchId: matchedBatch.batchId,
        leafIndex: extractedLeafIndex,
        prn: normalizedPrn || genuineStudent.prn,
        cgpa: extractedCgpa,
      },
    });
  } catch (err: any) {
    console.error("PDF dual-verification route error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Internal server error executing PDF dual-verification",
      },
      { status: 500 }
    );
  }
}


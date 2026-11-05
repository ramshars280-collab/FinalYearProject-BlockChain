import { NextRequest, NextResponse } from "next/server";
import { getBatchByIdDb, getCredentialByPrnDb, isDatabaseUnavailableError } from "@/lib/db";
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
import { verifyCredentialOnChain, verifyBatchAnchorEvidence } from "@/lib/contracts";
import { getAIForensicEndpoint, validateAIForensicUrl } from "@/lib/aiConfig";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getRequestId, jsonResponse, logger } from "@/lib/observability";
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
  status: "COMPLETED" | "UNAVAILABLE" | "QUEUED";
  ai_confidence_score?: number;
  verdict?: "LOW ANOMALY" | "SUSPICIOUS" | "HIGH ANOMALY" | "AUTHENTIC" | "TAMPERED" | string;
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
  const endpoint = getAIForensicEndpoint();
  const validation = validateAIForensicUrl(endpoint);

  if (!validation.valid) {
    return {
      status: "UNAVAILABLE",
      reason: validation.error || "Invalid AI forensic service URL configuration",
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const formData = new FormData();
    const blob = new Blob([Buffer.from(fileBuffer)], { type: "application/pdf" });
    formData.append("file", blob, fileName);

    const res = await fetch(endpoint, {
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

// Module-level Singleton OCR worker cache to avoid repeated initialization and memory leaks
let cachedOcrWorker: any = null;
let isInitializingWorker = false;

async function getCachedOcrWorker() {
  if (cachedOcrWorker) return cachedOcrWorker;
  if (isInitializingWorker) {
    await new Promise((r) => setTimeout(r, 300));
    if (cachedOcrWorker) return cachedOcrWorker;
  }
  isInitializingWorker = true;
  try {
    const { createWorker } = await import("tesseract.js");
    const path = await import("path");
    const workerPath = path.join(
      process.cwd(),
      "node_modules",
      "tesseract.js",
      "src",
      "worker-script",
      "node",
      "index.js"
    );

    cachedOcrWorker = await createWorker("eng", 1, { workerPath });
    await cachedOcrWorker.setParameters({
      tessedit_pageseg_mode: "6", // Fast uniform block text mode (under 1 second OCR)
    });
  } catch (err) {
    console.warn("Failed to initialize Tesseract worker:", err);
  } finally {
    isInitializingWorker = false;
  }
  return cachedOcrWorker;
}

function extractImagesFromPdf(pdfBuffer: Buffer): Buffer[] {
  const images: Buffer[] = [];
  let offset = 0;
  while (offset < pdfBuffer.length - 3) {
    if (pdfBuffer[offset] === 0xff && pdfBuffer[offset + 1] === 0xd8 && pdfBuffer[offset + 2] === 0xff) {
      let eof = offset + 3;
      while (eof < pdfBuffer.length - 1) {
        if (pdfBuffer[eof] === 0xff && pdfBuffer[eof + 1] === 0xd9) {
          images.push(pdfBuffer.subarray(offset, eof + 2));
          offset = eof + 2;
          break;
        }
        eof++;
      }
      if (eof >= pdfBuffer.length - 1) break;
    } else {
      offset++;
    }
  }
  return images;
}

/** Maximum permitted PDF upload size: 10MB */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Maximum permitted PDF pages */
const MAX_PDF_PAGES = 5;

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const startTime = Date.now();
  const skipAi = request.nextUrl.searchParams.get("skip_ai") === "true";
  try {
    const clientIp = getClientIp(request);
    // Rate limit: 30 requests per minute per IP to protect resource-intensive PDF and AI forensic processing
    const rateLimit = checkRateLimit(`verify_pdf:${clientIp}`, { maxRequests: 30, windowMs: 60 * 1000 });
    if (!rateLimit.allowed) {
      logger.warn('PDF verification rate limit exceeded', {
        requestId,
        route: '/api/verify/pdf',
        method: 'POST',
        statusCode: 429,
        durationMs: Date.now() - startTime,
        details: { clientIp },
      });
      return jsonResponse(
        {
          success: false,
          error: "Too many verification requests. Please try again later.",
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
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return jsonResponse(
        {
          success: false,
          error: "No file uploaded. Please select an official degree certificate PDF.",
          requestId,
        },
        { status: 400 },
        requestId
      );
    }

    const fileName = file.name.toLowerCase();
    const isPdf = fileName.endsWith(".pdf") || file.type === "application/pdf";

    if (!isPdf) {
      return jsonResponse(
        {
          success: false,
          error:
            "Invalid file format. Only university degree certificate documents in PDF format (.pdf) are supported.",
          requestId,
        },
        { status: 400 },
        requestId
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return jsonResponse(
        {
          success: false,
          error: `File size exceeds the maximum allowed limit of 10MB. Current size: ${(file.size / (1024 * 1024)).toFixed(2)}MB.`,
          requestId,
        },
        { status: 413 },
        requestId
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    // Clone arrayBuffer before pdfjs-dist transfers/detaches the buffer
    const forensicBuffer = arrayBuffer.slice(0);
    const data = new Uint8Array(arrayBuffer);

    if (data.length === 0) {
      return jsonResponse(
        { success: false, error: "The uploaded PDF file is empty (0 bytes).", requestId },
        { status: 400 },
        requestId
      );
    }

    // Magic-byte header verification: Valid PDF must start with '%PDF-' (0x25, 0x50, 0x44, 0x46, 0x2D)
    if (
      data.length < 5 ||
      data[0] !== 0x25 ||
      data[1] !== 0x50 ||
      data[2] !== 0x44 ||
      data[3] !== 0x46 ||
      data[4] !== 0x2d
    ) {
      return jsonResponse(
        {
          success: false,
          error: "Invalid document structure: File does not contain a valid PDF magic header (%PDF-).",
          requestId,
        },
        { status: 400 },
        requestId
      );
    }

    // 1. Text Layer Extraction & Page Count Enforcement via pdfjs-dist
    let rawText = "";
    try {
      const pdfjsLib = require("pdfjs-dist/build/pdf.js");
      const doc = await pdfjsLib.getDocument({ data }).promise;
      if (doc && doc.numPages > MAX_PDF_PAGES) {
        return jsonResponse(
          {
            success: false,
            error: `PDF exceeds maximum allowed page count (${MAX_PDF_PAGES} pages). Uploaded document has ${doc.numPages} pages.`,
            requestId,
          },
          { status: 400 },
          requestId
        );
      }
      if (doc && doc.numPages >= 1) {
        const page = await doc.getPage(1);
        const tc = await page.getTextContent();
        rawText = tc.items.map((i: any) => i.str).join(" ");
      }
    } catch (parseErr: any) {
      console.warn("PDF text layer extraction note (proceeding to OCR fallback):", parseErr?.message || parseErr);
      rawText = "";
    }

    // Rule 1: Scanned Document Detection & OCR Fallback Processing
    let isScannedPdf = false;
    let ocrExtracted = false;

    if (!rawText || rawText.trim().length === 0) {
      isScannedPdf = true;
      try {
        console.log("📷 Zero-text / Scanned PDF detected. Executing Tesseract.js Optical Character Recognition (OCR)...");

        const ocrBuffer = Buffer.from(forensicBuffer);
        const extractedImages = extractImagesFromPdf(ocrBuffer);
        const targetBuffer = extractedImages.length > 0 ? extractedImages[0] : ocrBuffer;

        const worker = await getCachedOcrWorker();
        if (worker) {
          const ocrPromise = worker.recognize(targetBuffer);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("OCR scanning timeout (>5000ms)")), 5000)
          );

          const { data }: any = await Promise.race([ocrPromise, timeoutPromise]);
          if (data && data.text && data.text.trim().length > 0) {
            rawText = data.text;
            ocrExtracted = true;
            console.log(`✅ OCR Engine successfully extracted ${rawText.length} characters from scanned PDF.`);
          }
        }
      } catch (ocrErr: any) {
        console.warn("⚠️ OCR processing encountered an exception or timeout:", ocrErr?.message || ocrErr);
      }

      // If OCR was unable to recover any text from the scanned image
      if (!rawText || rawText.trim().length === 0) {
        return jsonResponse(
          {
            success: false,
            diagnostic_code: "SCANNED_DOCUMENT_REQUIRES_OCR" as DiagnosticCode,
            error:
              "Scanned Document Detected: This PDF contains flat raster images without an embedded digital text layer. OCR processing did not detect readable text.",
            requestId,
          },
          { status: 422 },
          requestId
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

    // If neither batch ID nor PRN was found in the text
    if (!batchMatch && !prnMatch) {
      return jsonResponse(
        {
          success: false,
          diagnostic_code: "RECORD_NOT_IN_DATABASE" as DiagnosticCode,
          error:
            "Unrecognized Academic Document: No verifiable university Permanent Registration Number (PRN) or Batch identifier found in document text.",
          requestId,
        },
        { status: 400 },
        requestId
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
      const normalizedBatchId = extractedBatchId.replace(/BATCHOL|BATCH0L|BATCHOI|BATCH0I/gi, "BATCH01");
      matchedBatch = (await getBatchByIdDb(normalizedBatchId)) || (await getBatchByIdDb(extractedBatchId));
      if (!matchedBatch) {
        matchedBatch =
          initializeDefaultBatches().find(
            (b) =>
              b.batchId.toLowerCase() === normalizedBatchId.toLowerCase() ||
              b.batchId.toLowerCase() === extractedBatchId.toLowerCase()
          ) || null;
      }
      if (!matchedBatch && extractedBatchId.toLowerCase().includes("batch02")) {
        const { rootHex } = buildBatchMerkleTree(INITIAL_STUDENTS_MGM_BATCH2);
        matchedBatch = {
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
    }

    // PRN-based lookup fallback if batch not matched yet
    if (!matchedBatch && normalizedPrn) {
      const dbCred = await getCredentialByPrnDb(normalizedPrn);
      if (dbCred) {
        matchedBatch = await getBatchByIdDb(dbCred.batchId);
        extractedLeafIndex = dbCred.leafIndex;
      }
    }

    // Trigger AI Forensic Microservice asynchronously alongside deterministic checks (deferred when skip_ai=true)
    const forensicPromise: Promise<ForensicScanResult> = skipAi
      ? Promise.resolve({
          status: "QUEUED" as const,
          reason: "AI forensic analysis deferred to independent forensic runner",
        })
      : callAIForensicMicroservice(forensicBuffer, file.name);

    // Rule 2: Unregistered Issuer / Counterfeit Batch (Deterministic Database Check)
    if (!matchedBatch) {
      const forensic = await forensicPromise;
      return jsonResponse({
        success: true,
        diagnostic_code: "UNREGISTERED_ISSUER" as DiagnosticCode,
        diagnostic_message: `Unregistered Authority: Batch '${extractedBatchId || "UNKNOWN"}' was never anchored or registered on the Ethereum credential registry.`,
        isValid: false,
        isRevoked: false,
        isUnregistered: true,
        tamperDetected: true,
        tamperReason: `Unregistered Authority: Batch '${extractedBatchId || "UNKNOWN"}' is not authorized on blockchain registry.`,
        forensic_scan: forensic,
        pdfExtracted: {
          batchId: extractedBatchId,
          leafIndex: extractedLeafIndex,
          prn: normalizedPrn,
          cgpa: extractedCgpa,
        },
        requestId,
      }, { status: 200 }, requestId);
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
      return jsonResponse({
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
        requestId,
      }, { status: 200 }, requestId);
    }

    const genuineStudent: StudentDegreeData = matchedBatch.records[extractedLeafIndex];

    // Rule 4: Claim Mismatch - CGPA
    if (extractedCgpa !== undefined && genuineStudent.cgpa !== undefined) {
      const genuineCgpa = parseFloat(String(genuineStudent.cgpa));
      if (Math.abs(extractedCgpa - genuineCgpa) > 0.01) {
        const forensic = await forensicPromise;
        return jsonResponse({
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
          requestId,
        }, { status: 200 }, requestId);
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
      return jsonResponse({
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
        requestId,
      }, { status: 200 }, requestId);
    }

    // 4. On-Chain Merkle Proof Verification & Revocation
    const treeData = buildBatchMerkleTree(matchedBatch.records);
    const leafProof = treeData.proofs[extractedLeafIndex];
    const leafHash = hashCredentialSubject(genuineStudent);
    const config = getSepoliaConfig();

    let isVerifiedOnChain = false;
    if (matchedBatch.status === "ANCHORED" && matchedBatch.txHash) {
      try {
        const evidence = await verifyBatchAnchorEvidence(
          matchedBatch.batchId,
          matchedBatch.merkleRoot,
          matchedBatch.txHash
        );
        isVerifiedOnChain = evidence.isVerifiedOnChain;
      } catch {
        isVerifiedOnChain = false;
      }
    }

    const proofData = {
      ...leafProof,
      batchId: matchedBatch.batchId,
      contractAddress: isVerifiedOnChain ? config.credentialRegistryAddress : "",
      network: isVerifiedOnChain ? "Ethereum Sepolia" : "Local Institutional Registry",
      ...(isVerifiedOnChain ? { chainId: 11155111 } : {}),
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
      return jsonResponse({
        success: true,
        diagnostic_code: "MERKLE_PROOF_INVALID" as DiagnosticCode,
        diagnostic_message: `Cryptographic Merkle Proof Failure: Computed leaf hash does not verify against ${onChainResult.source === "SEPOLIA_RPC" ? "on-chain" : "registered"} root (${onChainResult.rootHash}).`,
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
        requestId,
      }, { status: 200 }, requestId);
    }

    // Rule 7: Credential Revoked (Deterministic on-chain bitmap and database registry check)
    const isRevokedOnChain =
      Boolean(onChainResult.isRevoked) ||
      Boolean(
        Array.isArray(matchedBatch.revokedIndices) &&
          matchedBatch.revokedIndices.includes(extractedLeafIndex)
      );

    if (isRevokedOnChain) {
      const forensic = await forensicPromise;
      return jsonResponse({
        success: true,
        diagnostic_code: "CREDENTIAL_REVOKED" as DiagnosticCode,
        diagnostic_message:
          onChainResult.source === "SEPOLIA_RPC" || onChainResult.source === "LOCAL_RPC"
            ? `Revocation Alert: This academic credential was officially revoked on ${
                onChainResult.source === "LOCAL_RPC" ? "Hardhat Local (31337)" : "Ethereum Sepolia (11155111)"
              }.`
            : "Revocation Alert: This academic credential was officially revoked in the University Examination Authority registry.",
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
        requestId,
      }, { status: 200 }, requestId);
    }

    // 5. Dual-Verification Resolution: Cryptographic Truth + AI Forensic Heuristic
    // Cryptographic Merkle proof on blockchain is the authoritative source of truth.
    // The probabilistic ELA heuristic provides visual forensic context without overriding verified cryptographic proof.
    const forensic = await forensicPromise;
    const isTamperedByScore =
      typeof forensic.ai_confidence_score === "number" &&
      forensic.ai_confidence_score > AI_TAMPERING_THRESHOLD;

    const networkName =
      onChainResult.source === "LOCAL_RPC"
        ? "Hardhat Local (31337)"
        : onChainResult.source === "SEPOLIA_RPC"
        ? "Ethereum Sepolia (11155111)"
        : "institutional registry";

    // Truthfully distinguish forensic states: LOW ANOMALY, SUSPICIOUS, HIGH ANOMALY, UNAVAILABLE
    const normalizedVerdict =
      forensic.verdict === "AUTHENTIC"
        ? "LOW ANOMALY"
        : forensic.verdict === "TAMPERED"
        ? "HIGH ANOMALY"
        : forensic.verdict;

    const normalizedForensic: ForensicScanResult = {
      ...forensic,
      ...(normalizedVerdict ? { verdict: normalizedVerdict } : {}),
    };

    let forensicSummary = "";
    if (forensic.status === "COMPLETED") {
      if (normalizedVerdict === "LOW ANOMALY") {
        forensicSummary = "ELA forensic scan indicates consistent JPEG compression residuals (LOW ANOMALY).";
      } else if (normalizedVerdict === "SUSPICIOUS") {
        forensicSummary = `Note: ELA forensic scan flagged moderate compression variance (SUSPICIOUS, anomaly score: ${forensic.ai_confidence_score}); cryptographic proof remains authoritative.`;
      } else if (normalizedVerdict === "HIGH ANOMALY" || isTamperedByScore) {
        forensicSummary = `Advisory: ELA forensic scan flagged elevated compression anomalies (HIGH ANOMALY, anomaly score: ${forensic.ai_confidence_score}); on-chain cryptographic anchor remains authoritative.`;
      } else {
        forensicSummary = `ELA forensic verdict: ${normalizedVerdict}.`;
      }
    } else if (forensic.status === "QUEUED") {
      forensicSummary = "AI forensic analysis deferred to independent forensic runner; verified via on-chain Merkle root.";
    } else {
      forensicSummary = `AI forensic scan unavailable (${forensic.reason || "offline"}); verified via on-chain Merkle root.`;
    }

    const diagnosticMessage = `Fully Verified: Cryptographic Merkle proof matches ${networkName}, claims certified, and credential active. ${forensicSummary}`;

    return jsonResponse({
      success: true,
      diagnostic_code: "FULLY_VERIFIED" as DiagnosticCode,
      diagnostic_message: diagnosticMessage,
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
      onChainCheck: onChainResult,
      forensic_scan: normalizedForensic,
      pdfExtracted: {
        batchId: matchedBatch.batchId,
        leafIndex: extractedLeafIndex,
        prn: normalizedPrn || genuineStudent.prn,
        cgpa: extractedCgpa,
      },
      requestId,
    }, { status: 200 }, requestId);
  } catch (err: any) {
    const isDbDown = isDatabaseUnavailableError(err);
    const statusCode = isDbDown ? 503 : 500;
    logger.error("PDF dual-verification route error", err, {
      requestId,
      route: "/api/verify/pdf",
      method: "POST",
      statusCode,
      durationMs: Date.now() - startTime,
    });
    return jsonResponse(
      {
        success: false,
        error: isDbDown ? "Database service unavailable" : "Internal server error executing PDF dual-verification",
        requestId,
      },
      { status: statusCode },
      requestId
    );
  }
}


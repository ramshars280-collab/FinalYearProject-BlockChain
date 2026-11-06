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
import {
  BatchRecord,
  StudentDegreeData,
  W3CCredentialPayload,
  SemanticCheckResult,
  SemanticMismatchItem,
  StandardVerificationOutcome,
  CredentialAuthenticityStatus,
  DocumentForensicAssessment,
} from "@/types";

export const dynamic = "force-dynamic";

/** Standardized AI Forensic Tampering Confidence Threshold (0.65) */
const AI_TAMPERING_THRESHOLD = 0.65;

export type DiagnosticCode =
  | "FULLY_VERIFIED"
  | "CLAIM_MISMATCH_CGPA"
  | "CLAIM_MISMATCH_DEGREE"
  | "CLAIM_MISMATCH_NAME"
  | "CLAIM_MISMATCH_PRN"
  | "SEMANTIC_CLAIM_MISMATCH"
  | "MERKLE_PROOF_INVALID"
  | "CREDENTIAL_REVOKED"
  | "RECORD_NOT_IN_DATABASE"
  | "UNREGISTERED_ISSUER"
  | "VISUAL_FORGERY_DETECTED"
  | "SCANNED_DOCUMENT_REQUIRES_OCR";

interface ForensicScanResult {
  status: "COMPLETED" | "UNAVAILABLE" | "QUEUED";
  assessment?: DocumentForensicAssessment;
  ai_confidence_score?: number;
  verdict?: "NO_SIGNIFICANT_ANOMALIES" | "ANOMALIES_DETECTED" | "INCONCLUSIVE" | "SERVICE_UNAVAILABLE" | string;
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

  const aiTimeoutMs = parseInt(process.env.AI_FORENSIC_TIMEOUT_MS || "12000", 10);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), aiTimeoutMs);

  try {
    const formData = new FormData();
    const blob = new Blob([Buffer.from(fileBuffer)], { type: "application/pdf" });
    formData.append("file", blob, fileName);

    const reqHeaders: Record<string, string> = {};
    if (process.env.AI_FORENSIC_SECRET?.trim()) {
      reqHeaders["X-Forensic-Secret"] = process.env.AI_FORENSIC_SECRET.trim();
    }

    const res = await fetch(endpoint, {
      method: "POST",
      body: formData,
      headers: reqHeaders,
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
        ? `AI Forensic Service timed out (>${aiTimeoutMs}ms)`
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
  const skipAiQuery = request.nextUrl.searchParams.get("skip_ai");
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
    const skipAiForm = formData.get("skip_ai");
    const skipAi =
      skipAiQuery === "true" ||
      skipAiQuery === "1" ||
      skipAiForm === "true" ||
      skipAiForm === "1";
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

        if (extractedImages.length > 0) {
          const targetBuffer = extractedImages[0];
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
        } else {
          console.warn("⚠️ Scanned PDF contains no extractable JPEG image streams for Tesseract OCR.");
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
            verification_outcome: "INCONCLUSIVE" as StandardVerificationOutcome,
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
    let batchMatch = rawText.match(/Batch ID:\s*([A-Za-z0-9_-]+)/i);
    let leafMatch = rawText.match(/Leaf:\s*#?(\d+)/i);
    let prnMatch =
      rawText.match(/Permanent\s+Registration\s+No\.?\s*(?:[:=]|\s)\s*([A-Za-z0-9_-]+)/i) ||
      rawText.match(/Permanent\s+Reg\.?\s*No\.?\s*(?:[:=]|\s)\s*([A-Za-z0-9_-]+)/i) ||
      rawText.match(/Registration\s+No\.?\s*(?:[:=]|\s)\s*([A-Za-z0-9_-]+)/i) ||
      rawText.match(/PRN\s*(?:[:=]|\s)\s*([A-Za-z0-9_-]+)/i) ||
      rawText.match(/\b(PRN\d{8,12})\b/i) ||
      rawText.match(/\b(DEMO-[A-Z0-9_-]+)\b/i);

    // If neither batch ID nor PRN was found in the digital text layer, attempt OCR fallback
    if (!batchMatch && !prnMatch && !ocrExtracted) {
      try {
        const ocrBuffer = Buffer.from(forensicBuffer);
        const extractedImages = extractImagesFromPdf(ocrBuffer);
        if (extractedImages.length > 0) {
          const worker = await getCachedOcrWorker();
          if (worker) {
            const { data }: any = await worker.recognize(extractedImages[0]);
            if (data && data.text && data.text.trim().length > 0) {
              rawText = `${rawText} ${data.text}`;
              ocrExtracted = true;
              batchMatch = rawText.match(/Batch ID:\s*([A-Za-z0-9_-]+)/i);
              leafMatch = rawText.match(/Leaf:\s*#?(\d+)/i);
              prnMatch =
                rawText.match(/Permanent\s+Registration\s+No\.?\s*(?:[:=]|\s)\s*([A-Za-z0-9_-]+)/i) ||
                rawText.match(/Permanent\s+Reg\.?\s*No\.?\s*(?:[:=]|\s)\s*([A-Za-z0-9_-]+)/i) ||
                rawText.match(/Registration\s+No\.?\s*(?:[:=]|\s)\s*([A-Za-z0-9_-]+)/i) ||
                rawText.match(/PRN\s*(?:[:=]|\s)\s*([A-Za-z0-9_-]+)/i) ||
                rawText.match(/\b(PRN\d{8,12})\b/i) ||
                rawText.match(/\b(DEMO-[A-Z0-9_-]+)\b/i);
            }
          }
        }
      } catch (ocrErr) {
        console.warn("OCR fallback attempt exception:", ocrErr);
      }
    }

    // If neither batch ID nor PRN was found in the text
    if (!batchMatch && !prnMatch) {
      return jsonResponse(
        {
          success: false,
          diagnostic_code: "RECORD_NOT_IN_DATABASE" as DiagnosticCode,
          verification_outcome: "INCONCLUSIVE" as StandardVerificationOutcome,
          error:
            "Unrecognized Academic Document: No verifiable university Permanent Registration Number (PRN) or Batch identifier found in document text.",
          requestId,
        },
        { status: 400 },
        requestId
      );
    }

    const cgpaMatch =
      rawText.match(/Cumulative\s+CGPA\s*(?:[:=]|\s|of)\s*([\d.]+)/i) ||
      rawText.match(/CUMULATIVE\s+CGPA\s*(?:[:=]|\s|of)\s*([\d.]+)/i) ||
      rawText.match(/CGPA\s*(?:[:=]|\s|of)\s*([\d.]+)/i) ||
      rawText.match(/GPA\s*(?:[:=]|\s|of)\s*([\d.]+)/i);

    const degreeMatch =
      rawText.match(/Degree\s*(?:Conferred)?\s*(?:[:=]|\s)\s*([A-Za-z\s&()-]+?)(?:\s+in|\s+with|\s*\(|$|\n)/i) ||
      rawText.match(/degree\s+of\s+([A-Za-z\s&()-]+?)(?:\s+in|\s+upon|\s+U\s*P\s*O\s*N|\s+with|\))/i) ||
      rawText.match(/Bachelor\s+of\s+Technology/i) ||
      rawText.match(/Master\s+of\s+Technology/i) ||
      rawText.match(/Bachelor\s+of\s+Engineering/i) ||
      rawText.match(/Bachelor\s+of\s+Science/i) ||
      rawText.match(/Degree of\s+([A-Za-z\s&()-]+)/i);

    const nameMatch =
      rawText.match(/\b(?:U\s*P\s*O\s*N|UPON|conferred\s+upon)\s+([A-Za-z\s.'-]+?)\s+(?:who\s+has|for\s+successfully|who\s+fulfilled|for\s+successful)/i) ||
      rawText.match(/\b(?:is\s+awarded|awarded\s+to|awarded|presented\s+to)\s+([A-Za-z0-9\s.'-]+?)\s+(?:For\s+successful|for\s+successfully|who\s+has|for\s+outstanding|in\s+recognition)/i) ||
      rawText.match(/(?:Candidate|Student)\s+Name\s*(?:[:=]|\s)\s*([A-Za-z\s.'-]+?)(?:\s+(?:PRN|Registration|Permanent|Roll|Cumulative|Branch|Discipline|Batch)|$|\n)/i) ||
      rawText.match(/Name\s*:\s*([A-Za-z\s.'-]+?)(?:\s+(?:PRN|Registration|Permanent|Roll|Cumulative|Branch|Discipline|Batch)|$|\n)/i);

    const branchMatch =
      rawText.match(/(?:Branch\s*(?:\/\s*Discipline)?|Discipline|Department|Major)\s*(?:[:=]|\s)\s*([A-Za-z\s&()-]+?)(?:\s+(?:Permanent|PRN|Cumulative|CGPA|Graduation|Class|Level)|$|\n)/i) ||
      rawText.match(/(?:completion\s+of\s+(?:a\s+)?|degree\s+of\s+)[A-Za-z\s&()-]+?\s+in\s+([A-Za-z\s&()-]+?)(?:\.|\s+In\s+recognition|\s+with|\s+U\s*P\s*O\s*N|\s+UPON)/i) ||
      rawText.match(/\bin\s+([A-Za-z\s&()-]+?)\s+(?:U\s*P\s*O\s*N|UPON|\.|\s*\(|with\s+Cumulative|in\s+recognition|who\s+has|for\s+successfully)/i);

    const yearMatch =
      rawText.match(/Graduation\s+Year\s*(?:[:=]|\s)\s*(\d{4})/i) ||
      rawText.match(/\(Class\s+of\s*(\d{4})\)/i) ||
      rawText.match(/Class\s+of\s*(\d{4})/i) ||
      rawText.match(/Year\s+of\s+Passing\s*(?:[:=]|\s)\s*(\d{4})/i) ||
      rawText.match(/Passing\s+Year\s*(?:[:=]|\s)\s*(\d{4})/i);

    const cleanField = (val?: string) => {
      if (!val) return undefined;
      const cleaned = val
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^[•,;:\s]+|[•,;:\s]+$/g, "");
      return cleaned.length > 0 ? cleaned : undefined;
    };

    const rawPrn = prnMatch ? (prnMatch[1] || prnMatch[0]) : "";
    const normalizedPrn = normalizePRN(rawPrn);
    const extractedBatchId = batchMatch ? cleanField(batchMatch[1]) || null : null;
    let extractedLeafIndex = leafMatch ? parseInt(leafMatch[1], 10) : null;
    const extractedCgpa = cgpaMatch ? parseFloat(cgpaMatch[1]) : undefined;
    const extractedDegree = degreeMatch ? cleanField(degreeMatch[1] || degreeMatch[0]) : undefined;
    const extractedStudentName = nameMatch ? cleanField(nameMatch[1]) : undefined;
    const extractedBranch = branchMatch ? cleanField(branchMatch[1]) : undefined;
    const extractedPassingYear = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

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
          reason: "Forensic analysis queued",
        })
      : callAIForensicMicroservice(forensicBuffer, file.name);

    // Rule 2: Unregistered Issuer / Counterfeit Batch (Deterministic Database Check)
    if (!matchedBatch) {
      const forensic = await forensicPromise;
      return jsonResponse({
        success: true,
        diagnostic_code: "UNREGISTERED_ISSUER" as DiagnosticCode,
        verification_outcome: "CRYPTOGRAPHICALLY_INVALID" as StandardVerificationOutcome,
        diagnostic_message: `Unregistered Authority: Batch '${extractedBatchId || "UNKNOWN"}' was never anchored or registered on the Ethereum credential registry.`,
        isValid: false,
        isRevoked: false,
        isUnregistered: true,
        tamperDetected: true,
        tamperReason: `Unregistered Authority: Batch '${extractedBatchId || "UNKNOWN"}' is not authorized on blockchain registry.`,
        forensic_scan: forensic,
        semantic_check: {
          status: "SKIPPED",
          reason: `Unregistered Authority: Batch '${extractedBatchId || "UNKNOWN"}' was never anchored or registered on Ethereum Sepolia.`,
        },
        pdfExtracted: {
          batchId: extractedBatchId,
          leafIndex: extractedLeafIndex,
          prn: normalizedPrn,
          cgpa: extractedCgpa,
          studentName: extractedStudentName,
          branch: extractedBranch,
          graduationYear: extractedPassingYear,
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
        verification_outcome: "CRYPTOGRAPHICALLY_INVALID" as StandardVerificationOutcome,
        diagnostic_message: `Record Not Found: Candidate registration (${normalizedPrn || "UNKNOWN"}) does not exist in certified batch '${matchedBatch.batchId}'.`,
        isValid: false,
        isRevoked: false,
        isUnregistered: false,
        tamperDetected: true,
        tamperReason: `Candidate record does not exist in batch '${matchedBatch.batchId}'.`,
        forensic_scan: forensic,
        semantic_check: {
          status: "SKIPPED",
          reason: `Candidate registration (${normalizedPrn || "UNKNOWN"}) does not exist in certified batch '${matchedBatch.batchId}'.`,
        },
        pdfExtracted: {
          batchId: matchedBatch.batchId,
          leafIndex: extractedLeafIndex,
          prn: normalizedPrn,
          cgpa: extractedCgpa,
          studentName: extractedStudentName,
          branch: extractedBranch,
          graduationYear: extractedPassingYear,
        },
        requestId,
      }, { status: 200 }, requestId);
    }

    const genuineStudent: StudentDegreeData = matchedBatch.records[extractedLeafIndex];

    // 3.5 Semantic Claim Consistency Audit (Mechanism B: Field-by-Field Audit vs On-Chain Anchored Record)
    const fieldMismatches: SemanticMismatchItem[] = [];

    // A. Check Student Name
    if (extractedStudentName && genuineStudent.fullName) {
      const titles = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "shri", "smt"]);
      const extractedTokens = extractedStudentName
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((t) => t.length > 0 && !titles.has(t));
      const genuineTokens = genuineStudent.fullName
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((t) => t.length > 0 && !titles.has(t));

      const normExtracted = extractedTokens.join("");
      const normGenuine = genuineTokens.join("");

      let nameMatches = normExtracted === normGenuine;
      if (!nameMatches) {
        if (extractedTokens.length >= 2 && genuineTokens.length >= 2) {
          const hasCommonMismatch = extractedTokens.some(
            (et) => !genuineTokens.some((gt) => gt.includes(et) || et.includes(gt))
          );
          nameMatches = !hasCommonMismatch;
        } else if (normExtracted.length >= 4 && (normGenuine.includes(normExtracted) || normExtracted.includes(normGenuine))) {
          nameMatches = extractedTokens.length === genuineTokens.length;
        }
      }

      if (!nameMatches) {
        fieldMismatches.push({
          field: "Candidate Name",
          claimed: extractedStudentName,
          certified: genuineStudent.fullName,
          discrepancy: `Candidate Name mismatch: Document claims '${extractedStudentName}', but certified on-chain record anchors '${genuineStudent.fullName}'.`,
        });
      }
    }

    // B. Check PRN
    if (normalizedPrn && genuineStudent.prn) {
      if (normalizePRN(genuineStudent.prn) !== normalizedPrn) {
        fieldMismatches.push({
          field: "Permanent Registration Number (PRN)",
          claimed: normalizedPrn,
          certified: genuineStudent.prn,
          discrepancy: `PRN mismatch: Document claims '${normalizedPrn}', but certified record anchors '${genuineStudent.prn}'.`,
        });
      }
    }

    // C. Check CGPA
    if (extractedCgpa !== undefined && genuineStudent.cgpa !== undefined) {
      const genuineCgpa = parseFloat(String(genuineStudent.cgpa));
      if (Math.abs(extractedCgpa - genuineCgpa) > 0.01) {
        fieldMismatches.push({
          field: "Cumulative CGPA",
          claimed: extractedCgpa,
          certified: genuineCgpa,
          discrepancy: `Cumulative CGPA mismatch: Document presents CGPA ${extractedCgpa}, but certified record anchors CGPA ${genuineCgpa}.`,
        });
      }
    }

    // D. Check Degree
    if (extractedDegree && genuineStudent.degree) {
      const normExtracted = extractedDegree.toLowerCase().replace(/[^a-z0-9]/g, "");
      const normGenuine = genuineStudent.degree.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!normGenuine.includes(normExtracted) && !normExtracted.includes(normGenuine)) {
        fieldMismatches.push({
          field: "Degree Conferred",
          claimed: extractedDegree,
          certified: genuineStudent.degree,
          discrepancy: `Degree mismatch: Document claims '${extractedDegree}', but certified record anchors '${genuineStudent.degree}'.`,
        });
      }
    }

    // E. Check Branch
    if (extractedBranch && genuineStudent.branch) {
      const normalizeBranch = (str: string) =>
        str
          .toLowerCase()
          .replace(/\band\b/g, "&")
          .replace(/[^a-z0-9]/g, "");
      const normExtracted = normalizeBranch(extractedBranch);
      const normGenuine = normalizeBranch(genuineStudent.branch);
      if (!normGenuine.includes(normExtracted) && !normExtracted.includes(normGenuine)) {
        fieldMismatches.push({
          field: "Branch / Discipline",
          claimed: extractedBranch,
          certified: genuineStudent.branch,
          discrepancy: `Branch mismatch: Document claims '${extractedBranch}', but certified record anchors '${genuineStudent.branch}'.`,
        });
      }
    }

    // F. Check Graduation Year
    if (extractedPassingYear && genuineStudent.graduationYear) {
      if (extractedPassingYear !== genuineStudent.graduationYear) {
        fieldMismatches.push({
          field: "Graduation Year",
          claimed: extractedPassingYear,
          certified: genuineStudent.graduationYear,
          discrepancy: `Graduation Year mismatch: Document claims Class of ${extractedPassingYear}, but certified record anchors Class of ${genuineStudent.graduationYear}.`,
        });
      }
    }

    const semanticCheck: SemanticCheckResult = {
      status: fieldMismatches.length > 0 ? "MISMATCH" : "MATCH",
      field_mismatches: fieldMismatches,
      claimed: {
        studentName: extractedStudentName,
        prn: normalizedPrn || undefined,
        cgpa: extractedCgpa,
        degree: extractedDegree,
        branch: extractedBranch,
        graduationYear: extractedPassingYear,
      },
      certified: {
        studentName: genuineStudent.fullName,
        prn: genuineStudent.prn,
        cgpa: genuineStudent.cgpa,
        degree: genuineStudent.degree,
        branch: genuineStudent.branch,
        graduationYear: genuineStudent.graduationYear,
      },
    };

    if (fieldMismatches.length > 0) {
      const forensic = await forensicPromise;
      let diagCode: DiagnosticCode = "SEMANTIC_CLAIM_MISMATCH";
      if (fieldMismatches.length === 1) {
        if (fieldMismatches[0].field === "Cumulative CGPA") diagCode = "CLAIM_MISMATCH_CGPA";
        else if (fieldMismatches[0].field === "Degree Conferred") diagCode = "CLAIM_MISMATCH_DEGREE";
        else if (fieldMismatches[0].field === "Candidate Name") diagCode = "CLAIM_MISMATCH_NAME";
        else if (fieldMismatches[0].field === "Permanent Registration Number (PRN)") diagCode = "CLAIM_MISMATCH_PRN";
      }

      return jsonResponse({
        success: true,
        diagnostic_code: diagCode,
        verification_outcome: "SEMANTIC_MISMATCH" as StandardVerificationOutcome,
        diagnostic_message: `Cryptographic Claim Mismatch: ${fieldMismatches.map((m) => m.discrepancy).join(" ")}`,
        isValid: false,
        isRevoked: false,
        isUnregistered: false,
        tamperDetected: true,
        tamperReason: `Document claims do not match certified on-chain records: ${fieldMismatches.map((m) => `${m.field} (${m.claimed} vs ${m.certified})`).join("; ")}.`,
        forensic_scan: forensic,
        semantic_check: semanticCheck,
        semanticCheck: semanticCheck,
        pdfExtracted: {
          batchId: matchedBatch.batchId,
          leafIndex: extractedLeafIndex,
          prn: normalizedPrn || undefined,
          cgpa: extractedCgpa,
          studentName: extractedStudentName,
          branch: extractedBranch,
          graduationYear: extractedPassingYear,
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
        verification_outcome: "CRYPTOGRAPHICALLY_INVALID" as StandardVerificationOutcome,
        diagnostic_message: `Cryptographic Merkle Proof Failure: Computed leaf hash does not verify against ${onChainResult.source === "SEPOLIA_RPC" ? "on-chain" : "registered"} root (${onChainResult.rootHash}).`,
        isValid: false,
        isRevoked: false,
        isUnregistered: false,
        tamperDetected: true,
        tamperReason: "Merkle proof path does not resolve to the anchored root.",
        credential,
        forensic_scan: forensic,
        semantic_check: semanticCheck,
        semanticCheck: semanticCheck,
        pdfExtracted: {
          batchId: matchedBatch.batchId,
          leafIndex: extractedLeafIndex,
          prn: normalizedPrn || undefined,
          cgpa: extractedCgpa,
          studentName: extractedStudentName,
          branch: extractedBranch,
          graduationYear: extractedPassingYear,
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
        verification_outcome: "REVOKED" as StandardVerificationOutcome,
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
        semantic_check: semanticCheck,
        semanticCheck: semanticCheck,
        pdfExtracted: {
          batchId: matchedBatch.batchId,
          leafIndex: extractedLeafIndex,
          prn: normalizedPrn || undefined,
          cgpa: extractedCgpa,
          studentName: extractedStudentName,
          branch: extractedBranch,
          graduationYear: extractedPassingYear,
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
        : "institutional database registry (off-chain)";

    // P10-T05E: Separate Credential Authenticity from Document Forensic Assessment
    // A successful Merkle proof must remain VERIFIED regardless of heuristic ELA output.
    const isAnomalous =
      forensic.assessment === "ANOMALIES_DETECTED" ||
      forensic.verdict === "ANOMALIES_DETECTED" ||
      forensic.verdict === "SUSPICIOUS" ||
      forensic.verdict === "HIGH ANOMALY" ||
      isTamperedByScore;

    const forensicAssessment: DocumentForensicAssessment =
      forensic.status === "UNAVAILABLE"
        ? "SERVICE_UNAVAILABLE"
        : forensic.status === "QUEUED"
        ? "INCONCLUSIVE"
        : isAnomalous
        ? "ANOMALIES_DETECTED"
        : "NO_SIGNIFICANT_ANOMALIES";

    const normalizedForensic: ForensicScanResult = {
      ...forensic,
      assessment: forensicAssessment,
      verdict: forensicAssessment,
    };

    let forensicSummary = "";
    if (forensic.status === "COMPLETED") {
      if (forensicAssessment === "NO_SIGNIFICANT_ANOMALIES") {
        forensicSummary = "Document forensic assessment: NO SIGNIFICANT ANOMALIES (consistent compression residuals).";
      } else if (forensicAssessment === "ANOMALIES_DETECTED") {
        forensicSummary = `Document forensic assessment: ANOMALIES DETECTED (unusual compression patterns detected; manual document inspection recommended; findings alone do not establish forgery; cryptographic proof remains authoritative).`;
      } else {
        forensicSummary = `Document forensic assessment: ${forensicAssessment}.`;
      }
    } else if (forensic.status === "QUEUED") {
      forensicSummary = onChainResult.onChainVerified
        ? "AI forensic analysis deferred to independent forensic runner; verified via on-chain Merkle root."
        : "AI forensic analysis deferred to independent forensic runner; verified via institutional registry.";
    } else {
      forensicSummary = onChainResult.onChainVerified
        ? `AI forensic scan unavailable (${forensic.reason || "offline"}); verified via on-chain Merkle root.`
        : `AI forensic scan unavailable (${forensic.reason || "offline"}); verified via institutional registry.`;
    }

    // Credential Authenticity is strictly AUTHENTIC / VERIFIED based on cryptographic validation.
    // Visual compression anomalies do not degrade or override cryptographic validity.
    const standardOutcome: StandardVerificationOutcome = "AUTHENTIC";

    const diagnosticMessage = onChainResult.onChainVerified
      ? `Fully Verified: Cryptographic Merkle proof matches ${networkName}, claims certified, and credential active. ${forensicSummary}`
      : `Verified via Database Registry: Merkle proof matches institutional records (blockchain unconfirmed / offline), claims certified. ${forensicSummary}`;

    return jsonResponse({
      success: true,
      diagnostic_code: "FULLY_VERIFIED" as DiagnosticCode,
      verification_outcome: standardOutcome,
      credential_authenticity: "VERIFIED" as CredentialAuthenticityStatus,
      document_forensic_assessment: forensicAssessment,
      diagnostic_message: diagnosticMessage,
      isValid: true,
      isRevoked: false,
      isUnregistered: false,
      tamperDetected: false,
      visual_analysis_pending: forensic.status === "QUEUED",
      visual_service_offline: forensic.status === "UNAVAILABLE",
      credential,
      forensic_scan: normalizedForensic,
      on_chain_verification: {
        source: onChainResult.source,
        onChainVerified: onChainResult.onChainVerified,
        rootHash: onChainResult.rootHash,
        contractAddress: onChainResult.onChainVerified ? config.credentialRegistryAddress : undefined,
        isValid: onChainResult.isValid,
        isRevoked: onChainResult.isRevoked,
        issuingInstitutionName: onChainResult.issuingInstitutionName,
      },
      onChainCheck: onChainResult,
      semantic_check: semanticCheck,
      semanticCheck: semanticCheck,
      pdfExtracted: {
        batchId: matchedBatch.batchId,
        leafIndex: extractedLeafIndex,
        prn: normalizedPrn || undefined,
        cgpa: extractedCgpa,
        studentName: extractedStudentName,
        branch: extractedBranch,
        graduationYear: extractedPassingYear,
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


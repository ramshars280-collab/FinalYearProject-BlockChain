import JSZip from "jszip";
import { W3CCredentialPayload } from "../types";

/**
 * Packages an array of W3C credentials into a downloadable .zip archive.
 */
export async function generateCredentialsZip(
  credentials: W3CCredentialPayload[],
  batchId: string
): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder(`credentials-${batchId}`);

  credentials.forEach((cred) => {
    const prn = cred.credentialSubject.prn || "STUDENT";
    const filename = `${prn}_${cred.credentialSubject.fullName.replace(/\s+/g, "_")}.json`;
    const jsonStr = JSON.stringify(cred, null, 2);
    folder?.file(filename, jsonStr);
  });

  // Also include a batch manifest
  const manifest = {
    batchId,
    timestamp: new Date().toISOString(),
    totalCertificates: credentials.length,
    issuer: credentials[0]?.issuer,
    merkleRoot: credentials[0]?.proof.merkleProof?.rootHash,
    contractAddress: credentials[0]?.proof.merkleProof?.contractAddress,
  };
  folder?.file("batch-manifest.json", JSON.stringify(manifest, null, 2));

  return await zip.generateAsync({ type: "blob" });
}

/**
 * Triggers a browser file download for a blob or string.
 */
export function downloadFile(content: Blob | string, filename: string, mimeType: string = "application/json") {
  const blob = typeof content === "string" ? new Blob([content], { type: mimeType }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

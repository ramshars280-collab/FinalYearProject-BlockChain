"use client";

import React, { useEffect, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { X, Camera, AlertCircle, Upload } from "lucide-react";
import { W3CCredentialPayload } from "../types";

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (credential: W3CCredentialPayload) => void;
}

export default function QrScannerModal({
  isOpen,
  onClose,
  onScanSuccess,
}: QrScannerModalProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let scanner: Html5QrcodeScanner | null = null;

    try {
      scanner = new Html5QrcodeScanner(
        "qr-reader-container",
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        false
      );

      scanner.render(
        (decodedText) => {
          try {
            const parsed = JSON.parse(decodedText);
            if (parsed && (parsed.credentialSubject || parsed.type)) {
              scanner?.clear();
              onScanSuccess(parsed);
              onClose();
            } else {
              setError("QR Code does not contain a valid W3C credential JSON format.");
            }
          } catch (e) {
            setError("Scanned data is not a valid JSON credential.");
          }
        },
        (errorMessage) => {
          // ignore stream frame errors
        }
      );
    } catch (e: any) {
      setError("Could not access camera: " + e?.message);
    }

    return () => {
      if (scanner) {
        scanner.clear().catch((err) => console.warn("Scanner clear failed:", err));
      }
    };
  }, [isOpen, onClose, onScanSuccess]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-slate-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-blue-100 text-blue-900 rounded-lg">
            <Camera className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Scan Credential QR Code</h3>
            <p className="text-xs text-slate-500">
              Hold student QR certificate code in front of camera
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div
          id="qr-reader-container"
          className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 min-h-[300px]"
        />

        <p className="text-center text-xs text-slate-400 mt-4">
          Supports OpenCerts QR codes, W3C JSON-LD payloads, and EIP-712 credential links.
        </p>
      </div>
    </div>
  );
}

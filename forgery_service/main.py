import os
from typing import Dict, Any

from fastapi import FastAPI, File, UploadFile, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from ela_engine import (
    run_ai_forgery_detection,
    DEVICE,
)

# 10MB Maximum Ingest Payload Size
MAX_PAYLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}

app = FastAPI(
    title="PyTorch Deep Learning Academic Document Forgery Detection Service",
    description="Error Level Analysis (ELA) and Convolutional Neural Network forensic microservice.",
    version="2.0.0",
)

# Enable CORS for Next.js web application
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", status_code=status.HTTP_200_OK)
async def health_check() -> Dict[str, Any]:
    """
    Health check endpoint returning system status, engine model, and active compute device.
    """
    return {
        "status": "healthy",
        "service": "PyTorch ELA Forgery Detection Microservice",
        "engine": "ELAForgeryCNN",
        "device": str(DEVICE),
        "max_payload_bytes": MAX_PAYLOAD_BYTES,
        "supported_extensions": list(ALLOWED_EXTENSIONS),
    }


@app.post("/detect-tampering", status_code=status.HTTP_200_OK)
async def detect_tampering(file: UploadFile = File(...)) -> Dict[str, Any]:
    """
    Analyzes an academic document PDF, PNG, or JPEG for visual tampering:
    1. Validates payload size (<= 10MB) and file extension.
    2. Runs In-Memory Error Level Analysis (ELA).
    3. Evaluates high-frequency compression residuals with ELAForgeryCNN.
    4. Returns probabilistic tampering confidence, verdict, and JET thermal heatmap overlay.
    """
    filename = file.filename or "unknown_document.pdf"
    _, ext = os.path.splitext(filename.lower())

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Allowed formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    # Read binary stream in memory without writing to disk
    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read uploaded file stream: {str(e)}",
        )

    if not contents or len(contents) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty (0 bytes).",
        )

    if len(contents) > MAX_PAYLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds 10MB payload limit (received {len(contents)} bytes).",
        )

    # Execute AI Forensic Pipeline
    try:
        result = run_ai_forgery_detection(contents, filename)
        return result
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(val_err),
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Forensic engine analysis encountered an internal error: {str(err)}",
        )


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)

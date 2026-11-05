import os
import asyncio
import gc
import threading
import concurrent.futures
from typing import Dict, Any

from fastapi import FastAPI, File, UploadFile, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from ela_engine import (
    run_ai_forgery_detection,
    get_model_forensic_status,
    load_ela_checkpoint,
    DEVICE,
)

# 10MB Maximum Ingest Payload Size
MAX_PAYLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}


# --- Physical-Thread-Level Concurrency & Bounded Admission Controller ---

class QueueFullError(Exception):
    """Raised when the inference waiting queue exceeds its bounded capacity."""
    pass


class QueueTimeoutError(Exception):
    """Raised when an admitted request waits in queue longer than the permitted timeout."""
    pass


class InferenceTimeoutError(Exception):
    """Raised when an inference operation exceeds the HTTP execution timeout."""
    pass


class PhysicalInferenceAdmissionController:
    """
    Physical-thread-level serialization and bounded admission controller.
    Strictly guarantees memory safety for low-resource cloud environments (512MB RAM).

    Core Invariants:
    1. Dedicated single-thread pool (max_workers=1) physically prevents more than 1 OS thread
       from running heavy PyTorch/ELA image pipelines simultaneously.
    2. Concurrency permits are bound directly to the underlying concurrent.futures.Future
       completion callback. Coroutine cancellation (HTTP 504 timeout or client disconnect)
       CANNOT release the permit while the physical worker is still running.
    3. The waiting queue is strictly bounded (max_queue_size) to prevent request accumulation
       and memory exhaustion under traffic bursts.
    4. Handles event-loop re-entrance safely across test runners and server workers.
    """

    def __init__(
        self,
        max_queue_size: int = 2,
        queue_timeout: float = 8.0,
        inference_timeout: float = 25.0,
    ):
        self.max_queue_size = max_queue_size
        self.queue_timeout = queue_timeout
        self.inference_timeout = inference_timeout
        self.executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="ai_inference_worker"
        )
        self._semaphore: asyncio.Semaphore | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._waiting_count = 0
        self._is_physically_running = False
        self._state_lock = threading.Lock()

    def _get_semaphore(self) -> asyncio.Semaphore:
        current_loop = asyncio.get_running_loop()
        if self._semaphore is None or self._loop is not current_loop:
            self._semaphore = asyncio.Semaphore(1)
            self._loop = current_loop
        return self._semaphore

    def is_busy(self) -> bool:
        with self._state_lock:
            return self._is_physically_running

    def waiting_count(self) -> int:
        with self._state_lock:
            return self._waiting_count

    def get_status(self) -> Dict[str, Any]:
        with self._state_lock:
            return {
                "single_worker": True,
                "max_concurrent_inferences": 1,
                "is_physically_busy": self._is_physically_running,
                "waiting_in_queue": self._waiting_count,
                "max_queue_size": self.max_queue_size,
                "queue_timeout_seconds": self.queue_timeout,
                "inference_timeout_seconds": self.inference_timeout,
            }

    async def execute_inference(self, func, *args, **kwargs) -> Any:
        loop = asyncio.get_running_loop()
        semaphore = self._get_semaphore()

        # 1. Bounded queue check: reject if queue is at capacity
        with self._state_lock:
            if self._waiting_count >= self.max_queue_size:
                raise QueueFullError("Forensic engine queue is at maximum capacity.")
            self._waiting_count += 1

        try:
            # 2. Wait for physical inference permit with queue timeout
            try:
                await asyncio.wait_for(semaphore.acquire(), timeout=self.queue_timeout)
            except asyncio.TimeoutError:
                raise QueueTimeoutError("Queue wait timeout exceeded.")
        finally:
            with self._state_lock:
                self._waiting_count -= 1

        # 3. Setup physical execution with guaranteed completion callback
        permit_released = False
        release_lock = threading.Lock()

        def release_permit_callback(fut):
            nonlocal permit_released
            with release_lock:
                if permit_released:
                    return
                permit_released = True
            with self._state_lock:
                self._is_physically_running = False
            if not loop.is_closed():
                loop.call_soon_threadsafe(semaphore.release)

        with self._state_lock:
            self._is_physically_running = True

        try:
            # Submit to dedicated single-worker physical executor
            fut = self.executor.submit(func, *args, **kwargs)
            fut.add_done_callback(release_permit_callback)
        except Exception:
            release_permit_callback(None)
            raise

        # 4. Await future with inference execution timeout
        async_fut = asyncio.wrap_future(fut)
        try:
            result = await asyncio.wait_for(async_fut, timeout=self.inference_timeout)
            return result
        except asyncio.TimeoutError:
            # HTTP 504: The permit is NOT released here. It will only be released
            # when the physical worker thread finishes and triggers release_permit_callback.
            raise InferenceTimeoutError(
                f"Forensic engine analysis exceeded execution timeout ({self.inference_timeout}s)."
            )
        except asyncio.CancelledError:
            # Client disconnect: permit remains held until physical future finishes
            raise


# Initialize controller singleton
MAX_QUEUE_SIZE = int(os.getenv("AI_MAX_QUEUE_SIZE", "2"))
QUEUE_TIMEOUT_SECONDS = float(os.getenv("AI_QUEUE_TIMEOUT_SECONDS", "8.0"))
INFERENCE_TIMEOUT_SECONDS = float(os.getenv("AI_INFERENCE_TIMEOUT_SECONDS", "25.0"))

inference_controller = PhysicalInferenceAdmissionController(
    max_queue_size=MAX_QUEUE_SIZE,
    queue_timeout=QUEUE_TIMEOUT_SECONDS,
    inference_timeout=INFERENCE_TIMEOUT_SECONDS,
)


class _InferenceLockAdapter:
    """Backward-compatible adapter for tests checking lock state."""
    def locked(self) -> bool:
        return inference_controller.is_busy()


def get_inference_lock():
    return _InferenceLockAdapter()


app = FastAPI(
    title="PyTorch Deep Learning Academic Document Forgery Detection Service",
    description="Error Level Analysis (ELA) and Convolutional Neural Network forensic microservice.",
    version="2.0.0",
)

# Allowed CORS origins (configurable via ALLOWED_ORIGINS env var)
# Comma-separated list of origins, e.g. "http://localhost:3000,http://127.0.0.1:3000"
DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]
env_origins = os.getenv("ALLOWED_ORIGINS", "").strip()
if env_origins:
    allowed_origins = [orig.strip() for orig in env_origins.split(",") if orig.strip()]
else:
    allowed_origins = DEFAULT_ORIGINS

# Security best practice: allow_credentials must NOT be True when wildcard "*" is used
has_wildcard = "*" in allowed_origins
allow_credentials = False if has_wildcard else True

# Enable CORS for Next.js web application
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allow_credentials,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """
    Loads AI model checkpoint once during service startup rather than reloading per request.
    """
    checkpoint_env = os.getenv("AI_MODEL_CHECKPOINT_PATH", "")
    if checkpoint_env:
        load_ela_checkpoint(checkpoint_env)
    else:
        load_ela_checkpoint()


@app.get("/health", status_code=status.HTTP_200_OK)
async def health_check() -> Dict[str, Any]:
    """
    Health check endpoint returning system status, engine model, training status,
    active compute device, and physical-thread concurrency admission status.
    """
    forensic_status = get_model_forensic_status()
    concurrency_status = inference_controller.get_status()
    return {
        "status": "healthy",
        "service": "PyTorch ELA Forgery Detection Microservice",
        "engine": "ELAForgeryCNN",
        "device": str(DEVICE),
        "model_trained": forensic_status["is_model_trained"],
        "checkpoint_path": forensic_status["checkpoint_path"],
        "checkpoint_status": forensic_status["checkpoint_status"],
        "forensic_mode": forensic_status["forensic_mode"],
        "max_payload_bytes": MAX_PAYLOAD_BYTES,
        "supported_extensions": list(ALLOWED_EXTENSIONS),
        "concurrency_control": concurrency_status,
    }


@app.post("/detect-tampering", status_code=status.HTTP_200_OK)
async def detect_tampering(file: UploadFile = File(...)) -> Dict[str, Any]:
    """
    Analyzes an academic document PDF, PNG, or JPEG for visual tampering:
    1. Validates payload size (<= 10MB) and file extension.
    2. Bounded admission: limits execution to strictly 1 physical thread on a dedicated executor.
    3. Handles timeouts (504) and client cancellation without releasing the concurrency permit early.
    4. Automatically cleans up temporary memory buffers and runs garbage collection in finally block.
    5. Returns probabilistic tampering confidence, verdict, and JET thermal heatmap overlay.
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

    try:
        result = await inference_controller.execute_inference(
            run_ai_forgery_detection, contents, filename
        )
        return result
    except QueueFullError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Forensic engine queue is at maximum capacity. Please retry shortly.",
        )
    except QueueTimeoutError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Forensic engine is currently busy processing another document. Queue timeout ({inference_controller.queue_timeout}s) exceeded; please retry.",
        )
    except InferenceTimeoutError:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"Forensic engine analysis exceeded execution timeout ({inference_controller.inference_timeout}s).",
        )
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
    finally:
        try:
            del contents
        except Exception:
            pass
        gc.collect()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False, workers=1)

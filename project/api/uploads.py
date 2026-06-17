import base64
import binascii
import hashlib
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any
from uuid import uuid4

from .hardening import now_iso
from .models import UploadRequest
from .observability import hash_text


DEFAULT_MAX_BYTES = 5 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {
    "text/plain": ".txt",
    "text/markdown": ".md",
    "text/csv": ".csv",
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg"
}


class UploadStoreError(Exception):
    def __init__(self, *, status_code: int, message: str, code: str = "upload_error") -> None:
        self.status_code = status_code
        self.message = message
        self.code = code
        super().__init__(message)


class UploadStore:
    def __init__(self, *, storage_path: str | None = None, max_bytes: int | None = None) -> None:
        self.base_path = Path(storage_path or os.getenv("WEFELLA_UPLOAD_STORE_PATH") or "data/wefella-uploads").expanduser()
        self.max_bytes = max_bytes if max_bytes is not None else env_int("WEFELLA_UPLOAD_MAX_BYTES", DEFAULT_MAX_BYTES)

    def metadata(self) -> dict[str, Any]:
        return {
            "backend": "local_filesystem",
            "path_configured": bool(os.getenv("WEFELLA_UPLOAD_STORE_PATH")),
            "path": str(self.base_path),
            "max_bytes": self.max_bytes,
            "allowed_content_types": sorted(ALLOWED_CONTENT_TYPES)
        }

    def readiness(self) -> dict[str, Any]:
        metadata = self.metadata()
        try:
            self.base_path.mkdir(parents=True, exist_ok=True)
            ok = os.access(self.base_path, os.W_OK)
            return {
                "ok": ok,
                "severity": "error",
                "status": "writable" if ok else "not_writable",
                **metadata
            }
        except Exception as exc:
            return {
                "ok": False,
                "severity": "error",
                "status": "unavailable",
                "error_type": exc.__class__.__name__,
                **metadata
            }

    def create_upload(self, *, user_id: str, request: UploadRequest) -> dict[str, Any]:
        content_type = normalize_content_type(request.content_type)
        if content_type not in ALLOWED_CONTENT_TYPES:
            raise UploadStoreError(
                status_code=400,
                code="unsupported_content_type",
                message="Unsupported document type for local extraction."
            )

        document_bytes = decode_base64(request.content_base64)
        if not document_bytes:
            raise UploadStoreError(status_code=400, code="empty_upload", message="Uploaded document is empty.")
        if len(document_bytes) > self.max_bytes:
            raise UploadStoreError(status_code=413, code="upload_too_large", message="Uploaded document exceeds the configured size limit.")

        upload_id = f"upload_{uuid4().hex}"
        upload_dir = self.base_path / upload_id
        upload_dir.mkdir(parents=True, exist_ok=False)
        filename = safe_filename(request.filename, content_type)
        document_path = upload_dir / filename
        document_path.write_bytes(document_bytes)
        digest = hashlib.sha256(document_bytes).hexdigest()

        extraction = extract_document(document_path, content_type)
        metadata = {
            "upload_id": upload_id,
            "created_at": now_iso(),
            "owner_hash": hash_text(user_id),
            "session_id_hash": hash_text(request.session_id or ""),
            "session_id_present": bool(request.session_id),
            "session_id": request.session_id,
            "filename": filename,
            "content_type": content_type,
            "byte_size": len(document_bytes),
            "sha256": digest,
            "document_kind": request.document_kind,
            "extraction_status": extraction["status"]
        }
        write_json(upload_dir / "metadata.json", metadata)
        write_json(upload_dir / "extraction.json", extraction)

        return {
            "upload_id": upload_id,
            "session_id": request.session_id,
            "status": "stored",
            "filename": filename,
            "content_type": content_type,
            "byte_size": len(document_bytes),
            "sha256": digest,
            "extraction": extraction
        }

    def get_extraction(self, *, upload_id: str, user_id: str) -> dict[str, Any]:
        upload_dir = self.upload_dir(upload_id)
        metadata = read_json(upload_dir / "metadata.json")
        if metadata.get("owner_hash") != hash_text(user_id):
            raise UploadStoreError(status_code=403, code="wrong_owner", message="Upload does not belong to this user.")
        extraction = read_json(upload_dir / "extraction.json")
        return {
            "upload_id": metadata["upload_id"],
            "session_id": metadata.get("session_id"),
            "filename": metadata["filename"],
            "content_type": metadata["content_type"],
            "byte_size": metadata["byte_size"],
            "sha256": metadata["sha256"],
            "extraction": extraction
        }

    def upload_dir(self, upload_id: str) -> Path:
        if not re.fullmatch(r"upload_[a-f0-9]{32}", upload_id or ""):
            raise UploadStoreError(status_code=404, code="upload_not_found", message="Upload not found.")
        upload_dir = self.base_path / upload_id
        if not upload_dir.exists():
            raise UploadStoreError(status_code=404, code="upload_not_found", message="Upload not found.")
        return upload_dir


def extract_document(path: Path, content_type: str) -> dict[str, Any]:
    text_result = extract_text(path, content_type)
    text = text_result.get("text") or ""
    safe_preview = redact_direct_identifiers(text)[:2500]
    fields = extract_fields(text)
    extraction = {
        "status": text_result["status"],
        "method": text_result["method"],
        "extracted_at": now_iso(),
        "text_hash": hashlib.sha256(text.encode("utf-8")).hexdigest() if text else None,
        "safe_text_preview": safe_preview,
        "fields": fields,
        "source_spans": source_spans(text),
        "blockers": text_result.get("blockers", []),
        "page_count": text_result.get("page_count"),
        "confidence": "medium" if text and fields else ("low" if text else "none")
    }
    if text and not fields:
        extraction["status"] = "partial"
        extraction["blockers"] = [*extraction["blockers"], "No recognized insurance fields were found in extracted text."]
    return extraction


def extract_text(path: Path, content_type: str) -> dict[str, Any]:
    if content_type.startswith("text/"):
        return {
            "status": "completed",
            "method": "utf8_text",
            "text": path.read_text(encoding="utf-8", errors="replace"),
            "blockers": [],
            "page_count": 1
        }
    if content_type == "application/pdf":
        return extract_pdf_text(path)
    if content_type.startswith("image/"):
        return extract_image_text(path)
    return {
        "status": "blocked",
        "method": "unsupported",
        "text": "",
        "blockers": ["Unsupported document type."],
        "page_count": None
    }


def extract_pdf_text(path: Path) -> dict[str, Any]:
    try:
        from pypdf import PdfReader
    except ImportError:
        return {
            "status": "blocked",
            "method": "pypdf_missing",
            "text": "",
            "blockers": ["PDF extraction requires the pypdf package."],
            "page_count": None
        }

    try:
        reader = PdfReader(str(path))
        page_texts = []
        for index, page in enumerate(reader.pages[:25], start=1):
            text = page.extract_text() or ""
            if text.strip():
                page_texts.append(f"[page {index}]\n{text}")
        combined = "\n\n".join(page_texts)
        return {
            "status": "completed" if combined.strip() else "blocked",
            "method": "pypdf",
            "text": combined,
            "blockers": [] if combined.strip() else ["PDF text extraction produced no readable text."],
            "page_count": len(reader.pages)
        }
    except Exception as exc:
        return {
            "status": "blocked",
            "method": "pypdf",
            "text": "",
            "blockers": [f"PDF extraction failed: {exc.__class__.__name__}"],
            "page_count": None
        }


def extract_image_text(path: Path) -> dict[str, Any]:
    tesseract = shutil.which("tesseract")
    if not tesseract:
        return {
            "status": "blocked",
            "method": "tesseract_missing",
            "text": "",
            "blockers": ["Image OCR requires the tesseract CLI."],
            "page_count": 1
        }

    try:
        completed = subprocess.run(
            [tesseract, str(path), "stdout", "--psm", "6"],
            capture_output=True,
            check=False,
            text=True,
            timeout=30
        )
    except Exception as exc:
        return {
            "status": "blocked",
            "method": "tesseract_cli",
            "text": "",
            "blockers": [f"Image OCR failed: {exc.__class__.__name__}"],
            "page_count": 1
        }

    text = completed.stdout or ""
    blockers = [] if completed.returncode == 0 and text.strip() else ["Image OCR produced no readable text."]
    if completed.returncode != 0 and completed.stderr:
        blockers.append("Tesseract returned a non-zero exit status.")
    return {
        "status": "completed" if text.strip() else "blocked",
        "method": "tesseract_cli",
        "text": text,
        "blockers": blockers,
        "page_count": 1
    }


def extract_fields(text: str) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = []
    add_document_type(fields, text)
    add_matches(fields, "amount", r"\$\s?\d[\d,]*(?:\.\d{2})?", text, max_count=10)
    add_matches(fields, "date", r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b", text, max_count=10)
    add_keyword_value(fields, "claim_number", r"(?i)\bclaim\s*(?:number|#|id)?\s*[:#]?\s*([A-Z0-9-]{4,24})", text, safe_last4=False)
    add_keyword_value(fields, "member_id_last4", r"(?i)\b(?:member|subscriber|policy)\s*(?:id|number|#)?\s*[:#]?\s*([A-Z0-9-]{4,32})", text, safe_last4=True)
    for label, pattern in [
        ("deductible", r"(?i)\bdeductible\b.{0,80}"),
        ("copay", r"(?i)\bco-?pay\b.{0,80}"),
        ("coinsurance", r"(?i)\bcoinsurance\b.{0,80}"),
        ("out_of_pocket", r"(?i)\bout[- ]of[- ]pocket\b.{0,80}"),
        ("payer", r"(?i)\b(?:aetna|blue cross|cigna|unitedhealthcare|anthem|humana|kaiser)\b")
    ]:
        add_matches(fields, label, pattern, text, max_count=5)
    return dedupe_fields(fields)


def add_document_type(fields: list[dict[str, Any]], text: str) -> None:
    lowered = text.lower()
    candidates = [
        ("explanation_of_benefits", ["explanation of benefits", "eob"]),
        ("summary_of_benefits", ["summary of benefits", "sbc", "coverage"]),
        ("claim", ["claim number", "claim #", "claim id"]),
        ("bill", ["amount due", "statement balance", "patient responsibility"]),
        ("id_card", ["member id", "subscriber id", "group number"])
    ]
    for value, keywords in candidates:
        if any(keyword in lowered for keyword in keywords):
            fields.append(field("document_type", value, "high", snippet_for_keyword(text, keywords[0])))
            return
    if text.strip():
        fields.append(field("document_type", "unknown_insurance_document", "low", text[:160]))


def add_matches(fields: list[dict[str, Any]], label: str, pattern: str, text: str, *, max_count: int) -> None:
    for match in re.finditer(pattern, text):
        value = redact_direct_identifiers(match.group(0).strip())
        fields.append(field(label, value, "medium", snippet_around(text, match.start(), match.end())))
        if len([item for item in fields if item["label"] == label]) >= max_count:
            return


def add_keyword_value(fields: list[dict[str, Any]], label: str, pattern: str, text: str, *, safe_last4: bool) -> None:
    for match in re.finditer(pattern, text):
        raw_value = match.group(1).strip()
        value = f"last4:{raw_value[-4:]}" if safe_last4 and len(raw_value) >= 4 else raw_value
        fields.append(field(label, value, "medium", snippet_around(text, match.start(), match.end())))
        return


def field(label: str, value: str, confidence: str, snippet: str) -> dict[str, Any]:
    return {
        "label": label,
        "value": value,
        "confidence": confidence,
        "source": {
            "kind": "uploaded_document",
            "snippet": redact_direct_identifiers(snippet)[:240]
        }
    }


def source_spans(text: str) -> list[dict[str, Any]]:
    spans = []
    for index, line in enumerate([line.strip() for line in text.splitlines() if line.strip()][:8], start=1):
        spans.append({
            "span_id": f"span_{index}",
            "source": "uploaded_document",
            "snippet": redact_direct_identifiers(line)[:240],
            "confidence": "medium"
        })
    return spans


def dedupe_fields(fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = set()
    unique = []
    for item in fields:
        key = (item["label"], item["value"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique[:40]


def redact_direct_identifiers(text: str) -> str:
    redacted = re.sub(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b", "[redacted-email]", text)
    redacted = re.sub(r"\b\d{3}-\d{2}-\d{4}\b", "[redacted-ssn]", redacted)
    redacted = re.sub(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b", "[redacted-phone]", redacted)
    redacted = re.sub(
        r"(?i)\b((?:member|subscriber|policy|group)\s*(?:id|number|#)?\s*[:#]?\s*)([A-Z0-9-]{4,32})",
        lambda match: f"{match.group(1)}[redacted-id-last4:{match.group(2)[-4:]}]",
        redacted
    )
    redacted = re.sub(r"\b\d{9,}\b", "[redacted-number]", redacted)
    return redacted


def snippet_around(text: str, start: int, end: int, *, radius: int = 80) -> str:
    return " ".join(text[max(0, start - radius): min(len(text), end + radius)].split())


def snippet_for_keyword(text: str, keyword: str) -> str:
    index = text.lower().find(keyword.lower())
    if index < 0:
        return text[:160]
    return snippet_around(text, index, index + len(keyword))


def decode_base64(value: str) -> bytes:
    raw = value.strip()
    if "," in raw and raw.split(",", 1)[0].startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        return base64.b64decode(raw, validate=True)
    except binascii.Error as exc:
        raise UploadStoreError(status_code=400, code="invalid_base64", message="Uploaded document payload is not valid base64.") from exc


def normalize_content_type(value: str) -> str:
    return value.split(";", 1)[0].strip().lower()


def safe_filename(filename: str, content_type: str) -> str:
    basename = filename.replace("\\", "/").split("/")[-1].strip() or "upload"
    basename = re.sub(r"[^A-Za-z0-9._-]+", "_", basename).strip("._")
    if not basename:
        basename = "upload"
    extension = ALLOWED_CONTENT_TYPES[content_type]
    if not Path(basename).suffix:
        basename = f"{basename}{extension}"
    return basename[:180]


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise UploadStoreError(status_code=404, code="upload_not_found", message="Upload not found.")
    return json.loads(path.read_text(encoding="utf-8"))


def env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default

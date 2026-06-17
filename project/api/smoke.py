import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any


def main() -> int:
    base_url = os.getenv("WEFELLA_FACADE_URL", "http://127.0.0.1:8000").rstrip("/")
    results = []
    results.append(check_json("health", "GET", f"{base_url}/api/health", expect_status=200))
    results.append(check_json("readiness", "GET", f"{base_url}/api/readiness", expect_status=200))
    results.append(
        check_json(
            "unauthorized_chat_envelope",
            "POST",
            f"{base_url}/api/chat",
            body={"user_id": "smoke_user", "message": "Hello"},
            headers={"x-request-id": "req_smoke_unauthorized"},
            expect_status=401
        )
    )

    failures = [result for result in results if not result["ok"]]
    print(json.dumps({"ok": not failures, "base_url": base_url, "results": results}, indent=2, sort_keys=True))
    return 1 if failures else 0


def check_json(name: str, method: str, url: str, *, body: dict[str, Any] | None = None, headers: dict[str, str] | None = None, expect_status: int) -> dict[str, Any]:
    try:
        status, payload, response_headers = request_json(method, url, body=body, headers=headers)
        ok = status == expect_status and validate_payload(name, payload, response_headers)
        return {"name": name, "ok": ok, "status": status, "payload": summarize_payload(name, payload)}
    except Exception as exc:
        return {"name": name, "ok": False, "error": str(exc)}


def request_json(method: str, url: str, *, body: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> tuple[int, dict[str, Any], dict[str, str]]:
    data = None
    request_headers = {"content-type": "application/json", **(headers or {})}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, load_json(response.read()), dict(response.headers)
    except urllib.error.HTTPError as exc:
        return exc.code, load_json(exc.read()), dict(exc.headers)


def load_json(raw: bytes) -> dict[str, Any]:
    text = raw.decode("utf-8")
    return json.loads(text) if text else {}


def validate_payload(name: str, payload: dict[str, Any], headers: dict[str, str]) -> bool:
    if name == "health":
        return payload.get("status") == "ok" and bool(payload.get("version")) and "node_runtime_ok" in payload
    if name == "readiness":
        return payload.get("status") in {"ready", "degraded"} and isinstance(payload.get("checks"), dict)
    if name == "unauthorized_chat_envelope":
        return (
            payload.get("error", {}).get("code") == "unauthorized"
            and payload.get("error", {}).get("request_id") == "req_smoke_unauthorized"
            and headers.get("x-request-id") == "req_smoke_unauthorized"
        )
    return False


def summarize_payload(name: str, payload: dict[str, Any]) -> dict[str, Any]:
    if name == "health":
        return {
            "status": payload.get("status"),
            "version": payload.get("version"),
            "node_runtime_ok": payload.get("node_runtime_ok"),
            "auth_mode": payload.get("auth", {}).get("mode"),
            "task_registry": payload.get("task_registry", {}).get("backend")
        }
    if name == "readiness":
        checks = payload.get("checks", {})
        return {
            "status": payload.get("status"),
            "checks": {key: value.get("ok") for key, value in checks.items() if isinstance(value, dict)}
        }
    return {
        "detail": payload.get("detail"),
        "error_code": payload.get("error", {}).get("code"),
        "request_id": payload.get("error", {}).get("request_id")
    }


if __name__ == "__main__":
    sys.exit(main())

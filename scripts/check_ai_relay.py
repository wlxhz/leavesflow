from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parents[1]
API_SRC = REPO_ROOT / "services" / "api" / "src"
sys.path.insert(0, str(API_SRC))

import httpx  # noqa: E402

from leavesflow_api.ai import AIClient  # noqa: E402
from leavesflow_api.config import get_settings  # noqa: E402
from leavesflow_api.errors import AppError  # noqa: E402


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Check the LeavesFlow OpenAI-compatible relay from the machine that will run the API service. "
            "This command never prints the API key."
        )
    )
    parser.add_argument(
        "--config",
        help="Path to config.json. Defaults to config/config.json, then config/config.example.json.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=45.0,
        help="Timeout in seconds for the minimal relay request.",
    )
    parser.add_argument(
        "--full-plan",
        action="store_true",
        help="Also call AIClient.generate_plan and validate the real LeavesFlow decomposition schema.",
    )
    return parser.parse_args()


def _redact_key(api_key: str) -> str:
    key = api_key.strip()
    if not key:
        return "<missing>"
    if len(key) <= 8:
        return "<configured>"
    return f"{key[:6]}...{key[-4:]}"


def _print_step(name: str, ok: bool, detail: str) -> None:
    status = "OK" if ok else "FAIL"
    print(f"[{status}] {name}: {detail}")


def _resolve_host(host: str) -> list[str]:
    records = socket.getaddrinfo(host, None)
    addresses = sorted({item[4][0] for item in records})
    return addresses


def _check_tcp(host: str, port: int, timeout: float) -> float:
    start = time.monotonic()
    with socket.create_connection((host, port), timeout=timeout):
        return (time.monotonic() - start) * 1000


def _extract_message_content(payload: dict[str, Any]) -> Any:
    if payload.get("choices"):
        choice = payload["choices"][0]
        message = choice.get("message", {})
        return message.get("content") or choice.get("text") or ""
    return payload.get("output_text") or payload.get("text") or payload.get("content") or payload


def _minimal_chat_check(base_url: str, api_key: str, model: str, timeout: float) -> tuple[bool, str]:
    url = f"{base_url.rstrip('/')}/chat/completions"
    body = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": 'Return only this JSON object: {"ok": true}',
            }
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    start = time.monotonic()
    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(url, headers=headers, json=body)
    except httpx.TimeoutException as exc:
        return False, f"timeout: {exc.__class__.__name__}"
    except httpx.HTTPError as exc:
        return False, f"network error: {exc.__class__.__name__}: {exc}"

    elapsed_ms = int((time.monotonic() - start) * 1000)
    if response.status_code < 200 or response.status_code >= 300:
        snippet = response.text[:500].replace("\n", " ")
        return False, f"HTTP {response.status_code} in {elapsed_ms}ms; body={snippet}"

    try:
        payload = response.json()
        content = _extract_message_content(payload)
        parsed = json.loads(str(content))
    except Exception as exc:  # noqa: BLE001 - diagnostic script should report the exact class.
        snippet = response.text[:500].replace("\n", " ")
        return False, f"HTTP 200 but invalid JSON response in {elapsed_ms}ms; {exc.__class__.__name__}; body={snippet}"

    if parsed.get("ok") is not True:
        return False, f"HTTP 200 in {elapsed_ms}ms but unexpected content={parsed!r}"
    return True, f"HTTP 200 in {elapsed_ms}ms; JSON mode works"


def _full_plan_check() -> tuple[bool, str]:
    try:
        result = AIClient(get_settings()).generate_plan("build a small automated test report", [])
    except AppError as exc:
        return False, f"{exc.code}: {exc.message}"
    except Exception as exc:  # noqa: BLE001 - diagnostic script should report the exact class.
        return False, f"{exc.__class__.__name__}: {exc}"
    task_count = sum(len(stage.tasks) for stage in result.stages)
    return True, f"title={result.goalTitle!r}; stages={len(result.stages)}; tasks={task_count}"


def main() -> int:
    args = _parse_args()
    if args.config:
        os.environ["LEAVESFLOW_CONFIG_PATH"] = str(Path(args.config).resolve())

    settings = get_settings()
    relay = settings.openai_compatible
    parsed_url = urlparse(relay.base_url)
    port = parsed_url.port or (443 if parsed_url.scheme == "https" else 80)

    print("LeavesFlow AI relay check")
    print(f"config: {os.environ.get('LEAVESFLOW_CONFIG_PATH') or 'default'}")
    print(f"base_url: {parsed_url.scheme}://{parsed_url.hostname}{parsed_url.path.rstrip('/')}")
    print(f"model: {relay.chat_model}")
    print(f"api_key: {_redact_key(relay.api_key)}")
    print(f"timeout_seconds: {relay.timeout_seconds}")
    print(f"max_retries: {relay.max_retries}")
    print()

    if not relay.base_url.strip() or not relay.api_key.strip():
        _print_step("configuration", False, "openai_compatible.base_url and api_key are required")
        return 2
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.hostname:
        _print_step("base_url", False, "base_url must be an http(s) URL, for example https://api.openai.com/v1")
        return 2

    ok = True
    try:
        addresses = _resolve_host(parsed_url.hostname)
        _print_step("dns", True, f"{parsed_url.hostname} -> {', '.join(addresses[:5])}")
    except OSError as exc:
        _print_step("dns", False, f"{exc.__class__.__name__}: {exc}")
        return 2

    try:
        elapsed = _check_tcp(parsed_url.hostname, port, min(args.timeout, 10.0))
        _print_step("tcp", True, f"{parsed_url.hostname}:{port} connected in {int(elapsed)}ms")
    except OSError as exc:
        _print_step("tcp", False, f"{parsed_url.hostname}:{port}; {exc.__class__.__name__}: {exc}")
        return 2

    success, detail = _minimal_chat_check(relay.base_url, relay.api_key, relay.chat_model, args.timeout)
    _print_step("chat_completions_json", success, detail)
    ok = ok and success

    if args.full_plan:
        success, detail = _full_plan_check()
        _print_step("leavesflow_schema", success, detail)
        ok = ok and success

    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

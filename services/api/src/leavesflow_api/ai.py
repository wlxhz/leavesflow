from __future__ import annotations

import json
import re
import time
from typing import Any
from urllib.parse import urlparse

import httpx
from pydantic import ValidationError

from .config import Settings
from .errors import AppError
from .prompts import DECOMPOSITION_SYSTEM_PROMPT, SKILL_EXTRACTION_SYSTEM_PROMPT
from .schemas import DecompositionResult, SkillExtractionResult


class AIClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.last_usage: dict[str, Any] | None = None
        self.last_latency_ms: int | None = None
        self.last_model: str | None = settings.openai_compatible.chat_model

    def generate_plan(self, raw_input: str, tag_context: list[dict[str, str]]) -> DecompositionResult:
        self._ensure_ai_configured()
        user_content = json.dumps(
            {"rawInput": raw_input, "selectedTagPrompts": tag_context},
            ensure_ascii=False,
        )
        return self._chat_json(
            system_prompt=DECOMPOSITION_SYSTEM_PROMPT,
            user_content=user_content,
            temperature=self.settings.ai.decomposition_temperature,
            schema=DecompositionResult,
            invalid_code="AI_INVALID_SCHEMA",
        )

    def extract_skills(self, payload: dict[str, Any]) -> SkillExtractionResult:
        self._ensure_ai_configured()
        user_content = json.dumps(payload, ensure_ascii=False)
        return self._chat_json(
            system_prompt=SKILL_EXTRACTION_SYSTEM_PROMPT,
            user_content=user_content,
            temperature=self.settings.ai.skill_extraction_temperature,
            schema=SkillExtractionResult,
            invalid_code="AI_INVALID_SCHEMA",
        )

    def _ensure_ai_configured(self) -> None:
        if not self.settings.openai_compatible.api_key.strip() or not self.settings.openai_compatible.base_url.strip():
            raise AppError(503, "AI_NOT_CONFIGURED", "AI 中转服务未配置，无法生成真实可执行内容")

    def _chat_json(self, system_prompt: str, user_content: str, temperature: float, schema: type[Any], invalid_code: str) -> Any:
        self.last_usage = None
        self.last_latency_ms = None
        self.last_model = self.settings.openai_compatible.chat_model
        base_url = self.settings.openai_compatible.base_url.rstrip("/")
        url = f"{base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.settings.openai_compatible.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.settings.openai_compatible.chat_model,
            "messages": [
                {"role": "user", "content": self._compose_single_user_prompt(system_prompt, user_content)},
            ],
            "response_format": {"type": "json_object"},
            "temperature": temperature,
        }
        last_error: Exception | None = None
        for attempt in range(self.settings.openai_compatible.max_retries + 1):
            started_at = time.perf_counter()
            try:
                with httpx.Client(timeout=self.settings.openai_compatible.timeout_seconds) as client:
                    response = client.post(url, headers=headers, json=body)
                self.last_latency_ms = int((time.perf_counter() - started_at) * 1000)
                if response.status_code == 429:
                    raise AppError(503, "AI_RATE_LIMITED", "AI 服务繁忙，请稍后再试")
                if response.status_code < 200 or response.status_code >= 300:
                    raise AppError(
                        502,
                        "AI_UPSTREAM_ERROR",
                        f"AI 中转服务返回异常：HTTP {response.status_code}",
                        {"upstreamStatus": response.status_code, "upstreamBody": response.text[:500]},
                    )
                response_payload = response.json()
                usage = response_payload.get("usage")
                self.last_usage = usage if isinstance(usage, dict) else None
                content = self._extract_message_content(response_payload)
                parsed = self._parse_json_content(content)
                normalized = self._normalize_payload(parsed, schema)
                return schema.model_validate(normalized)
            except AppError:
                raise
            except (httpx.TimeoutException, httpx.HTTPError) as exc:
                self.last_latency_ms = int((time.perf_counter() - started_at) * 1000)
                last_error = exc
                if attempt >= self.settings.openai_compatible.max_retries:
                    raise AppError(
                        502,
                        "AI_UPSTREAM_ERROR",
                        f"AI 中转服务请求失败或超时：{exc.__class__.__name__}",
                    ) from exc
                time.sleep(0.4 * (2**attempt))
            except (KeyError, json.JSONDecodeError, ValidationError) as exc:
                last_error = exc
                if attempt >= self.settings.openai_compatible.max_retries:
                    raise AppError(502, invalid_code, "AI 返回结果格式不符合要求") from exc
                time.sleep(0.4 * (2**attempt))
        raise AppError(502, "AI_UPSTREAM_ERROR", "AI 调用失败") from last_error

    def _compose_single_user_prompt(self, system_prompt: str, user_content: str) -> str:
        return (
            f"{system_prompt}\n\n"
            "以下是本次任务的结构化输入。请严格根据输入完成任务，并且只输出 JSON Object。\n\n"
            f"{user_content}\n\n"
            "再次强调：不要输出 Markdown，不要输出解释文字，不要打招呼，只输出符合要求的 JSON Object。"
        )

    def _parse_json_content(self, content: Any) -> Any:
        if isinstance(content, dict):
            return content
        if isinstance(content, list):
            text_parts = []
            for part in content:
                if isinstance(part, dict):
                    text_parts.append(str(part.get("text") or part.get("content") or ""))
                else:
                    text_parts.append(str(part))
            content = "\n".join(text_parts)
        text = str(content or "").strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?", "", text, flags=re.IGNORECASE).strip()
            text = re.sub(r"```$", "", text).strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end > start:
                return json.loads(text[start : end + 1])
            raise

    def _extract_message_content(self, payload: dict[str, Any]) -> Any:
        if payload.get("choices"):
            message = payload["choices"][0].get("message", {})
            return message.get("content") or payload["choices"][0].get("text") or ""
        if "output_text" in payload:
            return payload["output_text"]
        if "text" in payload:
            return payload["text"]
        if "content" in payload:
            return payload["content"]
        return payload

    def _normalize_payload(self, payload: Any, schema: type[Any]) -> Any:
        if schema is DecompositionResult:
            return self._normalize_plan_payload(payload)
        if schema is SkillExtractionResult:
            return self._normalize_skill_payload(payload)
        return payload

    def _normalize_plan_payload(self, payload: Any) -> dict[str, Any]:
        data = dict(payload or {})
        data["goalTitle"] = data.get("goalTitle") or data.get("title") or data.get("goal") or ""
        data["goalSummary"] = data.get("goalSummary") or data.get("summary") or data.get("description") or ""
        stages = data.get("stages") or data.get("steps") or data.get("phases") or []
        normalized_stages = []
        for stage_index, stage in enumerate(stages if isinstance(stages, list) else []):
            stage_data = dict(stage or {})
            tasks = stage_data.get("tasks") or stage_data.get("taskNodes") or stage_data.get("items") or []
            normalized_tasks = []
            for task_index, task in enumerate(tasks if isinstance(tasks, list) else []):
                task_data = dict(task or {})
                title = task_data.get("title") or task_data.get("name") or f"任务 {task_index + 1}"
                description = task_data.get("description") or task_data.get("detail") or title
                path = task_data.get("path") or task_data.get("pathSteps") or task_data.get("steps") or [description]
                criteria = (
                    task_data.get("completionCriteria")
                    or task_data.get("completion_criteria")
                    or task_data.get("criteria")
                    or task_data.get("acceptanceCriteria")
                    or ["产出物符合任务说明"]
                )
                normalized_tasks.append(
                    {
                        "title": title,
                        "description": description,
                        "contextForAI": task_data.get("contextForAI") or task_data.get("context") or "",
                        "vibeCodingPrompt": task_data.get("vibeCodingPrompt") or task_data.get("prompt") or "",
                        "expectedOutput": task_data.get("expectedOutput") or task_data.get("output") or "",
                        "path": self._ensure_string_list(path),
                        "tools": self._normalize_recommendations(task_data.get("tools") or []),
                        "resources": self._normalize_recommendations(task_data.get("resources") or []),
                        "completionCriteria": self._ensure_string_list(criteria),
                        "skillTags": self._ensure_string_list(task_data.get("skillTags") or task_data.get("predictedSkillTags") or []),
                    }
                )
            normalized_stages.append(
                {
                    "title": stage_data.get("title") or stage_data.get("name") or "",
                    "description": stage_data.get("description") or "",
                    "tasks": normalized_tasks,
                }
            )
        data["stages"] = normalized_stages
        return data

    def _normalize_skill_payload(self, payload: Any) -> dict[str, Any]:
        data = dict(payload or {})
        items = data.get("newSkillTags") or data.get("newSkillPrompts") or data.get("skills") or []
        normalized = []
        for item in items if isinstance(items, list) else []:
            row = dict(item or {})
            normalized.append(
                {
                    "name": str(row.get("name") or row.get("label") or "能力沉淀")[:32],
                    "level": row.get("level") if row.get("level") in {"入门", "进阶", "熟练"} else "入门",
                    "prompt": row.get("prompt") or row.get("skillPrompt") or row.get("description") or "当我遇到类似任务时，请先帮我明确上下文、步骤和验收标准。",
                    "source": row.get("source") or "任务打卡",
                    "reason": row.get("reason") or row.get("evidence") or "用户完成了对应任务。",
                }
            )
        data["newSkillTags"] = normalized
        return data

    def _normalize_recommendations(self, items: Any) -> list[dict[str, str]]:
        normalized = []
        for index, item in enumerate(items if isinstance(items, list) else []):
            row = dict(item or {})
            url = str(row.get("url") or "").strip()
            if not self._is_valid_http_url(url):
                continue
            normalized.append(
                {
                    "name": str(row.get("name") or row.get("title") or f"推荐工具 {index + 1}"),
                    "title": str(row.get("title") or row.get("name") or f"推荐资源 {index + 1}"),
                    "usage": str(row.get("usage") or row.get("description") or "完成当前任务时可调用的真实工具"),
                    "description": str(row.get("description") or row.get("usage") or "完成当前任务时可参考的真实资源"),
                    "url": url,
                }
            )
        return normalized

    def _is_valid_http_url(self, url: str) -> bool:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return False
        hostname = parsed.hostname or ""
        return hostname not in {"example.com", "www.example.com"}

    def _ensure_string_list(self, value: Any) -> list[str]:
        if isinstance(value, list):
            return [str(item) for item in value if str(item).strip()]
        if value is None:
            return []
        return [str(value)]

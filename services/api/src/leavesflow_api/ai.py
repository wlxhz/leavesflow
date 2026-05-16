from __future__ import annotations

import json
import re
import time
from typing import Any

import httpx
from pydantic import ValidationError

from .config import Settings
from .errors import AppError
from .prompts import DECOMPOSITION_SYSTEM_PROMPT, SKILL_EXTRACTION_SYSTEM_PROMPT
from .schemas import DecompositionResult, SkillExtractionResult


class AIClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def generate_plan(self, raw_input: str, tag_context: list[dict[str, str]]) -> DecompositionResult:
        if self.settings.mock_ai_enabled:
            return self._mock_plan(raw_input)
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
        if self.settings.mock_ai_enabled:
            return self._mock_skills(payload)
        user_content = json.dumps(payload, ensure_ascii=False)
        return self._chat_json(
            system_prompt=SKILL_EXTRACTION_SYSTEM_PROMPT,
            user_content=user_content,
            temperature=self.settings.ai.skill_extraction_temperature,
            schema=SkillExtractionResult,
            invalid_code="AI_INVALID_SCHEMA",
        )

    def _chat_json(self, system_prompt: str, user_content: str, temperature: float, schema: type[Any], invalid_code: str) -> Any:
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
            try:
                with httpx.Client(timeout=self.settings.openai_compatible.timeout_seconds) as client:
                    response = client.post(url, headers=headers, json=body)
                if response.status_code == 429:
                    raise AppError(503, "AI_RATE_LIMITED", "AI 服务繁忙，请稍后再试")
                if response.status_code < 200 or response.status_code >= 300:
                    raise AppError(502, "AI_UPSTREAM_ERROR", "AI 中转服务返回异常")
                content = self._extract_message_content(response.json())
                parsed = self._parse_json_content(content)
                normalized = self._normalize_payload(parsed, schema)
                return schema.model_validate(normalized)
            except AppError:
                raise
            except (httpx.TimeoutException, httpx.HTTPError) as exc:
                last_error = exc
                if attempt >= self.settings.openai_compatible.max_retries:
                    raise AppError(502, "AI_UPSTREAM_ERROR", "AI 中转服务请求失败或超时") from exc
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
        data["goalTitle"] = data.get("goalTitle") or data.get("title") or data.get("goal") or "未命名目标"
        data["goalSummary"] = data.get("goalSummary") or data.get("summary") or data.get("description") or "这是一个可执行任务路径。"
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
                        "contextForAI": task_data.get("contextForAI") or task_data.get("context") or description,
                        "vibeCodingPrompt": task_data.get("vibeCodingPrompt")
                        or task_data.get("prompt")
                        or f"请完成任务：{title}。背景：{description}。请给出明确产出和验收标准。",
                        "expectedOutput": task_data.get("expectedOutput") or task_data.get("output") or "可检查的任务产出物",
                        "path": self._ensure_string_list(path),
                        "tools": self._normalize_recommendations(task_data.get("tools") or []),
                        "resources": self._normalize_recommendations(task_data.get("resources") or []),
                        "completionCriteria": self._ensure_string_list(criteria),
                        "skillTags": self._ensure_string_list(task_data.get("skillTags") or task_data.get("predictedSkillTags") or []),
                    }
                )
            if not normalized_tasks:
                normalized_tasks.append(
                    {
                        "title": "明确任务范围",
                        "description": "把目标整理成可执行的小任务。",
                        "contextForAI": "用户目标信息不足，需要先明确范围。",
                        "vibeCodingPrompt": "请根据用户目标，先明确目标用户、核心场景、最小功能和验收标准。",
                        "expectedOutput": "一份任务范围说明。",
                        "path": ["明确目标", "列出范围", "写出验收标准"],
                        "tools": [],
                        "resources": [],
                        "completionCriteria": ["范围说明完整"],
                        "skillTags": ["目标拆解"],
                    }
                )
            normalized_stages.append(
                {
                    "title": stage_data.get("title") or stage_data.get("name") or f"阶段 {stage_index + 1}",
                    "description": stage_data.get("description") or "完成本阶段任务。",
                    "tasks": normalized_tasks,
                }
            )
        if not normalized_stages:
            normalized_stages = self._mock_plan(str(data["goalTitle"])).model_dump(mode="json")["stages"]
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
            normalized.append(
                {
                    "name": str(row.get("name") or row.get("title") or f"推荐工具 {index + 1}"),
                    "title": str(row.get("title") or row.get("name") or f"推荐资源 {index + 1}"),
                    "usage": str(row.get("usage") or row.get("description") or "辅助完成当前任务"),
                    "description": str(row.get("description") or row.get("usage") or "辅助完成当前任务"),
                    "url": str(row.get("url") or "https://example.com"),
                }
            )
        return normalized

    def _ensure_string_list(self, value: Any) -> list[str]:
        if isinstance(value, list):
            return [str(item) for item in value if str(item).strip()]
        if value is None:
            return []
        return [str(value)]

    def _mock_plan(self, raw_input: str) -> DecompositionResult:
        title = raw_input.strip()[:40] or "完成一个 AI 项目"
        return DecompositionResult.model_validate(
            {
                "goalTitle": title,
                "goalSummary": f"围绕“{title}”完成一个适合 Vibe Coding 推进的最小可交付路径。",
                "stages": [
                    {
                        "title": "明确最小交付范围",
                        "description": "先把模糊目标收束成 AI 能理解并执行的清晰任务边界。",
                        "tasks": [
                            {
                                "title": "定义目标和验收标准",
                                "description": "把目标拆成用户、场景、核心功能和完成标准。",
                                "contextForAI": f"用户目标是：{title}。需要先避免过度设计，确认最小可交付范围。",
                                "vibeCodingPrompt": f"请帮我把“{title}”拆成一个最小可交付版本。请输出目标用户、核心场景、3 个以内核心功能、暂不做范围和验收标准，避免过度设计。",
                                "expectedOutput": "一份包含目标用户、核心场景、核心功能、暂不做范围和验收标准的范围说明。",
                                "path": ["写出目标用户", "列出核心场景", "保留 3 个以内核心功能", "定义完成标准"],
                                "tools": [{"name": "ChatGPT", "usage": "辅助澄清产品范围", "url": "https://chat.openai.com"}],
                                "resources": [{"title": "React 官方文档", "url": "https://react.dev", "description": "后续实现前端时参考组件和状态管理基础。"}],
                                "completionCriteria": ["目标用户明确", "核心功能不超过 3 个", "每个功能都有验收标准"],
                                "skillTags": ["需求拆解", "范围定义"],
                            }
                        ],
                    },
                    {
                        "title": "生成可执行开发路径",
                        "description": "将范围说明转成适合逐步交给 AI 编程工具的任务。",
                        "tasks": [
                            {
                                "title": "拆出第一版页面和数据结构",
                                "description": "让 AI 明确页面、状态和数据字段，减少实现时的幻觉。",
                                "contextForAI": "已经有最小交付范围，需要把它转成页面结构和数据结构，不直接开始写大而全代码。",
                                "vibeCodingPrompt": f"基于“{title}”的最小交付范围，请设计第一版页面结构和数据结构。请只输出页面列表、每个页面的核心状态、需要保存的数据字段和用户操作流程。",
                                "expectedOutput": "页面结构、状态说明、数据字段和用户操作流程。",
                                "path": ["列出页面", "确认每页状态", "定义数据字段", "串起用户流程"],
                                "tools": [{"name": "Codex", "usage": "根据明确上下文生成项目代码", "url": "https://chatgpt.com/codex"}],
                                "resources": [{"title": "Vite 文档", "url": "https://vite.dev", "description": "用于理解 React Vite 项目启动与构建。"}],
                                "completionCriteria": ["页面结构完整", "数据字段可实现", "用户流程能从开始走到完成"],
                                "skillTags": ["信息架构", "Vibe Coding 任务设计"],
                            }
                        ],
                    },
                ],
            }
        )

    def _mock_skills(self, payload: dict[str, Any]) -> SkillExtractionResult:
        task = payload.get("task", {})
        title = task.get("title", "完成任务")
        return SkillExtractionResult.model_validate(
            {
                "newSkillTags": [
                    {
                        "name": "Vibe Coding 拆解",
                        "level": "入门",
                        "prompt": f"当我需要完成类似“{title}”的任务时，请你先帮我明确上下文、输入材料、预期产出和验收标准，再把任务拆成 AI 能一次理解并稳定完成的小步骤。",
                        "source": title,
                        "reason": "用户完成了一个带有明确上下文、产出和验收标准的任务节点，体现了将目标转为可执行 AI 协作任务的能力。",
                    }
                ]
            }
        )

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from leavesflow_api.ai import AIClient
from leavesflow_api.main import app
from leavesflow_api.schemas import DecompositionResult, SkillExtractionResult


def test_mvp_flow_smoke(monkeypatch) -> None:
    monkeypatch.setattr(AIClient, "generate_plan", lambda self, raw_input, tag_context: _test_plan(raw_input))
    monkeypatch.setattr(AIClient, "extract_skills", lambda self, payload: _test_skills(payload))

    with TestClient(app) as client:
        tag_options = client.get("/api/v1/tag-options")
        assert tag_options.status_code == 200
        categories = tag_options.json()["categories"]
        payload = {
            "identityTagIds": [categories[0]["options"][0]["id"]],
            "backgroundTagIds": [categories[1]["options"][0]["id"]],
            "levelTagIds": [categories[2]["options"][1]["id"]],
            "goalTypeTagIds": [categories[3]["options"][0]["id"]],
            "timeRangeTagIds": [categories[4]["options"][3]["id"]],
            "outputPreferenceTagIds": [categories[5]["options"][4]["id"]],
        }
        username = f"user_{uuid.uuid4().hex[:8]}"
        registered = client.post(
            "/api/v1/auth/register",
            json={
                "username": username,
                "displayName": "V1.2 用户",
                "password": "password123",
                "profile": {
                    "identityTagIds": payload["identityTagIds"],
                    "backgroundTagIds": payload["backgroundTagIds"],
                    "levelTagIds": payload["levelTagIds"],
                },
            },
        )
        assert registered.status_code == 201
        headers = {"Authorization": f"Bearer {registered.json()['token']}"}

        me = client.get("/api/v1/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["user"]["username"] == username
        assert me.json()["goalHistory"] == []

        goal = client.post("/api/v1/goals", json={"rawInput": "做一个AI网站", "profileSnapshot": payload}, headers=headers)
        assert goal.status_code == 201
        goal_id = goal.json()["id"]

        me_after_goal = client.get("/api/v1/me", headers=headers)
        assert me_after_goal.status_code == 200
        assert len(me_after_goal.json()["goalHistory"]) == 1
        assert me_after_goal.json()["goalHistory"][0]["hasPlan"] is False

        plan = client.post(f"/api/v1/goals/{goal_id}/plan:generate", json={}, headers=headers)
        assert plan.status_code == 200
        first_task = plan.json()["stages"][0]["tasks"][0]
        assert first_task["vibeCodingPrompt"]

        active_plan = client.get("/api/v1/me/active-plan", headers=headers)
        assert active_plan.status_code == 200
        assert active_plan.json()["goalId"] == goal_id
        assert active_plan.json()["isComplete"] is False

        check_in = client.post(
            f"/api/v1/tasks/{first_task['id']}/check-ins",
            json={
                "whatDone": "我明确了最小交付范围。",
                "whatProduced": "一份范围说明。",
                "problems": "暂无。",
            },
            headers=headers,
        )
        assert check_in.status_code == 201
        assert check_in.json()["newSkillTags"][0]["prompt"]

        goal_detail = client.get(f"/api/v1/goals/{goal_id}", headers=headers)
        assert goal_detail.status_code == 200
        goal_detail_json = goal_detail.json()
        assert goal_detail_json["plan"]["stages"][0]["tasks"][0]["checkIn"]["whatDone"] == "我明确了最小交付范围。"
        assert goal_detail_json["plan"]["stages"][0]["tasks"][0]["checkIn"]["whatProduced"] == "一份范围说明。"
        assert goal_detail_json["plan"]["stages"][0]["tasks"][0]["checkIn"]["problems"] == "暂无。"

        me_after_check_in = client.get("/api/v1/me", headers=headers)
        assert me_after_check_in.status_code == 200
        history = me_after_check_in.json()["goalHistory"]
        assert history[0]["status"] == "completed"
        assert history[0]["completedTasks"] == 1
        assert history[0]["totalTasks"] == 1

        updated = client.put("/api/v1/me", json={"displayName": "更新后的用户"}, headers=headers)
        assert updated.status_code == 200
        assert updated.json()["user"]["displayName"] == "更新后的用户"


def test_register_rolls_back_when_profile_write_fails(monkeypatch) -> None:
    def fail_profile_skill_prompts(*args, **kwargs):
        raise RuntimeError("profile seed failed")

    monkeypatch.setattr("leavesflow_api.services.seed_profile_skill_prompts", fail_profile_skill_prompts)

    with TestClient(app, raise_server_exceptions=False) as client:
        tag_options = client.get("/api/v1/tag-options")
        assert tag_options.status_code == 200
        categories = tag_options.json()["categories"]
        username = f"rollback_{uuid.uuid4().hex[:8]}"

        registered = client.post(
            "/api/v1/auth/register",
            json={
                "username": username,
                "displayName": "Rollback 用户",
                "password": "password123",
                "profile": {
                    "identityTagIds": [categories[0]["options"][0]["id"]],
                    "backgroundTagIds": [categories[1]["options"][0]["id"]],
                    "levelTagIds": [categories[2]["options"][1]["id"]],
                },
            },
        )
        assert registered.status_code == 500

        login = client.post("/api/v1/auth/login", json={"username": username, "password": "password123"})
        assert login.status_code == 401


def _test_plan(raw_input: str) -> DecompositionResult:
    title = raw_input.strip()[:40]
    return DecompositionResult.model_validate(
        {
            "goalTitle": title,
            "goalSummary": f"围绕“{title}”生成一条测试任务路径。",
            "stages": [
                {
                    "title": "需求确认",
                    "description": "确认真实交付边界。",
                    "tasks": [
                        {
                            "title": "确认目标范围",
                            "description": "明确用户、场景、功能和验收标准。",
                            "contextForAI": f"用户目标是：{title}。",
                            "vibeCodingPrompt": f"请根据“{title}”输出可执行范围说明。",
                            "expectedOutput": "一份范围说明。",
                            "path": ["确认用户", "确认场景", "确认验收标准"],
                            "tools": [
                                {
                                    "name": "ChatGPT",
                                    "usage": "协助澄清需求范围",
                                    "url": "https://chatgpt.com",
                                }
                            ],
                            "resources": [
                                {
                                    "title": "React Docs",
                                    "url": "https://react.dev",
                                    "description": "前端实现参考文档。",
                                }
                            ],
                            "completionCriteria": ["范围清晰", "验收标准可检查"],
                            "skillTags": ["需求拆解"],
                        }
                    ],
                }
            ],
        }
    )


def _test_skills(payload: dict) -> SkillExtractionResult:
    task = payload.get("task", {})
    return SkillExtractionResult.model_validate(
        {
            "newSkillTags": [
                {
                    "name": "需求拆解",
                    "level": "入门",
                    "prompt": "当我需要拆解类似需求时，请先帮我明确用户、场景、功能边界和验收标准。",
                    "source": task.get("title") or "测试任务",
                    "reason": "用户完成了需求范围确认任务。",
                }
            ]
        }
    )

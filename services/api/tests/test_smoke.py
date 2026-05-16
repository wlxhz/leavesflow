from __future__ import annotations

from fastapi.testclient import TestClient

from leavesflow_api.ai import AIClient
from leavesflow_api.main import app


def test_mvp_flow_smoke(monkeypatch) -> None:
    monkeypatch.setattr(AIClient, "generate_plan", lambda self, raw_input, tag_context: self._mock_plan(raw_input))
    monkeypatch.setattr(AIClient, "extract_skills", lambda self, payload: self._mock_skills(payload))

    with TestClient(app) as client:
        headers = {"Authorization": "Bearer dev-demo-token"}
        tag_options = client.get("/api/v1/tag-options", headers=headers)
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
        saved = client.put("/api/v1/me/tag-profile", json=payload, headers=headers)
        assert saved.status_code == 200

        goal = client.post("/api/v1/goals", json={"rawInput": "做一个AI网站"}, headers=headers)
        assert goal.status_code == 201
        goal_id = goal.json()["id"]

        plan = client.post(f"/api/v1/goals/{goal_id}/plan:generate", json={}, headers=headers)
        assert plan.status_code == 200
        first_task = plan.json()["stages"][0]["tasks"][0]
        assert first_task["vibeCodingPrompt"]

        check_in = client.post(
            f"/api/v1/tasks/{first_task['id']}/check-ins",
            json={"whatDone": "我明确了最小交付范围。"},
            headers=headers,
        )
        assert check_in.status_code == 201
        assert check_in.json()["newSkillTags"][0]["prompt"]

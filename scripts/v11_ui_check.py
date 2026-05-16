from __future__ import annotations

import json
import os
from typing import Any

from playwright.sync_api import Page, Route, expect, sync_playwright

WEB_URL = os.getenv("LEAVESFLOW_WEB_URL", "http://localhost:5173/")


def tag_option(option_id: str, label: str) -> dict[str, Any]:
    return {
        "id": option_id,
        "label": label,
        "promptText": f"作为{label}用户，请把任务拆成清晰、可执行、适合交给 AI 协作完成的小步骤。",
        "sortOrder": 1,
    }


TAG_CATEGORIES = [
    {
        "key": "identity_tags",
        "name": "身份标签",
        "options": [
            tag_option("identity-student", "大学生"),
            tag_option("identity-newcomer", "职场新人"),
            tag_option("identity-career", "转行学习者"),
            tag_option("identity-startup", "创业团队"),
            tag_option("identity-zero", "零基础用户"),
        ],
    },
    {
        "key": "background_tags",
        "name": "专业背景",
        "options": [
            tag_option("background-cs", "计算机"),
            tag_option("background-design", "设计"),
        ],
    },
    {
        "key": "level_tags",
        "name": "能力阶段",
        "options": [
            tag_option("level-entry", "入门"),
            tag_option("level-basic", "有基础"),
        ],
    },
    {
        "key": "goal_type_tags",
        "name": "目标类型",
        "options": [
            tag_option("goal-project", "做项目"),
            tag_option("goal-skill", "学技能"),
        ],
    },
    {
        "key": "time_range_tags",
        "name": "时间周期",
        "options": [
            tag_option("time-2-4-week", "2-4周"),
            tag_option("time-3-day", "3天内"),
        ],
    },
    {
        "key": "output_preference_tags",
        "name": "输出偏好",
        "options": [
            tag_option("output-delivery", "项目交付优先"),
            tag_option("output-detail", "步骤详细"),
        ],
    },
]

SELECTED_TAGS = {
    "identityTags": [tag_option("identity-student", "大学生")],
    "backgroundTags": [tag_option("background-cs", "计算机")],
    "levelTags": [tag_option("level-entry", "入门")],
    "goalTypeTags": [tag_option("goal-project", "做项目")],
    "timeRangeTags": [tag_option("time-2-4-week", "2-4周")],
    "outputPreferenceTags": [tag_option("output-delivery", "项目交付优先")],
}

EMPTY_TAGS = {
    "identityTags": [],
    "backgroundTags": [],
    "levelTags": [],
    "goalTypeTags": [],
    "timeRangeTags": [],
    "outputPreferenceTags": [],
}


def make_skill(skill_id: str, name: str) -> dict[str, Any]:
    return {
        "id": skill_id,
        "name": name,
        "level": "入门",
        "count": 1,
        "prompt": f"当我需要处理{name}相关任务时，请先帮我明确最小交付范围，再输出可直接执行的步骤。",
        "sourceTaskId": "profile",
        "sourceGoalId": "profile",
        "evidence": f"这个能力来自{name}相关的画像或任务打卡。",
        "updatedAt": "2026-05-16T00:00:00Z",
    }


def make_plan(completed: bool = False) -> dict[str, Any]:
    return {
        "goalId": "goal-1",
        "goalTitle": "做一个AI网站",
        "goalSummary": "把一个 AI 网站拆成信息架构、首页、交互和交付检查四个阶段。",
        "stages": [
            {
                "id": "stage-1",
                "title": "确认方向",
                "description": "先确认最小范围。",
                "sortOrder": 1,
                "tasks": [
                    {
                        "id": "task-1",
                        "title": "首页信息架构",
                        "description": "确定首页需要出现的关键模块和顺序。",
                        "contextForAI": "用户想做一个 AI 网站，当前需要先明确首页的信息结构。",
                        "vibeCodingPrompt": "请帮我设计一个 AI 网站首页的信息架构，只保留最小可交付版本需要的模块。",
                        "expectedOutput": "一份首页模块清单，包括模块名称、目的和最小文案字段。",
                        "pathSteps": ["列出用户第一眼要看到的信息", "删掉非必要模块", "确定从上到下的页面顺序"],
                        "tools": [{"name": "浏览器", "usage": "查看同类网站结构", "url": "https://example.com"}],
                        "resources": [
                            {
                                "title": "信息架构参考",
                                "url": "https://example.com",
                                "description": "用于对齐首页结构。",
                            }
                        ],
                        "completionCriteria": ["模块不超过 5 个", "每个模块都有明确目的"],
                        "predictedSkillTags": ["信息架构", "首页规划"],
                        "status": "completed" if completed else "pending",
                        "sortOrder": 1,
                    },
                    {
                        "id": "task-2",
                        "title": "首屏文案草稿",
                        "description": "写出首屏标题、副标题和行动按钮。",
                        "contextForAI": "已有首页结构，需要补齐首屏文案。",
                        "vibeCodingPrompt": "请为 AI 网站首页写首屏标题、副标题和一个行动按钮文案。",
                        "expectedOutput": "首屏标题、副标题、按钮文案各 1 条。",
                        "pathSteps": ["写标题", "写副标题", "写按钮文案"],
                        "tools": [{"name": "文案草稿", "usage": "辅助生成候选文案", "url": "https://example.com"}],
                        "resources": [],
                        "completionCriteria": ["文案清楚", "行动按钮明确"],
                        "predictedSkillTags": ["文案表达"],
                        "status": "pending",
                        "sortOrder": 2,
                    },
                ],
            },
            {
                "id": "stage-2",
                "title": "完成交付",
                "description": "把计划收束成可交付版本。",
                "sortOrder": 2,
                "tasks": [
                    {
                        "id": "task-3",
                        "title": "交付检查",
                        "description": "检查页面是否能被用户理解和继续使用。",
                        "contextForAI": "已有页面草稿，需要做交付前检查。",
                        "vibeCodingPrompt": "请检查这个 AI 网站首页是否具备清晰目标、明确按钮和可继续开发的信息。",
                        "expectedOutput": "一份交付检查清单。",
                        "pathSteps": ["检查目标", "检查按钮", "检查缺口"],
                        "tools": [{"name": "检查清单", "usage": "记录问题", "url": "https://example.com"}],
                        "resources": [],
                        "completionCriteria": ["列出所有阻塞问题", "给出下一步动作"],
                        "predictedSkillTags": ["交付检查"],
                        "status": "pending",
                        "sortOrder": 3,
                    }
                ],
            },
        ],
    }


def mock_api(page: Page) -> None:
    state = {"profile_saved": False, "checked_in": False}

    def respond(route: Route, payload: dict[str, Any], status: int = 200) -> None:
        route.fulfill(
            status=status,
            body=json.dumps(payload, ensure_ascii=False),
            headers={
                "access-control-allow-origin": "*",
                "access-control-allow-headers": "authorization,content-type",
                "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
                "content-type": "application/json; charset=utf-8",
            },
        )

    def handler(route: Route) -> None:
        request = route.request
        if request.method == "OPTIONS":
            route.fulfill(
                status=204,
                headers={
                    "access-control-allow-origin": "*",
                    "access-control-allow-headers": "authorization,content-type",
                    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
                },
            )
            return

        path = request.url.split("/api/v1", 1)[-1]
        if path == "/tag-options":
            respond(route, {"categories": TAG_CATEGORIES})
            return
        if path == "/me":
            skills = []
            if state["profile_saved"]:
                skills.append(make_skill("skill-profile", "大学生画像"))
            if state["checked_in"]:
                skills.append(make_skill("skill-task", "首页信息架构"))
            respond(
                route,
                {
                    "userId": "demo-user",
                    "tagProfile": SELECTED_TAGS if state["profile_saved"] else EMPTY_TAGS,
                    "skillTags": skills,
                },
            )
            return
        if path == "/me/tag-profile" and request.method == "PUT":
            state["profile_saved"] = True
            respond(route, {"tagProfile": SELECTED_TAGS})
            return
        if path == "/goals" and request.method == "POST":
            respond(
                route,
                {
                    "id": "goal-1",
                    "title": "做一个AI网站",
                    "rawInput": "做一个AI网站",
                    "status": "active",
                    "profileSnapshot": SELECTED_TAGS,
                    "createdAt": "2026-05-16T00:00:00Z",
                },
            )
            return
        if path == "/goals/goal-1/plan:generate":
            respond(route, make_plan(state["checked_in"]))
            return
        if path == "/goals/goal-1/plan":
            respond(route, make_plan(state["checked_in"]))
            return
        if path == "/tasks/task-1/check-ins":
            state["checked_in"] = True
            respond(
                route,
                {
                    "checkInId": "check-1",
                    "taskNodeId": "task-1",
                    "newSkillTags": [
                        {
                            "id": "skill-task",
                            "name": "首页信息架构",
                            "level": "入门",
                            "prompt": "请帮我把首页压缩成最小可交付信息架构。",
                            "source": "task",
                            "reason": "完成了首页信息架构任务。",
                        }
                    ],
                },
            )
            return
        respond(route, {"error": {"code": "not_found", "message": path, "requestId": "test"}}, status=404)

    page.route("**/api/v1/**", handler)


def ensure_selected(page: Page, label: str) -> None:
    select_button = page.get_by_label(f"选择{label}", exact=True)
    if select_button.count():
        select_button.click()
    expect(page.get_by_label(f"取消选择{label}", exact=True)).to_be_visible()


def run_desktop_flow(page: Page) -> None:
    mock_api(page)
    page.goto(WEB_URL)
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("用几个标签校准任务路径")).to_be_visible()
    ensure_selected(page, "大学生")
    ensure_selected(page, "计算机")
    ensure_selected(page, "入门")
    ensure_selected(page, "做项目")
    ensure_selected(page, "2-4周")
    ensure_selected(page, "项目交付优先")
    page.get_by_role("button", name="保存并继续").click()
    expect(page.get_by_text("今天想完成什么？")).to_be_visible(timeout=10000)
    expect(page.get_by_text("写清楚想完成的事，LeavesFlow 会拆成可执行步骤。")).to_be_visible()
    page.get_by_role("button", name="生成任务路径").click()
    expect(page.get_by_text("任务导航")).to_be_visible(timeout=10000)
    expect(page.get_by_text("可复制给 AI")).to_be_visible()
    expect(page.get_by_role("button", name="当前节点：首页信息架构")).to_be_visible()
    active_node = page.get_by_role("article").filter(has=page.get_by_role("button", name="当前节点：首页信息架构"))
    expect(active_node.get_by_text("这一站要产出")).to_be_visible()
    tool_link = active_node.locator('a[data-recommendation-kind="tool"]')
    assert tool_link.count() == 1
    assert tool_link.get_attribute("target") is None
    assert tool_link.get_attribute("data-open-mode") == "in-app-or-native-browser"
    page.evaluate(
        """() => {
            window.__openedRecommendations = [];
            window.LeavesFlowNative = {
                openExternalUrl: (payload) => window.__openedRecommendations.push(payload)
            };
        }"""
    )
    tool_link.click()
    opened = page.evaluate("() => window.__openedRecommendations")
    assert opened == [{"url": "https://example.com", "title": "浏览器", "kind": "tool"}]
    expect(active_node.get_by_role("button", name="打卡完成")).to_be_visible()
    active_node.get_by_role("button", name="打卡完成").click()
    page.get_by_placeholder("我完成了什么？").fill("我明确了最小交付范围。")
    page.get_by_role("button", name="提交打卡").click()
    expect(page.get_by_text("标签列表")).to_be_visible(timeout=10000)
    expect(page.get_by_role("button", name="首页信息架构 入门 · 使用 1 次")).to_be_visible()
    page.get_by_role("button", name="首页信息架构 入门 · 使用 1 次").click()
    expect(page.get_by_role("heading", name="能力 Prompt", exact=True)).to_be_visible()
    page.get_by_role("button", name="返回标签列表").click()
    expect(page.get_by_text("大学生画像")).to_be_visible()


def run_mobile_layout_check(page: Page) -> None:
    mock_api(page)
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(WEB_URL)
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("用几个标签校准任务路径")).to_be_visible()
    nav_info = page.locator("nav").evaluate(
        """(nav) => {
            const style = window.getComputedStyle(nav);
            const box = nav.getBoundingClientRect();
            const buttons = Array.from(nav.querySelectorAll("button")).map((button) => {
                const rect = button.getBoundingClientRect();
                return { width: rect.width, height: rect.height };
            });
            return { position: style.position, bottom: style.bottom, top: box.top, width: box.width, buttons };
        }"""
    )
    assert nav_info["position"] == "fixed", nav_info
    assert nav_info["top"] > 700, nav_info
    assert nav_info["width"] <= 390, nav_info
    assert all(button["height"] < 52 for button in nav_info["buttons"]), nav_info


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        desktop = browser.new_page(viewport={"width": 1440, "height": 1100})
        run_desktop_flow(desktop)
        desktop.close()

        mobile = browser.new_page(viewport={"width": 390, "height": 844})
        run_mobile_layout_check(mobile)
        mobile.close()
        browser.close()


if __name__ == "__main__":
    main()

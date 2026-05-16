from __future__ import annotations

from playwright.sync_api import expect, sync_playwright


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1100})
        page.goto("http://localhost:5173")
        page.wait_for_load_state("networkidle")
        expect(page.get_by_text("把小目标养成可复用的能力 Prompt")).to_be_visible()
        page.get_by_role("button", name="大学生").click()
        page.get_by_role("button", name="计算机").click()
        page.get_by_role("button", name="入门").click()
        page.get_by_role("button", name="做项目").click()
        page.get_by_role("button", name="2-4周").click()
        page.get_by_role("button", name="项目交付优先").click()
        page.get_by_role("button", name="保存标签").click()
        expect(page.get_by_text("写下今天想推进的目标")).to_be_visible(timeout=10000)
        page.get_by_role("button", name="生成任务路径").click()
        expect(page.get_by_text("今日计划")).to_be_visible(timeout=15000)
        expect(page.get_by_text("可复制 Prompt")).to_be_visible()
        page.get_by_role("button", name="打卡完成").click()
        page.get_by_placeholder("我完成了什么？").fill("我明确了最小交付范围。")
        page.get_by_role("button", name="提交打卡").click()
        expect(page.get_by_text("能力资产库")).to_be_visible(timeout=15000)
        expect(page.get_by_role("heading", name="能力 Prompt", exact=True).first).to_be_visible()
        browser.close()


if __name__ == "__main__":
    main()

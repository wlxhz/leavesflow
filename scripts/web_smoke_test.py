from __future__ import annotations

import os

from playwright.sync_api import expect, sync_playwright

WEB_URL = os.getenv("LEAVESFLOW_WEB_URL", "http://localhost:5173")


def ensure_selected(page, label: str) -> None:
    select_button = page.get_by_label(f"选择{label}", exact=True)
    if select_button.count():
        select_button.click()
    expect(page.get_by_label(f"取消选择{label}", exact=True)).to_be_visible()


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1100})
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
        page.get_by_role("button", name="生成任务路径").click()
        try:
            expect(page.get_by_text("任务导航")).to_be_visible(timeout=120000)
        except AssertionError:
            print(page.locator("body").inner_text(timeout=5000))
            raise
        expect(page.get_by_text("可复制给 AI")).to_be_visible()
        page.get_by_role("button", name="打卡完成").click()
        page.get_by_placeholder("我完成了什么？").fill("我明确了最小交付范围。")
        page.get_by_role("button", name="提交打卡").click()
        expect(page.get_by_text("能力资产库")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="技能").click()
        expect(page.get_by_text("标签列表")).to_be_visible()
        browser.close()


if __name__ == "__main__":
    main()

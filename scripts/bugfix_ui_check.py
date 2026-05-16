from __future__ import annotations

from playwright.sync_api import expect, sync_playwright


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1100})
        page.goto("http://localhost:5173/")
        page.wait_for_load_state("networkidle")
        page.get_by_label("选择大学生").click()
        expect(page.get_by_text("已选中，点击可取消").first).to_be_visible()
        page.get_by_label("选择计算机").click()
        page.get_by_label("选择入门").click()
        page.get_by_label("选择做项目").click()
        page.get_by_label("选择2-4周").click()
        page.get_by_label("选择项目交付优先").click()
        page.get_by_role("button", name="保存标签").click()
        expect(page.get_by_text("写下今天想推进的目标")).to_be_visible(timeout=10000)
        page.get_by_role("button", name="我的技能标签").click()
        expect(page.get_by_text("大学生画像")).to_be_visible(timeout=10000)
        expect(page.get_by_role("heading", name="能力 Prompt", exact=True).first).to_be_visible()
        browser.close()


if __name__ == "__main__":
    main()

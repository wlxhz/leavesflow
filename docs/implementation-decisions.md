# LeavesFlow MVP V1 实施决策记录

本文记录在原始技术规格说明书基础上，经产品确认后的实现决策。

## 1. 工程栈

- 前端使用 React + Vite + TypeScript。
- 前端包管理使用 npm workspaces。
- 后端使用 FastAPI + Python 3.11+。
- 后端依赖管理使用 `pyproject.toml + uv`。
- SQLite 持久化，数据库访问使用 SQLAlchemy 2.x ORM。
- V1 不接入 Alembic，启动时自动建表并初始化 Demo 用户和默认标签数据。
- 配置入口为 `config/config.json`，样例为 `config/config.example.json`。
- OpenAPI 采用方案 β：Pydantic/FastAPI 为源，导出 `docs/openapi.yaml`。
- `packages/api-client` 使用手写 fetch 薄封装。

## 2. 部署与本地开发

- 本地前端端口：`5173`。
- 本地后端端口：`8000`。
- 生产接口采用同域名路径：`https://leavesflow.syt.huickathon.cn/api/v1`。
- CORS 开发环境放行 `localhost:5173` 和 `127.0.0.1:5173`，生产放行 `leavesflow.syt.huickathon.cn`。
- Android Capacitor WebView 还必须放行 `https://localhost`，并保留 `capacitor://localhost` 兼容来源；否则 APK 真机请求会报 `Failed to fetch`。
- V1 暂不做 Docker。

## 3. 目标输入

- 取消“15 字以内”的硬限制。
- 用户最多可输入 1000 个字符。
- 产品主场景仍优化为 15 字以内短目标：前端文案和 AI Prompt 均优先适配短目标高质量拆解。

## 4. 标签 Prompt 数据化

- 新增 `tag_options` 表存储标签选项。
- 每个标签包含 `label` 与 `prompt_text`。
- 用户标签选择保存 tag option id，不保存中文 label。
- 前端可以展开查看标签封装 Prompt，但 V1 不允许编辑。
- 新增 `GET /api/v1/tag-options`。

## 5. Vibe Coding 任务节点

任务节点新增：

- `context_for_ai`
- `vibe_coding_prompt`
- `expected_output`

这些字段用于让每一步任务更适合交给 Vibe Coding 工具或 coding agent 执行，降低大模型幻觉。

## 6. 能力 Prompt 资产

- `skill_tags` 表新增 `skill_prompt`。
- 技能提炼接口仍返回 `newSkillTags`，但每项增加 `prompt` 字段。
- 前端页面仍叫“我的技能标签”，卡片内容展示为能力 Prompt。

## 7. AI 与 Mock

- 真实调用使用 OpenAI 兼容 `/chat/completions`。
- 当前运行时代码不再启用 Mock AI fallback。
- 当 `openai_compatible.base_url` 或 `openai_compatible.api_key` 缺失时，接口显式返回 `AI_NOT_CONFIGURED`。
- 测试中可以 monkeypatch `AIClient` 使用 fixture，但测试 fixture 不进入运行时主路径。

## 8. 移动端封装

- 第一阶段移动端采用 Capacitor 封装现有 React Web 应用，不直接重写为 React Native。
- 当前只交付 Android debug APK，iOS 暂缓。
- App 名称固定为 `leavesflow`，包名固定为 `cn.huickathon.syt.leavesflow`。
- 原生环境 API 地址固定为 `https://leavesflow.syt.huickathon.cn/api/v1`。
- `apps/mobile` 继续保留为 React Native 占位目录，不代表当前正式移动端实现。
- 详细技术路线见 `docs/mobile-packaging-and-deployment-guide.md`。

## 9. 生产部署

- 前后端部署在同一台服务器，并通过同一域名提供服务。
- Nginx 负责静态前端、HTTPS 和 `/api/v1` 反向代理。
- FastAPI 只监听 `127.0.0.1:8000`，由 systemd 常驻。
- 生产 Web 使用同域路径 `/api/v1`；本地开发 API 明确使用 `http://127.0.0.1:8000/api/v1`，避免 `localhost` 解析到 IPv6 `::1` 时后端不可达。
- 当前本地手动测试优先使用 `npm run build:web` + `npm --workspace @leavesflow/web run preview`。preview 固定 `5173`，并把 `/api` 代理到 `127.0.0.1:8000`，用于规避 Windows 中文路径下 Vite dev optimizer 白屏问题。
- 当前首次部署使用现有 SQLite 数据库快照，后续如进入正式生产阶段，应补充备份、迁移和发布流程。

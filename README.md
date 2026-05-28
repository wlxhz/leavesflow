# LeavesFlow

LeavesFlow 是一个面向 Vibe Coding 的 AI 任务导航闭环：

```text
标签 Prompt 封装 -> 目标输入 -> AI 拆解任务路径 -> 用户打卡 -> 能力 Prompt 沉淀 -> 回写用户画像
```

## 技术栈

- 前端：React + Vite + TypeScript + Tailwind CSS
- 后端：Python 3.11+ + FastAPI + SQLAlchemy 2.x
- 数据库：SQLite
- 包管理：前端 npm workspaces，后端 uv
- 移动端：Capacitor Android 封装现有 Web 应用
- OpenAPI：Pydantic/FastAPI 为源，导出 `docs/openapi.yaml`

## 目录结构

```text
apps/
  web/                 用户端 React Web / PWA
  admin/               后台管理端 React Web，生产路径 /admin
  mobile/              移动端封装说明
packages/
  shared-types/        前端共享 TypeScript 类型
  api-client/          手写 fetch API client
services/
  api/                 FastAPI 后端
android/               Capacitor Android 原生工程
config/
  config.example.json  配置样例，不包含真实密钥
docs/
  ai-coding-project-index.md
  leavesflow-v1.3-product-development-guide.md
  mobile-packaging-and-deployment-guide.md
  openapi.yaml
pic/
  app_loge_demo.png    App 图标源图
  产品海报.png          产品视觉素材
scripts/
  run_api_dev.ps1
  generate_android_icons.ps1
```

更多文件职责请优先查看 `docs/ai-coding-project-index.md`。该索引用于后续 AI Coding 分层定位文件，避免重复全文读取项目。

## 配置

复制配置样例：

```powershell
Copy-Item config/config.example.json config/config.json
```

开发环境默认：

- 后端：`http://localhost:8000`
- 前端：`http://localhost:5173`
- 当 `app.env=dev` 且 `openai_compatible.api_key` 为空时，后端启用 Mock AI，便于本地跑通完整闭环。

生产建议使用同域名部署：

```text
https://leavesflow.syt.huickathon.cn/api/v1
```

## 后端启动

```powershell
cd services/api
uv sync
uv run uvicorn leavesflow_api.main:app --reload --host 0.0.0.0 --port 8000
```

启动时会自动建表，并初始化 Demo 用户与默认标签 Prompt 数据。

如果本机暂未安装 `uv`，但已安装后端依赖，也可以在项目根目录使用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run_api_dev.ps1
```

导出 OpenAPI：

```powershell
cd services/api
uv run python scripts/export_openapi.py
```

## 前端启动

```powershell
npm install
npm run dev:web
```

打开：

```text
http://localhost:5173
```

## 后台启动

```powershell
npm run dev:admin
```

本地后台默认访问：

```text
http://localhost:5174/admin/
```

## 验证

```powershell
python -m compileall services/api/src
cd services/api
$env:PYTHONPATH='src'; pytest -q
cd ../..
npm run typecheck
npm run build:web
```

端到端网页 smoke test：

```powershell
python C:\Users\王乐溪\.agents\skills\webapp-testing\scripts\with_server.py --server "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run_api_dev.ps1" --port 8000 --server "npm run dev:web" --port 5173 --timeout 60 -- python scripts/web_smoke_test.py
```

## 文档入口

- AI Coding 文件索引：`docs/ai-coding-project-index.md`
- V1.3 产品与维护主文档：`docs/leavesflow-v1.3-product-development-guide.md`
- Android 封装与部署：`docs/mobile-packaging-and-deployment-guide.md`
- AI 中转排查：`docs/ai-relay-troubleshooting.md`
- 后台需求文档：`apps/admin/docs/admin-requirements.md`
- 后台技术文档：`apps/admin/docs/admin-technical-spec.md`
- 数据库查看说明：`apps/admin/docs/database-viewing-guide.md`
- OpenAPI：`docs/openapi.yaml`

## 文件整理规则

- 根目录保留项目入口、配置、工作区和构建相关文件。
- 通用文档统一放入 `docs/`。
- 后台专属文档保留在 `apps/admin/docs/`，由后台 README 作为入口。
- 图片素材统一放入 `pic/`。
- 真实配置、数据库、日志、部署包和构建产物不进入源码文档索引。

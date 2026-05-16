# LeavesFlow MVP V1

LeavesFlow V1 是一个面向 Vibe Coding 的 AI 任务导航闭环：

```text
标签 Prompt 封装 -> 目标输入 -> AI 拆解任务路径 -> 用户打卡 -> 能力 Prompt 沉淀 -> 回写用户画像
```

## 技术栈

- 前端：React + Vite + TypeScript + Tailwind CSS
- 后端：Python 3.11+ + FastAPI + SQLAlchemy 2.x
- 数据库：SQLite
- 包管理：前端 npm workspaces，后端 uv
- OpenAPI：Pydantic/FastAPI 为源，导出 `docs/openapi.yaml`

## 目录结构

```text
apps/
  web/                 React Web PWA
  mobile/              React Native 预留占位
packages/
  shared-types/        前端共享 TypeScript 类型
  api-client/          手写 fetch API client
services/
  api/                 FastAPI 后端
config/
  config.example.json  配置样例，不包含真实密钥
docs/
  implementation-decisions.md
```

## 配置

复制配置样例：

```powershell
Copy-Item config/config.example.json config/config.json
```

开发环境默认：

- 后端：`http://localhost:8000`
- 前端：`http://localhost:5173`
- Demo Token：`dev-demo-token`
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

## V1 范围

V1 不做注册、社区、分享、自动 Agent 执行、复杂认证、付费体系、完整课程系统和 Docker 部署。移动端目录仅作为后续 React Native 占位。

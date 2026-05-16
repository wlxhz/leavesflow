# LeavesFlow MVP V1 技术规格说明书

| 项 | 内容 |
| --- | --- |
| 文档版本 | 1.0 |
| 对应需求 | `LeavesFlow_MVP_V1_需求文档.md` |
| 适用范围 | V1 工程实现与验收 |
| 语言与区域 | 接口文案、错误信息、AI 约束语境：简体中文；时间存储：UTC ISO8601，展示由客户端处理 |

---

## 1. 依据与范围

### 1.1 依据

本规格实现并约束 `LeavesFlow_MVP_V1_需求文档.md` 中 V1 功能与数据模型建议，不包含该文档「12. V1 不做范围」所列能力。

### 1.2 已确认工程决策（冻结）

| 编号 | 决策 |
| --- | --- |
| D1 | 客户端：先 **React Web（PWA）**；后续 **React Native**，与 Web 共用 **Monorepo 内 packages**（共享类型与 API 客户端） |
| D2 | 服务端：**Python 3.11+**，框架 **FastAPI** |
| D3 | V1 **无用户注册**；仅 **Demo 测试用户**，鉴权见第 6 章 |
| D4 | 持久化：**SQLite**；目标、阶段、任务、打卡、技能标签 **全部服务端持久化** |
| D5 | 对外接口：**REST**，配套 **OpenAPI 3.x** 描述文件（单一事实来源） |
| D6 | 大模型：经 **OpenAI 兼容中转** 调用；响应 **JSON Object**；服务端 **Pydantic/JSON Schema 校验**，失败按第 9 章策略处理 |
| D7 | 运行时配置：**独立配置文件**（`config.yaml` 或 `config.json`，二选一由仓库约定其一为唯一入口），**禁止**将 `api_key` 写入业务库 |
| D8 | 文案：**仅中文** |
| D9 | 技能等级枚举 V1 固定为：`入门`、`进阶`、`熟练` |
| D10 | 安全合规专章：**本版不展开**（不含日志脱敏分级、跨境等条款） |

### 1.3 术语

| 术语 | 定义 |
| --- | --- |
| 中转站 | OpenAI 兼容 `base_url` 的 HTTP 网关，路径与鉴权头与 OpenAI SDK 兼容模式一致 |
| 隐藏 Prompt | 由服务端根据用户标签组装的 system/developer 文本，不对客户端回显原文（可选：是否存审计表本版不强制） |
| MCP/Skills 扩展 | 由**开发者/部署方**通过配置与代码扩展点接入工具与技能定义；V1 产品流程不依赖终端用户配置 MCP |

---

## 2. 系统上下文与逻辑架构

### 2.1 上下文

```text
[React Web PWA] ──HTTPS──▶ [FastAPI API + SQLite]
                              │
                              ├──▶ [OpenAI 兼容中转站 /chat/completions]
                              └──▶ [MCP/Skills 扩展模块（可选、配置开关）]
```

### 2.2 逻辑分层（服务端）

| 层 | 职责 | 禁止 |
| --- | --- | --- |
| 接入层 | 路由、鉴权、请求 ID、OpenAPI 绑定 | 业务分支堆叠 |
| 应用层 | 用例编排：建目标、生成路径、打卡、回写技能 | 直接拼 SQL 字符串散落 |
| 领域层 | 实体不变式、状态迁移（任务 pending→completed） | HTTP 细节 |
| 基础设施层 | SQLite、HTTP 客户端调模型、文件配置加载、可选 MCP 适配器 | 暴露驱动细节到 OpenAPI 模型名 |

### 2.3 仓库与 Monorepo 物理结构（规范）

```text
repo/
  apps/
    web/                 # React + Vite（或等价），PWA 能力
    mobile/              # React Native（占位，可与 web 同步迭代）
  packages/
    shared-types/        # TypeScript 类型：与 OpenAPI 生成类型或 hand-written 对齐策略在 CI 中二选一固化
    api-client/          # 由 openapi-generator 自 OpenAPI 产物生成，或 hand-written 薄封装
  services/
    api/                 # FastAPI 工程根（pyproject/poetry 或 pip-tools 由实现选定，本规格只约束 Python 版本与接口）
  docs/
    openapi.yaml         # OpenAPI 3.x 唯一发布源（或由代码注解导出，但必须可还原为单一 yaml）
  config/
    config.example.yaml  # 不含密钥的样例
```

**类型对齐策略（必选其一，写入项目 README 由实现锁定）：**

- **方案 α**：`openapi.yaml` 为源 → CI 生成 TS Client +（可选）Python 模型；或  
- **方案 β**：Pydantic 为源 → 导出 `openapi.yaml` + 生成 TS。

本规格正文以 **REST 资源 + JSON 字段类型** 描述契约；OpenAPI 文件必须与正文一致。

---

## 3. 配置文件规范

### 3.1 文件

| 键 | 类型 | 约束 |
| --- | --- | --- |
| 路径 | `string` | 默认 `config/config.yaml`；可通过环境变量 `LEAVESFLOW_CONFIG_PATH` 覆盖 |
| 格式 | — | YAML 1.2 子集或 JSON；**同一部署仅允许一个生效文件** |

### 3.2 顶层结构（YAML 示意）

```yaml
app:
  name: leavesflow-api
  env: dev                    # string: dev|staging|prod
  demo_bearer_token: ""       # string, non-empty in non-local if auth enabled
  demo_user_id: ""            # string UUID, 与 users.id 一致

database:
  url: "sqlite:///./data/leavesflow.db"   # string, SQLAlchemy URL

openai_compatible:
  base_url: "https://example-openai-relay/v1"   # string, HTTPS, 无尾斜杠或统一规范化函数处理
  api_key: ""                                   # string, secret
  chat_model: "gpt-4o-mini"                     # string, 可随中转站可用模型变更
  timeout_seconds: 120                          # integer, 30..600
  max_retries: 2                              # integer, 0..5

ai:
  decomposition_temperature: 0.3              # number, 0..2
  skill_extraction_temperature: 0.2             # number, 0..2
  json_mode: true                               # boolean, V1 固定 true

mcp:
  enabled: false                                # boolean
  servers: []                                   # array<object>, 见 3.3

skills:
  enabled: false                                # boolean
  registry_path: "./skills/registry.yaml"       # string, 相对 services/api 工作目录
```

### 3.3 `mcp.servers[]` 元素类型（扩展预留）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 唯一标识 |
| `transport` | `string` | 枚举预留：`stdio`、`http`；未实现前 `enabled=false` 不得调用 |
| `command` | `string \| null` | stdio 时可执行文件 |
| `args` | `string[]` | 默认 `[]` |
| `env` | `map<string,string>` | 敏感项从环境变量注入引用占位，不直接写密钥入仓 |

### 3.4 `skills.registry_path` 指向文件（扩展预留）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `skills` | `array<object>` | 每项含 `id: string`、`entry: string`（模块或提示词文件路径）、`input_schema: string`（JSON Schema 文件路径） |

V1 若 `skills.enabled=false`：服务端仅使用内置两份 Prompt 模板（任务拆解、技能提炼），不读取外部 registry。

---

## 4. 数据持久化（SQLite）

### 4.1 通用列类型约定

| SQL 类型 | 语义 | JSON 序列化 |
| --- | --- | --- |
| `TEXT` | UUID、枚举字符串、ISO8601 | string |
| `INTEGER` | 布尔用 0/1；计数 | number |
| `TEXT`（JSON） | 数组或对象 | array / object |

### 4.2 表：`users`

| 列名 | SQL 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | TEXT | PK | UUID v4 |
| `created_at` | TEXT | NOT NULL | ISO8601 UTC |
| `updated_at` | TEXT | NOT NULL | ISO8601 UTC |

V1 仅预置一行，`id` 与 `app.demo_user_id` 一致。

### 4.3 表：`user_tag_profile`

一行 per user；标签以 JSON 数组存储（V1 产品为单选维度，数组长度建议 0 或 1，服务端校验可选）。

| 列名 | SQL 类型 | 约束 |
| --- | --- | --- |
| `user_id` | TEXT | PK, FK → users.id |
| `identity_tags` | TEXT | NOT NULL, JSON `string[]` |
| `background_tags` | TEXT | NOT NULL, JSON `string[]` |
| `level_tags` | TEXT | NOT NULL, JSON `string[]` |
| `goal_type_tags` | TEXT | NOT NULL, JSON `string[]` |
| `time_range_tags` | TEXT | NOT NULL, JSON `string[]` |
| `output_preference_tags` | TEXT | NOT NULL, JSON `string[]` |
| `updated_at` | TEXT | NOT NULL |

**合法标签值集合**（与需求文档一致，服务端校验）：

- `identity_tags` ∈ {`大学生`,`职场新人`,`转行学习者`,`创业团队`,`零基础用户`}
- `background_tags` ∈ {`计算机`,`设计`,`商科`,`文科`,`工科`,`其他`}
- `level_tags` ∈ {`零基础`,`入门`,`有基础`,`有项目经验`}
- `goal_type_tags` ∈ {`做项目`,`学技能`,`准备比赛`,`求职面试`,`写文档`,`做作品集`}
- `time_range_tags` ∈ {`1天内`,`3天内`,`1周内`,`2-4周`,`1-3个月`}
- `output_preference_tags` ∈ {`步骤详细`,`快速上手`,`工具优先`,`学习优先`,`项目交付优先`}

### 4.4 表：`goals`

| 列名 | SQL 类型 | 约束 |
| --- | --- | --- |
| `id` | TEXT | PK |
| `user_id` | TEXT | NOT NULL, FK |
| `title` | TEXT | NOT NULL | 与 `raw_input` 初始相同或经修剪 |
| `raw_input` | TEXT | NOT NULL | 用户短目标 |
| `profile_snapshot` | TEXT | NOT NULL | JSON：`UserTagProfileSnapshot` |
| `status` | TEXT | NOT NULL | 枚举：`active` \| `completed` |
| `goal_summary` | TEXT | NULL | AI `goalSummary` |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

### 4.5 表：`stages`

| 列名 | SQL 类型 | 约束 |
| --- | --- | --- |
| `id` | TEXT | PK |
| `goal_id` | TEXT | NOT NULL, FK |
| `title` | TEXT | NOT NULL |
| `description` | TEXT | NOT NULL |
| `sort_order` | INTEGER | NOT NULL, ≥0 |

### 4.6 表：`task_nodes`

| 列名 | SQL 类型 | 约束 |
| --- | --- | --- |
| `id` | TEXT | PK |
| `goal_id` | TEXT | NOT NULL, FK |
| `stage_id` | TEXT | NOT NULL, FK |
| `title` | TEXT | NOT NULL |
| `description` | TEXT | NOT NULL |
| `path_steps` | TEXT | NOT NULL, JSON `string[]` |
| `tools` | TEXT | NOT NULL, JSON `ToolRecommendation[]` |
| `resources` | TEXT | NOT NULL, JSON `ResourceRecommendation[]` |
| `completion_criteria` | TEXT | NOT NULL, JSON `string[]` |
| `predicted_skill_tags` | TEXT | NOT NULL, JSON `string[]` |
| `status` | TEXT | NOT NULL | `pending` \| `completed` |
| `sort_order` | INTEGER | NOT NULL, ≥0 |

### 4.7 表：`task_check_ins`

| 列名 | SQL 类型 | 约束 |
| --- | --- | --- |
| `id` | TEXT | PK |
| `user_id` | TEXT | NOT NULL, FK |
| `task_node_id` | TEXT | NOT NULL, FK |
| `goal_id` | TEXT | NOT NULL, FK |
| `what_done` | TEXT | NULL |
| `what_produced` | TEXT | NULL |
| `problems` | TEXT | NULL |
| `created_at` | TEXT | NOT NULL |

V1：同一 `task_node_id` 仅允许一条成功打卡记录（`409` 若重复）。

### 4.8 表：`skill_tags`

| 列名 | SQL 类型 | 约束 |
| --- | --- | --- |
| `id` | TEXT | PK |
| `user_id` | TEXT | NOT NULL, FK |
| `name` | TEXT | NOT NULL |
| `level` | TEXT | NOT NULL | `入门` \| `进阶` \| `熟练` |
| `source_task_id` | TEXT | NOT NULL, FK |
| `source_goal_id` | TEXT | NOT NULL, FK |
| `evidence` | TEXT | NOT NULL |
| `count` | INTEGER | NOT NULL, ≥1 |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

**合并规则**：同一 `user_id` + `name` + `level` 视为同一技能维度行，`count += n`，`evidence` 追加短文本（实现定义分隔符，长度上限建议 4000 字截断）。

---

## 5. 领域 JSON 类型（API 与库内一致）

### 5.1 `UserTagProfileSnapshot`

```json
{
  "identityTags": ["大学生"],
  "backgroundTags": ["计算机"],
  "levelTags": ["入门"],
  "goalTypeTags": ["做项目"],
  "timeRangeTags": ["2-4周"],
  "outputPreferenceTags": ["项目交付优先"]
}
```

| 字段 | JSON 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `identityTags` | array[string] | 是 | 元素 ∈ 4.3 集合 |
| `backgroundTags` | array[string] | 是 | 同上 |
| `levelTags` | array[string] | 是 | 同上 |
| `goalTypeTags` | array[string] | 是 | 同上 |
| `timeRangeTags` | array[string] | 是 | 同上 |
| `outputPreferenceTags` | array[string] | 是 | 同上 |

### 5.2 `ToolRecommendation`

| 字段 | JSON 类型 | 必填 |
| --- | --- | --- |
| `name` | string | 是 |
| `usage` | string | 是 |
| `url` | string | 是，合法 URI |

### 5.3 `ResourceRecommendation`

| 字段 | JSON 类型 | 必填 |
| --- | --- | --- |
| `title` | string | 是 |
| `url` | string | 是，合法 URI |
| `description` | string | 否 |

### 5.4 AI：`DecompositionResult`（模型 JSON，校验后写入多表）

| 字段 | JSON 类型 | 必填 |
| --- | --- | --- |
| `goalTitle` | string | 是 |
| `goalSummary` | string | 是 |
| `stages` | array[object] | 是，非空 |

`stages[]`：

| 字段 | JSON 类型 | 必填 |
| --- | --- | --- |
| `title` | string | 是 |
| `description` | string | 是 |
| `tasks` | array[object] | 是，非空 |

`stages[].tasks[]`：

| 字段 | JSON 类型 | 必填 |
| --- | --- | --- |
| `title` | string | 是 |
| `description` | string | 是 |
| `path` | array[string] | 是 |
| `tools` | array[ToolRecommendation] | 是，可为空数组 |
| `resources` | array[ResourceRecommendation] | 是，可为空数组 |
| `completionCriteria` | array[string] | 是，非空 |
| `skillTags` | array[string] | 是，可为空数组（预测标签） |

服务端映射：`path` → `path_steps`；`skillTags` → `predicted_skill_tags`。

### 5.5 AI：`SkillExtractionResult`

```json
{
  "newSkillTags": [
    {
      "name": "产品构思",
      "level": "入门",
      "source": "确定网站主题",
      "reason": "……"
    }
  ]
}
```

| 字段 | JSON 类型 | 必填 |
| --- | --- | --- |
| `newSkillTags` | array[object] | 是，可为空 |

`newSkillTags[]`：

| 字段 | JSON 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `name` | string | 是 | 1..32 字符 |
| `level` | string | 是 | 必须为 `入门` \| `进阶` \| `熟练` |
| `source` | string | 是 | 对应任务标题或稳定标识；V1 存 `source_task_id` 由服务端根据当前任务绑定 |
| `reason` | string | 是 | 写入 `evidence` 主文案 |

若模型输出非法 `level`：**整次打卡事务回滚**，返回 `502` + `AI_INVALID_SCHEMA`（见 7.2），并按 9.3 重试策略执行（若仍失败则对用户返回失败）。

---

## 6. 鉴权与安全基线

### 6.1 机制

| 项 | 规范 |
| --- | --- |
| 方案 | **HTTP Header**：`Authorization: Bearer <token>` |
| 校验 | `token === app.demo_bearer_token`（常量时序安全比较） |
| 用户解析 | 成功则 `request.state.user_id = app.demo_user_id` |
| 失败 | `401`，正文见第 7 章 |

### 6.2 基线

- HTTPS 部署侧强制（TLS 终止在网关或应用外）；本规格不规定证书品牌。  
- `api_key` 仅存在于配置文件或部署密钥注入，**禁止**客户端持有中转 `api_key`。

---

## 7. HTTP / REST 约定

### 7.1 全局

| 项 | 值 |
| --- | --- |
| Base Path | `/api/v1` |
| 字符编码 | UTF-8 |
| Content-Type | `application/json; charset=utf-8` |
| 幂等 | `GET`、`PUT` 幂等；`POST` 非幂等（除显式设计） |

### 7.2 错误响应体（所有 4xx/5xx）

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "人类可读中文说明",
    "requestId": "uuid",
    "details": {
      "fields": {
        "rawInput": ["长度超过限制"]
      }
    }
  }
}
```

| 字段 | 类型 | 必填 |
| --- | --- | --- |
| `error.code` | string | 是 |
| `error.message` | string | 是 |
| `error.requestId` | string | 是 |
| `error.details` | object | 否 |

**标准 `error.code` 表**

| HTTP | code | 说明 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 参数、标签枚举、长度 |
| 401 | `UNAUTHORIZED` | Token 缺失或错误 |
| 404 | `NOT_FOUND` | 资源不存在或越权 |
| 409 | `CONFLICT` | 重复打卡等 |
| 422 | `UNPROCESSABLE_ENTITY` | 语义正确但业务不允许（预留） |
| 502 | `AI_UPSTREAM_ERROR` | 中转 HTTP 非 2xx 或超时 |
| 502 | `AI_INVALID_SCHEMA` | JSON 解析失败或 schema 校验失败 |
| 503 | `AI_RATE_LIMITED` | 上游 429（映射，可选） |

### 7.3 成功响应体

无统一信封；各路径在 OpenAPI 中声明 `200`/`201` 的 `application/json` schema。

### 7.4 分页

V1 列表接口数据量小，**可不实现分页**；若实现，`GET` 支持 `limit`（默认 50，最大 100）、`cursor`（opaque string），响应：

```json
{
  "items": [],
  "nextCursor": null
}
```

---

## 8. REST 资源与接口清单

以下与 `docs/openapi.yaml` **必须逐项一致**。

### 8.1 `GET /api/v1/me`

**说明**：返回当前 Demo 用户档案与技能聚合。

**200 `application/json`**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `userId` | string | UUID |
| `tagProfile` | `UserTagProfileSnapshot` | 无标签时各数组为空 `[]` |
| `skillTags` | array[object] | 见下表 |

`skillTags[]`：

| 字段 | 类型 |
| --- | --- |
| `id` | string |
| `name` | string |
| `level` | string |
| `count` | number |
| `sourceTaskId` | string |
| `sourceGoalId` | string |
| `evidence` | string |
| `updatedAt` | string ISO8601 |

### 8.2 `PUT /api/v1/me/tag-profile`

**说明**：全量覆盖用户标签（PWA 标签页保存）。

**Request body**：`UserTagProfileSnapshot`

**200**：同 `GET /me` 中 `tagProfile` 字段包装：

```json
{ "tagProfile": { } }
```

### 8.3 `POST /api/v1/goals`

**说明**：创建目标；`profile_snapshot` 若缺省，则服务端使用当前 `user_tag_profile` 生成快照写入 `goals.profile_snapshot`。

**Request body**

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `rawInput` | string | 是 | 中文 ≤15 字；英文 ≤30 字符（按 Unicode 标量计数规则在服务端统一实现并文档化） |
| `profileSnapshot` | `UserTagProfileSnapshot` | 否 | 提供则必须与库内标签校验规则一致 |

**201**

| 字段 | 类型 |
| --- | --- |
| `id` | string |
| `title` | string |
| `rawInput` | string |
| `status` | string |
| `profileSnapshot` | object |
| `createdAt` | string |

创建后 `status` 初始为 `active`；若产品要求先 `draft` 再生成，可在 OpenAPI 中改为两阶段，**本规格采用**：创建后为 `active`，若无 `plan` 则客户端走生成接口。

### 8.4 `POST /api/v1/goals/{goalId}/plan:generate`

**说明**：同步调用模型生成拆解；成功后写入 `stages`、`task_nodes`，并更新 `goals.goal_summary`。

**Path**：`goalId` UUID

**Request body**：`{}` 空对象即可（预留 `locale` 等扩展）

**200**

| 字段 | 类型 |
| --- | --- |
| `goalId` | string |
| `goalTitle` | string |
| `goalSummary` | string |
| `stages` | array（嵌套任务完整 DTO，见 8.6 子集） |

**409**：若该 `goal` 已存在非空 `stages`（可选策略 A 覆盖重算 / B 拒绝）；**本规格采用 B**：`code=CONFLICT`，`message` 中文说明需先删除（V1 不提供删除则永不冲突——实现可简化：无 stages 才允许 generate）。

### 8.5 `GET /api/v1/goals/{goalId}`

**200**：目标头信息 + `plan`（若无则 `plan: null`）。

| 字段 | 类型 |
| --- | --- |
| `id` | string |
| `title` | string |
| `rawInput` | string |
| `status` | string |
| `goalSummary` | string \| null |
| `profileSnapshot` | object |
| `createdAt` | string |
| `plan` | object \| null |

### 8.6 `GET /api/v1/goals/{goalId}/plan`

**200**

```json
{
  "goalId": "",
  "goalTitle": "",
  "goalSummary": "",
  "stages": [
    {
      "id": "",
      "title": "",
      "description": "",
      "sortOrder": 0,
      "tasks": [
        {
          "id": "",
          "title": "",
          "description": "",
          "pathSteps": [],
          "tools": [],
          "resources": [],
          "completionCriteria": [],
          "predictedSkillTags": [],
          "status": "pending",
          "sortOrder": 0
        }
      ]
    }
  ]
}
```

### 8.7 `POST /api/v1/tasks/{taskId}/check-ins`

**说明**：打卡；触发技能提炼模型；事务内更新 `task_nodes.status=completed`、插入 `task_check_ins`、合并 `skill_tags`。

**Request body**

| 字段 | 类型 | 必填 |
| --- | --- | --- |
| `whatDone` | string | 否 |
| `whatProduced` | string | 否 |
| `problems` | string | 否 |

**201**

| 字段 | 类型 |
| --- | --- |
| `checkInId` | string |
| `taskNodeId` | string |
| `newSkillTags` | array（与 AI 输出结构一致但附 `id`） |

`newSkillTags[]` 额外字段：

| 字段 | 类型 |
| --- | --- |
| `id` | string | 新生成或已合并行的 id |

---

## 9. 大模型调用规范

### 9.1 传输

| 项 | 值 |
| --- | --- |
| Method | `POST` |
| URL | `{openai_compatible.base_url}/chat/completions` |
| Headers | `Authorization: Bearer {api_key}`，`Content-Type: application/json` |
| Body | OpenAI 兼容：`model`, `messages`, `response_format: {"type":"json_object"}`, `temperature` |

### 9.2 两次调用的角色划分

| 调用 | system 内容来源 | user 内容必须包含 |
| --- | --- | --- |
| 拆解 | 内置模板 + 标签展开句 + `skills` 扩展注入段（若启用） | `rawInput` + 结构化 `UserTagProfileSnapshot` JSON |
| 提炼 | 内置模板 | `UserTagProfileSnapshot` + `goal` + 已完成任务标题/描述 + 打卡三字段 |

### 9.3 失败与重试

| 场景 | 行为 |
| --- | --- |
| 上游超时 / 5xx | 指数退避，最多 `openai_compatible.max_retries` 次 |
| 200 但非 JSON / schema 失败 | 计入重试；超过次数返回 `502` `AI_INVALID_SCHEMA` |
| 打卡 + 写库 | 与模型调用同事务边界：**先模型后写库**；任一步失败不更新任务状态 |

---

## 10. MCP / Skills 扩展点（工程）

| 扩展点 | 接口形态 | V1 默认 |
| --- | --- | --- |
| MCP | `mcp.enabled` 为真时，拆解与提炼前可注册工具结果注入 `messages` 附加 `tool` 角色段 | `false` |
| Skills | `skills.enabled` 为真时，自 `registry_path` 加载额外 system 片段与 JSON Schema 文件路径，合并校验 | `false` |

**不得**在 V1 要求终端用户配置 MCP；配置仅面向开发者/部署。

---

## 11. 客户端（React Web PWA）职责划分

| 页面（需求 10 节） | 调用接口 |
| --- | --- |
| 标签选择 | `PUT /me/tag-profile` |
| 目标输入 | `POST /goals` |
| AI 生成中 | `POST /goals/{id}/plan:generate` + loading |
| 任务路径 | `GET /goals/{id}/plan` |
| 我的技能标签 | `GET /me` |

---

## 12. 需求追溯矩阵

| 需求章节 | 技术落点 |
| --- | --- |
| 3 标签与 Prompt | `user_tag_profile` + 服务端隐藏模板；`PUT /me/tag-profile` |
| 4 短目标 | `POST /goals.rawInput` 校验 |
| 5 拆解 | `plan:generate` + `DecompositionResult` |
| 6 展示 | `GET .../plan` DTO |
| 7 打卡 | `POST .../check-ins` |
| 8 技能回写 | `SkillExtractionResult` + `skill_tags` 合并 |
| 9 MCP/Skill | 第 10 章 + `config.yaml` |
| 11 数据模型 | 第 4–5 章 |
| 12 不做范围 | 无接口、无表 |

---

## 13. OpenAPI 交付物

| 文件 | 要求 |
| --- | --- |
| `docs/openapi.yaml` | OpenAPI **3.0.3 或 3.1.0**；包含安全方案 `bearerAuth`；所有路径 `schemas` 与第 5、8 章一致 |

---

## 14. 版本与变更

本说明书变更应：**升版本号**、在顶部表格登记、同步更新 OpenAPI 与迁移脚本（若已有生产 SQLite，需显式 migration 策略；V1 Demo 可全量重建）。

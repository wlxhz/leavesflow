# LeavesFlow 后台一期技术文档

版本日期：2026-05-28

文档用途：面向后续开发和维护。后续开发后台、改接口、查表结构、部署维护时看本文档。

产品范围和功能扩展请看：

```text
apps/admin/docs/admin-requirements.md
```

## 1. 当前代码基线

当前已确认：

```text
没有 /api/v1/admin/* 后台接口
没有后台 Dashboard 接口
没有后台用户列表接口
没有后台用户定向查询资源用量接口
没有后台删除用户注册数据接口
没有 ai_usage_logs 或同类模型 token 用量表
AIClient 调用模型后没有持久化记录 response.usage
```

因此一期需要新增：

```text
apps/admin React 单页工程
后端 /api/v1/admin/* 接口
简单后台访问密码校验
ai_usage_logs 表
user_deletion_logs 表
AIClient token usage 持久化
用户资源定向查询
用户删除接口
/admin 部署路径
```

## 2. 目录规划

后台前端后续放在：

```text
apps/admin/
```

建议最小工程结构：

```text
apps/admin/
  package.json
  index.html
  src/
    main.tsx
    App.tsx
    api.ts
    styles.css
  docs/
    admin-requirements.md
    admin-technical-spec.md
    database-viewing-guide.md
```

一期保持单页，不拆复杂模块。

## 3. 后台访问保护

一期使用简单访问密码，不做管理员账号和多角色权限。

建议请求头：

```text
X-Admin-Password: <后台访问密码>
```

建议新增配置：

```json
{
  "admin": {
    "access_password": ""
  }
}
```

配置文件位置：

```text
config/config.json
config/config.example.json
```

后端所有 `/api/v1/admin/*` 接口都必须校验 `X-Admin-Password`。

注意：

- 不在前端代码中硬编码真实密码。
- 真实密码只放在生产 `config/config.json`。
- `config/config.json` 已被 `.gitignore` 忽略，不提交。
- 返回错误统一用现有 `AppError` / `error_response` 风格。

## 4. 后端接口

### 4.1 Dashboard

```text
GET /api/v1/admin/dashboard
```

用途：

```text
返回单页 Dashboard 所需的大盘数据。
```

请求头：

```text
X-Admin-Password: <后台访问密码>
```

返回结构：

```json
{
  "summary": {
    "totalUsers": 13,
    "totalGoals": 30,
    "totalTasks": 87,
    "totalCheckIns": 23,
    "totalSkillTags": 68
  },
  "userWindows": {
    "oneDay": { "created": 1, "deleted": 0, "net": 1 },
    "sevenDays": { "created": 4, "deleted": 1, "net": 3 },
    "thirtyDays": { "created": 13, "deleted": 1, "net": 12 }
  },
  "tokenWindows": {
    "oneDay": { "totalK": 0.0, "generatePlanK": 0.0, "extractSkillsK": 0.0 },
    "sevenDays": { "totalK": 0.0, "generatePlanK": 0.0, "extractSkillsK": 0.0 },
    "thirtyDays": { "totalK": 0.0, "generatePlanK": 0.0, "extractSkillsK": 0.0 }
  },
  "recentUsers": [],
  "recentGoals": [],
  "recentCheckIns": [],
  "systemFeedback": {
    "aiBaseUrlConfigured": true,
    "aiApiKeyConfigured": true,
    "tokenUsageTrackingEnabled": true
  }
}
```

### 4.2 用户定向查询

```text
GET /api/v1/admin/users/search?query=<user_id_or_username>
```

用途：

```text
按用户 ID 或用户名查询用户资源使用情况。
```

返回结构：

```json
{
  "user": {
    "id": "string",
    "username": "string",
    "displayName": "string",
    "createdAt": "string",
    "updatedAt": "string"
  },
  "counts": {
    "goals": 0,
    "tasks": 0,
    "checkIns": 0,
    "skillTags": 0
  },
  "tokenUsage": {
    "oneDayK": 0.0,
    "sevenDaysK": 0.0,
    "thirtyDaysK": 0.0,
    "allRecordedK": 0.0
  },
  "recentAiUsage": []
}
```

### 4.3 用户删除

```text
DELETE /api/v1/admin/users/{user_id}
```

请求头：

```text
X-Admin-Password: <后台访问密码>
```

请求体：

```json
{
  "confirm": "username-or-user-id",
  "mode": "hard"
}
```

说明：

- `confirm` 必须等于用户 ID 或用户名。
- `mode` 需要等删除策略确认后最终确定。
- 删除前必须统计关联数据并写入 `user_deletion_logs`。
- 删除成功后返回删除摘要。

返回结构建议：

```json
{
  "deletedUserId": "string",
  "username": "string",
  "mode": "hard",
  "deletedAt": "string",
  "counts": {
    "goals": 0,
    "tasks": 0,
    "checkIns": 0,
    "skillTags": 0
  }
}
```

## 5. 新增配置模型

后端 `Settings` 需要增加：

```python
class AdminConfig(BaseModel):
    access_password: str = ""

class Settings(BaseModel):
    ...
    admin: AdminConfig = Field(default_factory=AdminConfig)
```

`config/config.example.json` 增加：

```json
{
  "admin": {
    "access_password": "change-me"
  }
}
```

生产 `config/config.json` 需要设置真实密码。

## 6. 新增数据表

### 6.1 ai_usage_logs

用途：

```text
记录每次模型调用的 token 用量。
```

建议 SQLAlchemy 模型字段：

```text
id: String primary key
user_id: String nullable true index
goal_id: String nullable true index
task_node_id: String nullable true index
operation: String not null index
model: String nullable true
prompt_tokens: Integer nullable true
completion_tokens: Integer nullable true
total_tokens: Integer nullable true index
status: String not null index
error_code: String nullable true
error_message: Text nullable true
latency_ms: Integer nullable true
created_at: String not null index
```

`operation` 取值：

```text
generate_plan
extract_skills
```

`status` 取值：

```text
success
failed
```

注意：

- 只记录 token 和错误摘要，不记录完整 prompt、用户输入和模型输出。
- 如果中转服务未返回 `usage`，`prompt_tokens`、`completion_tokens`、`total_tokens` 允许为 `null`。

### 6.2 user_deletion_logs

用途：

```text
记录后台删除用户动作，用于统计用户减少数。
```

建议 SQLAlchemy 模型字段：

```text
id: String primary key
user_id: String not null index
username: String nullable true index
display_name: String nullable true
deleted_at: String not null index
goals_count: Integer not null
task_nodes_count: Integer not null
check_ins_count: Integer not null
skill_tags_count: Integer not null
delete_mode: String not null
```

`delete_mode` 取值：

```text
hard
soft
```

## 7. AI 用量记录方案

现有 AI 调用在：

```text
services/api/src/leavesflow_api/ai.py
```

现有入口：

```text
AIClient.generate_plan(...)
AIClient.extract_skills(...)
```

一期需要在模型响应后读取：

```text
response.json()["usage"]
```

常见字段：

```text
prompt_tokens
completion_tokens
total_tokens
```

但不同中转服务可能缺失 `usage`，所以实现时必须兼容：

```text
usage 不存在 -> token 字段记录 null
```

调用失败也要记录：

```text
status = failed
error_code
error_message
latency_ms
```

为了关联用户与业务对象，建议调整 AIClient 调用参数或在调用处记录日志：

```text
generate_plan: user_id, goal_id
extract_skills: user_id, goal_id, task_node_id
```

## 8. 时间窗口统计

窗口：

```text
1 天
7 天
30 天
```

建议按当前 UTC 时间向前计算：

```text
utc_now - 1 day
utc_now - 7 days
utc_now - 30 days
```

当前项目时间字段是字符串，格式来自 `utc_now()`。查询时需要保证字符串格式可按时间排序比较；如不稳，开发时应统一使用 ISO 8601 UTC 字符串。

用户新增：

```text
users.created_at >= window_start
```

用户减少：

```text
user_deletion_logs.deleted_at >= window_start
```

token 消耗：

```text
sum(ai_usage_logs.total_tokens) where created_at >= window_start
```

单位转换：

```text
tokenK = total_tokens / 1000
```

## 9. 用户删除实现策略

当前仍需产品确认：

```text
硬删除还是软删除。
```

### 9.1 硬删除

适合：

```text
内部测试阶段
清理测试账号
```

需要删除或清理：

```text
skill_tags
task_check_ins
task_nodes
stages
goals
user_tag_profile
ai_usage_logs
users
```

删除前必须写入：

```text
user_deletion_logs
```

### 9.2 软删除

适合：

```text
已有真实用户数据
需要保留审计和历史统计
```

需要新增：

```text
users.deleted_at
users.deleted_reason
```

还需要修改：

```text
登录逻辑
get_current_user_id
用户端 /me
用户端 active plan
后台用户查询
```

避免软删除用户继续登录和使用。

## 10. 前端实现约束

技术栈：

```text
React
Vite
TypeScript
CSS
```

部署路径：

```text
/admin
```

前端请求：

```text
/api/v1/admin/dashboard
/api/v1/admin/users/search
/api/v1/admin/users/{user_id}
```

访问密码保存建议：

```text
sessionStorage
```

不要写入源码、不要写入 localStorage 长期保存。

## 11. 部署要求

生产域名：

```text
https://leavesflow.syt.huickathon.cn
```

后台路径：

```text
https://leavesflow.syt.huickathon.cn/admin
```

Nginx 需要支持：

```text
/                  用户端 Web
/admin/            后台 Web
/api/v1/           FastAPI
```

如果后台构建产物独立输出，建议部署到：

```text
apps/admin/dist
```

Nginx `/admin` 使用 SPA fallback：

```text
try_files $uri $uri/ /admin/index.html
```

具体 Nginx 配置以后续实际构建目录为准。

## 12. 安全边界

禁止展示：

```text
users.password_hash
users.auth_token
openai_compatible.api_key
服务器密码
```

禁止记录：

```text
完整用户 prompt
完整模型输出
用户打卡三段文本到 ai_usage_logs
```

删除用户必须：

```text
二次确认
通过后端接口执行
记录 user_deletion_logs
```

## 13. 维护说明

开发和维护后台时优先查看本文档。

如果需要新增功能：

1. 先更新 `admin-requirements.md`，确认产品范围。
2. 再更新本文档，补充接口、表结构、部署和维护细节。
3. 最后进入代码开发。

这样避免需求和技术实现混在一起，后续维护时更清楚。

## 14. 2026-05-28 实现落地记录

本次开发已按本文档落地后台一期最小版本：

```text
apps/admin React + Vite + TypeScript 单页工程
GET /api/v1/admin/dashboard
GET /api/v1/admin/users/search?query=<user_id_or_username>
PATCH /api/v1/admin/users/{user_id}
DELETE /api/v1/admin/users/{user_id}
X-Admin-Password 后台访问密码校验
ai_usage_logs
user_deletion_logs
AIClient response.usage 捕获和用量持久化
```

一期删除用户策略使用硬删除，并保留二次确认与删除日志：

```text
删除前写入 user_deletion_logs
confirm 必须等于用户 ID 或用户名
delete_mode = hard
删除 skill_tags / task_check_ins / task_nodes / stages / goals / user_tag_profile / ai_usage_logs / users
```

后台前端开发和构建命令：

```text
npm run dev:admin
npm run build:admin
```

后端 smoke 测试可使用测试用临时配置：

```text
services/api/tests/config.smoke.json
```

该配置只用于本地 smoke 测试，避免测试过程写入真实开发数据库。

## 15. 2026-05-28 用户清单行内操作补充

后台用户清单已支持从列表行内直接编辑和删除用户：

```text
编辑：修改用户名 username 和昵称 displayName
删除：仍然要求输入用户 ID 或用户名进行二次确认
```

新增接口：

```text
PATCH /api/v1/admin/users/{user_id}
```

请求体：

```json
{
  "username": "string",
  "displayName": "string"
}
```

一期编辑边界：

```text
不编辑 password_hash
不编辑 auth_token
不编辑用户标签画像
不编辑路径、任务、打卡内容
```

## 16. 2026-05-28 生产路径部署记录

后台一期最终采用主域名路径部署，不使用独立 admin 子域名。

生产访问入口：

```text
https://leavesflow.syt.huickathon.cn/admin/
```

部署规则：

```text
/                  用户端 Web
/admin/            后台 Web
/api/v1/           FastAPI
```

后台前端构建时需要使用 `/admin/` 作为 Vite base，避免后台静态资源落到主站根路径 `/assets/`：

```text
LEAVESFLOW_ADMIN_BASE=/admin/
npm run build:admin
```

Nginx 主站点需要在 `location /api/v1/` 和 `location /` 之前加入后台路径规则：

```nginx
location = /admin {
    return 301 /admin/;
}

location ^~ /admin/ {
    alias /opt/leavesflow/app/apps/admin/dist/;
    index index.html;
    try_files $uri $uri/ /admin/index.html;
}
```

服务器验证结果：

```text
https://leavesflow.syt.huickathon.cn/admin/ 返回 200
/admin/assets/*.js 返回 200
浏览器页面标题为 LeavesFlow Admin
```

注意：`admin.leavesflow.syt.huickathon.cn` 不作为一期生产入口维护；如后续确实需要子域名，需要单独添加 DNS、证书和 Nginx 站点配置。

# LeavesFlow 数据库查看说明

版本日期：2026-05-28

文档用途：只说明如何安全查看本地和生产 SQLite 数据库，以及当前数据库基线。后台开发实现细节请看：

```text
apps/admin/docs/admin-technical-spec.md
```

## 1. 当前数据库位置

本地开发数据库：

```text
services/api/data/leavesflow.db
```

本地配置入口：

```text
config/config.json
```

当前配置中的数据库地址：

```json
"database": {
  "url": "sqlite:///./data/leavesflow.db"
}
```

后端会把 `sqlite:///./data/leavesflow.db` 解析到 API 包目录下：

```text
services/api/data/leavesflow.db
```

服务器生产数据库：

```text
/opt/leavesflow/app/services/api/data/leavesflow.db
```

生产数据库查看前必须先备份，默认只读查看，不建议直接编辑。

## 2. 推荐查看方式

### 2.1 图形化方式

推荐安装任意 SQLite 查看工具：

```text
DB Browser for SQLite
SQLiteStudio
VS Code SQLite Viewer / SQLite 扩展
```

打开本地文件：

```text
F:\济南穹跃信息科技有限公司\26全年大项目\leavesflow_app\services\api\data\leavesflow.db
```

查看时建议使用只读模式。如果工具没有只读模式，先复制一份数据库副本再打开。

### 2.2 Python 只读查看

当前 Windows 环境没有直接检测到 `sqlite3` 命令，可以用 Python 自带的 `sqlite3` 模块查看。

查看所有表和行数：

```powershell
@'
import sqlite3

path = r"services/api/data/leavesflow.db"
con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
cur = con.cursor()

tables = [
    row[0]
    for row in cur.execute(
        "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name"
    )
]

for table in tables:
    count = cur.execute(f"select count(*) from {table}").fetchone()[0]
    print(f"{table}: {count}")
'@ | python -
```

查看用户基础字段：

```powershell
@'
import sqlite3

path = r"services/api/data/leavesflow.db"
con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
cur = con.cursor()

for row in cur.execute("""
    select id, username, display_name, created_at, updated_at
    from users
    order by created_at desc
    limit 50
"""):
    print(row)
'@ | python -
```

不要查询、导出或传播以下敏感字段：

```text
users.password_hash
users.auth_token
config/config.json
```

## 3. 当前本地数据库基线

统计时间：2026-05-28

```text
users: 13
user_tag_profile: 13
goals: 30
stages: 54
task_nodes: 87
task_check_ins: 23
skill_tags: 68
tag_options: 31
```

## 4. 当前业务表概览

### users

用途：用户账号基础信息。

主要字段：

```text
id
username
display_name
password_hash
auth_token
created_at
updated_at
```

敏感字段：

```text
password_hash
auth_token
```

### user_tag_profile

用途：用户画像标签选择。

主要字段：

```text
user_id
identity_tag_ids
background_tag_ids
level_tag_ids
goal_type_tag_ids
time_range_tag_ids
output_preference_tag_ids
updated_at
```

这些字段以 JSON 文本保存标签 ID，展示时需要关联 `tag_options` 还原标签。

### tag_options

用途：注册和目标生成时使用的标签选项与标签 Prompt。

主要字段：

```text
id
category
label
prompt_text
sort_order
enabled
created_at
updated_at
```

### goals

用途：用户创建的目标和路径入口。

主要字段：

```text
id
user_id
title
raw_input
profile_snapshot
status
goal_summary
created_at
updated_at
```

### stages

用途：一个目标下的阶段。

主要字段：

```text
id
goal_id
title
description
sort_order
```

### task_nodes

用途：一个阶段下的任务节点。

主要字段：

```text
id
goal_id
stage_id
title
description
context_for_ai
vibe_coding_prompt
expected_output
path_steps
tools
resources
completion_criteria
predicted_skill_tags
status
sort_order
```

### task_check_ins

用途：用户提交任务打卡时填写的完成情况。

主要字段：

```text
id
user_id
task_node_id
goal_id
what_done
what_produced
problems
created_at
```

用户输入文本：

```text
what_done
what_produced
problems
```

后台一期需求已确认不展示这些文本。

### skill_tags

用途：任务打卡后由 AI 提炼的能力标签。

主要字段：

```text
id
user_id
name
level
skill_prompt
source_task_id
source_goal_id
evidence
count
created_at
updated_at
```

## 5. 当前数据库缺口

当前数据库无法直接统计：

```text
AI 调用次数明细
AI 输入 token
AI 输出 token
AI 总 token
按用户统计模型资源使用量
1 天 / 7 天 / 30 天用户减少数
后台删除用户记录
```

后台一期技术文档已规定需要新增：

```text
ai_usage_logs
user_deletion_logs
```

具体表结构见：

```text
apps/admin/docs/admin-technical-spec.md
```

## 6. 生产数据库查看建议

生产环境不要直接在线编辑 SQLite 文件。

建议流程：

1. 在服务器上复制数据库备份：

```bash
cp /opt/leavesflow/app/services/api/data/leavesflow.db /opt/leavesflow/app/services/api/data/leavesflow.inspect-copy.db
```

2. 下载副本到本地查看。

3. 使用图形化工具或 Python 只读脚本打开副本。

4. 查看完成后删除副本，避免敏感数据长期散落。

后续如果后台面向正式运营，建议增加定时备份和从 SQLite 向 PostgreSQL 的迁移预案。

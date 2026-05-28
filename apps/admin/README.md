# LeavesFlow Admin

版本日期：2026-05-28

`apps/admin` 是 LeavesFlow 后台管理系统的专用目录。当前阶段已经将后台文档拆分为需求文档和技术文档，后续开发和维护只看技术文档，功能扩展和产品范围讨论看需求文档。

## 文档入口

### 功能扩展看需求文档

[admin-requirements.md](docs/admin-requirements.md)

用途：

```text
说明后台一期要做什么、不做什么、页面展示什么、用户能完成什么、如何验收。
```

适用场景：

```text
讨论功能范围
新增后台能力
调整产品优先级
确认验收标准
```

### 开发维护看技术文档

[admin-technical-spec.md](docs/admin-technical-spec.md)

用途：

```text
说明后台如何实现、接口怎么设计、表结构怎么建、鉴权怎么做、如何部署和维护。
```

适用场景：

```text
后端开发
前端开发
接口联调
数据库变更
上线部署
后续维护
```

### 数据库查看看说明文档

[database-viewing-guide.md](docs/database-viewing-guide.md)

用途：

```text
说明本地和生产 SQLite 数据库在哪里、怎么只读查看、当前有哪些业务表和敏感字段。
```

## 一期已确认范围

```text
页面形态：单页 Dashboard
访问保护：简单访问密码
上线位置：https://leavesflow.syt.huickathon.cn/admin
最近列表：默认展示 10 条
打卡文本：一期不展示用户填写的“完成了什么、产出了什么、遇到了什么问题”
```

一期重点：

```text
应用现有用户清单
1 天 / 7 天 / 30 天用户新增、减少和净变化
1 天 / 7 天 / 30 天模型 token 消耗，单位 K
定向查询某个用户的资源使用情况
删除某个用户的注册数据
```

## 当前能力结论

已经确认当前代码中没有以下能力：

```text
/api/v1/admin/* 后台接口
后台用户查询接口
后台删除用户注册数据接口
按用户统计模型 token 消耗的表或接口
AI 调用 token usage 持久化记录
```

因此一期开发需要新增最小后台页面、后台接口、简单访问密码校验、模型用量记录和用户删除记录。

## 文档维护规则

后续遵守以下规则：

```text
需求变更：先改 admin-requirements.md
技术实现变更：再改 admin-technical-spec.md
数据库查看方式变化：改 database-viewing-guide.md
```

不要把接口、表结构、部署细节写进需求文档；也不要把产品讨论和功能取舍写进技术文档。

## 当前生产入口

```text
https://leavesflow.syt.huickathon.cn/admin/
```

后台一期使用主域名路径部署，不使用 `admin.leavesflow.syt.huickathon.cn` 子域名。生产构建需要使用 `/admin/` 作为前端 base，具体部署细节见技术文档。

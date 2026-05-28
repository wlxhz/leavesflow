# LeavesFlow AI Coding 项目目录索引

本文件是给后续 AI Coding 使用的项目导航文件。目标是让 AI 不必反复全文读取仓库，而是先读本文件的上层目录说明，再按任务逐层定位到少量必要文件。

维护原则：

- 新增、删除、迁移文件时，同步更新本索引。
- 修改核心职责时，同步更新对应文件简介。
- 敏感配置、数据库、构建产物、依赖目录只记录位置和风险，不记录内容。
- 优先读取“快速定位”与对应目录层级；只有需要实现或排查时再打开具体文件。

## 0. 快速定位

本节用于让 AI 根据任务类型直接找到最可能需要读取的文件。除非任务很复杂，先读这些文件通常就够了。

- 改用户端页面、路径页、用户页、历史路径、打卡交互：`apps/web/src/App.tsx`、`apps/web/src/styles.css`
- 改用户端 API 地址、登录 token、移动端请求域名：`apps/web/src/api.ts`、`packages/api-client/src/index.ts`
- 改后台管理页面、用户清单、编辑/删除、统计面板：`apps/admin/src/App.tsx`、`apps/admin/src/styles.css`、`apps/admin/src/api.ts`
- 改后台接口、管理密码校验、用户查询/删除/编辑、统计口径：`services/api/src/leavesflow_api/admin.py`
- 改注册、登录、当前用户、目标创建、路径生成、打卡接口：`services/api/src/leavesflow_api/main.py`
- 改数据库表结构：`services/api/src/leavesflow_api/models.py`、`services/api/src/leavesflow_api/bootstrap.py`
- 改 API 请求/响应字段：`services/api/src/leavesflow_api/schemas.py`、`packages/shared-types/src/index.ts`
- 改业务持久化、路径返回结构、历史记录、技能合并、AI 用量记录：`services/api/src/leavesflow_api/services.py`
- 改 AI 中转、模型调用、超时、usage 解析：`services/api/src/leavesflow_api/ai.py`、`services/api/src/leavesflow_api/prompts.py`、`docs/ai-relay-troubleshooting.md`
- 改默认标签体系：`services/api/src/leavesflow_api/default_tags.py`
- 改配置读取、数据库路径、CORS、后台密码配置：`services/api/src/leavesflow_api/config.py`、`config/config.example.json`
- 改 Android APK 封装、Capacitor 配置、应用名、包名、图标：`capacitor.config.ts`、`android/app/src/main/AndroidManifest.xml`、`android/app/src/main/res/`、`scripts/generate_android_icons.ps1`、`pic/app_loge_demo.png`
- 改部署、Nginx、同域名 `/admin`、APK 构建记录：`docs/mobile-packaging-and-deployment-guide.md`、`apps/admin/docs/admin-technical-spec.md`
- 查本地运行、开发命令、项目基本说明：`README.md`、`package.json`
- 查完整产品/技术背景：`docs/leavesflow-v1.3-product-development-guide.md`
- 查后台需求：`apps/admin/docs/admin-requirements.md`
- 查数据库表和查看方式：`apps/admin/docs/database-viewing-guide.md`
- 查接口规格：`docs/openapi.yaml`

## 1. 根目录

根目录放置 monorepo 配置、项目总说明、移动端封装配置、全局依赖锁定文件和一级工作区目录。AI 只在需要了解项目启动方式、构建方式、仓库整体结构或移动端封装入口时读取本层。

### 1.1 根目录文件

- `.gitignore` - Git 忽略规则；确认哪些配置、数据库、构建产物不能提交时读取。
- `README.md` - 项目总入口；包含技术栈、目录结构、配置、本地后端和前端启动方式。
- `package.json` - npm workspace 与全局脚本入口；包含 web/admin/android 构建和类型检查命令。
- `package-lock.json` - npm 依赖锁定文件；只有依赖冲突、安装复现或安全审计时读取。
- `capacitor.config.ts` - Capacitor 根配置；控制 Android app id、app name、webDir、androidScheme。
- `config/config.example.json` - 安全示例配置；用于了解配置结构，不包含真实密钥。

### 1.2 根目录子目录

- `apps/` - 前端应用层，包含用户端 Web、后台管理端、移动端说明。
- `services/` - 后端服务层，目前主要是 FastAPI API 服务。
- `packages/` - 共享 TypeScript 类型和 API client。
- `android/` - Capacitor 生成并维护的 Android 原生工程。
- `docs/` - 产品、技术、部署、AI 中转、调试和 OpenAPI 文档。
- `scripts/` - 本地检查、启动、图标生成、AI 中转检查脚本。
- `config/` - 配置模板与本地真实配置目录；真实配置不应提交。
- `pic/` - 图片素材目录；App 图标源图和产品视觉素材统一存放在这里。

## 2. apps/

`apps/` 是前端工作区集合。用户端主应用在 `apps/web/`，后台管理系统在 `apps/admin/`，`apps/mobile/` 目前主要记录移动端封装说明。

### 2.1 apps/web/

用户端 React + Vite 单页应用。所有用户可见的主产品体验，包括登录注册、目标输入、路径生成、路径节点、打卡、技能资产、用户页、历史路径，主要都在这里。

#### 2.1.1 apps/web 根文件

- `apps/web/index.html` - 用户端 Vite HTML 入口；修改根挂载节点、页面标题、PWA 入口时读取。
- `apps/web/package.json` - 用户端 npm 脚本和依赖；处理前端构建、类型检查、Vite 启动时读取。
- `apps/web/postcss.config.js` - PostCSS/Tailwind 处理配置；样式构建异常时读取。
- `apps/web/tailwind.config.ts` - Tailwind 内容扫描与主题配置；调整 Tailwind 规则时读取。
- `apps/web/tsconfig.json` - 用户端 TypeScript 配置；类型解析异常时读取。
- `apps/web/vite.config.ts` - 用户端 Vite 配置；开发代理、构建输出、dev server 行为异常时读取。

#### 2.1.2 apps/web/public/

用户端静态资源目录。只在处理 PWA、favicon、manifest、静态图标时读取。

- `apps/web/public/leaf.svg` - 用户端静态叶子图标资源；视觉图标或 PWA 图标相关任务读取。
- `apps/web/public/manifest.webmanifest` - Web/PWA manifest；改应用名称、图标、主题色、安装表现时读取。

#### 2.1.3 apps/web/src/

用户端真实业务代码目录。绝大多数用户端功能修改都从这里进入。

- `apps/web/src/App.tsx` - 用户端核心 React 单页；包含登录注册、目标输入、标签选择、路径展示、打卡、技能、用户页、历史路径列表和详情等主要 UI 与状态逻辑。
- `apps/web/src/api.ts` - 用户端 API 实例和 token 管理；包含本地、生产 Web、Capacitor Native 三种 API base URL 策略。
- `apps/web/src/main.tsx` - 用户端 React 挂载入口；通常只有应用启动或根组件切换时读取。
- `apps/web/src/styles.css` - 用户端全局样式；修改视觉布局、移动端适配、按钮、卡片、路径节点样式时读取。
- `apps/web/src/vite-env.d.ts` - Vite 类型声明；一般无需读取，只有 TypeScript 环境类型报错时查看。

### 2.2 apps/admin/

后台管理系统。当前是简化的一期后台，部署在主域名 `/admin` 路径下，使用同一后端数据库的真实数据，不使用临时内存库。

#### 2.2.1 apps/admin 根文件

- `apps/admin/README.md` - 后台系统文档入口；说明需求文档、技术文档、数据库查看文档和当前生产入口。
- `apps/admin/index.html` - 后台 Vite HTML 入口；修改后台页面标题或根挂载节点时读取。
- `apps/admin/package.json` - 后台 npm 脚本和依赖；后台构建、启动、类型检查异常时读取。
- `apps/admin/tsconfig.json` - 后台 TypeScript 配置；后台类型解析异常时读取。
- `apps/admin/vite.config.ts` - 后台 Vite 配置；控制 dev server、构建 base、部署到 `/admin` 的路径行为。

#### 2.2.2 apps/admin/src/

后台管理前端源码。用户清单、编辑、删除、统计卡片等功能主要在这里。

- `apps/admin/src/App.tsx` - 后台核心 React 单页；包含密码登录、概览统计、用户增长、token 用量、用户搜索、用户清单行内编辑/删除、近期目标和打卡展示。
- `apps/admin/src/api.ts` - 后台 API client；封装管理密码 `sessionStorage`、`X-Admin-Password` 请求头、dashboard、搜索、编辑、删除接口。
- `apps/admin/src/main.tsx` - 后台 React 挂载入口；通常只有根组件或启动方式变化时读取。
- `apps/admin/src/styles.css` - 后台全局样式；浅色简约后台 UI 的布局、表格、按钮、弹窗、响应式样式。
- `apps/admin/src/vite-env.d.ts` - Vite 类型声明；一般无需读取，只有环境变量类型报错时查看。

#### 2.2.3 apps/admin/docs/

后台相关需求、技术、数据库查看文档。功能扩展先看需求文档，开发维护先看技术文档。

- `apps/admin/docs/admin-requirements.md` - 后台一期需求文档；记录一期范围、核心指标、用户清单、定向查询、删除操作、验收标准和后续扩展方向。
- `apps/admin/docs/admin-technical-spec.md` - 后台一期技术文档；记录接口、数据表、统计口径、部署到 `/admin`、用户行内操作等实现细节。
- `apps/admin/docs/database-viewing-guide.md` - 数据库查看说明；记录 SQLite 数据库位置、只读查看方式、业务表含义和生产查看建议。

### 2.3 apps/mobile/

移动端说明目录。目前没有独立 React Native 代码，Android 端通过 Capacitor 封装 `apps/web` 的构建产物。

- `apps/mobile/README.md` - 移动端工作区说明；解释当前移动端不是独立代码库，而是使用 Capacitor 封装用户端 Web。

## 3. services/

`services/` 是后端服务集合。目前核心服务是 `services/api/`，负责用户、目标、路径、打卡、技能、AI 调用、后台管理接口和数据库访问。

### 3.1 services/api/

FastAPI 后端服务。修改接口、数据库、AI 调用、后台统计、注册登录等后端能力时进入本目录。

#### 3.1.1 services/api 根文件

- `services/api/pyproject.toml` - Python 项目配置和依赖声明；后端依赖、pytest、ruff/mypy 等工具配置变化时读取。

#### 3.1.2 services/api/scripts/

后端辅助脚本目录。主要用于从 FastAPI 导出 OpenAPI。

- `services/api/scripts/export_openapi.py` - OpenAPI 导出脚本；接口变化后生成 `docs/openapi.yaml` 时读取或运行。

#### 3.1.3 services/api/src/leavesflow_api/

后端核心 Python 包。绝大多数 API 和数据库逻辑都在这里。

- `services/api/src/leavesflow_api/__init__.py` - Python 包标识文件；通常无需读取。
- `services/api/src/leavesflow_api/admin.py` - 后台管理 API；包含管理密码校验、dashboard 统计、用户搜索、用户编辑、用户删除、token 用量窗口统计。
- `services/api/src/leavesflow_api/ai.py` - OpenAI-compatible AI 客户端；负责模型中转请求、超时、错误转换、JSON 输出和 usage 提取。
- `services/api/src/leavesflow_api/auth.py` - 用户鉴权依赖；从请求中解析当前用户 token 并校验登录状态。
- `services/api/src/leavesflow_api/bootstrap.py` - 启动建表、轻量迁移和种子数据；新增表字段或默认数据时读取。
- `services/api/src/leavesflow_api/config.py` - 配置模型与加载逻辑；读取 `LEAVESFLOW_CONFIG_PATH`、`config/config.json` 或示例配置，包含 DB、AI、CORS、后台配置。
- `services/api/src/leavesflow_api/database.py` - SQLAlchemy Base、engine、Session、本地 SQLite URL 规范化；数据库连接问题时读取。
- `services/api/src/leavesflow_api/default_tags.py` - 默认标签体系；身份、背景、水平、目标类型、时间、支持偏好等内置标签和 prompt 种子。
- `services/api/src/leavesflow_api/errors.py` - 统一业务错误与错误响应结构；修改错误码、错误体格式时读取。
- `services/api/src/leavesflow_api/main.py` - FastAPI 主入口；注册 app、中间件、异常处理、健康检查、注册登录、用户信息、目标、路径生成、打卡接口。
- `services/api/src/leavesflow_api/models.py` - SQLAlchemy 数据表模型；用户、标签画像、目标、阶段、任务节点、打卡、技能、AI 用量、删除日志。
- `services/api/src/leavesflow_api/prompts.py` - AI prompt 模板；任务拆解和技能提取的系统/用户提示词规则。
- `services/api/src/leavesflow_api/schemas.py` - Pydantic 请求/响应模型；所有 API 字段契约和 AI 结构化输出模型。
- `services/api/src/leavesflow_api/services.py` - 核心业务服务；标签校验、画像输出、路径响应转换、历史路径、打卡完成判断、AI 用量记录、路径持久化、技能合并。
- `services/api/src/leavesflow_api/utils.py` - 通用工具；UTC 时间、ID 生成、JSON dump/load。

#### 3.1.4 services/api/tests/

后端测试目录。修改后端接口、注册登录、路径生成或打卡后优先运行相关测试。

- `services/api/tests/config.smoke.json` - 后端 smoke test 使用的安全测试配置；不是真实生产配置。
- `services/api/tests/test_smoke.py` - 后端完整烟测；覆盖注册、登录、目标创建、路径生成、打卡、回滚和基础接口。

## 4. packages/

`packages/` 存放前端共享包。用户端和后台都应优先复用这些类型/客户端，避免接口字段散落在多个应用中。

### 4.1 packages/api-client/

用户端 API client 包。主要服务 `apps/web`，封装请求、鉴权头、错误处理和 typed methods。

- `packages/api-client/package.json` - API client 包声明；修改包名、构建入口或依赖时读取。
- `packages/api-client/src/index.ts` - LeavesFlowClient 实现；封装用户端 auth、me、tag-options、goals、plan、check-ins 等 API 调用。

### 4.2 packages/shared-types/

共享 TypeScript 类型包。后端 schema 变化后，这里通常也要同步。

- `packages/shared-types/package.json` - shared-types 包声明；修改包名、导出入口或依赖时读取。
- `packages/shared-types/src/index.ts` - 前端共享类型定义；包含标签、画像、用户、路径、阶段、任务节点、打卡、历史路径、错误体等类型。

## 5. android/

`android/` 是 Capacitor Android 原生工程。大部分产品行为不在这里，而在 `apps/web/`。只有 APK 构建、Android 权限、包名、图标、启动页、Gradle 构建问题才需要读取本目录。

### 5.1 android 根构建文件

- `android/.gitignore` - Android 工程忽略规则；确认 Android 构建产物是否应提交时读取。
- `android/build.gradle` - Android 顶层 Gradle 构建配置；插件版本、仓库源、全局构建设置异常时读取。
- `android/settings.gradle` - Gradle 项目设置；模块包含关系异常时读取。
- `android/variables.gradle` - Android SDK/依赖版本变量；调整 compileSdk、minSdk、依赖版本时读取。
- `android/gradle.properties` - Gradle 属性；构建性能、AndroidX、JVM 参数相关问题时读取。
- `android/gradle-mirrors.init.gradle` - Gradle 镜像初始化脚本；国内/服务器构建下载依赖异常时读取。
- `android/capacitor.settings.gradle` - Capacitor 插件模块设置；Capacitor sync 后插件接入异常时读取。
- `android/gradlew` - Linux/macOS Gradle Wrapper 可执行脚本；非 Windows 构建 APK 时使用。
- `android/gradlew.bat` - Windows Gradle Wrapper 脚本；Windows 本机构建 APK 时使用。

### 5.2 android/gradle/wrapper/

Gradle Wrapper 固定版本目录。只有 Gradle 版本、下载地址或 wrapper 损坏时读取。

- `android/gradle/wrapper/gradle-wrapper.jar` - Gradle Wrapper 二进制启动器；一般不手改。
- `android/gradle/wrapper/gradle-wrapper.properties` - Gradle 发行版版本和下载地址配置；构建下载 Gradle 失败时读取。

### 5.3 android/app/

Android app 模块。包名、权限、图标、启动页和 Capacitor WebView 入口在这里。

- `android/app/.gitignore` - app 模块忽略规则；确认 app 构建产物提交范围时读取。
- `android/app/build.gradle` - Android app 模块构建配置；applicationId、versionCode、versionName、依赖、签名配置相关任务读取。
- `android/app/capacitor.build.gradle` - Capacitor 生成的 Android 构建片段；Capacitor Android 集成异常时读取。
- `android/app/proguard-rules.pro` - ProGuard/R8 混淆规则；release 构建混淆问题时读取。

### 5.4 android/app/src/main/

Android 主源码和资源入口。处理应用壳层行为时读取。

- `android/app/src/main/AndroidManifest.xml` - Android manifest；应用包权限、activity、label、theme、网络访问、导出行为配置。
- `android/app/src/main/java/cn/huickathon/syt/leavesflow/MainActivity.java` - Capacitor MainActivity；通常保持极简，只有原生插件或 activity 行为变化时读取。

### 5.5 android/app/src/main/res/

Android 资源目录。图标和启动页资源由脚本或 Capacitor 资源流程生成，通常不手工逐个改。

- `android/app/src/main/res/drawable-land-hdpi/splash.png` - 横屏 hdpi 启动页图片资源。
- `android/app/src/main/res/drawable-land-mdpi/splash.png` - 横屏 mdpi 启动页图片资源。
- `android/app/src/main/res/drawable-land-xhdpi/splash.png` - 横屏 xhdpi 启动页图片资源。
- `android/app/src/main/res/drawable-land-xxhdpi/splash.png` - 横屏 xxhdpi 启动页图片资源。
- `android/app/src/main/res/drawable-land-xxxhdpi/splash.png` - 横屏 xxxhdpi 启动页图片资源。
- `android/app/src/main/res/drawable-port-hdpi/splash.png` - 竖屏 hdpi 启动页图片资源。
- `android/app/src/main/res/drawable-port-mdpi/splash.png` - 竖屏 mdpi 启动页图片资源。
- `android/app/src/main/res/drawable-port-xhdpi/splash.png` - 竖屏 xhdpi 启动页图片资源。
- `android/app/src/main/res/drawable-port-xxhdpi/splash.png` - 竖屏 xxhdpi 启动页图片资源。
- `android/app/src/main/res/drawable-port-xxxhdpi/splash.png` - 竖屏 xxxhdpi 启动页图片资源。
- `android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` - Android v24+ 启动图标前景矢量资源。
- `android/app/src/main/res/drawable/ic_launcher_background.xml` - 启动图标背景资源。
- `android/app/src/main/res/drawable/splash.png` - 默认启动页图片资源。
- `android/app/src/main/res/layout/activity_main.xml` - MainActivity 布局；Capacitor 默认 WebView 容器相关。
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` - Android 自适应图标 XML。
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` - Android 自适应圆形图标 XML。
- `android/app/src/main/res/mipmap-hdpi/ic_launcher.png` - hdpi 普通 launcher 图标。
- `android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png` - hdpi launcher 前景图标。
- `android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png` - hdpi 圆形 launcher 图标。
- `android/app/src/main/res/mipmap-mdpi/ic_launcher.png` - mdpi 普通 launcher 图标。
- `android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png` - mdpi launcher 前景图标。
- `android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png` - mdpi 圆形 launcher 图标。
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png` - xhdpi 普通 launcher 图标。
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png` - xhdpi launcher 前景图标。
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png` - xhdpi 圆形 launcher 图标。
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png` - xxhdpi 普通 launcher 图标。
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png` - xxhdpi launcher 前景图标。
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png` - xxhdpi 圆形 launcher 图标。
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` - xxxhdpi 普通 launcher 图标。
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png` - xxxhdpi launcher 前景图标。
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png` - xxxhdpi 圆形 launcher 图标。
- `android/app/src/main/res/values/ic_launcher_background.xml` - launcher 背景色值资源。
- `android/app/src/main/res/values/strings.xml` - Android 字符串资源；应用显示名等文本配置。
- `android/app/src/main/res/values/styles.xml` - Android 样式资源；启动主题、状态栏等原生外观配置。
- `android/app/src/main/res/xml/file_paths.xml` - Android FileProvider 路径配置；文件分享/缓存访问相关。

### 5.6 android/app/src/test/

Android 测试占位目录。当前不是核心测试入口。

- `android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java` - Android 单元测试示例占位；通常无需读取。
- `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java` - Android instrumentation 测试示例占位；通常无需读取。

## 6. docs/

`docs/` 放置产品、技术、部署、调试和接口文档。AI 在动代码前应优先读相关技术文档，做功能扩展前应读需求/产品文档。

- `docs/ai-coding-project-index.md` - 当前文件；AI Coding 的分层项目导航索引。
- `docs/ai-relay-troubleshooting.md` - AI 中转稳定调用和排查备案；模型请求失败、超时、401/429/5xx、JSON 解析失败时读取。
- `docs/implementation-decisions.md` - MVP V1 实施决策记录；追溯技术选型、部署方式、AI/mock、移动端封装等决策时读取。
- `docs/LeavesFlow_竞品体验清单.md` - 竞品体验记录；产品分析、竞品能力拆解或市场研究任务才读取。
- `docs/LeavesFlow_竞品分类统计_境内可访问.md` - 竞品分类统计；基于竞品体验清单整理境内可访问情况和分类结果。
- `docs/leavesflow-v1.3-product-development-guide.md` - V1.3 产品开发与维护主文档；包含产品定位、架构、数据模型、API、前端、移动端、测试、维护 checklist。
- `docs/local-web-debugging-notes.md` - 本地 Web 调试记录；Vite dev、localhost/127.0.0.1、前端白屏或连接异常时读取。
- `docs/mobile-packaging-and-deployment-guide.md` - Android 封装与部署技术路线；包含 Capacitor 选择理由、构建命令、服务器部署、Nginx、HTTPS、APK 构建记录。
- `docs/openapi.yaml` - 当前 API OpenAPI 规格导出；接口对接、字段核对、客户端生成或外部联调时读取。

说明：早期根目录的 `LeavesFlow_MVP_V1_需求文档.md` 与 `LeavesFlow_MVP_V1_技术规格说明书.md` 已被 `docs/leavesflow-v1.3-product-development-guide.md` 覆盖，不再保留独立文件入口。

## 7. pic/

`pic/` 是项目图片素材目录。处理 App 图标、产品海报或宣传视觉资源时才需要读取。

- `pic/app_loge_demo.png` - 当前 App 图标源图；`scripts/generate_android_icons.ps1` 默认从这里生成 Android launcher icon。
- `pic/产品海报.png` - 产品视觉素材；非代码逻辑文件，只有处理宣传、展示或视觉资产时读取。

## 8. scripts/

`scripts/` 是本地辅助脚本目录。运行脚本前先读脚本说明和内容，避免误用环境或覆盖产物。

- `scripts/bugfix_ui_check.py` - UI bugfix 检查脚本；用于浏览器自动化或视觉/功能回归检查。
- `scripts/check_ai_relay.py` - AI 中转检查脚本；用于验证模型中转配置、连通性和响应格式。
- `scripts/generate_android_icons.ps1` - Android 图标生成脚本；默认从 `pic/app_loge_demo.png` 生成 mipmap/drawable 图标资源。
- `scripts/run_api_dev.cmd` - Windows cmd 后端开发启动脚本；需要用 cmd 启动 API 时读取/运行。
- `scripts/run_api_dev.ps1` - PowerShell 后端开发启动脚本；本地 API 开发常用入口。
- `scripts/v11_ui_check.py` - 旧版 V1.1 UI 检查脚本；追溯旧 UI 验证流程时读取。
- `scripts/web_smoke_test.py` - Web smoke test 脚本；前端基本流程自动化验证时读取。

## 9. config/

`config/` 是配置目录。真实配置可能包含密钥，不能随意读取、输出或提交。通常只看模板文件了解结构。

- `config/config.example.json` - 配置模板；包含 app、database、ai、cors、mcp、skills、admin 等配置结构。

重要提示：

- `config/config.json` 是本地/生产真实配置文件，通常被忽略，不应提交。
- 处理 AI key、数据库路径、后台密码时，只说明字段位置，不在聊天或文档中泄露真实值。

## 10. 生成目录与忽略目录

以下路径通常不作为源码阅读入口。AI 只有在构建、部署、排错明确需要时才进入，并且不能把其中的敏感内容或大体积生成物提交。

- `.git/` - Git 内部目录；不要手工读取或修改。
- `node_modules/` - npm 依赖目录；不要作为项目源码读取。
- `.npm-cache/` - npm 本地缓存；安装排错时可清理或改 cache，但不要索引内容。
- `.android-sdk/` - 本地 Android SDK；构建环境目录，不是项目源码。
- `.downloads/` - 下载缓存目录；不是项目源码。
- `.deploy/` - 部署临时目录；上线排查时谨慎查看，不作为源码依据。
- `.deploy-*.tar.gz`、`.deploy*.tar.gz` - 部署压缩包；构建/上传产物，不作为源码阅读入口。
- `artifacts/` - APK 等交付产物目录；例如 debug APK 输出，不应反向当作源码修改。
- `logs/` - 本地日志目录；排错时可读，不应提交。
- 后端 SQLite 数据库文件 - 可能包含用户数据，查看前先确认目的，优先使用只读方式。

## 11. 推荐 AI 阅读流程

为了节省 token，后续 AI Coding 建议按以下顺序读取：

1. 先读本文件的 `0. 快速定位`。
2. 只读目标任务对应的一级目录简介，例如 `apps/web/`、`services/api/` 或 `apps/admin/`。
3. 再读对应文件的一行简介，选择 1 到 5 个必要文件打开。
4. 如果涉及接口字段，同时读后端 `schemas.py` 和前端 `packages/shared-types/src/index.ts`。
5. 如果涉及数据库字段，同时读 `models.py`、`bootstrap.py`、相关技术文档。
6. 如果涉及部署或 APK，只读 `docs/mobile-packaging-and-deployment-guide.md`、`capacitor.config.ts`、必要的 Android 配置文件。
7. 完成代码修改后，如新增文件、迁移文件或改变职责，更新本索引。

## 12. 常见修改场景的最小阅读集

本节给出更细的“最小文件集”，用于避免 AI 一上来全仓库扫描。

### 11.1 修复用户端登录注册

简介：登录注册前端在 `apps/web`，后端入口在 `main.py`，类型字段在 shared types。

- `apps/web/src/App.tsx` - 登录/注册 UI、表单状态、提交逻辑。
- `apps/web/src/api.ts` - token 存储和 API base URL。
- `packages/api-client/src/index.ts` - auth register/login 请求封装。
- `services/api/src/leavesflow_api/main.py` - `/api/v1/auth/register` 和 `/api/v1/auth/login`。
- `services/api/src/leavesflow_api/schemas.py` - `RegisterRequest`、`LoginRequest`、`AuthResponse`。

### 11.2 修改路径历史和打卡内容展示

简介：历史路径由后端拼装完整目标、阶段、任务节点、check-in，再由用户端渲染。

- `apps/web/src/App.tsx` - `UserPanel`、`HistoryPage`、`HistoryDetailPanel`、`HistoryTaskNode`。
- `apps/web/src/styles.css` - 历史卡片、详情页、节点和打卡文本样式。
- `services/api/src/leavesflow_api/services.py` - `goal_history_items`、`plan_to_response`、check-in 输出。
- `services/api/src/leavesflow_api/schemas.py` - `GoalHistoryItem`、`GoalDetailResponse`、`TaskCheckInOut`。
- `packages/shared-types/src/index.ts` - 前端对应类型。

### 11.3 修改后台用户管理

简介：后台用户管理前端在 `apps/admin`，后端接口在 `admin.py`。

- `apps/admin/src/App.tsx` - 用户清单、搜索、编辑、删除 UI。
- `apps/admin/src/api.ts` - dashboard/search/update/delete 请求封装。
- `apps/admin/src/styles.css` - 后台表格、操作按钮、弹窗样式。
- `services/api/src/leavesflow_api/admin.py` - 后台用户查询、编辑、删除和统计接口。
- `services/api/src/leavesflow_api/models.py` - 用户表、删除日志和关联表。

### 11.4 修改 AI 模型调用或中转配置

简介：AI 请求由后端发起，前端只接收路径或技能结果。

- `services/api/src/leavesflow_api/ai.py` - OpenAI-compatible 请求和错误处理。
- `services/api/src/leavesflow_api/prompts.py` - 路径拆解和技能提取 prompt。
- `services/api/src/leavesflow_api/config.py` - AI 配置读取模型。
- `config/config.example.json` - AI 配置字段模板。
- `docs/ai-relay-troubleshooting.md` - 中转故障定位和验收方案。

### 11.5 修改数据表或迁移逻辑

简介：当前使用 SQLAlchemy + SQLite，迁移主要在启动 bootstrap 中做轻量处理。

- `services/api/src/leavesflow_api/models.py` - 表结构定义。
- `services/api/src/leavesflow_api/bootstrap.py` - 建表、轻量迁移、种子数据。
- `services/api/src/leavesflow_api/services.py` - 读写这些表的业务逻辑。
- `apps/admin/docs/database-viewing-guide.md` - 当前表结构说明和查看方式。
- `docs/leavesflow-v1.3-product-development-guide.md` - 数据模型产品级说明。

### 11.6 重新打包 Android APK

简介：APK 壳层来自 `android/`，业务页面来自 `apps/web` 的构建产物。

- `package.json` - `build:android` 和 `build:android:linux` 脚本。
- `capacitor.config.ts` - Capacitor appId、appName、webDir。
- `pic/app_loge_demo.png` - App 图标源图。
- `apps/web/src/api.ts` - Capacitor Native API base URL。
- `android/app/build.gradle` - Android app version 和 applicationId。
- `android/app/src/main/AndroidManifest.xml` - Android 权限和 Activity。
- `docs/mobile-packaging-and-deployment-guide.md` - 构建环境、命令、产物位置和部署记录。

### 11.7 更新部署到同域名和 /admin

简介：线上方案是前后端同服务器，用户端根路径，后台 `/admin`，API `/api/v1`。

- `docs/mobile-packaging-and-deployment-guide.md` - 线上部署拓扑、Nginx、HTTPS、服务路径。
- `apps/admin/docs/admin-technical-spec.md` - 后台 `/admin` 部署细节。
- `apps/admin/vite.config.ts` - 后台构建 base 路径。
- `apps/web/src/api.ts` - Web 生产环境 API base URL。
- `services/api/src/leavesflow_api/config.py` - CORS 和配置读取。

## 13. 文件职责边界

本节用于减少错误修改位置。

- 不要在 `android/` 中实现业务页面；业务页面应改 `apps/web/src/App.tsx`。
- 不要在 `apps/admin/` 中接入临时内存数据；后台应通过 `services/api/src/leavesflow_api/admin.py` 读取真实数据库。
- 不要把真实 API key 写入 `config/config.example.json`、README 或任何 tracked 文档。
- 不要直接修改 `docs/openapi.yaml` 作为接口实现；应先改 FastAPI 代码，再重新导出。
- 不要把 `artifacts/` 下 APK 当成源码；它只是构建产物。
- 不要在 shared types 中新增后端没有返回的字段；先改 `schemas.py` 和后端返回逻辑。
- 不要把新图片散放在根目录；图片素材统一放入 `pic/`。

# LeavesFlow AI 中转稳定调用与排查备案

版本日期：2026-05-17

本文用于备案 LeavesFlow V1.2 的 AI 中转调用方式、部署验收命令和故障排查路径。目标是：后续再遇到 `AI_UPSTREAM_ERROR`、`ConnectError`、超时、JSON schema 不合规等问题时，可以在目标服务器上快速定位，而不是依赖 Codex 本机网络或浏览器环境。

## 1. 当前结论

本轮问题现象：

- 前端调用 `POST /api/v1/goals/{goalId}/plan:generate`。
- 后端返回 `502 AI_UPSTREAM_ERROR`。
- 错误信息为 `AI 中转服务请求失败或超时：ConnectError`。

定位结论：

- `config/config.json` 中已配置 `openai_compatible.base_url`、`api_key` 和 `chat_model`。
- 在 Codex 默认沙箱网络里，后端进程访问外部 AI 中转可能被限制，表现为 `ConnectError`。
- 这类错误不能直接等同于“API key 错误”或“模型不可用”。
- 部署验收必须在真正运行 LeavesFlow API 的目标服务器上执行，而不是用开发者本机或 Codex 沙箱结果替代。

## 2. 稳定调用方案

LeavesFlow 后端只采用服务端调用模型，不从浏览器直连模型服务：

```text
Web/PWA
-> LeavesFlow FastAPI /api/v1
-> server-side AIClient
-> OpenAI-compatible HTTPS endpoint /chat/completions
```

稳定方案要求：

- `openai_compatible.base_url` 必须是目标服务器可访问的 HTTPS 地址。
- `openai_compatible.api_key` 必须只保存在服务器配置中，不提交到 Git。
- `openai_compatible.chat_model` 必须是该中转服务真实支持的模型。
- 中转服务必须兼容 OpenAI Chat Completions：`POST {base_url}/chat/completions`。
- 中转服务必须支持 JSON object 输出，或至少能稳定按 prompt 返回 JSON object。
- 部署前必须在目标服务器运行 `scripts/check_ai_relay.py` 完成验收。

推荐优先级：

1. 优先使用官方 OpenAI API 或团队自有稳定中转域名。
2. 如果服务器所在网络无法访问官方 OpenAI API，应使用部署环境可访问的企业中转服务，而不是依赖开发机代理。
3. 不要把 Codex 本机的“放开网络权限”作为生产方案；它只能用于临时定位。

## 3. 配置标准

配置文件：

```text
config/config.json
```

关键字段：

```json
{
  "openai_compatible": {
    "base_url": "https://your-openai-compatible-relay/v1",
    "api_key": "server-side-secret",
    "chat_model": "model-supported-by-your-relay",
    "timeout_seconds": 120,
    "max_retries": 2
  }
}
```

配置注意事项：

- `base_url` 填到 `/v1` 这一层，不要包含 `/chat/completions`。
- `base_url` 不要依赖浏览器代理、本机代理或 Codex 特权网络。
- `api_key` 不得提交；`config/config.json` 已在 `.gitignore` 中。
- `chat_model` 以中转服务后台实际支持为准。
- 如果中转服务对长输出较慢，`timeout_seconds` 建议保持 `120` 或更高。
- 如果中转服务偶发 429 或 5xx，`max_retries` 建议保持 `2`，不要无限重试。

## 4. 部署前验收

在目标服务器仓库根目录执行：

```powershell
python scripts/check_ai_relay.py --config config/config.json
```

Linux/macOS 也使用同一命令：

```bash
python scripts/check_ai_relay.py --config config/config.json
```

预期输出形态：

```text
LeavesFlow AI relay check
config: ...
base_url: https://.../v1
model: ...
api_key: sk-...xxxx
timeout_seconds: 120
max_retries: 2

[OK] dns: ...
[OK] tcp: ... connected in ...ms
[OK] chat_completions_json: HTTP 200 in ...ms; JSON mode works
```

如果还要验证 LeavesFlow 真实任务拆解 schema：

```bash
python scripts/check_ai_relay.py --config config/config.json --full-plan
```

预期额外输出：

```text
[OK] leavesflow_schema: title='...'; stages=...; tasks=...
```

`--full-plan` 会产生一次真实模型调用，费用和耗时都高于最小连通性检查。

## 5. 故障分类

### 5.1 `dns` 失败

表现：

```text
[FAIL] dns: ...
```

常见原因：

- 服务器 DNS 无法解析中转域名。
- 域名写错。
- 服务器网络出口受限。

处理：

- 在服务器上检查 DNS：
  ```bash
  nslookup your-relay-host
  ```
- 确认 `base_url` 域名拼写。
- 联系服务器网络或运维放通 DNS。

### 5.2 `tcp` 失败

表现：

```text
[FAIL] tcp: your-relay-host:443 ...
```

常见原因：

- 服务器不能访问目标 443 端口。
- 防火墙、安全组、公司网络策略限制出网。
- 中转服务宕机。

处理：

- 检查服务器安全组或防火墙是否允许出站 HTTPS。
- 确认中转域名是否需要白名单。
- 从服务器执行：
  ```bash
  curl -I https://your-relay-host/v1
  ```

### 5.3 HTTP 401

表现：

```text
[FAIL] chat_completions_json: HTTP 401 ...
```

常见原因：

- `api_key` 错误。
- key 已过期或被禁用。
- 使用了错误供应商的 key。

处理：

- 在中转服务后台重新生成 key。
- 确认 key 和 `base_url` 属于同一个供应商。
- 不要把 OpenAI 官方 key 填到不兼容的第三方中转地址，反之亦然。

### 5.4 HTTP 404

表现：

```text
[FAIL] chat_completions_json: HTTP 404 ...
```

常见原因：

- `base_url` 多写或少写了路径。
- 把 `/chat/completions` 也写进了 `base_url`。
- 中转服务不支持 Chat Completions API。

处理：

- `base_url` 应类似：
  ```text
  https://api.openai.com/v1
  https://your-relay.example.com/v1
  ```
- 不应写成：
  ```text
  https://your-relay.example.com/v1/chat/completions
  ```

### 5.5 HTTP 429

表现：

```text
[FAIL] chat_completions_json: HTTP 429 ...
```

常见原因：

- 模型服务限流。
- key 配额不足。
- 并发过高。

处理：

- 降低并发。
- 更换更高配额 key 或模型。
- 保留后端 `max_retries=2`，避免瞬时失败直接暴露给用户。

### 5.6 HTTP 5xx

表现：

```text
[FAIL] chat_completions_json: HTTP 500/502/503 ...
```

常见原因：

- 中转服务内部错误。
- 上游模型服务故障。
- 中转服务不支持当前 `chat_model`。

处理：

- 切换到中转确认支持的模型。
- 检查中转服务状态页或后台日志。
- 如果是自有中转，查看它访问上游模型的错误日志。

### 5.7 HTTP 200 但 JSON 解析失败

表现：

```text
[FAIL] chat_completions_json: HTTP 200 but invalid JSON response ...
```

常见原因：

- 中转服务忽略 `response_format`。
- 模型没有遵守 JSON-only 输出。
- 中转服务返回了非 OpenAI Chat Completions 格式。

处理：

- 确认中转兼容 Chat Completions 返回结构：
  ```json
  {
    "choices": [
      {
        "message": {
          "content": "{\"ok\": true}"
        }
      }
    ]
  }
  ```
- 如果仅最小检查失败，不要进入业务测试。
- 如果最小检查通过但 `--full-plan` 失败，再检查 Prompt、schema 和模型输出长度。

### 5.8 `leavesflow_schema` 失败

表现：

```text
[FAIL] leavesflow_schema: AI_INVALID_SCHEMA ...
```

常见原因：

- 模型返回 JSON，但字段不符合 LeavesFlow schema。
- `tools` 或 `resources` 缺少真实 URL。
- URL 使用了 `example.com` 占位链接，被后端拒绝。
- 返回任务为空，或 `path`、`completionCriteria` 为空。

处理：

- 优先检查 `services/api/src/leavesflow_api/prompts.py`。
- 确认 prompt 明确要求：
  - 只输出 JSON object。
  - 每个任务有真实工具 URL。
  - 每个任务有真实资源 URL。
  - 禁止 `example.com`。
- 使用 `scripts/check_ai_relay.py --full-plan` 在服务器复测。

## 6. 生产部署建议

部署前 checklist：

- 在目标服务器创建 `config/config.json`。
- 确认服务器能访问 `openai_compatible.base_url`。
- 执行：
  ```bash
  python scripts/check_ai_relay.py --config config/config.json
  ```
- 再执行：
  ```bash
  python scripts/check_ai_relay.py --config config/config.json --full-plan
  ```
- 启动 FastAPI。
- 使用前端真实生成一次任务路径。

生产运行建议：

- 不在前端暴露 API key。
- 不启用 Mock AI fallback。
- 不在错误响应中泄露 key、完整上游响应或服务器敏感信息。
- 对 `AI_UPSTREAM_ERROR` 记录 request id、状态码、错误类型、耗时。
- 如果部署环境在出网受限网络中，优先把中转服务部署在同区域或同网络可访问的位置。

## 7. 本地开发注意事项

Codex 或其他开发沙箱可能默认限制外部网络。此时：

- 后端在沙箱里启动可能无法访问外部 AI 中转。
- 看到 `ConnectError` 时，先不要修改业务代码。
- 应先在目标服务器或真实运行环境执行 `scripts/check_ai_relay.py`。
- 只有目标服务器也失败，才按本文故障分类继续排查。

## 8. 当前推荐落地方式

当前 LeavesFlow 后端已经是 OpenAI-compatible Chat Completions 调用方式，因此稳定落地的关键不在浏览器，也不在 Codex 本机网络，而在目标服务器：

1. 选择一个目标服务器可访问的 OpenAI-compatible endpoint。
2. 在服务器写入 `config/config.json`。
3. 用 `scripts/check_ai_relay.py` 验收最小 JSON 调用。
4. 用 `--full-plan` 验收 LeavesFlow schema。
5. 通过后再启动正式后端服务。

只要目标服务器的 DNS、TCP、HTTPS、key、模型和 JSON 输出检查全部通过，LeavesFlow 的 `AIClient` 就可以稳定调用模型；否则以前端自动化测试看到的 `AI_UPSTREAM_ERROR` 只是结果，不是根因。

## 9. 结构化输出依据

当前 LeavesFlow 为了兼容不同 OpenAI-compatible 中转，使用的是：

```json
{
  "response_format": {
    "type": "json_object"
  }
}
```

同时在应用层使用 Pydantic schema 做二次校验。这个策略的原因是：

- JSON mode 可以要求模型输出合法 JSON。
- JSON mode 不保证完全匹配业务 schema，因此后端必须继续做 Pydantic 校验和重试。
- 如果未来使用的中转服务稳定支持 `json_schema`，可以把 `response_format` 升级为 Structured Outputs，进一步降低 `AI_INVALID_SCHEMA` 概率。

官方参考：

- OpenAI Chat Completions API：`https://developers.openai.com/api/reference/resources/chat`
- OpenAI Structured Outputs：`https://developers.openai.com/api/docs/guides/structured-outputs`

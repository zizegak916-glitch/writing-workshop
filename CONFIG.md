# 配置说明

> 现行产品配置，更新于 2026-08-22（UTC）。

## 配置位置与迁移

加载优先级从低到高：

1. `~/.writing-workshop/config.json`
2. 当前目录 `./.writing-workshop/config.json`
3. `--config path/to/config.json`

如果现行配置不存在，程序可以读取同位置的旧 `.ainovel/config.json` 并提示迁移；新保存只写入 `.writing-workshop`，不会继续污染旧目录。Web 本地服务控制台默认保存到 `~/.writing-workshop/config.json`。

## Pages 浏览器 BYOK

Pages 没有同源 Go API。进入“设置 → API”后填写协议、Base URL、模型、Key、鉴权和超时，先测试再保存。设置保存在当前 origin 的 `localStorage`，不会进入 GitHub 仓库或构建产物。

| 协议 | 只填域名时补全 | 默认鉴权 |
|---|---|---|
| OpenAI Chat Completions | `/v1/chat/completions` | Bearer |
| OpenAI Responses | `/v1/responses` | Bearer |
| Anthropic Messages | `/v1/messages` | `x-api-key` |
| Ollama | `/api/chat` | 无鉴权 |

Pages 保存设置不会 POST 静态 `/api/config`，因此保存动作不应返回 405。直连失败时检查：

1. 模型 ID 与完整端点是否正确；
2. 目标服务是否允许当前 Pages/自定义域名 CORS；
3. 是否允许 `Authorization`、`Content-Type` 和自定义头；
4. HTTPS 页面是否被浏览器阻止访问 HTTP 本地服务；这类接口可使用下文的受限 HTTPS 兼容桥；
5. 协议与鉴权是否误选。

`?api_mode=browser` / `?api_mode=backend` 可显式覆盖运行时探测。浏览器 Key 不是加密保存，不要在公共设备使用。

## Pages HTTP 兼容桥

HTTPS Pages 不能直接请求 `http://` API。需要保留 HTTP 上游时，可把同一 Go 服务部署在自己的 HTTPS 域名后，并只开放固定目标：

    WRITING_WORKSHOP_HTTP_BRIDGE_TARGETS={"cpa":"http://192.3.110.199:8317"}
    WRITING_WORKSHOP_HTTP_BRIDGE_TOKEN=replace-with-a-random-token-at-least-24-characters
    WRITING_WORKSHOP_ALLOWED_ORIGINS=https://zizegak916-glitch.github.io

| 变量 | 默认 | 作用 |
|---|---:|---|
| `WRITING_WORKSHOP_HTTP_BRIDGE_TARGETS` | 未启用 | 目标别名到固定 HTTP/HTTPS 根地址的 JSON 对象 |
| `WRITING_WORKSHOP_HTTP_BRIDGE_TOKEN` | 未启用 | Pages 访问桥的独立令牌，至少 24 个字符 |
| `WRITING_WORKSHOP_HTTP_BRIDGE_MAX_BYTES` | 16777216 | 单次请求正文上限 |
| `WRITING_WORKSHOP_HTTP_BRIDGE_MAX_CONCURRENT` | 4 | 同时转发的请求数量 |
| `WRITING_WORKSHOP_HTTP_BRIDGE_TIMEOUT_MS` | 600000 | 包含长响应流在内的完整请求超时 |

在 Pages 中，Base URL 继续填写真实 HTTP 上游；“HTTPS 桥地址”填写 `https://你的域名/api/http-bridge/目标别名`，再填写桥令牌。桥令牌与模型 API Key 是两个不同凭据。完整的 Caddy、systemd 和安全说明见 [`docs/HTTP_BRIDGE.md`](docs/HTTP_BRIDGE.md)。

## 自部署配置

示例：

```json
{
  "provider": "openrouter",
  "model": "anthropic/claude-sonnet-4",
  "type": "openai",
  "protocol": "openai-chat",
  "auth_mode": "bearer",
  "base_url": "https://openrouter.ai/api/v1",
  "api_key": "REPLACE_ME",
  "request_timeout_ms": 120000,
  "context_window": 131072,
  "extra": {"headers": {}},
  "extra_body": {"temperature": 0.7}
}
```

`protocol`：`auto`、`openai-chat`、`openai-responses`、`anthropic`、`ollama`。

`auth_mode`：`auto`、`bearer`、`x-api-key`、`none`。

`request_timeout_ms` 范围 5–600 秒。未知模型不会假定固定上下文窗口；需要百分比预算时显式填写 `context_window`。`GET /api/config` 会隐藏 Key 和 `extra.headers`。

环境变量优先级：

1. `WRITING_WORKSHOP_<PROVIDER>_API_KEY`
2. `<PROVIDER>_API_KEY`
3. 旧兼容变量 `AINOVEL_<PROVIDER>_API_KEY`

例如：

```bash
export WRITING_WORKSHOP_OPENROUTER_API_KEY=sk-or-v1-...
writing-workshop serve --port 8080
```

Ollama 可留空 Key，并使用 `protocol: ollama`、`auth_mode: none`。

## 数据位置

| 路径 | 内容 |
|---|---|
| `.writing-workshop/capabilities.json` | 用户 capability manifest |
| `.writing-workshop/skill-packs.json` | 用户技能包 |
| `.writing-workshop/categories.json` | 后端自定义分类 |
| `.writing-workshop/rules/web.rules.md` | 后台编辑的项目规则 |
| `.writing-workshop/corpus/index.json` | 授权语料哈希、聚合指标与候选，不含原文 |

浏览器项目、章节、大纲、人物、笔记、记忆和 AI 历史位于当前站点 IndexedDB；Prompt Skill 覆盖值、分类和界面配置位于当前 origin 的 localStorage。浏览器数据与 Go 后端数据不会静默双向同步。

项目 v6 备份可携带浏览器项目数据、AI 历史、分类、Prompt Skill 覆盖值和语料统计档案。迁移域名、换浏览器或清除站点数据前先导出备份。

## Web 启动与公网边界

```bash
writing-workshop serve --demo --port 8080
```

- 工作台：`/app.html`
- 本地服务控制台：`/admin.html`
- 健康检查：`/api/health`
- 默认监听：`127.0.0.1`

确实需要分离前后端时，显式设置允许来源；不会使用通配符 CORS：

```bash
export WRITING_WORKSHOP_ALLOWED_ORIGINS=https://writer.example,https://preview.example
writing-workshop serve --host 0.0.0.0 --port 8080
```

公网部署需自行增加 TLS、登录鉴权、访问限制和反向代理请求大小限制。

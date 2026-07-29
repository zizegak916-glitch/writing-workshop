# 配置说明

> 状态：现行产品配置，更新于 2026-07-28（UTC+8）。`.ainovel` 仍是继承引擎兼容目录名，不代表产品仍叫 ainovel-cli。

本页说明 Writing Workshop 的模型、密钥与监听地址配置。底层 Go 引擎源自 `ainovel-cli`，但本仓库发布的可执行文件名为 `writing-workshop`。

## 配置位置

加载优先级从低到高：

1. `~/.ainovel/config.json`
2. 当前目录 `./.ainovel/config.json`
3. 命令行 `--config path/to/config.json`

Web 管理后台保存配置时写入 `~/.ainovel/config.json`。

主应用默认使用本地游客模式，不要求设置密码。配置和密钥由本地配置文件、环境变量或你部署的数据管理服务负责；当前本地模式不提供账号密码体系。

自部署版保存配置后只在浏览器保留 Provider、Model 和“由后端托管”的状态，真实 Key 写入后端配置。GitHub Pages 版没有 `/api/config` 服务，因此使用浏览器 BYOK：用户主动填写的 Provider、Model、Base URL、Key 与网络适配选项写入当前 Pages origin 的 `ww_api`，并由浏览器直接请求目标接口。多模型槽位仍只保存 Provider / Model，不复制主配置的 Key。

## GitHub Pages 浏览器 BYOK

1. 打开 Pages 工作台，进入“设置 → API”或 API 设置弹窗。
2. 选择已有服务商；使用中转、自建或本地接口时可选择“自定义”。任何服务商都可以用 Base URL 覆盖默认地址。
3. 填写模型 ID 和 Base URL。Base URL 可填单纯域名、带厂商前缀的 API 根路径或完整端点。
4. 常见 OpenAI 兼容接口保持“自动识别”。其他接口展开“高级网络适配”，选择 OpenAI Responses、Anthropic Messages 或 Ollama `/api/chat`。
5. 鉴权默认自动：OpenAI 兼容接口使用 Bearer，Anthropic 使用 `x-api-key`。Ollama、局域网代理等无密钥服务选择“无鉴权”，API Key 可以留空。
6. 中转服务需要额外请求头时填写 JSON；连接较慢时调整 5–600 秒超时。点击“测试”，成功后保存。

Pages 不会再对静态 `/api/config` 发起 POST，因此不会因配置保存本身返回 405。浏览器直连仍受目标服务的 CORS 策略约束：对方必须允许 `https://zizegak916-glitch.github.io` 发起请求并允许 `Authorization` / `Content-Type` 等必要请求头。

地址补全规则：

| 协议 | 只填域名时补全 | 可直接填写 |
|---|---|---|
| OpenAI Chat Completions | `/v1/chat/completions` | 任意以 `/chat/completions` 结尾的地址 |
| OpenAI Responses | `/v1/responses` | 任意以 `/responses` 结尾的地址 |
| Anthropic Messages | `/v1/messages` | 任意以 `/messages` 结尾的地址 |
| Ollama | `/api/chat` | 以 `/api/chat` 结尾的完整地址 |

浏览器流式模式会解析 OpenAI/Gemini 兼容 SSE、Responses 事件、Anthropic SSE 与 Ollama NDJSON。接口返回普通 JSON 时会自动按完整响应读取。

`localStorage` 不是加密保险箱。不要在公共设备使用浏览器 BYOK；清除当前站点数据会同时删除配置。长期使用或服务商不允许浏览器跨域时，改用下方的自部署后端模式。

自定义请求头可能本身包含凭据。Pages 模式会把它们和 Key 一样保存在当前浏览器；自部署模式写入后端配置，但 `GET /api/config` 会移除 `extra.headers`，不会把请求头内容回传到管理页面。

## 工作目录中的产品数据

| 路径 | 内容 | 说明 |
|---|---|---|
| `.ainovel/capabilities.json` | 用户能力 manifest | 内置能力不写入此文件 |
| `.ainovel/skill-packs.json` | 用户技能包 | `skill_ids` 保存前会验证和去重 |
| `.ainovel/categories.json` | 后端自定义分类 | 与浏览器本地项目分类分开保存 |
| `.ainovel/rules/web.rules.md` | 后台编辑的项目规则 | 参与规则合并 |

工作台中的项目自定义分类保存在当前站点的 `localStorage`，项目与分类关联保存在 IndexedDB 的 project 记录。项目、章节、大纲、人物、项目笔记与写作记忆也保存在 IndexedDB。浏览器 Prompt Skill 覆盖值单独保存在 `localStorage` 键 `ww_prompt_skills_v1`。这些数据不会自动与后端分类、项目或 capability 文件互相覆盖；项目 v4 备份会带上笔记、分类、记忆和 Prompt Skill 覆盖值。

浏览器存储按来源域名隔离：`github.io`、自定义域名、`127.0.0.1` 与 `localhost` 彼此不是同一份数据。迁移域名、清除站点数据或换浏览器前，先在项目操作台导出 v4 项目包，或在 Prompt Skill 管理中单独导出提示词备份。连接 Go 后端不会自动合并这两套数据；需要后端内容时，应在项目操作台显式导入为新的浏览器项目。

## 最小配置

```json
{
  "provider": "openrouter",
  "model": "anthropic/claude-sonnet-4",
  "providers": {
    "openrouter": {
      "type": "openai",
      "api_key": "sk-or-v1-...",
      "base_url": "https://openrouter.ai/api/v1",
      "models": ["anthropic/claude-sonnet-4"]
    }
  },
  "style": "default"
}
```

## 无密钥 demo

首次运行可不创建配置文件：

```bash
writing-workshop serve --demo --port 8080
```

demo 模式使用一个不会主动联网的本地占位模型配置。`builtin-echo` 与 `builtin-outline` 可直接运行；AI 生成类任务在配置真实模型前会明确失败，不会伪造结果。管理后台保存真实配置后，下一次启动会自动加载该配置。

## 环境变量

API key 可不写入配置文件，改用环境变量：

```bash
export AINOVEL_OPENROUTER_API_KEY=sk-or-v1-...
export AINOVEL_OPENAI_API_KEY=sk-...
```

也支持 `<PROVIDER>_API_KEY`，例如 `OPENROUTER_API_KEY`。配置校验和 `/api/ai` 调用都会读取这些变量。

## 本地模型

Ollama/OpenAI 兼容本地服务可不配置 API key：

```json
{
  "provider": "ollama",
  "model": "qwen3:14b",
  "providers": {
    "ollama": {
      "type": "openai",
      "base_url": "http://localhost:11434/v1",
      "models": ["qwen3:14b"]
    }
  }
}
```

Pages 直接连接 Ollama 时，把协议选为“Ollama `/api/chat`”、鉴权选为“无鉴权”，Base URL 可填 `http://127.0.0.1:11434`。浏览器页面为 HTTPS 时，浏览器可能阻止访问 HTTP 混合内容；这种情况应使用本地打开的工作台或通过 HTTPS 反向代理访问 Ollama。

## Web 启动

```bash
writing-workshop serve --demo --port 8080
```

- 写作工坊：`/app.html`
- 管理后台：`/admin.html`
- 健康检查：`/api/health`
- 所有静态资源由 Go embed 提供。
- 规则包保存到当前项目输出目录 `.ainovel/rules/web.rules.md`。

服务默认只监听 `127.0.0.1`。Docker 或受控局域网部署时使用 `--host 0.0.0.0`；不要在没有鉴权和 TLS 的情况下直接暴露到公网。

前端与 API 默认同源。确实需要分离部署时，显式列出允许的来源（逗号分隔），服务不会使用通配符 CORS：

```bash
export WRITING_WORKSHOP_ALLOWED_ORIGINS=https://writer.example,https://preview.example
writing-workshop serve --host 0.0.0.0 --port 8080
```

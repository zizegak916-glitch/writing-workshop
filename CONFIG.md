# 配置说明

本页说明 Writing Workshop 的模型、密钥与监听地址配置。底层 Go 引擎源自 `ainovel-cli`，但本仓库发布的可执行文件名为 `writing-workshop`。

## 配置位置

加载优先级从低到高：

1. `~/.ainovel/config.json`
2. 当前目录 `./.ainovel/config.json`
3. 命令行 `--config path/to/config.json`

Web 管理后台保存配置时写入 `~/.ainovel/config.json`。

主应用默认使用本地游客模式，不要求设置密码。配置和密钥由本地配置文件、环境变量或你部署的数据管理服务负责；当前本地模式不提供账号密码体系。

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

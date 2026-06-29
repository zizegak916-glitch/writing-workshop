# 配置说明

ainovel-cli 使用本地配置文件和环境变量管理模型与密钥，不需要额外后端服务。

## 配置位置

加载优先级从低到高：

1. `~/.ainovel/config.json`
2. 当前目录 `./.ainovel/config.json`
3. 命令行 `--config path/to/config.json`

Web 管理后台保存配置时写入 `~/.ainovel/config.json`。

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
./ainovel-cli serve --port 8080
```

- 写作工坊：`/app.html`
- 管理后台：`/admin`
- 所有静态资源由 Go embed 提供。
- 规则包保存到当前项目输出目录 `.ainovel/rules/web.rules.md`。

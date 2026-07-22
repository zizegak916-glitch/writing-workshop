# 配置说明

> 状态：现行产品配置，更新于 2026-07-22。`.ainovel` 仍是继承引擎兼容目录名，不代表产品仍叫 ainovel-cli。

本页说明 Writing Workshop 的模型、密钥与监听地址配置。底层 Go 引擎源自 `ainovel-cli`，但本仓库发布的可执行文件名为 `writing-workshop`。

## 配置位置

加载优先级从低到高：

1. `~/.ainovel/config.json`
2. 当前目录 `./.ainovel/config.json`
3. 命令行 `--config path/to/config.json`

Web 管理后台保存配置时写入 `~/.ainovel/config.json`。

主应用默认使用本地游客模式，不要求设置密码。配置和密钥由本地配置文件、环境变量或你部署的数据管理服务负责；当前本地模式不提供账号密码体系。

## 工作目录中的产品数据

| 路径 | 内容 | 说明 |
|---|---|---|
| `.ainovel/capabilities.json` | 用户能力 manifest | 内置能力不写入此文件 |
| `.ainovel/skill-packs.json` | 用户技能包 | `skill_ids` 保存前会验证和去重 |
| `.ainovel/categories.json` | 后端自定义分类 | 与浏览器本地项目分类分开保存 |
| `.ainovel/rules/web.rules.md` | 后台编辑的项目规则 | 参与规则合并 |

工作台中的项目自定义分类保存在当前站点的 `localStorage`，项目与分类关联保存在 IndexedDB 的 project 记录。它们不会自动与后端分类文件互相覆盖；导出项目包会带上项目的 `category_ids`。

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

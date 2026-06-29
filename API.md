# ainovel-cli Web API

所有端点由 `./ainovel-cli serve --port 8080` 提供，默认监听 `127.0.0.1`。请求和响应均为 JSON，静态前端与管理后台使用同一组 API。

## AI

`POST /api/ai`

调用当前配置的真实 LLM provider。请求支持 OpenAI 风格 `messages`，也支持简化 `message`。

```json
{
  "provider": "openrouter",
  "model": "anthropic/claude-sonnet-4",
  "messages": [{"role": "user", "content": "写一段开场"}]
}
```

响应包含 `choices[0].message.content`、`content[0].text` 和 `usage`，兼容写作工坊前端。

## 配置

`GET /api/config`

返回脱敏后的运行配置、配置文件路径和环境变量命名提示。

`POST /api/config` / `PUT /api/config`

保存 provider、model、base_url、api_key 等配置到本地 `~/.ainovel/config.json`。

```json
{
  "provider": "openrouter",
  "model": "anthropic/claude-sonnet-4",
  "type": "openai",
  "base_url": "https://openrouter.ai/api/v1",
  "api_key": "sk-or-v1-..."
}
```

## 项目

`GET /api/projects`

读取当前本地 ainovel 输出目录中的项目元数据。

`POST /api/projects` / `PUT /api/projects`

创建或更新当前项目名称、前提和总章节数。

`DELETE /api/projects`

删除当前输出目录中的项目文件并重新初始化目录结构。

## 章节

`GET /api/chapters`

列出 `chapters/` 和 `drafts/` 中已有章节。

`GET /api/chapters?chapter=1`

读取指定章节，优先返回终稿 `chapters/01.md`，否则返回草稿 `drafts/01.draft.md`。

`POST /api/chapters` / `PUT /api/chapters?chapter=1`

保存章节。`final=true` 写入终稿，默认写入草稿。

`DELETE /api/chapters?chapter=1`

删除指定章节的草稿和终稿。

## 角色

`GET /api/characters`

读取 `characters.json`。

`POST /api/characters`

新增角色。

`PUT /api/characters?name=角色名`

按角色名更新；未找到则追加。

`DELETE /api/characters?name=角色名`

删除角色。

## 规则

`GET /api/rules`

返回合并后的结构化规则、偏好正文、冲突、来源、Web 自定义规则和预设规则包。

`POST /api/rules` / `PUT /api/rules`

保存 Web 规则到当前项目 `.ainovel/rules/web.rules.md`。可直接传 `raw`，也可传结构化字段。

```json
{
  "raw": "---\nchapter_words: 2500-6000\n---\n# 风格\n- 对话避免解释设定\n"
}
```

`DELETE /api/rules`

删除 Web 自定义规则。

## 其他

- `GET /api/dashboard`：运行快照、章节、规则摘要。
- `GET /api/agents/status`：多代理运行状态。
- `GET /api/directives` / `POST /api/directives` / `DELETE /api/directives?index=0`：长效创作要求。
- `POST /api/style/check`：按当前规则检查章节文本。
- `GET /api/events`：SSE 事件流。
- `POST /api/start`、`POST /api/resume`、`POST /api/abort`：启动、恢复和中止创作。

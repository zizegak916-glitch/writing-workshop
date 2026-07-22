# AI写作工坊后端 API 契约

写作工坊前端通过 `/api/` 与后端通信。`ainovel-cli` 只是当前仓库保留的一个后端适配示例；其他 GitHub 开源项目、skill 或自定义后端也可以实现同一组契约。

请求和响应默认使用 JSON。长任务应优先支持 SSE 或分块文本回传，并提供取消能力，让前端可以随时打断。

## 能力来源

后端可以保存和暴露多个能力来源：

- GitHub 开源项目：包含仓库 URL、版本或 commit、许可证和适配入口。
- Skill / 能力包：包含 manifest、入口、输入输出 schema、权限边界和流式/取消支持声明。
- 自定义规则包：面向写作偏好、风格、导入、规划、改写等通用任务。

前端执行任务时应传递选中的 `backend_id`、`skill_ids`、当前项目上下文和用户参数。后端负责校验能力来源并执行。

## 通用执行

当前后端已实现：

- `GET /api/capabilities`：列出可用后端项目、skill、规则包和来源状态。
- `POST /api/capabilities`：保存 GitHub 链接、manifest 或本地能力文件。
- `DELETE /api/capabilities?id=...`：删除用户保存的能力。
- `POST /api/run`：执行选中的后端项目或多个 skill。
- `POST /api/abort`：取消当前长任务。

能力保存到当前工作目录的 `.ainovel/capabilities.json`。默认内置能力：

- `builtin-echo`
- `builtin-outline`
- `builtin-rewrite`
- `ainovel-cli`

默认内置能力带 `read_only=true`，不能删除；用户保存的能力可以通过再次 `POST /api/capabilities` 覆盖更新。`enabled=false` 的能力会保留在列表中，但不能被 `/api/run` 执行。删除内置能力、执行停用能力或引用不存在的能力会返回 `400`。

`POST /api/capabilities` 最小请求：

```json
{
  "name": "通用润色",
  "type": "skill",
  "version": "1.0.0",
  "source": "https://github.com/example/writing-skill",
  "license": "MIT",
  "description": "保留事实与人物动机的通用润色",
  "instructions": "只优化表达和节奏，不改变事件顺序",
  "steps": ["读取本次上下文", "标出不可改变的信息", "生成候选"],
  "permissions": ["读取本次显式提交的上下文", "不自动写入正文"],
  "entry": "skill.json",
  "output": "text",
  "supports_stream": true,
  "supports_abort": true,
  "enabled": true
}
```

`POST /api/run` 请求示例：

```json
{
  "backend_id": "ainovel-cli",
  "skill_ids": ["outline-planner", "style-rewriter"],
  "task": "rewrite",
  "context": {
    "project_id": "current",
    "chapter_id": "chapter-3",
    "selection": "需要改写的文本"
  },
  "params": {
    "stream": true
  }
}
```

普通响应会返回 `run_id`、`task`、`backend_id`、`skill_ids`、`capabilities`、`output` 和 `content`。传 `params.stream=true` 或请求头 `Accept: text/event-stream` 时返回 SSE，事件包括 `start`、`delta`、`done`、`error`、`aborted`。

当前 `/api/run` 已支持内置 `echo`、`outline`、`rewrite`、`ai/generate` 任务。`ai/generate` 和 `rewrite` 的 AI 模式会调用当前配置的 LLM provider；未配置 provider 时，`rewrite` 会返回本地链路验证结果。请求显式选择的 skill/prompt 会把其 `instructions`（或可见 `steps`）组合到本次模型输入中；后端和项目类型只负责执行路由，不会被当成提示词。保存第三方 GitHub 项目或 skill manifest 只负责登记和校验，不会直接执行任意仓库代码。

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

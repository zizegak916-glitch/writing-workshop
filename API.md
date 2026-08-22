# Writing Workshop 后端 API 契约

> 状态：现行产品接口，更新于 2026-08-22（UTC）。原生引擎说明见 `docs/NATIVE_ENGINE.md`，历史迁移见 `docs/UPSTREAM_ENGINE.md`；变更证据见 `docs/UPDATE_TIMELINE.md`。

写作工坊前端通过同源 `/api/` 与本地或自部署后端通信。当前后端由仓库内 `internal/engine` 与 `internal/web` 实现；其他 Skill 或自定义前端也可以实现同一组能力契约。

## 浏览器 Prompt Skill 不属于后端 API

润色、续写、人物、校对、标题、实时灵感等 32 个功能使用浏览器 Prompt Skill。默认文本来自 `web/static/js/prompt-skills.js`，用户覆盖值保存在当前域名的 `localStorage`；点击功能后，前端在调用 `/api/ai` 前组装提示词。它们不通过 `/api/capabilities` CRUD，也不会写入 `.writing-workshop/capabilities.json`。

项目导出格式 v6 可包含：

```json
{
  "version": 6,
  "project": {},
  "outlines": [],
  "characters": [],
  "chapters": [],
  "notes": [],
  "memories": [],
  "ai_history": [
    {
      "type": "candidate",
      "project_id": 1,
      "active_type": "chapter",
      "active_id": 12,
      "content": "待确认候选"
    }
  ],
  "categories": [],
  "prompt_skills": {
    "schema": "writing-workshop/prompt-skills",
    "version": 1,
    "overrides": {
      "润色": {"prompt": "用户自定义提示词", "updated_at": "2026-07-22T17:00:00Z"}
    }
  },
  "corpus": {
    "version": 1,
    "profiles": [],
    "proposals": [],
    "applications": []
  }
}
```

导入 v1/v2/v3/v4/v5 项目仍然兼容；存在 `categories` 时合并合法自定义分类，存在 `prompt_skills` 时只合并已知名称和合法文本，不覆盖未出现在包中的浏览器设置。v6 恢复会在同一个 IndexedDB 事务中写入项目及其子记录，并把 AI 历史里的旧文档 ID 重映射到新记录；失败时整批回滚，不留下半个项目。浏览器项目包、分类与 Prompt Skill 的导入导出是前端本地数据操作，不应误写成新的服务端接口。

浏览器项目与 Go 后端项目是两套明确存储。前端不会在每次保存时静默调用项目写接口；当前工作台仅在用户点击“从自部署后端导入”时读取 `/api/projects`、`/api/chapters` 和 `/api/characters`，建立新的浏览器项目副本。

## 授权语料

`GET /api/corpus` 返回保存在 `.writing-workshop/corpus/index.json` 的聚合档案。档案不含原文。

`POST /api/corpus` 使用 `multipart/form-data`：文件字段为 `files`（或单个 `file`），并必须发送 `authorized=true`。支持 TXT、Markdown、DOCX；单文件最多 20 MiB，一次最多 20 个文件，请求总量最多 64 MiB。相同 SHA-256 会去重。

```bash
curl -X POST http://127.0.0.1:8080/api/corpus \
  -F authorized=true \
  -F files=@sample.md
```

响应中的 `text_stored` 必须为 `false`。`DELETE /api/corpus?id=corpus-...` 删除指定聚合档案。

`POST /api/corpus/refinements` 根据档案和目标 Prompt Skill 生成候选：

```json
{
  "source_ids": ["corpus-0123456789ab"],
  "target_skills": ["润色", "续写", "对白"]
}
```

响应包含 `proposal`、`applied:false` 和提示信息。服务端不会修改浏览器 Prompt Skill；前端必须先展示差分，再由用户确认应用并保存修改前快照。

## 健康检查

`GET /api/health`

```json
{"mode":"demo","status":"ok"}
```

`mode` 为 `demo` 或 `configured`，可用于 Docker、部署平台和本地启动脚本的就绪检查。

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
- `GET /api/external-catalog`：列出经过初筛的 Agent Skills / MCP 上游来源与风险。
- `POST /api/external-catalog`：把一个目录条目登记为停用元数据；不下载、不安装、不执行。
- `GET/POST/PUT/DELETE /api/skill-packs`：列出、保存、更新或删除技能包。
- `GET/POST/PUT/DELETE /api/categories`：列出、保存、更新或删除分类。
- `POST /api/run`：执行选中的后端项目或多个 skill。
- `POST /api/abort`：取消当前长任务。

能力保存到当前工作目录的 `.writing-workshop/capabilities.json`。默认内置能力：

- `builtin-echo`
- `builtin-outline`
- `builtin-rewrite`
- `builtin-continuity`
- `builtin-character-voice`
- `builtin-scene-pacing`
- `writing-workshop`

默认内置能力带 `read_only=true`，不能删除；用户保存的能力可以通过再次 `POST /api/capabilities` 覆盖更新。`enabled=false` 的能力会保留在列表中，但不能被 `/api/run` 执行。删除内置能力、执行停用能力或引用不存在的能力会返回 `400`。

`POST /api/capabilities` 最小请求：

```json
{
  "name": "通用润色",
  "type": "skill",
  "category": "revision",
  "tags": ["润色", "节奏"],
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
  "backend_id": "writing-workshop",
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

普通响应会返回 `run_id`、`task`、`backend_id`、`skill_ids`、`capabilities`、`output` 和 `content`。传 `params.stream=true` 或请求头 `Accept: text/event-stream` 时返回 SSE，事件包括 `start`、`delta`、`done`、`error`、`aborted`。AI 生成和 AI 改写会转发上游真实增量；只有本地 outline / echo 这类没有上游流的确定性任务才在本地分块。

`skill_ids` 可以包含多个 ID。服务会按请求顺序解析所有已启用能力，把各自的 `instructions` 或 `steps` 组合进同一次运行；不存在或停用的 ID 返回 `400`，不会静默跳过。

## 技能包

`GET /api/skill-packs` 返回 `{"packs": [...]}`。内置包包括 `longform-planning`、`chapter-revision` 与 `character-dialogue`。

`POST /api/skill-packs` / `PUT /api/skill-packs`：保存用户技能包，写入当前工作目录 `.writing-workshop/skill-packs.json`。Skill ID 会去重并逐项验证；只读内置包不能覆盖或删除。

```json
{
  "id": "my-review-pack",
  "name": "我的修订包",
  "description": "改写、节奏与连续性联合检查",
  "category": "revision",
  "skill_ids": ["builtin-rewrite", "builtin-scene-pacing", "builtin-continuity"],
  "enabled": true
}
```

`DELETE /api/skill-packs?id=my-review-pack` 删除用户技能包。

## 分类

`GET /api/categories` 返回内置与用户分类。`POST/PUT /api/categories` 保存到 `.writing-workshop/categories.json`；`scope` 可为 `all`、`project`、`capability` 或 `memory`，颜色必须是六位十六进制值，否则使用安全默认色。

```json
{"name":"历史考据","color":"#F2B544","scope":"capability","description":"史料与时代细节"}
```

`DELETE /api/categories?id=...` 只删除用户分类，不会悄悄改写已有记录中的分类 ID。客户端应在删除前提示这一边界。

当前 `/api/run` 已支持内置 `echo`、`outline`、`rewrite`、`ai/generate` 任务。`ai/generate` 和 `rewrite` 的 AI 模式会调用当前配置的 LLM provider；未配置 provider 时，`rewrite` 会返回本地链路验证结果。请求显式选择的 skill/prompt 会把其 `instructions`（或可见 `steps`）组合到本次模型输入中；后端和项目类型只负责执行路由，不会被当成提示词。保存第三方 GitHub 项目或 skill manifest 只负责登记和校验，不会直接执行任意仓库代码。

外部目录导入示例：

```bash
curl http://127.0.0.1:8080/api/external-catalog

curl -X POST http://127.0.0.1:8080/api/external-catalog \
  -H 'content-type: application/json' \
  -d '{"id":"mcp-filesystem"}'
```

返回的 capability 使用 `entry: "external:mcp-server"` 与 `enabled: false`。这种记录不能通过 `/api/run` 执行，也不能改成启用状态；它只是来源、许可证、权限和风险的审查记录。

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

`POST /api/ai/stream`

请求体与 `/api/ai` 相同，返回 `text/event-stream`。事件为 `start`、零到多个 `delta`、`done` 或 `error`。后端支持 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 和 Ollama Chat 的 SSE / NDJSON 增量，不会先缓冲完整回答再按固定长度切片。

## 配置

`GET /api/config`

返回脱敏后的运行配置、配置文件路径和环境变量命名提示。

`POST /api/config` / `PUT /api/config`

保存 provider、model、base_url、api_key、协议、鉴权、请求超时、上下文上限、provider 级 `extra` 和请求体 `extra_body` 到本地 `~/.writing-workshop/config.json`。

```json
{
  "provider": "openrouter",
  "model": "anthropic/claude-sonnet-4",
  "type": "openai",
  "protocol": "openai-chat",
  "auth_mode": "bearer",
  "base_url": "https://openrouter.ai/api/v1",
  "api_key": "sk-or-v1-...",
  "request_timeout_ms": 120000,
  "context_window": 131072,
  "extra": {
    "headers": {
      "HTTP-Referer": "https://writer.example"
    }
  },
  "extra_body": {
    "temperature": 0.7
  }
}
```

`protocol` 可为 `auto`、`openai-chat`、`openai-responses`、`anthropic` 或 `ollama`；`auth_mode` 可为 `auto`、`bearer`、`x-api-key` 或 `none`。`request_timeout_ms` 限制在 5–600 秒，并覆盖读取完整响应/流的整个生命周期。未知模型不会再假定固定上下文上限；需要百分比预算时显式填写 `context_window`。

`api_key` 省略或留空表示保留已有值，`clear_api_key: true` 才会明确删除。`extra` 与 `extra_body` 为整组覆盖：省略表示保留已有值，显式传空对象表示清空；管理页另有“清除已保存请求头”的显式动作。`GET /api/config` 会隐藏 API Key，并删除 `extra.headers` 后再返回，避免自定义鉴权头泄露给浏览器。

Pages 模式不调用这一写接口。浏览器端使用 `web/static/js/api-adapter.js` 直连目标服务，支持 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 与 Ollama `/api/chat`。这是静态站本地配置，不是新增的服务端端点。

## 项目

`GET /api/projects`

读取当前本地 Writing Workshop 输出目录中的项目元数据。

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

保存 Web 规则到当前项目 `.writing-workshop/rules/web.rules.md`。可直接传 `raw`，也可传结构化字段。

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

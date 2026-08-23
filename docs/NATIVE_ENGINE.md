# Writing Workshop Go 编排内核与适配层

> 现行架构说明，更新于 2026-08-23（UTC）。

## 定位

Writing Workshop 的默认编排内核位于 `internal/engine/`，由本仓库直接维护。自有内核的意义是掌握长篇写作需要的上下文、工具权限、候选写入、中断和审计边界，不是宣布外部实现一概不用。

成熟外部引擎或组件只要在许可证、数据边界、错误语义、工具调用和中断契约上可核验，就可以通过薄适配接入，或被吸收到更合适的层级。默认实现与可选适配器是两个维度：拥有自己的主干，不等于封闭生态。

## 现有适配边界

| 边界 | 当前接口 | 可以替换什么 | 不能绕过什么 |
|---|---|---|---|
| 模型 | `engine.ChatModel` | 官方模型、自建服务、中转或自定义实现 | 消息、工具与错误契约 |
| 协议 | `internal/engine/llm` | OpenAI Chat / Responses、Anthropic、Ollama 及后续适配器 | 鉴权脱敏、超时、中断与 usage 语义 |
| 运行时切换 | `engine.SwappableModel` 与 failover | 主备模型和运行中模型切换 | 仅对明确分类的可恢复错误切换 |
| 后端能力 | capability manifest | 外部 Skill、MCP 或受审查的工具链 | 默认停用、权限声明、作者确认写入 |

目前没有宣称存在一个可无损替换任意第三方 Agent runtime 的通用 ABI。真正接入某个优秀引擎时，应先写适配契约和回归测试，再决定复用整机、复用组件还是只吸收设计；不为了“纯自研”重复造轮子，也不为了兼容而放弃 Writing Workshop 的产品边界。

## 模块

| 路径 | 职责 |
|---|---|
| `internal/engine/types.go` | 消息、工具、模型、事件、用量、错误与 failover 接口 |
| `internal/engine/agent.go` | Agent 循环、工具调用、工具门、事件和累计用量 |
| `internal/engine/context/` | token 估算、上下文投影、裁剪和摘要 |
| `internal/engine/llm/` | OpenAI Chat/Responses、Anthropic、Ollama HTTP 适配 |
| `internal/engine/subagent/` | 独立子任务上下文与运行配置 |
| `internal/engine/tools/` | 路径约束、歧义检查、BOM/换行保真的编辑工具 |

## 不变量

1. 工具结果紧跟产生它的 assistant tool call；运行中追加的 steering 不能插到两者之间。
2. 工具必须经过 `ToolGate`；拒绝时不执行真实动作。
3. 上下文压缩只生成本次模型视图，不破坏可审计的原消息记录。
4. 用量在消息写入时累积；模型返回空 usage 时不伪造供应商数字。
5. 编辑路径必须位于授权根目录；旧文本匹配不唯一时拒绝替换。
6. provider 错误保留 HTTP 状态、限流/认证分类和可读诊断，不把 Key 写入日志。

## 协议与流式边界

Go HTTP 适配器支持四类请求/响应协议，并有本地模拟契约测试。Web 的 `/api/ai/stream` 与 `/api/run` 继续使用 `internal/web/provider_http.go` 转发真实 SSE/NDJSON 增量。原生 CLI Agent 的 `GenerateStream` 当前复用普通响应并产生一个最终文本增量；这是真实的最终块，不是把完整文本按字符伪切片，但也不是逐 token 流。后续若把 CLI 交互流列为发布目标，应在 `internal/engine/llm` 增加原生 SSE/NDJSON 解析并补中断测试。

## 配置迁移

现行目录为 `.writing-workshop/`。为了避免旧用户突然失去配置：

- 仅当现行配置不存在时读取旧 `.ainovel/`；
- 读取旧配置时给出迁移提示；
- 新建或保存始终写入 `.writing-workshop/`；
- 环境变量优先 `WRITING_WORKSHOP_<PROVIDER>_API_KEY`，然后 `<PROVIDER>_API_KEY`，最后兼容旧 `AINOVEL_...`。

## 已覆盖测试

- assistant/tool/steering 邻接；
- 工具门拒绝与零执行；
- usage 累计；
- 上下文投影与工具结果压缩；
- 四协议鉴权、路径、请求体、文本和 usage；
- 限流分类；
- BOM/CRLF 保真、路径越界和歧义替换拒绝；
- 现行配置写入和旧配置只读迁移。

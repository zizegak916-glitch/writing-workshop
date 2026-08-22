# Writing Workshop 原生 Go 引擎

> 现行架构说明，更新于 2026-08-22（UTC）。

## 结论

Writing Workshop 当前运行时位于 `internal/engine/`，由本仓库直接实现和维护。当前 `go.mod`、`go.sum` 与 Go import graph 不再包含 `github.com/voocel/agentcore` 或 `github.com/voocel/litellm`。

“当前引擎为仓库自有实现”不等于“仓库没有 fork 历史”。项目早期基于 `voocel/ainovel-cli`，Apache-2.0 的版权、许可证、提交历史和历史来源继续保留；参见 [UPSTREAM_ENGINE.md](UPSTREAM_ENGINE.md) 与根目录 [NOTICE](../NOTICE)。

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

这些测试是仓库自测，不等于第三方审计或所有真实模型供应商网络兼容证明。

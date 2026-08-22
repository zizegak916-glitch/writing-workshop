# Writing Workshop 阶段代码审查

> 自审快照：2026-08-22（UTC）。它记录当前代码事实、已跑验证和缺口，不是第三方审计，也不替代真实用户反馈。

## 本轮结论

当前运行时已经从外部 `agentcore`/`litellm` 依赖迁到仓库内 `internal/engine`；授权语料校准实现了“原文瞬时处理、只留聚合指标、候选应用、可撤销”的最小闭环。项目备份升到 v6，并保留 v1–v5 迁移。

本轮主要降低了两类风险：核心运行时依赖外部兄弟模块，以及为了细化提示词反复把整份资料发给模型。它没有解决所有技术债。

## 可由代码验证的变化

| 项目 | 当前实现 | 证据 |
|---|---|---|
| 原生 Agent 循环 | 消息、工具门、事件、usage 和 failover 在仓库内部 | `internal/engine/types.go`、`agent.go` |
| 上下文管理 | 生成投影视图，不破坏基线；工具结果可微压缩 | `internal/engine/context/` |
| 模型协议 | OpenAI Chat/Responses、Anthropic、Ollama | `internal/engine/llm/` |
| 编辑安全 | 拒绝路径越界与歧义替换，保留 BOM/CRLF | `internal/engine/tools/` |
| 配置迁移 | 新写 `.writing-workshop`，旧 `.ainovel` 只读回退 | `internal/bootstrap/`、`internal/rules/` |
| 语料校准 | 授权检查、哈希去重、聚合指标、候选规则 | `internal/corpus/` |
| 双运行模式 | Pages 浏览器内分析；自部署调用 Go corpus API | `web/static/js/corpus-lab.js`、`internal/web/corpus.go` |
| 项目恢复 | v6 携带语料统计与 Prompt 覆盖，v1–v5 迁移 | `web/static/js/workbench.js`、`tests/browser-smoke.mjs` |

## 当前高优先级缺口

1. **第三方验证不足。** 目前仍缺少外部用户完成一章并连续使用后的数据完整性反馈。
2. **原生 CLI 真增量未完成。** Web API 有真实 SSE/NDJSON；`internal/engine/llm.GenerateStream` 当前是普通响应后的单个最终块。
3. **第三方 Skill 沙箱未交付。** 外部 manifest 只能登记、校验和保持停用，不应被宣传成可执行生态。
4. **浏览器与后端没有自动双向同步。** 这是刻意的数据边界，但仍会增加多端迁移成本。
5. **没有像素级 UI 回归和公开覆盖率。** Playwright 是行为烟雾测试，不证明所有浏览器和尺寸稳定。
6. **真实供应商矩阵不足。** 四协议由本地模拟服务验证，不能推导所有中转、企业代理或付费模型均兼容。
7. **原生 JS 规模继续上升。** 当前无需立刻引入框架，但应避免继续添加大块全局脚本，优先拆纯函数和测试。

## 安全审查

- 语料 POST 有 64 MiB 请求上限、20 MiB 单文件上限、20 文件数量上限。
- DOCX 只读取包内 `word/document.xml`，不执行宏或嵌入对象。
- 语料档案结构没有原文字段，API 明确返回 `text_stored:false`。
- Prompt 校准由浏览器确认应用，后端 proposal 返回 `applied:false`。
- API Key 与自定义鉴权头在读取配置时脱敏；Pages Key 仍是浏览器本地明文风险。
- 服务默认回环监听；应用本身仍没有账号体系，公网必须外接鉴权。

## 验证状态

本地已通过：

- `go test ./internal/engine/... ./internal/corpus ./internal/bootstrap ./internal/rules ./internal/entry/tui ./internal/host/flow ./internal/agents/ctxpack`
- `go test -run '^$' ./...`（全包编译）
- 所有前端 JavaScript `node --check`
- `node scripts/check-static.mjs`
- `node tests/api-adapter.test.mjs`
- 原生二进制构建与 demo 启动

本地受执行环境限制未完成：

- 含 loopback `httptest.NewServer` 的完整 `go test ./...`；
- Playwright 浏览器端到端测试；
- Docker 构建。

上述三项只有 GitHub Actions 成功后才能写进发布证据。`go mod tidy` 也因离线模块缓存缺少依赖测试包未完成；当前模块可编译，但 CI 仍需验证完整模块图。

## 下一步，不再堆功能

1. 让 CI/Pages 全绿，处理任何迁移或浏览器回归。
2. 让 3–5 位真实用户使用核心闭环，不收私稿，只收复现步骤与脱敏日志。
3. 补原生 CLI 真流式，再决定是否推进 Skill 沙箱。
4. 对大项目先做增量资料摄取与缓存，不再增加同类功能按钮。

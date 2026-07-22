# 开发指南

## 本地构建

```bash
go build -o writing-workshop ./cmd/ainovel-cli
./writing-workshop serve --demo --port 8080
```

当前仓库的 Web 前端位于 `web/static/`，由 `web/static/static.go` 通过 `go:embed` 打包。

写作工坊是主体应用。GitHub 开源项目、skill、规则包和自定义能力都只是可保存、可组合、可执行的能力来源。底层 Go 引擎源自 `ainovel-cli`；新增后端适配时应保持 `/api/` 契约稳定。

## 常用验证

在受限环境中，建议把 Go 缓存放到 `/tmp`：

```bash
mkdir -p /tmp/go-cache /tmp/gomodcache
GOCACHE=/tmp/go-cache GOMODCACHE=/tmp/gomodcache go test ./...
GOCACHE=/tmp/go-cache GOMODCACHE=/tmp/gomodcache go vet ./...
GOCACHE=/tmp/go-cache GOMODCACHE=/tmp/gomodcache go build ./cmd/ainovel-cli
```

## Web 端约定

- `app.html` 是写作工坊主入口。
- 主界面的“流程”功能拆分在 `web/static/js/workflows.js` 与 `web/static/css/workflows.css`，由 `app.html` 显式加载；不要只修改未被入口引用的旧拆分模块。
- `/admin` 使用 `web/static/admin.html`。
- 前端 AI 调用必须走 `/api/ai`，浏览器不直接访问厂商 API。
- 项目、章节、角色写入会同步到 `/api/projects`、`/api/chapters`、`/api/characters`。
- 规则包使用 `/api/rules`，项目级规则落盘到 `.ainovel/rules/web.rules.md`。
- 新的通用能力入口使用 `/api/capabilities` 和 `/api/run`。前端传递 `backend_id`、`skill_ids`、上下文和参数；后端输出直接回传前端。
- 长任务必须支持取消，前端可使用 `AbortController` 或调用 `/api/abort` 中断。

## 后端约定

- Web API 实现在 `internal/web/server.go`。
- 通用能力 API 实现在 `internal/web/capabilities.go`，能力清单保存到 `.ainovel/capabilities.json`。
- 第三方 GitHub 项目和 skill manifest 只做登记、校验和选择；不要在 Web 层直接执行未沙箱化的远程代码。
- `/api/run` 支持 JSON 响应和 SSE 响应。新增长任务时必须使用 request context，并注册取消函数，保证 `/api/abort` 可中断。
- 运行时配置由 `host.UpdateConfig` 持久化到本地配置文件。
- 章节读写复用 `internal/store`，不要绕过 Store 写入核心小说数据。
- 规则解析复用 `internal/rules`，不要在 Web 层重新实现规则合并逻辑。

## 自检清单

1. `rg -n "TODO|FIXME|HACK|mock|stub" internal web`
2. `go test ./...`
3. `go vet ./...`
4. `go build ./cmd/ainovel-cli`
5. 启动 `serve --demo` 后检查 `/api/health`，再访问 `/app.html` 和 `/admin`。
6. 在管理后台测试 `/api/capabilities`、`/api/run` 和 `/api/ai`，确认能力保存、执行和 provider/model/key 配置有效。

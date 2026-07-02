# 开发指南

## 本地构建

```bash
go build -o ainovel-cli ./cmd/ainovel-cli
./ainovel-cli serve --port 8080
```

当前仓库的 Web 前端位于 `web/static/`，由 `web/static/static.go` 通过 `go:embed` 打包。

`ainovel-cli` 原版是他人维护的开源项目；当前仓库仅把它作为 AI写作工坊可原生支持的后端项目之一。新增后端适配时应保持 `/api/` 契约稳定。

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
- `/admin` 使用 `web/static/admin.html`。
- 前端 AI 调用必须走 `/api/ai`，浏览器不直接访问厂商 API。
- 项目、章节、角色写入会同步到 `/api/projects`、`/api/chapters`、`/api/characters`。
- 规则包使用 `/api/rules`，项目级规则落盘到 `.ainovel/rules/web.rules.md`。

## 后端约定

- Web API 实现在 `internal/web/server.go`。
- 运行时配置由 `host.UpdateConfig` 持久化到本地配置文件。
- 章节读写复用 `internal/store`，不要绕过 Store 写入核心小说数据。
- 规则解析复用 `internal/rules`，不要在 Web 层重新实现规则合并逻辑。

## 自检清单

1. `rg -n "TODO|FIXME|HACK|mock|stub" internal web`
2. `go test ./...`
3. `go vet ./...`
4. `go build ./cmd/ainovel-cli`
5. 启动 `serve` 后访问 `/app.html` 和 `/admin`。
6. 在管理后台测试 `/api/ai`，确认 provider/model/key 配置有效。

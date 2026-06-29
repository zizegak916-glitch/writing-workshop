# ainovel-cli Web 整合自审报告

生成时间：2026-06-29

## 审查范围

- Go Web 服务：`internal/web/server.go`、`web/static/static.go`
- 写作工坊前端：`web/static/app.html`、`web/static/app.js`、`web/static/js/*.js`、`web/static/css/main.css`、`web/static/parts/body.html`
- 管理后台：`web/static/admin.html`
- 文档：`README.md`、`API.md`、`CONFIG.md`、`DEVELOPMENT.md`

## 连接性检查

- `/api/ai`：前端 AI 调用统一通过本地 `/api/ai` 代理；请求体会带 `provider`/`model`，浏览器不再直连厂商 API。
- `/api/config`：API 弹窗和设置面板会写入后端配置；API key 可留空以使用本地配置或环境变量。
- `/api/projects`：前端启动时会从本地后端项目种子同步到 IndexedDB，项目保存会同步到后端。
- `/api/chapters`：章节列表和章节正文从后端读取，章节保存会同步到后端。
- `/api/characters`：角色读取和保存会同步到后端。
- `/api/rules`：设置面板增加“技能/规则包”，支持预设规则包、导入 JSON/YAML/MD、导出 JSON、保存到项目规则文件。
- `/admin`：管理后台由 embed 静态文件提供，包含配置、项目、角色、规则、API 测试面板。

## 本地化与静态资源

- `web/static/static.go` 使用 Go `embed.FS` 打包 HTML、CSS、JS、图标和 parts。
- 未发现 Google Fonts、gstatic、CDN 脚本或 `fetch("https://...")` 形式的前端直连请求。
- `web/static/css/main.css` 字体栈已改为系统字体栈；`app.html` 也使用系统字体栈。

## 占位实现扫描

执行扫描：

```bash
rg -n "TODO|FIXME|HACK|stub|fetch\(['\"]https?://|axios\(|fonts\.googleapis|fonts\.gstatic|cdn" internal web/static -S
```

结果：无匹配。

已处理项：

- `showReduceAiHistory()` 现在会把最近历史渲染到现有 AI 结果弹窗。
- `displayContinuationSuggestions()` 现在会把续写方向渲染到现有 AI 结果弹窗。

## 验证结果

通过：

```bash
for f in web/static/app.js web/static/js/*.js; do node --check "$f" || exit 1; done
GOCACHE=/tmp/ainovel-gocache GOMODCACHE=/tmp/ainovel-gomodcache go build -o /tmp/ainovel-cli ./cmd/ainovel-cli
GOCACHE=/tmp/ainovel-gocache GOMODCACHE=/tmp/ainovel-gomodcache go vet ./...
```

未完全通过：

```bash
GOCACHE=/tmp/ainovel-gocache GOMODCACHE=/tmp/ainovel-gomodcache go test ./...
```

失败用例：

- `internal/store`: `TestCheckpointStore_SeqNotConsumedOnWriteFailure`
- 失败原因：测试期望只读文件写入失败，但当前 root/沙箱环境下只读权限没有触发预期写失败。
- 影响判断：该失败与本次 Web 整合改动无直接关系；`internal/web` 测试通过。

## 剩余风险

- `/api/ai` 当前返回非流式 JSON；前端的流式 UI 通过本地代理返回后一次性填充，真实 token 级 streaming 尚未暴露给浏览器。
- 配置保存会持久化到默认本地配置路径；如果用户只想临时测试 provider/model，应在后续版本增加“仅本次会话”选项。
- 当前前端仍保留 IndexedDB 作为本地缓存层，后端同步失败时会在控制台记录 warning；离线编辑与后端状态冲突尚未做复杂合并策略。

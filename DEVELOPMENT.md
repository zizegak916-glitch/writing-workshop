# 开发指南

> 现行开发指南，更新于 2026-08-22（UTC）。

## 构建

```bash
go build -o writing-workshop ./cmd/writing-workshop
./writing-workshop serve --demo --port 8080
```

最低需要 Go 1.21；兼容基线使用 Go 1.21.13，并以 `GOTOOLCHAIN=local` 验证，防止本机或 CI 悄悄下载更高版本掩盖不兼容代码。前端位于 `web/static/` 并通过 `go:embed` 进入可执行文件；没有前端 bundler，新增脚本/样式必须在 HTML 中显式加载，并加入静态合约检查。

## 当前架构权威位置

- `internal/engine/`：仓库自有 Agent、上下文、协议和安全编辑。
- `internal/corpus/`：授权语料解析、聚合指标、候选规则和原子档案。
- `internal/web/provider_http.go`：Web 四协议真实 SSE/NDJSON 适配。
- `internal/web/corpus.go`：自部署语料 API。
- `web/static/js/workbench.js`：浏览器项目、IndexedDB、v6 备份。
- `web/static/js/corpus-lab.js`：Pages 本地分析、自部署上传、差分应用和撤销。
- `web/static/js/prompt-skills.js`：32 个 Prompt Skill 默认值和覆盖管理。

旧 `.ainovel` 只可作为迁移输入；新代码不得向它写入。现行目录是 `.writing-workshop`。

## 不可破坏的产品约束

1. AI 输出必须先进入候选区；不得直接覆盖正文。
2. 生成后正文或文档坐标发生变化时，必须阻止旧候选按旧位置写入。
3. 项目导入、级联删除和跨 store 变更必须在单个 IndexedDB 事务中完成。
4. Pages API 配置不得请求静态 `/api/config`；浏览器直连和同源后端模式要独立测试。
5. Key、鉴权头、私稿和导入语料不得进入日志、源码或测试快照。
6. 语料原文只在本次内存中处理；持久化结构不得出现原文字段。
7. 语料规则只能生成候选，并必须含禁止具体作者仿写的反规则。
8. 外部 capability 默认停用；没有沙箱时不得执行远程代码。

## 验证

```bash
gofmt -w <changed-go-files>
go test ./...
go vet ./...
go build ./cmd/writing-workshop
find web/static -name '*.js' -print0 | xargs -0 -n1 node --check
node scripts/check-static.mjs
node tests/api-adapter.test.mjs
npm ci
npx playwright install --with-deps chromium
npm run test:browser
git diff --check
```

受限沙箱可能禁止 `httptest.NewServer` 或 Playwright 访问 loopback；这种情况下只可记录“本地环境未运行”，不能把编译成功写成浏览器通过。最终发布证据以 GitHub Actions 为准。

## 新增引擎行为时

- Agent 消息顺序、工具门、usage、取消与错误分类必须有测试。
- 新 provider 适配必须覆盖路径、鉴权、请求体、普通响应、流式响应、usage、4xx/5xx 和超时。
- 上下文压缩不得改写审计基线，只生成本次发送视图。
- 文件编辑必须验证根目录、符号链接/遍历风险、唯一匹配和换行编码。

## 新增语料指标时

- 先证明无需保存原文即可复算或解释。
- 对超长文本使用有界采样或流式统计，防止无界内存。
- 同一 SHA-256 不重复加入档案。
- 弱样本标弱证据，禁止把相关性写成质量因果。
- 浏览器与 Go 实现的字段语义要一致，并补 v6 备份迁移测试。

## 文档与发布

行为变化时更新真正受影响的 README、配置、API、教程与 CHANGELOG。`docs/RELEASE_EVIDENCE.json` 只记录已经成功的 CI/Pages/Release，不为未发布版本预填成功结果；`CODE_REVIEW.md` 是阶段性自审，也不能称为第三方审计。

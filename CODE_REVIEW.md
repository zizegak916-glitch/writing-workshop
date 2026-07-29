# Writing Workshop 全量自审记录

审查日期：2026-07-26（UTC+8）
审查对象：当前 `main` 工作树中的产品前端、Go 同源后端、持久化格式、公开页面、示例与 Markdown 文档。

> 这是一份阶段性自审快照，不是第三方审计或用户认可。自 2026-07-28 起不再为每次小改动重写整份文档；当前行为看 README、CHANGELOG、受影响的协议和 CI，独立可信度看真实 Issue / PR / Release 下载与用户实测。

## 结论

当前产品已经形成三个明确而不混用的能力层：浏览器 Prompt Skill 管理 32 个功能按钮的隐形提示词；后端 Skill / 技能包负责可组合执行；项目操作台负责浏览器本地资料、笔记、分类、备份与删除。多 Skill 选择会显式传给后端，浏览器 Prompt Skill 可搜索、修改、恢复、单独导入导出并随项目 v5 备份，技能包和能力分类有真实 CRUD、校验、测试与磁盘记录。

GitHub Pages 正式在线版与后端增强模式有明确运行时边界。Pages 是真实公开域名上的正式部署，可以使用浏览器本地项目、笔记、分类与 BYOK 自定义 API；当前默认 Pages 工作流未同时部署 Go API，因此单独打开该版本时不执行 `/api/run` 或保存后端技能包。浏览器工作台和 Go 后端是两套明确存储，不再把每次浏览器编辑静默写入单个后端项目；导入后端内容必须由作者显式触发。

## 本轮发现与处理

| 严重度 | 发现 | 处理 | 记录位置 |
|---|---|---|---|
| 高 | `app.html` 同时包含超大内联实现和一批未加载/重复拆分脚本与翻译 JSON，核心函数存在重复声明，出现“改了文件但线上入口不生效”和旧函数覆盖新函数的风险 | 提取唯一基础入口 `css/main.css` / `js/workbench.js`，删除未引用副本；静态契约禁止大段内联、孤立资源与核心函数重复声明 | `web/static/app.html`、`web/static/js/workbench.js`、`scripts/check-static.mjs` |
| 高 | 浏览器每次保存曾隐式镜像到后端单项目，多个浏览器项目可能互相污染，且界面没有提示数据边界 | 删除隐式写入；增加“从自部署后端导入”，只在用户确认的动作中建立新浏览器副本 | `web/static/js/workbench.js`、`web/static/js/product-extensions.js` |
| 高 | 多模型槽位仍要求并持久化每槽 Key，既增加泄露风险，也无法代表后端 Provider 是否已配置 | 槽位只保存 Provider / Model；自部署版 Key 由后端管理。Pages 主 BYOK 配置可保存在当前 origin，但不会静默复制到其他 Provider 槽位 | `web/static/js/workbench.js`、`SECURITY.md` |
| 高 | Pages 的 API 保存与模型调用被错误改成无条件访问静态 `/api/config` / `/api/ai`，配置出现 405 | 恢复运行时双通道：Pages 保存 `ww_api` 后直连目标服务，自部署版保持同源后端；Playwright 断言 Pages 保存/测试没有 POST `/api/config` | `web/static/js/workbench.js`、`web/static/admin.html`、`tests/browser-smoke.mjs` |
| 高 | 多模型、降 AI 和递归创作可在生成后切换文档再应用，部分写入没有快照 | 所有 AI 写入绑定生成时项目/文档；替换类操作校验正文未变化，写入前统一保存恢复快照 | `web/static/js/workbench.js`、`web/static/js/workflows.js` |
| 高 | 导入标题、差异文本和模型返回的递归规划内容存在 HTML 拼接路径 | 导入预览和模型文本统一转义或使用 `textContent`，并增加恶意标题浏览器回归用例 | `web/static/js/workbench.js`、`tests/browser-smoke.mjs` |
| 中 | 项目备份 JSON 导入后会无条件执行结构“自动分析”，即使用户只想原样恢复也可能新增内容；文件导入没有浏览器侧体积上限 | v1-v4 备份恢复不再自动改写内容；文本/DOCX 只在预览中显式勾选时分析，并限制文件数、单文件/总大小和 DOCX 解压体积 | `web/static/js/workbench.js` |
| 中 | 项目笔记入口是占位，导出、复制、删除和上下文都无法覆盖笔记 | IndexedDB 升至 v4，补齐桌面/移动笔记 CRUD、显式上下文开关、统计和 v4 项目包全链路 | `web/static/js/workbench.js`、`web/static/js/workflows.js` |
| 中 | 后端 JSON 读取没有统一体积上限，也可能接受尾随的第二个 JSON 值 | 统一限制 8 MiB 并拒绝多个 JSON 值，增加单元测试 | `internal/web/server.go`、`internal/web/json_test.go` |
| 中 | Docker 默认端口绑定会直接暴露到所有网卡 | compose 默认改为 `127.0.0.1:8080:8080`；公开访问必须显式配置反向代理、TLS 与鉴权 | `docker-compose.yml`、`SECURITY.md` |
| 质量 | 核心浏览器交互此前只能靠人工点验 | 增加 Playwright 桌面/移动产品烟雾测试并接入 CI；当前受限容器无法创建 Chromium 单例 socket，因此本地不伪造通过，最终以 GitHub CI 记录为准 | `tests/browser-smoke.mjs`、`.github/workflows/ci.yml` |
| 高 | 项目、角色、记忆和历史的部分列表把用户文本拼入 `innerHTML` 或内联属性 | 活跃项目管理改用 DOM + `textContent`；角色/记忆/历史与移动列表增加转义或 URI 编码；后台角色不再把 JSON 拼进 `onclick` | `web/static/app.html`、`web/static/admin.html`、`web/static/js/product-extensions.js` |
| 高 | AI 检测返回的可疑句子继续通过 `innerHTML` 和内联 `onclick` 生成按钮，模型文本可进入 HTML 解析 | 改为 `createElement`、`textContent`、属性赋值和 `addEventListener`；重绘前清空旧结果 | `web/static/js/workbench.js` |
| 中 | “查AI”默认提示词要求自由命名维度，解析器却固定读取六个中文标签；缺少字段时界面伪造 `50` 分雷达 | 默认 Prompt Skill 固定六个协议字段；任一字段缺失时不展示雷达，只保留原始模型说明 | `web/static/js/prompt-skills.js`、`web/static/js/workbench.js` |
| 中 | AI 片段判断误把函数对象 `isAIFragged` 当成布尔值，且没有先确认片段仍在编辑器 | 改为实际 `isAIFlagged` 值；只标记当前正文中确实存在的片段 | `web/static/js/workbench.js` |
| 中 | 项目列表只能“点击打开”，没有维护操作台 | 增加搜索、分类筛选、重命名、复制、分类、导出和精确级联删除 | `web/static/js/product-extensions.js` |
| 中 | UI 已允许多个 Skill，但缺少组合预设和分类筛选 | 增加选中数量、分类过滤、清空和三个内置技能包；隐藏分类中的选择不会丢失 | `web/static/js/workflows.js` |
| 中 | 技能包和自定义分类没有后端事实层 | 新增 `.ainovel/skill-packs.json`、`.ainovel/categories.json` 与 CRUD；校验只读项、重复 ID 和未知 Skill | `internal/web/catalog.go`、`internal/web/server_test.go` |
| 中 | 项目 JSON 导出未包含记忆与浏览器 Prompt Skill 覆盖值 | 先升级为版本 3，现已继续升级为 v4 并加入笔记和分类；旧版本继续兼容 | `web/static/js/workbench.js`、`web/static/js/product-extensions.js`、`web/static/js/prompt-skills.js` |
| 中 | 桌面“上下文用量”和生成按钮排在全部 30 个能力卡之后，常见屏幕首次打开看不到；功能目录与请求操作共用一个滚动层 | 将补充指令、上下文预算和生成按钮移入 AI 面板固定请求栏；能力目录单独滚动；切换标签时同步显示状态，并为低高度桌面压缩而不隐藏关键信息 | `web/static/app.html`、`web/static/css/product-extensions.css`、`web/static/js/workflows.js` |
| 中 | `updateContextBar()` 在没有 API 配置时提前返回，Pages 正式在线版显示“-”，把本地可完成的估算错误绑定到模型连接 | 上下文估算改为始终可用，显示 token / 上限 / 百分比；桌面与手机共用状态，服务端返回 usage 后再显示实际输入输出 | `web/static/js/workbench.js`、`web/static/js/workflows.js` |
| 低 | URL 导入按钮只显示“即将推出” | 从当前入口删除；本轮继续移除未被运行时读取的旧 `parts/body.html` 副本 | `web/static/app.html`、`web/static/static.go` |
| 低 | 联系方式失效且多个页面品牌图标不一致 | 联系统一指向已校验的 `https://linux.do/u/The_Fo0l`；新 SVG 作为 favicon、品牌与顶栏图标 | `web/static/icons/app-icon.svg`、公开 HTML 页面 |
| 低 | AI 底栏仍沿用大脑图标，30 个能力卡用字符或 Emoji 充当图标 | 新增 AI 工作台符号和 30 个一对一 SVG；脑形只留给“记忆”；桌面和手机共用同一映射 | `web/static/icons/ai-mode-icons.svg`、`web/static/js/ai-mode-icons.js` |
| 低 | “实时灵感”和“资料搜索”仍复用通用能力图标 | 新增 `mode-inspiration`、`mode-research`，保持快捷工具语义可辨 | `web/static/icons/ai-mode-icons.svg`、`web/static/js/ai-mode-icons.js` |
| 文档 | 现行产品说明与继承引擎历史文档混在同一目录 | 新增状态地图；历史架构、上下文、观测和重构文档增加醒目标识 | `docs/README.md` |
| 文档 | 功能、提交、CI、Pages 和实测证据散落在聊天与多份文档中 | 新增人类可读时间线与机器可读证据账本，当前文档互链，历史页只保留来源层并回链 | `docs/UPDATE_TIMELINE.md`、`docs/RELEASE_EVIDENCE.json` |
| 质量 | CI 只做 JavaScript 语法检查，无法发现 Skill / 图标 / SVG 映射漏项、断链或证据 JSON 损坏 | 增加无依赖静态产品契约，并接入 `make check` 与 GitHub Actions | `scripts/check-static.mjs`、`Makefile`、`.github/workflows/ci.yml` |

## 存储与删除边界

- 浏览器项目、章节、大纲、人物、笔记和记忆保存在当前站点 IndexedDB。
- 浏览器自定义项目/记忆分类保存在 localStorage；项目记录保存 `category_ids`。
- 浏览器 Prompt Skill 覆盖值保存在当前 origin 的 localStorage 键 `ww_prompt_skills_v1`；项目 v4 备份携带合法覆盖值，不改写仓库默认提示词。
- 后端能力、技能包和分类分别保存在当前工作目录的 `.ainovel/capabilities.json`、`.ainovel/skill-packs.json`、`.ainovel/categories.json`。
- 删除一个浏览器项目会先明确确认，再按该项目 ID 删除大纲、人物、章节、笔记和记忆。删除分类不会删除项目，也不会静默重写后端历史记录。
- 浏览器日常保存不写入 Go 后端；“从自部署后端导入”会建立新的浏览器副本，不宣称双向同步。
- GitHub URL 和 capability manifest 仍只登记元数据，不执行远程仓库代码。

## 验证

本地环境已通过：

```text
find web/static -name '*.js' -print0 | xargs -0 -n1 node --check
app.html / admin.html 内联脚本语法解析
git diff --check
公开 HTML 本地 href/src 目标检查
失效联系方式与占位 URL 导入全文扫描
固定请求栏、桌面/手机预算节点唯一性和“估算不依赖 API”静态契约
```

本轮在受限容器中安装隔离的 Go 1.25.5 工具链后，`make check` 已通过 Go test、vet、build、全量 JavaScript 语法、静态产品契约和服务 smoke test。Chromium 在当前容器内因系统禁止创建进程单例 socket 而无法启动，因此不伪造本地浏览器通过；Playwright 套件由 GitHub Actions 在标准 runner 中执行，发布结论只在真实运行完成后记录。

当前完整性实现提交为 [`5ea9f26`](https://github.com/zizegak916-glitch/writing-workshop/commit/5ea9f26786eb8fe7c7127ae13b8f39a4b959b968)。本地启动新二进制后，`/`、`/app.html`、`/docs.html`、`/about.html`、`/privacy.html`、`/admin.html`、`/css/main.css`、`/js/workbench.js` 与 `/api/health` 均返回 200；向配置接口拼接两个 JSON 值返回 400。CI 和 Pages 编号在真实运行完成前保持不写。

发布验收提交为 [`10d3a2a`](https://github.com/zizegak916-glitch/writing-workshop/commit/10d3a2a7549c80e2dc64cd7000bb3d1563c15606)。[CI 30191114231](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30191114231) 与 [Pages 30191114238](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30191114238) 均为 `success`；CI 中 Chromium 已通过桌面与移动端产品烟雾测试。公开页面七个核心资源均返回 200，SHA-256 与仓库同提交文件一致，详见 [`RELEASE_EVIDENCE.json`](docs/RELEASE_EVIDENCE.json)。

- [CI run 29931143163](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29931143163)：`go test ./...`、`go vet ./...`、release binary build、全部 JavaScript syntax、无密钥服务启动与 `/api/health` smoke test，结论 `success`。
- [Pages run 29931143073](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29931143073)：正式公开在线站部署，结论 `success`。
- 部署后从公开 URL 实测：首页可读到 Star 支持文案，`app.html` 已加载 `product-extensions.js`，多 Skill 目录、项目管理脚本和新 SVG 图标均返回 HTTP 200。

本轮联系方式与 AI 图标更正已在提交 [`93635ac`](https://github.com/zizegak916-glitch/writing-workshop/commit/93635ac4f7394eae945f88990e8a97497fac5012) 上重新验证：

- [CI run 29933253894](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29933253894)：结论 `success`。
- [Pages run 29933253856](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29933253856)：结论 `success`。
- 公开工作台浏览器复核：30 个能力按钮生成 30 个不同 SVG 引用，所有图标尺寸非零；AI 工作台入口使用 `mode-workshop`，大脑图标只保留给记忆功能。
- 公开关于页复核：联系方式文字与地址均为 `The_Fo0l`，页面中不存在旧用户名 `The_o0l`。

浏览器 Prompt Skill 已在提交 [`3fdf36c`](https://github.com/zizegak916-glitch/writing-workshop/commit/3fdf36c136caf7561df964997e483ce74d8d7819) 上验证：

- [CI run 29938799142](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29938799142)：结论 `success`。
- [Pages run 29938799040](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29938799040)：结论 `success`。
- 正式站打开“流程 → 内置 Prompt Skill”可见 32 项；修改并保存后刷新，覆盖值仍存在。
- 当时部署的 `prompt-skills.js` 与 `prompt-skills.css` SHA-256 已写入 [`docs/RELEASE_EVIDENCE.json`](docs/RELEASE_EVIDENCE.json)。

本次查 AI 数据质量、安全渲染、快捷图标、静态契约和文档同步修复已在提交 [`aceeb957`](https://github.com/zizegak916-glitch/writing-workshop/commit/aceeb9571f5b3a0eec835efbc05a8192e322276e) 上验证：

- [CI run 29941672602](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29941672602)：Go test / vet / build、JavaScript 语法、静态产品契约和 demo smoke test 全部成功。
- [Pages run 29941672654](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29941672654)：结论 `success`。
- 正式教程显示 `Product guide · 2026-07-23` 和“更新时间线与验证痕迹”；工作台显示 `v2.4 · 2026-07-23`。
- 正式站 Prompt JS 包含六个固定解析字段，实时灵感/资料搜索映射到独立 SVG；Prompt JS 与图标 SVG 的线上 SHA-256 和本地一致。

本次桌面请求栏与上下文预算修复已在提交 [`00c9883`](https://github.com/zizegak916-glitch/writing-workshop/commit/00c988300b54b3cbe8ef226202ba760587e836a3) 上验证：

- [CI run 29945400780](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29945400780)：Go test / vet / build、全部 JavaScript 语法、扩展后的静态产品契约和 demo smoke test 全部成功。
- [Pages run 29945400654](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29945400654)：结论 `success`。
- 正式 Pages 返回一个桌面固定请求栏、唯一桌面/手机预算节点和新的无 API 估算逻辑；`app.html` 与请求栏 CSS 的线上 SHA-256 同本地完全一致。
- 本轮公开复核确认部署结构与资源，不把它描述成多视口像素验收；缺少的截图差异测试继续列为技术债。

## 2026-07-29 数据完整性与网络兼容补充审查

这次没有扩大产品范围，集中修复核心闭环中会造成数据丢失、假成功或接口不兼容的问题：

- 编辑器切换项目/章节/大纲/人物/笔记和导出前会等待当前 IndexedDB 写事务完成；Esc 不再在普通模式覆盖编辑器，人物中央编辑器不再“显示已保存但实际没写”。
- 项目导入和级联删除改为多存储事务；v5 项目包加入本项目候选与恢复快照，恢复时把旧文档 ID 映射到新记录，历史查询和清空按项目隔离。
- 多模型失败槽位不再拥有可应用状态；候选仍需通过项目、文档和正文版本校验。
- Pages 与自部署后端共用四协议网络语义。Go 后端新增 OpenAI Chat Completions、Responses、Anthropic Messages 和 Ollama 原始适配以及 `/api/ai/stream`；AI `/api/run` 转发真实上游增量。
- 超时覆盖完整响应体/流；API Key 和自定义头采用显式清除语义；未知模型不再默认声称 200k 上下文。
- Go 合约测试覆盖四协议、鉴权、请求体、usage 和 SSE；浏览器测试增加切换保存、人物保存、v1–v4→v5、历史坐标重映射、失败候选、级联删除与 Pages 清除语义。

以上仍是维护者自审和自动化验证范围，不等于第三方生产网络、连续写作或像素级 UI 验收。

## 仍然存在的技术债

- `AI_MODES` 中仍保存兼容用的简短 `p` 文本，实际请求优先读取 Prompt Skill；移除前需要覆盖旧浏览器数据和所有快速入口的迁移测试。
- Playwright 已覆盖 v1–v4→v5 已知字段迁移、历史坐标重映射，以及“本地执行→候选→跨文档阻止→确认写入→刷新恢复候选→恢复写入前”的主链路；仍缺 Prompt Skill 覆盖值的完整浏览器迁移和真实供应商网络测试。
- OpenAI Chat Completions、Responses、Anthropic Messages 与 Ollama 目前使用本地模拟服务做请求/响应和流式契约测试，不使用真实密钥。它能防止适配器形状回归，但不能证明任意代理商、模型名和生产网络都可用。
- 响应式 CSS 已覆盖三栏桌面、窄笔记本和手机，但 CI 仍缺少 1366×768、1024×768 与 390×844 的截图差异基线；结构测试不能替代像素级布局验收。
- 当前第三方 capability 只登记 manifest；公开 Agent Skills / MCP 目录也只创建停用的 `external:*` 元数据，服务端明确拒绝启用和执行。远程代码型 Skill 沙箱尚未实现，不能宣称“粘贴链接即可运行”。
- 浏览器项目与后端项目有意分开存储；当前只有后端→浏览器显式导入，尚无经过冲突检测的反向迁移。
- 2026-07-22 17:04:25 UTC 的 GitHub API 指标快照已经过期。申请前必须刷新，并只使用真实的 Release 下载、独立用户、外部贡献或下游集成证据。

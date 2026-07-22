# Writing Workshop 全量自审记录

审查日期：2026-07-23（UTC+8）
审查对象：当前 `main` 工作树中的产品前端、Go 同源后端、持久化格式、公开页面、示例与 Markdown 文档。

## 结论

当前产品已经形成三个明确而不混用的能力层：浏览器 Prompt Skill 管理 32 个功能按钮的隐形提示词；后端 Skill / 技能包负责可组合执行；项目操作台负责本地资料、分类、备份与删除。多 Skill 选择会显式传给后端，浏览器 Prompt Skill 可搜索、修改、恢复、单独导入导出并随项目 v3 备份，技能包和能力分类有真实 CRUD、校验、测试与磁盘记录。

GitHub Pages 正式在线版与后端增强模式有明确运行时边界。Pages 是真实公开域名上的正式部署，可以使用浏览器本地项目与分类、查看 Skill 目录和选择状态；当前默认 Pages 工作流未同时部署 Go API，因此单独打开该版本时不执行 `/api/run` 或保存后端技能包。这是服务端边界，不是“预览站”与“真站”的区别，也不把 Pages 与 OpenAI Sites 混为同一托管产品。

## 本轮发现与处理

| 严重度 | 发现 | 处理 | 记录位置 |
|---|---|---|---|
| 高 | 项目、角色、记忆和历史的部分列表把用户文本拼入 `innerHTML` 或内联属性 | 活跃项目管理改用 DOM + `textContent`；角色/记忆/历史与移动列表增加转义或 URI 编码；后台角色不再把 JSON 拼进 `onclick` | `web/static/app.html`、`web/static/admin.html`、`web/static/js/product-extensions.js` |
| 高 | AI 检测返回的可疑句子继续通过 `innerHTML` 和内联 `onclick` 生成按钮，模型文本可进入 HTML 解析 | 改为 `createElement`、`textContent`、属性赋值和 `addEventListener`；重绘前清空旧结果 | `web/static/app.html`、`web/static/app.js`、`web/static/js/settings.js` |
| 中 | “查AI”默认提示词要求自由命名维度，解析器却固定读取六个中文标签；缺少字段时界面伪造 `50` 分雷达 | 默认 Prompt Skill 固定六个协议字段；任一字段缺失时不展示雷达，只保留原始模型说明 | `web/static/js/prompt-skills.js`、`web/static/app.html`、`web/static/app.js`、`web/static/js/settings.js` |
| 中 | AI 片段判断误把函数对象 `isAIFragged` 当成布尔值，且没有先确认片段仍在编辑器 | 改为实际 `isAIFlagged` 值；只标记当前正文中确实存在的片段 | `web/static/app.html`、`web/static/app.js`、`web/static/js/settings.js` |
| 中 | 项目列表只能“点击打开”，没有维护操作台 | 增加搜索、分类筛选、重命名、复制、分类、导出和精确级联删除 | `web/static/js/product-extensions.js` |
| 中 | UI 已允许多个 Skill，但缺少组合预设和分类筛选 | 增加选中数量、分类过滤、清空和三个内置技能包；隐藏分类中的选择不会丢失 | `web/static/js/workflows.js` |
| 中 | 技能包和自定义分类没有后端事实层 | 新增 `.ainovel/skill-packs.json`、`.ainovel/categories.json` 与 CRUD；校验只读项、重复 ID 和未知 Skill | `internal/web/catalog.go`、`internal/web/server_test.go` |
| 中 | 项目 JSON 导出未包含记忆与浏览器 Prompt Skill 覆盖值 | 项目包升级为版本 3，导出和导入 `memories` 与 `prompt_skill_overrides`；旧版本继续兼容 | `web/static/js/product-extensions.js`、`web/static/app.html`、`web/static/js/prompt-skills.js` |
| 中 | 桌面“上下文用量”和生成按钮排在全部 30 个能力卡之后，常见屏幕首次打开看不到；功能目录与请求操作共用一个滚动层 | 将补充指令、上下文预算和生成按钮移入 AI 面板固定请求栏；能力目录单独滚动；切换标签时同步显示状态，并为低高度桌面压缩而不隐藏关键信息 | `web/static/app.html`、`web/static/css/product-extensions.css`、`web/static/js/workflows.js` |
| 中 | `updateContextBar()` 在没有 API 配置时提前返回，Pages 正式在线版显示“-”，把本地可完成的估算错误绑定到模型连接 | 上下文估算改为始终可用，显示 token / 上限 / 百分比；桌面与手机共用状态，服务端返回 usage 后再显示实际输入输出 | `web/static/app.html`、`web/static/app.js`、`web/static/js/state.js`、`web/static/js/ai.js` |
| 低 | URL 导入按钮只显示“即将推出” | 从当前入口和旧静态片段删除，不再展示不存在的能力 | `web/static/app.html`、`web/static/parts/body.html` |
| 低 | 联系方式失效且多个页面品牌图标不一致 | 联系统一指向已校验的 `https://linux.do/u/The_Fo0l`；新 SVG 作为 favicon、品牌与顶栏图标 | `web/static/icons/app-icon.svg`、公开 HTML 页面 |
| 低 | AI 底栏仍沿用大脑图标，30 个能力卡用字符或 Emoji 充当图标 | 新增 AI 工作台符号和 30 个一对一 SVG；脑形只留给“记忆”；桌面和手机共用同一映射 | `web/static/icons/ai-mode-icons.svg`、`web/static/js/ai-mode-icons.js` |
| 低 | “实时灵感”和“资料搜索”仍复用通用能力图标 | 新增 `mode-inspiration`、`mode-research`，保持快捷工具语义可辨 | `web/static/icons/ai-mode-icons.svg`、`web/static/js/ai-mode-icons.js` |
| 文档 | 现行产品说明与继承引擎历史文档混在同一目录 | 新增状态地图；历史架构、上下文、观测和重构文档增加醒目标识 | `docs/README.md` |
| 文档 | 功能、提交、CI、Pages 和实测证据散落在聊天与多份文档中 | 新增人类可读时间线与机器可读证据账本，当前文档互链，历史页只保留来源层并回链 | `docs/UPDATE_TIMELINE.md`、`docs/RELEASE_EVIDENCE.json` |
| 质量 | CI 只做 JavaScript 语法检查，无法发现 Skill / 图标 / SVG 映射漏项、断链或证据 JSON 损坏 | 增加无依赖静态产品契约，并接入 `make check` 与 GitHub Actions | `scripts/check-static.mjs`、`Makefile`、`.github/workflows/ci.yml` |

## 存储与删除边界

- 浏览器项目、章节、大纲、人物和记忆保存在当前站点 IndexedDB。
- 浏览器自定义项目/记忆分类保存在 localStorage；项目记录保存 `category_ids`。
- 浏览器 Prompt Skill 覆盖值保存在当前 origin 的 localStorage 键 `ww_prompt_skills_v1`；项目 v3 备份只携带覆盖值，不改写仓库默认提示词。
- 后端能力、技能包和分类分别保存在当前工作目录的 `.ainovel/capabilities.json`、`.ainovel/skill-packs.json`、`.ainovel/categories.json`。
- 删除一个浏览器项目会先明确确认，再按该项目 ID 删除大纲、人物、章节和记忆。删除分类不会删除项目，也不会静默重写后端历史记录。
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

当前容器没有 Go 与 Docker 可执行文件，因此本记录不伪造本地 Go 测试结果。完整服务端验证由 GitHub Actions 执行。

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

## 仍然存在的技术债

- `app.html` 仍是较大的历史单文件，仓库中也保留未被入口加载的旧拆分脚本。现行入口已在 `DEVELOPMENT.md` 标明，后续应在有端到端浏览器测试后逐步去重。
- 同一段历史 AI 逻辑在 `app.html`、`app.js`、`js/settings.js` 中仍有重复副本；本轮同步修复三处，但长期应确定唯一入口并用浏览器端到端测试防止再次漂移。
- `AI_MODES` 中仍保存一组旧内联 `p` 提示词，实际请求优先读取 Prompt Skill；应在兼容迁移完成后移除重复事实源。
- 当前 CI 有 Go、JavaScript 语法与服务 smoke test，但还没有覆盖 localStorage 持久化、导入迁移和 AI 结果安全渲染的自动浏览器测试。
- 静态产品契约现在能拦截清单和资源漂移，但它不替代真实浏览器交互；下一步应为 Prompt Skill 保存/恢复和项目 v2→v3 迁移增加无头浏览器测试。
- 响应式 CSS 已覆盖三栏桌面、窄笔记本和手机，但 CI 仍缺少 1366×768、1024×768 与 390×844 三个视口的截图差异测试；静态契约只能确认结构存在，不能替代像素级布局验收。
- 当前第三方 capability 只登记 manifest；远程代码型 Skill 沙箱尚未实现，不能宣称“粘贴链接即可运行”。
- 浏览器分类与后端分类有意分开存储，目前没有双向同步；这是明确边界，但未来可增加显式导入/导出，而不是后台静默合并。
- 2026-07-22 17:04:25 UTC 的 GitHub API 快照是 1 Star、0 Fork、0 Open Issue、0 Subscriber；没有可验证 Release 下载量、独立用户或外部贡献证据。申请前必须刷新，不能把功能数量替代生态影响。

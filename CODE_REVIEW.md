# Writing Workshop 全量自审记录

审查日期：2026-07-22
审查对象：当前 `main` 工作树中的产品前端、Go 同源后端、持久化格式、公开页面、示例与 Markdown 文档。

## 结论

本轮把原先分散或只有展示的能力补成了可操作闭环：多 Skill 选择已经由前端明确传递到后端；技能包和能力分类有真实 CRUD、校验、测试与磁盘记录；浏览器项目管理具备搜索、筛选、重命名、复制、分类、单项目导出和确认删除；不存在的 URL 导入入口已删除。

静态 Pages 与本地后端仍是两种不同运行模式。Pages 可以使用浏览器本地项目与分类、查看 Skill 目录和选择状态，但不能执行 `/api/run` 或保存后端技能包。界面和文档都保留这一区分，不把静态选择包装成已执行。

## 本轮发现与处理

| 严重度 | 发现 | 处理 | 记录位置 |
|---|---|---|---|
| 高 | 项目、角色、记忆和历史的部分列表把用户文本拼入 `innerHTML` 或内联属性 | 活跃项目管理改用 DOM + `textContent`；角色/记忆/历史与移动列表增加转义或 URI 编码；后台角色不再把 JSON 拼进 `onclick` | `web/static/app.html`、`web/static/admin.html`、`web/static/js/product-extensions.js` |
| 中 | 项目列表只能“点击打开”，没有维护操作台 | 增加搜索、分类筛选、重命名、复制、分类、导出和精确级联删除 | `web/static/js/product-extensions.js` |
| 中 | UI 已允许多个 Skill，但缺少组合预设和分类筛选 | 增加选中数量、分类过滤、清空和三个内置技能包；隐藏分类中的选择不会丢失 | `web/static/js/workflows.js` |
| 中 | 技能包和自定义分类没有后端事实层 | 新增 `.ainovel/skill-packs.json`、`.ainovel/categories.json` 与 CRUD；校验只读项、重复 ID 和未知 Skill | `internal/web/catalog.go`、`internal/web/server_test.go` |
| 中 | 项目 JSON 导出未包含记忆 | 项目包升级为版本 2，导出和导入 `memories` | `web/static/js/product-extensions.js`、`web/static/app.html` |
| 低 | URL 导入按钮只显示“即将推出” | 从当前入口和旧静态片段删除，不再展示不存在的能力 | `web/static/app.html`、`web/static/parts/body.html` |
| 低 | 联系方式失效且多个页面品牌图标不一致 | 联系统一指向已校验的 `https://linux.do/u/The_Fo0l`；新 SVG 作为 favicon、品牌与顶栏图标 | `web/static/icons/app-icon.svg`、公开 HTML 页面 |
| 低 | AI 底栏仍沿用大脑图标，30 个能力卡用字符或 Emoji 充当图标 | 新增 AI 工作台符号和 30 个一对一 SVG；脑形只留给“记忆”；桌面和手机共用同一映射 | `web/static/icons/ai-mode-icons.svg`、`web/static/js/ai-mode-icons.js` |
| 文档 | 现行产品说明与继承引擎历史文档混在同一目录 | 新增状态地图；历史架构、上下文、观测和重构文档增加醒目标识 | `docs/README.md` |

## 存储与删除边界

- 浏览器项目、章节、大纲、人物和记忆保存在当前站点 IndexedDB。
- 浏览器自定义项目/记忆分类保存在 localStorage；项目记录保存 `category_ids`。
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
```

当前容器没有 Go 与 Docker 可执行文件，因此本记录不伪造本地 Go 测试结果。完整服务端验证由 GitHub Actions 在提交 [`76dddaa`](https://github.com/zizegak916-glitch/writing-workshop/commit/76dddaaa7595e84f5dcfe689afa1530857289214) 上执行：

- [CI run 29931143163](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29931143163)：`go test ./...`、`go vet ./...`、release binary build、全部 JavaScript syntax、无密钥服务启动与 `/api/health` smoke test，结论 `success`。
- [Pages run 29931143073](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29931143073)：静态站部署，结论 `success`。
- 部署后从公开 URL 实测：首页可读到 Star 支持文案，`app.html` 已加载 `product-extensions.js`，多 Skill 目录、项目管理脚本和新 SVG 图标均返回 HTTP 200。

本轮联系方式与 AI 图标更正已在提交 [`93635ac`](https://github.com/zizegak916-glitch/writing-workshop/commit/93635ac4f7394eae945f88990e8a97497fac5012) 上重新验证：

- [CI run 29933253894](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29933253894)：结论 `success`。
- [Pages run 29933253856](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29933253856)：结论 `success`。
- 公开工作台浏览器复核：30 个能力按钮生成 30 个不同 SVG 引用，所有图标尺寸非零；AI 工作台入口使用 `mode-workshop`，大脑图标只保留给记忆功能。
- 公开关于页复核：联系方式文字与地址均为 `The_Fo0l`，页面中不存在旧用户名 `The_o0l`。

## 仍然存在的技术债

- `app.html` 仍是较大的历史单文件，仓库中也保留未被入口加载的旧拆分脚本。现行入口已在 `DEVELOPMENT.md` 标明，后续应在有端到端浏览器测试后逐步去重。
- 当前第三方 capability 只登记 manifest；远程代码型 Skill 沙箱尚未实现，不能宣称“粘贴链接即可运行”。
- 浏览器分类与后端分类有意分开存储，目前没有双向同步；这是明确边界，但未来可增加显式导入/导出，而不是后台静默合并。
- 本轮没有真实外部用户量、Star 数、Release 下载量或外部贡献证据；申请材料必须继续如实记录为空。

# Writing Workshop 更新时间线

> 状态：现行产品事实账本。更新时间统一使用 UTC+8；提交、CI、Pages 和公开页面证据必须能相互对应。最后同步：2026-07-23 02:10 UTC+8。

这份时间线只记录已经发生且可验证的产品事件，不用计划代替完成。详细功能说明仍以对应文档和代码为准；机器可读证据见 [`RELEASE_EVIDENCE.json`](RELEASE_EVIDENCE.json)。

## 2026-07-22：从上游引擎整理为独立产品

| 时间 | 事件 | Git 痕迹 | 验证 |
|---|---|---|---|
| 21:27 | 更正 Apache-2.0 上游归属与产品边界 | [`e799b94`](https://github.com/zizegak916-glitch/writing-workshop/commit/e799b94) | NOTICE、许可证与历史文档保留 |
| 21:33 | 采用 Writing Workshop 自有 Go module 与后端身份 | [`0697d1d`](https://github.com/zizegak916-glitch/writing-workshop/commit/0697d1d) | 构建入口、模块名与服务身份一致 |
| 21:36 | 增加维护工作流与开源申请证据草稿 | [`ae586e4`](https://github.com/zizegak916-glitch/writing-workshop/commit/ae586e4) | CI、贡献、安全与申请材料进入仓库 |
| 22:00 | 全量重做公开页面与写作工坊 UI | [`3715d15`](https://github.com/zizegak916-glitch/writing-workshop/commit/3715d15) | 首页、工作台、后台、文档页统一视觉 |
| 22:04 | 加入正式 Pages 页面截图和视觉证据 | [`d34c030`](https://github.com/zizegak916-glitch/writing-workshop/commit/d34c030) | [CI 29926863749](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29926863749)、[Pages 29926862790](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29926862790) 均成功 |
| 22:07 | GitHub Actions 升级到 Node 24 | [`e53449c`](https://github.com/zizegak916-glitch/writing-workshop/commit/e53449c) | 消除旧 Actions runtime 警告 |
| 22:58 | 上线多 Skill、技能包、能力分类、项目操作台与自定义分类 | [`76dddaa`](https://github.com/zizegak916-glitch/writing-workshop/commit/76dddaaa7595e84f5dcfe689afa1530857289214) | [CI 29931143163](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29931143163)、[Pages 29931143073](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29931143073) 均成功 |
| 23:00 | 把上一轮 CI、Pages 与公开 URL 验证写回审计记录 | [`da6156a`](https://github.com/zizegak916-glitch/writing-workshop/commit/da6156a) | 证据不只留在聊天记录 |
| 23:24 | 重画 AI 工作台和 30 个功能图标，修正维护者链接 | [`93635ac`](https://github.com/zizegak916-glitch/writing-workshop/commit/93635ac4f7394eae945f88990e8a97497fac5012) | [CI 29933253894](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29933253894)、[Pages 29933253856](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29933253856) 均成功 |
| 23:28 | 记录公开图标、Linux DO 联系页和 30 项映射复核 | [`1848823`](https://github.com/zizegak916-glitch/writing-workshop/commit/18488238de4ae9bd9789207fa7cd838ca27b0908) | [CI 29933564990](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29933564990)、[Pages 29933564722](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29933564722) 均成功 |
| 23:41 | 全站纠正 GitHub Pages 与 OpenAI Sites 的关系 | [`e42407b`](https://github.com/zizegak916-glitch/writing-workshop/commit/e42407b3ee9d25320d0da9846523fa8562d00a18) | [CI 29934579606](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29934579606)、[Pages 29934579651](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29934579651) 均成功 |

## 2026-07-23：Prompt Skill、审查与桌面布局

| 时间 | 事件 | Git 痕迹 | 验证 |
|---|---|---|---|
| 00:37 | 为 30 个模式卡和 2 个独立快捷工具加入 32 个实用 Prompt Skill；请求隐形注入；支持编辑、恢复、导入导出和项目 v3 备份 | [`3fdf36c`](https://github.com/zizegak916-glitch/writing-workshop/commit/3fdf36c136caf7561df964997e483ce74d8d7819) | [CI 29938799142](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29938799142)、[Pages 29938799040](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29938799040) 均成功；正式页显示 32 项，保存后刷新仍保留 |
| 01:17 | 全量同步现行文档与历史状态页；修复“查AI”字段/雷达解析漂移、缺失分数伪造 50 分、AI 句子按钮不安全拼接和快捷 Skill 图标复用；新增静态产品契约 | [`aceeb957`](https://github.com/zizegak916-glitch/writing-workshop/commit/aceeb9571f5b3a0eec835efbc05a8192e322276e) | [CI 29941672602](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29941672602)、[Pages 29941672654](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29941672654) 均成功；正式页与本地校验和一致 |
| 02:10 | 修复桌面上下文用量布局：能力目录独立滚动，补充指令、预算和生成按钮固定可见；估算不再依赖 API 配置，桌面与手机同步显示 | [`00c9883`](https://github.com/zizegak916-glitch/writing-workshop/commit/00c988300b54b3cbe8ef226202ba760587e836a3) | [CI 29945400780](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29945400780)、[Pages 29945400654](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29945400654) 均成功；正式 `app.html` 与请求栏 CSS 校验和同本地一致 |

## Prompt Skill 验证账

| 检查 | 结果 | 证据 |
|---|---|---|
| 功能覆盖 | 30 个模式卡 + 6 个快捷按钮映射到 32 个唯一 Prompt Skill；4 个快捷按钮复用同名能力 | 静态覆盖审计通过 |
| 本地持久化 | 保存、读取、恢复默认、独立导出、合并导入 | JavaScript 状态测试通过 |
| 正式域名交互 | “流程 → 内置 Prompt Skill → 查看与修改”可打开 32 项；修改后刷新仍显示“1 个已修改” | GitHub Pages 浏览器实测 |
| 部署内容 | 正式站 Prompt JS、快捷图标 SVG 与提交内容校验和一致 | Prompt JS `e2f45ae2…2e3e`；图标 SVG `a6d7ac2f…e02d` |
| 自动回归 | Skill 清单、图标映射、SVG symbol、内联脚本、静态链接和证据 JSON | 本地与 CI 的 `scripts/check-static.mjs` 均通过 |
| 服务端边界 | Pages 是正式静态在线版；浏览器本地管理可用，模型执行仍取决于实际接入的 `/api` | README、教程、API、配置和审计文档一致 |

## 文档同步规则

一次影响公开行为、数据格式或安全边界的变更，至少同时更新：

1. `CHANGELOG.md`：面向版本的行为变化。
2. `docs/UPDATE_TIMELINE.md`：时间、提交、CI、Pages 和实测证据。
3. `CODE_REVIEW.md`：发现、修复、剩余技术债和未能执行的检查。
4. 对应契约：`API.md`、`CONFIG.md`、`docs/CAPABILITY_PROTOCOL.md` 或 `SECURITY.md`。
5. 用户入口：`README.md` 与 `web/static/docs.html`。
6. 申请证据：只有在出现真实、可公开复核的新证据时才更新 `docs/CODEX_FOR_OSS_APPLICATION.md`。

历史引擎文档不追写 Web 产品细节，只维护清晰的状态标签并链接回这份时间线，避免再次把历史层误认成当前执行层。

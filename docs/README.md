# Writing Workshop 文档地图

更新：2026-07-23（UTC+8）

本目录同时保留“现行产品文档”和“继承引擎历史文档”。状态以本表为准；文件名或文档中的旧项目名不能单独证明它仍是当前执行层。

| 文档 | 状态 | 用途 |
|---|---|---|
| [`../README.md`](../README.md) | 现行产品 | 产品定位、启动、界面、数据与安全边界 |
| [`../API.md`](../API.md) | 现行产品 | 同源 API、能力、技能包与分类契约 |
| [`../CONFIG.md`](../CONFIG.md) | 现行产品 | Provider、密钥、监听地址与持久化路径 |
| [`../DEVELOPMENT.md`](../DEVELOPMENT.md) | 现行产品 | 当前入口文件、后端实现和验证方式 |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | 现行产品 | 贡献流程与变更约束 |
| [`../SECURITY.md`](../SECURITY.md) | 现行产品 | 漏洞报告、部署和用户输入安全 |
| [`../CODE_REVIEW.md`](../CODE_REVIEW.md) | 现行审计记录 | 最近一次全仓检查范围、发现与实测结果 |
| [`../CHANGELOG.md`](../CHANGELOG.md) | 现行变更记录 | 已加入但尚未发布的产品变化 |
| [`UPDATE_TIMELINE.md`](UPDATE_TIMELINE.md) | 现行事实账本 | 产品事件、提交、CI、Pages 与公开实测时间线 |
| [`RELEASE_EVIDENCE.json`](RELEASE_EVIDENCE.json) | 机器可读证据 | 已验证提交、Actions、校验和和时间点指标 |
| [`CAPABILITY_PROTOCOL.md`](CAPABILITY_PROTOCOL.md) | 现行协议 | Skill manifest、多 Skill 与技能包 |
| [`UI_DESIGN_SYSTEM.md`](UI_DESIGN_SYSTEM.md) | 现行设计 | 彩色编辑部、图标、响应式与状态语义 |
| [`CODEX_FOR_OSS_APPLICATION.md`](CODEX_FOR_OSS_APPLICATION.md) | 申请工作稿 | 只记录可验证证据和仍缺失的证据 |
| [`UPSTREAM_ENGINE.md`](UPSTREAM_ENGINE.md) | 历史 + 来源 | 上游归属和继承能力说明 |
| [`architecture.md`](architecture.md) | 历史 / 引擎层 | 上游长篇 Agent 运行时架构基线 |
| [`context-management.md`](context-management.md) | 历史 / 引擎层 | 某阶段上下文压缩与恢复设计 |
| [`observability.md`](observability.md) | 历史 / 引擎层 | `/diag` 和 meta 工件观测手册 |
| [`refactor-flow-driven.md`](refactor-flow-driven.md) | 历史决策 | 2026-04-20 Coordinator 路由重构记录 |

## 真实性规则

- 当前 UI 与行为以 `web/static/app.html` 实际加载的脚本为准；未加载的旧拆分文件不能作为功能已上线的证据。
- 当前后端接口以 `internal/web/server.go` 的路由和对应测试为准。
- GitHub Pages 是当前正式公开在线版，与 OpenAI Sites 无从属关系。它以静态文件托管，浏览器本地能力可正式使用；默认部署本身没有常驻 Go API。工作台在 Pages 显示技能目录不等于技能已执行。
- 浏览器项目分类和后端能力分类是两套明确存储：前者属于当前站点 IndexedDB/localStorage，后者属于工作目录 `.ainovel/categories.json`。
- 浏览器 Prompt Skill 是第三套明确边界：默认定义在 `web/static/js/prompt-skills.js`，用户覆盖值在当前域名 `localStorage` 的 `ww_prompt_skills_v1`，项目包 v3 只携带覆盖值。
- 历史文档继续保留，用状态标签避免把旧引擎设计误认成当前产品执行层。

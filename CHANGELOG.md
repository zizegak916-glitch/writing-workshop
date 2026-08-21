# Changelog

## v0.2.5 — 2026-07-29 — 核心数据完整性与后端 API 对齐

- 编辑器在切换项目/文档、导出和页面隐藏前提交当前标题与正文；IndexedDB 写入等待事务完成，保存失败会阻止切换，不再把“请求已发出”误报成“已落盘”。
- 修复 Esc 在普通模式覆盖编辑器、人物中央编辑器假保存、非活动项目删除后错误切换，以及笔记新增时未等待激活等状态缺陷。
- 项目包升级到 v5，加入按项目隔离的候选与恢复快照；导入使用单事务并重映射旧文档 ID，删除以单事务清理项目及全部子记录。
- 多模型槽位区分加载、成功和错误；失败或超时结果不能被“应用一个/全部”写入正文。
- 自部署 Go 后端增加 Chat Completions、Responses、Anthropic Messages、Ollama 四协议原始适配和 `/api/ai/stream`，`/api/run` 的 AI 任务转发上游真实增量。
- 静态运行模式改为同源健康检查探测，自定义 Pages/静态域名不再因不是 `github.io` 而误向 `/api/config` 写入。
- API Key、自定义请求头采用显式清除；请求超时覆盖完整响应体/流；未知模型上下文上限保持未知，可由用户明确填写。
- 浏览器与 Go 合约测试扩展到事务保存、人物保存、v1–v4→v5、历史坐标重映射、级联删除、失败候选、配置清除语义、四协议请求/usage 和真实 SSE。

## v0.2.4 — 2026-07-29 — API 网络适配层

- 将 Pages 与能力后台的浏览器直连统一到同一适配层，支持 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 和 Ollama `/api/chat`。
- Base URL 现在可填写域名、带前缀的兼容层地址或完整端点；按所选协议补全路径，不再把所有自定义服务都硬拼成 `/chat/completions`。
- 增加自动/Bearer/x-api-key/无鉴权、自定义请求头和 5–600 秒请求超时；无密钥的本地或局域网服务可以保存。
- 浏览器直连增加真实 SSE / NDJSON 增量解析，兼容四类文本响应和 usage 字段；非流式接口仍可回退为完整候选。
- 上游错误会保留 HTTP 状态、可读错误正文和请求 ID；网络错误区分地址、DNS/代理、HTTPS 与 CORS。
- 后端 `/api/config` 接受 provider `extra` / `extra_body`，配置读取会移除自定义请求头，避免把其中的凭据回传到浏览器。
- 新增 API 适配器契约测试和 Pages 无密钥配置回归断言。

## v0.2.3 — 2026-07-28 — Pages 自定义 API 回归修复

- 恢复 GitHub Pages 浏览器 BYOK：Provider、Model、Base URL 与 API Key 保存在当前浏览器，并直连用户配置的模型接口。
- Pages 保存和测试不再向静态 `/api/config` 发起 POST，修复 HTTP 405。
- 自部署版继续使用同源 `/api/config` 与 `/api/ai`，后端密钥托管行为不变。
- 自定义 OpenAI 兼容 Base URL 可填 `/v1` 根路径或完整 `/chat/completions` 端点。
- 浏览器直连请求移除内部代理字段，并为网络 / CORS 失败返回明确提示。
- Playwright 增加 Pages 模式配置、持久化、直连请求形状和“零 `/api/config` POST”回归断言。

## v0.2.2 — 2026-07-28 — 外部目录来源校正

- 将已经由上游标为 deprecated 的 `openai/skills` 从现行入口改为迁移参考。
- 增加当前维护的 `openai/plugins`、Agent Skills 开放标准和 OpenAI Remotion Plugin 示例。
- 所有外部条目仍只登记为停用元数据；未增加第三方代码执行能力。

All notable Writing Workshop changes are recorded here. The project follows Semantic Versioning after the first public release.

## Unreleased

### 2026-08-21 product ownership boundary

- Removed LINUX DO and the service console from public product navigation and contact surfaces; the forum remains an explicitly external acknowledgement and historical publication source.
- Renamed `admin.html` to the local service console in user-facing copy. Static deployments now hide server-only tabs, while self-hosted deployments retain every existing server configuration and management function.
- Made the workbench service entry runtime-dependent, moved Pages API setup to the canonical workbench settings flow, and replaced the landing-page Star request with reproducible issue reporting.
- Added a product-boundary document and static regression rules covering public navigation, external-community placement and optional-service visibility.

### 2026-07-28 credibility and recovery pass

- Added explicit v1-v3 to v4 browser bundle migration with regression fixtures for chapters, legacy memories, categories and Prompt Skill overrides.
- Bound workflow history candidates and pre-write snapshots to their original project and document; recovered candidates are read-only in the wrong document instead of being inserted or appended at an unrelated cursor.
- Expanded the Playwright product path to cover local execution, candidate review, wrong-document blocking, confirmed write, reload recovery and pre-write restoration.
- Added local mock contracts for OpenAI-compatible and Anthropic provider requests without using paid credentials.
- Added a reviewed Agent Skills / MCP source catalog. Importing an entry stores disabled metadata only; `external:*` entries cannot be enabled or executed.
- Added repository-wide `gofmt` enforcement and formatted the existing Go source set.
- Added a seven-day field-test issue form so independent users can report completed core-loop runs, migration results and data-integrity failures without sharing manuscripts.

### 2026-07-26 product integrity pass

- Split the historical all-in-one workbench into one canonical `main.css` and `workbench.js`, removed unused duplicate frontend modules, and added a static contract that rejects inline regressions, orphan assets and duplicate core functions.
- Added project notes on desktop and mobile, upgraded browser project bundles to v4, and included notes, custom categories, memories and Prompt Skill overrides in export, import, duplicate and cascade-delete flows.
- Replaced implicit browser-to-backend project mirroring with an explicit “import from self-hosted backend” action, keeping IndexedDB and the Go workspace as separate, author-controlled data stores.
- Extended candidate safety to regular, mobile, quick, multi-model, humanization and recursive writing flows: generated output is bound to its source document, destructive stale writes are blocked, and pre-write snapshots are recorded for recovery.
- Made custom project categories editable by name, scope and color, and included project notes in workflow context selection and project statistics.
- Escaped imported titles, diff fragments and recursive-planning output; limited JSON request bodies to 8 MiB, rejected trailing JSON values, and bound the default Docker port to loopback.
- Added Playwright product smoke tests for desktop/mobile note persistence, project creation, context metering and import-preview safety; CI now installs Chromium and runs the browser suite.
- Replaced the remaining text-based top-bar AI mark with the repository-native colored writing icon.

### 2026-07-24 community publication compliance

- Added an explicit repository-level recognition link to the LINUX DO community and retained the verified maintainer profile link, so the project itself—not only a forum draft—meets the community-link requirement for open-source promotion.
- Kept project attribution, Apache-2.0 licensing, NOTICE and upstream history unchanged.

### 2026-07-23 documentation and quality pass

- Rebuilt the desktop AI request area as a persistent panel dock so the extra instruction, context budget and generate action remain visible while the 30-capability catalog scrolls independently.
- Made context estimation work before API configuration, added explicit token/limit/percentage/model labels, synchronized desktop and mobile meters, and separated estimates from the previous request's actual usage.
- Extended the static product contract to guard the request-dock structure, unique responsive meter nodes, workflow-tab coordination and the API-independent estimate boundary.
- Added a repository-wide update timeline and machine-readable release-evidence ledger linking product events to commits, CI, Pages deployments and public checks.
- Synchronized the current README, user guide, API, configuration, development, contribution, security, capability, UI, review and application documents; historical engine documents now point back to the current timeline.
- Tightened the built-in “查AI” Prompt Skill to the six fields the parser actually consumes, and stopped rendering a radar chart when any required score is missing instead of inventing a neutral score.
- Replaced AI-returned sentence fragments built through `innerHTML` and inline handlers with DOM-safe buttons, and corrected the AI-fragment flag check so only text actually present in the editor is marked.
- Added distinct repository-native icons for “实时灵感” and “资料搜索” rather than reusing generic Prompt Skill glyphs.
- Added a dependency-free static product contract to CI for Prompt Skill coverage, icon/SVG integrity, inline-script parsing, local links and release-evidence JSON.

### 2026-07-22 product update

- Added persistent skill-pack and category APIs, three built-in multi-skill presets, and three new writing skills for continuity, character voice and scene pacing.
- Added visible multi-Skill selection, pack application, category filtering and a static catalog preview that does not pretend to execute without a backend.
- Added 32 practical browser-local Prompt Skills for every AI mode and quick tool, with hidden request injection, searchable editing, per-skill reset, standalone import/export and project-backup restore.
- Added browser-local project search, rename, duplicate, category assignment, per-project export and confirmed cascade deletion.
- Added custom memory categories, a version-3 project export containing memories and Prompt Skill overrides, plus backward-compatible import.
- Added a hand-drawn repository-native SVG app icon across the workbench, product pages and console.
- Replaced the generic brain AI entry and all 30 text/Emoji capability glyphs with a repository-native SVG icon family for desktop and mobile.
- Removed the nonfunctional URL-import control and replaced the obsolete contact link with verified Linux DO user `The_Fo0l`.
- Corrected product terminology across the UI and documentation: GitHub Pages is the formal public online deployment, not a preview or a Sites layer; the optional backend is described separately as a server-side capability extension.
- Added a truthful GitHub Star support panel to the landing page.
- Updated current documentation, added a documentation status map, and labeled inherited engine documents as historical references.

### Security

- Replaced project-manager and admin character rendering paths that interpolated user-controlled text with escaped or DOM-safe rendering.
- Escaped memory content and custom category labels before rendering.

### Added

- Explicit context packets for current text, project settings, outlines, characters and memories, including token estimates.
- Composable capability manifests with visible instructions, steps and permissions.
- Streaming candidate generation, cancellation, confirmation-before-write and pre-apply snapshots.
- Keyless `serve --demo` mode, configurable bind host and `/api/health`.
- Project-owned Go module, binary, Docker image, installer and release configuration.
- Push/PR CI covering Go tests, vet, build, JavaScript syntax and an offline server smoke test.

### Security

- Replaced wildcard CORS with same-origin defaults and an explicit trusted-origin allowlist.
- Preserved local-only binding as the CLI default.

### Attribution

- Kept the Apache-2.0 upstream engine attribution and historical design documentation visible.

# Writing Workshop 更新时间线

> 状态：现行产品事实账本。历史条目沿用当时记录的 UTC+8；新条目使用明确时区。提交、CI、Pages 和公开页面证据必须能相互对应。最后同步：2026-08-23 02:31 UTC+8。

## 2026-08-22：原生引擎与授权语料校准（发布前）

| 时间（UTC） | 事件 | 当前证据状态 |
|---|---|---|
| 02:31 | 当前 Go import graph 移除 `agentcore` / `litellm`，以 `internal/engine` 实现消息、工具、上下文、协议、子任务与安全编辑；配置新写入统一到 `.writing-workshop` | [PR #16](https://github.com/zizegak916-glitch/writing-workshop/pull/16) 的 [CI 32591059710](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/32591059710) 已通过完整 Go 测试、vet、构建、服务 smoke 与 Chromium Playwright；尚未合并，不冒充 main/Pages 发布证据 |
| 02:31 | 新增授权语料校准：原文瞬时解析，只持久化 SHA-256、元数据、聚合指标和候选；Pages 浏览器内分析，自部署使用 Go API | Go corpus 测试、双路径静态契约和 Playwright 应用/回退闭环均通过；真实用户校准效果尚无第三方反馈 |
| 02:31 | 项目包升级为 v6，携带语料统计/校准历史但不含原文，兼容 v1–v5 导入 | PR CI 已覆盖 v1–v5→v6、导入事务、候选恢复与语料应用/回退；Release 尚未创建 |

本节在合并与发布后继续补 main、Pages 和 Release 链接；当前只记录已经发生的 PR 与 CI，不把“PR 通过”记成“公开发布成功”。

这份时间线只记录已经发生且可验证的产品事件，不用计划代替完成。详细功能说明仍以对应文档和代码为准；机器可读证据见 [`RELEASE_EVIDENCE.json`](RELEASE_EVIDENCE.json)。

## 2026-08-21：纠正产品归属边界

| 时间 | 事件 | Git 痕迹 | 验证 |
|---|---|---|---|
| 08:18 | 明确 GitHub Pages 是 Writing Workshop 浏览器产品；将 `admin.html` 降级为自部署环境中的“本地服务控制台”，并在 Pages 模式隐藏服务端能力；从公开导航、联系入口和产品身份中移除 LINUX DO，只在历史与致谢位置保留外部社区出处；补充产品边界文档和相应静态、浏览器回归 | [`9950ffa`](https://github.com/zizegak916-glitch/writing-workshop/commit/9950ffa429755cb449b9396d0bf940a1a6159db2)、[PR #15](https://github.com/zizegak916-glitch/writing-workshop/pull/15) | [PR CI 32431865044](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/32431865044)、[main CI 32432000586](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/32432000586)、[Pages 32432000593](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/32432000593) 均为 `success`；公开 6 个页面均为 HTTP 200，`index.html` 与 `admin.html` 的 SHA-256 同合并源码一致 |

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

## 2026-07-24：社区发布合规补全

| 时间 | 事件 | Git 痕迹 | 验证 |
|---|---|---|---|
| 13:09 | 在仓库 README 中明确链接并认可 LINUX DO 社区，同时保留维护者社区账号；补写 Changelog，不以论坛正文代替项目侧认可 | [`ac663a9`](https://github.com/zizegak916-glitch/writing-workshop/commit/ac663a907419c456221c4ae03d921bf63b1ed9b4)、[`1f41045`](https://github.com/zizegak916-glitch/writing-workshop/commit/1f410452f525c7ae4f19cda84330aa0f3d01e9ed) | README 已出现 `https://linux.do/` 明确认可链接；Apache-2.0、NOTICE、上游署名与历史未改动 |

## 2026-07-26：本地优先工作台完整性审计

| 时间 | 事件 | Git 痕迹 | 验证 |
|---|---|---|---|
| 14:20 | 建立唯一工作台前端入口并删除未引用副本；上线桌面/移动项目笔记、v4 项目包、分类修改、显式后端导入与全 AI 写入快照；清除浏览器遗留 Key；加固 JSON / 文件导入；加入 Playwright 产品测试 | [`5ea9f26`](https://github.com/zizegak916-glitch/writing-workshop/commit/5ea9f26786eb8fe7c7127ae13b8f39a4b959b968) | 隔离 Go 1.25.5 环境下 `make check` 通过：Go test、vet、build、全量 JS 语法、静态产品契约和服务 smoke；本地 HTTP 检查 9 个页面/API/资源均为 200，拼接双 JSON 返回 400。当前容器禁止 Chromium 单例 socket，不把浏览器测试写成已在本地通过 |
| 14:30 | 修正浏览器测试等待 IndexedDB 笔记激活的竞态并完成发布验收 | [`10d3a2a`](https://github.com/zizegak916-glitch/writing-workshop/commit/10d3a2a7549c80e2dc64cd7000bb3d1563c15606) | [CI 30191114231](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30191114231)、[Pages 30191114238](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30191114238) 均为 `success`；CI 的真实 Chromium 已通过桌面项目、遗留 Key 清除、笔记持久化、安全导入预览、上下文用量和移动端笔记烟雾测试。公开 `app.html`、CSS、JS、SVG、首页与教程均为 HTTP 200 且 SHA-256 与本地一致 |

## 2026-07-28：可信闭环与外部能力目录

| 时间 | 事件 | Git 痕迹 | 验证 |
|---|---|---|---|
| 23:47 | 将维护重点收回到“生成候选 → 人工确认 → 安全写入”：补齐 v1–v3 项目包迁移、候选错文档拦截、刷新后候选恢复、写入前快照恢复；加入 OpenAI-compatible / Anthropic 本地模拟协议测试；增加公开 Agent Skills / MCP 来源目录，但只登记元数据，不执行第三方代码 | [`e86912b`](https://github.com/zizegak916-glitch/writing-workshop/commit/e86912bf6304f887ec6d18187f31b26027c4316e) | 首轮 [CI 30375060458](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30375060458) 的 Playwright 在流程页检查助手预算时失败，Pages 成功；失败没有被写成通过 |
| 23:53 | 修正浏览器验收步骤，回到“助手”页后再检查桌面上下文预算 | [`3d5319d`](https://github.com/zizegak916-glitch/writing-workshop/commit/3d5319d5f125fdbd8795eb04925c083600359608) | [CI 30375358854](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30375358854) 与 [Pages 30375358581](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30375358581) 均为 `success`；Go test、vet、构建、格式、JS、静态契约、离线服务及真实 Chromium 产品烟雾测试全部通过。Pages 的工作台、教程和后台均为 HTTP 200，且 SHA-256 与当前源文件一致 |

## 2026-07-29：首个可下载 Release

| 时间 | 事件 | Git 痕迹 | 验证 |
|---|---|---|---|
| 00:00 | 发布 [`v0.2.1`](https://github.com/zizegak916-glitch/writing-workshop/releases/tag/v0.2.1)，提供 Linux、macOS、Windows 的 amd64 / arm64 构建和 SHA-256 校验文件 | [`5dcdedb`](https://github.com/zizegak916-glitch/writing-workshop/commit/5dcdedb4361c8cec2ed007e655986aa0f2182e2d) | [Release 30376002767](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30376002767)、[CI 30376002708](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30376002708)、[Pages 30376002806](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30376002806) 均为 `success`；Release 非草稿、非预发布，共 7 个资产 |
| 00:12 | 发布 [`v0.2.2`](https://github.com/zizegak916-glitch/writing-workshop/releases/tag/v0.2.2)：采用现行 `openai/plugins` 和 Agent Skills 开放标准，把已弃用的 `openai/skills` 降为迁移参考；目录扩为 12 个停用元数据入口 | [`92ea556`](https://github.com/zizegak916-glitch/writing-workshop/commit/92ea556c2a349c8f0321d7ae6b4404c939e9331c) | [Release 30376945660](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30376945660)、[CI 30376946186](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30376946186)、[Pages 30376945474](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30376945474) 均为 `success`；7 个发布资产齐全，Pages 的工作台、教程和后台均为 HTTP 200 且与源文件 SHA-256 一致 |
| 01:18 | 修复 Pages 自定义 API 的 405 回归：静态站改回浏览器本地 BYOK 与直连，自部署版继续使用后端托管；同时修正主 API 弹窗把 `apiKey` 错读成 `ApiKey` 的大小写缺陷 | [`00380ef`](https://github.com/zizegak916-glitch/writing-workshop/commit/00380efa094fe75de87ba55865feab71a587ebba)、[`31bcf60`](https://github.com/zizegak916-glitch/writing-workshop/commit/31bcf60b2886460228154bb4c2329595761690f0) | 首轮 [CI 30381568015](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30381568015) 与第二轮 [CI 30381993013](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30381993013) 的失败均保留：前者暴露异步测试等待问题，后者定位到字段 ID 大小写错误；最终 [CI 30382297907](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30382297907) 与 [Pages 30382294498](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30382294498) 均成功。真实 Chromium 断言保存时零次 POST `/api/config`、配置写入当前浏览器、直连请求的 URL / Authorization / Model / Body 正确 |
| 01:23 | 发布 [`v0.2.3`](https://github.com/zizegak916-glitch/writing-workshop/releases/tag/v0.2.3)，交付 Pages 自定义 API 回归修复及 Linux、macOS、Windows 构建 | [`fdfc148`](https://github.com/zizegak916-glitch/writing-workshop/commit/fdfc14839bdebbb82000dc198edf368cc6b3bb45) | [Release 30382489031](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30382489031)、[CI 30382489435](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30382489435)、[Pages 30382489294](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30382489294) 均为 `success`；Release 非草稿、非预发布，共 7 个资产；公开 `app.html`、`workbench.js` 与 `admin.html` 的 SHA-256 同源文件一致 |
| 10:58 | 将 Pages 与自部署 API 接入统一到协议感知适配器：支持 Chat Completions、Responses、Anthropic Messages、Ollama Chat，补齐域名/API 根路径/完整端点归一化、Bearer / `x-api-key` / 无鉴权、连接超时、安全自定义请求头、SSE/NDJSON 真流式解析和可诊断上游错误 | [`91cfcc5`](https://github.com/zizegak916-glitch/writing-workshop/commit/91cfcc5b3c58983e7c182f0a0b712eb76bcb7a05) | 首轮 [CI 30418281146](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30418281146) 只有 Chromium 在操作折叠的高级字段时失败；Go 格式、测试、vet、构建、JS、适配器契约、静态契约和离线服务均通过，[Pages 30418281148](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30418281148) 成功。失败未冒充产品通过 |
| 11:03 | 修正浏览器验收脚本，先展开高级网络设置再验证无密钥 Ollama；发布 [`v0.2.4`](https://github.com/zizegak916-glitch/writing-workshop/releases/tag/v0.2.4) | [`bc18e5d`](https://github.com/zizegak916-glitch/writing-workshop/commit/bc18e5de4d6975386be04dd38f697c64f20cf229) | [CI 30418506571](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30418506571)、[Pages 30418506586](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30418506586)、[Release 30418281198](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30418281198) 均为 `success`；Release 共 7 个资产。真实 Chromium 覆盖 Pages 直连、零 POST 静态 `/api/config` 和无密钥 Ollama 配置；正式页 4 个关键文件与源码 SHA-256 一致 |
| 19:18 | 完成核心数据完整性与后端协议对齐：项目包升级到 v5，导入/删除按项目单事务处理，候选历史隔离并重映射坐标，切换与导出前强制完成稳定保存；自定义静态域名通过健康签名识别 Pages 模式，自部署后端统一支持四类协议和真实流 | [`6e254ac`](https://github.com/zizegak916-glitch/writing-workshop/commit/6e254ac6345b33d94d116050e7dfc25b59493a79)、[PR #8](https://github.com/zizegak916-glitch/writing-workshop/pull/8) | PR 首轮 [CI 30446509343](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30446509343) 暴露静态探测用例把预期 404 记成控制台错误；第二轮 [CI 30446700927](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30446700927) 暴露移动端仍等待重命名前标题；两项测试均按真实状态修正。最终 PR [CI 30446893056](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30446893056)、main [CI 30447033350](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30447033350)、[Pages 30447033462](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30447033462) 均为 `success`；正式站 5 个关键文件与合并源码 SHA-256 一致 |
| 19:26 | 发布 [`v0.2.5`](https://github.com/zizegak916-glitch/writing-workshop/releases/tag/v0.2.5)，交付核心数据完整性、静态域名识别和自部署协议流式修复 | [`7756496`](https://github.com/zizegak916-glitch/writing-workshop/commit/77564969224554f516d9b60372c59ce2bfe2ba90)、[PR #9](https://github.com/zizegak916-glitch/writing-workshop/pull/9) | [Release 30447412739](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30447412739)、[CI 30447414243](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30447414243)、[Pages 30447414156](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30447414156) 均为 `success`；Release 非草稿、非预发布，共 7 个资产 |
| 22:35 | 同步 v0.2.5 教程、审查边界和申请证据；加入符合当前 LINUX DO 开源推广格式的发帖装配清单、原话题与上游致谢，并把 AI 整理的项目介绍做成 4 张图片 | [`9021839`](https://github.com/zizegak916-glitch/writing-workshop/commit/90218395e1362fd9b95b609241d99e6493d4fc64)、[PR #11](https://github.com/zizegak916-glitch/writing-workshop/pull/11) | PR [CI 30461240418](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30461240418)、main [CI 30461448959](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30461448959)、[Pages 30461453376](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30461453376) 均为 `success`；正式教程和 4 张图片均返回 HTTP 200，SHA-256 与合并源码一致 |
| 23:40 | 把 LINUX DO 发帖包补成可实际照做的教程：串起建项目、资料归位、API 测试、显式上下文、候选确认、恢复和 v5 备份；同时加入 4 个有原话题可追溯的佬友视频工具入口，明确无合作、无 AFF、可用性以原帖为准，也不宣称工作台已集成视频生成 | [`5f4708e`](https://github.com/zizegak916-glitch/writing-workshop/commit/5f4708e65dd2add7bc7b8b86d617b5b1a09ba2e8)、[PR #13](https://github.com/zizegak916-glitch/writing-workshop/pull/13) | PR [CI 30466149858](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30466149858)、main [CI 30466756097](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30466756097)、[Pages 30466753322](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30466753322) 均为 `success`；正式站两张新增图片均返回 HTTP 200，Git blob 与合并源码一致 |

## Prompt Skill 验证账

| 检查 | 结果 | 证据 |
|---|---|---|
| 功能覆盖 | 30 个模式卡 + 6 个快捷按钮映射到 32 个唯一 Prompt Skill；4 个快捷按钮复用同名能力 | 静态覆盖审计通过 |
| 本地持久化 | 保存、读取、恢复默认、独立导出、合并导入 | JavaScript 状态测试通过 |
| 正式域名交互 | “流程 → 内置 Prompt Skill → 查看与修改”可打开 32 项；修改后刷新仍显示“1 个已修改” | GitHub Pages 浏览器实测 |
| 部署内容 | 正式站 Prompt JS、快捷图标 SVG 与提交内容校验和一致 | Prompt JS `e2f45ae2…2e3e`；图标 SVG `a6d7ac2f…e02d` |
| 自动回归 | Skill 清单、图标映射、SVG symbol、入口资源、孤立脚本/样式、核心函数唯一性、浏览器明文 Key 回归、静态链接和证据 JSON | 本地 `scripts/check-static.mjs` 已通过；[CI 30191114231](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30191114231) 的 Playwright 产品烟雾测试已通过 |
| 运行边界 | Pages 是正式静态在线版，主 API 配置采用当前浏览器 BYOK 并直连用户填写的服务；自部署版使用同源 Go 后端托管密钥和执行 Skill | README、教程、API、配置和审计文档一致 |

## 文档同步规则

单人维护阶段改为最小同步，避免文档数量比可验证代码增长更快：

1. 每次行为变化更新 `CHANGELOG.md` 和真正受影响的协议/用户入口。
2. 这份时间线只记录版本发布或安全/数据格式里程碑，不再记录每个小提交。
3. `CODE_REVIEW.md` 保留为阶段快照，不冒充第三方审计。
4. `RELEASE_EVIDENCE.json` 与申请材料只在出现已完成的 CI、Release、独立 Issue/PR、真实用户或下游集成证据时更新。

历史引擎文档不追写 Web 产品细节，只维护清晰的状态标签并链接回这份时间线，避免再次把历史层误认成当前执行层。

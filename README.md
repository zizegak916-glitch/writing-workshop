# Writing Workshop / AI 写作工坊

[![CI](https://github.com/zizegak916-glitch/writing-workshop/actions/workflows/ci.yml/badge.svg)](https://github.com/zizegak916-glitch/writing-workshop/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-black.svg)](LICENSE)

Writing Workshop 是一个本地优先、作者确认写入的长篇创作工作台。项目、正文、章节、大纲、人物、笔记、记忆、自定义分类和 Prompt Skill 可以在同一项目中管理；每次 AI 请求由作者显式选择上下文，结果先进入候选区，不会自动覆盖正文。

**在线版：** [GitHub Pages](https://zizegak916-glitch.github.io/writing-workshop/) · [使用教程](https://zizegak916-glitch.github.io/writing-workshop/docs.html) · [问题反馈](https://github.com/zizegak916-glitch/writing-workshop/issues)

GitHub Pages 是正式 HTTPS 静态站点，不是 Sites 预览。它可以在浏览器本地完成项目管理、导入导出、Prompt Skill、真实网文指导库与 BYOK 模型调用；Key 和资料不会进入仓库。浏览器直连仍要求模型接口允许当前站点跨域。需要服务端托管密钥、后端 Skill、Go 语料分析、后台记忆和同源 API 时，使用 Docker 或本地可执行文件。

HTTPS Pages 需要调用自己控制的 `http://` 模型接口时，可部署内置的受限 Go 兼容桥：服务端只转发预先列入白名单的目标，Pages 用独立桥令牌访问，并同时显示浏览器实际地址与真实上游地址。完整的 Caddy、systemd、Go 1.21 / 1.25 和故障诊断教程见 [Pages 调用 HTTP API](docs/HTTP_BRIDGE.md)。

![Writing Workshop 首页](docs/images/landing-page.jpg)

## Go 编排内核与开放适配层

Writing Workshop 默认使用仓库内的 Go 编排内核，代码位于 `internal/engine/`。这样可以把上下文、工具权限、候选写入和中断语义握在产品自己手里；同时，模型与外部能力都通过小接口进入，不把“自研”理解成拒绝成熟实现。

- 原生消息、工具、事件、用量与模型接口；
- 可中断的 Agent 工具循环和工具执行门；
- 上下文预算、压缩投影和工具结果微压缩；
- 隔离的子任务运行上下文；
- OpenAI Chat、OpenAI Responses、Anthropic Messages、Ollama 四种 HTTP 协议；
- 保留 BOM/CRLF、拒绝越界路径和歧义替换的安全编辑工具。

现有 `ChatModel`、四协议适配器、可切换模型与 failover 已经是兼容边界。后续接入优秀外部引擎时，优先做薄适配并保留其优势，不复制整套实现，也不让第三方运行时绕过 Writing Workshop 的作者确认、工具门和数据边界。详见 [引擎与适配层](docs/NATIVE_ENGINE.md)。

## 真实网文指导与校准

“流程 → 真实网文指导库”可以导入你有权分析的 TXT、Markdown 或 DOCX 网文/稿件。它不是训练模型，也不提供具体作者仿写：

1. 导入前必须确认拥有分析权限；
2. 本地引擎计算章节、句段分位、段中对白、行动/解释、章末信号与重复开句，并对识别失败明确降级；
3. 分析生成带适用范围、证据和反例的指导卡；启用后会按 Skill 动态加入写作请求，而不只用于改提示词；
4. 可选 AI 深析只发送分层抽样，补充场景推进、人物行动、信息释放、对白功能与章节收束方法；
5. 提示词支持追加、修改和整段替换，预览可编辑，每次应用保留精确快照；
6. 分析总结、指导卡、提示词候选与写作候选都可汇入统一项目记忆，自部署还可写入 Go 后台记忆；
7. 只保存文件哈希、元数据、指标、指导卡和分析总结，不保存原文；内置边界禁止复刻作者身份、专名、情节和来源句子。

自部署版由 Go `internal/corpus` 分析并保存档案到 `.writing-workshop/corpus/index.json`；Pages 在浏览器内完成本地分析，原文不持久化。只有作者点击 AI 深析时，约 1.8 万字以内的分层抽样才会发给所配置模型。完整边界见 [真实网文指导库说明](docs/CORPUS_CALIBRATION.md)。

## 现在能做什么

- 管理项目、正文与章节、大纲、可直接打开编辑的世界观、人物卡、项目笔记、规则、写作记忆和自定义分类。
- 导入 TXT、Markdown、DOCX 或旧版项目包；导出 v6 完整项目备份。
- 选择正文、项目信息、大纲、人物、记忆和额外指令，提前查看 token 估算。
- 使用 32 个可查看、修改、恢复和迁移的内置 Prompt Skill；任务定义之下共享证据优先级，并按修改、生成、分析、策划和研究使用不同执行链。
- 多选后端 Skill，或应用“长篇规划校准 / 章节修订 / 角色与对白”等技能包。
- 将 AI 输出隔离到候选区，再确认替换、插入、追加或写入记忆。
- 浏览器记忆按项目隔离；自部署时可显式关联一条 Go 后台记忆，后续编辑与删除会使用同一后台 ID，不产生重复副本。
- 按项目保存候选、流程历史和写入前快照，阻止跨文档旧坐标写入。
- 在 Pages 使用浏览器 BYOK，或由自部署 Go 服务托管 Key 和同源 `/api/`。
- 以停用元数据登记外部 Skill 来源；当前不会下载或执行陌生仓库代码。

## 60 秒启动

### 直接使用 Pages

1. 打开 [在线工作台](https://zizegak916-glitch.github.io/writing-workshop/app.html)。
2. 点击顶部 `＋` 创建项目，或从项目操作台导入文件。
3. 需要 AI 时打开“设置 → API”，填写 Base URL 和 Key，先“获取模型”选择真实 ID，再预览最终 URL 与请求体、测试并保存。
4. 选一个功能和“阅读范围”；系统会把项目事实包加入请求。世界观、大纲和人物资料超过 3 万字符时，先点“更新全书记忆”完成分块读取。
5. 在候选区确认写入；重要阶段导出 v6 项目包。

Pages 保存 API 配置不会请求静态 `/api/config`，因此不会因保存动作产生 405。测试诊断会区分请求准备、HTTP、响应解析与未获得 HTTP 响应；CPA 等兼容层可选择完整 URL 原样请求，并用 JSON 调整非核心请求体字段。

若 Base URL 是 `http://`，在高级网络适配中另填自己的 HTTPS 桥地址与桥令牌。Base URL 仍保留真实上游，用来正确判断协议和最终路径；桥的部署步骤见 [HTTP 兼容桥教程](docs/HTTP_BRIDGE.md)。

### 直接运行发布包（Linux VM 推荐）

从 [Releases](https://github.com/zizegak916-glitch/writing-workshop/releases) 下载与机器匹配的包。旧虚拟机选文件名带 `_go1.21` 的兼容版；新环境选 `_go1.25` 版。两者功能相同，都是静态可执行文件，解压后运行：

```bash
chmod +x writing-workshop
./writing-workshop serve --demo --port 8080
```

发布包使用 `CGO_ENABLED=0` 构建，不要求虚拟机预装 Go。Go 1.21 版优先兼容旧系统，Go 1.25 版使用较新的编译器；只有从源码编译时才需要 Go 工具链。

### Docker（完整自部署）

```bash
git clone https://github.com/zizegak916-glitch/writing-workshop.git
cd writing-workshop
docker compose up --build
```

Docker 默认使用 Go 1.25.12 构建。需要验证兼容线时使用 `docker build --build-arg GO_VERSION=1.21.13 -t writing-workshop:go121 .`；这只改变构建工具链，不要求宿主机安装 Go。

打开：

- 工作台：<http://127.0.0.1:8080/app.html>
- 本地服务控制台：<http://127.0.0.1:8080/admin.html>
- 健康检查：<http://127.0.0.1:8080/api/health>

首次以无密钥 demo 模式启动。配置、能力、分类、技能包与语料统计保存在映射出的 `./config`，容器内路径为 `/root/.writing-workshop`。

### 从源码运行

同一套源码提供两条构建线：Go 1.21.13 是最低兼容线，Go 1.25.12 是新版构建线；CI 会同时测试，且禁止自动切换工具链：

```bash
GOTOOLCHAIN=local CGO_ENABLED=0 go build -o writing-workshop ./cmd/writing-workshop
./writing-workshop serve --demo --port 8080
```

默认只监听 `127.0.0.1`。公网使用前请增加 HTTPS、登录鉴权、请求大小限制和访问控制；不要直接暴露 8080。

## 长篇阅读与记忆

AI 面板不再只截取当前章节尾部。每次写作请求都会先建立同一份“项目正式事实包”，实际包含项目简介、世界观全文、大纲全文和完整人物卡，并明确世界观是规则资料、大纲是尚未发生的规划，不能当作正文章节。资料较短时直接发送原文；超过 3 万字符时，智能长篇要求先建立分层项目资料记忆，避免设定挤掉当前场景。

“更新全书记忆”会先分块读完世界观、大纲和人物卡，再逐章分块读取正文，形成项目资料、章节、阶段和全书四层记录。最后一层会核对正文进度与大纲规划的对应或偏离。世界观、大纲或人物卡一旦修改，资料指纹随即变化，旧的项目资料记忆与全书记忆会显示待更新，不能继续被当作完整覆盖。超长单章与超多阶段仍使用有界多级合并；未修改资料和章节会复用。原始资料与正文不会重复写入记忆，项目包只保存可核对的压缩记录。

长篇记忆压缩固定走流式链路：持续收到数据时按“空闲超时”续期，单次请求至少允许 300 秒，避免中转等待完整响应时被 60 秒前端计时器误杀。官方 DeepSeek 的记忆任务默认关闭思考模式，把输出额度留给可保存的最终摘要；其他写作任务和用户显式填写的 `thinking` 请求体覆盖值不受影响。兼容中转常见的嵌套响应也会逐层提取，若模型只返回推理或因 `finish_reason=length` 没有最终正文，界面会显示真实原因而不是笼统报“无法识别文本”。

“全书原文”只在已知模型上下文容量且正文与输出预留确实放得下时发送；超过上限会明确阻止，不静默截断。几十万字长篇应使用分批阅读，因为“把整本书塞进一次请求”并不等于可靠记忆。

## 核心闭环

```mermaid
flowchart LR
    A[选择任务与上下文] --> B[Go 编排内核 / 可替换适配器 / 浏览器 API]
    B --> C[候选区]
    C --> D{作者确认}
    D -->|替换/插入/追加| E[正文]
    D -->|单独确认| F[写作记忆]
```

功能 Prompt Skill、当前文本、项目上下文和作者额外指令会按可检查的顺序组装。Skill 内部先处理用户指令、正式设定、局部人物/世界资料、原文、授权语料信号和通用经验的优先级；语料指标不是写作配额。模型结果与当前文档版本不一致时，旧候选不能按旧坐标强写。

## 两类 Skill，不混为一谈

| 类型 | 存放位置 | 作用 | 当前边界 |
|---|---|---|---|
| 浏览器 Prompt Skill | 内置定义 + 当前 origin `localStorage` | 为 32 个写作功能组装提示词 | 无代码执行权限；可随 v6 备份迁移 |
| 后端 capability Skill | 内置清单或 `.writing-workshop/capabilities.json` | 为 `/api/run` 组合步骤和权限 | 仅执行已启用内置能力；外部来源默认停用 |
| 技能包 | `.writing-workshop/skill-packs.json` | 保存一组可见的 Skill ID | 不增加权限，不绕过服务端校验 |

第三方 Skill 沙箱仍未交付。粘贴 GitHub 地址只登记来源和 manifest，不会下载或运行代码。

## 数据边界

- Pages 项目数据位于当前域名的 IndexedDB/localStorage；`github.io`、自定义域名、`localhost` 是不同的数据空间。
- v6 项目包包含项目、章节、大纲、人物、笔记、记忆、候选/恢复快照、自定义分类、Prompt Skill 覆盖值和语料统计档案，不包含导入语料原文。
- Go 服务使用 `.writing-workshop/`。若只存在旧 `.ainovel/` 配置，程序可读取并提示迁移，但新写入只进入 `.writing-workshop/`。
- 浏览器项目与 Go 后端项目不会静默双向同步；通过导入/导出显式迁移。
- Pages BYOK 的 Key 保存在当前浏览器，不是加密保险箱；不要在公共设备使用。
- 自部署配置读取接口会隐藏 API Key 与自定义鉴权头。

## 项目结构

```text
cmd/writing-workshop/  可执行入口
internal/engine/       仓库自有 Go Agent、上下文、协议与安全编辑
internal/corpus/       授权语料分析、指导卡与候选提示词
internal/web/          同源 API、SSE、能力与数据管理
web/static/            Pages / 自部署共用工作台
internal/store/        后端章节、人物、记忆和运行状态
tests/                 浏览器产品烟雾测试
docs/                  用户、架构、历史与发布证据
```

## 当前验证边界

- 原生 Agent 循环、工具门、用量累积、上下文压缩、四协议请求、编辑安全、配置迁移、语料去重与撤销已有 Go 测试。
- 浏览器测试覆盖 v1–v5→v6、候选恢复、跨文档保护、Pages 配置和语料校准闭环；CI 结果才是发布证据。
- 四协议在测试中使用本地模拟响应，不等于所有付费供应商生产网络已验证。
- 当前没有公开的覆盖率承诺、像素级 UI 回归、第三方 Skill 沙箱或浏览器↔后端自动双向同步。
- 当前缺少独立用户连续使用证据。提交问题只需版本、环境、操作步骤、期望/实际结果和脱敏日志，不需要上传私稿。

运行与 CI 对齐的检查：

```bash
make check
```

## 文档

- [完整使用教程](docs/USER_GUIDE.md)
- [完整配置](CONFIG.md)
- [Pages HTTP 兼容桥](docs/HTTP_BRIDGE.md)
- [API 契约](API.md)
- [开发与测试](DEVELOPMENT.md)
- [引擎与适配层](docs/NATIVE_ENGINE.md)
- [授权语料校准](docs/CORPUS_CALIBRATION.md)
- [LINUX DO 佬友视频公益站状态](docs/COMMUNITY_VIDEO_RESOURCES.md)
- [产品归属边界](docs/PRODUCT_BOUNDARY.md)
- [安全策略](SECURITY.md)
- [更新时间线](docs/UPDATE_TIMELINE.md)

## 来源与许可证

许可证、第三方来源与必要署名见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。

文档里提到的“LINUX DO 视频站”，指 LINUX DO 佬友公开分享或维护的视频公益站与开源工具。它们变化很快，当前状态以[资源核验页](docs/COMMUNITY_VIDEO_RESOURCES.md)、对应原帖和站点为准。

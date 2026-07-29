# Security Policy

> 安全边界最后复核：2026-07-29（UTC+8）。

## Supported version

当前维护 `main` 与最新 GitHub Release。项目仍处于早期阶段，安全修复会优先进入 `main` 并在确认后发布补丁版本。

## Report a vulnerability

请使用 GitHub 仓库的私密漏洞报告功能（Security → Report a vulnerability）。不要在公开 Issue 中粘贴 API Key、作品正文、配置文件或可直接利用的细节。

报告请包含影响范围、复现步骤、受影响版本和建议修复（如有）。维护者会先确认收到，再根据可复现性和影响安排修复与披露。

## Deployment notes

- 服务默认监听 `127.0.0.1`；`--host 0.0.0.0` 只适合可信网络或有鉴权、TLS 的反向代理。
- `--demo` 不需要 API Key，但 AI 生成任务仍需用户配置真实模型。
- 自部署版浏览器只访问同源 `/api/`，密钥由后端配置或环境变量保管。不要把供应商密钥写入前端代码或提交到仓库。
- GitHub Pages 支持用户主动启用的浏览器 BYOK。此模式把 Key、Base URL、Provider、Model、协议与自定义请求头保存到当前 origin 的 `localStorage`，并直接请求目标服务；页面脚本、浏览器扩展及能读取该 origin 数据的人都可能接触这些凭据。不要在公共设备使用，发现异常应立即在服务商后台撤销 Key。
- 自定义请求头禁止覆盖 `Host`、`Cookie`、`Origin`、`Content-Length`、`Sec-*` 等浏览器或传输层控制字段。自部署配置读取接口必须移除 `extra.headers`，不能把其中的令牌回传到浏览器。
- Pages BYOK 只使用主配置；多模型槽位不得持久化单独的 Key，也不得静默复制主 Key 到其他 Provider。
- 跨域请求默认拒绝；分离部署必须用 `WRITING_WORKSHOP_ALLOWED_ORIGINS` 精确列出来源，禁止 `*`。
- JSON 请求体限制为 8 MiB，并拒绝一个请求中拼接多个 JSON 值；新增接口不得绕过统一读取器。
- 浏览器导入限制为最多 50 个文件、单文件 25 MiB、总计 100 MiB；项目包最多 20,000 条记录，DOCX 解压正文最多 40 MiB。
- capability manifest 当前不会执行远程代码。任何绕过沙箱直接执行来源仓库的改动都属于安全敏感变更。
- 公开 Agent Skills / MCP 目录只提供审查元数据；导入记录必须保持 `enabled=false`，`external:*` 入口不得进入 `/api/run`。上游“官方参考实现”也必须按不受信任外部进程处理。
- 技能包只组合已登记、已启用的 Skill ID，不下载或执行来源仓库；未知 ID 必须返回 `400`。
- 分类名称、项目名称、人物和记忆内容属于用户输入。渲染新增管理界面时必须使用 `textContent` 或 HTML 转义，禁止把 JSON 直接拼进内联事件属性。
- 自定义 Prompt Skill 和模型返回文本同样属于不可信输入。管理器必须用表单值/`textContent` 渲染；导入只接受已知 Skill 名、非空字符串和长度上限；AI 分析提取出的句子按钮必须用 DOM API 创建，不能把模型文本拼进 `innerHTML`、`title` 或内联事件。
- `localStorage` 不是秘密保险箱。Prompt Skill 可保存在其中，但 API Key、令牌和私密作品不应被写进提示词；导出的 v5 项目包可能含作品、笔记、记忆、AI 候选/恢复快照、分类和自定义提示词，分享前应人工检查。
- 项目删除必须精确到一个已解析的项目 ID，并在删除大纲、章节、人物、笔记、记忆、候选和恢复快照前进行明确确认；所有项目子记录必须在同一个 IndexedDB 事务中级联删除，不提供批量无确认删除。
- AI 候选写入必须校验生成时的项目和文档；替换类操作还要校验正文未在生成期间变化，并在写入前保存可恢复快照。
- 多模型或并行请求只有明确成功的槽位可进入写入流程；错误正文、超时提示和部分失败不得被标成可应用候选。

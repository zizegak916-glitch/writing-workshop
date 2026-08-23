# v0.3.0 维护者更新事实清单

> 这不是可直接发布到 LINUX DO 的正文。维护者应根据自己的真实体验和社区规则自行撰写；本文件只列可核对的项目事实。

## 可以讲的变化

### Go 编排内核与适配方向

- 默认编排内核位于 `internal/engine/`，负责消息、工具调用、上下文压缩、用量、子任务、中断和安全编辑。
- 自有主干用于掌握长篇写作的产品边界，不代表排斥优秀外部引擎。
- 当前模型边界使用 `engine.ChatModel`，并提供 OpenAI Chat、Responses、Anthropic、Ollama 四类协议适配、模型切换与 failover。
- 外部引擎或组件只有在许可证、数据流、错误语义、工具调用和中断契约可核验后，才写适配器并进入回归测试；未完成时不能写成“已集成”。

### Prompt Skill 重建

- 32 个浏览器 Prompt Skill 共享用户指令、项目事实、人物知识、原文、授权语料信号和通用经验的证据优先级。
- 修改、生成、分析、策划、研究五类任务使用不同执行协议，不再只靠一句泛化角色提示。
- 润色、扩写、缩写与改写先保护事实、因果、视角、时态、专名和人物声音；续写先恢复场景状态与下一拍动作。
- 分析类任务先判断批评是否成立，再区分事实错误、风险、取舍与偏好。

### 授权语料校准

- 可导入有权分析的 TXT、Markdown 或 DOCX。
- 程序提取段落、句长、对话比例、标点、短段密度、解释性连接词和机械重复等聚合信号。
- 多本语料按来源等权形成中位基线；来源分歧会降低约束强度。
- 续写、节奏、对白与润色生成不同的候选差分。
- 原文不写入语料档案；候选只有作者确认后才应用，并可撤销。

## 可复现路线

在线工作台：<https://zizegak916-glitch.github.io/writing-workshop/>

1. 新建项目，或从项目操作台导入 TXT / Markdown / DOCX。
2. 在“流程”里选择普通功能，或打开“授权语料校准”。
3. 导入语料前确认处理权限，查看样本量与聚合指标。
4. 选择要细化的 Prompt Skill，先看差分，再决定应用或放弃。
5. 在“设置 → API”填写协议、Base URL、模型和 Key，先测试再保存。
6. 选择本次上下文并生成；结果先进入候选区，确认后才能写入正文或记忆。
7. 每个重要阶段导出 v6 项目包。

自部署：

```bash
git clone https://github.com/zizegak916-glitch/writing-workshop.git
cd writing-workshop
docker compose up --build
```

- 工作台：<http://127.0.0.1:8080/app.html>
- 本地服务控制台：<http://127.0.0.1:8080/admin.html>
- 健康检查：<http://127.0.0.1:8080/api/health>

## 当前边界

- Pages 使用浏览器 BYOK；目标接口仍需允许浏览器跨域。
- 第三方 Skill 只登记元数据，尚未执行陌生仓库代码。
- 浏览器项目与后端项目不做静默双向同步。
- 原生 CLI 的模型流当前仍是最终文本块；真实 SSE / NDJSON 增量主要在 Web 路径。
- 未经实际接入与回归测试的外部引擎，只能写作参考或待适配。

仓库：<https://github.com/zizegak916-glitch/writing-workshop>

版本：<https://github.com/zizegak916-glitch/writing-workshop/releases/tag/v0.3.0>

教程：<https://zizegak916-glitch.github.io/writing-workshop/docs.html>

LINUX DO 佬友视频公益站与开源工具的当前核验状态见 [COMMUNITY_VIDEO_RESOURCES.md](COMMUNITY_VIDEO_RESOURCES.md)，不要继续使用 v0.2.5 时点的旧可用性描述。

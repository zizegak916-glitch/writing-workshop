# Contributing

> 现行贡献约束最后同步：2026-08-22（UTC）。可验证的产品演进记录在 [`docs/UPDATE_TIMELINE.md`](docs/UPDATE_TIMELINE.md)。

Writing Workshop 欢迎问题报告、协议讨论、测试样例和代码贡献。项目优先解决真实长篇写作中的可复现问题，不以增加按钮数量作为完成标准。

## 开始前

1. 先搜索现有 Issues，确认没有重复问题。
2. Bug 请提供复现步骤、预期结果、实际结果、系统与浏览器版本；不要提交作品正文或 API Key。
3. 新能力先说明用户任务、输入、输出、权限和失败方式，再讨论界面。

## 本地验证

```bash
go test ./...
go vet ./...
go build -o writing-workshop ./cmd/writing-workshop
./writing-workshop serve --demo --port 8080
curl http://127.0.0.1:8080/api/health
find web/static -name '*.js' -print0 | xargs -0 -n1 node --check
node scripts/check-static.mjs
npm ci
npm run test:api-adapter
npx playwright install --with-deps chromium
npm run test:browser
```

Pull request 应保持范围单一，说明行为变化与验证结果。涉及上下文、写入或第三方执行时，必须说明数据边界和回滚路径。

## 设计约束

- AI 输出默认是候选，不得静默覆盖正文、设定或记忆。
- 除用户明确启用 Pages BYOK 并填写的目标模型端点外，不得把浏览器 API Key 发送到非同源服务；不得把 Key 复制到多模型槽位、日志、源码或测试快照。
- 新增第三方执行能力必须先有最小权限与隔离方案。
- 新增 Skill pack 必须逐项引用现有 Skill，并补充未知 ID、重复 ID、只读包删除的测试。
- 新增或修改浏览器 Prompt Skill 必须同步功能入口、提示词默认值、图标映射、移动端/多模型/快捷调用链和覆盖测试；不得保留另一套实际生效但文档未记录的硬编码提示词。
- 修改功能名、图标、入口脚本或文档证据时，静态产品契约必须保持通过；不要只以页面“看起来正常”代替映射和链接校验。
- 新增分类必须声明存储边界（浏览器或后端）和删除后如何处理既有分类 ID。
- 保持本地数据格式向后兼容；破坏性迁移必须提供备份与迁移说明。
- IndexedDB 跨 store 导入/删除必须使用单事务；文档切换不得在当前编辑事务完成前继续。AI 历史必须按项目隔离，恢复备份时重映射旧文档 ID。
- AI 流式接口必须转发上游真实增量；完整响应只能作为明确的非流式回退，不得切片伪装成上游流。
- `internal/engine` 是当前 Go 引擎权威实现；不得重新引入 `agentcore`/`litellm` 运行时依赖来绕过测试。消息邻接、工具门、用量、上下文投影和安全编辑变更必须补测试。
- 授权语料校准不得保存原文、训练模型或生成具体作者仿写指令；新增指标必须有界、可解释、可撤销，并保持 Pages 与自部署字段语义一致。
- `app.html` 只负责页面结构与显式资源加载；不要重新加入大段内联脚本/样式或未被入口引用的重复实现。
- 影响公开行为、数据格式或安全边界的 PR 必须更新 `CHANGELOG.md` 和真正受影响的契约/用户文档。`CODE_REVIEW.md` 只在阶段审查时补充，`docs/UPDATE_TIMELINE.md` 只记录可验证里程碑；CI/Pages/Release 结果只能在运行完成后写成事实。
- 历史 fork 代码和提交中的上游版权与归属不得删除；当前自有引擎的陈述也不得夸大为“整个仓库从零原创”。

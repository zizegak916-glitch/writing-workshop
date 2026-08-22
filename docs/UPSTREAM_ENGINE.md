# 历史上游与原生引擎迁移

> 历史与许可证记录，更新于 2026-08-22（UTC）。这不是当前安装教程。

Writing Workshop 最初从 Apache-2.0 项目 [`voocel/ainovel-cli`](https://github.com/voocel/ainovel-cli) fork 并继续开发。仓库保留原作者版权、Apache-2.0 许可证、NOTICE 与 Git 提交历史；这些事实不会因为当前运行时已替换而被删除或改写。

## 当前状态

- 当前 Go 模块是 `github.com/zizegak916-glitch/writing-workshop`。
- 当前原生引擎位于 `internal/engine/`。
- 当前构建不再导入 `github.com/voocel/agentcore` 或 `github.com/voocel/litellm`。
- 现行配置目录是 `.writing-workshop/`；旧 `.ainovel/` 仅作为只读迁移来源。
- 当前产品安装、API、开发与安全规则只以根目录现行文档为准。

## 为什么仍保留上游署名

“替换当前引擎依赖”不等于“整个仓库从未来自 fork”。历史版本、仍然演化自早期代码的部分、提交关系与许可义务都需要可追溯。故本仓库：

1. 不把上游成果改称本项目原创；
2. 不删除许可证、NOTICE 或历史提交；
3. 对当前自有实现只作可由 import graph 和源码验证的有限陈述；
4. 将早期长篇架构资料标为历史文档，防止被当成现行运行时。

原生引擎的模块、不变量、测试和已知限制见 [NATIVE_ENGINE.md](NATIVE_ENGINE.md)。

# Security Policy

## Supported version

当前维护 `main` 与最新 GitHub Release。项目仍处于早期阶段，安全修复会优先进入 `main` 并在确认后发布补丁版本。

## Report a vulnerability

请使用 GitHub 仓库的私密漏洞报告功能（Security → Report a vulnerability）。不要在公开 Issue 中粘贴 API Key、作品正文、配置文件或可直接利用的细节。

报告请包含影响范围、复现步骤、受影响版本和建议修复（如有）。维护者会先确认收到，再根据可复现性和影响安排修复与披露。

## Deployment notes

- 服务默认监听 `127.0.0.1`；`--host 0.0.0.0` 只适合可信网络或有鉴权、TLS 的反向代理。
- `--demo` 不需要 API Key，但 AI 生成任务仍需用户配置真实模型。
- 浏览器只应访问同源 `/api/`。不要把供应商密钥写入前端代码或提交到仓库。
- 跨域请求默认拒绝；分离部署必须用 `WRITING_WORKSHOP_ALLOWED_ORIGINS` 精确列出来源，禁止 `*`。
- capability manifest 当前不会执行远程代码。任何绕过沙箱直接执行来源仓库的改动都属于安全敏感变更。

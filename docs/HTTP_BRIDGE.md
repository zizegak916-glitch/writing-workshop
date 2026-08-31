# Pages 调用 HTTP API：受限 HTTPS 兼容桥

GitHub Pages 是 HTTPS 页面。浏览器会在请求发出前拦截它对 `http://` API 的直接访问；关闭 CORS 提示、修改前端 `fetch` 或重试都不能绕过这条安全规则。

Writing Workshop 的解决方案是把自己的 Go 服务部署为 HTTPS 兼容桥：

    Pages 工作台（HTTPS）
        → 自己的 Go 兼容桥（HTTPS，只接受指定 Pages 来源和桥令牌）
        → 配置白名单中的模型接口（HTTP 或 HTTPS）

桥只解决传输边界。协议、模型 ID、API Key 和上游请求体仍由 Pages 的 API 配置决定，所以真实的 401、404、422、429 和 5xx 会原样显示，不再一律解释成“网络问题”。

## 安全边界

- 目标地址只允许在服务端环境变量中配置；浏览器不能提交任意目标 URL。
- 每个目标使用短别名，例如 `cpa`。桥地址中只出现别名和上游路径。
- 桥必须使用独立的高强度令牌，至少 24 个字符；它不是模型 API Key。
- 只开放实际使用的 Pages origin。不要写 `*`，也不要把桥令牌提交到仓库、Pages 源码、Issue 或截图。
- 桥转发模型鉴权头，但不会把桥令牌、Cookie、Origin、Referer、转发头或浏览器 `Sec-*` 头发送给上游。
- 响应中的 Cookie 和上游 CORS 头不会传回浏览器；跳转到白名单目标的来源或固定路径前缀之外会被拒绝。
- 默认单请求最大 16 MiB、最多 4 个并发请求；默认最多等待上游响应头 10 分钟。响应头到达后，活跃 SSE/NDJSON 流不再受固定总时长截断，浏览器和 Go 流式链路按相邻数据块的空闲时间判断超时。

## 选择 Go 1.21 或 Go 1.25

同一份源码兼容 Go 1.21 和 Go 1.25：

- 老虚拟机或保守发行版使用 Go 1.21 构建线。
- 新环境使用 Go 1.25 构建线。

两条构建线的桥接协议和 Pages 填法相同，不需要维护两套代码。

## 1. 准备服务端环境变量

以下示例把 `cpa` 固定映射到一台 HTTP 服务。不要把真实令牌写进仓库。

    WRITING_WORKSHOP_HTTP_BRIDGE_TARGETS={"cpa":"http://192.3.110.199:8317"}
    WRITING_WORKSHOP_HTTP_BRIDGE_TOKEN=replace-with-a-random-token-at-least-24-characters
    WRITING_WORKSHOP_ALLOWED_ORIGINS=https://zizegak916-glitch.github.io
    WRITING_WORKSHOP_HTTP_BRIDGE_MAX_BYTES=16777216
    WRITING_WORKSHOP_HTTP_BRIDGE_MAX_CONCURRENT=4
    WRITING_WORKSHOP_HTTP_BRIDGE_TIMEOUT_MS=600000

`WRITING_WORKSHOP_HTTP_BRIDGE_TIMEOUT_MS` 只约束等待上游响应头的最长时间，不是整条流的总寿命。持续输出的数据流会继续转发；上游连接异常中断时，桥会向 SSE/NDJSON 客户端发送明确错误，避免把半段记忆当成完整结果。

`WRITING_WORKSHOP_HTTP_BRIDGE_TARGETS` 是 JSON 对象，最多 16 个目标。例如：

    {"cpa":"http://192.3.110.199:8317","home":"http://10.0.0.8:11434"}

目标可带固定路径，但不能带账号密码、查询参数或片段。运行时路径会追加在目标路径之后。

## 2. 用 systemd 运行 Go 服务

把环境变量放在只有管理员可读的 `/etc/writing-workshop-bridge.env`，然后建立：

    [Unit]
    Description=Writing Workshop HTTP compatibility bridge
    After=network-online.target
    Wants=network-online.target

    [Service]
    Type=simple
    User=writing-workshop
    Group=writing-workshop
    EnvironmentFile=/etc/writing-workshop-bridge.env
    ExecStart=/opt/writing-workshop/writing-workshop serve --demo --host 127.0.0.1 --port 8080
    Restart=on-failure
    RestartSec=3
    NoNewPrivileges=true
    PrivateTmp=true

    [Install]
    WantedBy=multi-user.target

让 Go 服务只监听 `127.0.0.1:8080`。公网只开放 Caddy 的 443，不要直接暴露 8080。

## 3. 用 Caddy 提供 HTTPS

域名先解析到这台服务器，然后在 `Caddyfile` 中加入：

    bridge.example.com {
        encode zstd gzip
        reverse_proxy 127.0.0.1:8080 {
            flush_interval -1
        }
    }

`flush_interval -1` 用于及时转发 SSE 流。Caddy 会为正常解析的公网域名自动申请 HTTPS 证书。

## 4. 在 Pages 中填写

进入“设置 → API”，选择“自定义”，然后填写：

| 字段 | 示例 | 含义 |
|---|---|---|
| Base URL | `http://192.3.110.199:8317/v1` | 真实上游地址，继续用于计算协议和最终路径 |
| HTTPS 桥地址 | `https://bridge.example.com/api/http-bridge/cpa` | 浏览器实际请求的 HTTPS 地址 |
| 桥令牌 | 单独生成的长随机串 | 只用于访问自己的兼容桥 |
| API Key | 上游模型 Key | 由桥转发给模型服务 |
| 模型 | 上游真实模型 ID | 不要填写显示名称 |

点“预览实际请求”时，应同时看到：

- 浏览器发送地址：`https://bridge.example.com/api/http-bridge/cpa/v1/chat/completions`
- 真实上游地址：`http://192.3.110.199:8317/v1/chat/completions`

如果使用 Responses、Anthropic Messages 或 Ollama Chat，最终路径会按所选协议变化。不要为了适配桥而更改正确的接口协议。

## 诊断

| 结果 | 含义 | 处理 |
|---|---|---|
| 401，提示 bridge token | 桥令牌缺失或错误 | 核对 Pages 与服务端令牌；不要误填模型 Key |
| 403 | Pages origin 不在允许列表 | 精确填写 `https://用户名.github.io`，多个来源用逗号分隔 |
| 404，提示 bridge target | 地址中的别名未配置 | 核对 `/api/http-bridge/cpa` 与目标 JSON 的键 |
| 413 | 请求超过桥的正文限制 | 先收紧上下文；确有需要再提高 `MAX_BYTES` |
| 429 | 同时运行的长请求超过并发限制 | 等待后重试，或按机器容量调整 `MAX_CONCURRENT` |
| 502 | 桥已收到请求，但无法连接上游或上游跳转越界 | 在桥服务器上检查 HTTP 目标、端口、防火墙和日志 |
| 上游 401 / 404 / 422 | 请求已穿过桥 | 按模型 Key、最终路径、协议、模型 ID 或请求体处理 |
| 浏览器仍提示 mixed content | “HTTPS 桥地址”为空、填成 HTTP，或旧缓存尚未刷新 | 桥地址必须是 HTTPS；强制刷新 Pages |
| CORS 预检失败 | 桥的 HTTPS/Caddy 不可达、origin 未允许，或自定义头配置错误 | 先看浏览器原始错误，再检查 443、证书、允许来源和请求头 |

## 直接验证

先从普通终端验证桥本身，不要把完整令牌粘到公开日志：

    curl -i \
      -H 'Origin: https://zizegak916-glitch.github.io' \
      -H 'X-WW-Bridge-Token: your-bridge-token' \
      -H 'Authorization: Bearer your-provider-key' \
      https://bridge.example.com/api/http-bridge/cpa/v1/models

如果这里返回上游 HTTP 状态，而 Pages 仍失败，问题在浏览器 origin、缓存或表单配置；如果这里返回桥自己的 401、403、404、413、429 或 502，就按上表处理。

## 重要限制

这个桥是给自己或受控小组使用的固定目标转发器，不是公共开放代理，也不负责隐藏你向模型服务发送的正文。提供商会收到模型 API Key 和请求内容；桥令牌只用于保护桥入口。

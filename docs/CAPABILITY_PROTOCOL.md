# Writing Workshop Capability Manifest v0.1

Capability manifest 用于描述一个可组合的写作能力。它解决三件事：界面知道如何展示能力，运行器知道该传什么，作者在执行前看得到步骤和权限。

## 安全模型

保存 manifest 只会登记元数据，不会 clone、安装或执行来源仓库。当前版本只运行内置任务与已经接入的同源后端。未来的第三方执行器必须满足：版本锁定、权限声明、工作目录隔离、网络默认关闭、可取消和可审计日志。

## 字段

| 字段 | 必填 | 说明 |
|---|---:|---|
| `id` | 否 | 稳定标识；缺省时由服务生成 |
| `name` | 是 | 用户可读名称 |
| `type` | 是 | `backend`、`project` 或 `skill` |
| `version` | 是 | 能力版本 |
| `source` | 是 | 来源 URL 或本地标识 |
| `license` | 是 | SPDX 许可证标识 |
| `entry` | 是 | 内置任务、prompt 或未来沙箱入口 |
| `output` | 是 | `text`、`json`、`patch` 或 `events` |
| `instructions` | 否 | 组合进本次任务的稳定约束 |
| `steps` | 否 | 执行前向作者展示的步骤 |
| `permissions` | 否 | 最小权限列表 |
| `supports_stream` | 否 | 是否支持 SSE 增量结果 |
| `supports_abort` | 否 | 是否响应取消 |
| `enabled` | 否 | 是否允许选择与执行 |

## 示例

仓库提供 [场景节奏检查示例](../examples/capabilities/scene-pacing.skill.json)。保存后可通过 `GET /api/capabilities` 查看，通过 `POST /api/run` 组合执行。

```bash
curl -X POST http://127.0.0.1:8080/api/capabilities \
  -H 'content-type: application/json' \
  --data @examples/capabilities/scene-pacing.skill.json
```

## 兼容性

- v0.1 客户端必须忽略未知字段。
- 修改已有字段语义需要提升协议版本；新增可选字段不破坏兼容性。
- 运行器必须拒绝停用的能力、缺失的能力和不受支持的执行入口。
- `instructions` 是约束文本，不是获得额外权限的手段。

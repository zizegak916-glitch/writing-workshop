# Writing Workshop Capability Manifest v0.2

> 状态：现行产品协议，更新于 2026-07-22。v0.2 新增可选分类、标签和技能包组合，不改变 v0.1 字段语义。

Capability manifest 用于描述一个可组合的写作能力。它解决三件事：界面知道如何展示能力，运行器知道该传什么，作者在执行前看得到步骤和权限。

## 安全模型

保存 manifest 只会登记元数据，不会 clone、安装或执行来源仓库。当前版本只运行内置任务与已经接入的同源后端。未来的第三方执行器必须满足：版本锁定、权限声明、工作目录隔离、网络默认关闭、可取消和可审计日志。

## 字段

| 字段 | 必填 | 说明 |
|---|---:|---|
| `id` | 否 | 稳定标识；缺省时由服务生成 |
| `name` | 是 | 用户可读名称 |
| `type` | 是 | `backend`、`project` 或 `skill` |
| `description` | 否 | 能力解决的问题，不写营销文案 |
| `category` | 否 | 分类 ID；可来自 `/api/categories` |
| `tags` | 否 | 用于检索与筛选的字符串数组 |
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

## 多 Skill 与技能包

`POST /api/run` 的 `skill_ids` 是有序数组，不是单选字段。运行器必须逐项校验，不能静默忽略不存在或停用的能力。技能包只保存一组经过验证、去重的 `skill_ids`；应用技能包不会获得额外权限，也不会自动执行。

技能包示例见 [chapter-revision.pack.json](../examples/skill-packs/chapter-revision.pack.json)，可提交到 `POST /api/skill-packs`。内置技能包只读，用户技能包持久化到 `.ainovel/skill-packs.json`。

## 兼容性

- v0.1 与 v0.2 客户端必须忽略未知字段。
- 修改已有字段语义需要提升协议版本；新增可选字段不破坏兼容性。
- 运行器必须拒绝停用的能力、缺失的能力和不受支持的执行入口。
- `instructions` 是约束文本，不是获得额外权限的手段。

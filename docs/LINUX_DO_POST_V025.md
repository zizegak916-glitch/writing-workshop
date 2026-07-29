# Writing Workshop v0.2.5 — LINUX DO 发帖包

更新：2026-07-29（UTC+8）

这不是一篇可以把 Markdown 原样复制到 LINUX DO 的 AI 代写稿。它是一份发布装配清单：固定合规声明照社区格式填写；项目介绍、完整使用流程和佬友视频工具索引使用已经做成图片的六张卡；开头、实际体验和结尾由维护者本人用自己的话写。

## 为什么不用上一版长文

上一版存在四个问题：

1. 像 README，不像使用者在社区里讲自己为什么继续做这个项目。
2. 把已发布版本、未来计划和未交付能力混在一起，事实边界不够清楚。
3. Pages 的描述已经过期；当前 v0.2.5 可以在浏览器保存并直连 BYOK 自定义 API，修复了静态 `/api/config` 405。
4. 结尾请求 Star，不符合这次面向佬友征集真实使用反馈的目的。

## 发布前先核对社区要求

- 当前社区规则：<https://linux.do/guidelines>
- 推荐分区：`开发调优`；发布时再按页面实际可选项添加 `开源推广` 标签。
- 不复制 README 充当项目介绍。
- AI 生成或润色的项目介绍不直接粘贴为帖子文字；本文件已经把该部分做成图片，发布时上传图片。
- 不求赞、不求 Star、不只扔一个链接。
- 如果帖子编辑器显示的开源推广声明模板与下文不同，以发布当天页面中的模板为准。

## 固定声明

下面是社区开源推广帖子当前普遍使用的声明格式。逐项确认事实后再填写“是”：

> #### 本帖使用社区开源推广，符合推广要求。我申明并遵循社区要求的以下内容：
>
> - 我的帖子已经打上 开源推广 标签：是
> - 我的开源项目完整开源，无未开源部分：是
> - 我的开源项目已链接认可 LINUX DO 社区：是
> - 我帖子内的项目介绍，AI生成、润色内容部分已截图发出：是
> - 以上选择我承诺是永久有效的，接受社区和佬友监督：是

如果任一项在发布时不成立，不要照填。

## 标题和开头由维护者本人写

标题只需要包含三个事实：这是之前版本的继续迭代、项目名 Writing Workshop、当前版本 v0.2.5。不要写“全网最强”“媲美某产品”之类无法验证的结论。

开头建议本人回答以下三件事，每件一两句话即可：

1. [原话题](https://linux.do/t/2277200)发出后，自己实际遇到了哪两个问题。
2. 为什么这轮先修“写完一章不丢数据”和 Pages 自定义 API，而不是继续堆功能。
3. 希望佬友实际帮测哪一条链路，以及反馈时不需要提交私稿。

不要把这三条问题本身粘贴到帖子里；请直接用自己的经历作答。

## AI 项目介绍与使用教程图片

这六张图就是 AI 生成/整理的项目介绍与教程正文。发布时按顺序上传图片，不要把图中文字复制为正文。

1. [01 · 项目是什么](../web/static/images/linux-do-v025/01-overview.svg)
2. [02 · Pages 怎么用](../web/static/images/linux-do-v025/02-pages-guide.svg)
3. [03 · 自部署怎么用](../web/static/images/linux-do-v025/03-selfhost-guide.svg)
4. [04 · 来源、证据和边界](../web/static/images/linux-do-v025/04-boundaries.svg)
5. [05 · 从空项目到完成一次安全写入](../web/static/images/linux-do-v025/05-workshop-tutorial.svg)
6. [06 · 佬友视频工具索引](../web/static/images/linux-do-v025/06-community-video-tools.svg)

Pages 部署后也可直接打开：

- <https://zizegak916-glitch.github.io/writing-workshop/images/linux-do-v025/01-overview.svg>
- <https://zizegak916-glitch.github.io/writing-workshop/images/linux-do-v025/02-pages-guide.svg>
- <https://zizegak916-glitch.github.io/writing-workshop/images/linux-do-v025/03-selfhost-guide.svg>
- <https://zizegak916-glitch.github.io/writing-workshop/images/linux-do-v025/04-boundaries.svg>
- <https://zizegak916-glitch.github.io/writing-workshop/images/linux-do-v025/05-workshop-tutorial.svg>
- <https://zizegak916-glitch.github.io/writing-workshop/images/linux-do-v025/06-community-video-tools.svg>

如果论坛不接受 SVG，就在浏览器打开上述地址后逐张截图为 PNG 再上传。不要用外链图片代替论坛上传，避免预览失效。

## 佬友视频工具：为什么放、怎么放

这一段是给佬友项目补曝光，不是 Writing Workshop 的合作方列表。维护者与以下项目没有 AFF、返佣或交换推广；只按 2026-07-29 可以核验的公开话题和入口整理，额度、注册、模型和可用性以各项目原帖为准。

| 类型 | 项目 | 已核验能力 | 最短用法 | 原帖/来源 |
|---|---|---|---|---|
| 公益站 | ZTU.AI | 文生视频、图生视频；原帖说明使用 Wan 2.2 | 不传图片为文生视频；传一张为首帧；传两张为首尾帧，再填写动作描述 | [LINUX DO 原帖](https://linux.do/t/topic/1507837) · [站点](https://ztu.ai/) |
| 公益站 | l0veyou | LTX 图生视频、数字人等；入口当前可打开 | 从模型列表选择视频能力并上传参考图；数字人按原帖上传超过 2 秒的音频。注册开放时间和额度可能变化 | [公益站原帖](https://linux.do/t/topic/2287218) · [数字人教程](https://linux.do/t/topic/2306233) · [站点](https://l0veyou.com/) |
| 开源推广 | 小野 AI | Seedance、Veo 3.1，支持文生视频和图生视频；有在线站和自部署仓库 | 在线站选择视频模型后输入提示词或参考图；需要自主托管时按仓库配置供应商 Key、数据库和对象存储 | [LINUX DO 原帖](https://linux.do/t/topic/1802932) · [在线站](https://xiaoye.io/) · [仓库](https://github.com/capybara-zy/xiaoye-ai) |
| 公益推广 / 开源 | 派奇绘画 | Wan 2.2 的图片转短视频“Live 图” | 先生成或上传图片，再切换到支持 Live 的 Hugging Face / Gitee AI 服务商生成短视频；免费额度受上游算力限制 | [LINUX DO 原帖](https://linux.do/t/topic/1312332) · [仓库](https://github.com/Amery2010/peinture) |

需要从零做长视频而不是只生成一个片段，可以继续看佬友的[长视频小白教程](https://linux.do/t/topic/1833016)；使用 Seedance 时的裁切、运镜与首尾帧问题可参考[实际踩坑记录](https://linux.do/t/topic/1834572)。这些链接只作社区资源索引，不宣称 Writing Workshop 已经集成视频生成。

## 教使用：本人发帖时需要补的实际操作

第 05 张图已经给出完整主链路。本人最好再用自己的项目补一张真实截图，并按实际操作回答：

1. 从 Pages 直接打开还是 Docker 启动。
2. 新建项目还是导入现有 TXT / Markdown / DOCX / v5 JSON。
3. 使用哪种协议、Base URL 是否需要补完整端点、连接测试是否成功。
4. 选择了哪段正文、哪些上下文和哪个 Prompt Skill。
5. 候选生成后选择了替换、插入还是追加。
6. 写入前快照是否可恢复，最后是否导出了 v5 项目包。

不要只写“点击生成即可”。佬友真正需要知道的是：数据存在哪里、API 为什么可能 CORS、结果为什么先到候选区、失败后怎样不丢正文。

## 图片之后放这些真实链接

```text
之前的话题：
https://linux.do/t/2277200

在线工作台：
https://zizegak916-glitch.github.io/writing-workshop/app.html

完整教程：
https://zizegak916-glitch.github.io/writing-workshop/docs.html

仓库：
https://github.com/zizegak916-glitch/writing-workshop

v0.2.5 Release：
https://github.com/zizegak916-glitch/writing-workshop/releases/tag/v0.2.5

7 天真实写作反馈：
https://github.com/zizegak916-glitch/writing-workshop/issues/new?template=field-test.yml

佬友视频工具原帖：
https://linux.do/t/topic/1507837
https://linux.do/t/topic/2287218
https://linux.do/t/topic/1802932
https://linux.do/t/topic/1312332
```

## 上游致谢

Writing Workshop 的 Go 写作引擎源自 Apache-2.0 的 `voocel/ainovel-cli`，仓库保留了上游版权、许可和历史。帖子中直接放真实来源，不用含糊写“感谢原版的人”：

- 上游 LINUX DO 话题：<https://linux.do/t/topic/2267839>
- 上游仓库：<https://github.com/voocel/ainovel-cli>

## 建议的帖子顺序

1. 本人填写标题。
2. 固定开源推广声明。
3. 本人用三到六句话说明原话题、这轮实际问题和为什么重做。
4. 上传六张项目介绍、使用教程与佬友视频工具图片。
5. 粘贴真实链接块。
6. 本人补一段自己的实际操作，至少说明导入、API 测试、上下文选择、候选确认和备份。
7. 只征集可复现问题和完整使用反馈，不求 Star。
8. 放上游致谢。

## 发布前最后检查

- [ ] 原话题 `2277200` 已直接出现。
- [ ] 上游话题 `2267839` 与上游仓库都能打开。
- [ ] 没有 Telegram、失效联系方式或错用户名。
- [ ] 没有求赞、求 Star、申请项目包装和虚构用户数。
- [ ] 没有把第三方 Skill 沙箱、双向同步或真实供应商网络测试写成已完成。
- [ ] Pages 写清“浏览器 BYOK + 目标接口需允许 CORS”，没有再写成只能预览。
- [ ] 自部署写清“后端托管密钥 + 同源 API”，没有把 Key 放进截图或日志。
- [ ] AI 生成/润色的介绍只以图片上传。
- [ ] 佬友视频工具明确标注类型、原帖、动态可用性和“无 AFF / 无合作”。
- [ ] 没有把视频站写成 Writing Workshop 已集成的功能。
- [ ] 本人亲自补了实际体验和要佬友验证的问题。

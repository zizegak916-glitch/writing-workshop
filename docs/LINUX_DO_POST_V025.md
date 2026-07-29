# Writing Workshop v0.2.5 — LINUX DO 发帖包

更新：2026-07-29（UTC+8）

这不是一篇可以把 Markdown 原样复制到 LINUX DO 的 AI 代写稿。它是一份发布装配清单：固定合规声明照社区格式填写；项目介绍使用已经做成图片的四张卡；开头、实际体验和结尾由维护者本人用自己的话写。

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

## AI 项目介绍图片

这四张图就是 AI 生成/整理的项目介绍正文。发布时按顺序上传图片，不要把图中文字复制为正文。

1. [01 · 项目是什么](../web/static/images/linux-do-v025/01-overview.svg)
2. [02 · Pages 怎么用](../web/static/images/linux-do-v025/02-pages-guide.svg)
3. [03 · 自部署怎么用](../web/static/images/linux-do-v025/03-selfhost-guide.svg)
4. [04 · 来源、证据和边界](../web/static/images/linux-do-v025/04-boundaries.svg)

Pages 部署后也可直接打开：

- <https://zizegak916-glitch.github.io/writing-workshop/images/linux-do-v025/01-overview.svg>
- <https://zizegak916-glitch.github.io/writing-workshop/images/linux-do-v025/02-pages-guide.svg>
- <https://zizegak916-glitch.github.io/writing-workshop/images/linux-do-v025/03-selfhost-guide.svg>
- <https://zizegak916-glitch.github.io/writing-workshop/images/linux-do-v025/04-boundaries.svg>

如果论坛不接受 SVG，就在浏览器打开上述地址后逐张截图为 PNG 再上传。不要用外链图片代替论坛上传，避免预览失效。

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
```

## 上游致谢

Writing Workshop 的 Go 写作引擎源自 Apache-2.0 的 `voocel/ainovel-cli`，仓库保留了上游版权、许可和历史。帖子中直接放真实来源，不用含糊写“感谢原版的人”：

- 上游 LINUX DO 话题：<https://linux.do/t/topic/2267839>
- 上游仓库：<https://github.com/voocel/ainovel-cli>

## 建议的帖子顺序

1. 本人填写标题。
2. 固定开源推广声明。
3. 本人用三到六句话说明原话题、这轮实际问题和为什么重做。
4. 上传四张项目介绍图片。
5. 粘贴真实链接块。
6. 本人补一段实际使用情况。
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
- [ ] 本人亲自补了实际体验和要佬友验证的问题。


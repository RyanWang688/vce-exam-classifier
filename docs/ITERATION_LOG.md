# 迭代记录

记录每一轮做了什么、为什么这样做、还有什么没验证。最新的放在最上面。

## 待验证

- [ ] 用真实 API Key 和真实试卷跑通（文字版、扫描版各一份）
- [ ] 观察知识点准确率、切题质量和低置信度的实际分布
- [ ] 确认逐字转录真题时 `RECITATION` 中断的频率
- [ ] 确认单份试卷的耗时和 Token 用量
- [ ] 在真实 Wix 站点验证超过 14 秒后后端是否继续执行

## 第 1 轮：2026-11-06，初版 demo 和 Wix 迁移代码

**完成内容**

- `index.html`：上传 PDF、调用 Gemini `generateContent`、结构化返回、卡片审核、导出 JSON/CSV、耗时和 Token 统计。
- `wix/` 和 `WIX_GUIDE.md`：Velo 迁移代码和步骤。

**查证后做出的决定**

| 决定 | 原因 |
|---|---|
| 默认模型 `gemini-3.6-flash` | 官方标记为稳定版，有免费层；`gemini-3.8-flash` 较新，标记为 New |
| 继续用 `generateContent` | 官方推荐新项目用 Interactions API，但说明 `generateContent` 仍完全支持 |
| REST 字段用 `inlineData` / `mimeType` | `generateContent` 官方示例是 camelCase |
| 不发送 `temperature` | 官方说明 3.6+ 会忽略该值，未来会返回 400 |
| 不设置 `thinkingConfig` | 各模型允许的取值不同，先用默认值观察 |
| 保留 20MB 上限 | 需求规定。官方写的是 PDF 50MB，以后可以放宽 |
| `topic` 不用 schema 枚举 | 80 个枚举值有触发 schema 过大的风险。改由提示词约束，前端校验并标红 |
| 公式定界符用 `\( \)` | General Maths 的 `$` 金额不会被误判成公式 |
| Wix 改成任务 + 轮询 | Wix 后端请求上限 14 秒且无法提高 |
| Wix 用 `wix-secrets-backend.v2` | 旧的 `getSecret` 已标注弃用 |

**测试情况**

- 真实接口：用无效 Key 调用，确认浏览器跨域可用、Key 错误提示正确。
- 模拟响应：覆盖 429（频率、日额度、零额度）、413、400、404、503、`MAX_TOKENS`、`RECITATION`、请求拦截、坏 JSON、断网、取消、超大文件、错误文件类型、分类表错误、编辑、确认、导出。
- **没测过：** 真实 Key 下的 PDF 分析，所以 `responseSchema` 尚未经过 Gemini 实际校验，分类效果也还没有数据。
- Wix 代码只做过语法检查。

# 迁移到 Wix 指南

把本地 demo 迁移到 Wix 的步骤。代码在 [`wix/`](wix/) 文件夹里。

> **状态：这些代码还没有在真实 Wix 站点上运行过。** 我们只做过语法检查。API 用法已对照 Velo 官方文档核对，未核实的部分列在[第 7 节](#7-尚未核实的内容)。

## 1. 先读：14 秒限制

Wix 的 web module 和 HTTP function 单次请求最多运行 **14 秒**，免费站和付费站相同，且[不能提高](https://support.wix.com/en/article/velo-about-backend-quotas)。超时后前端收到 504。而 Gemini 分析一份完整试卷通常超过 14 秒。

所以“前端调用后端、等待 Gemini 返回”这条直线流程走不通，这里改成任务 + 轮询：

```text
Dashboard 页面                 后端 gemini.web.js              CMS / Gemini
────────────────────────────────────────────────────────────────────────
uploadFiles() ───────────────────────────────────────────▶ Media Manager
createJob(fileUrl) ─────────▶ 插入任务 status=running ────▶ ClassifyJobs
runJob(jobId)（不等待）──────▶ 下载 PDF，调用 Gemini ─────▶ Gemini
  14 秒后前端收到 504（已忽略）   继续运行（见下方风险）
                               写入 status=done + result ─▶ ClassifyJobs
getJob(jobId) 每 3 秒轮询 ◀─── 读取任务状态
显示结果，管理员审核
saveQuestions() ────────────▶ bulkInsert ─────────────────▶ Questions
```

**风险：** 官方文档的原话是超时后代码“might still execute”（可能继续执行），并不保证。这是这条方案的关键不确定点，请在做界面之前先验证：

1. 只搭好第 3、4 节的后端和最简单的上传按钮。
2. 用一份 15 页以上的完整真题跑几次。
3. 看 `ClassifyJobs` 里的 `status` 能否稳定变成 `done`。

如果任务一直停在 `running`，说明后端被终止了，请改用第 8 节的备用方案。

> **题目配图、Word 和图片上传尚未迁移。** 本地 demo 已支持，但 `wix/` 的代码目前只处理 PDF 的文字和分类。建议用真实试卷验证效果后再迁移。Word 解析依赖浏览器的 DOMParser，迁移时要放在 HTML iframe 里运行。迁移时，页面渲染和裁剪仍要在浏览器完成（Dashboard 里用 HTML iframe 运行 PDF.js），截图上传到 Media Manager，`Questions` 再加一个图片字段。

## 2. 与原方案不同的地方

| 项目 | 原方案 | 实际做法 | 原因 |
|---|---|---|---|
| 调用方式 | 等待 Gemini 返回 | 任务 + 轮询 | 14 秒上限 |
| 读取 Secret | `wix-secrets-backend` | `wix-secrets-backend.v2` 的 `getSecretValue` | 旧方法 `getSecret` 官方已标注弃用 |
| CMS 集合 | 只有 `Questions` | 新增 `ClassifyJobs` | 用来存放任务状态和结果 |
| 小问 | - | 合并进 `text` | `Questions` 只有一个文本字段 |

## 3. 准备工作

1. 在站点打开 **Dev Mode**（Velo）。
2. 在 Google AI Studio 新建一个**只给 Wix 用**的 API Key，不要沿用本地测试的 Key。
3. 打开 **Secrets Manager**，添加密钥，名称填 `GEMINI_API_KEY`。
4. 正式使用前，给这个 Key 所属项目开通付费。免费层提交的内容可能被 Google 用于改进产品。

## 4. CMS 集合

两个集合的权限都设为**仅管理员**（Admin）。后端已用 `suppressAuth` 写入，前端不会直接访问集合。

**Questions**

| 字段 | Field Key | 类型 |
|---|---|---|
| Subject | `subject` | Text |
| Unit | `unit` | Text |
| Topic | `topic` | Text |
| Question Type | `questionType` | Text |
| Difficulty | `difficulty` | Text |
| Text | `text` | Text |
| Confirmed | `confirmed` | Boolean |
| Source ID | `sourceId` | Text（题目唯一 ID，用于去重） |
| Source | `source` | Text（如 `2024 VCAA Physics Exam Section B Q3`） |
| Publisher | `publisher` | Text |
| Paper Title | `paperTitle` | Text |
| Paper Type | `paperType` | Text |
| Year | `year` | Number |
| Question Number | `questionNumber` | Text |
| Section | `section` | Text |
| Source Page | `sourcePage` | Number |

`sourceId` 由出版方、年份、试卷名、类型、Section 和题号生成，同一道题重复导入时 ID 相同。`bulkInsert` 不会自动按它去重，正式入库前要先查询已有的 `sourceId`，或者把它的值同时写入 `_id`。

本地页面可以修改来源信息；Wix 页面目前直接使用 AI 识别的值，迁移时建议加上同样的输入框。

**ClassifyJobs**

| 字段 | Field Key | 类型 |
|---|---|---|
| File URL | `fileUrl` | Text |
| File Name | `fileName` | Text |
| Status | `status` | Text（`running` / `done` / `failed`） |
| Result | `result` | Text（JSON，整条记录上限约 500KB） |
| Error | `error` | Text |

## 5. 放置代码

| 本仓库文件 | 放到 Wix 的位置 |
|---|---|
| `wix/backend/gemini.web.js` | Backend → `gemini.web.js` |
| `wix/backend/taxonomy.js` | Backend → `taxonomy.js` |
| `wix/backend/prompt.js` | Backend → `prompt.js` |
| `wix/pages/exam-dashboard.js` | Dashboard 页面的 Page Code |

所有 web method 都是 `Permissions.Admin`，只有站点所有者和协作者能调用。不要放宽这个权限，否则访客可以消耗你的 Gemini 额度。

修改 `index.html` 的分类表或提示词后，请同步 `taxonomy.js` 和 `prompt.js`。

## 6. Dashboard 页面元素

在 Wix 编辑器里添加以下元素，并设置对应的 ID：

| 元素 | ID | 说明 |
|---|---|---|
| Upload Button | `uploadPdf` | 文件类型 Document，单文件 |
| Button | `analyzeBtn` | 开始分析 |
| Button | `saveBtn` | 保存到 CMS |
| Text | `statusText` | 状态和错误提示 |
| Text | `paperText` | 试卷信息 |
| Repeater | `questionRepeater` | 题目列表 |

Repeater 的每一项里：

| 元素 | ID |
|---|---|
| Container / Box | `card`（低置信度时变色） |
| Text | `qNumber`、`qText`、`qConfidence` |
| Dropdown | `topicDropdown`、`typeDropdown`、`difficultyDropdown` |
| Checkbox | `confirmedCheckbox` |

Wix 的 Text 元素不会渲染 LaTeX，`qText` 里会显示公式源码。如果需要渲染，可以用 Custom Element 或 HTML iframe 加载 KaTeX。

## 7. 尚未核实的内容

以下几点我查不到官方依据，或者只能在真实站点确认：

- **超时后后端是否继续执行：** 第 1 节的风险，优先验证。
- **`wix-fetch` 的 `response.arrayBuffer()`：** 没有查到文档。如果报错，改用 `await response.buffer()`。
- **Upload Button 的 PDF 大小上限：** 相关文档未能读取，请用接近 20MB 的文件测一次。
- **定时任务（jobs.config）的运行时长：** 相关页面已失效，所以没有依赖它。
- **`getDownloadUrl` 对 `wix:document://` 的支持：** 官方示例是图片地址，方法说明里没有排除文档。

## 8. 备用方案

如果第 1 节的验证失败，把耗时调用移出 Wix：

1. 部署一个小型外部服务（例如 Google Cloud Run），由它保管 Gemini Key 并调用 Gemini。
2. `runJob` 只把 `jobId` 和 PDF 下载地址发给这个服务，然后立刻返回。
3. 服务完成后，调用 Wix 的 HTTP function 写回 `ClassifyJobs`，请求需带共享密钥验证。

前端的轮询代码不用改。代价是多维护一个服务，Key 也不再只存放在 Wix。

## 参考文档

- [Velo 后端配额](https://support.wix.com/en/article/velo-about-backend-quotas)
- [Velo 数据配额](https://support.wix.com/en/article/velo-about-data-quotas)
- [Web Modules](https://dev.wix.com/docs/develop-websites/articles/coding-with-velo/backend-code/web-modules/about-web-modules)
- [getSecretValue](https://dev.wix.com/docs/velo/apis/wix-secrets-backend-v2/secrets/get-secret-value)
- [getDownloadUrl](https://dev.wix.com/docs/velo/apis/wix-media-backend/media-manager/get-download-url)
- [bulkInsert](https://dev.wix.com/docs/velo/apis/wix-data/bulk-insert)
- [uploadFiles](https://dev.wix.com/docs/velo/velo-only-apis/$w/upload-button/upload-files)

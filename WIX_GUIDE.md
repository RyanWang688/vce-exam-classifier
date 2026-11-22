# 迁移到 Wix 指南

把本地版装进你们的 Wix 网站：老师登录网站后打开“题库”页，功能和本地版一样（切题、分类、审核、调整裁图、组卷、AI 出题），
区别是题库存在网站后台、所有老师共用，Gemini Key 只在网站后台。代码在 [`wix/`](wix/) 文件夹。

> **状态：** 网站版的全部流程在本地的模拟 Wix 环境里测过（[`tests/wix-mock/`](tests/wix-mock/)，用的是同一份后端代码），
> **还没有在真实 Wix 网站上运行过**。第 7 节列出只能在真实网站上确认的地方，上线前请按第 6 节逐项验证。

## 1. 怎么运作

```text
老师的浏览器                                   Wix 网站
┌────────────────────────────┐   postMessage   ┌──────────────────────┐   web method   ┌─────────────────────────┐
│ HTML 组件 #vceApp            │ ◀────────────▶ │ 页面代码 vce-app.js     │ ─────────────▶ │ 后端 vce.web.js          │
│  加载器 → index.html（网站版） │                │  public/vceHost.js 转发 │                │  vceCore.js：检查老师角色  │
│  切题、分类、裁图都在这里算      │                └──────────────────────┘                │  读写集合、媒体库、调 Gemini │
└────────────────────────────┘                                                        └─────────────────────────┘
          │  图片和原卷直接上传到媒体库（失败时经后端转存）                                   Secrets Manager：GEMINI_API_KEY
```

- **计算都在浏览器里**：PDF 渲染、OCR、切题、分类和本地版一样在老师的浏览器里完成，不占网站后端，也不受 14 秒限制。
- **题库在网站后台**：五张表对应五个集合（见第 3 节），图片和原卷存在媒体库。表结构见 [docs/DATA_SCHEMA.md](docs/DATA_SCHEMA.md)。
- **Key 只在后端**：页面里没有 Key。AI 请求交给后端，后端从 Secrets Manager 读 Key 调用 Gemini。
- **14 秒限制**：Wix 后端单次请求最多 14 秒，AI 出题常常更久，所以 AI 调用分三步：建任务 → 后台调用（页面不等）→ 每 2.5 秒取一次结果。
  官方说超时后后端代码“可能”继续运行，这是第 6 节第一项要验证的。
- **只有老师能用**：每个后端方法都会检查登录会员的角色，只有 `Admin`（站长和协作者）和 `Teacher` 能用。

## 2. 准备

1. 网站打开 **Dev Mode**（Velo）。
2. **会员角色**：在会员设置里新建角色 `Teacher`，给老师账号加上这个角色。名字不同的话改 `wix/backend/vceCore.js` 里的 `ALLOWED_ROLES`。
3. **Gemini Key**：在 Google AI Studio 新建一个只给网站用的 Key（不要用本地测试的 Key），开通付费（免费层提交的内容可能被 Google 用于改进产品）。
   打开 **Secrets Manager**，添加密钥，名称 `GEMINI_API_KEY`。
4. **托管 index.html**：页面代码要从一个 https 地址取 index.html。仓库是公开的，可以在 GitHub 仓库的 Settings → Pages 里选 `main` 分支，
   地址就是 `https://ryanwang688.github.io/vce-exam-classifier/index.html`。index.html 里没有 Key 和题库数据，可以公开。

## 3. 集合

在 CMS 新建下面 6 个集合。**权限全部设为“仅管理员”**（读、写都是），后端用 `suppressAuth` 代为读写，页面不直接访问集合。

| 集合 | 用途 |
|---|---|
| `VceQuestions` | 题目（含 AI 出的题） |
| `VcePapers` | 试卷 |
| `VceAssets` | 图片和原卷的文件记录（文件本身在媒体库） |
| `VceSpecs` | 出题规范的各个版本 |
| `VceFeedback` | 老师审核 AI 题的意见 |
| `VceAiJobs` | AI 调用任务（取完结果自动删除） |

前五个集合都有这些字段，`json` 里是整条记录，其余字段只是方便在 CMS 里查看和筛选：

| 字段 | Field Key | 类型 |
|---|---|---|
| Record Key | `recordKey` | Text |
| Updated At | `updatedAt` | Text |
| JSON | `json` | Text |
| Label | `label` | Text（VceAssets 没有） |

另外：

- `VceQuestions`：`paperId`、`subject`、`topic`、`questionType`、`difficulty`、`status`（Text），`generated`（Boolean）
- `VcePapers`：`subject`、`year`（Text）
- `VceAssets`：`kind`、`owner`、`mime`、`fileUrl`（Text），`size`（Number）
- `VceAiJobs`：`status`、`createdBy`、`createdAt`、`finishedAt`、`error`、`result`（Text），`httpStatus`（Number）

Wix 写入时字段不存在会自动加上，但先建好类型更稳妥。单条记录上限约 500KB，后端在 450KB 处就会拒绝并提示（模拟环境里实测 2025MM1，每道题和整份试卷的记录都在 5KB 以内）。

## 4. 放置代码

| 本仓库文件 | 放到 Wix 的位置 |
|---|---|
| `wix/backend/vceCore.js` | Backend → `vceCore.js` |
| `wix/backend/vce.web.js` | Backend → `vce.web.js` |
| `wix/public/vceHost.js` | Public → `vceHost.js` |
| `wix/pages/vce-app.js` | “题库”页面的 Page Code |
| `wix/html/loader.html` | “题库”页面上 HTML 组件的代码 |

“题库”页面：

1. 新建页面，**设为仅会员可见**。
2. 放一个 **Embed HTML**（HTML 组件），ID 改成 `vceApp`，选“代码”方式，粘贴 `wix/html/loader.html`，把里面的 `APP_URL` 改成第 2 步的地址，`SITE_ORIGIN` 改成你的网站地址（如 `https://www.xxx.com`）。
3. 把组件拉大到整页宽、足够高（建议高度 1200px 以上）。
4. Page Code 粘贴 `wix/pages/vce-app.js`，发布。

以后更新功能：本地改好 index.html 推送到 GitHub，网站页面刷新就是新版本，不用改 Wix。后端和集合只有改了 `wix/` 里的文件时才要同步。

## 5. 把本地题库搬上去

1. 本地版：题库面板 →“导出完整题库（ZIP）”。
2. 网站版：老师登录，题库面板 →“导入题库”，选这个 ZIP。图片和原卷会传到媒体库，记录写进集合。同一条记录以修改时间较新的为准，可以重复导入。

## 6. 上线前验证（按顺序）

1. **14 秒后后端是否继续运行**：AI 出一道题（或用 AI 模式分析一份试卷）。如果页面一直等到“AI 没有返回结果”，并且 `VceAiJobs` 里任务一直是 `running`，说明后端被停掉了，改用第 8 节的备用方案。
2. **权限**：用没有 `Teacher` 角色的会员打开，页面顶部应显示“没有权限”，分析按钮不能点。
3. **上传**：分析一份试卷，媒体库的 `vce-bank` 文件夹里应出现裁图、配图和原卷；原卷应是私密文件。
4. **重新打开**：刷新页面，题库面板里“打开”刚才的试卷，裁图和原卷都能显示，“调整裁图”能用。
5. **导出导入**：导出完整题库，确认 ZIP 里有图片和原卷。
6. **另一位老师**：换一个老师账号打开，能看到同一份题库。

## 7. 只能在真实网站上确认的地方

| 项目 | 为什么不确定 | 如果不行 |
|---|---|---|
| 超时后后端是否继续运行 | 官方只说“可能” | 第 8 节备用方案 |
| 浏览器能否直接上传到 `getUploadUrl` 给的地址 | 官方示例是外部程序上传，没说浏览器跨域是否允许；上传返回的格式文档里前后不一致 | 已自动改为经后端转存（单个文件 4MB 以内），大于 4MB 的原卷会传不上去 |
| 浏览器能否直接下载 `getDownloadUrl` 给的地址 | 跨域是否允许没有文档 | 已自动改为经后端读取 |
| web method 的参数和返回值大小上限 | 没有查到文档 | 经后端转存、读取的文件过大时会失败，需要拆分 |
| HTML 组件里 `location.ancestorOrigins` 和消息来源 | Wix 是否多套一层 iframe 没有文档 | 已在加载器里写明网站地址作为备用判断 |
| `mediaManager.getFileInfo`、`moveFilesToTrash` 的用法 | 按 API 名称使用，没有逐条核对文档 | 改动在 `vceCore.js` 的 `assetConfirm` 和 `trash` |
| `wixData` 查询的 `skip` 上限 | 题目很多时（上万）分页可能受限 | 改为按 `next()` 翻页 |

## 8. 备用方案（第 6 节第 1 项失败时）

把调用 Gemini 的那一步移出 Wix：部署一个小服务（如 Google Cloud Run）保管 Key、调用 Gemini，完成后调用 Wix 的 HTTP function 写回 `VceAiJobs`。
`aiRun` 只把任务 ID 和请求转给这个服务。页面和轮询代码不用改，代价是多维护一个服务，Key 也不再只存在 Wix。

## 9. 本地测试网站版

不用真实网站也能测：用本地服务器打开 `/tests/wix-mock/host.html`，它用 `wix/` 里的同一份后端代码，把 Wix 的数据库、媒体库、密钥、角色、Gemini 换成内存里的模拟版。
在控制台加载 `/tests/wix-mock/wix-check.js` 会自动跑一遍：权限、入库、重新打开、调整裁图、上传下载失败时的备用路径、AI 调用（含超时和额度用完）、导出导入、删除。

## 参考文档

- [Velo 后端配额（14 秒）](https://support.wix.com/en/article/velo-about-backend-quotas)
- [数据上限：单条 500KB、批量 4MB / 1000 条](https://dev.wix.com/docs/develop-websites/articles/coding-with-velo/limits-and-optimization/data-features)
- [查询 limit 最多 1000](https://dev.wix.com/docs/velo/apis/wix-data/wix-data-query/limit)
- [HTML 组件和页面代码之间的消息](https://dev.wix.com/docs/velo/velo-only-apis/$w/html-component/messaging-between-a-site-page-and-an-html-element)
- [getUploadUrl](https://dev.wix.com/docs/velo/apis/wix-media-backend/media-manager/get-upload-url)
- [getDownloadUrl](https://dev.wix.com/docs/velo/apis/wix-media-backend/media-manager/get-download-url)
- [currentMember.getRoles](https://dev.wix.com/docs/velo/apis/wix-members-backend/current-member/get-roles)
- [getSecretValue](https://dev.wix.com/docs/velo/apis/wix-secrets-backend-v2/secrets/get-secret-value)

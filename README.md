# VCE 试卷自动分类 Demo

用 Google Gemini 验证 VCE 试卷自动切题和知识点分类的效果。这是一个单文件前端页面（`index.html`），不需要框架和构建工具。

## 本地运行

双击 `index.html` 即可打开。也可以用本地静态服务器：

```bash
python -m http.server 8000
```

```bash
npx serve .
```

然后打开 `http://localhost:8000`（`npx serve` 使用终端显示的地址）。

使用步骤：

1. 在 [Google AI Studio](https://aistudio.google.com/apikey) 创建 API Key，填入页面。
2. 上传 20MB 以内的 PDF、Word，或多张试卷图片，点击“开始分析”。
3. 检查高亮的题目，修改分类并勾选“已确认”。
4. 检查每张自动截图，必要时点“调整”重新框选。
5. 导出 JSON、CSV，或含图片的 ZIP。

> API Key 保存在浏览器 localStorage，**只能用于本地测试**。正式版见 [WIX_GUIDE.md](WIX_GUIDE.md)。

## 哪些题需要复核

模型的自评分数几乎总是很高，所以复核不靠分数，而由页面按规则判定：

- 跨知识点（`topic_fit` 为 `split`）
- 分类表没有合适的知识点（`poor`）或判为 `Other`
- 知识点不在分类表中
- 题目内容可能没读准

勾选“只看需要复核的题”可以只处理这些题。没被标记不代表一定正确：测试中有一道分类表缺项的题就没被标记，所以初期建议抽查。

## 怎么判断 AI 效果

页面顶部的“已确认题 AI 准确率”是已确认的题目中，三个分类字段都没被改动的比例。导出文件保留了 AI 原值（`ai_topic` 等字段），可以用来逐题对比。

## 支持的文件

| 格式 | 配图 | 页码 | 注意 |
|---|---|---|---|
| PDF（文字版、扫描版） | 定位后裁剪 | 有 | 不限制公式类型 |
| Word（`.docx`） | 直接取内嵌图片 | 无 | 见下方 |
| 图片（PNG、JPG、WebP 等） | 定位后裁剪 | 有 | 每张算一页，见下方 |

上传图片时可以一次选多张，页面按文件名的自然顺序排页（`page2` 在 `page10` 前），所以请按顺序命名。大图会缩到长边 2200 像素再发送。iPhone 的 HEIC 不支持，请先转成 JPG。照片模糊、倾斜或有阴影都会影响识别，能用 PDF 时优先用 PDF。

Word 文档有这些限制，遇到时建议另存为 PDF 再上传：

- MathType 等旧式公式读不到内容，Word 自带公式没有问题。
- EMF/WMF 图片、Word 原生形状和图表取不到，可以手动上传替换。
- 脚注不会读取，页眉页脚只读取文字。

旧版 `.doc` 不支持。

## 题目配图

分析分两轮：

1. 第一轮用 PDF 切题分类，同时记录每张图在哪一页。
2. 第二轮用 PDF.js 渲染含图页面，让 Gemini 返回边界框，浏览器再按边界框裁剪。

第二轮会增加请求次数和 Token，用量已计入页面统计。定位失败不影响分类结果，可以手动框选。

| 导出格式 | 图片 |
|---|---|
| JSON | 以 base64 内嵌在 `figures[].image` |
| CSV | 只写文件路径，图片在 ZIP 里 |
| ZIP | `questions.json`、`questions.csv` 和 `figures/` 文件夹 |

截图来自试卷原件，公开使用前请确认版权许可。

## 题目来源

每道题都带来源，方便以后统一入库：

| 字段 | 说明 |
|---|---|
| `source_id` | 题目唯一 ID，由出版方、年份、试卷名、类型、Section 和题号生成 |
| `source.label` | 给人看的来源，如 `2024 VCAA Physics Written Examination Section B Q1` |
| `source.publisher` / `paper_title` / `paper_type` / `year` | 可筛选的结构化字段 |
| `source.page` | 题目在 PDF 里的起始页 |
| `source.adapted_from` | 卷面标注的改编来源，如 `2022 SM Exam 1` |
| `source.file` / `file_sha256` | 原文件名和文件指纹，用于追溯和识别重复文件 |

AI 识别的来源可以在结果页修改，修改会应用到全部题目。修改会改变 `source_id`，请在入库前确认好。

## 默认模型

默认使用 `gemini-3.6-flash`，页面上可以修改。核对日期为 2026-11-06：

| 模型 | 状态 | 付费价（美元 / 百万 Token，输入 / 输出） |
|---|---|---|
| `gemini-3.6-flash` | 稳定版 | 0.75 / 3.75，2027-01-01 起 1.50 / 7.50 |
| `gemini-3.8-flash` | 最新 Flash | 0.75 / 3.75，2027-01-01 起 1.50 / 7.50 |
| `gemini-3.5-flash-lite` | 稳定版 | 0.30 / 2.50 |
| `gemini-3.1-flash-lite` | 2027-05-07 下线 | 0.25 / 1.50 |

## 分类表来源

分类表来自 VCAA Study Design（Mathematics 2023 起，Physics 和 Chemistry 的 Units 3/4 2024 起，Biology 2022 起）：

- 除 Methods 外，知识点使用文档的 Key knowledge 或内容小标题原文。
- Mathematical Methods 原文只有四个 Area of Study，微积分和概率统计是按文档内容再细分的。

## 项目结构

```text
index.html            本地测试页面
WIX_GUIDE.md          迁移到 Wix 的指南
wix/backend/          Velo 后端代码
wix/pages/            Velo 页面代码
docs/ITERATION_LOG.md 迭代记录
```

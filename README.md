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
2. 上传 20MB 以内的 PDF 试卷，点击“开始分析”。
3. 检查高亮的题目，修改分类并勾选“已确认”。
4. 导出 JSON 或 CSV。

> API Key 保存在浏览器 localStorage，**只能用于本地测试**。正式版见 [WIX_GUIDE.md](WIX_GUIDE.md)。

## 怎么判断 AI 效果

页面顶部的“已确认题 AI 准确率”是已确认的题目中，三个分类字段都没被改动的比例。导出文件保留了 AI 原值（`ai_topic` 等字段），可以用来逐题对比。

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

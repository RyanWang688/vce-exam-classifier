// Velo Web Module：读取 Secrets、调用 Gemini、读写 CMS。
//
// 重要：Wix 后端请求上限是 14 秒且无法提高，而分析整份 PDF 通常更久。
// 所以分成三步：createJob（建任务）→ runJob（前端发起但不等待）→ getJob（前端轮询）。
// 官方文档说超时后代码“可能”继续执行，这一点必须在真实站点上验证，见 WIX_GUIDE.md。

import { Permissions, webMethod } from 'wix-web-module';
import { secrets } from 'wix-secrets-backend.v2';
import { elevate } from 'wix-auth';
import { mediaManager } from 'wix-media-backend';
import { fetch } from 'wix-fetch';
import wixData from 'wix-data';
import { TAXONOMY } from 'backend/taxonomy';
import { buildPrompt, RESPONSE_SCHEMA } from 'backend/prompt';

const MODEL = 'gemini-3.6-flash';
const SECRET_NAME = 'GEMINI_API_KEY';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_RESULT_CHARS = 450 * 1024; // CMS 单条上限约 500KB，给其他字段留余量。
const JOBS = 'ClassifyJobs';
const QUESTIONS = 'Questions';
const DATA_OPTIONS = { suppressAuth: true }; // 入口方法都是 Admin 权限，这里跳过集合权限检查。

async function getApiKey() {
  const result = await elevate(secrets.getSecretValue)(SECRET_NAME);
  // 官方示例显示解析为字符串；同时兼容 { value } 形式。
  return typeof result === 'string' ? result : result.value;
}

async function downloadPdfAsBase64(fileUrl) {
  const url = await mediaManager.getDownloadUrl(fileUrl);
  const response = await fetch(url, { method: 'get' });
  if (!response.ok) throw new Error(`下载 PDF 失败（${response.status}）`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES) throw new Error('PDF 超过 20MB，请拆分后再上传。');
  return bytes.toString('base64');
}

function apiErrorMessage(status, bodyText) {
  if (status === 429) return '超出 Gemini 频率或额度限制，请稍后重试。';
  if (status === 413) return 'PDF 过大，请拆分后再上传。';
  if (status === 404) return `模型 ${MODEL} 不存在或已下线，请更新后端的 MODEL。`;
  if (status === 401 || status === 403 || /api key/i.test(bodyText)) {
    return 'Gemini API Key 无效或没有权限，请检查 Secrets Manager。';
  }
  if (status >= 500) return 'Gemini 服务暂时不可用，请稍后重试。';
  return `Gemini 请求失败（${status}）：${bodyText.slice(0, 300)}`;
}

async function callGemini(apiKey, base64) {
  const response = await fetch(`${API_BASE}${MODEL}:generateContent`, {
    method: 'post',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64 } },
          { text: buildPrompt(TAXONOMY) },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        maxOutputTokens: 65536,
      },
    }),
  });

  const bodyText = await response.text();
  if (!response.ok) throw new Error(apiErrorMessage(response.status, bodyText));

  const data = JSON.parse(bodyText);
  const candidate = (data.candidates || [])[0];
  if (!candidate) throw new Error('Gemini 没有返回结果，请重试。');
  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    throw new Error(`Gemini 输出中断（${candidate.finishReason}），请拆分试卷或重试。`);
  }
  const text = candidate.content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
  const parsed = JSON.parse(text);
  parsed.usage = data.usageMetadata || null;
  return parsed;
}

async function updateJob(jobId, fields) {
  const job = await wixData.get(JOBS, jobId, DATA_OPTIONS);
  return wixData.update(JOBS, { ...job, ...fields }, DATA_OPTIONS);
}

/** 第一步：建任务，马上返回 jobId。 */
export const createJob = webMethod(Permissions.Admin, async (fileUrl, fileName) => {
  const job = await wixData.insert(JOBS, { fileUrl, fileName, status: 'running' }, DATA_OPTIONS);
  return { jobId: job._id };
});

/**
 * 第二步：实际分析。前端发起后不要等待：
 * 超过 14 秒时前端会收到 504，这是预期现象，结果写在 ClassifyJobs 里。
 */
export const runJob = webMethod(Permissions.Admin, async (jobId) => {
  try {
    const job = await wixData.get(JOBS, jobId, DATA_OPTIONS);
    if (!job) throw new Error('任务不存在。');
    const [apiKey, base64] = await Promise.all([getApiKey(), downloadPdfAsBase64(job.fileUrl)]);
    const result = JSON.stringify(await callGemini(apiKey, base64));
    if (result.length > MAX_RESULT_CHARS) throw new Error('结果过大，无法存入 CMS，请拆分试卷。');
    await updateJob(jobId, { status: 'done', result });
  } catch (error) {
    await updateJob(jobId, { status: 'failed', error: error.message });
  }
});

/** 第三步：前端轮询任务状态。 */
export const getJob = webMethod(Permissions.Admin, async (jobId) => {
  const job = await wixData.get(JOBS, jobId, DATA_OPTIONS);
  if (!job) return { status: 'failed', error: '任务不存在。' };
  return {
    status: job.status,
    error: job.error || null,
    result: job.result ? JSON.parse(job.result) : null,
  };
});

// 把小问合并到题干，因为 Questions 集合只有一个 text 字段。
function fullText(question) {
  const parts = (question.sub_parts || []).map((p) => `(${p.label}) ${p.text}`);
  return [question.text, ...parts].join('\n');
}

/** 把管理员审核后的题目写入 CMS 集合 Questions。 */
export const saveQuestions = webMethod(Permissions.Admin, async (paper, questions) => {
  const items = questions.map((q) => ({
    subject: paper.subject,
    unit: paper.unit,
    topic: q.topic,
    questionType: q.question_type,
    difficulty: q.difficulty,
    text: fullText(q),
    confirmed: Boolean(q.confirmed),
  }));
  const result = await wixData.bulkInsert(QUESTIONS, items, DATA_OPTIONS);
  return { inserted: result.inserted, errors: result.errors.length };
});

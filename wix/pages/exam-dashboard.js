// Velo 页面代码：粘贴到 Dashboard 页面的 Page Code。元素 ID 见 WIX_GUIDE.md。
import { createJob, runJob, getJob, saveQuestions } from 'backend/gemini.web';
import { TAXONOMY } from 'backend/taxonomy';

const POLL_MS = 3000;
const MAX_WAIT_MS = 5 * 60 * 1000;
const LOW_CONFIDENCE = 0.7;
const LOW_COLOR = '#FFF4DC';
const NORMAL_COLOR = '#FFFFFF';

const TYPE_OPTIONS = [
  { label: '选择题', value: 'multiple choice' },
  { label: '简答题', value: 'short answer' },
  { label: '论述 / 大题', value: 'extended response' },
];
const DIFFICULTY_OPTIONS = [
  { label: '简单', value: 'easy' },
  { label: '中等', value: 'medium' },
  { label: '困难', value: 'hard' },
];

let paper = null;
let questions = [];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setStatus(message) {
  $w('#statusText').text = message;
}

function topicOptions(subject) {
  const units = TAXONOMY[subject];
  const lists = units ? [units] : Object.values(TAXONOMY);
  const topics = [...new Set(lists.flatMap((u) => Object.values(u).flat()))];
  return [...topics, 'Other'].map((t) => ({ label: t, value: t }));
}

async function waitForJob(jobId) {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await wait(POLL_MS);
    const job = await getJob(jobId);
    if (job.status === 'done') return job.result;
    if (job.status === 'failed') throw new Error(job.error);
  }
  throw new Error('等待超时：后端任务可能在 14 秒后被终止，请查看 WIX_GUIDE.md 的备用方案。');
}

function showResult(result) {
  paper = result.paper;
  questions = result.questions.map((q, index) => ({ ...q, _id: String(index), confirmed: false }));
  $w('#paperText').text = [paper.subject, paper.unit, paper.paper_type, paper.year || '年份未识别'].join(' · ');
  $w('#questionRepeater').data = questions;
  $w('#questionRepeater').expand();
  $w('#saveBtn').enable();
}

function bindRepeater() {
  $w('#questionRepeater').onItemReady(($item, item) => {
    const edit = (field) => (event) => {
      questions.find((q) => q._id === item._id)[field] = event.target.value;
    };

    $item('#qNumber').text = `第 ${item.question_number} 题`;
    $item('#qText').text = [item.text, ...(item.sub_parts || []).map((p) => `(${p.label}) ${p.text}`)].join('\n');
    $item('#qConfidence').text = `置信度 ${Number(item.confidence).toFixed(2)}`;
    // 模型自评分数几乎总是很高，复核要看 topic_fit。
    const review = item.topic_fit !== 'clear' || item.confidence < LOW_CONFIDENCE;
    $item('#card').style.backgroundColor = review ? LOW_COLOR : NORMAL_COLOR;

    const known = topicOptions(paper.subject);
    $item('#topicDropdown').options = known.some((o) => o.value === item.topic)
      ? known
      : [{ label: `${item.topic}（不在分类表中）`, value: item.topic }, ...known];
    $item('#topicDropdown').value = item.topic;
    $item('#topicDropdown').onChange(edit('topic'));

    $item('#typeDropdown').options = TYPE_OPTIONS;
    $item('#typeDropdown').value = item.question_type;
    $item('#typeDropdown').onChange(edit('question_type'));

    $item('#difficultyDropdown').options = DIFFICULTY_OPTIONS;
    $item('#difficultyDropdown').value = item.difficulty;
    $item('#difficultyDropdown').onChange(edit('difficulty'));

    $item('#confirmedCheckbox').checked = false;
    $item('#confirmedCheckbox').onChange((event) => {
      questions.find((q) => q._id === item._id).confirmed = event.target.checked;
    });
  });
}

async function analyze() {
  const upload = $w('#uploadPdf');
  if (!upload.value.length) {
    setStatus('请先选择 PDF 文件。');
    return;
  }

  const fileName = upload.value[0].name;
  $w('#analyzeBtn').disable();
  $w('#saveBtn').disable();
  $w('#questionRepeater').collapse();
  setStatus('正在分析试卷…');

  try {
    const [uploaded] = await upload.uploadFiles();
    const { jobId } = await createJob(uploaded.fileUrl, fileName);
    // 不等待：超过 14 秒时这里会收到 504，属于预期现象，结果由 getJob 取回。
    runJob(jobId).catch(() => {});
    showResult(await waitForJob(jobId));
    setStatus(`分析完成，共 ${questions.length} 题。`);
  } catch (error) {
    setStatus(`分析失败：${error.message || error.errorDescription || error}`);
  } finally {
    $w('#analyzeBtn').enable();
  }
}

async function save() {
  $w('#saveBtn').disable(); // 防止重复写入。
  setStatus('正在保存…');
  try {
    const { inserted, errors } = await saveQuestions(paper, questions);
    setStatus(`已保存 ${inserted} 题到 Questions${errors ? `，${errors} 题失败` : ''}。`);
  } catch (error) {
    $w('#saveBtn').enable();
    setStatus(`保存失败：${error.message}`);
  }
}

$w.onReady(() => {
  $w('#uploadPdf').fileType = 'Document';
  $w('#questionRepeater').collapse();
  $w('#saveBtn').disable();
  bindRepeater();
  $w('#analyzeBtn').onClick(analyze);
  $w('#saveBtn').onClick(save);
});

// 批量跑试卷：把切题结果和裁图发到本地接收器。只在本机测试用，目录被 .gitignore 忽略。
window.__post = (name, body) => fetch(`http://127.0.0.1:8622/${name}`, { method: 'POST', body: new Blob([body], { type: 'text/plain' }) });
window.__runOne = async (name) => {
  $('provider').value = 'rules'; $('provider').dispatchEvent(new Event('change'));
  const blob = await (await fetch(`/tmp-fixtures/vcaa/${name}.pdf`)).blob();
  const d = new DataTransfer(); d.items.add(new File([blob], `${name}.pdf`, { type: 'application/pdf' }));
  $('file').files = d.files; $('file').dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  const started = Date.now();
  $('analyze').click();
  await new Promise((r) => setTimeout(r, 500));
  for (let i = 0; i < 3000 && state.abort; i++) await new Promise((r) => setTimeout(r, 200));
  const list = state.questions || [];
  const out = {
    name, ms: Date.now() - started, subject: state.paper && state.paper.subject,
    warning: $('warning').textContent.trim().slice(0, 160), error: $('error').textContent.trim().slice(0, 160),
    n: list.length, marks: list.reduce((s, q) => s + (q.marks || 0), 0),
    questions: list.map((q) => ({
      s: (q.section || '').slice(-1), n: q.question_number, marks: q.marks, area: q.area || '', topic: q.topic, alt: q.alternative_topics,
      fit: q.topic_fit, snap: !!q.snapshot, text: latexToPlain(q.text || ''), plain: q.plain || '',
      parts: q.sub_parts.map((p) => ({ l: p.label, m: p.marks, t: p.topic || '', x: latexToPlain(p.text || ''), c: latexToPlain(p.context || ''), p: p.plain || '' })),
    })),
  };
  await __post(`${name}.json`, JSON.stringify(out));
  for (let i = 0; i < list.length; i++) {
    if (list[i].snapshot) await __post(`${name}__${(list[i].section || '').slice(-1)}${list[i].question_number}.jpg`, list[i].snapshot);
  }
  return `${name}: ${out.n} 题 ${out.marks} 分 ${Math.round(out.ms / 1000)}s ${out.warning}`;
};
window.__batch = async (names) => {
  window.__log = []; window.__done = false;
  for (const name of names) {
    try { window.__log.push(await __runOne(name)); } catch (e) { window.__log.push(`${name}: 失败 ${e}`); }
  }
  window.__done = true;
};

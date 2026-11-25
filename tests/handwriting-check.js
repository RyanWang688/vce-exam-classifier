/*
 * 手写题检查。先运行 tests/fetch-handwriting.ps1 下载测试图片。
 *
 * 用法：打开页面后在控制台运行
 *   const s = document.createElement('script'); s.src = '/tests/handwriting-check.js'; document.head.append(s);
 * 默认只测本机部分（不调用 AI）：去阴影、拉直、找块的速度，以及每页的块数不少于题数（块只会比题多，不能把两道题并成一块）。
 * 先设 window.__hwUseAi = true 再运行，会用 Gemini 跑完整流程（每页 1 次调用，需要 Key），
 * 和标准答案逐题比较：题数、题号、转写准确率、裁图对账。结果在 window.handwritingReport。
 */
(async () => {
  const dir = '/tmp-fixtures/handwriting/';
  const truth = await (await fetch(`${dir}mw-truth.json`)).json();
  const notes = ['la-10.pdf', 'la-25.pdf', 'la-40.pdf', 'la-60.pdf'];
  const failures = [];
  const pages = [];
  const check = (name, ok) => { if (!ok) failures.push(name); };

  async function sourceCanvas(name) {
    const blob = await (await fetch(dir + name)).blob();
    if (name.endsWith('.pdf')) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      const pdf = await window.pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
      const page = await pdf.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PAGE_LONG_SIDE_PX / Math.max(base.width, base.height) });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport, intent: 'print' }).promise;
      return canvas;
    }
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    return canvas;
  }

  // 1. 本机部分
  for (const name of [...truth.map((t) => t.name), ...notes]) {
    const source = await sourceCanvas(name);
    const started = performance.now();
    const { canvas, angle } = preprocessHandwrittenPage(source);
    const blocks = handwritingBlocks(canvas);
    const ms = Math.round(performance.now() - started);
    const gt = truth.find((t) => t.name === name);
    pages.push({ name, ms, angle, blocks: blocks.length, formulas: gt ? gt.formulas.length : null });
    if (gt) check(`${name}：块数 ${blocks.length} 少于题数 ${gt.formulas.length}`, blocks.length >= gt.formulas.length);
    check(`${name}：本机整理超过 1.5 秒（${ms} 毫秒）`, ms < 1500);
  }

  // 2. 完整流程（调用 Gemini）
  const results = [];
  if (window.__hwUseAi) {
    // 同一个意思的不同写法算相同：\setminus 和 \backslash、ℤ 和 Z、\dots 和 ...、\sin 和 sin、\mid 和 |。
    const norm = (s) => String(s || '').replace(/\\\(|\\\)|\\\[|\\\]|\$/g, '').replace(/\\left|\\right|\\[,;! ]|\\displaystyle|\s+/g, '')
      .replace(/\\[dt]frac/g, '\\frac').replace(/\\setminus/g, '\\backslash').replace(/\\mid/g, '|').replace(/\\(?:dots|ldots|cdots)/g, '...')
      .replace(/\\(?:mathbb|mathrm|mathbf|operatorname|text)\{([^{}]*)\}/g, '$1').replace(/\\(sin|cos|tan|log|ln|exp|lim|max|min)\b/g, '$1')
      .replace(/\\varphi/g, '\\phi').replace(/\\varepsilon/g, '\\epsilon').replace(/\\widehat/g, '\\hat').replace(/\\widetilde/g, '\\tilde')
      .replace(/[{}]/g, '').replace(/\[\?\]/g, '');
    const similarity = (a, b) => {
      const x = norm(a);
      const y = norm(b);
      if (!x && !y) return 1;
      const d = Array.from({ length: x.length + 1 }, (_, i) => [i]);
      for (let j = 1; j <= y.length; j++) d[0][j] = j;
      for (let i = 1; i <= x.length; i++) {
        for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
      }
      return 1 - d[x.length][y.length] / Math.max(x.length, y.length);
    };
    $('handwriting').checked = true;
    // window.__hwOnly = ['mw-8.jpg', ...] 只跑这几页，省调用次数。
    const chosen = [...truth.map((t) => t.name), ...notes].filter((name) => !window.__hwOnly || window.__hwOnly.includes(name));
    for (const name of chosen) {
      const blob = await (await fetch(dir + name)).blob();
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], name, { type: blob.type || (name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg') }));
      $('file').files = transfer.files;
      $('file').dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 300));
      const started = performance.now();
      await analyzeCurrent();
      clearTimeout(bankTimer);
      const seconds = (performance.now() - started) / 1000;
      const error = $('error').hidden ? '' : $('error').textContent.slice(0, 160);
      const gt = truth.find((t) => t.name === name);
      const qs = state.questions;
      const entry = { name, seconds: +seconds.toFixed(1), questions: qs.length, error, flagged: qs.filter((q) => (q.crop_flags || []).length).length };
      if (gt) {
        entry.expected = gt.formulas.length;
        // 按题号对上标准答案（标准答案按阅读顺序编号 1..n）。
        const scores = gt.formulas.map((formula, index) => {
          const q = qs.find((x) => String(x.question_number).replace(/\D/g, '') === String(index + 1)) || qs[index];
          return q ? similarity([q.text, ...q.sub_parts.map((p) => p.text)].join(' '), formula.latex) : 0;
        });
        entry.exact = scores.filter((s) => s === 1).length;
        entry.similarity = +(scores.reduce((sum, s) => sum + s, 0) / scores.length).toFixed(3);
        entry.numbers = qs.map((q) => q.question_number).join(',');
        entry.worst = gt.formulas.map((f, i) => ({ i: i + 1, s: +scores[i].toFixed(2), want: f.latex, got: (qs.find((x) => String(x.question_number).replace(/\D/g, '') === String(i + 1)) || qs[i] || {}).text }))
          .filter((x) => x.s < 1).sort((a, b) => a.s - b.s).slice(0, 3);
        check(`${name}：题数 ${qs.length}，应为 ${gt.formulas.length}`, qs.length === gt.formulas.length);
      }
      check(`${name}：出错 ${error}`, !error);
      results.push(entry);
    }
  }
  window.handwritingReport = { failures, pages, results };
  console.log(failures.length ? `手写题检查有问题：${failures.join('；')}` : '手写题检查通过', pages, results);
})();

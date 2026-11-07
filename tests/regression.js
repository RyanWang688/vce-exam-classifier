/*
 * 回归检查：算法模式修过的问题都写在这里，以后改代码时一起复查，防止同类问题再出现。
 *
 * 用法：
 * 1. 运行 tests/fetch-papers.ps1，把公开试卷下载到 tmp-fixtures/（已被 .gitignore 忽略）。
 *    校内卷和本地卷自己复制进去，文件名见下方 CASES。
 * 2. 用本地服务器打开页面，比如 python -m http.server 8000。
 * 3. 在浏览器控制台运行：
 *      const s = document.createElement('script'); s.src = '/tests/regression.js'; document.head.append(s);
 *    结果打印在控制台，也保存在 window.regressionReport。
 *
 * 发现新问题时，先在这里加一条能复现它的检查，再改代码。
 * 只写公式片段和分值，不要把试卷原文写进来，这个仓库是公开的。
 */
(() => {
  const norm = (text) => text.replace(/\\displaystyle|\\left|\\right|\s/g, '');
  const question = (list, section, number) => list.find((q) => String(q.question_number) === String(number) &&
    (!section || (q.section || '').endsWith(section)));
  const allText = (q) => norm([q.text, ...q.sub_parts.map((p) => p.text)].join(' '));

  // total：题数和总分。scored：所有带分值的小问数。其余按题检查：
  // has 必须出现的公式，lacks 不能出现的内容，topic 主知识点，parts 小问分值分布。
  const CASES = [
    {
      file: 'mocksac.pdf', note: '浏览器打印：∫、√、括号是描边线条，斜体靠剪切',
      total: [11, 60], flagged: 0,
      checks: [
        { n: 1, has: ['\\sqrt{2}-\\sqrt{3}'], lacks: ['\\overline'] },
        { n: 4, has: ['(3-\\sqrt{3}i)^{3}'] },
        { n: 5, has: ['P(z)=z^{3}+4-4\\sqrt{3}i'] },
        { n: 6, has: ['\\int_{0}^{\\pi}x\\cos'] },
        { n: 11, has: ['\\theta_{1}=\\arctan', 'u_{n}=\\arctan', '\\sum_{1}^{\\infty}(u_{n}-u_{n+1})'], lacks: ['\\_^{'] },
      ],
    },
    {
      file: '2025SM2.pdf', note: '|z| 是画出来的竖线；分数夹在两行之间；复数和大题分类',
      total: [26, 80], scoredB: 44, figures: 5,
      checks: [
        { s: 'A', n: 5, topic: 'Complex numbers' },
        { s: 'A', n: 6, topic: 'Complex numbers', has: ['|z|=1'] },
        { s: 'A', n: 10, has: ['a>0', '\\frac{\\pi(4\\pi+3\\sqrt{3})}{8}'] },
        { s: 'A', n: 14, has: ['=|\\underset{\\sim}{\\mathrm{a}}\\times\\underset{\\sim}{\\mathrm{b}}|'] },
        { s: 'B', n: 6, topic: 'Hypothesis testing for a population mean', parts: { 'Distribution of the sample mean': 2, 'Confidence intervals for the population mean': 3, 'Hypothesis testing for a population mean': 5 } },
      ],
    },
    {
      file: '2025MM2.pdf', note: 'Symbol 按页重新编号；π 是剪切斜体；√ 是填充多边形',
      total: [24, 80],
      checks: [
        { s: 'A', n: 4, has: ['k=\\frac{3}{2}'] },
        { s: 'A', n: 14, has: ['\\begin{cases}', '\\frac{1}{\\sqrt{2}}'] },
        { s: 'A', n: 19, has: ['\\sqrt{2}-2'] },
      ],
    },
    {
      file: '2025GM2.pdf', note: '方括号是 L 形多边形；= 是两条细线；矩阵带行列标签；有边框的表格',
      total: [18, 60],
      checks: [
        { n: 11, has: ['C=\\begin{bmatrix}8\\\\8\\\\20\\end{bmatrix}', 'E=\\overset'] },
      ],
    },
    { file: '2024MM1-w.pdf', note: '扫描件：封面勘误 “Question 6, ...” 不是题；页码被 OCR 读坏的页眉要去掉', total: [8, 40], checks: [{ n: 2, lacks: ['Examination'] }, { n: 4, lacks: ['Examination'] }, { n: 6, lacks: ['Examination'] }] },
    { file: '2023genmath1-w.pdf', note: '多题共用材料要进每道相关题；页面有灰色细框', total: [40, 40], checks: [{ n: 8, has: ['Use the following information to answer Questions 7 and 8'], topic: 'Investigating and modelling linear associations' }] },
    { file: '2024GeneralMaths1-w.pdf', note: '扫描件：结束标记读坏，最后一题不能带上版权行和公式表', scan: true, total: [40, 40], checks: [{ n: 40, lacks: ['Formula', 'Victorian'] }] },
    { file: '2023specmath1-w.pdf', note: '波浪号向量、AB 箭头、导数点', total: [10, 40], checks: [{ n: 9, has: ['\\overrightarrow{AB}', '\\underset{\\sim}{\\mathrm{i}}'] }, { n: 10, has: ['\\dot{\\underset{\\sim}{\\mathrm{r}}}'] }] },
    { file: '2023MM2-w.pdf', note: 'π、括号、逗号是轮廓图形；小问 i、j 接在 h 后面；lim 下方条件', total: [25, 80], checks: [{ s: 'B', n: 3, has: ['\\lim_{x\\to-\\infty}'] }] },
    { file: '2024MM2-nht-w.pdf', note: '相邻选项的括号不能连成矩阵', total: [25, 80], checks: [{ s: 'A', n: 20, lacks: ['\\begin{bmatrix}'] }] },
    { file: 'AURORA2.pdf', note: 'LaTeX 排版、Part 大题', total: [4, 60], checks: [{ n: 'A', has: ['\\begin{cases}', '\\mathbb{R}'] }] },
    { file: 'AURORA1.pdf', note: 'Part A | 标题、(a) 小问、[2] 分值', total: [4, 60], checks: [] },
    { file: 'mocksac.docx', note: 'Word 公式结构', total: [11, 60], checks: [{ n: 6, has: ['\\int_{0}^{\\pi}'] }, { n: 11, has: ['{\\theta}_{1}'] }] },
  ];

  async function runFile(name) {
    const blob = await (await fetch(`/tmp-fixtures/vcaa/${name}`)).blob();
    const type = name.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], name, { type }));
    $('provider').value = 'rules';
    $('provider').dispatchEvent(new Event('change'));
    $('file').files = transfer.files;
    $('file').dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    $('analyze').click();
    await new Promise((resolve) => setTimeout(resolve, 500));
    for (let i = 0; i < 1500 && state.abort; i++) await new Promise((resolve) => setTimeout(resolve, 200));
    return state.questions;
  }

  async function runCase(item) {
    const failures = [];
    const list = await runFile(item.file);
    const marks = list.reduce((sum, q) => sum + (q.marks || 0), 0);
    if (list.length !== item.total[0] || marks !== item.total[1]) failures.push(`总数：${list.length} 题 ${marks} 分，应为 ${item.total.join(' 题 ')} 分`);
    // 切题截图：PDF 的每道题都要有。Word 没有页面，继续用文字。
    if (item.file.endsWith('.pdf') && list.some((q) => !q.snapshot)) failures.push('有题没有切题截图');
    if (item.flagged !== undefined && list.filter((q) => q.math_problems.length).length !== item.flagged) failures.push('待核对题数变了');
    if (item.scoredB !== undefined) {
      const count = list.filter((q) => (q.section || '').endsWith('B')).flatMap((q) => q.sub_parts.filter((p) => p.marks)).length;
      if (count !== item.scoredB) failures.push(`B 区计分小问 ${count}，应为 ${item.scoredB}`);
    }
    if (item.figures !== undefined && list.reduce((sum, q) => sum + (q.figures || []).length, 0) !== item.figures) failures.push('配图数量变了');
    // 扫描件的题目看裁图，OCR 还原的公式不显示，不要求能渲染。
    if (!item.scan) list.forEach((q) => [q.text, ...q.sub_parts.map((p) => p.text)].forEach((text) => (text.match(/\\\[.*?\\\]|\\\(.*?\\\)/gs) || []).forEach((piece) => {
      try { window.katex.renderToString(piece.slice(2, -2), { throwOnError: true }); } catch (e) { failures.push(`Q${q.question_number} 公式解析失败：${piece.slice(0, 50)}`); }
    })));
    item.checks.forEach((check) => {
      const q = question(list, check.s, check.n);
      const label = `${check.s || ''}${check.n}`;
      if (!q) { failures.push(`${label} 没找到`); return; }
      const text = allText(q);
      (check.has || []).forEach((piece) => { if (!text.includes(norm(piece))) failures.push(`${label} 缺少 ${piece}`); });
      (check.lacks || []).forEach((piece) => { if (text.includes(norm(piece))) failures.push(`${label} 不该有 ${piece}`); });
      if (check.topic && q.topic !== check.topic) failures.push(`${label} 知识点是 ${q.topic}`);
      Object.entries(check.parts || {}).forEach(([topic, want]) => {
        const got = q.sub_parts.filter((p) => p.topic === topic).reduce((sum, p) => sum + (p.marks || 0), 0);
        if (got !== want) failures.push(`${label} ${topic} ${got} 分，应为 ${want}`);
      });
    });
    return failures;
  }

  (async () => {
    const report = [];
    for (const item of CASES) {
      let failures;
      try { failures = await runCase(item); } catch (e) { failures = [`运行失败：${e.message || e}`]; }
      report.push({ file: item.file, note: item.note, ok: !failures.length, failures });
      console.log(`${failures.length ? '✗' : '✓'} ${item.file}`, failures);
    }
    window.regressionReport = report;
    console.log(`通过 ${report.filter((r) => r.ok).length} / ${report.length}`);
  })();
})();

/*
 * 组卷检查：用假数据检查抽题规则，不需要试卷文件。
 * 用法：打开页面后在控制台运行
 *   const s = document.createElement('script'); s.src = '/tests/paper-check.js'; document.head.append(s);
 * 结果打印在控制台，也保存在 window.paperCheckReport。
 */
(() => {
  const topics = ['T1', 'T2', 'T3'];
  const levels = ['easy', 'medium', 'hard', ''];
  const types = ['multiple choice', 'extended response'];
  const rows = [];
  for (let i = 0; i < 120; i++) {
    const type = types[i % 5 === 0 ? 1 : 0];
    rows.push({
      source_id: `q${i}`, subject: i % 7 === 0 ? 'General Mathematics' : 'Mathematical Methods', topic: topics[i % 3],
      question_type: type, marks: type === 'multiple choice' ? 1 : 3 + (i % 9), difficulty: levels[i % 4], snapshot: 'x',
    });
  }
  const base = { subject: 'Mathematical Methods', minutes: 60, topics, types, ratio: { easy: 3, medium: 5, hard: 2 }, includeUnlabelled: true };
  const failures = [];
  const minutes = (list) => list.reduce((sum, row) => sum + questionMinutes(row), 0);
  const check = (name, ok) => { if (!ok) failures.push(name); };

  [30, 60, 80, 120].forEach((total) => {
    const { picked } = assemblePaper(rows, { ...base, minutes: total }, seededRandom(7));
    check(`${total} 分钟不超时`, minutes(picked) <= total * PAPER_OVERRUN);
    check(`${total} 分钟凑够九成`, minutes(picked) >= total * 0.9);
    check(`${total} 分钟没有重复`, new Set(picked).size === picked.length);
    check(`${total} 分钟只出本科目`, picked.every((row) => row.subject === base.subject));
  });
  const one = assemblePaper(rows, { ...base, topics: ['T2'], types: ['multiple choice'] }, seededRandom(1)).picked;
  check('只选一个知识点', one.length > 0 && one.every((row) => row.topic === 'T2'));
  check('只选选择题', one.every((row) => row.question_type === 'multiple choice'));
  const hard = assemblePaper(rows, { ...base, ratio: { easy: 0, medium: 0, hard: 1 } }, seededRandom(1)).picked;
  check('只要难题', hard.length > 0 && hard.every((row) => row.difficulty === 'hard'));
  const labelled = assemblePaper(rows, { ...base, includeUnlabelled: false }, seededRandom(1)).picked;
  check('不要未标难度的题', labelled.every((row) => row.difficulty));
  const a = assemblePaper(rows, base, seededRandom(3)).picked.map((row) => row.source_id).join();
  const b = assemblePaper(rows, base, seededRandom(3)).picked.map((row) => row.source_id).join();
  check('同一个种子结果相同', a === b);
  const empty = assemblePaper(rows, { ...base, topics: ['不存在'] }, seededRandom(1));
  check('没有题时给出提示', empty.picked.length === 0 && empty.warnings.length > 0);
  const general = { ...rows.find((row) => row.subject === 'General Mathematics'), question_type: 'multiple choice' };
  check('General 选择题按 2.25 分钟', questionMinutes(general) === GENERAL_CHOICE_MINUTES);
  check('难度换算', difficultyFromFacility(0.7) === 'easy' && difficultyFromFacility(0.5) === 'medium' && difficultyFromFacility(0.3) === 'hard');
  check('NHT 卷不用考试报告', reportDifficulty({ subject: 'Mathematical Methods', paper_type: 'VCAA Exam 2 (NHT)', sitting: 'NHT', year: 2024 }, []) === null);

  // AI 补题的安排和本地检查（不调用 AI）。
  const options = { ...base, minutes: 60, topics: ['T1'], types: ['multiple choice', 'extended response'] };
  const requests = gapRequests(options, [], rows);
  const planned = requests.reduce((sum, request) => sum + questionMinutes(request), 0);
  check('补题凑够时长且不超时', planned <= 60 && planned >= 60 - MINUTES_PER_MARK * 2);
  check('补题只出所选知识点和题型', requests.every((request) => request.topic === 'T1' && options.types.includes(request.question_type)));
  const request = { subject: 'Mathematical Methods', topic: 'T1', question_type: 'extended response', marks: 4 };
  const good = { stem: 'Let \\(f(x)=x^2\\).', options: [], gen_parts: [{ label: 'a', text: 'Find \\(f\'(1)\\).', marks: 2 }, { label: 'b', text: 'Find \\(f\'(2)\\).', marks: 2 }], answers: [], solution: 'x' };
  check('分值合计正确时通过', localChecks(good, request, []).fatal.length === 0);
  const wrongMarks = { ...good, gen_parts: [{ label: 'a', text: 'Find it.', marks: 3 }] };
  check('分值合计不对时拒绝', localChecks(wrongMarks, request, []).fatal.length > 0);
  const copyText = 'Consider the function f defined for all real numbers x by the rule given below and find the derivative at the point';
  const copied = { ...good, stem: copyText };
  check('照抄范例时拒绝', localChecks(copied, request, [{ text: copyText }]).fatal.length > 0);
  const stock = 'The graph of y = f(x) is transformed by a dilation by a factor of 3 from the y-axis followed by a translation of 2 units in the positive direction of the x-axis';
  const reworded = { ...good, stem: stock.replace('factor of 3', 'factor of 5').replace('2 units', '4 units') };
  check('措辞固定但数字换了不算照抄', localChecks(reworded, request, [{ text: stock }]).fatal.length === 0);
  const choice = { stem: 'Q', options: ['1', '2', '3', '4'], gen_parts: [], answers: [{ label: 'MC', value: 'E' }], solution: '' };
  check('选择题答案不在选项里时拒绝', localChecks(choice, { ...request, question_type: 'multiple choice', marks: 1 }, []).fatal.length > 0);
  check('答案写法不同也算相同', sameAnswer('\\left( 2 \\right)', '(2)'));
  check('不同的答案不算相同', !sameAnswer('2', '3'));

  // 带图的题：图形数据检查和本地画图。
  if (window.math) {
    const graph = { x_min: -3, x_max: 3, y_min: -5, y_max: 5, functions: [{ expr: 'x^3 - 3*x' }, { expr: '1/(x-1)', dashed: true }], points: [{ x: 1, y: -2 }], vertical: [1] };
    check('正常的图通过检查', checkFigure(graph).length === 0);
    check('算不出的函数被拦下', checkFigure({ ...graph, functions: [{ expr: 'x^^2' }] }).length > 0);
    check('看不到的曲线被拦下', checkFigure({ ...graph, functions: [{ expr: 'x + 100' }] }).length > 0);
    check('坐标范围不对被拦下', checkFigure({ ...graph, x_max: -4 }).length > 0);
    const svg = figureSvg(graph);
    check('画出两条曲线和一个点', svg.querySelectorAll('path').length === 2 && svg.querySelectorAll('circle').length === 1);
    check('题目文字里带上图形数据', figureText(graph).includes('y = x^3 - 3*x'));
    // 真实出题时遇到的：端点是无穷大、多画了和坐标轴重合的线、图上标出了答案。
    check('端点是无穷大也能检查', checkFigure({ ...graph, functions: [{ expr: '4 - 0.25*x^2', from: 0, to: Infinity }] }).length === 0);
    const tidied = tidyFigure({ ...graph, functions: [...graph.functions, { expr: '0', dashed: true }], vertical: [0, 1], horizontal: [0] });
    check('去掉和坐标轴重合的线', tidied.functions.length === 2 && tidied.vertical.length === 1 && !tidied.horizontal.length);
    check('发现图上标出了答案', figureLeaks({ figure: { points: [{ x: 3, y: 0 }] }, answers: [{ label: 'c', value: '(-2, 0), (3, 0)' }] }).length === 1);
    const needFigure = localChecks({ ...good, figure: null }, { ...request, wantFigure: true }, []);
    check('要求带图却没给图时拒绝', needFigure.fatal.length > 0);
  } else {
    failures.push('math.js 没有加载，跳过画图检查');
  }

  window.paperCheckReport = failures;
  console.log(failures.length ? `组卷检查失败：${failures.join('；')}` : '组卷检查全部通过');
})();

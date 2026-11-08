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
  const choice = { stem: 'Q', options: ['1', '2', '3', '4'], gen_parts: [], answers: [{ label: 'MC', value: 'E' }], solution: '' };
  check('选择题答案不在选项里时拒绝', localChecks(choice, { ...request, question_type: 'multiple choice', marks: 1 }, []).fatal.length > 0);
  check('答案写法不同也算相同', sameAnswer('\\left( 2 \\right)', '(2)'));
  check('不同的答案不算相同', !sameAnswer('2', '3'));

  window.paperCheckReport = failures;
  console.log(failures.length ? `组卷检查失败：${failures.join('；')}` : '组卷检查全部通过');
})();

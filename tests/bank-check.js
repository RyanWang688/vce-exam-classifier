/*
 * 题库检查：用内存驱动检查题库接口（升级旧格式、保存试卷、删试卷、合并、导出导入），再测大题库下组卷的速度。
 * 不需要试卷文件，不会动浏览器里真实的题库（测试期间换成内存驱动，结束后换回）。
 * 用法：打开页面后在控制台运行
 *   const s = document.createElement('script'); s.src = '/tests/bank-check.js'; document.head.append(s);
 * 结果打印在控制台，也保存在 window.bankCheckReport（{ failures, timings }）。
 */
(async () => {
  const failures = [];
  const timings = {};
  const check = (name, ok) => { if (!ok) failures.push(name); };
  const real = bank.driver;
  // 1x1 的 PNG，当作裁图和配图。
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const oldRow = (id, sha) => ({
    source_id: id, subject: 'Mathematical Methods', unit: 'Unit 3/4', topic: 'T1', question_type: 'short answer', marks: 2,
    source: { label: id, publisher: 'VCAA', year: 2025, paper_title: 'Test', paper_type: 'Exam 1', file_sha256: sha },
    snapshot: png, figures: [{ page: 1, description: 'fig', image: png }], saved_at: '2026-11-01T00:00:00.000Z',
  });
  try {
    bank.use(memoryDriver());

    // 1. 升级旧格式
    const { record, assets } = upgradeQuestion(oldRow('a-q1', 'sha-a'));
    check('升级后记录里没有图片', !record.snapshot && !record.figures[0].image);
    check('升级后图片拆成两个文件', assets.length === 2 && record.snapshot_asset === 'a-q1#snapshot' && record.figures[0].image_asset === 'a-q1#figure-0');
    check('升级后有试卷 ID 和版本', record.paper_id === 'sha-a' && record.schema_version === RECORD_VERSION);
    check('升级后图片内容不变', (await readDataUrl(assets[0].blob)) === png);
    check('新格式不再升级', upgradeQuestion(record).assets.length === 0);
    const papers = legacyPapers([record, upgradeQuestion(oldRow('a-q2', 'sha-a')).record]);
    check('旧题按来源补出试卷', papers.length === 1 && papers[0].question_ids.length === 2 && papers[0].source_assets.length === 0);

    // 2. 保存试卷：题目 ID 变了，旧题和它的图片要删掉
    const paper = (ids) => ({ paper_id: 'P', subject: 'Mathematical Methods', question_ids: ids, source_assets: ['P#source-0'] });
    const question = (id) => ({ source_id: id, paper_id: 'P', snapshot_asset: `${id}#snapshot`, figures: [{ image_asset: `${id}#figure-0` }] });
    const files = (id) => [makeAsset(`${id}#snapshot`, 'snapshot', id, new Blob(['s'])), makeAsset(`${id}#figure-0`, 'figure', id, new Blob(['f']))];
    await bank.savePaper(paper(['x1', 'x2']), [question('x1'), question('x2')], [...files('x1'), ...files('x2'), makeAsset('P#source-0', 'source', 'P', new Blob(['pdf']))]);
    const firstSave = await bank.getQuestion('x1');
    check('第一次保存有创建时间和操作人', firstSave.created_at && firstSave.created_by === BANK_USER);
    const removed = await bank.savePaper(paper(['y1', 'x2']), [question('y1'), question('x2')], files('y1'));
    const left = (await bank.listQuestions()).map((q) => q.source_id).sort().join();
    const assetsLeft = (await bank.driver.getAll('assets')).map((a) => a.id);
    check('改 ID 后旧题删掉', left === 'x2,y1');
    check('旧题的图片删掉并告诉调用方', removed.sort().join() === 'x1#figure-0,x1#snapshot' && !assetsLeft.some((id) => id.startsWith('x1#')));
    check('没变的图片和原卷保留', assetsLeft.includes('x2#snapshot') && assetsLeft.includes('P#source-0'));
    check('再保存时保留创建时间', (await bank.getQuestion('x2')).created_at === firstSave.created_at);

    // 3. 删除试卷：题目、图片、原卷一起删
    await bank.deletePaper('P');
    check('删试卷后没有题', (await bank.listQuestions()).length === 0);
    check('删试卷后没有文件', (await bank.driver.getAll('assets')).length === 0);

    // 4. 合并：较新的覆盖，较旧的跳过
    await bank.write([{ table: 'questions', put: [{ source_id: 'm1', updated_at: '2026-11-10', topic: 'old' }, { source_id: 'm2', updated_at: '2026-11-10', topic: 'keep' }] }]);
    const merged = await mergeBank({
      papers: [], assets: [], specs: [{ version: 1, text: 'a' }], feedback: [{ id: 'fb-1' }],
      questions: [{ source_id: 'm1', updated_at: '2026-11-12', topic: 'new' }, { source_id: 'm2', updated_at: '2026-11-01', topic: 'older' }],
    });
    check('较新的题覆盖', (await bank.getQuestion('m1')).topic === 'new');
    check('较旧的题不覆盖', (await bank.getQuestion('m2')).topic === 'keep' && merged.skipped.questions === 1);
    const again = await mergeBank({ papers: [], questions: [], assets: [], specs: [{ version: 1, text: 'b' }], feedback: [{ id: 'fb-1' }] });
    check('规范版本和审核意见不重复导入', again.specs === 0 && again.feedback === 0 && (await bank.listSpecs())[0].text === 'a');

    // 5. 导出 ZIP 再导入到空题库，内容一致
    if (window.JSZip) {
      await bank.clearAll();
      const up = [oldRow('z-q1', 'sha-z'), oldRow('z-q2', 'sha-z')].map(upgradeQuestion);
      await bank.write([
        { table: 'questions', put: up.map((u) => u.record) }, { table: 'assets', put: up.flatMap((u) => u.assets) },
        { table: 'papers', put: legacyPapers(up.map((u) => u.record)) }, { table: 'specs', put: [{ version: 3, text: 'spec' }] },
      ]);
      const zip = await buildBankZip();
      bank.use(memoryDriver());
      const result = await mergeBank(await readBankFile(new File([zip], 'bank.zip', { type: 'application/zip' })));
      check('ZIP 导入题目和试卷', result.questions === 2 && result.papers === 1 && result.specs === 1);
      check('ZIP 导入图片', result.assets === 4 && (await bank.assetDataUrl('z-q1#snapshot')) === png);
      // 以前“导出题库 JSON”得到的旧文件：一个数组，图片在记录里
      bank.use(memoryDriver());
      const legacy = new File([JSON.stringify([oldRow('l-q1', 'sha-l')])], 'old.json', { type: 'application/json' });
      const fromLegacy = await mergeBank(await readBankFile(legacy));
      check('旧 JSON 导入并升级', fromLegacy.questions === 1 && fromLegacy.papers === 1 && fromLegacy.assets === 2 && !(await bank.getQuestion('l-q1')).snapshot);
      let refused = false;
      try { await readBankFile(new File(['{"hello":1}'], 'x.json')); } catch (e) { refused = true; }
      check('不是题库的文件会拒绝', refused);
    } else {
      failures.push('JSZip 没有加载，跳过导出导入检查');
    }

    // 6. 大题库：5000 道题，读出全部记录 + 组一份 80 分钟的卷
    bank.use(memoryDriver());
    const topics = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
    const big = [];
    for (let i = 0; i < 5000; i++) {
      const type = i % 4 === 0 ? 'extended response' : 'multiple choice';
      big.push({
        source_id: `b${i}`, paper_id: `p${i % 200}`, subject: i % 3 === 0 ? 'General Mathematics' : 'Mathematical Methods', topic: topics[i % 6],
        question_type: type, marks: type === 'multiple choice' ? 1 : 3 + (i % 9), difficulty: ['easy', 'medium', 'hard', ''][i % 4],
        snapshot_asset: `b${i}#snapshot`, text: 'x'.repeat(400),
      });
    }
    await bank.write([{ table: 'questions', put: big }]);
    let start = performance.now();
    const rows = await bank.listQuestions();
    timings.list5000ms = Math.round(performance.now() - start);
    start = performance.now();
    const { picked } = assemblePaper(rows, { subject: 'Mathematical Methods', minutes: 80, topics, types: ['multiple choice', 'extended response'], ratio: { easy: 3, medium: 5, hard: 2 }, includeUnlabelled: true }, seededRandom(5));
    timings.assemble5000ms = Math.round(performance.now() - start);
    timings.recordKB = Math.round(JSON.stringify(rows).length / rows.length / 102.4) / 10;
    check('大题库能组卷', picked.length > 10 && picked.every(hasImage));
    check('大题库组卷 1 秒内', timings.assemble5000ms < 1000);
  } catch (e) {
    failures.push(`运行失败：${e.message || e}`);
  } finally {
    bank.use(real);
  }
  window.bankCheckReport = { failures, timings };
  console.log(failures.length ? `题库检查失败：${failures.join('；')}` : '题库检查全部通过', timings);
})();

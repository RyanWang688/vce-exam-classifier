/*
 * 网站版检查：在模拟的 Wix 环境里跑一遍网站版的主要流程。不发出任何真实请求。
 * 需要 tmp-fixtures/vcaa/2025MM1.pdf（运行 tests/fetch-papers.ps1 下载）。
 * 用法：用本地服务器打开 /tests/wix-mock/host.html，在控制台运行
 *   const s = document.createElement('script'); s.src = '/tests/wix-mock/wix-check.js'; document.head.append(s);
 * 结果打印在控制台，也保存在 window.wixCheckReport（{ failures, notes }）。
 */
(async () => {
  const failures = [];
  const notes = {};
  const check = (name, ok) => { if (!ok) failures.push(name); };
  const count = (list) => list.reduce((m, c) => ((m[c] = (m[c] || 0) + 1), m), {});
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const open = async (query = '') => {
    const app = await mock.load(`${query}&r=${Date.now()}`);
    for (let i = 0; i < 50 && !app.document.getElementById('wixStatus').textContent.match(/已登录|没有权限|连不上/); i++) await wait(200);
    return app;
  };
  try {
    mock.reset();
    mock.roles = [{ title: 'Teacher' }];
    mock.failUpload = false;
    mock.failDownload = false;
    mock.timeoutMs = 0;
    mock.geminiStatus = 0;

    // 1. 权限
    mock.roles = [{ title: 'Student' }];
    let app = await open();
    check('没有老师角色时不能用', app.eval('state.wixBlocked') === true && app.eval('bank.driver.name') === 'IndexedDB');
    mock.roles = null;
    app = await open();
    check('没登录时不能用', /请先登录/.test(app.document.getElementById('wixStatus').textContent));
    mock.roles = [{ title: 'Teacher' }];
    app = await open();
    check('老师可以用', app.eval('bank.driver.name') === 'Wix' && !app.eval('state.wixBlocked'));
    check('页面上没有 Key', app.eval('aiKey()') === 'wix-backend' && app.document.getElementById('keyField').hidden);

    // 2. 分析并存进网站题库
    const ev = (s) => app.eval(s);
    const $a = (id) => app.document.getElementById(id);
    $a('provider').value = 'rules';
    $a('provider').dispatchEvent(new app.Event('change'));
    const pdf = await (await fetch('/tmp-fixtures/vcaa/2025MM1.pdf')).blob();
    const transfer = new app.DataTransfer();
    transfer.items.add(new app.File([pdf], '2025MM1.pdf', { type: 'application/pdf' }));
    $a('file').files = transfer.files;
    $a('file').dispatchEvent(new app.Event('change', { bubbles: true }));
    await wait(300);
    await ev('analyzeCurrent()');
    await ev('(clearTimeout(bankTimer), saveBankNow())');
    const fresh = ev('exportRows(true)');
    check('存进 9 道题和 1 份试卷', mock.records('questions').length === 9 && mock.records('papers').length === 1);
    check('图片和原卷进了媒体库，记录里没有文件内容', mock.files.size === 13 && mock.records('assets').every((a) => a.file_url && !a.blob));
    check('原卷不公开，裁图公开', [...mock.files.values()].every((f) => f.isPrivate === (f.mime === 'application/pdf')));
    check('操作人是会员 ID', mock.records('questions').every((q) => q.updated_by === mock.memberId));
    mock.calls = [];
    ev('state.questions[1].confirmed = true');
    await ev('(clearTimeout(bankTimer), saveBankNow())');
    check('再次保存不重复上传图片', !mock.calls.includes('assetUploadUrl'));

    // 3. 刷新后从题库打开，和分析结果一致
    app = await open();
    const paperId = mock.records('papers')[0].paper_id;
    mock.calls = [];
    await app.eval(`openPaperFromBank(${JSON.stringify(paperId)})`);
    const reopened = app.eval('exportRows(true)');
    fresh[1].confirmed = true;
    const diffs = [];
    fresh.forEach((row, i) => Object.keys({ ...row, ...reopened[i] }).forEach((key) => {
      if (JSON.stringify(row[key]) !== JSON.stringify(reopened[i][key])) diffs.push(`${row.question_number}.${key}`);
    }));
    check(`重新打开和分析结果一致（不同：${diffs.join(', ')}）`, diffs.length === 0);
    notes.openCalls = count(mock.calls);

    // 4. 调整裁图：新图上传，旧图进回收站
    const old = mock.records('assets').find((a) => a.id.endsWith('q8#snapshot'));
    mock.trashed = [];
    await app.eval('(async () => { const q = state.questions[7]; await openRegionEditor(q); regionEdit.regions[0].topRatio += 0.03; await saveRegions(); clearTimeout(bankTimer); await saveBankNow(); })()');
    const now = mock.records('assets').find((a) => a.id.endsWith('q8#snapshot'));
    check('调整裁图后换了新文件', now.file_url !== old.file_url && mock.trashed.includes(old.file_url));

    // 5. 浏览器直接上传、下载失败时走后端
    mock.failUpload = true;
    mock.calls = [];
    await app.eval('(async () => { for (const i of [0, 1]) { const q = state.questions[i]; await openRegionEditor(q); regionEdit.regions[0].topRatio += 0.01; await saveRegions(); } clearTimeout(bankTimer); await saveBankNow(); })()');
    mock.failUpload = false;
    notes.uploadFallback = count(mock.calls);
    check('上传失败时经后端转存', notes.uploadFallback.assetUploadBase64 === 2 && notes.uploadFallback.assetUploadUrl === 1);
    mock.failDownload = true;
    app = await open();
    mock.calls = [];
    await app.eval(`openPaperFromBank(${JSON.stringify(paperId)})`);
    mock.failDownload = false;
    notes.downloadFallback = count(mock.calls);
    check('下载失败时经后端读取', app.eval('state.questions.every((q) => q.snapshot)') && notes.downloadFallback.assetHref === 1);

    // 6. AI 由后端调用：Key 来自 Secrets，大文件先传媒体库，超时后后端继续
    mock.gemini = [];
    mock.geminiReply = () => ({ answer: 42 });
    const r1 = await app.eval('aiCall([{ text: "hello" }], { type: "OBJECT" })');
    app.__pdf64 = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(pdf); });
    mock.trashed = [];
    const filesBefore = mock.files.size;
    mock.timeoutMs = 100;
    const r2 = await app.eval('aiCall([{ inlineData: { mimeType: "application/pdf", data: window.__pdf64 } }, { text: "x" }], { type: "OBJECT" })');
    mock.timeoutMs = 0;
    check('AI 结果正确', r1.answer === 42 && r2.answer === 42);
    check('Key 来自后端', mock.gemini.every((g) => g.keyFromSecret));
    check('大文件经媒体库交给 Gemini，用完删掉', mock.gemini[1].pdfBytes === pdf.size && mock.trashed.length === 1 && mock.files.size === filesBefore);
    check('取完结果删掉任务', mock.jobs().length === 0);
    mock.geminiStatus = 429;
    let quota = '';
    try { await app.eval('aiCall([{ text: "q" }], { type: "OBJECT" })'); } catch (e) { quota = e.title || e.message; }
    mock.geminiStatus = 0;
    check('额度用完时提示和本地版一样', /429/.test(quota));

    // 7. 导出、清空、导入
    const snapshot = () => JSON.stringify(['questions', 'papers'].map((t) => mock.records(t).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))));
    const before = snapshot();
    app.__zip = await app.eval('buildBankZip()');
    await app.eval('bank.clearAll()');
    check('清空后媒体库也清空', mock.files.size === 0 && mock.records('questions').length === 0);
    const merged = await app.eval('(async () => mergeBank(await readBankFile(new File([window.__zip], "bank.zip", { type: "application/zip" }))))()');
    check('导入后和导出前一致', snapshot() === before && merged.assets === 13);

    // 8. 删除试卷、超大记录
    mock.trashed = [];
    await app.eval(`bank.deletePaper(${JSON.stringify(paperId)})`);
    check('删除试卷连同文件', mock.records('questions').length === 0 && mock.files.size === 0 && mock.trashed.length === 13);
    let big = '';
    try { await app.eval('bank.putQuestion({ source_id: "huge", text: "x".repeat(600 * 1024) })'); } catch (e) { big = e.message; }
    check('超大记录拒绝保存', /太大/.test(big));
    check('没有超出 Wix 上限的调用', mock.limitErrors.length === 0);
  } catch (e) {
    failures.push(`运行失败：${e.message || e}`);
  }
  window.wixCheckReport = { failures, notes };
  console.log(failures.length ? `网站版检查失败：${failures.join('；')}` : '网站版检查全部通过', notes);
})();

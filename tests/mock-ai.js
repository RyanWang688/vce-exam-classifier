// 测试用：拦截 Gemini 请求，返回固定内容。不发出任何真实请求，也不读取 Key。
(() => {
  window.__calls = [];
  window.__realFetch = window.__realFetch || window.fetch;
  let n = 0;
  const reply = (obj) => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 3000, candidatesTokenCount: 800, thoughtsTokenCount: 400, totalTokenCount: 4200 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  window.fetch = async (u, o) => {
    if (!/generativelanguage/.test(String(u))) return window.__realFetch(u, o);
    const body = JSON.parse(o.body);
    const t = body.contents[0].parts.filter((p) => p.text).map((p) => p.text).join('\n');
    const imgs = body.contents[0].parts.filter((p) => p.inlineData).length;
    if (/Merge the teacher/.test(t)) { __calls.push('merge'); return reply({ sections: [{ title: '通用', rules: ['按 Study Design 出题', '概率题写明分布参数'] }], summary: '加入了概率题写明分布参数。' }); }
    if (/Teachers reviewed/.test(t)) { __calls.push('feedback'); return reply({ sections: [{ title: '通用', rules: ['按 Study Design 出题', '避免过于简单的计算'] }], summary: '根据“太简单”的意见加了一条。' }); }
    if (/You write new questions/.test(t)) {
      n += 1;
      const mc = /Write ONE multiple-choice/.test(t);
      const marks = Number(/worth (\d+) mark/.exec(t)[1]);
      __calls.push(`gen${mc ? 'MC' : marks}:img${imgs}`);
      // 要求带图时给一张三次函数图；“bad figure” 模式给一张画不出来的图，用来测本地检查。
      const figure = /"figure": REQUIRED/.test(t) ? (window.__badFigure
        ? { x_min: -3, x_max: 3, y_min: -5, y_max: 5, functions: [{ expr: 'x^^2' }] }
        : { x_min: -3, x_max: 3, y_min: -5, y_max: 5, functions: [{ expr: 'x^3 - 3*x', label: 'y = f(x)' }, { expr: '1/(x-1)', dashed: true }], points: [{ x: 1, y: -2, label: '(1, -2)' }, { x: -1, y: 2, label: '(-1, 2)' }], vertical: [1] })
        : null;
      if (figure) __calls.push('figure');
      if (mc) return reply({ figure, stem: `Let \\(X \\sim \\mathrm{Bi}(10, 0.${n % 9 + 1})\\). Find \\(\\Pr(X=0)\\) correct to two decimal places. (q${n})`, options: ['0.11', '0.35', '0.20', '0.05', '0.48'], parts: [], answers: [{ label: 'MC', value: 'B' }], solution: 'Use \\(\\Pr(X=0)=(1-p)^{10}\\).', marking: '1 mark', skill: 'binomial probability', difficulty: 'easy' });
      const parts = [];
      let left = marks;
      let i = 0;
      while (left > 0) { const m = Math.min(left, 2); parts.push({ label: String.fromCharCode(97 + i), text: `Find \\(f'(${i + 1})\\) for \\(f(x)=x^{${i + 2}}\\). (q${n})`, marks: m }); left -= m; i += 1; }
      return reply({ figure, stem: `Consider the function \\(f(x)=x^2\\). (q${n})`, options: [], parts, answers: parts.map((p, j) => ({ label: p.label, value: String(j + 2) })), solution: 'Differentiate.', marking: '1 mark each step', skill: 'differentiation', difficulty: 'medium' });
    }
    if (/Solve this VCE/.test(t)) {
      __calls.push('solve');
      if (/\nA\. /.test(t)) return reply({ answers: [{ label: 'MC', value: /q3\)/.test(t) ? 'C' : 'B' }] });
      const labels = [...t.matchAll(/\n([a-z])\. /g)].map((m) => m[1]);
      return reply({ answers: labels.map((l, j) => ({ label: l, value: j === 0 ? `${j + 2}` : `\\(${j + 2}\\)` })) });
    }
    if (/mathematically equivalent/.test(t)) {
      __calls.push('compare');
      const labels = [...t.matchAll(/^([A-Za-z]+): A =/gm)].map((m) => m[1]);
      return reply({ results: labels.map((l) => ({ label: l, same: l !== 'MC', note: '' })) });
    }
    __calls.push('unknown');
    return reply({});
  };
  window.aiKey = () => 'test-key-not-real';
  window.confirm = () => true;
})();

"""Write the ordered topic rules from rules.py into index.html between markers."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
from codes import CODES
from rules import RULES, STEM_LEADS, WEAK

SUBJ = {"MM": "Mathematical Methods", "SM": "Specialist Mathematics", "GM": "General Mathematics"}
table = {}
for code, areas in RULES.items():
    names = CODES[SUBJ[code]]
    table[SUBJ[code]] = {
        "areas": {area: [[names[t], pattern] for t, pattern in rows] for area, rows in areas.items()},
        "leads": [names[t] for t in STEM_LEADS.get(code, [])],
        "weak": [names[t] for t in WEAK.get(code, [])],
    }
lines = ["const TOPIC_RULES = {"]
for subject, data in table.items():
    lines.append(f"  {json.dumps(subject)}: {{")
    lines.append("    areas: {")
    for area, rows in data["areas"].items():
        lines.append(f"      {json.dumps(area)}: [")
        for topic, pattern in rows:
            quoted = "null" if pattern is None else "String.raw`" + pattern.replace("`", "\\`") + "`"
            lines.append(f"        [{json.dumps(topic)}, {quoted}],")
        lines.append("      ],")
    lines.append("    },")
    lines.append(f"    leads: {json.dumps(data['leads'])},")
    lines.append(f"    weak: {json.dumps(data['weak'])},")
    lines.append("  },")
lines.append("};")
block = "\n".join(lines)

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "index.html")
html = open(path, encoding="utf-8", newline="").read()
START = "// ---------- 判定规则开始（由训练脚本生成）----------\n"
END = "// ---------- 判定规则结束 ----------\n"
if START in html:
    a, b = html.index(START), html.index(END) + len(END)
    html = html[:a] + START + block + "\n" + END + html[b:]
else:
    anchor = "/* ---------- 非 AI 模式：关键词分类 ---------- */\n"
    assert html.count(anchor) == 1
    code = START + block + "\n" + END + r"""
// VCE 数学 Unit 3/4 用有序判定规则：从上往下，第一条命中的就是结果，最后一条是默认。
const compiledRules = new Map();

function ruleTopic(subject, area, text) {
  const set = TOPIC_RULES[subject].areas;
  const rows = set[area] || set[''];
  for (const [topic, pattern] of rows) {
    if (pattern === null) return topic;
    if (!compiledRules.has(pattern)) compiledRules.set(pattern, new RegExp(pattern));
    if (compiledRules.get(pattern).test(text)) return topic;
  }
  return null;
}

// 去掉选择题选项再判断，选项里的词会误导。必须和训练脚本的 tidy() 一致。
function ruleText(text) {
  return `\n${text.toLowerCase()}`.replace(/\n\s*A\s*\.[\s\S]*$/i, '').replace(/\s+/g, ' ').trim();
}

function classifyByRules(q, paper, taxonomy) {
  const rules = TOPIC_RULES[paper.subject];
  if (!rules || paper.unit !== 'Unit 3/4') return null;
  const area = (q.area || (paper.subject === 'General Mathematics' ? 'Data' : '')).slice(0, 4);
  const allowed = new Set(candidateTopics(taxonomy, paper, null));
  const area4 = area && rules.areas[area[0].toUpperCase() + area.slice(1, 4).toLowerCase()] ? area[0].toUpperCase() + area.slice(1, 4).toLowerCase() : '';
  const stemPlain = latexToPlain(q.text);
  const parts = q.sub_parts.filter((p) => (p.marks || 0) > 0);
  if (!parts.length) {
    const topic = ruleTopic(paper.subject, area4, ruleText([stemPlain, ...q.sub_parts.map((p) => latexToPlain(p.text))].join('\n')));
    return allowed.has(topic) ? { topic, topic_fit: 'clear', alternative_topics: [], reason: '按判定规则。' } : null;
  }
  const rows = rules.areas[area4] || rules.areas[''];
  const fallback = rows[rows.length - 1][0];
  const lead = ruleTopic(paper.subject, area4, ruleText(stemPlain));
  const votes = new Map();
  parts.forEach((part) => {
    let topic = ruleTopic(paper.subject, area4, ruleText(`${latexToPlain(part.text)}\n${latexToPlain(part.context || '')}`));
    if (topic === fallback || (rules.leads.includes(lead) && rules.weak.includes(topic))) topic = lead;
    part.topic = topic;
    votes.set(topic, (votes.get(topic) || 0) + part.marks);
  });
  const total = [...votes.values()].reduce((sum, value) => sum + value, 0);
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.every(([topic]) => allowed.has(topic))) return null;
  const others = ranked.slice(1).filter(([, marks]) => marks >= total / 3).slice(0, 2).map(([topic]) => topic);
  return {
    topic: ranked[0][0],
    topic_fit: others.length ? 'split' : 'clear',
    alternative_topics: others,
    reason: `按小问分值投票：${ranked.map(([topic, marks]) => `${topic} ${marks} 分`).join('、')}。`,
  };
}

"""
    html = html.replace(anchor, code + anchor)
    old = "function classifyByKeywords(q, paper, taxonomy) {\n  const candidates = candidateTopics(taxonomy, paper, q.area);"
    assert html.count(old) == 1
    html = html.replace(old, "function classifyByKeywords(q, paper, taxonomy) {\n  const ruled = classifyByRules(q, paper, taxonomy);\n  if (ruled) return ruled;\n  const candidates = candidateTopics(taxonomy, paper, q.area);")
open(path, "w", encoding="utf-8", newline="").write(html)
print("installed", len(block))

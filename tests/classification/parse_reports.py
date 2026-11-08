"""parse_reports.py <dir> <out.json>: per-question facility (share of marks earned) from VCAA examination reports."""
import glob, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
from docx_dump import blocks

HEAD = re.compile(r"^Question\s+(\d+)\s*([a-z])?", re.I)
out = {}
for path in sorted(glob.glob(os.path.join(sys.argv[1], "*.docx"))):
    name = os.path.basename(path)[:-5]
    exam = name[-1]
    has_mc = False
    questions = {}
    last_heading = None
    for kind, value in blocks(path):
        if kind == "p":
            m = HEAD.match(value)
            if m and len(value) < 40:
                last_heading = m.group(1)
            continue
        header = [c.lower() for c in value[0]]
        if any("correct answer" in c for c in header):
            has_mc = True
            letters = [c.replace("%", "").strip().upper() for c in value[0]]
            for row in value[1:]:
                if not row or not row[0].strip().isdigit() or len(row) < 3:
                    continue
                answer = row[1].strip().upper()
                if answer not in letters:
                    continue
                try:
                    pct = float(row[letters.index(answer)])
                except ValueError:
                    continue
                questions[("A", row[0].strip())] = [pct / 100, 1]
            continue
        if len(value) >= 2 and value[-1] and "average" in " ".join(value[0]).lower() and last_heading:
            marks = [c.strip() for c in value[0][1:-1]]
            try:
                top = max(int(m) for m in marks if m.isdigit())
                average = float(value[-1][-1])
            except ValueError:
                continue
            key = ("B", last_heading)
            got = questions.setdefault(key, [0.0, 0])
            got[0] += average
            got[1] += top
    table = {}
    for (section, number), (score, top) in questions.items():
        if section == "A":
            facility, marks = score, 1
        else:
            facility, marks = (score / top if top else None), top
        sec = section if has_mc and any(s == "B" for s, _ in questions) else ""
        table[f"{sec}{number}"] = {"f": round(facility, 3), "m": marks}
    out[name] = table
    mc = sum(1 for k in table if table[k]["m"] == 1)
    print(f"{name:9} n={len(table):3} marks={sum(v['m'] for v in table.values()):3} mc={mc}")
json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), separators=(",", ":"))

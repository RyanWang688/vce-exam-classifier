"""Ordered decision rules. First match wins; the last entry of each list has no pattern and is the default.
Written so that the same pattern strings work in Python re and JavaScript RegExp."""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")

RULES = {
    "MM": {"": [
        ("S", r"sample proportion|confidence interval|hat\{p\}|random sample|sample of \d+"),
        ("C", r"probability density|density function|continuous random|normal(ly)? (random|distrib)|standard normal|normal random"),
        ("P", r"probabilit|pr ?\(|binomial|\bbi ?\(|discrete random|\bfair\b|\bdie\b|\bcoin\b|independent events|selected at random|chosen (at )?random|at random"),
        ("A", r"algorithm|pseudocode|newton|for loop"),
        ("F", r"sketch|sequence of transformations|dilation|translation|asymptote|amplitude|\bperiod\b|best represents the graph"),
        ("D", r"maximis|minimis|minimum possible|largest possible|smooth"),
        ("I", r"∫|integral|anti-?deriv|area (bounded|between|of the|enclosed)|trapezium|average value|has the derivative|[fgh]'\(x\)=.*find [fgh]\(x\)|\)\s?d[xt]\b"),
        ("D", r"derivative|differentiat|\(dy\)/\(dx\)|\(d\)/\(dx\)|dy/dx|[fgh/]\^?['’”]\s*\(|gradient|tangent|stationary|turning point|inflection|maxim|minim|rate of change|differentiable"),
        ("F", r"the range\b|range of|domain\b|axial intercept|x ?-?intercept|(f|g)∘|∘ ?(f|g)"),
        ("A", r"simultaneous|system of|\bsolve\b|solutions?\b|values? of (k|a|m|n)\b|inverse|log _\d"),
        ("F", None),
    ]},
    "SM": {"": [
        ("L", r"contrapositive|converse|contradiction|counter-?example|negation|induction|\bprove\b|\bproof\b"),
        ("HT", r"p value|p-value|hypothes|\bnull\b|type i+ error|significance"),
        ("CI", r"confidence interval|minimum size of the sample"),
        ("LC", r"total (amount|mass|time|cost)|linear combination"),
        ("SM", r"sample mean|sampling distribution|overline\{x\}|random samples?\b|mean of (a|the) sample|probability density"),
        ("LC", r"normally distributed|independent|\bvar\(|variance|sim n ?\("),
        ("DE", r"differential equation|direction field|slope field|euler|logistic|\(d[a-z]\)/\(dt\)|h ?[×*] ?f ?\("),
        ("Z", r"complex|argand|\barg\b|\bcis\b|conjugate"),
        ("C", r"poured|inverted|\bcone\b|parametric|slope of the tangent|revolution|revolving|rotated about|arc length|length of the curve"),
        ("VC", r"position vector|equation of the path|path of the|\br ?\(t\)|r_[a-z0-9]+ ?\(t\)|acceleration vector|velocity vector|\)i\s*[-+].*\)j"),
        ("VE", r"\bplanes?\b|cartesian equation|vector equation|skew|parallel lines|two lines|lines? (given|defined)|\bpi _\d|shortest distance"),
        ("Z", r"\bre ?\(|\bim ?\(|z∈|(?<![-+\dy] )(?<![-+\dy])z ?=|\|z|imaginary|z_\d|z\^\d|∈ ?c\b"),
        ("K", r"particle|vertically|drone|\bobject\b|\btrain\b|velocity|acceleration|\bcar\b|(moves?|moving|travels?|travelling|along) (in |along )?a? ?straight|m s\^|projected|dropped|motorcycle"),
        ("V", r"vector|resolute|dot product|cross product|parallelogram"),
        ("C", r"∫|integral|substitution|by parts|implicit|\(dy\)/\(dx\)|i_n\b|tangent to the curve|the curve|volume"),
        ("F", None),
    ]},
    "GM": {
        "Data": [
            ("TS", r"seasonal|deseason|smooth|time series"),
            ("AS", r"correlation coefficient|coefficient of determination|pearson|causal|two-way"),
            ("LR", r"least squares|residual|linearis|transformation|interpolat|extrapolat|\bslope\b|y-intercept|regression"),
            ("AS", r"explanatory|response variable|\bassociation\b|correlation"),
            ("DD", None),
        ],
        "Recu": [
            ("AN", r"annuit|perpetuit"),
            ("DP", r"depreciat|unit cost|scrap|flat rate"),
            ("RB", r"\bloan|repay|amortis|borrow"),
            ("AD", r"extra (one-off )?(payment|amount)|\badds?\b|additional|regular deposit|further deposit|deposits?\b.*(each|every|after)"),
            ("CI", None),
        ],
        "Matr": [
            ("MA", r"permutation|dominance|identity matrix|communicat"),
            ("TM", r"transition|leslie|life.cycle|long term|state matrix|steady state|from one \w+ to the next|(this|next) (day|week|month|year|show)|t\^\d|s_0|s_n"),
            ("MA", None),
        ],
        "Netw": [
            ("MT", r"each allocated|allocation|assign|hungarian|bipartite|\btasks?\b|\bduties\b|project parts?"),
            ("CP", r"critical path|float|predecessor|earliest|latest start|precedence|activity|activities [a-z]\b|\d+ activities|project"),
            ("FL", r"maximum flow|minimum cut|capacity|\bcuts?\b|\bsink\b|\bflow\b|one-way"),
            ("TR", r"spanning tree|connect all|minimum length of cable|minimum cost to link"),
            ("ET", r"euler(ian)? (trail|circuit)|hamiltonian|\btrail\b|\bcircuit\b|exactly once|travel along all"),
            ("SP", r"shortest|minimum distance"),
            ("GN", None),
        ],
    },
}
# 大题题干已经定了范围时，小问里的弱信号（默认、运动学）跟随题干。
STEM_LEADS = {"SM": ["VC", "VE", "HT", "DE", "Z", "SM"]}
WEAK = {"SM": ["F", "K", "C", "V"]}


def tidy(text):
    """Must stay identical to ruleText() in index.html: drop multiple-choice options, flatten lines."""
    text = re.sub(r"\n\s*a\s*[.,]\s[\s\S]*$", "", "\n" + text.lower())
    return re.sub(r"\s+", " ", text).strip()


def pick(code, area, text):
    table = RULES[code]
    for topic, pattern in table.get(area, table.get("", [])):
        if pattern is None or re.search(pattern, text):
            return topic


def both(text, plain):
    return (tidy(text) + " " + tidy(plain or "")).strip()


def classify(code, q):
    """Single questions use the whole text; questions with scored parts vote by marks."""
    area = (q.get("area") or "")[:4]
    if code == "GM" and not area:
        area = "Data"
    parts = [r for r in q["parts"] if r["m"]]
    if not parts:
        return pick(code, area, " ".join([both(q["text"], q.get("plain"))] + [both(r["x"], r.get("p")) for r in q["parts"]]))
    stem = both(q["text"], q.get("plain"))
    default = RULES[code].get(area, RULES[code].get(""))[-1][0]
    lead = pick(code, area, stem)
    votes = {}
    for r in parts:
        topic = pick(code, area, both(r["x"], r.get("p")) + " " + tidy(r["c"] or ""))
        if topic == default or (lead in STEM_LEADS.get(code, []) and topic in WEAK.get(code, [])):
            topic = lead
        votes[topic] = votes.get(topic, 0) + r["m"]
    return max(votes.items(), key=lambda kv: kv[1])[0]


if __name__ == "__main__":
    from labels_dev import L
    from importlib import import_module
    d = sys.argv[1]
    module = import_module(sys.argv[2]).L if len(sys.argv) > 2 and sys.argv[2] != "-v" else L
    tot, errs = {}, []
    for name, spec in module.items():
        p = json.load(open(os.path.join(d, name + ".json"), encoding="utf-8"))
        labels = dict(i.split("=") for i in spec.split())
        code = name[-3:-1]
        for q in p["questions"]:
            key = f'{q["s"]}{q["n"]}'
            want = labels[key].split(",")
            got = classify(code, q)
            for k in ("ALL", code, code + (" one" if q["marks"] == 1 else " multi")):
                a = tot.setdefault(k, [0, 0, 0]); a[0] += 1; a[1] += got == want[0]; a[2] += got in want
            if got not in want:
                errs.append(f'{name} {key}[{q["marks"]}] got {got} want {labels[key]} | {q["text"][-90:]!r}')
    for k, (n, s, l) in sorted(tot.items()):
        print(f"{k:10} n={n:4} strict={s/n:6.1%} lenient={l/n:6.1%}")
    if "-v" in sys.argv:
        print("\n".join(errs))

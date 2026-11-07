"""score.py <dir> <labels module> [errors]: accuracy against hand labels."""
import importlib, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
from codes import BACK

d, module = sys.argv[1], sys.argv[2]
show = len(sys.argv) > 3
L = importlib.import_module(module).L
tot = {}


def add(key, strict, lenient):
    a = tot.setdefault(key, [0, 0, 0])
    a[0] += 1; a[1] += strict; a[2] += lenient


errors = []
for name, spec in L.items():
    p = json.load(open(os.path.join(d, name + ".json"), encoding="utf-8"))
    labels = dict(item.split("=") for item in spec.split())
    back = BACK[p["subject"]] if p["subject"] in BACK else {}
    seen = set()
    for x in p["questions"]:
        key = f'{x["s"]}{x["n"]}'
        if key not in labels:
            print("no label", name, key); continue
        seen.add(key)
        want = labels[key].split(",")
        got = back.get(x["topic"], "?" + x["topic"][:14])
        s, l = got == want[0], got in want
        subj = name[-3:-1]
        add("ALL", s, l); add(subj, s, l)
        add(subj + (" 1mark" if x["marks"] == 1 else " multi"), s, l)
        add("scan" if name[:4] == "2024" and "N" not in name else "text", s, l)
        if not l:
            errors.append(f'{name} {key}[{x["marks"]}] got {got} want {labels[key]} | {x["text"][:70]!r}')
    miss = set(labels) - seen
    if miss:
        print("missing", name, sorted(miss))
for k, (n, s, l) in sorted(tot.items()):
    print(f"{k:12} n={n:4} strict={s/n:6.1%} lenient={l/n:6.1%}")
if show:
    print("\n".join(errors))

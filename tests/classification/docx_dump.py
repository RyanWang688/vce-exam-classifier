"""docx_dump.py <file.docx>: print paragraphs and table rows in order (tables as | cells |)."""
import re, sys, zipfile
import xml.etree.ElementTree as ET
sys.stdout.reconfigure(encoding="utf-8")
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def text(el):
    out = []
    for node in el.iter():
        if node.tag == W + "t" and node.text:
            out.append(node.text)
        elif node.tag == W + "tab":
            out.append(" ")
    return re.sub(r"\s+", " ", "".join(out)).strip()


def blocks(path):
    root = ET.fromstring(zipfile.ZipFile(path).read("word/document.xml"))
    body = root.find(W + "body")
    for child in body:
        if child.tag == W + "p":
            t = text(child)
            if t:
                yield ("p", t)
        elif child.tag == W + "tbl":
            rows = []
            for tr in child.iter(W + "tr"):
                rows.append([text(tc) for tc in tr.findall(W + "tc")])
            yield ("t", rows)


if __name__ == "__main__":
    for kind, value in blocks(sys.argv[1]):
        if kind == "p":
            print(value[:110])
        else:
            for row in value:
                print("  | " + " | ".join(c[:30] for c in row))

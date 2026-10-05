#!/usr/bin/env python3
"""Сборка копий юридических документов в Word и PDF из docs/legal/*.md (тот же текст, что на сайте).
Запуск: python3 scripts/build-legal.py   (нужны python-markdown и LibreOffice Writer)."""
import html, os, re, shutil, subprocess, sys, tempfile
import markdown

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "legal")
DOCS = {
    "privacy.md": "T.Rodionova — Политика обработки ПДн",
    "offer.md": "T.Rodionova — Публичная оферта",
}
CSS = """
@page { size: A4; margin: 20mm 20mm 20mm 25mm; }
body { font-family: 'Liberation Serif', 'Times New Roman', serif; font-size: 11pt; line-height: 1.35; color: #000; }
h1 { font-size: 16pt; font-weight: bold; text-align: center; margin: 0 0 12pt; }
h2 { font-size: 12.5pt; font-weight: bold; margin: 16pt 0 6pt; page-break-after: avoid; }
h3 { font-size: 11.5pt; font-weight: bold; margin: 12pt 0 4pt; }
p { margin: 0 0 6pt; text-align: justify; }
ul, ol { margin: 0 0 6pt 18pt; }
li { margin: 0 0 3pt; text-align: justify; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0; }
td, th { border: 0.5pt solid #000; padding: 3pt 5pt; font-size: 10.5pt; vertical-align: top; }
"""

def build(src: str, title: str) -> None:
    text = open(os.path.join(ROOT, src), encoding="utf-8").read()
    body = markdown.markdown(text, extensions=["extra", "sane_lists"])
    page = f'<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>{html.escape(title)}</title><style>{CSS}</style></head><body>{body}</body></html>'
    with tempfile.TemporaryDirectory() as tmp:
        base = os.path.join(tmp, "doc")
        open(base + ".html", "w", encoding="utf-8").write(page)
        run = lambda *args: subprocess.run(["soffice", "--headless", "--norestore", *args, "--outdir", tmp], check=True, capture_output=True, timeout=300)
        run("--convert-to", "docx:MS Word 2007 XML", base + ".html")   # HTML → Word (Writer/Web → Writer)
        run("--convert-to", "pdf", base + ".docx")                      # Word → PDF с настоящей разбивкой на страницы
        for ext in ("docx", "pdf"):
            shutil.copyfile(f"{base}.{ext}", os.path.join(ROOT, f"{title}.{ext}"))
    pages = len(re.findall(rb"/Type\s*/Page[^s]", open(os.path.join(ROOT, f"{title}.pdf"), "rb").read()))
    print(f"{title}: Word и PDF пересобраны, страниц в PDF: {pages}")

if __name__ == "__main__":
    for src, title in DOCS.items():
        build(src, title)
    sys.exit(0)

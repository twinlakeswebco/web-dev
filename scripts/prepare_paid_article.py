#!/usr/bin/env python3
"""Render an author's private Markdown as a D1 seed file outside public content.

Usage: python3 scripts/prepare_paid_article.py /private/path/article.md /private/path/seed.sql
Never place the input, seed, or full HTML under the public repository root.
"""
from pathlib import Path
import re
import sys
from build_blog import ROOT, parse_front_matter, markdown_to_html

def prepare(source: Path, destination: Path) -> None:
    if source.resolve().is_relative_to(ROOT.resolve()) or destination.resolve().is_relative_to(ROOT.resolve()):
        raise ValueError('Private article and seed must remain outside the public repository.')
    meta, markdown = parse_front_matter(source.read_text(encoding='utf-8'))
    slug = meta['slug']
    if not re.fullmatch(r'[a-z0-9-]+', slug):
        raise ValueError('Invalid article slug.')
    rendered = markdown_to_html(markdown)
    rendered = re.sub(r'^<h1[^>]*>.*?</h1>\s*', '', rendered, count=1, flags=re.DOTALL)
    escape = lambda value: value.replace("'", "''")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(f"INSERT INTO articles(slug,html) VALUES('{escape(slug)}','{escape(rendered)}') ON CONFLICT(slug) DO UPDATE SET html=excluded.html;\n", encoding='utf-8')

if __name__ == '__main__':
    prepare(Path(sys.argv[1]), Path(sys.argv[2]))

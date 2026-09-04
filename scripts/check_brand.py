#!/usr/bin/env python3
"""Fail the build if retired Custom Web Architecture branding reaches the site.

Checks every published HTML file, the feed, the sitemap, the manifest, and the
blog Markdown sources for terms and URLs that the Twin Lakes Web Co. migration
retired, plus em dashes, which the brand guide does not allow.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {".git", "templates", "scripts", "node_modules"}
# Repository documentation names the retired brand and the old domain on purpose.
SKIP_FILES = {"TWIN-LAKES-WEB-CO-BRAND-GUIDE.md", "README.md", "REDIRECTS.md"}
# (matched against the repository-relative path, not just the file name)

RULES = [
    (re.compile(r"Custom Web Architecture"), "retired brand name"),
    (re.compile(r"\bCWA\b"), "retired brand abbreviation"),
    (re.compile(r"\bTLWC\b"), "TLWC is not used in public copy"),
    (re.compile(r"cwa-[a-z-]+\.(?:png|svg)"), "retired CWA logo asset"),
    (re.compile(r"https?://caseykeown\.com"), "old domain"),
    (re.compile(r'href="/(?:leads|about|work|services)\.html"'), "old flat-file link"),
    (re.compile(r"—"), "em dash"),
]

TARGET_SUFFIXES = {".html", ".md", ".xml", ".txt", ".webmanifest", ".css"}


def files() -> list[Path]:
    found = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        parts = path.relative_to(ROOT).parts
        relative = path.relative_to(ROOT).as_posix()
        if any(part in SKIP_DIRS for part in parts) or relative in SKIP_FILES:
            continue
        if path.suffix.lower() in TARGET_SUFFIXES:
            found.append(path)
    return sorted(found)


def main() -> int:
    problems: list[str] = []
    for path in files():
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for number, line in enumerate(text.splitlines(), start=1):
            for pattern, label in RULES:
                if pattern.search(line):
                    name = path.relative_to(ROOT)
                    problems.append(f"{name}:{number}: {label}: {line.strip()[:120]}")

    if problems:
        print("Brand check failed:")
        for problem in problems:
            print(f"  {problem}")
        return 1
    print(f"Brand check passed across {len(files())} files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Build the Twin Lakes Web Co. static blog from Markdown files in /blog.

Generated files:
- /blog/index.html
- /blog/articles/<slug>/index.html
- /blog/feed.xml
- /sitemap.xml
- the marked Latest Articles block in /index.html
"""

from __future__ import annotations

import html
import json
import re
import shutil
from datetime import date, datetime, timezone
from email.utils import format_datetime
from pathlib import Path
from urllib.parse import quote

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import brand  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
BLOG = ROOT / "blog"
ARTICLES = BLOG / "articles"
EXCLUDED_DIRS = {"articles", "assets"}
EXCLUDED_FILES = {"README.md"}
SITE_URL = brand.SITE_URL
SITE_NAME = brand.SITE_NAME
FACEBOOK_URL = brand.FACEBOOK_URL
BOOKING_URL = brand.BOOKING_URL
OG_IMAGE = brand.OG_IMAGE

STATIC_URLS = [
    ("/", None),
    ("/services/", None),
    ("/work/", None),
    ("/work/nalls-specialized-hauling/", None),
    ("/work/isr-with-daphne/", None),
    ("/work/ground-pros/", None),
    ("/about/", None),
    ("/contact/", None),
    ("/blog/", None),
]


def parse_front_matter(text: str) -> tuple[dict[str, str], str]:
    meta: dict[str, str] = {}
    normalized = text.replace("\r\n", "\n")
    if not normalized.startswith("---\n"):
        return meta, normalized
    closing = normalized.find("\n---\n", 4)
    if closing == -1:
        return meta, normalized
    for line in normalized[4:closing].splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        meta[key.strip().lower()] = value.strip().strip('"\'')
    return meta, normalized[closing + 5 :]


def slugify(value: str) -> str:
    value = value.lower().replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-") or "article"


def inline_markdown(value: str) -> str:
    escaped = html.escape(value, quote=False)

    # Images before links so the link pattern does not consume image syntax.
    escaped = re.sub(
        r"!\[([^]]*)\]\((https?://[^ )]+|/[^ )]+)\)",
        r'<img src="\2" alt="\1" loading="lazy" decoding="async">',
        escaped,
    )
    escaped = re.sub(
        r"\[([^]]+)\]\((https?://[^ )]+|/[^ )]+)\)",
        r'<a href="\2">\1</a>',
        escaped,
    )
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"__([^_]+)__", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", escaped)
    return escaped


def markdown_to_html(markdown: str) -> str:
    lines = markdown.replace("\r\n", "\n").split("\n")
    output: list[str] = []
    paragraph: list[str] = []
    list_type: str | None = None
    in_code = False
    code_language = ""
    code_lines: list[str] = []
    used_ids: dict[str, int] = {}

    def flush_paragraph() -> None:
        if paragraph:
            output.append(f"<p>{inline_markdown(' '.join(paragraph).strip())}</p>")
            paragraph.clear()

    def close_list() -> None:
        nonlocal list_type
        if list_type:
            output.append(f"</{list_type}>")
            list_type = None

    def unique_heading_id(text: str) -> str:
        base = slugify(re.sub(r"[`*_]", "", text))
        used_ids[base] = used_ids.get(base, 0) + 1
        return base if used_ids[base] == 1 else f"{base}-{used_ids[base]}"

    for raw in lines:
        line = raw.rstrip()

        fence = re.match(r"^```\s*([\w+-]*)", line)
        if fence:
            flush_paragraph()
            close_list()
            if in_code:
                language_class = f' class="language-{html.escape(code_language)}"' if code_language else ""
                output.append(f"<pre><code{language_class}>{html.escape(chr(10).join(code_lines))}</code></pre>")
                code_lines.clear()
                code_language = ""
                in_code = False
            else:
                code_language = fence.group(1)
                in_code = True
            continue

        if in_code:
            code_lines.append(raw)
            continue

        if not line.strip():
            flush_paragraph()
            close_list()
            continue

        if re.match(r"^\s*([-*_])(?:\s*\1){2,}\s*$", line):
            flush_paragraph()
            close_list()
            output.append("<hr>")
            continue

        heading = re.match(r"^(#{1,4})\s+(.+?)\s*#*$", line)
        if heading:
            flush_paragraph()
            close_list()
            level = len(heading.group(1))
            text = heading.group(2).strip()
            output.append(f'<h{level} id="{unique_heading_id(text)}">{inline_markdown(text)}</h{level}>')
            continue

        quote_match = re.match(r"^>\s?(.*)$", line)
        if quote_match:
            flush_paragraph()
            close_list()
            output.append(f"<blockquote><p>{inline_markdown(quote_match.group(1))}</p></blockquote>")
            continue

        unordered = re.match(r"^\s*[-*+]\s+(.+)$", line)
        ordered = re.match(r"^\s*\d+[.)]\s+(.+)$", line)
        if unordered or ordered:
            flush_paragraph()
            wanted = "ul" if unordered else "ol"
            if list_type != wanted:
                close_list()
                list_type = wanted
                output.append(f"<{wanted}>")
            match = unordered or ordered
            assert match is not None
            output.append(f"<li>{inline_markdown(match.group(1))}</li>")
            continue

        paragraph.append(line.strip())

    flush_paragraph()
    close_list()
    if in_code:
        language_class = f' class="language-{html.escape(code_language)}"' if code_language else ""
        output.append(f"<pre><code{language_class}>{html.escape(chr(10).join(code_lines))}</code></pre>")
    return "\n".join(output)


def parse_date(value: str) -> datetime:
    try:
        parsed = datetime.strptime(value[:10], "%Y-%m-%d")
    except (ValueError, TypeError):
        parsed = datetime.combine(date.today(), datetime.min.time())
    return parsed.replace(tzinfo=timezone.utc)


def nice_date(value: str) -> str:
    parsed = parse_date(value)
    return f"{parsed.strftime('%B')} {parsed.day}, {parsed.year}"


def short_date(value: str) -> str:
    parsed = parse_date(value)
    return f"{parsed.month}/{parsed.day}/{parsed.year}"


def organization_schema() -> dict[str, object]:
    return {
        "@type": "Organization",
        "@id": f"{SITE_URL}/#business",
        "name": SITE_NAME,
        "url": f"{SITE_URL}/",
        "logo": f"{SITE_URL}{brand.LOGO_MONOGRAM}",
        "image": OG_IMAGE,
        "email": "mailto:{brand.EMAIL}",
        "founder": {"@id": f"{SITE_URL}/#casey"},
        "areaServed": "Kentucky",
        "sameAs": [FACEBOOK_URL],
    }


def person_schema() -> dict[str, object]:
    return {
        "@type": "Person",
        "@id": f"{SITE_URL}/#casey",
        "name": "Casey Keown",
        "url": f"{SITE_URL}/about/",
        "image": f"{SITE_URL}/assets/headshot-640.webp",
        "jobTitle": "Web Developer",
        "worksFor": {"@id": f"{SITE_URL}/#business"},
    }


def header_html(active: str = "blog") -> str:
    return brand.header_html(active)


def footer_html() -> str:
    return brand.footer_html()


def head_html(
    *,
    title: str,
    description: str,
    canonical: str,
    page_type: str = "website",
    published: str | None = None,
) -> str:
    article_meta = f'\n  <meta property="article:published_time" content="{html.escape(published)}">' if published else ""
    return f'''<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)}</title>
  <meta name="description" content="{html.escape(description, quote=True)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="{html.escape(canonical, quote=True)}">
  <meta property="og:site_name" content="{SITE_NAME}">
  <meta property="og:title" content="{html.escape(title, quote=True)}">
  <meta property="og:description" content="{html.escape(description, quote=True)}">
  <meta property="og:type" content="{page_type}">
  <meta property="og:url" content="{html.escape(canonical, quote=True)}">
  <meta property="og:image" content="{OG_IMAGE}">
  <meta property="og:image:alt" content="{SITE_NAME}, website design and development in Grayson County, Kentucky">{article_meta}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{html.escape(title, quote=True)}">
  <meta name="twitter:description" content="{html.escape(description, quote=True)}">
  <meta name="twitter:image" content="{OG_IMAGE}">
  <meta name="theme-color" content="#F47A3C">
{brand.ICON_LINKS}
  <link rel="alternate" type="application/rss+xml" title="{SITE_NAME} Blog" href="/blog/feed.xml">
{brand.FONT_LINKS}
  <link rel="stylesheet" href="/css/normalize.css">
  <link rel="stylesheet" href="/css/styles.css">
</head>'''


def discover_sources() -> list[Path]:
    files: list[Path] = []
    for path in BLOG.rglob("*"):
        if not path.is_file():
            continue
        relative_parts = path.relative_to(BLOG).parts
        if any(part in EXCLUDED_DIRS for part in relative_parts) or path.name in EXCLUDED_FILES:
            continue
        if path.suffix.lower() in {".md", ".markdown", ".doc", ".docx"}:
            files.append(path)
    return sorted(files)


def update_homepage(posts: list[dict[str, str]]) -> None:
    path = ROOT / "index.html"
    homepage = path.read_text(encoding="utf-8")
    cards = []
    for post in posts[:3]:
        cards.append(f'''<div class="card">
  <h3><a href="{post['url']}">{html.escape(post['title'])}</a></h3>
  <p>{html.escape(post['description'])}</p>
</div>''')
    if not cards:
        cards.append('<div class="card"><h3><a href="/blog/">Read the blog</a></h3><p>Practical website and SEO guidance for small businesses.</p></div>')
    block = f'''<!-- BLOG_POSTS_START -->
<div class="card-grid" id="latest-posts">
{chr(10).join(cards)}
</div>
<!-- BLOG_POSTS_END -->'''
    pattern = r"<!-- BLOG_POSTS_START -->.*?<!-- BLOG_POSTS_END -->"
    updated, count = re.subn(pattern, block, homepage, count=1, flags=re.DOTALL)
    if count != 1:
        raise RuntimeError("Homepage blog markers were not found exactly once.")
    path.write_text(updated, encoding="utf-8")


def build_article_schema(post: dict[str, str]) -> dict[str, object]:
    canonical = f"{SITE_URL}{post['url']}"
    return {
        "@context": "https://schema.org",
        "@graph": [
            organization_schema(),
            person_schema(),
            {
                "@type": "BlogPosting",
                "@id": f"{canonical}#article",
                "mainEntityOfPage": {"@id": canonical},
                "headline": post["title"],
                "description": post["description"],
                "datePublished": post["date"],
                "dateModified": post.get("modified") or post["date"],
                "author": {"@id": f"{SITE_URL}/#casey"},
                "publisher": {"@id": f"{SITE_URL}/#business"},
                "image": [OG_IMAGE],
                "inLanguage": "en-US",
            },
            {
                "@type": "BreadcrumbList",
                "@id": f"{canonical}#breadcrumbs",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{SITE_URL}/"},
                    {"@type": "ListItem", "position": 2, "name": "Blog", "item": f"{SITE_URL}/blog/"},
                    {"@type": "ListItem", "position": 3, "name": post["title"], "item": canonical},
                ],
            },
        ],
    }


def build() -> None:
    BLOG.mkdir(parents=True, exist_ok=True)
    if ARTICLES.exists():
        shutil.rmtree(ARTICLES)
    ARTICLES.mkdir(parents=True, exist_ok=True)

    posts: list[dict[str, str]] = []
    downloads: list[dict[str, str]] = []

    for source in discover_sources():
        relative = source.relative_to(BLOG).as_posix()
        if source.suffix.lower() in {".doc", ".docx"}:
            downloads.append({
                "title": source.stem.replace("-", " ").title(),
                "url": "/blog/" + quote(relative),
                "type": source.suffix[1:].upper(),
            })
            continue

        meta, markdown = parse_front_matter(source.read_text(encoding="utf-8"))
        if meta.get("draft", "false").lower() in {"true", "yes", "1"}:
            continue

        first_heading = re.search(r"^#\s+(.+)$", markdown, re.MULTILINE)
        title = meta.get("title") or (first_heading.group(1).strip() if first_heading else source.stem.replace("-", " ").title())
        slug_source = meta.get("slug") or re.sub(r"^\d{4}-\d{2}-\d{2}-", "", source.stem)
        slug = slugify(slug_source)
        filename_date = re.match(r"^(\d{4}-\d{2}-\d{2})", source.name)
        published = meta.get("date") or (filename_date.group(1) if filename_date else date.today().isoformat())
        modified = meta.get("modified") or published
        description = meta.get("meta_description") or meta.get("description") or "Practical website and local SEO guidance from Twin Lakes Web Co."
        seo_title = meta.get("meta_title") or f"{title} | {SITE_NAME}"
        article_url = f"/blog/articles/{slug}/"
        canonical = f"{SITE_URL}{article_url}"
        body = markdown_to_html(markdown)
        body = re.sub(r'^<h1[^>]*>.*?</h1>\s*', "", body, count=1, flags=re.DOTALL)

        post = {
            "title": title,
            "seo_title": seo_title,
            "slug": slug,
            "date": published,
            "modified": modified,
            "description": description,
            "url": article_url,
        }
        posts.append(post)

        schema_json = json.dumps(build_article_schema(post), ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
        article_html = f'''<!doctype html>
<html lang="en">
{head_html(title=seo_title, description=description, canonical=canonical, page_type="article", published=published)}
<body class="article-page">
  <a class="skip-link" href="#main">Skip to content</a>
  {header_html("blog")}
  <main id="main">
    <section class="hero section-tight">
      <div class="wrap measure">
        <nav class="breadcrumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><a href="/blog/">Blog</a></li><li aria-current="page">{html.escape(title)}</li></ol></nav>
        <p class="eyebrow">Website guidance</p>
        <h1>{html.escape(title)}</h1>
        <p class="hero-lede">{html.escape(description)}</p>
        <p class="post-meta">Published {html.escape(nice_date(published))} · Casey Keown</p>
      </div>
    </section>
    <section class="section">
      <div class="wrap article-layout">
        <article class="article-body">{body}</article>
        <aside class="blog-sidebar" aria-label="About the author">
          <h2>Written by Casey</h2>
          <p>I build straightforward websites and practical web tools for small businesses and organizations.</p>
          <p><a class="btn btn-primary" href="/contact/">Request a Quote</a></p>
          <p><a href="/blog/">View all articles</a></p>
        </aside>
      </div>
    </section>
  </main>
  {footer_html()}
  <script type="application/ld+json">{schema_json}</script>
  <script src="/scripts/site.js" defer></script>
</body>
</html>
'''
        output_dir = ARTICLES / slug
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "index.html").write_text(article_html, encoding="utf-8")

    posts.sort(key=lambda item: parse_date(item["date"]), reverse=True)
    update_homepage(posts)

    list_items = []
    for post in posts:
        search_text = f"{post['title']} {post['description']}".lower()
        list_items.append(f'''<li data-search="{html.escape(search_text, quote=True)}">
  <p class="post-meta">{html.escape(nice_date(post['date']))}</p>
  <h2><a href="{post['url']}">{html.escape(post['title'])}</a></h2>
  <p>{html.escape(post['description'])}</p>
</li>''')
    for item in downloads:
        list_items.append(f'''<li data-search="{html.escape(item['title'].lower(), quote=True)}">
  <p class="post-meta">Downloadable {item['type']} document</p>
  <h2><a href="{item['url']}">{html.escape(item['title'])}</a></h2>
</li>''')
    if not list_items:
        list_items.append('<li><h2>Articles are coming soon.</h2><p>Check back for practical website and SEO guidance.</p></li>')

    index_title = f"Web Design and SEO Blog | {SITE_NAME}"
    index_description = "Practical guidance on websites, local SEO, performance, and small-business technology from Twin Lakes Web Co. in Grayson County, Kentucky."
    index_schema = {
        "@context": "https://schema.org",
        "@graph": [
            organization_schema(),
            person_schema(),
            {
                "@type": "Blog",
                "@id": f"{SITE_URL}/blog/#blog",
                "url": f"{SITE_URL}/blog/",
                "name": f"{SITE_NAME} Blog",
                "description": index_description,
                "publisher": {"@id": f"{SITE_URL}/#business"},
                "author": {"@id": f"{SITE_URL}/#casey"},
                "blogPost": [{"@id": f"{SITE_URL}{post['url']}#article"} for post in posts],
                "inLanguage": "en-US",
            },
        ],
    }
    index_schema_json = json.dumps(index_schema, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    index_html = f'''<!doctype html>
<html lang="en">
{head_html(title=index_title, description=index_description, canonical=f"{SITE_URL}/blog/")}
<body class="blog-page">
  <a class="skip-link" href="#main">Skip to content</a>
  {header_html("blog")}
  <main id="main">
    <section class="hero section-tight">
      <div class="wrap measure">
        <p class="eyebrow">From the blog</p>
        <h1>Website advice without the mystery tech talk.</h1>
        <p class="hero-lede">Practical answers about websites, local search, performance, and useful technology for small businesses in Kentucky.</p>
      </div>
    </section>
    <section class="section">
      <div class="wrap blog-shell">
        <div>
          <div class="blog-toolbar">
            <label class="sr-only" for="post-filter">Filter articles</label>
            <input id="post-filter" type="search" placeholder="Search articles…" autocomplete="off">
            <span class="post-meta"><span id="visible-post-count">{len(posts)}</span> article{'s' if len(posts) != 1 else ''}</span>
          </div>
          <ul class="blog-list" id="post-list">{chr(10).join(list_items)}</ul>
          <p id="no-post-results" hidden>No articles matched that search.</p>
        </div>
        <aside class="blog-sidebar">
          <h2>About this blog</h2>
          <p>I'm Casey Keown of Twin Lakes Web Co. I write about practical website decisions, local search fundamentals, accessibility, performance, and owning your online presence.</p>
          <p><a href="/blog/feed.xml">Subscribe with RSS</a></p>
          <p><a class="btn btn-primary" href="/contact/">Request a Quote</a></p>
        </aside>
      </div>
    </section>
  </main>
  {footer_html()}
  <script type="application/ld+json">{index_schema_json}</script>
  <script src="/scripts/site.js" defer></script>
  <script src="/scripts/blog.js" defer></script>
</body>
</html>
'''
    (BLOG / "index.html").write_text(index_html, encoding="utf-8")

    rss_items = []
    for post in posts[:20]:
        published_rfc = format_datetime(parse_date(post["date"]))
        rss_items.append(
            "<item>"
            f"<title>{html.escape(post['title'])}</title>"
            f"<link>{SITE_URL}{post['url']}</link>"
            f"<guid isPermaLink=\"true\">{SITE_URL}{post['url']}</guid>"
            f"<pubDate>{published_rfc}</pubDate>"
            f"<description>{html.escape(post['description'])}</description>"
            "</item>"
        )
    rss = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0"><channel>'
        f"<title>{SITE_NAME} Blog</title><link>{SITE_URL}/blog/</link>"
        f"<description>{html.escape(index_description)}</description>"
        '<language>en-us</language>'
        + "".join(rss_items)
        + "</channel></rss>\n"
    )
    (BLOG / "feed.xml").write_text(rss, encoding="utf-8")

    sitemap_entries = list(STATIC_URLS)
    sitemap_entries.extend((post["url"], post["modified"] or post["date"]) for post in posts)
    sitemap_lines = []
    for url, lastmod in sitemap_entries:
        lastmod_tag = f"<lastmod>{html.escape(lastmod)}</lastmod>" if lastmod else ""
        sitemap_lines.append(f"  <url><loc>{SITE_URL}{html.escape(url)}</loc>{lastmod_tag}</url>")
    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(sitemap_lines)
        + "\n</urlset>\n"
    )
    (ROOT / "sitemap.xml").write_text(sitemap, encoding="utf-8")
    print(f"Built {len(posts)} article(s) and {len(downloads)} document download(s).")


if __name__ == "__main__":
    build()

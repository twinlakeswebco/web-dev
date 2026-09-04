#!/usr/bin/env python3
"""Render the Twin Lakes Web Co. static pages from templates/base.html.

Every page in this repository outside of /blog is generated here so that the
header, footer, metadata, and icon links come from one place. Page bodies live
in templates/pages/*.html and page metadata lives in the PAGES list below.

Run:  python3 scripts/build_site.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import brand  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / "templates"
PAGES_DIR = TEMPLATES / "pages"


class Page:
    def __init__(
        self,
        source: str,
        output: str,
        url: str,
        title: str,
        description: str,
        nav_key: str = "",
        og_title: str | None = None,
        og_type: str = "website",
        schema: object | None = None,
        script: str | None = None,
        noindex: bool = False,
    ) -> None:
        self.source = source
        self.output = output
        self.url = url
        self.title = title
        self.description = description
        self.nav_key = nav_key
        self.og_title = og_title or title
        self.og_type = og_type
        self.schema = schema
        self.script = script
        self.noindex = noindex


def breadcrumb(items: list[tuple[str, str]]) -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": index + 1,
                "name": name,
                "item": f"{brand.SITE_URL}{path}",
            }
            for index, (name, path) in enumerate(items)
        ],
    }


def case_study_schema(name: str, path: str, description: str) -> list[dict]:
    return [
        {
            "@context": "https://schema.org",
            "@type": "CreativeWork",
            "name": f"{name} website",
            "description": description,
            "url": f"{brand.SITE_URL}{path}",
            "creator": {"@type": "Organization", "name": brand.SITE_NAME},
        },
        breadcrumb([("Home", "/"), ("Work", "/work/"), (name, path)]),
    ]


PAGES = [
    Page(
        source="home.html",
        output="index.html",
        url="/",
        title="Website Design in Grayson County, KY | Twin Lakes Web Co.",
        description=brand.DESCRIPTION,
        nav_key="home",
        og_title="Twin Lakes Web Co. | Websites built here. Built to work everywhere.",
        schema=[
            brand.organization_schema(),
            {
                "@context": "https://schema.org",
                "@type": "WebSite",
                "name": brand.SITE_NAME,
                "url": f"{brand.SITE_URL}/",
                "publisher": {"@type": "Organization", "name": brand.SITE_NAME},
            },
        ],
    ),
    Page(
        source="services.html",
        output="services/index.html",
        url="/services/",
        title="Services | Twin Lakes Web Co.",
        description=(
            "Website design, development, local SEO, hosting, and maintenance for businesses "
            "in Leitchfield, Grayson County, and across Central Kentucky."
        ),
        nav_key="services",
        schema=breadcrumb([("Home", "/"), ("Services", "/services/")]),
    ),
    Page(
        source="work.html",
        output="work/index.html",
        url="/work/",
        title="Work | Twin Lakes Web Co.",
        description=(
            "Websites and applications built by Twin Lakes Web Co. for Kentucky businesses, "
            "city government, nonprofits, and community organizations."
        ),
        nav_key="work",
        schema=breadcrumb([("Home", "/"), ("Work", "/work/")]),
    ),
    Page(
        source="about.html",
        output="about/index.html",
        url="/about/",
        title="About | Twin Lakes Web Co.",
        description=(
            "Casey Keown builds websites from Grayson County, Kentucky, for businesses and "
            "organizations around Rough River Lake, Nolin Lake, and Central Kentucky."
        ),
        nav_key="about",
        og_type="profile",
        schema=[
            {
                "@context": "https://schema.org",
                "@type": "AboutPage",
                "name": "About Twin Lakes Web Co.",
                "url": f"{brand.SITE_URL}/about/",
                "mainEntity": {
                    "@type": "Person",
                    "name": "Casey Keown",
                    "jobTitle": "Web designer and developer",
                    "worksFor": {"@type": "Organization", "name": brand.SITE_NAME},
                    "email": f"mailto:{brand.EMAIL}",
                    "image": f"{brand.SITE_URL}/assets/headshot-960.jpg",
                },
            },
            breadcrumb([("Home", "/"), ("About", "/about/")]),
        ],
    ),
    Page(
        source="contact.html",
        output="contact/index.html",
        url="/contact/",
        title="Contact | Twin Lakes Web Co.",
        description=(
            "Request a website quote from Twin Lakes Web Co. Serving Leitchfield, Clarkson, "
            "Caneyville, the Rough River Lake and Nolin Lake communities, and Central Kentucky."
        ),
        nav_key="contact",
        script="contact.script.html",
        schema=[
            {
                "@context": "https://schema.org",
                "@type": "ContactPage",
                "name": "Contact Twin Lakes Web Co.",
                "url": f"{brand.SITE_URL}/contact/",
                "mainEntity": brand.organization_schema(),
            },
            breadcrumb([("Home", "/"), ("Contact", "/contact/")]),
        ],
    ),
    Page(
        source="work/nalls-specialized-hauling.html",
        output="work/nalls-specialized-hauling/index.html",
        url="/work/nalls-specialized-hauling/",
        title="Nall's Specialized Hauling Case Study | Twin Lakes Web Co.",
        description=(
            "How a mobile-first website helped a Kentucky hauling and equipment transport "
            "business get found and get called."
        ),
        nav_key="work",
        og_type="article",
        schema=case_study_schema(
            "Nall's Specialized Hauling",
            "/work/nalls-specialized-hauling/",
            "A fast, mobile-first website for a hauling and equipment transport business.",
        ),
    ),
    Page(
        source="work/isr-with-daphne.html",
        output="work/isr-with-daphne/index.html",
        url="/work/isr-with-daphne/",
        title="ISR with Daphne Case Study | Twin Lakes Web Co.",
        description=(
            "A calm, clear website for an infant swim rescue instructor, written so parents "
            "understand the lessons before they call."
        ),
        nav_key="work",
        og_type="article",
        schema=case_study_schema(
            "ISR with Daphne",
            "/work/isr-with-daphne/",
            "A reassuring, parent-focused website for infant swim rescue instruction.",
        ),
    ),
    Page(
        source="work/ground-pros.html",
        output="work/ground-pros/index.html",
        url="/work/ground-pros/",
        title="Ground Pros LLC Case Study | Twin Lakes Web Co.",
        description=(
            "A clear services website for a Kentucky land and property company, built for "
            "fast answers and an easy path to a quote."
        ),
        nav_key="work",
        og_type="article",
        schema=case_study_schema(
            "Ground Pros LLC",
            "/work/ground-pros/",
            "A clean, mobile-friendly services website for a land and property company.",
        ),
    ),
    Page(
        source="not-found.html",
        output="404.html",
        url="/404.html",
        title="Page Not Found | Twin Lakes Web Co.",
        description="That page could not be found. Use the links here to get back on track.",
        noindex=True,
    ),
]


# Old flat-file URLs from the caseykeown.com site, mapped to the new directory
# structure. GitHub Pages cannot issue server-side 301s, so each old path keeps a
# small stub that carries a canonical link and an immediate client-side redirect.
REDIRECTS = {
    "about.html": "/about/",
    "services.html": "/services/",
    "work.html": "/work/",
    "leads.html": "/contact/",
    "projects.html": "/work/",
    "portfolio.html": "/work/",
    "contact.html": "/contact/",
}

REDIRECT_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Page moved | Twin Lakes Web Co.</title>
  <link rel="canonical" href="{site}{target}">
  <meta name="robots" content="noindex, follow">
  <meta http-equiv="refresh" content="0; url={target}">
  <script>window.location.replace("{target}" + window.location.search + window.location.hash);</script>
</head>
<body>
  <p>This page has moved to <a href="{target}">{site}{target}</a>.</p>
</body>
</html>
"""


def write_redirects() -> None:
    for source, target in REDIRECTS.items():
        destination = ROOT / source
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(
            REDIRECT_TEMPLATE.format(site=brand.SITE_URL, target=target), encoding="utf-8"
        )
        print(f"wrote redirect {source} -> {target}")


def render(page: Page) -> str:
    template = (TEMPLATES / "base.html").read_text(encoding="utf-8")
    content = (PAGES_DIR / page.source).read_text(encoding="utf-8").rstrip("\n")

    head_extra: list[str] = []
    if page.noindex:
        head_extra.append('  <meta name="robots" content="noindex, follow">')
    if page.url == "/blog/" or page.og_type == "article":
        pass
    head_extra.append('  <link rel="alternate" type="application/rss+xml" title="Twin Lakes Web Co. Blog" href="/blog/feed.xml">')
    if page.schema is not None:
        payload = page.schema if isinstance(page.schema, list) else [page.schema]
        for block in payload:
            head_extra.append(
                '  <script type="application/ld+json">'
                + json.dumps(block, separators=(",", ":"))
                + "</script>"
            )

    body_extra = ""
    if page.script:
        body_extra = (PAGES_DIR / page.script).read_text(encoding="utf-8").rstrip("\n")

    replacements = {
        "{{title}}": page.title,
        "{{description}}": page.description,
        "{{canonical}}": f"{brand.SITE_URL}{page.url}",
        "{{og_title}}": page.og_title,
        "{{og_type}}": page.og_type,
        "{{og_image}}": brand.OG_IMAGE,
        "{{icons}}": brand.ICON_LINKS,
        "{{fonts}}": brand.FONT_LINKS,
        "{{head_extra}}": "\n".join(head_extra),
        "{{header}}": brand.header_html(page.nav_key),
        "{{content}}": content,
        "{{footer}}": brand.footer_html(),
        "{{body_extra}}": body_extra,
    }
    output = template
    for key, value in replacements.items():
        output = output.replace(key, value)
    return output


def main() -> None:
    for page in PAGES:
        destination = ROOT / page.output
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(render(page), encoding="utf-8")
        print(f"wrote {page.output}")
    write_redirects()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Shared Twin Lakes Web Co. brand constants and page chrome.

Every generator in this repository (static pages, blog articles, blog index,
feeds, sitemaps) imports its site identity, navigation, header, and footer from
here so the brand stays consistent in one place.
"""

from __future__ import annotations

SITE_URL = "https://twinlakesweb.com"
SITE_NAME = "Twin Lakes Web Co."
LEGAL_NAME = "Twin Lakes Web Co. LLC"
SHORT_NAME = "Twin Lakes Web"
TAGLINE = "Websites built here. Built to work everywhere."
FOOTER_YEAR = "2026"

EMAIL = "me@caseykeown.com"
FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61590846744430"
BOOKING_URL = "https://calendar.app.google/ZXUK3d3zYTUcgLhw5"

LOGO_WORDMARK = "/assets/twin-lakes-wordmark.png"
LOGO_MONOGRAM = "/assets/twin-lakes-monogram.png"
OG_IMAGE = f"{SITE_URL}/assets/twin-lakes-social.jpg"

DESCRIPTION = (
    "Twin Lakes Web Co. designs fast, professional websites for businesses and "
    "organizations in Leitchfield, Grayson County, and communities across Central Kentucky."
)

# key, href, label
NAV_ITEMS = [
    ("home", "/", "Home"),
    ("services", "/services/", "Services"),
    ("work", "/work/", "Work"),
    ("about", "/about/", "About"),
    ("blog", "/blog/", "Blog"),
    ("contact", "/contact/", "Contact"),
]

SERVICE_AREA = [
    "Leitchfield",
    "Clarkson",
    "Caneyville",
    "Rough River Lake",
    "Nolin Lake",
    "Grayson County",
]

FONT_LINKS = """  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&amp;family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet">"""

ICON_LINKS = """  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/assets/favicon-32x32.png" sizes="32x32" type="image/png">
  <link rel="icon" href="/assets/favicon-96x96.png" sizes="96x96" type="image/png">
  <link rel="shortcut icon" href="/assets/favicon.ico">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="manifest" href="/assets/site.webmanifest">"""


def header_html(current: str = "") -> str:
    """Site header with the TWIN LAKES / WEB CO. wordmark and main navigation."""
    items = []
    for key, href, label in NAV_ITEMS:
        aria = ' aria-current="page"' if key == current else ""
        items.append(f'<li><a href="{href}"{aria}>{label}</a></li>')
    items.append('<li><a class="btn btn-primary" href="/contact/">Request a Quote</a></li>')
    links = "".join(items)
    return f'''<header class="site-header">
  <div class="wrap header-bar">
    <a class="brand-mark" href="/" aria-label="{SITE_NAME} home">
      <img class="brand-logo" src="{LOGO_WORDMARK}" alt="Twin Lakes Web Co." width="640" height="180" fetchpriority="high" decoding="async">
    </a>
    <nav class="main-nav" aria-label="Main navigation">
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="nav-links" data-nav-toggle>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        <span class="sr-only">Menu</span>
      </button>
      <ul class="nav-links" id="nav-links" data-open="false" data-nav-links>{links}</ul>
    </nav>
  </div>
</header>'''


def footer_html() -> str:
    """Site footer, including the required copyright line and contact link."""
    return f'''<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <h2>{SITE_NAME}</h2>
      <p>{TAGLINE}</p>
      <p>Website design and development in Grayson County, Kentucky, serving the communities around Rough River Lake and Nolin Lake.</p>
    </div>
    <div>
      <h2>Site</h2>
      <ul class="footer-links">
        <li><a href="/services/">Services</a></li>
        <li><a href="/work/">Work</a></li>
        <li><a href="/about/">About</a></li>
        <li><a href="/blog/">Blog</a></li>
        <li><a href="/contact/">Contact</a></li>
      </ul>
    </div>
    <div>
      <h2>Contact</h2>
      <ul class="footer-links">
        <li><a href="mailto:{EMAIL}">Contact</a></li>
        <li><a href="mailto:{EMAIL}">{EMAIL}</a></li>
        <li><a href="/contact/">Request a Quote</a></li>
        <li><a href="{BOOKING_URL}" target="_blank" rel="noopener">Book a Consultation</a></li>
        <li><a href="{FACEBOOK_URL}" target="_blank" rel="noopener">Facebook</a></li>
      </ul>
    </div>
    <div>
      <h2>Service area</h2>
      <p>Leitchfield, Clarkson, Caneyville, Rough River Lake, Nolin Lake, and Grayson County, plus businesses across Central Kentucky.</p>
    </div>
  </div>
  <div class="wrap footer-bottom">
    <span>&copy; {FOOTER_YEAR} {LEGAL_NAME}. All rights reserved.</span>
    <span><a href="mailto:{EMAIL}">Contact</a></span>
  </div>
</footer>'''


def organization_schema() -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "ProfessionalService",
        "name": SITE_NAME,
        "legalName": LEGAL_NAME,
        "url": f"{SITE_URL}/",
        "logo": f"{SITE_URL}{LOGO_MONOGRAM}",
        "image": OG_IMAGE,
        "email": f"mailto:{EMAIL}",
        "description": DESCRIPTION,
        "slogan": TAGLINE,
        "founder": {"@type": "Person", "name": "Casey Keown"},
        "address": {
            "@type": "PostalAddress",
            "addressLocality": "Leitchfield",
            "addressRegion": "KY",
            "addressCountry": "US",
        },
        "areaServed": [{"@type": "Place", "name": name} for name in SERVICE_AREA],
        "sameAs": [FACEBOOK_URL],
    }

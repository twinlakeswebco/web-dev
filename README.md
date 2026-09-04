# Twin Lakes Web Co. website

Source for [twinlakesweb.com](https://twinlakesweb.com), the website of Twin
Lakes Web Co. LLC, a web design and development company in Grayson County,
Kentucky. The site is plain static HTML and CSS with no runtime dependencies,
published by GitHub Pages from the `main` branch.

## Layout

```
/                      homepage
/about/                about Casey and the process
/services/             services and pricing questions
/work/                 portfolio index
/work/<project>/       case studies
/contact/              quote request form
/blog/                 blog index
/blog/articles/<slug>/ articles
/assets/               images, logos, icons
/css/                  styles
/scripts/              site JavaScript and the Python build scripts
/templates/            page templates and page content sources
```

Every page is generated. Do not hand-edit the HTML in the repository root or in
`about/`, `services/`, `work/`, `contact/`, or `blog/`; those files are
overwritten on the next build.

## Building

Requires Python 3.12 and, for the asset script only, Pillow.

```sh
python3 scripts/build_site.py   # static pages, case studies, 404, redirect stubs
python3 scripts/build_blog.py   # blog index, articles, feed.xml, sitemap.xml
python3 scripts/check_brand.py  # fails on retired branding, old URLs, em dashes
python3 scripts/build_assets.py # regenerates logos, favicons, and social image
```

`scripts/brand.py` holds the site identity, navigation, header, and footer. Both
generators import it, so a brand change lands in one file.

`.github/workflows/build-site.yml` runs the first three on every push to `main`
that touches `templates/`, `scripts/`, or the blog Markdown, then commits the
regenerated output.

## Editing content

- **Page copy** lives in `templates/pages/*.html` as body fragments. Page titles,
  meta descriptions, canonical URLs, and structured data live in the `PAGES` list
  in `scripts/build_site.py`.
- **Blog posts** are Markdown files in `/blog`. See `blog/README.md` for the front
  matter format. Pushing a Markdown file rebuilds the blog automatically.
- **Brand assets** are generated from the master files in `/assets`
  (`TWIN-LAKES-WORDMARK.png`, `TWIN-LAKES-MONOGRAM-1000.png`,
  `TWLC-binary-waves-2000.png`). Replace a master, then run
  `scripts/build_assets.py`.

## Brand rules

`TWIN-LAKES-WEB-CO-BRAND-GUIDE.md` is the source of truth for voice, palette,
typography, imagery, and approved calls to action. Two rules are enforced by
`scripts/check_brand.py` and will fail the build: no Custom Web Architecture or
CWA references, and no em dashes.

## Deployment

GitHub Pages serves the `main` branch from the repository root. `CNAME` points
the site at `twinlakesweb.com`. `.nojekyll` disables Jekyll processing.

Redirects from the old `caseykeown.com` URLs are documented in `REDIRECTS.md`.

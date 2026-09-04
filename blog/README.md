# Twin Lakes Web Co. blog publishing instructions

Add finished articles directly to this `/blog` folder.

## Recommended format

Use Markdown (`.md`) with a filename like:

`2026-07-21-how-much-a-small-business-website-costs.md`

Include this front matter at the top:

```yaml
---
title: "How Much Does a Small-Business Website Cost?"
meta_title: "Small-Business Website Cost Guide"
meta_description: "A plain-English breakdown of small-business website costs, common pricing models, and what Kentucky owners should expect."
target_keyword: "how much does a small business website cost"
intent: "informational/commercial"
queue_number: 1
date: 2026-07-21
slug: "small-business-website-cost"
---
```

Pushing a Markdown file automatically rebuilds:

- `/blog/` for the article list
- `/blog/articles/your-slug/` for the search-friendly article page
- `/blog/feed.xml` for the RSS feed
- `/sitemap.xml` for the XML sitemap

`.doc` and `.docx` files are included in the list as downloads, but cannot become normal web pages. For SEO, convert Word documents to Markdown before uploading. The daily article automation already creates Markdown.

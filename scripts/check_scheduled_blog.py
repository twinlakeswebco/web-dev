#!/usr/bin/env python3
"""Check release boundaries and metadata for the Kentucky buyer series."""
import os
import re
from datetime import timedelta
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

import build_blog


class ScheduledBlogTests(unittest.TestCase):
    def test_release_day_override(self):
        with patch.dict(os.environ, {"BLOG_BUILD_DATE": "2026-11-04"}):
            self.assertEqual(build_blog.publication_day(), date(2026, 11, 4))

    def test_series_dates_and_assets(self):
        posts = []
        for path in build_blog.BLOG.glob("*.md"):
            meta, body = build_blog.parse_front_matter(path.read_text())
            if not meta.get("queue_number", "").startswith("ky-buyers-"):
                continue
            posts.append(meta)
            self.assertLess(len(meta["meta_title"]), 60)
            self.assertLess(len(meta["meta_description"]), 155)
            self.assertEqual(meta["publish_on"], meta["date"])
            self.assertTrue((build_blog.ROOT / meta["social_image"].lstrip("/")).is_file())
            self.assertTrue(body.strip().endswith("[Request a quote](/contact/)."))
            self.assertNotIn("—", body)
            self.assertFalse(re.search(r"[\U0001f000-\U0001faff\u2600-\u27bf\ufe0f\u200d]", body))
        self.assertEqual(len(posts), 40)
        self.assertEqual(len({p["slug"] for p in posts}), 40)
        self.assertEqual(len({p["date"] for p in posts}), 40)
        dates = sorted(p["date"] for p in posts)
        self.assertEqual(dates[0], "2026-11-04")
        self.assertEqual(dates[-1], "2026-12-13")
        expected = [(date(2026, 11, 4) + timedelta(days=i)).isoformat() for i in range(40)]
        self.assertEqual(dates, expected)


if __name__ == "__main__":
    unittest.main()

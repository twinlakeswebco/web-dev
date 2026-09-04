# Project screenshots

The portfolio cards on `/work/` and the homepage currently use branded text
thumbnails in the approved palette. The brand guide prefers real screenshots of
completed client work, so replace them as the images become available.

## Adding a screenshot

1. Capture the client's homepage at 1440 pixels wide, then crop to a 16:10 or
   3:2 area that shows the real page. Do not use a device mockup frame, and do
   not stretch or fake the layout.
2. Save two files here, named for the project slug used in the URL:
   - `<slug>.webp` at 800 pixels wide, quality 82
   - `<slug>.jpg` at 800 pixels wide, quality 82, as the fallback
   Current slugs: `nalls-specialized-hauling`, `isr-with-daphne`, `ground-pros`,
   `caneyville`, `twin-lakes-skatepark`, `blush-brass-vintage`,
   `hannah-keown-homes`, `pure-can-cleaning`, `troopertranscribe`.
3. In `templates/pages/work.html` and `templates/pages/home.html`, replace the
   card's `<div class="project-thumb" aria-hidden="true">...</div>` with:

   ```html
   <picture>
     <source type="image/webp" srcset="/assets/work/<slug>.webp">
     <img class="project-thumb-img" src="/assets/work/<slug>.jpg"
          alt="Homepage of the <Client Name> website" width="800" height="500"
          loading="lazy" decoding="async">
   </picture>
   ```

4. Add this rule to `css/styles.css` the first time you use an image thumbnail:

   ```css
   .project-thumb-img { width: 100%; display: block; aspect-ratio: 8 / 5; object-fit: cover; object-position: top; }
   ```

5. Run `python3 scripts/build_site.py` and commit.

Alt text should describe what the screenshot shows, not repeat the client name
alone. Get the client's permission before publishing a screenshot of their site.

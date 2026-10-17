#!/usr/bin/env python3
"""Generate the Twin Lakes Web Co. web asset set from the master brand files.

Sources (checked into /assets):
- twin-lakes-primary.png/.svg          primary logo
- twin-lakes-stacked-wordmark.png/.svg stacked wordmark
- twin-lakes-tlwc-monogram.png/.svg    monogram
- twin-lakes-favicon.png/.svg          paired-line browser and app icon

Outputs the header wordmark, the monogram, the favicon and app icon set, and the
Open Graph image. Run after replacing any master file:

    python3 scripts/build_assets.py
"""

from __future__ import annotations

from pathlib import Path
from shutil import copyfile

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"

CREAM = (246, 241, 232, 255)


def trim(image: Image.Image, padding: int = 0) -> Image.Image:
    """Crop transparent or white margins away from a master file."""
    image = image.convert("RGBA")
    alpha = image.getchannel("A")
    box = alpha.getbbox()
    if box is None or alpha.getextrema() == (255, 255):
        # Fully opaque master: trim near-white margins instead.
        grayscale = image.convert("L").point(lambda value: 0 if value > 245 else 255)
        box = grayscale.getbbox()
    if box:
        image = image.crop(box)
    if padding:
        padded = Image.new("RGBA", (image.width + padding * 2, image.height + padding * 2), (0, 0, 0, 0))
        padded.paste(image, (padding, padding), image)
        image = padded
    return image


def drop_white_background(image: Image.Image, tolerance: int = 12) -> Image.Image:
    """Flood fill the outer white margin of an opaque master to transparency.

    Only the background connected to the image edges is removed, so white
    highlights inside the artwork are left alone.
    """
    image = image.convert("RGBA")
    for corner in ((0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1)):
        if image.getpixel(corner)[3] == 0:
            continue
        ImageDraw.floodfill(image, corner, (0, 0, 0, 0), thresh=tolerance)
    return image


def scaled(image: Image.Image, width: int | None = None, height: int | None = None) -> Image.Image:
    if width:
        height = round(image.height * width / image.width)
    elif height:
        width = round(image.width * height / image.height)
    else:
        raise ValueError("width or height is required")
    return image.resize((width, height), Image.LANCZOS)


def square(image: Image.Image, size: int, margin: float = 0.06, background=None) -> Image.Image:
    """Fit an image inside a square canvas, optionally over a solid background."""
    inner = round(size * (1 - margin * 2))
    fitted = image.copy()
    fitted.thumbnail((inner, inner), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), background or (0, 0, 0, 0))
    canvas.paste(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2), fitted)
    return canvas


def main() -> None:
    wordmark = trim(Image.open(ASSETS / "twin-lakes-primary.png"))
    monogram = trim(Image.open(ASSETS / "twin-lakes-tlwc-monogram.png"))
    brand_logo = wordmark

    # Header wordmark, served at 2x the largest rendered width.
    scaled(wordmark, width=640).save(ASSETS / "twin-lakes-header.png", optimize=True)
    scaled(wordmark, width=640).save(ASSETS / "twin-lakes-header.webp", quality=88, method=6)

    # Monogram for schema.org, small marks, and icon generation.
    square(monogram, 512).save(ASSETS / "twin-lakes-monogram.png", optimize=True)

    # Primary logo in web-friendly raster formats for legacy consumers.
    logo_web = scaled(brand_logo, width=1000)
    logo_web.convert("RGBA").quantize(colors=192, method=Image.FASTOCTREE).save(
        ASSETS / "twin-lakes-logo.png", optimize=True
    )
    logo_web.save(ASSETS / "twin-lakes-logo.webp", quality=82, method=6)

    # Dedicated paired-line favicon masters preserve legibility at browser sizes.
    # Keep the monogram for larger brand applications, not tiny browser tabs.
    copyfile(ASSETS / "twin-lakes-favicon.svg", ASSETS / "favicon.svg")
    icon = Image.open(ASSETS / "twin-lakes-favicon.png").convert("RGBA")
    for size in (16, 32, 96):
        icon.resize((size, size), Image.LANCZOS).save(
            ASSETS / f"favicon-{size}x{size}.png", optimize=True
        )
    # App launchers use a full cream background, including the rounded corners.
    app_icon = Image.new("RGBA", icon.size, CREAM)
    app_icon.alpha_composite(icon)
    for size, filename in (
        (180, "apple-touch-icon.png"),
        (192, "web-app-manifest-192x192.png"),
        (512, "web-app-manifest-512x512.png"),
    ):
        app_icon.resize((size, size), Image.LANCZOS).convert("RGB").save(
            ASSETS / filename, optimize=True
        )
    icon.resize((256, 256), Image.LANCZOS).save(
        ASSETS / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (256, 256)]
    )

    # Homepage hero photograph, resized and offered as WebP with a JPEG fallback.
    hero_source = ASSETS / "casey-keown-hero-photo.webp"
    if hero_source.exists():
        hero = Image.open(hero_source).convert("RGB")
        for width in (640, 1024):
            variant = scaled(hero, width=width).convert("RGB")
            variant.save(ASSETS / f"casey-keown-hero-{width}.webp", quality=82, method=6)
            variant.save(ASSETS / f"casey-keown-hero-{width}.jpg", quality=82, optimize=True, progressive=True)

    # Open Graph and Twitter card image on the warm cream background.
    social = Image.new("RGBA", (1200, 630), CREAM)
    art = brand_logo.copy()
    art.thumbnail((1080, 570), Image.LANCZOS)
    social.paste(art, ((1200 - art.width) // 2, (630 - art.height) // 2), art)
    social.convert("RGB").save(ASSETS / "twin-lakes-social.jpg", quality=84, optimize=True, progressive=True)

    print("Brand assets rebuilt.")


if __name__ == "__main__":
    main()

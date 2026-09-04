#!/usr/bin/env python3
"""Generate the Twin Lakes Web Co. web asset set from the master brand files.

Sources (checked into /assets):
- TWIN-LAKES-WORDMARK.png      stacked TWIN LAKES / WEB CO. wordmark, transparent
- TWIN-LAKES-MONOGRAM-1000.png TL monogram with the two waterlines, transparent
- TWLC-binary-waves-2000.png   illustrated brand logo used for social sharing

Outputs the header wordmark, the monogram, the favicon and app icon set, and the
Open Graph image. Run after replacing any master file:

    python3 scripts/build_assets.py
"""

from __future__ import annotations

from pathlib import Path

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
    wordmark = trim(Image.open(ASSETS / "TWIN-LAKES-WORDMARK.png"))
    monogram = trim(Image.open(ASSETS / "TWIN-LAKES-MONOGRAM-1000.png"))
    brand_logo = trim(drop_white_background(Image.open(ASSETS / "TWLC-binary-waves-2000.png")))

    # Header wordmark, served at 2x the largest rendered width.
    scaled(wordmark, width=640).save(ASSETS / "twin-lakes-wordmark.png", optimize=True)
    scaled(wordmark, width=640).save(ASSETS / "twin-lakes-wordmark.webp", quality=88, method=6)

    # Monogram for schema.org, small marks, and icon generation.
    square(monogram, 512).save(ASSETS / "twin-lakes-monogram.png", optimize=True)

    # Illustrated brand logo, reduced from the 2000px master for web use.
    logo_web = scaled(brand_logo, width=1000)
    logo_web.convert("RGBA").quantize(colors=192, method=Image.FASTOCTREE).save(
        ASSETS / "twin-lakes-logo.png", optimize=True
    )
    logo_web.save(ASSETS / "twin-lakes-logo.webp", quality=82, method=6)

    # Favicons and application icons, all from the TL monogram.
    for size in (16, 32, 96):
        square(monogram, size, margin=0.02).save(ASSETS / f"favicon-{size}x{size}.png", optimize=True)
    square(monogram, 180, margin=0.10, background=CREAM).convert("RGB").save(
        ASSETS / "apple-touch-icon.png", optimize=True
    )
    for size in (192, 512):
        square(monogram, size, margin=0.14, background=CREAM).convert("RGB").save(
            ASSETS / f"web-app-manifest-{size}x{size}.png", optimize=True
        )
    square(monogram, 256, margin=0.02).save(
        ASSETS / "favicon.ico",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )

    # Homepage hero photograph, resized and offered as WebP with a JPEG fallback.
    hero = Image.open(ASSETS / "casey-keown-hero-photo.webp").convert("RGB")
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

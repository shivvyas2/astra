#!/usr/bin/env python3
"""Generates the Sanchara app icon.

The mark echoes the planet-sun hero on the website: a warm disc with a soft
corona on the near-black ground, using the same tokens as app/globals.css.
Rendered at 4x and downsampled so the edges stay clean at small sizes.

    make-icon.py                     the primary icon (ember disc), AppIcon
    make-icon.py alternates          every alternate icon Plus offers
    make-icon.py lime                one icon by name

The alternates are the same mark in the other theme colours. Their names must
match ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES in project.yml and
`AppIconChoice` in the app.
"""
import sys
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path

BG = (0x0A, 0x0A, 0x0B)
FG = (0xF4, 0xF1, 0xEA)

# Name -> (asset set, disc colour). "ember" is the primary icon.
VARIANTS = {
    "ember": ("AppIcon", (0xE8, 0x66, 0x3D)),
    "lime": ("AppIcon-Lime", (0xDF, 0xEE, 0x6B)),
    "violet": ("AppIcon-Violet", (0x7C, 0x6C, 0xFF)),
    "bone": ("AppIcon-Bone", (0xF4, 0xF1, 0xEA)),
}

def render(ACCENT):
    S = 4096          # supersampled canvas
    OUT = 1024
    CX, CY = S // 2, int(S * 0.46)
    R = int(S * 0.20)

    img = Image.new("RGB", (S, S), BG)

    # Corona: concentric translucent rings, blurred into a soft glow.
    glow = Image.new("L", (S, S), 0)
    gd = ImageDraw.Draw(glow)
    steps = 60
    for i in range(steps, 0, -1):
        rr = R + int(R * 1.5 * (i / steps))
        gd.ellipse([CX - rr, CY - rr, CX + rr, CY + rr], fill=int(90 * (1 - i / steps) ** 2))
    glow = glow.filter(ImageFilter.GaussianBlur(S // 40))
    img = Image.composite(Image.new("RGB", (S, S), ACCENT), img, glow)

    # The disc itself, with a warm vertical falloff so it reads as lit.
    disc = Image.new("L", (S, S), 0)
    ImageDraw.Draw(disc).ellipse([CX - R, CY - R, CX + R, CY + R], fill=255)
    grad = Image.new("RGB", (S, S), ACCENT)
    gp = grad.load()
    for y in range(CY - R, CY + R + 1):
        t = (y - (CY - R)) / (2 * R)
        row = (
            int(ACCENT[0] * (1 - 0.25 * t) + FG[0] * 0.18 * (1 - t)),
            int(ACCENT[1] * (1 - 0.25 * t) + FG[1] * 0.10 * (1 - t)),
            int(ACCENT[2] * (1 - 0.25 * t) + FG[2] * 0.06 * (1 - t)),
        )
        for x in range(CX - R, CX + R + 1):
            gp[x, y] = row
    img = Image.composite(grad, img, disc.filter(ImageFilter.GaussianBlur(2)))

    # A thin bright limb along the upper edge, the way the hero photo catches light.
    # Masked by a vertical falloff so it fades toward the equator instead of
    # stopping at a hard edge.
    limb = Image.new("L", (S, S), 0)
    ImageDraw.Draw(limb).ellipse(
        [CX - R, CY - R, CX + R, CY + R], outline=255, width=int(R * 0.030)
    )
    falloff = Image.new("L", (S, S), 0)
    fp = falloff.load()
    top, bottom = CY - R, CY + int(R * 0.35)
    for y in range(top, bottom):
        t = (y - top) / (bottom - top)
        v = int(255 * max(0.0, 1.0 - t) ** 1.6)
        for x in range(CX - R - 8, CX + R + 8):
            fp[x, y] = v
    limb = Image.composite(limb, Image.new("L", (S, S), 0), falloff)
    img = Image.composite(
        Image.new("RGB", (S, S), FG), img, limb.filter(ImageFilter.GaussianBlur(S // 500))
    )

    return img.resize((OUT, OUT), Image.LANCZOS)

CONTENTS = """{
  "images" : [
    {
      "filename" : "AppIcon.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
"""

ASSETS = Path(__file__).resolve().parents[1] / "Sanchara/Resources/Assets.xcassets"
if len(sys.argv) > 1:
    names = [n for n in VARIANTS if n != "ember"] if sys.argv[1] == "alternates" else [sys.argv[1]]
else:
    names = ["ember"]
for name in names:
    folder, colour = VARIANTS[name]
    out = ASSETS / f"{folder}.appiconset" / "AppIcon.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    render(colour).save(out, "PNG")
    if folder != "AppIcon":
        (out.parent / "Contents.json").write_text(CONTENTS)
    print(f"wrote {out}")

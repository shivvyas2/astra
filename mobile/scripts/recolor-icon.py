#!/usr/bin/env python3
"""Draws the alternate app icons and the in-app logo from the primary icon.

The primary icon (AppIcon.appiconset/AppIcon.png) is the lime AST/RYA
wordmark on near-black. This lifts the wordmark out as a coverage mask, so
anti-aliased edges survive, and writes:

  AppIcon-Ember / -Violet / -Bone   the wordmark in each theme colour
  Logo.imageset                     the wordmark alone, white on clear, used
                                    as a template image (tinted in SwiftUI)
  LaunchLogo.imageset               the wordmark in lime for the launch screen

Run from mobile/:  python3 scripts/recolor-icon.py
Names must match ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES in project.yml.
"""
import json
import os
from PIL import Image

ASSETS = "Sanchara/Resources/Assets.xcassets"
BG = (10, 10, 11)
VARIANTS = {
    "AppIcon-Ember": (0xFF, 0x6B, 0x3D),
    "AppIcon-Violet": (0x7C, 0x6C, 0xFF),
    "AppIcon-Bone": (0xF4, 0xF1, 0xEA),
}

ICON_JSON = {
    "images": [{"filename": "AppIcon.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"}],
    "info": {"author": "xcode", "version": 1},
}
LOGO_JSON = {
    "images": [{"filename": "Logo.png", "idiom": "universal"}],
    "info": {"author": "xcode", "version": 1},
    "properties": {"preserves-vector-representation": False, "template-rendering-intent": "template"},
}


def coverage(icon):
    """0 on the ground, 255 inside a letter, measured on the green channel,
    where lime and the ground are furthest apart."""
    g = icon.getchannel("G")
    lo, hi = 10, 238
    return g.point(lambda v: max(0, min(255, round((v - lo) * 255 / (hi - lo)))))


def main():
    icon = Image.open(f"{ASSETS}/AppIcon.appiconset/AppIcon.png").convert("RGB")
    mask = coverage(icon)

    for name, color in VARIANTS.items():
        out = Image.composite(Image.new("RGB", icon.size, color), Image.new("RGB", icon.size, BG), mask)
        folder = f"{ASSETS}/{name}.appiconset"
        os.makedirs(folder, exist_ok=True)
        out.save(f"{folder}/AppIcon.png")
        json.dump(ICON_JSON, open(f"{folder}/Contents.json", "w"), indent=2)

    # The logo: the wordmark's bounding box with a little air, white on clear.
    box = mask.point(lambda v: 255 if v > 24 else 0).getbbox()
    pad = 8
    box = (box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad)
    logo = Image.new("RGBA", icon.size, (255, 255, 255, 0))
    logo.putalpha(mask)
    logo = logo.crop(box)
    folder = f"{ASSETS}/Logo.imageset"
    os.makedirs(folder, exist_ok=True)
    logo.save(f"{folder}/Logo.png")
    json.dump(LOGO_JSON, open(f"{folder}/Contents.json", "w"), indent=2)
    print("logo", logo.size)

    # The launch screen's logo: the same wordmark in lime, 132 pt wide at @3x,
    # centred by iOS exactly where LoadingScreen draws it.
    lime = Image.new("RGBA", logo.size, (0xDF, 0xEE, 0x6B, 255))
    lime.putalpha(logo.getchannel("A"))
    width = 132 * 3
    lime = lime.resize((width, round(logo.height * width / logo.width)), Image.LANCZOS)
    folder = f"{ASSETS}/LaunchLogo.imageset"
    os.makedirs(folder, exist_ok=True)
    lime.save(f"{folder}/LaunchLogo.png")
    json.dump({"images": [{"filename": "LaunchLogo.png", "idiom": "universal", "scale": "3x"}],
               "info": {"author": "xcode", "version": 1}}, open(f"{folder}/Contents.json", "w"), indent=2)


if __name__ == "__main__":
    main()
